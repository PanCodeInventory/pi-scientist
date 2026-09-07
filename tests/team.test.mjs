import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Team } from '../dist/core/team.js';
import { TeamStore, activeAttempt, atomicJSON } from '../dist/core/team-store.js';
import { TerminalBackend, shellQuote } from '../dist/core/team-backend.js';
import { registerTeamHandoff } from '../dist/tools/handoff.js';

const input = (overrides = {}) => ({ role: 'worker', brief: 'Generate a checked fixture table', inputs: [], decisions: ['fixture only'], writeScopes: ['01_Test'], criteria: ['Table is readable and has the requested row'], dependsOn: [], ...overrides });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scientist-team-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const launches = [], stopped = [], states = new Map();
  const backend = {
    async launch(spec, allocated) { launches.push(spec); allocated({ backend: 'tmux', target: spec.attempt.id, paneId: '%1' }); states.set(spec.attempt.id, 'idle'); },
    async inspect(attempt) { return { state: states.get(attempt.id) ?? 'gone' }; },
    async stop(attempt) { stopped.push(attempt.id); states.set(attempt.id, 'gone'); },
  };
  const team = new Team(root, () => backend);
  return { root, team, backend, launches, stopped, states };
}
function deliver(team, id, overrides = {}) {
  const task = team.store.get(id), attempt = activeAttempt(task);
  const handoff = { taskId: id, attemptId: attempt.id, status: 'submitted', summary: 'Checked fixture', outputs: [], checks: ['Checked actual fixture content'], jobs: [], ...overrides };
  atomicJSON(path.join(attempt.dir, 'handoff.json'), handoff);
  return handoff;
}

test('worker submission survives coordinator restart and needs explicit acceptance; no automatic reviewer', async t => {
  const f = fixture(t), first = f.team.create(input());
  await f.team.start(first.id, 'tmux');
  deliver(f.team, first.id);
  const recovered = new Team(f.root, () => f.backend);
  assert.equal((await recovered.collect())[0].status, 'submitted');
  assert.equal(recovered.store.get(first.id).status, 'submitted');
  await assert.rejects(recovered.accept(first.id, ''), /evidence/);
  assert.equal((await recovered.accept(first.id, 'Verified experimental unit and requested fixture output')).status, 'accepted');
  assert.deepEqual(f.launches.map(x => x.task.role), ['worker']);
  assert.equal(f.stopped.length, 1);
  assert.equal(fs.existsSync(path.join(activeAttempt(recovered.store.get(first.id)).dir, 'brief.md')), true);
});

test('dependency gates, concurrency limits and overlapping output ownership prevent premature execution', async t => {
  const f = fixture(t), upstream = f.team.create(input());
  const downstream = f.team.create(input({ writeScopes: ['02_Next'], dependsOn: [upstream.id] }));
  await assert.rejects(f.team.start(downstream.id, 'tmux'), /Dependencies/);
  await f.team.start(upstream.id, 'tmux');
  const conflict = f.team.create(input({ writeScopes: ['01_Test/results'] }));
  await assert.rejects(f.team.start(conflict.id, 'tmux'), /ownership/);
  const independent = f.team.create(input({ writeScopes: ['03_Other'] }));
  await assert.rejects(f.team.start(independent.id, 'tmux', 1), /concurrency/);
  deliver(f.team, upstream.id); await f.team.collect();
  await assert.rejects(f.team.start(downstream.id, 'tmux'), /Dependencies/, 'submitted is not accepted');
  await f.team.accept(upstream.id, 'Checked upstream content');
  await f.team.start(downstream.id, 'tmux');
  assert.equal(f.launches.length, 2);
});

test('working or unknown runtime never becomes accepted; idle without a handoff becomes blocked', async t => {
  const f = fixture(t), task = f.team.create(input());
  await f.team.start(task.id, 'tmux');
  f.team.store.update(task.id, t => { activeAttempt(t).startedAt = new Date(0).toISOString(); });
  f.states.set(activeAttempt(f.team.store.get(task.id)).id, 'unknown');
  assert.deepEqual(await f.team.collect(), []);
  assert.equal(f.team.store.get(task.id).status, 'running');
  f.states.set(activeAttempt(f.team.store.get(task.id)).id, 'idle');
  assert.equal((await f.team.collect())[0].status, 'blocked');
  await assert.rejects(f.team.accept(task.id, 'idle'), /submitted/);
});

