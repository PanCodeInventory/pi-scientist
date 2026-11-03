import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { registerHerdrWatch } from '../dist/core/herdr-watch.js';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-watch-'));
  const owner = { sessionId: 'owner-session', workspaceId: 'w1', paneId: 'w1:p1' };
  const ownerFile = path.join(root, 'owner.jsonl');
  const runDir = path.join(root, 'Analysis/spatial/.sci/runs/worker');
  fs.mkdirSync(runDir, { recursive: true });
  const worker = { name: 'worker', workspaceId: 'w1', paneId: 'w1:p2', sessionId: 'worker-session', sessionFile: path.join(runDir, 'session.jsonl') };
  fs.writeFileSync(ownerFile, JSON.stringify({ type: 'session', id: owner.sessionId, cwd: root }) + '\n');
  fs.writeFileSync(worker.sessionFile, JSON.stringify({ type: 'session', id: worker.sessionId, cwd: root }) + '\n');
  const dispatcher = { agent: 'pi', pane_id: owner.paneId, workspace_id: owner.workspaceId, agent_session: { agent: 'pi', kind: 'path', value: ownerFile } };
  const agent = { name: worker.name, pane_id: worker.paneId, workspace_id: worker.workspaceId, agent_status: 'working', agent_session: { agent: 'pi', kind: 'path', value: worker.sessionFile } };
  const binding = { version: 1, owner, worker, runDir };
  const bindingFile = path.join(root, '.sci/herdr-watch', owner.sessionId, `${worker.name}.json`);
  const bind = (value = binding, file = bindingFile) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  let agents = [dispatcher, agent], output, calls = 0, runner;
  const watches = [];
  function watch(identity = owner, cwd = root) {
    const prior = Object.fromEntries(['HERDR_ENV', 'HERDR_WORKSPACE_ID', 'HERDR_PANE_ID'].map(k => [k, process.env[k]]));
    Object.assign(process.env, { HERDR_ENV: '1', HERDR_WORKSPACE_ID: identity.workspaceId ?? '', HERDR_PANE_ID: identity.paneId ?? '' });
    const hooks = new Map(), messages = [];
    const instance = registerHerdrWatch({ on: (name, fn) => hooks.set(name, fn), sendMessage: (msg, options) => messages.push({ ...msg, options }) }, {
      intervalMs: 60000,
      run: async () => { calls++; return runner ? await runner() : output ?? JSON.stringify({ result: { agents } }); },
    });
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    watches.push(instance);
    return { ...instance, hooks, messages, start: () => hooks.get('session_start')({}, { cwd, sessionManager: { getSessionId: () => identity.sessionId } }) };
  }
  return { root, owner, ownerFile, dispatcher, agent, worker, binding, bindingFile, runDir, bind, watch,
    set agents(value) { agents = value; }, set output(value) { output = value; }, set runner(value) { runner = value; }, get calls() { return calls; },
    close() { for (const w of watches) w.stop(); fs.rmSync(root, { recursive: true, force: true }); },
  };
}

test('owned transitions use bound run directory, ignore CLI errors, deduplicate idle and suppress release', async () => {
  const f = fixture(); const w = f.watch();
  try {
    f.bind();
    await w.poll(); assert.equal(f.calls, 0, 'factory must not start polling before session_start');
    await w.start(); await w.poll();
    for (const bad of ['garbage', '{"error":{"code":"unavailable"}}', '{"result":{}}']) {
      f.output = bad; await w.poll(); assert.equal(w.messages.length, 0);
    }
    f.output = undefined;
    f.agent.agent_status = 'idle'; await w.poll();
    assert.equal(w.messages.length, 1);
    assert.match(w.messages[0].content, /observedAt=\d{4}-.*workspace=w1 dispatcher=w1:p1 session=owner-session:.*worker: idle.*result.md 未出现/s);
    assert.deepEqual(w.messages[0].options, { triggerTurn: true, deliverAs: 'followUp' });
    f.agent.agent_status = 'working'; await w.poll(); f.agent.agent_status = 'done'; await w.poll();
    assert.equal(w.messages.length, 1, 'same missing result deduplicated');
    fs.writeFileSync(path.join(f.runDir, 'result.md'), 'Completed with evidence');
    f.agent.agent_status = 'working'; await w.poll(); f.agent.agent_status = 'idle'; await w.poll();
    assert.equal(w.messages.length, 2); assert.match(w.messages[1].content, /mtime=/);
    assert.ok(w.messages[1].content.includes(`run=${f.runDir}`), 'nested analysis run is not inferred from dispatcher cwd');
    f.agent.agent_status = 'blocked'; await w.poll();
    assert.equal(w.messages.length, 3); assert.match(w.messages[2].content, /等待人工确认/);
    f.agents = [f.dispatcher]; await w.poll();
    assert.equal(w.messages.length, 4); assert.match(w.messages[3].content, /已消失/);
    f.agents = [f.dispatcher, f.agent]; await w.poll();
    fs.writeFileSync(path.join(f.runDir, 'released'), '');
    f.agents = [f.dispatcher]; await w.poll(); assert.equal(w.messages.length, 4);
  } finally { f.close(); }
});

