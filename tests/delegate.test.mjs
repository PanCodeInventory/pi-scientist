import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { registerDelegateTool } from '../dist/tools/delegate.js';
import { WORKER_ROUTES, routingQuestions, selectWorkerRoute, validateWorkerModel } from '../dist/core/subagent-route.js';
import { registerHerdrWatch } from '../dist/core/herdr-watch.js';

const answer = (tier = 'mid', vision = false) => ({
  provider: 'typesafe', model: 'jev-latest', api: 'typesafe-system-one', timestamp: 0, stopReason: 'stop',
  answers: {
    difficulty: { type: 'choice', choice: tier, probabilities: { easy: +(tier === 'easy'), mid: +(tier === 'mid'), hard: +(tier === 'hard') }, confidence: 1 },
    vision: { type: 'bool', probability: +vision },
  },
  usage: { input: 10, output: 2, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
});
const model = route => ({
  provider: route.provider, id: route.model, name: route.model, api: 'openai-completions',
  input: ['text', 'image'], reasoning: true, contextWindow: 1000000, maxTokens: 10000,
  thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' },
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});

function fixture({ herdr = true, tier = 'mid', vision = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sci-delegate-'space "));
  const cwd = path.join(root, 'analysis'), run = path.join(cwd, '.sci/runs/worker-test');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'brief.md'), 'Goal: adapt a conventional workflow. Inputs: input.json. Write scope: results/. Acceptance: validate totals. No git commit.');
  const owner = SessionManager.open(path.join(root, 'owner.jsonl'), root, root);
  owner.appendMessage({ role: 'user', content: 'dispatcher', timestamp: 0 });
  const envKeys = ['HERDR_ENV', 'HERDR_WORKSPACE_ID', 'HERDR_PANE_ID', 'PI_SESSION_ID', 'PI_SESSION_FILE'];
  const saved = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { HERDR_ENV: herdr ? '1' : '0', HERDR_WORKSPACE_ID: 'w1', HERDR_PANE_ID: 'w1:p1', PI_SESSION_ID: owner.getSessionId(), PI_SESSION_FILE: owner.getSessionFile() });
  const dispatcher = { name: 'parent', agent: 'pi', workspace_id: 'w1', pane_id: 'w1:p1', agent_status: 'working', agent_session: { agent: 'pi', kind: 'path', value: owner.getSessionFile() } };
  const pane = { workspace_id: 'w1', pane_id: 'w1:p2', tab_id: 'w1:t2', cwd, foreground_cwd: cwd };
  const calls = [], hooks = new Map(), messages = [], agents = [dispatcher];
  let tool, f;
  const registry = {
    findOfType: () => ({ provider: 'typesafe', id: 'jev-latest' }),
    classify: async (_m, context, options) => { f.classifications++; f.questions = context; f.signal = options.signal; return f.classified; },
    find: (provider, id) => f.models.find(m => m.provider === provider && m.id === id),
    getAvailable: () => f.available ?? f.models,
  };
  const api = {
    registerTool: t => { tool = t; },
    on: (name, fn) => hooks.set(name, fn),
    sendMessage: (...args) => messages.push(args),
    exec: async (bin, args, options) => {
      calls.push({ bin, args, options });
      const override = await f.intercept?.(bin, args, options);
      if (override) return override;
      const ok = data => ({ stdout: JSON.stringify({ result: data }), stderr: '', code: 0, killed: false });
      if (bin === 'herdr' && args[0] === 'agent' && args[1] === 'list') return ok({ agents });
      if (bin === 'herdr' && args[0] === 'pane') return ok({ pane });
      if (bin === 'herdr' && args[1] === 'start') {
        const native = SessionManager.open(path.join(run, 'session.jsonl'));
        f.worker = { name: args[2], agent: 'pi', workspace_id: 'w1', pane_id: 'w1:p2', agent_status: 'working', agent_session: { agent: 'pi', kind: 'path', value: native.getSessionFile() } };
        agents.push(f.worker);
        return ok({ agent: f.worker });
      }
      if (bin === 'python3') {
        const binDir = path.join(root, 'bin'); fs.mkdirSync(binDir, { recursive: true });
        const snapshot = path.join(root, 'agents.json'); fs.writeFileSync(snapshot, JSON.stringify({ result: { agents } }));
        fs.writeFileSync(path.join(binDir, 'herdr'), '#!/usr/bin/env python3\nimport os\nprint(open(os.environ["TEST_HERDR_SNAPSHOT"]).read())\n', { mode: 0o755 });
        const r = spawnSync(bin, args, { cwd: options.cwd, encoding: 'utf8', env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, TEST_HERDR_SNAPSHOT: snapshot } });
        return { stdout: r.stdout, stderr: r.stderr, code: r.status, killed: false };
      }
      if (bin === 'herdr' && args[1] === 'prompt') return ok({ submitted: true });
      if (bin === 'tmux' && args[0] === 'has-session') return { stdout: '', stderr: '', code: 1, killed: false };
      if (bin === 'tmux' && args[0] === 'new-session') return { stdout: '', stderr: '', code: 0, killed: false };
      throw new Error(`Unexpected command ${bin} ${args}`);
    },
  };
  f = {
    root, cwd, run, api, hooks, messages, agents, dispatcher, pane, owner, registry, calls,
    classified: answer(tier, vision), classifications: 0,
    models: [...new Map(Object.values(WORKER_ROUTES).flatMap(v => Object.values(v)).map(r => [`${r.provider}/${r.model}`, model(r)])).values()],
    params: { cwd, runDir: run, ...(herdr ? { paneId: 'w1:p2' } : {}) },
    ctx: { cwd: root, sessionManager: owner, modelRegistry: registry },
    receipt: () => JSON.parse(fs.readFileSync(path.join(run, 'dispatch.json'), 'utf8')),
    execute: (extra = {}, signal = new AbortController().signal) => tool.execute('fixture', { ...f.params, ...extra }, signal, undefined, f.ctx),
    close: () => { for (const k of envKeys) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; fs.rmSync(root, { recursive: true, force: true }); },
  };
  registerDelegateTool(api);
  f.tool = tool;
  return f;
}