test('stale handoffs are rejected and a malformed handoff only notifies once', async t => {
  const f = fixture(t), task = f.team.create(input());
  await f.team.start(task.id, 'tmux');
  deliver(f.team, task.id, { attemptId: 'stale' });
  const changed = await f.team.collect();
  assert.equal(changed[0].status, 'blocked');
  assert.match(changed[0].note, /mismatch/);
  assert.deepEqual(await f.team.collect(), []);
});

test('recorded computation blocks retries until exit status exists; continuation gets a new attempt', async t => {
  const f = fixture(t), task = f.team.create(input());
  await f.team.start(task.id, 'tmux');
  const first = activeAttempt(f.team.store.get(task.id));
  const job = { session: 'sci_fixture_run1', statusFile: '01_Test/tmux/run1.status', logFile: '01_Test/tmux/run1.log' };
  deliver(f.team, task.id, { status: 'waiting_compute', jobs: [job] });
  await f.team.collect();
  assert.equal(f.team.store.get(task.id).status, 'waiting_compute');
  await assert.rejects(f.team.retry(task.id, 'Continue', 'tmux'), /Resume requires|still be running/);
  fs.mkdirSync(path.dirname(path.join(f.root, job.statusFile)), { recursive: true });
  fs.writeFileSync(path.join(f.root, job.statusFile), 'EXIT_STATUS:0\n');
  assert.equal((await f.team.collect())[0].status, 'blocked');
  const continued = await f.team.retry(task.id, 'Inspect output content; reuse finished calculation', 'tmux');
  assert.equal(continued.attempts.length, 2);
  assert.notEqual(activeAttempt(continued).id, first.id);
  assert.equal(fs.existsSync(path.join(first.dir, 'handoff.json')), true);
  assert.equal(f.launches.length, 2);
});

test('accept rejects missing outputs and will not stop a still-working agent', async t => {
  const f = fixture(t), task = f.team.create(input());
  await f.team.start(task.id, 'tmux');
  deliver(f.team, task.id, { outputs: ['01_Test/results/table.csv'] });
  await assert.rejects(f.team.accept(task.id, 'Checked'), /Missing/);
  fs.mkdirSync(path.join(f.root, '01_Test/results'), { recursive: true });
  fs.writeFileSync(path.join(f.root, '01_Test/results/table.csv'), 'name,value\nfixture,1\n');
  f.states.set(activeAttempt(f.team.store.get(task.id)).id, 'working');
  await assert.rejects(f.team.accept(task.id, 'Checked actual rows'), /working/);
  assert.equal(f.stopped.length, 0);
});

test('path escapes and root ownership are rejected, including symlinks', t => {
  const f = fixture(t);
  assert.throws(() => f.team.create(input({ writeScopes: ['../outside'] })), /leaves/);
  assert.throws(() => f.team.create(input({ writeScopes: ['.'] })), /cannot own/);
  assert.throws(() => f.team.create(input({ writeScopes: ['Task'] })), /cannot own/);
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'escape'));
  assert.throws(() => f.team.create(input({ writeScopes: ['escape/test'] })), /leaves/);
  assert.throws(() => f.team.create(input({ role: 'reviewer' })), /Read-only/);
});

test('state lock never overwrites concurrent state and releases on validation failure', t => {
  const f = fixture(t), store = new TeamStore(f.root);
  f.team.create(input());
  const lock = path.join(store.dir, 'state.lock');
  fs.writeFileSync(lock, 'another coordinator');
  assert.throws(() => store.create(input()), /locked/);
  assert.equal(store.read().tasks.length, 1);
  fs.rmSync(lock);
  assert.throws(() => store.create(input({ dependsOn: ['missing'] })), /Unknown dependency/);
  assert.equal(fs.existsSync(lock), false);
});

