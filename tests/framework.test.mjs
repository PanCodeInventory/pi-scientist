import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Check } from 'typebox/value';
import scientist from '../dist/index.js';
import { registerScientificDialogue } from '../dist/dialogue/index.js';
import { buildDecisionLog, prepareQuestionArguments } from '../dist/dialogue/contract.js';
import { showScientificDialog, showFallbackDialog } from '../dist/dialogue/ui.js';
import os from 'node:os';
import { diffAgents, parseAgentList, registerHerdrWatch } from '../dist/core/herdr-watch.js';
import path from 'node:path';
import { SCIENTIST_CONVENTIONS, injectScientistConventions } from '../dist/core/conventions.js';
import { SCIENTIST_ENFORCEMENT, injectScientistPrinciples } from '../dist/core/enforcement.js';

function harness() {
  const tools = new Map(), commands = new Map(), hooks = new Map(), messages = [];
  const api = {
    registerTool: t => tools.set(t.name, t),
    registerCommand: (name, command) => commands.set(name, command),
    on: (name, fn) => { const callbacks = hooks.get(name) ?? []; callbacks.push(fn); hooks.set(name, callbacks); },
    setActiveTools() { throw new Error('Must not override user tool selection'); },
    sendUserMessage: (...args) => messages.push(args),
    sendMessage: (...args) => messages.push(['__sendMessage__', ...args]),
  };
  return { api, tools, commands, hooks, messages };
}
const context = { cwd: process.cwd(), mode: 'rpc', hasUI: true, ui: {} };
const execute = (tool, params, ctx = context, signal = new AbortController().signal) => tool.execute('test', params, signal, undefined, ctx);

// No calls to a model or external service are made by this suite.
test('extension preserves tool selection and separates conventions from strategy', async () => {
  const h = harness(); scientist(h.api);
  assert.deepEqual([...h.tools.keys()].sort(), ['ask_user_question', 'sci_delivery', 'sci_logs']);
  assert.deepEqual([...h.commands.keys()].sort(), ['generate-report', 'publication', 'reflect', 'sci-learn', 'science-contract']);
  const [hook] = h.hooks.get('before_agent_start');
  const event = { systemPromptOptions: { sections: { unrelated: 'keep me' } } };
  assert.equal(await hook(event), undefined, 'must not force a complete prompt replacement');
  const sections = event.systemPromptOptions.sections;
  assert.match(sections['scientist-conventions'], /linear imperative research scripting/);
  assert.match(sections['scientist-principles'], /Understand the research question/);
  const once = { ...sections };
  await hook(event);
  assert.deepEqual(sections, once);
  assert.equal(sections.unrelated, 'keep me');
  assert.equal(h.hooks.has('tool_call'), false);
  assert.equal(h.hooks.has('turn_start'), false);
  assert.equal(h.hooks.has('resources_discover'), false, 'skills must respect package resource filters');
  assert.ok(fs.existsSync(path.join(process.cwd(), 'skills/visualization/shared/figure-standards.md')));
});

test('legacy no-enforcement flag skips strategy, not user conventions', async () => {
  const prior = process.env.SCIENTIST_NO_ENFORCEMENT;
  process.env.SCIENTIST_NO_ENFORCEMENT = '1';
  try {
    const h = harness(); scientist(h.api);
    const event = { systemPromptOptions: { sections: { 'scientist-principles': 'old', unrelated: 'keep' } } };
    await h.hooks.get('before_agent_start')[0](event);
    assert.match(event.systemPromptOptions.sections['scientist-conventions'], /linear imperative research scripting/);
    assert.equal(event.systemPromptOptions.sections['scientist-principles'], undefined);
    assert.equal(event.systemPromptOptions.sections.unrelated, 'keep');
  } finally { if (prior === undefined) delete process.env.SCIENTIST_NO_ENFORCEMENT; else process.env.SCIENTIST_NO_ENFORCEMENT = prior; }
});

