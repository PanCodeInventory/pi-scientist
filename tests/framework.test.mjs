import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Check } from 'typebox/value';
import scientist from '../dist/index.js';
import { registerImplementTool } from '../dist/tools/implement.js';
import { registerReviewTool } from '../dist/tools/review.js';
import { registerScoutTool } from '../dist/tools/scout.js';
import { registerScientificDialogue } from '../dist/dialogue/index.js';
import { buildDecisionLog, prepareQuestionArguments } from '../dist/dialogue/contract.js';
import { showScientificDialog, showFallbackDialog } from '../dist/dialogue/ui.js';
import { discoverScientists } from '../dist/core/agents.js';
import { FIGURE_STANDARDS_PATH, SCIENTIST_CONVENTIONS } from '../dist/core/conventions.js';
import { SCIENTIST_ENFORCEMENT, injectScientistPrinciples } from '../dist/core/enforcement.js';
import { agentToolResult } from '../dist/tools/shared.js';

function harness() {
  const tools = new Map(), commands = new Map(), hooks = new Map(), messages = [];
  const api = {
    registerTool: t => tools.set(t.name, t),
    registerCommand: (name, command) => commands.set(name, command),
    on: (name, fn) => { const callbacks = hooks.get(name) ?? []; callbacks.push(fn); hooks.set(name, callbacks); },
    setActiveTools() { throw new Error('Must not override user tool selection'); },
    sendUserMessage: (...args) => messages.push(args),
  };
  return { api, tools, commands, hooks, messages };
}
const usage = { input: 10, output: 4, cacheRead: 2, cacheWrite: 0, cost: 0.01, contextTokens: 16, turns: 1 };
const modelUsage = { input: 10, output: 4, cacheRead: 2, cacheWrite: 0, totalTokens: 16, cost: { input: 0.006, output: 0.004, cacheRead: 0, cacheWrite: 0, total: 0.01 } };
function result(agent = 'worker', text = 'Completed and verified.', overrides = {}) {
  return { agent, agentSource: 'user', task: 'task', exitCode: 0, stderr: '', usage, modelUsage,
    messages: [{ role: 'assistant', content: [{ type: 'text', text }], stopReason: 'stop' }], ...overrides };
}
const context = { cwd: process.cwd(), mode: 'rpc', hasUI: true, ui: {} };
const execute = (tool, params, ctx = context, signal = new AbortController().signal) => tool.execute('test', params, signal, undefined, ctx);

// No calls to a model or external service are made by this suite.
test('extension preserves tool selection and separates conventions from strategy', async () => {
  const h = harness(); scientist(h.api);
  assert.deepEqual([...h.tools.keys()].sort(), ['ask_user_question', 'sci_dispatch', 'sci_implement', 'sci_librarian', 'sci_logs', 'sci_review', 'sci_scout', 'sci_tasks']);
  const [hook] = h.hooks.get('before_agent_start');
  const out = await hook({ systemPrompt: 'base' }, { hasUI: false });
  assert.match(out.systemPrompt, /<scientist-conventions>/);
  assert.match(out.systemPrompt, /<scientist-principles>/);
  assert.doesNotMatch(out.systemPrompt, /<scientific-contract-state>|<scientist-enforcement>/);
  assert.equal(h.hooks.has('tool_call'), false);
  assert.equal(h.hooks.has('turn_start'), false);
  const resources = await h.hooks.get('resources_discover')[0]();
  assert.ok(fs.existsSync(resources.skillPaths[0]));
  assert.ok(fs.existsSync(FIGURE_STANDARDS_PATH));
});

test('child extension registers skills but no orchestration tools or dialogue hooks', () => {
  const prior = process.env.SCIENTIST_SUBAGENT;
  process.env.SCIENTIST_SUBAGENT = '1';
  try {
    const h = harness(); scientist(h.api);
    assert.equal(h.tools.size, 0); assert.equal(h.commands.size, 0);
    assert.deepEqual([...h.hooks.keys()], ['resources_discover']);
  } finally { if (prior === undefined) delete process.env.SCIENTIST_SUBAGENT; else process.env.SCIENTIST_SUBAGENT = prior; }
});

