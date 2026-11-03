import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionManager, createAgentSession, ModelRuntime, SettingsManager } from '@earendil-works/pi-coding-agent';
// Mutation-ablation module selection is test-only; production has no experiment flags.
const store = await import(process.env.SCI_TEST_LEARNING_STORE ?? '../dist/core/learning-store.js');
const learning = await import(process.env.SCI_TEST_LEARNING ?? '../dist/core/learning.js');
const { HOME, setEnabled, config, legacyNamespace, header, skillPath, legacySkillPath, snapshotSkills, atomic, readManaged, readEvidence, publish, rollback, parseProposal, applyChanges, managed } = store;
const { createJob, registerLearning, reflectionLoader } = learning;
const DESCRIPTION = 'Align sample metadata. Use when joining specimen tables by sample_id.';
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = text => ({ role: 'assistant', content: [{ type: 'text', text }], api: 'openai-responses', provider: 'openai', model: 'test', stopReason: 'stop', usage, timestamp: Date.now() });
const topicProposal = (topic = 'sample-alignment', newText = 'Join by sample_id; check uniqueness and unmatched rows. Source: checks.txt.') => ({ topic, description: DESCRIPTION, changes: [{ oldText: '', newText, reason: 'Checked schema', disposition: 'eligible', changesScientificDecision: false, evidence: [{ path: 'checks.txt', quote: 'sample_id unique; unmatched rows: 0' }] }] });
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sci-learning-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  setEnabled(root, true);
  const source = SessionManager.inMemory(root);
  source.appendMessage({ role: 'user', content: 'Validate sample alignment', timestamp: 1 });
  source.appendMessage(assistant('Validated against checks.txt.'));
  fs.writeFileSync(path.join(root, 'checks.txt'), 'sample_id unique; unmatched rows: 0\n');
  const job = createJob(root, source, 'delivery-1', 'Finished alignment. Evidence: checks.txt');
  const observed = new Map(); readEvidence(root, 'checks.txt', observed);
  const proposal = { summary: 'Use the checked key', skills: [topicProposal()] };
  const target = skillPath(root, 'sample-alignment');
  const ledger = () => JSON.parse(readManaged(root, `${job.run}/publication.json`));
  const publishNow = (catalog = job.catalog, readTopics = new Set()) => publish(root, job.run, catalog, proposal, observed, readTopics);
  return { root, source, job, observed, proposal, target, ledger, publishNow };
}
function harness(root, source) {
  const tools = new Map(), commands = new Map(), hooks = new Map(), notices = [];
  const pi = { registerTool(t) { tools.set(t.name, t); }, registerCommand(n, c) { commands.set(n, c); }, on(n, fn) { hooks.set(n, fn); }, getActiveTools() { return [...tools.keys()]; } };
  const ctx = { cwd: root, sessionManager: source, isProjectTrusted: () => true, isIdle: () => true, ui: { notify: (...args) => notices.push(args) }, modelRegistry: {}, model: undefined };
  return { pi, ctx, tools, commands, hooks, notices };
}

test('clone retains active history, compaction and context edits, excludes abandoned branch, leaves main unchanged', t => {
  const { root, source } = fixture(t);
  const anchor = source.getLeafId();
  source.appendMessage({ role: 'user', content: 'ABANDONED instruction', timestamp: 2 });
  source.branch(anchor);
  const kept = source.appendMessage({ role: 'user', content: 'CURRENT correction', timestamp: 3 });
  source.appendCompaction('Earlier verification summary', kept, 1000);
  source.appendContextEdit(kept, { content: 'CURRENT corrected context' });
  source.appendMessage(assistant('Final delivered result'));
  const leaf = source.getLeafId(), id = source.getSessionId(), entries = JSON.stringify(source.getEntries());
  const job = createJob(root, source, 'branch-snapshot', 'delivered');
  source.appendMessage({ role: 'user', content: 'LATER task', timestamp: 4 });
  const cloned = SessionManager.open(path.join(root, job.run, 'session.jsonl'));
  const context = JSON.stringify(cloned.buildSessionContext());
  assert.match(context, /CURRENT corrected context/); assert.match(context, /Earlier verification summary/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, job.run, 'snapshot.jsonl'), 'utf8'), /ABANDONED|LATER task/);
  assert.notEqual(cloned.getSessionId(), id); assert.equal(job.sourceLeaf, leaf);
  assert.equal(JSON.stringify(source.getEntries().slice(0, -1)), entries); assert.equal(source.getSessionId(), id);
});

