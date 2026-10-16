import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const available = name => spawnSync('which', [name]).status === 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sci runner's "));
  const module = path.join(root, '01_Test'), utils = path.join(module, 'scripts/utils');
  fs.mkdirSync(utils, { recursive: true });
  const wrapper = path.join(utils, 'tmux_runner.sh');
  fs.copyFileSync(new URL('../skills/tmux-runner/references/tmux_runner.sh', import.meta.url), wrapper);
  const script = path.join(root, "entry's script.sh"), logs = path.join(module, 'tmux');
  const socket = `sci-test-${process.pid}-${Math.random().toString(16).slice(2)}`;
  const env = { ...process.env };
  let realTmux;
  if (available('tmux')) {
    realTmux = execFileSync('which', ['tmux'], { encoding: 'utf8' }).trim();
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'tmux'), `#!/bin/bash\nexec '${realTmux}' -L '${socket}' "$@"\n`, { mode: 0o755 });
    env.PATH = `${bin}:${env.PATH}`;
  }
  t.after(() => {
    if (realTmux) spawnSync(realTmux, ['-L', socket, 'kill-server']); // only our isolated server
    fs.rmSync(root, { recursive: true, force: true });
  });
  const run = async args => {
    try { return { code: 0, ...await exec('bash', [wrapper, ...args], { cwd: root, env, timeout: 15000 }) }; }
    catch (error) { return { code: error.code, stdout: error.stdout, stderr: error.stderr }; }
  };
  const waitFor = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await sleep(50); }
    assert.fail('Timed out waiting for test worker');
  };
  return { root, script, logs, run, env, waitFor };
}

for (const backend of ['setsid', 'tmux']) {
  test(`${backend}: quoted arguments, run identity, stale logs and real exit codes`, { skip: !available(backend) || !available('python3') || !available('flock') }, async t => {
    const f = await fixture(t);
    fs.writeFileSync(f.script, 'printf "<%s>\\n" "$@"\nexit 7\n');
    const args = ['two words', "quote's", '$(touch SHOULD_NOT_EXIST)', '', '*'];
    let result = await f.run(['--backend', backend, '--wait', 'sci_args', f.script, ...args]);
    assert.equal(result.code, 7, result.stderr);
    const status = fs.readFileSync(path.join(f.logs, 'sci_args.status'), 'utf8');
    assert.match(status, /EXIT_STATUS:7\nSTATE:FINISHED\nRUN_ID:/);
    assert.equal(fs.readFileSync(path.join(f.logs, 'sci_args.log'), 'utf8'), args.map(a => `<${a}>\n`).join(''));
    assert.ok(!fs.existsSync(path.join(f.root, 'SHOULD_NOT_EXIST')));
    fs.writeFileSync(f.script, 'echo fresh\n');
    result = await f.run(['--backend', backend, '--wait', 'sci_args', f.script]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(f.logs, 'sci_args.status.last'), 'utf8'), status);
    assert.equal(fs.readFileSync(path.join(f.logs, 'sci_args.log'), 'utf8'), 'fresh\n');
    const records = fs.readFileSync(path.join(f.logs, 'manifest.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(records.map(r => r.exitCode), [7, 0]);
    assert.notEqual(records[0].runId, records[1].runId);
    assert.equal(records[0].script, f.script);
  });
}

test('runner publishes RUNNING before launch, refuses duplicate jobs and waits for prerequisites', { skip: !available('setsid') }, async t => {
  const f = await fixture(t);
  fs.writeFileSync(f.script, 'sleep 2\necho done\n');
  const first = f.run(['--backend', 'setsid', '--wait', 'sci_live', f.script]);
  await f.waitFor(() => fs.existsSync(path.join(f.logs, 'sci_live.status.pid')));
  const status = fs.readFileSync(path.join(f.logs, 'sci_live.status'), 'utf8');
  assert.match(status, /^STATE:RUNNING/); assert.doesNotMatch(status, /EXIT_STATUS:/);
  const duplicate = await f.run(['--backend', 'setsid', 'sci_live', f.script]);
  assert.notEqual(duplicate.code, 0); assert.match(duplicate.stderr, /Refusing/);
  assert.equal(fs.readFileSync(path.join(f.logs, 'sci_live.status'), 'utf8'), status);
  assert.equal((await first).code, 0);
  assert.match(fs.readFileSync(path.join(f.logs, 'sci_live.log'), 'utf8'), /done/);
});

test('setsid hard kill is detected even if the worker becomes a zombie', { skip: !available('setsid') }, async t => {
  const f = await fixture(t);
  fs.writeFileSync(f.script, 'sleep 30\n');
  const waiting = f.run(['--backend', 'setsid', '--wait', 'sci_killed', f.script]);
  await f.waitFor(() => fs.existsSync(path.join(f.logs, 'sci_killed.status.pid')));
  const pid = Number(fs.readFileSync(path.join(f.logs, 'sci_killed.status.pid'), 'utf8'));
  process.kill(-pid, 'SIGKILL'); // only this test's detached process group
  const result = await waiting;
  assert.equal(result.code, 125, JSON.stringify(result));
  assert.match(result.stderr, /disappeared without completion/);
});

test('failed prerequisite prevents a chained stage from launching', { skip: !available('setsid') }, async t => {
  const f = await fixture(t);
  fs.writeFileSync(f.script, 'exit 9\n');
  const wrapper = path.join(f.root, '01_Test/scripts/utils/tmux_runner.sh');
  const outcome = await exec('bash', ['-c',
    'bash "$1" --backend setsid --wait sci_first "$2" && bash "$1" --backend setsid --wait sci_second "$2"',
    'chain', wrapper, f.script], { cwd: f.root, env: f.env, timeout: 15000 }).catch(error => error);
  assert.equal(outcome.code, 9);
  assert.ok(!fs.existsSync(path.join(f.logs, 'sci_second.status')));
});

test('tmux loss never reports successful completion or automatically replays', { skip: !available('tmux') }, async t => {
  const f = await fixture(t);
  fs.writeFileSync(f.script, 'echo started\nsleep 30\necho should-not-complete\n');
  const waiting = f.run(['--wait', 'sci_lost', f.script]);
  await f.waitFor(() => fs.existsSync(path.join(f.logs, 'sci_lost.status.pid')));
  await exec('tmux', ['kill-session', '-t', '=sci_lost'], { env: f.env });
  const outcome = await waiting;
  assert.ok(Number.isInteger(outcome.code) && outcome.code !== 0, JSON.stringify(outcome));
  assert.doesNotMatch(fs.readFileSync(path.join(f.logs, 'sci_lost.status'), 'utf8'), /EXIT_STATUS:0\n/);
  assert.equal((fs.readFileSync(path.join(f.logs, 'sci_lost.log'), 'utf8').match(/started/g) || []).length, 1);
});