test('legacy no-enforcement flag skips strategy, not user conventions', async () => {
  const prior = process.env.SCIENTIST_NO_ENFORCEMENT;
  process.env.SCIENTIST_NO_ENFORCEMENT = '1';
  try {
    const h = harness(); scientist(h.api);
    const out = await h.hooks.get('before_agent_start')[0]({ systemPrompt: 'base' }, { hasUI: false });
    assert.match(out.systemPrompt, /<scientist-conventions>/);
    assert.doesNotMatch(out.systemPrompt, /<scientist-principles>/);
  } finally { if (prior === undefined) delete process.env.SCIENTIST_NO_ENFORCEMENT; else process.env.SCIENTIST_NO_ENFORCEMENT = prior; }
});

test('principles injection is idempotent and much smaller than old protocol', () => {
  const once = injectScientistPrinciples('base');
  assert.equal(injectScientistPrinciples(once), once);
  assert.ok(SCIENTIST_ENFORCEMENT.length < 4000);
  for (const required of ['scripts/stages/', 'scripts/config/', 'results/plots/', 'README.md', 'manifest.jsonl', 'Publication/', 'PNG', 'PDF']) {
    assert.ok(SCIENTIST_CONVENTIONS.includes(required), required);
  }
});

test('every specialist receives conventions; reviewer has no write/edit tool', () => {
  const { agents } = discoverScientists();
  assert.equal(agents.length, 4);
  for (const agent of agents) assert.match(agent.systemPrompt, /<scientist-conventions>/);
  const reviewer = agents.find(a => a.name === 'reviewer');
  assert.ok(!reviewer.tools.includes('write')); assert.ok(!reviewer.tools.includes('edit'));
  assert.match(reviewer.systemPrompt, /Do not edit files/);
});

test('implement starts exactly one worker without requiring a plan or review', async () => {
  const h = harness(), calls = [];
  registerImplementTool(h.api, async (...args) => { calls.push(args); return result(); });
  const out = await execute(h.tools.get('sci_implement'), { task: 'Inspect input and create 01_Test/results/tables/out.tsv' });
  assert.equal(calls.length, 1); assert.equal(calls[0][2], 'worker');
  assert.match(calls[0][3], /No persistent plan is required/);
  assert.match(calls[0][3], /no automatic reviewer/);
  assert.equal(out.usage, modelUsage);
});

