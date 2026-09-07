import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { registerLogsTool } from '../dist/tools/logs.js';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('figure standard remains byte-for-byte identical to pre-reform e39df4b', () => {
  const hash = createHash('sha256').update(read('skills/visualization/shared/figure-standards.md')).digest('hex');
  assert.equal(hash, 'a4e4c78ccffa068b10e4f250d1b51c3cd4d2f7082272995331a4e555d3ad48de', 'Changing user figure standards requires deliberate approval and a new baseline');
});

test('optional planning retains fixed output layout and explicit scientific choices', () => {
  const skill = read('skills/analysis-planning/SKILL.md');
  for (const value of ['scripts/config/', 'scripts/stages/', 'scripts/utils/', 'results/data/', 'results/tables/', 'results/plots/', '99_Report/', 'logs/', 'experimental unit', 'multiple testing']) assert.ok(skill.includes(value), value);
  assert.match(skill, /No plan file/);
  assert.match(skill, /executor.*updates checklist progress/);
  assert.doesNotMatch(skill, /You MUST create a plan file|Call sci_implement.*until/);
});

test('publication delivery and annotation approval survive removal of orchestration', () => {
  const publication = read('skills/publication/SKILL.md');
  for (const value of ['disable-model-invocation: true', '手动请求触发', '一图一 notebook', '只用相对路径', '不做 panel 组合', 'PNG 300dpi', 'Restart & Run All']) assert.ok(publication.includes(value), value);
  assert.match(read('skills/scanpy-annotate/SKILL.md'), /Explicit approval of the annotation mapping is required/);
  assert.match(read('skills/scanpy-prep/SKILL.md'), /Data Storage Contract/);
  assert.match(read('skills/gene-prognosis-scan/SKILL.md'), /ThreadPoolExecutor\(max_workers=6\)/);
});

test('package includes both the declared source extension and compiled API', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.files.includes('index.ts'));
  for (const directory of ['core', 'dialogue', 'tools', 'agents', 'skills', 'dist']) assert.ok(pkg.files.includes(directory), directory);
  assert.deepEqual(pkg.pi.extensions, ['./index.ts']);
  assert.equal(pkg.main, './dist/index.js');
});

function logsTool() {
  let tool; registerLogsTool({ registerTool: value => { tool = value; } }); return tool;
}
const call = (tool, params, cwd) => tool.execute('test', params, new AbortController().signal, undefined, { cwd });

test('log tool has no worker prerequisite and throws actionable failures', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scientist-log-test-'));
  try {
    const tool = logsTool();
    const out = await call(tool, { cwd: dir, action: 'list' }, dir);
    assert.match(out.content[0].text, /direct main-agent execution is supported/);
    assert.doesNotMatch(out.content[0].text, /via sci_implement first/);
    await assert.rejects(call(tool, { cwd: dir, action: 'log' }, dir), /requires 'session'/);
    await assert.rejects(call(tool, { cwd: dir, action: 'log', module: '01_Test', session: 'missing' }, dir), /Cannot read log/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('latest log run can be failed and uses append order when timestamps tie', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scientist-log-test-'));
  const tmux = path.join(dir, '01_Test', 'tmux'); fs.mkdirSync(tmux, { recursive: true });
  fs.writeFileSync(path.join(tmux, 'manifest.jsonl'), [
    { module: '01_Test', session: 'sci_test', script: 'old.sh', exitCode: 0 },
    { module: '01_Test', session: 'sci_test', script: 'new.sh', exitCode: 1 },
  ].map(x => JSON.stringify(x)).join('\n'));
  try {
    const out = await call(logsTool(), { cwd: dir, action: 'latest' }, dir);
    assert.match(out.content[0].text, /new.sh/); assert.match(out.content[0].text, /exit=1/);
    assert.doesNotMatch(out.content[0].text, /old.sh/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