test('delivery key deduplicates even when main history advances', t => {
  const { root, source } = fixture(t); source.appendMessage(assistant('Another response'));
  assert.equal(createJob(root, source, 'delivery-1', 'duplicate'), undefined);
});

test('eligible topic publishes a reversible owned skill with a specific description', t => {
  const f = fixture(t);
  assert.equal(f.publishNow(), 'published');
  assert.ok(readManaged(f.root, f.target).startsWith(header(f.root, 'sample-alignment', DESCRIPTION)));
  assert.equal(f.ledger().skills[0].baseline, null);
  rollback(f.root, f.job.id);
  assert.equal(readManaged(f.root, f.target), null);
});

test('empty proposal does not create an all-purpose project skill', t => {
  const f = fixture(t); f.proposal.skills = [];
  assert.equal(f.publishNow(), 'no_change');
  assert.equal(snapshotSkills(f.root).length, 0);
});

test('uncertainty or scientific change holds that skill as a unit', t => {
  const f = fixture(t), change = f.proposal.skills[0].changes[0];
  change.disposition = 'hold'; assert.equal(f.publishNow(), 'hold');
  change.disposition = 'eligible'; change.changesScientificDecision = true;
  assert.equal(f.publishNow(), 'hold'); assert.equal(readManaged(f.root, f.target), null);
});

test('unread or fabricated evidence never publishes', t => {
  const f = fixture(t);
  assert.equal(publish(f.root, f.job.run, [], f.proposal, new Map()), 'failed');
  assert.match(f.ledger().skills[0].error, /not read/);
  f.proposal.skills[0].changes[0].evidence[0].quote = 'This check never happened';
  assert.equal(f.publishNow(), 'failed'); assert.match(f.ledger().skills[0].error, /does not match/);
  assert.equal(readManaged(f.root, f.target), null);
});

test('evidence drift after read prevents publication', t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.root, 'checks.txt'), 'CORRECTION: failed\n');
  assert.equal(f.publishNow(), 'failed'); assert.match(f.ledger().skills[0].error, /Evidence changed/);
  assert.equal(readManaged(f.root, f.target), null);
});

test('concurrent creation or manual skill changes prevent stale overwrite', t => {
  const f = fixture(t); atomic(f.root, f.target, header(f.root, 'sample-alignment', DESCRIPTION) + 'New manual finding');
  assert.equal(f.publishNow(), 'failed'); assert.match(f.ledger().skills[0].error, /baseline changed/);
  assert.match(readManaged(f.root, f.target), /New manual finding/);
});

test('publisher lock fails closed without stealing another publisher lock', t => {
  const f = fixture(t); atomic(f.root, `${HOME}/publish.lock`, 'another publisher');
  assert.throws(() => f.publishNow(), /EEXIST/);
  assert.equal(readManaged(f.root, `${HOME}/publish.lock`), 'another publisher');
  assert.equal(readManaged(f.root, f.target), null);
});

test('disabled learning cannot publish an in-flight proposal', t => {
  const f = fixture(t); setEnabled(f.root, false);
  assert.throws(() => f.publishNow(), /disabled/);
});

test('patching is local, rejects duplicate matches/overlaps and limits each skill body', () => {
  const make = (oldText, newText) => ({ oldText, newText });
  assert.equal(applyChanges('abc def', { changes: [make('abc', 'A'), make('def', 'D')] }), 'A D');
  assert.throws(() => applyChanges('a a', { changes: [make('a', 'b')] }), /unique/);
  assert.throws(() => applyChanges('abcdef', { changes: [make('abc', 'x'), make('bcde', 'y')] }), /Overlapping/);
  assert.throws(() => applyChanges('x'.repeat(24000), { changes: [make('', 'y')] }), /budget/);
  assert.equal(applyChanges('already present', { changes: [make('', 'already present')] }), 'already present');
  assert.equal(applyChanges('', { changes: [make('', 'new'), make('', 'new')] }), '\nnew\n');
});