test('fixed route table covers all six combinations, including DeepSeek for mid vision', () => {
  const expected = [
    ['easy', false, 'ollama-cloud', 'minimax-m3.1-flash', 'low'],
    ['easy', true, 'zai-coding-cn', 'glm-5.3-flash', 'low'],
    ['mid', false, 'zai-coding-cn', 'glm-5.3', 'high'],
    ['mid', true, 'ollama-cloud', 'deepseek-v4.1-flash:1017', 'high'],
    ['hard', false, 'openai-codex', 'gpt-6-astra', 'high'],
    ['hard', true, 'openai-codex', 'gpt-6-astra', 'high'],
  ];
  for (const [tier, vision, provider, id, thinking] of expected) {
    const route = selectWorkerRoute(answer(tier, vision));
    assert.deepEqual([route.provider, route.model, route.thinking], [provider, id, thinking]);
  }
  assert.equal(selectWorkerRoute(answer('easy', false), true).needsVision, true);
  assert.equal(selectWorkerRoute(answer('mid', true), false).needsVision, true);
  const q = routingQuestions('brief', true);
  assert.deepEqual(q.state, { brief: 'brief', requiresVision: true });
  assert.deepEqual(Object.keys(q.questions), ['difficulty', 'vision']);
});

test('invalid and failed classifier output cannot select a route', () => {
  for (const mutate of [
    r => { r.stopReason = 'error'; r.errorMessage = 'offline'; },
    r => { r.answers = {}; },
    r => { r.answers.difficulty.choice = '__proto__'; },
    r => { r.answers.difficulty.probabilities = { easy: 0.1, mid: 0.1, hard: 0.1 }; },
    r => { r.answers.vision.probability = NaN; },
    r => { r.answers.difficulty.confidence = Infinity; },
  ]) { const r = answer(); mutate(r); assert.throws(() => selectWorkerRoute(r)); }
});

