import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAgent } from '../dist/core/runner.js';
import { agentToolResult } from '../dist/tools/shared.js';

// Fake CLI fixtures exercise the real spawn/JSON/cleanup boundary without an LLM.
async function withFakePi(source, operation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scientist-cli-test-'));
  const script = path.join(dir, 'pi');
  fs.writeFileSync(script, `#!${process.execPath}\n${source}`, { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = dir + path.delimiter + previousPath;
  try { return await operation(dir); }
  finally { process.env.PATH = previousPath; fs.rmSync(dir, { recursive: true, force: true }); }
}
const agent = { name: 'worker', description: 'test', source: 'user', systemPrompt: 'Test role', tools: ['read', 'bash'], filePath: '/test/worker.md' };
const fixture = `
const fs = require('node:fs');
const args = process.argv.slice(2);
const promptFile = args[args.indexOf('--append-system-prompt') + 1];
const info = { args, cwd: process.cwd(), child: process.env.SCIENTIST_SUBAGENT, promptFile, prompt: fs.readFileSync(promptFile, 'utf8') };
const usage = { input: 10, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 18, cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0.002, total: 0.033 } };
console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{type:'text',text:'intermediate'}], model: 'test-model', stopReason: 'toolUse', usage } }));
console.log(JSON.stringify({ type: 'message_end', message: { role: 'toolResult', content: [], usage } }));
console.log('not a JSON event');
const event = JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{type:'text',text:JSON.stringify(info)}], model: 'test-model', stopReason: 'stop', usage } });
process.stdout.write(event.slice(0, 20));
setTimeout(() => process.stdout.write(event.slice(20)), 10);
`;

test('real runner forwards tool exclusions, cwd, child marker, model and prompt; aggregates usage', async () => {
  await withFakePi(fixture, async dir => {
    const out = await runAgent(dir, [{ ...agent, model: 'example/model:high' }], 'worker', 'Task with spaces', { workDir: dir, timeoutSeconds: 5 });
    assert.equal(out.exitCode, 0); assert.equal(out.usage.turns, 2);
    assert.equal(out.usage.input, 30); assert.equal(out.modelUsage.totalTokens, 54);
    assert.equal(out.modelUsage.cost.total, 0.099);
    assert.equal(out.messages.length, 1);
    const info = JSON.parse(out.messages[0].content[0].text);
    assert.equal(info.cwd, dir); assert.equal(info.child, '1'); assert.equal(info.prompt, 'Test role');
    assert.ok(info.args.includes('--no-session'));
    assert.ok(info.args.includes('example/model:high'));
    assert.match(info.args[info.args.indexOf('--exclude-tools') + 1], /sci_implement/);
    assert.equal(info.args[info.args.indexOf('--tools') + 1], 'read,bash');
    assert.ok(info.args.includes('Task: Task with spaces'));
    assert.equal(fs.existsSync(info.promptFile), false, 'temporary role prompt cleaned up');
    assert.equal(agentToolResult(out).usage.totalTokens, 54);
  });
});

test('runtime deadline kills a process that ignores SIGTERM', { skip: process.platform === 'win32' }, async () => {
  await withFakePi(`process.on('SIGTERM', () => {}); setInterval(() => {}, 20);`, async dir => {
    const start = Date.now();
    const out = await runAgent(dir, [agent], 'worker', 'wait', { timeoutSeconds: 0.15 });
    assert.notEqual(out.exitCode, 0); assert.equal(out.stopReason, 'aborted');
    assert.match(out.errorMessage, /runtime limit/);
    assert.ok(Date.now() - start < 4000, 'SIGKILL escalation must terminate ignored SIGTERM');
    assert.throws(() => agentToolResult(out), /runtime limit/);
  });
});

test('abort kills the child and does not wait for the full timeout', async () => {
  await withFakePi(`setInterval(() => {}, 20);`, async dir => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    try {
      const start = Date.now();
      const out = await runAgent(dir, [agent], 'worker', 'wait', { signal: controller.signal, timeoutSeconds: 5 });
      assert.notEqual(out.exitCode, 0); assert.match(out.errorMessage, /was aborted/);
      assert.ok(Date.now() - start < 3000);
    } finally { clearTimeout(timer); }
  });
});

test('pre-aborted run does not start a subprocess', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runAgent(process.cwd(), [agent], 'worker', 'wait', { signal: controller.signal }), /abort/i);
});

test('zero exit without an assistant response is not success', async () => {
  await withFakePi(`console.log('startup only');`, async dir => {
    const out = await runAgent(dir, [agent], 'worker', 'task');
    assert.notEqual(out.exitCode, 0);
    assert.match(out.errorMessage, /without an assistant response/);
  });
});

test('API failure reported in JSON cannot become success merely because the process exits zero', async () => {
  await withFakePi(`console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[],stopReason:'error',errorMessage:'provider unavailable'}}));`, async dir => {
    const out = await runAgent(dir, [agent], 'worker', 'task');
    assert.equal(out.stopReason, 'error');
    assert.throws(() => agentToolResult(out), /provider unavailable/);
  });
});

test('unknown agent reports a failure without invoking pi', async () => {
  const out = await runAgent(process.cwd(), [], 'missing', 'task');
  assert.equal(out.exitCode, 1); assert.match(out.stderr, /Unknown agent/);
});