test('coding preferences are shared, compact, correctness-preserving and injected once', () => {
  const once = injectScientistConventions('base');
  assert.equal(injectScientistConventions(once), once);
  assert.equal(once, 'base' + SCIENTIST_CONVENTIONS);
  for (const required of ['linear imperative research scripting', 'Stata do-file', 'top to bottom',
    'function\n  wrappers, abstraction layers, loops', 'scientific correctness and data integrity',
    'column selections, merge, rename', 'read_excel', 'one line', 'nested logic',
    'Black/PEP 8-style forced multiline expansion', 'code examples in responses',
    'unless the user explicitly requests a different convention']) {
    assert.ok(SCIENTIST_CONVENTIONS.includes(required), required);
  }
});

test('principles injection is idempotent and much smaller than old protocol', () => {
  const once = injectScientistPrinciples('base');
  assert.equal(injectScientistPrinciples(once), once);
  assert.ok(SCIENTIST_ENFORCEMENT.length < 4000);
  for (const required of ['scripts/stages/', 'scripts/config/', 'results/plots/', 'README.md', 'manifest.jsonl', 'Publication/', 'visualization skill']) {
    assert.ok(SCIENTIST_CONVENTIONS.includes(required), required);
  }
});

test('herdr watch parses all named agents, ignores unnamed ones and tolerates garbage', () => {
  const out = JSON.stringify({ result: { agents: [
    { name: 'atlas-build', agent_status: 'working' },
    { name: 'atlas-review', agent_status: 'idle' },
    { agent: 'pi', agent_status: 'idle' },                 // unnamed: user-driven, not watched
    { name: 'nostatus' },
  ] } });
  const parsed = parseAgentList(out);
  assert.equal(parsed.get('atlas-build'), 'working');
  assert.equal(parsed.get('atlas-review'), 'idle');
  assert.equal(parsed.size, 2);
  assert.equal(parseAgentList('not json').size, 0);
  assert.equal(parseAgentList('{"error":{"code":"x"}}').size, 0);
});

test('herdr watch diffs settled/blocked/gone transitions without first-sight or duplicate noise', () => {
  const prev = new Map([['sci-a', 'working'], ['sci-b', 'idle'], ['sci-c', 'working']]);
  const next = new Map([['sci-a', 'idle'], ['sci-b', 'working'], ['sci-d', 'idle']]);
  const events = diffAgents(prev, next);
  assert.deepEqual(events, [{ name: 'sci-a', status: 'idle', previous: 'working' }, { name: 'sci-c', status: 'gone', previous: 'working' }]);
  // done/idle are one bucket: no repeat wake-up
  assert.deepEqual(diffAgents(new Map([['sci-a', 'idle']]), new Map([['sci-a', 'done']])), []);
  assert.deepEqual(diffAgents(new Map([['sci-a', 'working']]), new Map([['sci-a', 'blocked']])), [{ name: 'sci-a', status: 'blocked', previous: 'working' }]);
});

