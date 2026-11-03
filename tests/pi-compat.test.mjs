import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAgentSession, createCodemodeExtension, DefaultResourceLoader,
  ModelRuntime, SessionManager, SettingsManager,
} from '@earendil-works/pi-coding-agent';
import scientist from '../dist/index.js';
// Pi's renderer is internal; use the installed host implementation, not a prompt mock.
const { buildSystemPrompt } = await import(new URL('./core/system-prompt.js', import.meta.resolve('@earendil-works/pi-coding-agent')));

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
async function withSession(options, check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-compat-'));
  const settingsManager = SettingsManager.inMemory(options.settings ?? {});
  const loader = new DefaultResourceLoader({
    cwd: root, agentDir: path.join(root, 'agent'), settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [scientist], ...options.loader,
  });
  let session;
  try {
    await loader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: path.join(root, 'auth.json'), modelsPath: null,
      modelsStorePath: path.join(root, 'cache.json'), allowModelNetwork: false, refreshOnCreate: false,
    });
    ({ session } = await createAgentSession({
      cwd: root, agentDir: path.join(root, 'agent'), settingsManager, resourceLoader: loader,
      modelRuntime, sessionManager: SessionManager.inMemory(root),
    }));
    await session.bindExtensions({ onError: error => assert.fail(JSON.stringify(error)) });
    await check(session, loader, root);
  } finally {
    if (session) { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('structured scientist sections compose with earlier/later extensions for user and custom runs', async () => {
  const earlier = pi => pi.on('before_agent_start', event => { event.systemPromptOptions.sections.earlier = 'EARLIER_SECTION'; });
  const later = pi => pi.on('before_agent_start', event => { event.systemPromptOptions.sections.later = 'LATER_SECTION'; });
  let rendered;
  const observer = pi => pi.on('before_agent_start', event => { rendered = event.systemPrompt; });
  await withSession({ loader: { extensionFactories: [earlier, scientist, later, observer] } }, async (session, _loader, root) => {
    for (const trigger of [
      { messageType: 'user', prompt: 'fixture' },
      { messageType: 'custom', message: { customType: 'scientist-subagent', content: 'fixture', display: true } },
    ]) {
      const result = await session.extensionRunner.emitBeforeAgentStart(trigger, { cwd: root });
      assert.equal(result.systemPromptOptions.forceSystemPrompt, undefined);
      assert.match(rendered, /EARLIER_SECTION/);
      assert.match(rendered, /LATER_SECTION/);
      assert.equal((rendered.match(/<scientist-conventions>/g) ?? []).length, 1);
      assert.equal((rendered.match(/<scientist-principles>/g) ?? []).length, 1);
    }
  });
});

test('real source loading honors package skills, empty filters, noSkills and explicit skill paths across reload', async () => {
  for (const scenario of [
    { skills: undefined, noSkills: false, expected: 20 },
    { skills: [], noSkills: false, expected: 0 },
    { skills: undefined, noSkills: true, expected: 0 },
    { skills: [], noSkills: true, additionalSkillPaths: [path.join(packageRoot, 'skills')], expected: 20 },
  ]) {
    await withSession({
      settings: { packages: [{ source: packageRoot, ...(scenario.skills ? { skills: scenario.skills } : {}) }] },
      loader: {
        extensionFactories: [], additionalExtensionPaths: [path.join(packageRoot, 'index.ts')],
        noSkills: scenario.noSkills, additionalSkillPaths: scenario.additionalSkillPaths,
      },
    }, async (session, loader, root) => {
      const check = async () => {
        assert.ok(session.getActiveToolNames().includes('ask_user_question'));
        const { skills, diagnostics } = loader.getSkills();
        assert.equal(skills.filter(skill => skill.filePath.startsWith(path.join(packageRoot, 'skills') + path.sep)).length, scenario.expected);
        if (scenario.noSkills) assert.equal(skills.length, scenario.expected);
        assert.deepEqual(diagnostics.filter(diagnostic => diagnostic.path?.startsWith(packageRoot)), []);
        const result = await session.extensionRunner.emitBeforeAgentStart({ messageType: 'user', prompt: 'fixture' }, { cwd: root, skills, selectedTools: session.getActiveToolNames() });
        const guidance = result.systemPromptOptions.sections['scientist-resources'];
        if (scenario.expected) assert.doesNotMatch(guidance, /not advertised/);
        else assert.match(guidance, /not advertised in this run: visualization, tmux-runner/);
      };
      await check();
      await session.reload();
      await check();
    });
  }
});

test('project extension-only loading reproduces missing skills; package loading repairs the actual prompt', async () => {
  for (const kind of ['extensions', 'packages']) {
    await withSession({
      settings: { [kind]: [packageRoot] },
      loader: { noExtensions: false, noSkills: false, extensionFactories: [] },
    }, async (session, loader, root) => {
      for (let pass = 0; pass < 2; pass++) {
        assert.deepEqual(loader.getExtensions().errors, []);
        assert.equal(loader.getExtensions().extensions.length, 1);
        assert.ok(session.getActiveToolNames().includes('sci_logs'));
        const result = await session.extensionRunner.emitBeforeAgentStart({ messageType: 'user', prompt: 'Inspect context' }, { cwd: root, skills: loader.getSkills().skills, selectedTools: session.getActiveToolNames() });
        const options = result.systemPromptOptions;
        const bundled = options.skills.filter(s => s.filePath.startsWith(path.join(packageRoot, 'skills') + path.sep));
        assert.equal(bundled.length, kind === 'packages' ? 20 : 0);
        assert.equal(bundled.filter(s => !s.disableModelInvocation).length, kind === 'packages' ? 19 : 0);
        const prompt = buildSystemPrompt(options);
        if (kind === 'packages') {
          assert.match(prompt, /<name>visualization<\/name>/);
          assert.match(prompt, /<name>tmux-runner<\/name>/);
          assert.ok(prompt.includes(path.join(packageRoot, 'skills/visualization/SKILL.md')));
          assert.doesNotMatch(prompt, /<name>publication<\/name>/);
          assert.doesNotMatch(options.sections['scientist-resources'], /not advertised/);
        } else {
          assert.doesNotMatch(prompt, /<name>visualization<\/name>|<name>tmux-runner<\/name>/);
          assert.match(options.sections['scientist-resources'], /not advertised in this run: visualization, tmux-runner/);
        }
        assert.equal(options.sections['scientist-learning'], undefined, 'disabled learning must not mandate delivery registration');
        if (pass === 0) await session.reload();
      }
    });
  }
});

test('codemode keeps scientific questions model-only and logs callable', async () => {
  await withSession({
    settings: { defaultTools: ['+codemode'] },
    loader: { extensionFactories: [scientist, createCodemodeExtension({ mode: 'only' })] },
  }, async session => {
    assert.ok(session.getActiveToolNames().includes('codemode'));
    assert.ok(session.getActiveToolNames().includes('ask_user_question'));
    assert.equal(session.getToolDefinition('ask_user_question').exposure, 'model-only');
    assert.ok(!session.getCallableToolNames().includes('ask_user_question'));
    assert.ok(session.getCallableToolNames().includes('sci_logs'));
    const ctx = session.extensionRunner.createToolContext('fixture', new AbortController().signal);
    assert.ok(!ctx.tools.some(tool => tool.name === 'ask_user_question'));
  });
});