test('optional legacy plan path resolves against cwd and is not mutated by the tool', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scientist-plan-test-'));
  const file = path.join(dir, 'plan.md'), original = '## Todolist\n- [ ] P01: test\n'; fs.writeFileSync(file, original);
  try {
    const h = harness(), calls = [];
    registerImplementTool(h.api, async (...args) => { calls.push(args); return result(); });
    await execute(h.tools.get('sci_implement'), { planFile: '@plan.md', cwd: dir });
    assert.match(calls[0][3], /next unchecked step only/);
    assert.ok(calls[0][3].includes(file));
    assert.equal(calls[0][4].workDir, dir);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('empty delegation and invalid plan fail before spawning', async () => {
  const h = harness(); let calls = 0;
  registerImplementTool(h.api, async () => { calls++; return result(); });
  const tool = h.tools.get('sci_implement');
  await assert.rejects(execute(tool, {}), /Provide a task/);
  await assert.rejects(execute(tool, { task: '   ' }), /Provide a task/);
  await assert.rejects(execute(tool, { planFile: '/nonexistent/scientist/plan.md' }), /Plan file not found/);
  assert.equal(calls, 0);
});

test('review works without a plan and never advances a checklist', async () => {
  const h = harness(), calls = [];
  registerReviewTool(h.api, async (...args) => { calls.push(args); return result('reviewer', 'NEEDS FIX: wrong experimental unit'); });
  const out = await execute(h.tools.get('sci_review'), { task: 'Review donor pairing in 03_DE/scripts/stages/de.py' });
  assert.equal(calls.length, 1); assert.equal(calls[0][2], 'reviewer');
  assert.match(calls[0][3], /Do not edit files, update checkboxes/);
  assert.match(out.content[0].text, /NEEDS FIX/);
  assert.doesNotMatch(out.content[0].text, /All Todolist items/);
});

test('scout receives the requested depth and runtime limit', async () => {
  const h = harness(), calls = [];
  registerScoutTool(h.api, async (...args) => { calls.push(args); return result('scout'); });
  await execute(h.tools.get('sci_scout'), { task: 'Read metadata', thoroughness: 'quick', timeoutSeconds: 30 });
  assert.match(calls[0][3], /Inspection depth: quick/);
  assert.equal(calls[0][4].timeoutSeconds, 30);
});

test('subprocess failures, truncated completions and declared blocking are not successes', () => {
  for (const stopReason of ['error', 'aborted', 'length', 'toolUse']) assert.throws(() => agentToolResult(result('worker', 'partial', { stopReason })));
  assert.throws(() => agentToolResult(result('worker', '', { exitCode: 1, stderr: 'failed' })), /failed/);
  assert.throws(() => agentToolResult(result('worker', '## ANALYSIS TERMINATED\nMissing input')));
  assert.throws(() => agentToolResult(result('worker', 'BLOCKED: missing donor IDs')));
  assert.doesNotThrow(() => agentToolResult(result('reviewer', 'NEEDS FIX: design problem')));
});

test('only final assistant text is returned; large output is bounded with a full-text path', () => {
  const data = result('worker', 'x'.repeat(60000));
  data.messages.unshift({ role: 'assistant', content: [{ type: 'text', text: 'intermediate history' }] });
  const out = agentToolResult(data), text = out.content[0].text;
  assert.ok(text.length < 52000); assert.doesNotMatch(text, /intermediate history/);
  const file = text.match(/Full output: (.+)\]/)[1];
  try { assert.equal(fs.readFileSync(file, 'utf8').length, 60000); }
  finally { fs.rmSync(path.dirname(file), { recursive: true, force: true }); }
});

test('question schema accepts only a question, without a contract ceremony', () => {
  const h = harness(); registerScientificDialogue(h.api);
  const tool = h.tools.get('ask_user_question');
  assert.ok(Check(tool.parameters, { question: '主对比是 A vs B 吗？' }));
  for (const field of ['decisionId', 'dependsOn', 'finalizesContract', 'category', 'evidence']) assert.ok(!(field in tool.parameters.properties));
  assert.equal(h.hooks.size, 0);
});

test('normal question, custom answer and cancellation preserve intent', async () => {
  const h = harness(); registerScientificDialogue(h.api);
  const tool = h.tools.get('ask_user_question');
  const opts = { question: 'Primary contrast?', options: [{ label: 'A vs B', value: 'a_b' }], allowCustom: false };
  let out = await execute(tool, opts, { ...context, ui: { select: async (_title, choices) => choices[0] } });
  assert.equal(out.details.value, 'a_b'); assert.equal(out.details.cancelled, false);
  assert.ok(!('stateEvent' in out.details));
  out = await execute(tool, { question: 'Which contrast?' }, { ...context, ui: { input: async () => 'A vs C' } });
  assert.equal(out.details.answer, 'A vs C');
  out = await execute(tool, opts, { ...context, ui: { select: async () => undefined } });
  assert.equal(out.details.cancelled, true); assert.equal(out.details.answer, null);
  assert.match(out.content[0].text, /Do not infer consent/);
});

test('headless and pre-aborted questions fail clearly, without fabricated answers', async () => {
  const h = harness(); registerScientificDialogue(h.api); const tool = h.tools.get('ask_user_question');
  await assert.rejects(execute(tool, { question: 'A or B?' }, { ...context, mode: 'print', hasUI: false }), /Ask this question in the assistant response/);
  await assert.rejects(execute(tool, { question: '   ' }), /must not be blank/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(execute(tool, { question: 'A or B?' }, context, abort.signal), /abort/i);
});

test('legacy question conversion retains explanation but drops workflow-only fields', () => {
  const next = prepareQuestionArguments({ question: 'Method?', decisionId: 'method', category: 'method', dependsOn: ['goal'], finalizesContract: true,
    recommendation: 'pseudobulk', whyItMatters: 'Donors are replicates', evidence: [{ claim: '3 donors', reference: 'obs.donor' }],
    options: [{ label: 'yes', confirmsContract: true }] });
  assert.equal(next.recommendation.value, 'pseudobulk');
  assert.match(next.briefing, /Donors are replicates/); assert.match(next.briefing, /obs.donor/);
  assert.ok(!('decisionId' in next)); assert.ok(!('confirmsContract' in next.options[0]));
});

function entry(details) { return { type: 'message', message: { role: 'toolResult', toolName: 'ask_user_question', details } }; }
test('on-demand decision history supports old results and only the supplied branch', () => {
  const a = entry({ question: 'Contrast?', answer: 'A vs B', cancelled: false });
  const b = entry({ answer: 'pseudobulk', stateEvent: { version: 1, confirmed: true, decision: { question: 'Method?', answer: 'pseudobulk' } } });
  const cancelled = entry({ question: 'Change?', answer: null, cancelled: true });
  const log = buildDecisionLog([a, b, cancelled, null, {}]);
  assert.match(log, /A vs B/); assert.match(log, /Method\?/); assert.doesNotMatch(log, /Change\?/);
  assert.doesNotMatch(buildDecisionLog([a]), /pseudobulk/);
  assert.match(buildDecisionLog([]), /No recorded answers/);
});

test('fallback question displays optional principles without requiring a recommendation', async () => {
  let title;
  const selection = await showFallbackDialog({ question: 'Which unit?', principles: 'Donors, not cells', options: [{ label: 'donor' }] },
    { ...context, ui: { select: async (t, choices) => { title = t; return choices[0]; } } });
  assert.match(title, /Donors, not cells/); assert.equal(selection.value, 'donor');
});

test('report and publication commands do not require a new Task or invoke a pipeline', async () => {
  const h = harness(); scientist(h.api);
  await h.commands.get('generate-report').handler('Only the DE results', context);
  const [prompt, options] = h.messages.at(-1);
  assert.match(prompt, /不是前置条件/); assert.match(prompt, /Only the DE results/);
  assert.equal(options.deliverAs, 'followUp');
  await h.commands.get('publication').handler('Figure 1', context);
  assert.match(h.messages.at(-1)[0], /一图一 notebook/);
  assert.match(h.messages.at(-1)[0], /无需 Task、Scout/);
});

test('TUI question overlay renders without recommendation and cleans up on abort', async () => {
  const abort = new AbortController();
  let component;
  const identity = t => t;
  const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: identity };
  const tui = { terminal: { rows: 40, columns: 100 }, requestRender() {} };
  const ctx = { ...context, mode: 'tui', ui: { custom: async (factory) => new Promise(resolve => {
    component = factory(tui, theme, { matches: () => false }, resolve);
    const lines = component.render(100);
    assert.ok(lines.some(line => line.includes('Which contrast?')));
    queueMicrotask(() => abort.abort());
  }) } };
  const selection = await showScientificDialog({ question: 'Which contrast?', options: [{ label: 'A vs B' }] }, ctx, abort.signal);
  assert.equal(selection, null); component.dispose();
});
