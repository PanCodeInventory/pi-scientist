import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const setup = fileURLToPath(new URL('../skills/visualization/r-pipeline/scripts/setup_env.sh', import.meta.url));
test('R environment verifier uses R_ENV_BIN, reports interpreter failures instead of success', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-r-env-'));
  const bin = path.join(root, 'env bin'); fs.mkdirSync(bin);
  const r = path.join(bin, 'Rscript'), python = path.join(bin, 'python');
  fs.writeFileSync(python, '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  const env = { ...process.env, R_ENV_BIN: bin, RETICULATE_PYTHON: python };
  try {
    fs.writeFileSync(r, '#!/bin/bash\necho "wrong R" >&2\nexit 17\n', { mode: 0o755 });
    let run = spawnSync('bash', [setup], { env, encoding: 'utf8' });
    assert.equal(run.status, 1); assert.match(run.stderr, /R package check failed/);
    assert.doesNotMatch(run.stdout, /all required R packages present/);
    fs.writeFileSync(r, '#!/bin/bash\nprintf "ggplot2 yaml"\n');
    run = spawnSync('bash', [setup], { env, encoding: 'utf8' });
    assert.equal(run.status, 1); assert.match(run.stdout, /Missing R packages: ggplot2 yaml/);
    assert.ok(run.stdout.includes(r));
    fs.writeFileSync(r, '#!/bin/bash\nexit 0\n');
    run = spawnSync('bash', [setup], { env, encoding: 'utf8' });
    assert.equal(run.status, 0); assert.match(run.stdout, /Environment OK/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

const pillow = spawnSync('python3', ['-c', 'import PIL']).status === 0;
test('figure QC conversion and metadata regression tests', { skip: !pillow }, () => {
  const run = spawnSync('python3', [fileURLToPath(new URL('./test_figure_qc.py', import.meta.url))], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
