import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManager, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { registerLearning, createJob } from '../dist/core/learning.js';
import { HOME, config, setEnabled, atomic, publish, readManaged, skillPath, readEvidence, header } from '../dist/core/learning-store.js';

function fixture(t, run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sci-learning-life-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  setEnabled(root, true);
  const source = SessionManager.inMemory(root); source.appendMessage({ role: 'user', content: 'Task', timestamp: 1 });
  const hooks = new Map(), commands = new Map(), tools = new Map(), notices = [];
  let activeTools = ['sci_delivery'];
  const pi = { on(n, fn) { hooks.set(n, fn); }, registerCommand(n, c) { commands.set(n, c); }, registerTool(t) { tools.set(t.name, t); }, getActiveTools() { return activeTools; } };
  const ctx = { cwd: root, sessionManager: source, isProjectTrusted: () => true, isIdle: () => true, modelRegistry: {}, ui: { notify: (...args) => notices.push(args) } };
  const control = registerLearning(pi, { run, timeoutMs: 20 });
  return { root, source, hooks, commands, tools, notices, ctx, control, setTools: next => { activeTools = next; } };
}

test('fresh trusted projects learn by default; explicit off and trust checks still win', async t => {
  let runs = 0;
  const f = fixture(t, async () => { runs++; return 'no_change'; });
  fs.rmSync(path.join(f.root, HOME), { recursive: true });
  assert.deepEqual(config(f.root), { enabled: true });
  const event = { systemPromptOptions: { sections: {} } }, before = f.hooks.get('before_agent_start');
  before(event, f.ctx);
  assert.match(event.systemPromptOptions.sections['scientist-learning'], /sci_delivery/);
  await f.commands.get('sci-learn').handler('status', f.ctx);
  assert.equal(JSON.parse(f.notices.at(-1)[0]).config.enabled, true);
  assert.equal(fs.existsSync(path.join(f.root, HOME)), false, 'reading defaults must not create project state');
  const delivery = f.tools.get('sci_delivery');
  const untrusted = { ...f.ctx, isProjectTrusted: () => false };
  before(event, untrusted); assert.equal(event.systemPromptOptions.sections['scientist-learning'], undefined);
  await assert.rejects(delivery.execute('untrusted', { delivery: 'Done' }, undefined, undefined, untrusted), /untrusted/);
  f.hooks.get('agent_settled')({ aborted: false }, f.ctx); await f.control.wait();
  assert.equal(runs, 0, 'ordinary settlement is not a delivery');
  await delivery.execute('default-on', { delivery: 'Delivered checked work' }, undefined, undefined, f.ctx);
  f.source.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'Done' }], stopReason: 'stop', timestamp: 2 });
  f.hooks.get('agent_settled')({ aborted: false }, f.ctx); await f.control.wait();
  assert.equal(runs, 1);
  assert.equal(readManaged(f.root, `${HOME}/config.json`), null);
  await f.commands.get('sci-learn').handler('off', f.ctx);
  assert.deepEqual(config(f.root), { enabled: false });
  before(event, f.ctx); assert.equal(event.systemPromptOptions.sections['scientist-learning'], undefined);
  await assert.rejects(delivery.execute('disabled', { delivery: 'Done' }, undefined, undefined, f.ctx), /disabled/);
  await f.commands.get('sci-learn').handler('reflect', f.ctx); await f.control.wait();
  assert.equal(runs, 1);
  await f.commands.get('sci-learn').handler('on', f.ctx);
  assert.deepEqual(config(f.root), { enabled: true });
});

test('learning prompt respects trust/tool filtering and malformed config cannot block unrelated work', t => {
  const f = fixture(t, async () => 'no_change'), event = { systemPromptOptions: { sections: { unrelated: 'keep' } } };
  const before = f.hooks.get('before_agent_start');
  before(event, f.ctx); assert.match(event.systemPromptOptions.sections['scientist-learning'], /sci_delivery/);
  f.setTools(['read']); before(event, f.ctx); assert.equal(event.systemPromptOptions.sections['scientist-learning'], undefined);
  f.setTools(['sci_delivery']); before(event, { ...f.ctx, isProjectTrusted: () => false });
  assert.equal(event.systemPromptOptions.sections['scientist-learning'], undefined);
  atomic(f.root, `${HOME}/config.json`, 'malformed');
  assert.doesNotThrow(() => before(event, f.ctx));
  assert.equal(event.systemPromptOptions.sections.unrelated, 'keep');
  assert.equal(event.systemPromptOptions.sections['scientist-learning'], undefined);
});

