// Opt-in real-model integration experiment on controlled metadata fixtures, NOT biological analysis.
// Default: three-condition ablation. --topics: two-delivery topic routing smoke test.
// Explicit paid model calls; never runs under npm test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ModelRuntime, ModelRegistry, SessionManager } from '@earendil-works/pi-coding-agent';
import { createJob, runReflection } from '../dist/core/learning.js';
import { HOME, setEnabled, snapshotSkills } from '../dist/core/learning-store.js';

if (!process.argv.includes('--live')) throw new Error('Explicit --live required (paid model calls)');
// Match Pi CLI's HTTP bootstrap; SDK-only Node scripts otherwise miss its proxy-aware dispatcher.
const hostDist = path.dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent')));
const { configureHttpDispatcher } = await import(pathToFileURL(path.join(hostDist, 'core/http-dispatcher.js')).href);
configureHttpDispatcher();
const runtime = await ModelRuntime.create({ allowModelNetwork: false });
const model = runtime.getModel(process.env.PI_PROVIDER, process.env.PI_MODEL);
if (!model) throw new Error('Set PI_PROVIDER and PI_MODEL to an available physical model');
const context = { model, modelRegistry: new ModelRegistry(runtime), thinkingLevel: 'low' };
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'scientist-learning-live-'));
const temporary = fs.mkdtempSync(path.join(process.cwd(), 'node_modules/.learning-live-'));
const compiled = fs.readFileSync('dist/core/learning.js', 'utf8').replace('"./learning-store.js"', JSON.stringify(pathToFileURL(path.resolve('dist/core/learning-store.js')).href));
if (!compiled.includes('tools: ["evidence_read", "skill_read"]')) throw new Error('Read-tool ablation target missing');
const mutant = path.join(temporary, 'no-reader.mjs');
fs.writeFileSync(mutant, compiled.replace('tools: ["evidence_read", "skill_read"]', 'tools: ["skill_read"]'));
const noReader = (await import(pathToFileURL(mutant).href)).runReflection;
const report = [];
async function testTopics() {
  const root = path.join(out, 'topics'); fs.mkdirSync(root); setEnabled(root, true);
  const source = SessionManager.inMemory(root);
  const rows = [{ tag_a: '001', tag_b: 'p2' }, { tag_a: '002', tag_b: 'p1' }];
  const counts = [[0, 3], [4, 1]];
  fs.writeFileSync(path.join(root, 'metadata.tsv'), 'tag_a\ttag_b\n' + rows.map(r => `${r.tag_a}\t${r.tag_b}`).join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'qc-input.tsv'), 'cell\tG1\tG2\nc1\t0\t3\nc2\t4\t1\n');
  fs.writeFileSync(path.join(root, 'metadata-check.json'), JSON.stringify({ fixture: true, unique_tag_b: new Set(rows.map(r => r.tag_b)).size === rows.length, tag_a_leading_zero: rows.every(r => r.tag_a.startsWith('0')) }));
  fs.writeFileSync(path.join(root, 'qc-check.json'), JSON.stringify({ fixture: true, cells: counts.length, genes: counts[0].length, integer_counts: counts.flat().every(Number.isInteger), nonnegative: counts.flat().every(n => n >= 0) }));
  source.appendMessage({ role: 'user', content: 'Two independent project workflows have been delivered: specimen metadata alignment and single-cell count-input QC. Metadata: tag_b is the stable specimen identity, tag_a is an export code with leading zeros. Both must remain strings. QC: qc-input.tsv is cells by genes with a cell ID column, an unnormalized count fixture; keep counts unchanged and validate numeric columns before using count-specific methods. Save these as distinct analysis skills, since either workflow may be used alone. No biological or statistical claims, only tested technical input conventions.', timestamp: 1 });
  const execute = async (phase, delivery) => {
    const job = createJob(root, source, phase, delivery), start = Date.now(); let outcome, error;
    try { outcome = await runReflection(job, context, AbortSignal.timeout(180_000)); } catch (e) { error = String(e); }
    const raw = fs.readFileSync(path.join(root, job.run, 'session.jsonl'), 'utf8');
    const skillReads = raw.trim().split('\n').map(JSON.parse).filter(e => e.type === 'message' && e.message.role === 'assistant').flatMap(e => e.message.content.filter(c => c.type === 'toolCall' && c.name === 'skill_read').map(c => c.arguments.topic));
    const row = { phase, provider: model.provider, model: model.id, outcome, error, durationMs: Date.now() - start, skillReads, skills: snapshotSkills(root), run: job.run };
    report.push(row); console.log(JSON.stringify({ phase, outcome, error, topics: row.skills.map(s => s.topic), skillReads }));
    return row;
  };
  const first = await execute('create-two-topics', 'Delivered two independent workflows. Metadata evidence: metadata.tsv, metadata-check.json. Single-cell QC evidence: qc-input.tsv, qc-check.json. Learn separate reusable analysis-type procedures.');
  const metadata = first.skills.find(s => /metadata|align/i.test(s.topic + ' ' + s.description));
  const qc = first.skills.find(s => s.topic !== metadata?.topic);
  if (first.skills.length !== 2 || !metadata || !qc) { process.exitCode = 1; return; }
  const tokens = ['p2', 'NA', '.'];
  fs.writeFileSync(path.join(root, 'metadata-v2.tsv'), 'tag_b\np2\nNA\n.\n');
  fs.writeFileSync(path.join(root, 'metadata-v2-check.json'), JSON.stringify({ fixture: true, missing_token: '.', missing_count: tokens.filter(s => s === '.').length, literal_NA_retained: tokens.includes('NA') }));
  source.appendMessage({ role: 'user', content: `Follow-up on the SAME metadata alignment workflow (${metadata.topic}): the project defines '.' as the missing-ID token, while literal 'NA' is a valid specimen ID. New metadata-v2.tsv and metadata-v2-check.json verify this controlled parser fixture. Preserve 'NA'; flag '.' and block an unsafe join rather than silently dropping rows or changing scientific exclusions. Add this newly verified convention to the existing metadata skill, not a new parser skill. QC is unchanged.`, timestamp: 2 });
  const second = await execute('update-existing-topic', 'Delivered metadata missing-token handling. Evidence: metadata-v2.tsv and metadata-v2-check.json. Update the matching existing analysis skill only.');
  const updated = second.skills.find(s => s.topic === metadata.topic);
  const checks = { createdTwoTopics: first.skills.length === 2, reusedTopic: second.skills.length === 2 && !!updated, readExistingBody: second.skillReads.includes(metadata.topic), metadataUpdated: !!updated && updated.content !== metadata.content && updated.body.includes('NA'), otherTopicUnchanged: second.skills.find(s => s.topic === qc.topic)?.content === qc.content };
  report.push({ checks }); console.log(JSON.stringify(checks));
  if (Object.values(checks).some(value => !value)) process.exitCode = 1;
}
try {
  if (process.argv.includes('--topics')) await testTopics();
  else for (const variant of ['full', 'without-history', 'without-evidence-reader']) {
    const root = path.join(out, variant); fs.mkdirSync(root); setEnabled(root, true);
    // Both keys really are unique; only task history specifies the project's semantic join key.
    const rows = [{ tag_a: '001', tag_b: 'p2' }, { tag_a: '002', tag_b: 'p1' }];
    fs.writeFileSync(path.join(root, 'metadata.tsv'), 'tag_a\ttag_b\n' + rows.map(r => `${r.tag_a}\t${r.tag_b}`).join('\n') + '\n');
    const checks = { fixture: 'controlled metadata test; not scientific results', rows: rows.length,
      unique: Object.fromEntries(['tag_a', 'tag_b'].map(key => [key, new Set(rows.map(r => r[key])).size === rows.length])),
      tag_a_has_leading_zero: rows.every(r => r.tag_a.startsWith('0')), missing_values: rows.filter(r => !r.tag_a || !r.tag_b).length };
    fs.writeFileSync(path.join(root, 'validation.json'), JSON.stringify(checks, null, 2));
    const source = SessionManager.inMemory(root);
    source.appendMessage({ role: 'user', content: 'Project metadata task: tag_a is a temporary export row code; tag_b is the stable specimen identity. For future metadata joins use tag_b as the key. Preserve both columns as strings; do not infer that tag_a can be converted to integers. This is an input-format convention, not a change to statistical design. Check metadata.tsv and validation.json.', timestamp: 1 });
    source.appendMessage({ role: 'user', content: 'The metadata checks are now delivered. Learn the verified project-specific input procedure, with conditions and future checks. No need to rerun analysis.', timestamp: 2 });
    const job = createJob(root, source, 'controlled-delivery', 'Metadata checks delivered. Evidence artifacts: metadata.tsv and validation.json. Reflect only on this task.');
    if (variant === 'without-history') {
      const file = path.join(root, job.run, 'session.jsonl');
      const first = fs.readFileSync(file, 'utf8').split('\n')[0];
      fs.writeFileSync(file, first + '\n');
    }
    const started = Date.now(); let outcome, error;
    try { outcome = await (variant === 'without-evidence-reader' ? noReader : runReflection)(job, context, AbortSignal.timeout(180_000)); }
    catch (e) { error = String(e); }
    const read = relative => fs.existsSync(path.join(root, relative)) ? fs.readFileSync(path.join(root, relative), 'utf8') : null;
    const proposal = read(`${job.run}/proposal.json`);
    report.push({ variant, provider: model.provider, model: model.id, thinkingLevel: 'low', durationMs: Date.now() - started, outcome, error,
      proposal: proposal ? JSON.parse(proposal) : null, skills: snapshotSkills(root), usage: JSON.parse(read(`${job.run}/usage.json`) ?? '[]') });
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ variant, outcome, error, durationMs: Date.now() - started }));
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Live experiment records (private, not committed): ${out}`);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