test('Herdr launch uses native session, binds before prompting, and unchanged watcher reports its progress', async () => {
  const f = fixture({ vision: true });
  let watch;
  try {
    assert.equal(f.tool.exposure, 'model-only');
    assert.equal(f.tool.executionMode, 'sequential');
    const result = await f.execute();
    assert.notEqual(result.isError, true, result.content[0].text);
    assert.equal(f.classifications, 1);
    assert.equal(f.signal instanceof AbortSignal, true);
    assert.equal(result.usage.totalTokens, 12);
    const start = f.calls.find(c => c.args[1] === 'start');
    assert.deepEqual(start.args.slice(-8), ['--session', path.join(f.run, 'session.jsonl'), '--provider', 'ollama-cloud', '--model', 'deepseek-v4.1-flash:1017', '--thinking', 'high']);
    assert.ok(f.calls.findIndex(c => c.bin === 'python3') < f.calls.findIndex(c => c.args[1] === 'prompt'));
    const native = SessionManager.open(path.join(f.run, 'session.jsonl'));
    assert.equal(native.getHeader().cwd, f.cwd);
    assert.equal(native.getEntries().filter(e => e.type === 'message').length, 1, 'initialization uses no model call');
    const receipt = f.receipt();
    assert.equal(receipt.phase, 'submitted');
    assert.equal(receipt.workerSessionId, native.getSessionId());
    const binding = JSON.parse(fs.readFileSync(path.join(f.root, '.sci/herdr-watch', f.owner.getSessionId(), 'worker-test.json'), 'utf8'));
    assert.equal(binding.worker.sessionId, native.getSessionId());
    assert.equal(binding.owner.sessionId, f.owner.getSessionId());
    watch = registerHerdrWatch(f.api, { run: async () => JSON.stringify({ result: { agents: f.agents } }), intervalMs: 999999 });
    await f.hooks.get('session_start')({}, f.ctx);
    await watch.poll();
    fs.writeFileSync(path.join(f.run, 'result.md'), 'completed: totals verified');
    f.worker.agent_status = 'idle'; await watch.poll();
    assert.equal(f.messages.length, 1);
    assert.match(f.messages[0][0].content, /worker-test: idle/);
    assert.match(f.messages[0][0].content, /result.md 已就绪/);
    await assert.rejects(f.execute(), /not fresh/);
    assert.equal(f.calls.filter(c => c.args[1] === 'start').length, 1);
  } finally { watch?.stop(); f.close(); }
});

test('tmux fallback quotes paths and initial prompt, with no Herdr binding or fake notifications', async () => {
  const f = fixture({ herdr: false, tier: 'easy' });
  try {
    const result = await f.execute();
    assert.notEqual(result.isError, true, result.content[0].text);
    const launch = f.calls.find(c => c.bin === 'tmux' && c.args[0] === 'new-session');
    assert.equal(launch.args[launch.args.indexOf('-c') + 1], f.cwd);
    assert.equal(spawnSync('sh', ['-n', '-c', launch.args.at(-1)]).status, 0);
    // Check argument preservation by executing the shell command against a harmless fake pi.
    const bin = path.join(f.root, 'bin'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'pi'), '#!/usr/bin/env python3\nimport sys,json\nprint(json.dumps(sys.argv[1:]))\n', { mode: 0o755 });
    const probe = spawnSync('sh', ['-c', launch.args.at(-1)], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(probe.status, 0, probe.stderr);
    const argv = JSON.parse(probe.stdout);
    assert.equal(argv[1], path.join(f.run, 'session.jsonl'));
    assert.match(argv.at(-1), /Read .*brief.md/);
    assert.equal(f.calls.some(c => ['herdr', 'python3'].includes(c.bin)), false);
    assert.match(result.content[0].text, /no automatic tmux progress/);
  } finally { f.close(); }
});

test('forced vision routes easy to ZAI Flash even when classifier says text', async () => {
  const f = fixture({ tier: 'easy' });
  try {
    const result = await f.execute({ requiresVision: true });
    assert.notEqual(result.isError, true, result.content[0].text);
    assert.equal(result.details.route.model, 'glm-5.3-flash');
    assert.equal(result.details.route.needsVision, true);
    assert.equal(f.questions.state.requiresVision, true);
  } finally { f.close(); }
});

test('classification failures, missing models, vision and thinking mismatches never launch', async () => {
  for (const mutate of [
    f => { f.classified.stopReason = 'error'; f.classified.errorMessage = 'test failure'; },
    f => { f.classified.answers = {}; },
    f => { f.registry.findOfType = () => undefined; },
    f => { f.models = []; },
    f => { f.available = []; },
    f => { f.classified = answer('mid', true); f.models.forEach(m => { m.input = ['text']; }); },
    f => { f.models.forEach(m => { m.reasoning = false; }); },
    f => { f.registry.classify = async () => { fs.appendFileSync(path.join(f.run, 'brief.md'), ' changed'); return answer(); }; },
  ]) {
    const f = fixture();
    try {
      mutate(f);
      const result = await f.execute();
      assert.equal(result.isError, true);
      assert.equal(f.receipt().launchAttempted, false);
      assert.equal(fs.existsSync(path.join(f.run, 'session.jsonl')), false);
      assert.equal(f.calls.some(c => c.args[1] === 'start'), false);
    } finally { f.close(); }
  }
});