test('read tool denies escapes, private paths, outside/private symlinks, binary and oversized files', t => {
  const { root } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-outside-')); t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'secret'), 'secret');
  fs.symlinkSync(path.join(outside, 'secret'), path.join(root, 'escape'));
  fs.symlinkSync(path.join(root, HOME, 'config.json'), path.join(root, 'private'));
  for (const file of ['../secret', '/etc/passwd', '.sci/learning/config.json', 'escape', 'private']) assert.throws(() => readEvidence(root, file, new Map()));
  fs.writeFileSync(path.join(root, 'binary'), Buffer.from([1, 0, 3]));
  fs.writeFileSync(path.join(root, 'big'), 'a'.repeat(128 * 1024 + 1));
  assert.throws(() => readEvidence(root, 'binary', new Map()), /Binary/);
  assert.throws(() => readEvidence(root, 'big', new Map()), /128 KiB/);
});

test('managed symlink paths are denied and enabling preserves existing manual skills as read-only', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.root, 'elsewhere'));
  fs.symlinkSync(path.join(f.root, 'elsewhere'), path.join(f.root, 'linked'));
  assert.throws(() => managed(f.root, 'linked/file'), /Symlink/);
  assert.throws(() => managed(f.root, '../outside'), /Unsafe/);
  fs.unlinkSync(path.join(f.root, HOME, 'config.json'));
  atomic(f.root, f.target, 'User-authored skill');
  setEnabled(f.root, true);
  assert.equal(snapshotSkills(f.root)[0].writable, false);
  assert.equal(f.publishNow(snapshotSkills(f.root), new Set(['sample-alignment'])), 'failed');
  assert.equal(readManaged(f.root, f.target), 'User-authored skill');
});

test('rollback cannot overwrite newer/manual changes', t => {
  const f = fixture(t); f.publishNow(); atomic(f.root, f.target, 'Newer');
  assert.throws(() => rollback(f.root, f.job.id), /newer\/manual/);
});

test('malformed proposals, unsafe topic identifiers and duplicate topics are rejected', t => {
  assert.throws(() => parseProposal('{"summary":"ok","skills":[],"command":"rm"}'), /schema/);
  assert.throws(() => parseProposal('not JSON'));
  assert.deepEqual(parseProposal('```json\n{"summary":"none","skills":[]}\n```'), { summary: 'none', skills: [] });
  const f = fixture(t);
  for (const topic of ['../escape', 'UpperCase', 'a--b', 'x'.repeat(41)]) {
    f.proposal.skills[0].topic = topic;
    assert.throws(() => parseProposal(JSON.stringify(f.proposal)), /schema/);
  }
  assert.throws(() => skillPath(f.root, 'legacy'), /reserved/);
  f.proposal.skills = [topicProposal(), topicProposal()]; assert.throws(() => f.publishNow(), /Duplicate topics/);
});

test('registration waits for settlement, includes final handoff and never switches main session', async t => {
  const { root, source } = fixture(t), h = harness(root, source); let seen;
  const original = source.getSessionId();
  const control = registerLearning(h.pi, { run: async job => { seen = fs.readFileSync(path.join(root, job.run, 'snapshot.jsonl'), 'utf8'); return 'no_change'; } });
  await h.tools.get('sci_delivery').execute('handoff', { delivery: 'Actual checks in checks.txt' }, new AbortController().signal, undefined, h.ctx);
  assert.equal(seen, undefined); source.appendMessage(assistant('FINAL HANDOFF INCLUDED'));
  h.hooks.get('agent_settled')({ aborted: false }, h.ctx); await control.wait();
  assert.match(seen, /FINAL HANDOFF INCLUDED/); assert.equal(source.getSessionId(), original);
  assert.equal(h.hooks.has('resources_discover'), false); assert.ok(h.notices.some(([text]) => text.includes('no_change')));
});

