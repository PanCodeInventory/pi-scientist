import test from 'node:test';
import assert from 'node:assert/strict';
import { registerScientistContext, scientistResourceStatus } from '../dist/core/context.js';

const skill = (name, extra = {}) => ({ name, description: 'Use for fixture tasks.', filePath: `/fixture/${name}/SKILL.md`, ...extra });
const skills = [skill('visualization'), skill('tmux-runner')];

test('resource guidance uses only advertised metadata and distinguishes skill from tool', () => {
  const options = { skills, selectedTools: ['read', 'bash'] };
  const before = JSON.stringify(options);
  const status = scientistResourceStatus(options);
  assert.deepEqual(status.missing, []);
  assert.match(status.guidance, /not the full instructions/);
  assert.match(status.guidance, /not a dedicated tool/);
  assert.doesNotMatch(status.guidance, /\/fixture\//, 'do not duplicate paths or load bodies');
  assert.equal(JSON.stringify(options), before);
});

test('missing, command-only, absent reader and indirect reader obey Pi advertisement rules', () => {
  for (const options of [
    {}, { skills: [], selectedTools: ['read'] },
    { skills, selectedTools: ['write'] },
    { skills: skills.map(s => ({ ...s, disableModelInvocation: true })), selectedTools: ['read'] },
  ]) {
    const result = scientistResourceStatus(options);
    assert.deepEqual(result.missing, ['visualization', 'tmux-runner']);
    assert.match(result.guidance, /Do not guess their paths/);
    assert.match(result.guidance, /Respect intentional exclusions and --no-skills/);
  }
  assert.deepEqual(scientistResourceStatus({ skills, selectedTools: ['read', 'codemode'], hiddenTools: ['read'] }).missing, []);
  assert.deepEqual(scientistResourceStatus({ skills, selectedTools: ['bash'] }).missing, []);
  assert.deepEqual(scientistResourceStatus({ skills: [skill('visualization')], selectedTools: ['read'] }).missing, ['tmux-runner']);
});

test('context updates are idempotent, preserve other sections and warn only on changed missing state', () => {
  let hook;
  registerScientistContext({ on: (name, fn) => { assert.equal(name, 'before_agent_start'); hook = fn; } });
  const notices = [];
  const ctx = { hasUI: true, ui: { notify: (...args) => notices.push(args) } };
  const event = { systemPromptOptions: { skills: [], selectedTools: ['read'], sections: { unrelated: 'keep' } } };
  assert.equal(hook(event, ctx), undefined);
  const once = { ...event.systemPromptOptions.sections };
  hook(event, ctx);
  assert.deepEqual(event.systemPromptOptions.sections, once);
  assert.equal(notices.length, 1);
  assert.equal(notices[0][1], 'warning');
  event.systemPromptOptions.skills = skills;
  hook(event, ctx);
  assert.doesNotMatch(event.systemPromptOptions.sections['scientist-resources'], /not advertised/);
  assert.equal(notices.length, 1);
  event.systemPromptOptions.skills = [];
  hook(event, ctx);
  assert.equal(notices.length, 2);
  assert.equal(event.systemPromptOptions.sections.unrelated, 'keep');
  // Headless runs still receive the model-facing diagnostic.
  hook(event, { hasUI: false });
  assert.match(event.systemPromptOptions.sections['scientist-resources'], /not advertised/);
});