test('bad pane, cwd, owner, stale outputs and duplicate receipt fail before classification', async () => {
  for (const mutate of [
    f => { f.params.paneId = 'w1:p1'; },
    f => { f.pane.workspace_id = 'other'; },
    f => { f.pane.agent = 'pi'; },
    f => { f.pane.foreground_cwd = f.root; },
    f => { f.dispatcher.agent_session.value = '/wrong.jsonl'; },
    f => { fs.writeFileSync(path.join(f.run, 'result.md'), 'stale'); },
    f => { fs.writeFileSync(path.join(f.run, 'dispatch.json'), '{}'); },
    f => { fs.writeFileSync(path.join(f.run, 'brief.md'), ''); },
    f => { fs.writeFileSync(path.join(f.run, 'brief.md'), 'x'.repeat(50000)); },
  ]) {
    const f = fixture();
    try { mutate(f); await assert.rejects(f.execute()); assert.equal(f.classifications, 0); }
    finally { f.close(); }
  }
});

test('Herdr zero-exit errors at start/bind/submission preserve partial-launch evidence without resending', async () => {
  for (const phase of ['start', 'bind', 'prompt']) {
    const f = fixture();
    try {
      f.intercept = async (bin, args) => {
        if ((bin === 'herdr' && args[1] === phase) || (phase === 'bind' && bin === 'python3'))
          return { stdout: JSON.stringify({ error: { code: phase === 'prompt' ? 'agent_prompt_stalled' : 'test_failure' } }), stderr: phase === 'bind' ? 'binding failed' : '', code: phase === 'bind' ? 1 : 0, killed: false };
      };
      const result = await f.execute();
      assert.equal(result.isError, true);
      assert.equal(f.receipt().launchAttempted, true);
      assert.equal(f.receipt().failedAtPhase, phase === 'start' ? 'starting' : phase === 'bind' ? 'started' : 'submitting');
      assert.equal(f.calls.filter(c => c.args[1] === 'start').length, 1);
      assert.equal(f.calls.filter(c => c.args[1] === 'prompt').length, phase === 'prompt' ? 1 : 0);
      assert.equal(f.calls.some(c => c.args[1] === 'close'), false);
      assert.equal(result.usage.totalTokens, 12);
      assert.match(result.content[0].text, /Do not blindly/);
    } finally { f.close(); }
  }
});

test('abort during classification prevents launch and propagates cancellation to Jev', async () => {
  const f = fixture(), controller = new AbortController();
  try {
    f.registry.classify = async (_model, _context, options) => { assert.equal(options.signal, controller.signal); controller.abort(); return answer(); };
    const result = await f.execute({}, controller.signal);
    assert.equal(result.isError, true);
    assert.equal(f.receipt().launchAttempted, false);
    assert.equal(result.usage.totalTokens, 12, 'completed classifier usage survives cancellation');
    assert.equal(f.calls.some(c => c.args[1] === 'start'), false);
  } finally { f.close(); }
});

test('concurrent calls for the same fresh run cannot classify or launch twice', async () => {
  const f = fixture();
  try {
    const results = await Promise.allSettled([f.execute(), f.execute()]);
    assert.equal(results.filter(r => r.status === 'fulfilled' && !r.value.isError).length, 1);
    assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    assert.equal(f.classifications, 1);
    assert.equal(f.calls.filter(c => c.args[1] === 'start').length, 1);
    assert.equal(f.calls.filter(c => c.args[1] === 'prompt').length, 1);
  } finally { f.close(); }
});

test('dispatcher replacement during classification prevents launch without changing parent model', async () => {
  const f = fixture();
  const parentModel = { provider: 'parent', id: 'unchanged' }; f.ctx.model = parentModel;
  try {
    f.registry.classify = async () => { f.ctx.sessionManager = { getSessionId: () => 'replaced', getSessionFile: () => f.owner.getSessionFile() }; return answer(); };
    const result = await f.execute();
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /session changed/);
    assert.equal(f.receipt().launchAttempted, false);
    assert.equal(f.calls.some(c => c.args[1] === 'start'), false);
    assert.equal(f.ctx.model, parentModel);
  } finally { f.close(); }
});

test('model validation does not silently clamp unsupported reasoning levels', () => {
  const route = selectWorkerRoute(answer('mid'));
  const m = model(route); m.thinkingLevelMap.high = null;
  assert.throws(() => validateWorkerModel(route, { find: () => m, getAvailable: () => [m] }), /thinking=high/);
});
