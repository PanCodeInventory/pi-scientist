import test from 'node:test';
import assert from 'node:assert/strict';
import { CURSOR_MARKER, visibleWidth } from '@earendil-works/pi-tui';
import { registerScientificDialogue } from '../dist/dialogue/index.js';
import { showScientificDialog } from '../dist/dialogue/ui.js';

const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: text => text };

test('question rendering distinguishes errors, pending, missing answers, cancellation and success', () => {
  let tool;
  registerScientificDialogue({ registerCommand() {}, registerTool(value) { tool = value; } });
  const render = (details, text = '', isError = false, isPartial = false) => tool.renderResult(
    { content: [{ type: 'text', text }], details }, { isPartial }, theme, { isError },
  ).render(100).join('\n');
  assert.match(render(undefined, 'Interactive UI unavailable', true), /Interactive UI unavailable/);
  assert.doesNotMatch(render(undefined, 'Aborted', true), /✓/);
  assert.match(render(undefined, '', false, true), /等待用户回答/);
  assert.match(render(undefined), /未记录答案/);
  assert.match(render({ cancelled: true }), /已取消/);
  assert.match(render({ answer: 'A vs B', cancelled: false }), /✓ A vs B/);
});

function openDialog(params) {
  const abort = new AbortController();
  const terminal = { rows: 40, columns: 100 };
  let component;
  const result = showScientificDialog(params, { mode: 'tui', ui: { custom: factory => new Promise(resolve => {
    component = factory({ terminal, requestRender() {} }, theme, { matches: (data, key) => key === 'tui.select.cancel' && data === '\x1b' }, resolve);
    component.focused = true;
  }) } }, abort.signal);
  return { component, terminal, result, abort };
}

test('question overlays stay bounded across narrow widths, resizing, long questions and multiline answers', async () => {
  for (const options of [undefined, Array.from({ length: 10 }, (_, i) => ({ label: `Choice ${i} 中文🧪`.repeat(15), description: 'description '.repeat(80) }))]) {
    const dialog = openDialog({
      question: '问题🧪'.repeat(150), options,
      placeholder: 'answer\n'.repeat(100), briefing: '背景'.repeat(500),
    });
    try {
      for (const [width, height] of [[100, 40], [40, 24], [20, 16], [1, 1], [15, 10], [80, 30]]) {
        dialog.terminal.columns = width;
        dialog.terminal.rows = height;
        dialog.component.invalidate();
        const lines = dialog.component.render(width);
        assert.ok(lines.length <= height, `${width}x${height}: ${lines.length} rows`);
        for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${visibleWidth(line)}`);
        if (width >= 20 && height >= 16 && !options) assert.ok(lines.some(line => line.includes(CURSOR_MARKER)), 'retain editor cursor for IME');
      }
    } finally {
      dialog.abort.abort();
      assert.equal(await dialog.result, null);
      dialog.component.dispose();
    }
  }
});

test('full long question remains reachable using paging even in free-text mode', async () => {
  const dialog = openDialog({ question: '问题'.repeat(380) + ' QUESTION_END', placeholder: '' });
  try {
    dialog.terminal.rows = 24;
    dialog.terminal.columns = 40;
    let reached = false;
    for (let i = 0; i < 100; i++) {
      const lines = dialog.component.render(40);
      if (lines.join('\n').includes('QUESTION_END')) { reached = true; break; }
      dialog.component.handleInput('\x1b[6~');
    }
    assert.ok(reached, 'must not permanently truncate the scientific question');
  } finally {
    dialog.abort.abort();
    await dialog.result;
    dialog.component.dispose();
  }
});

test('restoring the original terminal size re-enables cached dialog controls', async () => {
  const dialog = openDialog({ question: 'Confirm?', options: [{ label: 'Yes' }], allowCustom: false });
  try {
    dialog.component.render(100);
    dialog.terminal.rows = 10;
    dialog.component.render(15);
    dialog.terminal.rows = 40;
    dialog.component.render(100);
    dialog.component.handleInput('\r');
    assert.equal((await dialog.result)?.answer, 'Yes');
  } finally {
    dialog.abort.abort();
    dialog.component.dispose();
  }
});

test('tiny terminals block invisible submissions but still allow cancellation', async () => {
  const dialog = openDialog({ question: 'Confirm?', options: [{ label: 'Yes' }], allowCustom: false });
  dialog.terminal.rows = 10;
  dialog.terminal.columns = 15;
  assert.match(dialog.component.render(15).join(''), /Resize/);
  dialog.component.handleInput('\r');
  dialog.component.handleInput('\x1b');
  assert.equal(await dialog.result, null);
  dialog.component.dispose();
});