test('global snapshots cannot wake other projects, workspaces, same-project panes or replacement sessions', async () => {
  const f = fixture(); f.bind();
  const owned = f.watch();
  const others = [
    f.watch({ sessionId: 'other-project', workspaceId: 'w2', paneId: 'w2:p1' }, path.join(f.root, 'other-project')),
    f.watch({ ...f.owner, workspaceId: 'w2', paneId: 'w2:p1' }),
    f.watch({ ...f.owner, paneId: 'w1:p9' }),
    f.watch({ ...f.owner, sessionId: 'new-session' }),
    f.watch({ sessionId: f.worker.sessionId, workspaceId: 'w1', paneId: f.worker.paneId }),
  ];
  try {
    for (const w of [owned, ...others]) { await w.start(); await w.poll(); }
    f.agent.agent_status = 'blocked';
    for (const w of [owned, ...others]) await w.poll();
    f.agent.agent_status = 'idle';
    for (const w of [owned, ...others]) await w.poll();
    f.agents = [f.dispatcher];
    for (const w of [owned, ...others]) await w.poll();
    assert.equal(owned.messages.length, 3);
    for (const w of others) assert.deepEqual(w.messages, []);
  } finally { f.close(); }
});

test('foreign agents with the same name cannot overwrite an owned worker status', async () => {
  const f = fixture(); f.bind(); const w = f.watch();
  const foreign = { ...f.agent, pane_id: 'w2:p2', workspace_id: 'w2' };
  try {
    f.agents = [f.dispatcher, f.agent, foreign];
    await w.start(); await w.poll();
    foreign.agent_status = 'blocked'; await w.poll();
    foreign.agent_status = 'idle'; await w.poll();
    f.agents = [f.dispatcher, f.agent]; await w.poll();
    assert.equal(w.messages.length, 0);
    f.agent.agent_status = 'idle'; await w.poll();
    assert.equal(w.messages.length, 1);
    assert.match(w.messages[0].content, /pane=w1:p2/);
  } finally { f.close(); }
});

test('reusing a previously observed worker identity reports only the original departure, not the replacement states', async () => {
  const f = fixture(); f.bind(); const w = f.watch();
  try {
    await w.start(); await w.poll();
    fs.writeFileSync(f.worker.sessionFile, '{"type":"session","id":"replacement"}\n');
    f.agent.agent_status = 'idle'; await w.poll();
    assert.equal(w.messages.length, 1);
    assert.match(w.messages[0].content, /已消失/);
    f.agent.agent_status = 'working'; await w.poll();
    f.agent.agent_status = 'blocked'; await w.poll();
    assert.equal(w.messages.length, 1, 'never adopt a new session at the old file/pane/name');
  } finally { f.close(); }
});

test('unbound legacy workers and invalid/copied bindings fail closed without querying global agents', async () => {
  const f = fixture(); const w = f.watch();
  try {
    await w.start(); await w.poll();
    f.agent.agent_status = 'idle'; await w.poll();
    assert.equal(f.calls, 0); assert.equal(w.messages.length, 0);
    for (const invalid of [
      { ...f.binding, owner: { ...f.owner, paneId: 'w1:p9' } },
      { ...f.binding, owner: { ...f.owner, workspaceId: 'w2' } },
      { ...f.binding, owner: { ...f.owner, sessionId: 'another-session' } },
      { ...f.binding, worker: { ...f.worker, name: '../escape' } },
      { ...f.binding, worker: { ...f.worker, workspaceId: 'w2' } },
      { ...f.binding, worker: { ...f.worker, paneId: f.owner.paneId } },
      { ...f.binding, worker: { ...f.worker, sessionFile: '/unrelated/session.jsonl' } },
      { ...f.binding, runDir: 'relative/path' },
    ]) {
      f.bind(invalid); await w.poll();
    }
    fs.writeFileSync(f.bindingFile, 'broken'); await w.poll();
    assert.equal(f.calls, 0); assert.equal(w.messages.length, 0);
  } finally { f.close(); }
});