test('aborted runs, unregistered idle and later settlements do not trigger reflection', async t => {
  const { root, source } = fixture(t), h = harness(root, source); let calls = 0;
  const control = registerLearning(h.pi, { run: async () => { calls++; return 'no_change'; } });
  h.hooks.get('agent_settled')({ aborted: false }, h.ctx);
  await h.tools.get('sci_delivery').execute('abort', { delivery: 'x' }, undefined, undefined, h.ctx);
  h.hooks.get('agent_settled')({ aborted: true }, h.ctx); h.hooks.get('agent_settled')({ aborted: false }, h.ctx);
  await control.wait(); assert.equal(calls, 0);
});

test('shutdown cancellation records background failure', async t => {
  const { root, source } = fixture(t), h = harness(root, source);
  const control = registerLearning(h.pi, { run: async (_job, _ctx, signal) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(new Error('cancelled'));
    else signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  }) });
  await h.commands.get('sci-learn').handler('reflect test', h.ctx);
  await h.hooks.get('session_shutdown')(); await control.wait();
  const results = fs.readdirSync(path.join(root, HOME, 'runs')).map(id => JSON.parse(fs.readFileSync(path.join(root, HOME, 'runs', id, 'result.json'), 'utf8')));
  assert.ok(results.some(r => r.status === 'failed' && /cancelled/.test(r.error)));
});

test('isolated loader and real SDK expose only the two read tools, no plugins or main tool permissions', async t => {
  const { root, job } = fixture(t), loader = reflectionLoader();
  assert.equal(loader.getExtensions().extensions.length, 0); assert.equal(loader.getSkills().skills.length, 0);
  assert.equal(loader.getAgentsFiles().agentsFiles.length, 0);
  const modelRuntime = await ModelRuntime.create({ authPath: path.join(root, 'isolated-auth.json'), modelsPath: null, modelsStorePath: path.join(root, 'models-cache.json'), allowModelNetwork: false, refreshOnCreate: false });
  const { session } = await createAgentSession({ cwd: root, agentDir: path.join(root, 'agent'), resourceLoader: loader, modelRuntime,
    settingsManager: SettingsManager.inMemory(), sessionManager: SessionManager.open(path.join(root, job.run, 'session.jsonl')),
    tools: ['evidence_read', 'skill_read'], customTools: ['evidence_read', 'skill_read'].map(name => ({ name, label: name, description: 'Read test fixture', parameters: { type: 'object', properties: {} }, execute: async () => ({ content: [{ type: 'text', text: 'test' }], details: undefined }) })),
  });
  try {
    assert.deepEqual(session.getActiveToolNames().sort(), ['evidence_read', 'skill_read']);
    assert.match(JSON.stringify(session.messages), /Validate sample alignment/); assert.match(session.systemPrompt, /reflection branch/);
  } finally { session.dispose(); }
});

test('one delivery creates multiple separate analysis skills with independent descriptions', t => {
  const f = fixture(t);
  const second = topicProposal('single-cell-qc', 'Verify QC input semantics before reuse; evidence checks.txt.');
  second.description = 'Project single-cell QC. Use when filtering cells or checking QC input semantics.';
  f.proposal.skills.push(second); assert.equal(f.publishNow(), 'published');
  const catalog = snapshotSkills(f.root); assert.equal(catalog.length, 2);
  assert.deepEqual(catalog.map(s => s.topic), ['sample-alignment', 'single-cell-qc']);
  assert.equal(catalog[0].description, DESCRIPTION); assert.equal(catalog[1].description, second.description);
  assert.doesNotMatch(catalog[0].body, /QC input/); assert.doesNotMatch(catalog[1].body, /Join by/);
  assert.equal(readManaged(f.root, legacySkillPath(f.root)), null);
});

test('project catalog can exceed the per-delivery skill limit and total body budget', t => {
  const f = fixture(t);
  for (let i = 0; i < 12; i++) atomic(f.root, skillPath(f.root, `analysis-${i}`), header(f.root, `analysis-${i}`, `Use for analysis type ${i}.`) + 'x'.repeat(2200));
  const catalog = snapshotSkills(f.root);
  assert.equal(catalog.length, 12); assert.ok(catalog.reduce((sum, s) => sum + s.body.length, 0) > 24000);
  f.proposal.skills = [topicProposal('analysis-3', 'Checked local input condition.')];
  assert.equal(f.publishNow(catalog, new Set(['analysis-3'])), 'published');
  assert.equal(snapshotSkills(f.root).length, 12);
});

