// Functional module ablation: remove one mechanism at a time in temporary compiled copies.
// No production switches, no paid model calls. Failures are expected evidence of lost guarantees.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(root, 'node_modules/.learning-ablation-'));
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scientist-learning-ablation-'));
const store = fs.readFileSync('dist/core/learning-store.js', 'utf8');
const learning = fs.readFileSync('dist/core/learning.js', 'utf8').replace('"./learning-store.js"', JSON.stringify(pathToFileURL(path.join(root, 'dist/core/learning-store.js')).href));
const remove = (source, oldText, next = '') => {
  if (!oldText || !source.includes(oldText)) throw new Error(`Ablation target missing: ${oldText}`);
  return source.replace(oldText, next);
};
const variants = [
  { name: 'full', env: {} },
  { name: 'without-active-branch-selection', kind: 'LEARNING', source: remove(learning, 'const branch = source.getBranch();', 'const branch = source.getEntries();') },
  { name: 'without-evidence-provenance', kind: 'LEARNING_STORE', source: remove(store, store.slice(store.indexOf('                for (const change of skill.changes)\n'), store.indexOf('                if (!skill.description.trim())'))) },
  { name: 'without-baseline-check', kind: 'LEARNING_STORE', source: remove(store, '                if (current !== baseline)\n                    throw new Error("Skill baseline changed; reflect again against the new version");') },
  { name: 'without-risk-gate', kind: 'LEARNING_STORE', source: remove(store, '                if (skill.changes.some(c => c.disposition !== "eligible" || c.changesScientificDecision)) {\n                    record.status = "hold";\n                    continue;\n                }') },
  { name: 'without-topic-separation', kind: 'LEARNING_STORE', source: remove(store, 'return `.pi/skills/${topic}/SKILL.md`;', 'return `.pi/skills/shared/SKILL.md`;') },
  { name: 'without-read-before-edit', kind: 'LEARNING_STORE', source: remove(store, '!prior.writable || !readTopics.has(skill.topic)', '!prior.writable') },
  { name: 'without-publisher-exclusion', kind: 'LEARNING_STORE', source: remove(store, 'const fd = fs.openSync(lock, "wx", 0o600);', 'const fd = fs.openSync(lock, "w", 0o600);') },
  { name: 'without-managed-path-check', kind: 'LEARNING_STORE', source: remove(store, '            if (fs.lstatSync(current).isSymbolicLink())\n                throw new Error(`Symlink not allowed: ${current}`);') },
];
const report = [];
try {
  for (const variant of variants) {
    const env = { ...process.env, ...variant.env };
    if (variant.source) {
      const file = path.join(temporary, variant.name + '.mjs');
      fs.writeFileSync(file, variant.source);
      env[`SCI_TEST_${variant.kind}`] = pathToFileURL(file).href;
    }
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/learning.test.mjs'], { env, cwd: root, encoding: 'utf8', timeout: 60_000 });
    const output = result.stdout + result.stderr;
    fs.writeFileSync(path.join(out, variant.name + '.tap'), output);
    const failed = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map(m => m[1]);
    const pass = Number(output.match(/^# pass (\d+)$/m)?.[1] ?? 0);
    const fail = Number(output.match(/^# fail (\d+)$/m)?.[1] ?? 0);
    const expected = variant.name === 'full' ? result.status === 0 && pass > 0 : result.status !== 0 && failed.length > 0;
    report.push({ variant: variant.name, pass, fail, failed, expected });
    console.log(`${variant.name}: ${pass} pass, ${fail} fail; ${expected ? 'expected' : 'UNEXPECTED'}`);
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Functional ablation records: ${out}`);
  if (report.some(r => !r.expected)) process.exitCode = 1;
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
