import test from 'node:test';
import assert from 'node:assert/strict';
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
import { InputDecoder, type Input } from '../src/terminal/input';
import { childRows, fit, Painter } from '../src/terminal/render';
import { createSession, applyPatch } from '../src/core/model';
import { MapPanel, treeRows, topicDetail } from '../src/terminal/panel';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const write = (t: xterm.Terminal, text: string) => new Promise<void>(resolve => t.write(text, resolve));
test('real VT engine clips clear/move/alternate-screen output; Korean width and right panel survive', async () => {
  const child = new xterm.Terminal({ cols: 20, rows: 5, allowProposedApi: true });
  const outer = new xterm.Terminal({ cols: 40, rows: 5, allowProposedApi: true });
  child.loadAddon(new unicode11.Unicode11Addon()); child.unicode.activeVersion = '11';
  outer.loadAddon(new unicode11.Unicode11Addon()); outer.unicode.activeVersion = '11';
  const renderer = new Painter();
  try {
    for (const payload of ['한국어 입력\r\nsecond line', '\x1b[2J\x1b[H안녕', '\x1b[?1049h\x1b[999COVERWRITE\x1b[?1049l']) {
      await write(child, payload);
      const fake = { screen: child, scrollOffset: 0 } as any;
      const rows = childRows(fake, 20, 5).map(row => row + '│' + fit('MAP stays here', 19));
      await write(outer, '\x1b[?7l' + renderer.draw(rows, null));
      for (let y = 0; y < 5; y++) assert.equal(outer.buffer.active.getLine(y)?.translateToString(true, 21, 40).trimEnd(), 'MAP stays here');
    }
    assert.equal(child.buffer.active.getLine(0)?.getCell(0)?.getWidth(), 2);
    assert.equal(fit('한국어', 5), '한국 ');
  } finally { child.dispose(); outer.dispose(); }
});
test('VT query replies use child coordinates and preserve paste mode', async () => {
  const t = new xterm.Terminal({ cols: 20, rows: 8, allowProposedApi: true }); const replies: string[] = [];
  t.onData(data => replies.push(data));
  try {
    await write(t, '\x1b[3;7H\x1b[6n\x1b[?2004h');
    assert.ok(replies.includes('\x1b[3;7R')); assert.equal(t.modes.bracketedPasteMode, true);
    t.resize(15, 5); assert.equal(t.cols, 15);
  } finally { t.dispose(); }
});
test('fragmented bracketed paste never triggers prefix actions or submits lines individually', () => {
  const events: Input[] = []; const decoder = new InputDecoder(e => events.push(e));
  for (const fragment of ['\x1b[20', '0~첫 줄\n둘째 줄\x1d', 'q\x1b[2', '01~', '\x1b[', 'A', '\x03']) decoder.feed(fragment);
  assert.deepEqual(events, [{ type: 'paste', data: '첫 줄\n둘째 줄\x1dq' }, { type: 'key', data: '\x1b[A' }, { type: 'key', data: '\x03' }]);
  decoder.feed('\x1b[<0;7;3M'); assert.deepEqual(events.at(-1), { type: 'mouse', button: 0, x: 6, y: 2, release: false });
});
test('terminal map selection, collapse, detail view and persisted viewport stay separate from actual focus', async () => {
  const fixture = JSON.parse(await readFile('fixtures/demo.json', 'utf8'));
  let s = createSession({ ...fixture.session, id: 'terminal-test' });
  for (const turn of fixture.turns) s = applyPatch(s, turn.patch, `hash-${turn.step}`);
  const dir = await mkdtemp(join(tmpdir(), 'brainpane-panel-'));
  try {
    const panel = new MapPanel(s, dir, async () => s); await panel.init();
    panel.view.selected = 'cost'; panel.view.follow = true; panel.view.detail = true;
    const changed = applyPatch(s, { updateId: 'new-focus', baseVersion: 8, operations: [{ type: 'focus', topicId: 'compatibility', certainty: 'confirmed', reason: null }] }, 'focus');
    panel.update(changed);
    assert.equal(panel.view.selected, 'cost'); assert.equal(panel.view.detail, true); assert.equal(panel.state.focusTopicId, 'compatibility');
    panel.view.collapsed = ['root']; assert.equal(treeRows(changed, panel.view)[0].inside, true);
    panel.input('n'); assert.equal(panel.view.selected, null); assert.deepEqual(panel.view.collapsed, []);
    panel.render(38, 25); await panel.close();
    const restored = new MapPanel(changed, dir, async () => changed); await restored.init();
    assert.equal(restored.view.detail, true); assert.equal(restored.view.follow, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('flow and table are evidence-linked topic data, not invented renderer summaries', () => {
  const s = createSession({ id: 'p', goal: 'Compare', rootTitle: 'Compare', binding: { cli: 'codex', conversation: 'test' } });
  const patch = { updateId: 'one', baseVersion: 0, operations: [{ type: 'edit', topicId: 'root', changes: { sources: [{ id: 'q1', role: 'user', text: 'Use A for one screen.' }], presentation: { kind: 'table', columns: ['Option', 'Reason'], rows: [{ cells: ['A', 'one screen'], sourceId: 'q1' }] } } }] };
  const next = applyPatch(s, patch, 'h'); assert.ok(topicDetail(next.topics[0], 36).some(row => row.includes('one screen')));
  (patch.operations[0].changes.presentation.rows[0] as any).sourceId = 'fake'; assert.throws(() => applyPatch(s, patch, 'h'), /source evidence/);
});