test('existing topic must be read before minimal update and is not duplicated', t => {
  const f = fixture(t); f.publishNow(); const catalog = snapshotSkills(f.root);
  f.proposal.skills[0].changes[0].oldText = 'Join by sample_id'; f.proposal.skills[0].changes[0].newText = 'Align by sample_id';
  assert.equal(f.publishNow(catalog), 'failed'); assert.match(f.ledger().skills[0].error, /skill_read/);
  assert.equal(f.publishNow(catalog, new Set(['sample-alignment'])), 'published');
  assert.equal(snapshotSkills(f.root).length, 1); assert.match(readManaged(f.root, f.target), /Align by/);
});

test('unrelated topic changes do not invalidate a targeted topic baseline', t => {
  const f = fixture(t); f.proposal.skills.push(topicProposal('single-cell-qc', 'Old QC guidance.')); f.publishNow();
  const catalog = snapshotSkills(f.root);
  atomic(f.root, skillPath(f.root, 'single-cell-qc'), header(f.root, 'single-cell-qc', DESCRIPTION) + 'Manual QC change');
  f.proposal.skills = [topicProposal('sample-alignment', 'New independent metadata check.')];
  assert.equal(f.publishNow(catalog, new Set(['sample-alignment'])), 'published');
  assert.match(readManaged(f.root, skillPath(f.root, 'single-cell-qc')), /Manual QC change/);
});

test('held or stale topic does not block an independent eligible topic; ledger reports partial', t => {
  const f = fixture(t); f.proposal.skills[0].changes[0].disposition = 'hold';
  f.proposal.skills.push(topicProposal('single-cell-qc', 'Independent QC check.'));
  assert.equal(f.publishNow(), 'partial'); assert.deepEqual(f.ledger().skills.map(s => s.status), ['hold', 'published']);
  assert.equal(readManaged(f.root, f.target), null);
  const catalog = snapshotSkills(f.root);
  f.proposal.skills[0].changes[0].disposition = 'eligible';
  atomic(f.root, skillPath(f.root, 'single-cell-qc'), 'Manual newer QC');
  assert.equal(f.publishNow(catalog, new Set(['single-cell-qc'])), 'partial');
  assert.deepEqual(f.ledger().skills.map(s => s.status), ['published', 'failed']);
  assert.match(readManaged(f.root, skillPath(f.root, 'single-cell-qc')), /Manual newer QC/);
});

test('rollback selects one topic and leaves other skills unchanged', t => {
  const f = fixture(t); f.proposal.skills.push(topicProposal('single-cell-qc', 'QC check.')); f.publishNow();
  assert.throws(() => rollback(f.root, f.job.id), /Specify one/);
  const other = readManaged(f.root, skillPath(f.root, 'single-cell-qc'));
  rollback(f.root, f.job.id, 'sample-alignment'); assert.equal(readManaged(f.root, f.target), null);
  assert.equal(readManaged(f.root, skillPath(f.root, 'single-cell-qc')), other);
});

test('legacy config and mixed skill remain readable, untouched and individually reversible', t => {
  const f = fixture(t), oldPath = legacySkillPath(f.root);
  atomic(f.root, `${HOME}/config.json`, JSON.stringify({ enabled: true, skill: oldPath }));
  atomic(f.root, oldPath, 'Legacy mixed guidance');
  assert.deepEqual(config(f.root), { enabled: true });
  assert.equal(snapshotSkills(f.root)[0].writable, false);
  assert.equal(f.publishNow(snapshotSkills(f.root)), 'published');
  assert.equal(readManaged(f.root, oldPath), 'Legacy mixed guidance');
  setEnabled(f.root, true); assert.deepEqual(JSON.parse(readManaged(f.root, `${HOME}/config.json`)), { enabled: true });
  atomic(f.root, `${f.job.run}/publication.json`, JSON.stringify({ target: oldPath, baseline: 'Earlier legacy', next: 'Legacy mixed guidance' }));
  rollback(f.root, f.job.id); assert.equal(readManaged(f.root, oldPath), 'Earlier legacy');
});