test('Herdr adapter preserves explicit pane identity, native session and child tool boundaries', async t => {
  const f = fixture(t), task = f.team.create(input());
  const reservation = f.team.store.reserve(task.id, 3);
  fs.mkdirSync(reservation.attempt.dir, { recursive: true });
  const calls = [];
  const run = async (bin, args) => {
    calls.push({ bin, args });
    if (args[0] === 'pane' && args[1] === 'split') return JSON.stringify({ result: { pane: { pane_id: 'w7:p9', terminal_id: 'term-9' } } });
    return JSON.stringify({ result: { agent: { name: `sci-${reservation.attempt.id.replaceAll('-', '').slice(0, 24)}`, pane_id: 'w7:p9', terminal_id: 'term-9', agent_status: 'idle' } } });
  };
  const previous = process.env.HERDR_ENV; process.env.HERDR_ENV = '1';
  t.after(() => { if (previous === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = previous; });
  const backend = new TerminalBackend('herdr', run);
  let handle;
  await backend.launch({ root: f.root, ...reservation, agent: { systemPrompt: 'role', tools: ['read', 'bash'], model: 'test/model' } }, h => { handle = { ...h }; });
  assert.deepEqual(calls.map(c => c.args.slice(0, 2)), [['pane', 'split'], ['agent', 'start'], ['agent', 'prompt']]);
  assert.ok(calls[0].args.includes('--no-focus'));
  assert.ok(calls[0].args.includes(`SCIENTIST_ATTEMPT_ID=${reservation.attempt.id}`));
  assert.ok(calls[1].args.includes('--session')); assert.ok(!calls[1].args.includes('--no-session'));
  assert.ok(calls[1].args.includes('read,bash,sci_handoff'));
  assert.equal(handle.terminalId, 'term-9');
  assert.equal((await backend.inspect({ ...reservation.attempt, handle })).state, 'idle');
  await backend.stop({ ...reservation.attempt, handle });
  assert.deepEqual(calls.at(-1).args, ['pane', 'close', 'w7:p9']);
});

test('Herdr failure preserves the allocated attempt instead of creating a duplicate', async t => {
  const f = fixture(t), task = f.team.create(input());
  f.backend.launch = async (spec, allocated) => { allocated({ backend: 'tmux', target: 'owned', paneId: '%1' }); throw new Error('connection dropped'); };
  await assert.rejects(f.team.start(task.id, 'tmux'), /connection dropped/);
  const persisted = f.team.store.get(task.id);
  assert.equal(persisted.status, 'blocked');
  assert.equal(activeAttempt(persisted).handle.target, 'owned');
  await assert.rejects(f.team.start(task.id, 'tmux'), /not pending/);
  assert.equal(f.team.store.get(task.id).attempts.length, 1);
});

test('child handoff publishes after the turn ends and cannot accept or dispatch', async t => {
  const f = fixture(t), task = f.team.create(input());
  await f.team.start(task.id, 'tmux');
  const attempt = activeAttempt(f.team.store.get(task.id));
  const env = { SCIENTIST_TEAM_ROOT: f.root, SCIENTIST_TASK_ID: task.id, SCIENTIST_ATTEMPT_ID: attempt.id };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  const tools = new Map(), hooks = new Map();
  registerTeamHandoff({ registerTool: t => tools.set(t.name, t), on: (name, fn) => hooks.set(name, fn) });
  assert.deepEqual([...tools.keys()], ['sci_handoff']);
  await tools.get('sci_handoff').execute('test', { status: 'submitted', summary: 'Validated fixture', outputs: [], checks: ['Actual check'] });
  assert.equal(fs.existsSync(path.join(attempt.dir, 'handoff.json')), false);
  await hooks.get('agent_end')({ messages: [{ role: 'assistant', stopReason: 'stop' }] });
  assert.equal(fs.existsSync(path.join(attempt.dir, 'handoff.json')), true);
  assert.equal((await f.team.collect())[0].status, 'submitted');
  await assert.rejects(tools.get('sci_handoff').execute('again', { status: 'submitted', summary: 'again', outputs: [], checks: ['check'] }), /already delivered/);
});

test('shell quoting preserves command substitutions and apostrophes as literal text', () => {
  assert.equal(shellQuote("a'b $(touch /tmp/not-run)"), "'a'\\''b $(touch /tmp/not-run)'");
});

test('cancelled worker keeps output ownership while its recorded computation is unfinished', async t => {
  const f = fixture(t), task = f.team.create(input());
  await f.team.start(task.id, 'tmux');
  deliver(f.team, task.id, { status: 'waiting_compute', jobs: [{ session: 'sci_still_running', statusFile: '01_Test/tmux/run.status', logFile: '01_Test/tmux/run.log' }] });
  await f.team.collect(); await f.team.cancel(task.id);
  const other = f.team.create(input());
  await assert.rejects(f.team.start(other.id, 'tmux'), /ownership/);
  await assert.rejects(f.team.retry(task.id, 'Try again', 'tmux'), /still be running/);
});

test('real isolated tmux launches a fake Pi, preserves literal paths and stops only its own session', async t => {
  const { execFileSync } = await import('node:child_process');
  try { execFileSync('tmux', ['-V']); } catch { t.skip('tmux unavailable'); return; }
  const { command } = await import('../dist/core/team-backend.js');
  const f = fixture(t);
  const bin = path.join(f.root, "bin ' literal $(not-a-command)");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'pi'), `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const dir = path.join(process.env.SCIENTIST_TEAM_ROOT, '.scientist/runs', process.env.SCIENTIST_TASK_ID, process.env.SCIENTIST_ATTEMPT_ID);
fs.writeFileSync(path.join(dir, 'fixture-args.json'), JSON.stringify(process.argv.slice(2)));
fs.writeFileSync(path.join(dir, 'lifecycle.json'), JSON.stringify({ attemptId: process.env.SCIENTIST_ATTEMPT_ID, state: 'idle' }));
setInterval(() => {}, 1000);
`, { mode: 0o700 });
  const prior = process.env.PATH;
  process.env.PATH = bin + path.delimiter + prior;
  const socket = `sci-test-${process.pid}-${Date.now()}`;
  const backend = new TerminalBackend('tmux', (bin, args) => command(bin, bin === 'tmux' ? ['-L', socket, ...args] : args));
  const team = new Team(f.root, () => backend);
  t.after(() => { process.env.PATH = prior; try { execFileSync('tmux', ['-L', socket, 'kill-server'], { stdio: 'ignore' }); } catch {} });
  const task = team.create(input());
  const started = await team.start(task.id, 'tmux');
  const attempt = activeAttempt(started), argsFile = path.join(attempt.dir, 'fixture-args.json');
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(argsFile) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  assert.ok(fs.existsSync(argsFile), 'fake Pi actually starts in isolated tmux');
  const args = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
  assert.ok(args.includes('--session'));
  assert.ok(args.at(-1).includes(task.id));
  assert.equal((await backend.inspect(attempt)).state, 'idle');
  deliver(team, task.id);
  await team.accept(task.id, 'Inspected fixture process arguments and handoff');
  assert.equal(team.store.get(task.id).status, 'accepted');
  assert.throws(() => execFileSync('tmux', ['-L', socket, 'has-session', '-t', attempt.handle.target], { stdio: 'ignore' }));
});

test('interrupted child turn never publishes staged success', async t => {
  const f = fixture(t), task = f.team.create(input());
  await f.team.start(task.id, 'tmux');
  const attempt = activeAttempt(f.team.store.get(task.id));
  const env = { SCIENTIST_TEAM_ROOT: f.root, SCIENTIST_TASK_ID: task.id, SCIENTIST_ATTEMPT_ID: attempt.id };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [k, v] of Object.entries(old)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
  const tools = new Map(), hooks = new Map();
  registerTeamHandoff({ registerTool: t => tools.set(t.name, t), on: (name, fn) => hooks.set(name, fn) });
  for (const reason of ['aborted', 'error', 'length', 'toolUse']) {
    await tools.get('sci_handoff').execute('test', { status: 'submitted', summary: 'Staged fixture', outputs: [], checks: ['Actual check'] });
    await hooks.get('agent_end')({ messages: [{ role: 'assistant', stopReason: reason }] });
    assert.equal(fs.existsSync(path.join(attempt.dir, 'handoff.json')), false, reason);
    assert.equal(fs.existsSync(path.join(attempt.dir, 'handoff.pending.json')), false, reason);
  }
});