test('same-name agents cannot impersonate the bound pane/workspace/session', async () => {
  for (const change of [
    a => { a.pane_id = 'w1:p99'; },
    a => { a.workspace_id = 'w2'; },
    a => { a.agent_session = { agent: 'pi', kind: 'path', value: '/other/session.jsonl' }; },
    a => { delete a.agent_session; },
  ]) {
    const f = fixture(); f.bind(); const w = f.watch();
    try {
      change(f.agent); await w.start(); await w.poll();
      f.agent.agent_status = 'idle'; await w.poll();
      f.agents = [f.dispatcher]; await w.poll();
      assert.equal(w.messages.length, 0);
    } finally { f.close(); }
  }
  const f = fixture(); f.bind(); const w = f.watch();
  try {
    // Same pane, name and file path, but a different native Pi session header.
    fs.writeFileSync(f.worker.sessionFile, '{"type":"session","id":"replacement"}\n');
    await w.start(); await w.poll(); f.agent.agent_status = 'idle'; await w.poll();
    assert.equal(w.messages.length, 0);
  } finally { f.close(); }
});

test('dispatcher identity must still match the pane and CLI snapshot', async () => {
  for (const mutate of [
    f => { f.agents = [f.agent]; },
    f => { f.dispatcher.workspace_id = 'w2'; },
    f => { f.dispatcher.agent_session.value = f.worker.sessionFile; },
    f => { f.agents = [f.dispatcher, f.dispatcher, f.agent]; },
  ]) {
    const f = fixture(); f.bind(); const w = f.watch();
    try {
      await w.start(); await w.poll(); mutate(f);
      f.agent.agent_status = 'idle'; await w.poll();
      assert.equal(w.messages.length, 0);
    } finally { f.close(); }
  }
});

test('removing ownership while CLI is in flight drops the notification', async () => {
  const f = fixture(); f.bind(); const w = f.watch();
  try {
    await w.start(); await w.poll();
    let finish;
    f.runner = () => new Promise(resolve => { finish = resolve; });
    const pending = w.poll();
    fs.unlinkSync(f.bindingFile); f.agent.agent_status = 'idle';
    finish(JSON.stringify({ result: { agents: [f.dispatcher, f.agent] } })); await pending;
    assert.equal(w.messages.length, 0);
    f.runner = undefined; await w.poll(); assert.equal(w.messages.length, 0);
  } finally { f.close(); }
});

test('shutdown is idempotent and late CLI results cannot wake a disposed session', async () => {
  const f = fixture(); f.bind(); const w = f.watch();
  try {
    await w.start(); await w.poll();
    let finish;
    f.runner = () => new Promise(resolve => { finish = resolve; });
    const pending = w.poll();
    await w.hooks.get('session_shutdown')(); await w.hooks.get('session_shutdown')();
    f.agent.agent_status = 'idle';
    finish(JSON.stringify({ result: { agents: [f.dispatcher, f.agent] } })); await pending;
    assert.equal(w.messages.length, 0);
    const calls = f.calls; await w.poll(); assert.equal(f.calls, calls);
  } finally { f.close(); }
});

test('binding helper verifies live identities and publishes an owner-scoped registration', () => {
  const f = fixture();
  try {
    const bin = path.join(f.root, 'bin'); fs.mkdirSync(bin);
    const snapshot = path.join(f.root, 'agents.json');
    fs.writeFileSync(snapshot, JSON.stringify({ result: { agents: [f.dispatcher, f.agent] } }));
    fs.writeFileSync(path.join(bin, 'herdr'), '#!/usr/bin/env python3\nimport os\nwith open(os.environ["TEST_HERDR_SNAPSHOT"]) as f: print(f.read())\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_HERDR_SNAPSHOT: snapshot, HERDR_ENV: '1', HERDR_WORKSPACE_ID: f.owner.workspaceId, HERDR_PANE_ID: f.owner.paneId, PI_SESSION_ID: f.owner.sessionId, PI_SESSION_FILE: f.ownerFile };
    const call = (extra = {}, pane = f.worker.paneId, run = f.runDir) => spawnSync('python3', ['skills/subagent-delegation/scripts/bind-worker.py', pane, run], { env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(call({ PI_SESSION_ID: 'stale-session' }).status, 1);
    assert.equal(fs.existsSync(f.bindingFile), false);
    assert.equal(call({}, f.owner.paneId).status, 1, 'cannot bind self');
    assert.equal(call({}, f.worker.paneId, f.root).status, 1, 'must use actual session run');
    f.agent.workspace_id = 'w2'; fs.writeFileSync(snapshot, JSON.stringify({ result: { agents: [f.dispatcher, f.agent] } }));
    assert.equal(call().status, 1, 'cannot bind across workspaces');
    f.agent.workspace_id = 'w1'; fs.writeFileSync(snapshot, JSON.stringify({ result: { agents: [f.dispatcher, f.agent] } }));
    const result = call(); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.bindingFile, 'utf8')), f.binding);
    assert.equal(call().status, 0, 'same binding is idempotent');
    f.agent.pane_id = 'w1:p3'; fs.writeFileSync(snapshot, JSON.stringify({ result: { agents: [f.dispatcher, f.agent] } }));
    assert.equal(call({}, 'w1:p3').status, 1, 'cannot replace a binding with a reused name');
  } finally { f.close(); }
});