test('timeout is recorded and a subsequent manual attempt can run', async t => {
  let attempts = 0;
  const f = fixture(t, async (_job, _ctx, signal) => {
    if (++attempts > 1) return 'no_change';
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  await f.commands.get('sci-learn').handler('reflect first', f.ctx);
  await f.control.wait();
  assert.ok(f.notices.some(([text]) => /timed out/.test(text)));
  await f.commands.get('sci-learn').handler('reflect second', f.ctx); await f.control.wait();
  assert.equal(attempts, 2);
  assert.ok(f.notices.some(([text]) => /no_change/.test(text)));
});

test('multiple topic skills have distinct triggers, load only on reload and respect trust/noSkills', async t => {
  const f = fixture(t, async () => 'no_change'), topics = ['single-cell-qc', 'differential-expression'];
  const descriptions = ['Use for single-cell input QC.', 'Use when preparing differential expression contrasts.'];
  for (const [trusted, noSkills, expected] of [[true, false, 2], [false, false, 0], [true, true, 0]]) {
    const settingsManager = SettingsManager.inMemory(); settingsManager.setProjectTrusted(trusted);
    const loader = new DefaultResourceLoader({ cwd: f.root, agentDir: path.join(f.root, 'isolated-agent'), settingsManager,
      noExtensions: true, noSkills, noPromptTemplates: true, noThemes: true, noContextFiles: true });
    const files = topics.map(topic => path.join(f.root, skillPath(f.root, topic)));
    for (const file of files) if (fs.existsSync(file)) fs.unlinkSync(file);
    await loader.reload();
    const ours = () => loader.getSkills().skills.filter(s => files.includes(s.filePath));
    assert.equal(ours().length, 0);
    topics.forEach((topic, i) => atomic(f.root, skillPath(f.root, topic), header(f.root, topic, descriptions[i]) + 'Check applicability before reuse.'));
    assert.equal(ours().length, 0, 'no silent mid-task resource injection');
    await loader.reload(); assert.equal(ours().length, expected);
    if (expected) assert.deepEqual(ours().map(s => s.description).sort(), [...descriptions].sort());
  }
});

test('runtime reports partial publication and lists each topic status accurately', async t => {
  const f = fixture(t, async job => {
    fs.writeFileSync(path.join(job.root, 'check.txt'), 'check passed');
    const observed = new Map(); readEvidence(job.root, 'check.txt', observed);
    const changes = [{ oldText: '', newText: 'Check inputs using check.txt.', reason: 'verified', disposition: 'eligible', changesScientificDecision: false, evidence: [{ path: 'check.txt', quote: 'check passed' }] }];
    return publish(job.root, job.run, job.catalog, { summary: 'Two independent topics', skills: [
      { topic: 'input-qc', description: 'Use for input QC.', changes },
      { topic: 'annotation', description: 'Use for annotation checks.', changes: [{ ...changes[0], disposition: 'hold' }] },
    ] }, observed);
  });
  fs.unlinkSync(path.join(f.root, HOME, 'config.json')); // Publication also honors default-on.
  await f.commands.get('sci-learn').handler('reflect independent topics', f.ctx); await f.control.wait();
  const [id] = fs.readdirSync(path.join(f.root, HOME, 'runs'));
  const result = JSON.parse(readManaged(f.root, `${HOME}/runs/${id}/result.json`));
  assert.equal(result.outcome, 'partial'); assert.equal(result.published, true);
  assert.deepEqual(result.skills.map(s => s.status), ['published', 'hold']);
  assert.ok(f.notices.some(([text]) => text.includes('input-qc: published') && text.includes('annotation: hold')));
});

test('empty append does not create a useless skill', t => {
  const f = fixture(t, async () => 'no_change');
  fs.writeFileSync(path.join(f.root, 'check.txt'), 'check passed');
  const observed = new Map(); readEvidence(f.root, 'check.txt', observed);
  const job = createJob(f.root, f.source, 'empty', 'task');
  const proposal = { summary: 'Nothing new', skills: [{ topic: 'input-qc', description: 'Use for input validation.', changes: [{ oldText: '', newText: '', reason: 'none', disposition: 'eligible', changesScientificDecision: false, evidence: [{ path: 'check.txt', quote: 'check passed' }] }] }] };
  assert.equal(publish(f.root, job.run, [], proposal, observed), 'no_change');
  assert.equal(readManaged(f.root, skillPath(f.root, 'input-qc')), null);
});