test('herdr watch stays inert without HERDR_ENV or explicit session-owned bindings', async () => {
  const prior = process.env.HERDR_ENV;
  delete process.env.HERDR_ENV;
  assert.equal(registerHerdrWatch(harness().api), undefined);
  process.env.HERDR_ENV = '1';
  let w;
  try {
    const h = harness();
    let calls = 0;
    w = registerHerdrWatch(h.api, { run: async () => { calls++; throw new Error('must not query global agents'); } });
    await w.poll();
    await h.hooks.get('session_start')[0]({}, { cwd: '/nonexistent', sessionManager: { getSessionId: () => 'unbound-session' } });
    await w.poll();
    assert.equal(calls, 0);
    assert.equal(h.messages.length, 0);
  } finally {
    w?.stop();
    if (prior === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = prior;
  }
});

test('question schema accepts only a question, without a contract ceremony', () => {
  const h = harness(); registerScientificDialogue(h.api);
  const tool = h.tools.get('ask_user_question');
  assert.ok(Check(tool.parameters, { question: '主对比是 A vs B 吗？' }));
  assert.equal(tool.exposure, 'model-only');
  assert.equal(tool.executionMode, 'sequential');
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
  assert.match(h.messages.at(-1)[0], /无需 Task 或固定/);
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

test('actual Pi SDK loads the extension and preserves conversation identity without model calls', async () => {
  const { createAgentSession, DefaultResourceLoader, SettingsManager, SessionManager, ModelRuntime } = await import('@earendil-works/pi-coding-agent');
  for (const tools of [undefined, ['read']]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-sdk-test-'));
    const settingsManager = SettingsManager.inMemory(), native = SessionManager.inMemory(root);
    const loader = new DefaultResourceLoader({ cwd: root, agentDir: path.join(root, 'agent'), settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [scientist] });
    let session;
    try {
      await loader.reload();
      const modelRuntime = await ModelRuntime.create({
        authPath: path.join(root, 'agent', 'auth.json'), modelsPath: null,
        modelsStorePath: path.join(root, 'agent', 'models-cache.json'),
        allowModelNetwork: false, refreshOnCreate: false,
      });
      ({ session } = await createAgentSession({ cwd: root, agentDir: path.join(root, 'agent'), resourceLoader: loader, settingsManager, modelRuntime, sessionManager: native, tools }));
      await session.bindExtensions({ onError: error => assert.fail(JSON.stringify(error)) });
      const id = session.sessionId, model = session.model;
      await session.sendCustomMessage({ customType: 'fixture-history', content: 'Known prior design decision', display: false });
      assert.ok(session.messages.some(m => m.customType === 'fixture-history'));
      for (const removed of ['sci_dispatch', 'sci_tasks', 'sci_sessions', 'sci_handoff']) assert.ok(!session.getActiveToolNames().includes(removed), removed);
      for (const kept of ['sci_logs', 'ask_user_question']) if (!tools || tools.includes(kept)) assert.ok(session.getActiveToolNames().includes(kept) || tools, kept);
      assert.equal(session.sessionId, id); assert.equal(session.model, model);
      if (tools) assert.deepEqual(session.getActiveToolNames(), ['read']);
    } finally {
      if (session) { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('actual Pi preserves tool filters and history across reload without mode machinery', async () => {
  const { createAgentSession, DefaultResourceLoader, SettingsManager, SessionManager, ModelRuntime } = await import('@earendil-works/pi-coding-agent');
  for (const { tools, excludeTools } of [{}, { tools: ['read'] }, { excludeTools: ['sci_logs'] }]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-mode-test-'));
    const settingsManager = SettingsManager.inMemory(), native = SessionManager.inMemory(root);
    const loader = new DefaultResourceLoader({ cwd: root, agentDir: path.join(root, 'agent'), settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [scientist] });
    let session;
    try {
      await loader.reload();
      const modelRuntime = await ModelRuntime.create({
        authPath: path.join(root, 'agent', 'auth.json'), modelsPath: null,
        modelsStorePath: path.join(root, 'agent', 'models-cache.json'),
        allowModelNetwork: false, refreshOnCreate: false,
      });
      ({ session } = await createAgentSession({ cwd: root, agentDir: path.join(root, 'agent'), resourceLoader: loader, settingsManager, modelRuntime, sessionManager: native, tools, excludeTools }));
      await session.bindExtensions({ onError: error => assert.fail(JSON.stringify(error)) });
      const id = session.sessionId, model = session.model, originalTools = session.getActiveToolNames();
      await session.sendCustomMessage({ customType: 'fixture-history', content: 'Keep this analysis decision', display: false });
      assert.equal(session.getActiveToolNames().includes('sci_logs'), (!tools || tools.includes('sci_logs')) && !excludeTools?.includes('sci_logs'));
      await session.reload();
      assert.deepEqual(session.getActiveToolNames().sort(), originalTools.sort());
      assert.equal(session.sessionId, id); assert.equal(session.model, model);
      assert.ok(session.messages.some(m => m.customType === 'fixture-history'));
    } finally {
      if (session) { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