test('topic directory and frontmatter use only the name, with no root-dependent prefix', t => {
  const f = fixture(t); f.publishNow();
  assert.equal(f.target, '.pi/skills/sample-alignment/SKILL.md');
  assert.equal(skillPath('/another/project', 'sample-alignment'), f.target);
  assert.match(readManaged(f.root, f.target), /^---\nname: sample-alignment\n/);
  assert.doesNotMatch(readManaged(f.root, f.target), /sci-project-/);
  assert.deepEqual(JSON.parse(readManaged(f.root, `${HOME}/config.json`)), { enabled: true });
});

test('old prefixed topic and conflicting short name remain read-only until reconciled', t => {
  const f = fixture(t), topic = 'sample-alignment';
  const oldName = `${legacyNamespace(f.root)}-${topic}`;
  const oldTarget = `.pi/skills/${oldName}/SKILL.md`;
  const oldContent = header(f.root, topic, DESCRIPTION).replace(`name: ${topic}\n`, `name: ${oldName}\n`) + 'Old guidance';
  atomic(f.root, `${HOME}/config.json`, JSON.stringify({ enabled: true, namespace: legacyNamespace(f.root) }));
  atomic(f.root, oldTarget, oldContent);
  assert.deepEqual(config(f.root), { enabled: true });
  let catalog = snapshotSkills(f.root);
  assert.equal(catalog[0].topic, topic); assert.equal(catalog[0].writable, false);
  assert.equal(f.publishNow(catalog, new Set([topic])), 'failed');
  assert.equal(readManaged(f.root, f.target), null);
  atomic(f.root, f.target, header(f.root, topic, DESCRIPTION) + 'Short-name content');
  catalog = snapshotSkills(f.root);
  assert.equal(catalog.length, 2); assert.ok(catalog.every(s => !s.writable));
  assert.equal(f.publishNow(catalog, new Set([topic])), 'failed');
  assert.equal(readManaged(f.root, oldTarget), oldContent);
  assert.match(readManaged(f.root, f.target), /Short-name content/);
});

test('old prefixed publication rolls back its original file, never the short-name file', t => {
  const f = fixture(t), topic = 'sample-alignment';
  const oldTarget = `.pi/skills/${legacyNamespace(f.root)}-${topic}/SKILL.md`;
  atomic(f.root, oldTarget, 'Old published content');
  atomic(f.root, f.target, 'Unrelated short-name content');
  atomic(f.root, `${f.job.run}/publication.json`, JSON.stringify({ skills: [{ topic, target: oldTarget, baseline: 'Old baseline', next: 'Old published content', status: 'published' }] }));
  rollback(f.root, f.job.id, topic);
  assert.equal(readManaged(f.root, oldTarget), 'Old baseline');
  assert.equal(readManaged(f.root, f.target), 'Unrelated short-name content');
});

test('human-authored topic collision is catalogued read-only, never overwritten', t => {
  const f = fixture(t); atomic(f.root, f.target, 'Human-authored manual skill');
  const catalog = snapshotSkills(f.root); assert.equal(catalog[0].writable, false);
  assert.equal(f.publishNow(catalog, new Set(['sample-alignment'])), 'failed');
  assert.match(readManaged(f.root, f.target), /Human-authored/);
});

test('delivery captures all topic baselines, independent of later filesystem changes', t => {
  const f = fixture(t); f.proposal.skills.push(topicProposal('single-cell-qc', 'QC snapshot')); f.publishNow();
  const job = createJob(f.root, f.source, 'catalog-snapshot', 'Another task');
  atomic(f.root, f.target, 'Later file contents');
  assert.equal(job.catalog.length, 2); assert.match(job.catalog.find(s => s.topic === 'sample-alignment').body, /Join by/);
  const saved = JSON.parse(readManaged(f.root, `${job.run}/job.json`));
  assert.deepEqual(saved.catalog, job.catalog);
});
