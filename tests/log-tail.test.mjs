import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readLogTail } from '../dist/tools/log-tail.js';
import { registerLogsTool } from '../dist/tools/logs.js';

async function withLog(check) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sci-tail-'));
  const dir = path.join(root, '01_Test', 'tmux');
  fs.mkdirSync(dir, { recursive: true });
  try { await check(path.join(dir, 'job.log'), root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('bounded log tails retain existing line semantics and UTF-8', async () => {
  await withLog(async file => {
    for (const content of ['', 'one', '一\n二\n三', '一\n二\n三\n', '🧪中文\n'.repeat(10000)]) {
      fs.writeFileSync(file, content);
      for (const lines of [1, 2, 40, 2000]) {
        const tail = await readLogTail(file, lines);
        assert.equal(tail.content, content.split('\n').slice(-lines).join('\n'));
        assert.equal(tail.truncated, false);
      }
    }
  });
});

test('a multi-GB sparse log is read from its suffix and enormous lines are bounded', async () => {
  await withLog(async (file, root) => {
    const fd = fs.openSync(file, 'w');
    try {
      const size = 2 * 1024 ** 3;
      fs.ftruncateSync(fd, size);
      const suffix = Buffer.from('前缀\n最后一行\n');
      fs.writeSync(fd, suffix, 0, suffix.length, size - suffix.length);
    } finally { fs.closeSync(fd); }
    assert.deepEqual(await readLogTail(file, 2), { content: '最后一行\n', truncated: false });
    fs.writeFileSync(file, '中文🧪'.repeat(20000));
    const tail = await readLogTail(file, 40);
    assert.ok(Buffer.byteLength(tail.content) <= 64 * 1024);
    assert.equal(tail.truncated, true);
    assert.ok(!tail.content.includes('\ufffd'));
    let tool; registerLogsTool({ registerTool: value => { tool = value; } });
    const out = await tool.execute('test', { cwd: root, action: 'log', module: '01_Test', session: 'job' }, new AbortController().signal, undefined, { cwd: root });
    assert.match(out.content[0].text, /Truncated; full log:/);
    assert.ok(Buffer.byteLength(out.content[0].text) < 52 * 1024);
  });
});

test('log tail cancellation works before opening and between read chunks', async () => {
  await withLog(async file => {
    fs.writeFileSync(file, 'x'.repeat(128 * 1024));
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(readLogTail(file, 40, controller.signal), /abort/i);
    const midRead = new AbortController();
    let checks = 0;
    await assert.rejects(readLogTail(file, 40, { throwIfAborted() {
      if (++checks === 3) midRead.abort();
      midRead.signal.throwIfAborted();
    } }), /abort/i);
    assert.equal(checks, 3);
    assert.ok((await readLogTail(file, 1)).truncated);
  });
});
