import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerHerdrWatch } from '../dist/core/herdr-watch.js';

test('watch ignores CLI error snapshots, deduplicates idle, timestamps results and suppresses intentional release', async () => {
  const prior = process.env.HERDR_ENV;
  process.env.HERDR_ENV = '1';
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-watch-'));
  const dir = path.join(root, '.sci/runs/worker'); fs.mkdirSync(dir, { recursive: true });
  let output, calls = 0;
  const messages = [], hooks = new Map();
  const watch = registerHerdrWatch({ on: (name, fn) => hooks.set(name, fn), sendMessage: msg => messages.push(msg) }, {
    cwd: () => root, intervalMs: 10, run: async () => { calls++; return output; },
  });
  const state = status => { output = JSON.stringify({ result: { agents: status ? [{ name: 'worker', agent_status: status }] : [] } }); };
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls, 0, 'factory must not start a timer');
    state('working'); await watch.poll();
    for (const bad of ['garbage', '{"error":{"code":"unavailable"}}', '{"result":{}}']) {
      output = bad; await watch.poll(); assert.equal(messages.length, 0);
    }
    state('idle'); await watch.poll();
    assert.equal(messages.length, 1);
    assert.match(messages[0].content, /observedAt=\d{4}-.*result.md 未出现/s);
    state('working'); await watch.poll(); state('idle'); await watch.poll();
    assert.equal(messages.length, 1, 'idle flapping with the same missing result is deduplicated');
    fs.writeFileSync(path.join(dir, 'result.md'), 'Completed with evidence');
    state('working'); await watch.poll(); state('done'); await watch.poll();
    assert.equal(messages.length, 2); assert.match(messages[1].content, /mtime=/);
    fs.writeFileSync(path.join(dir, 'released'), '');
    state(null); await watch.poll(); assert.equal(messages.length, 2);
    await hooks.get('session_start')();
    await hooks.get('session_shutdown')();
    const stopped = calls; await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(calls, stopped);
  } finally {
    watch.stop(); fs.rmSync(root, { recursive: true, force: true });
    if (prior === undefined) delete process.env.HERDR_ENV; else process.env.HERDR_ENV = prior;
  }
});
