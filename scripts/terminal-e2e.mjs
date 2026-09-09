import assert from 'node:assert/strict';
import pty from 'node-pty';
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const sleep = ms => new Promise(r => setTimeout(r, ms));
await mkdir('.brainpane/test-results', { recursive: true });
const id = `terminal-e2e-${Date.now()}`;
const screen = new xterm.Terminal({ cols: 130, rows: 38, allowProposedApi: true, scrollback: 1000, logLevel: 'off' });
screen.loadAddon(new unicode11.Unicode11Addon()); screen.unicode.activeVersion = '11';
const child = pty.spawn(process.execPath, ['bin/brainpane.mjs', 'run', '--demo', '--session', id, '--', process.execPath, 'scripts/terminal-fixture.mjs'], { cols: 130, rows: 38, cwd: process.cwd(), env: { ...process.env, TERM: 'xterm-256color' } });
let tail = '', exit;
screen.onData(data => child.write(data)); child.onData(data => { tail = (tail + data).slice(-10000); screen.write(data); });
child.onExit(e => { exit = e; });
const text = () => Array.from({ length: screen.rows }, (_, y) => screen.buffer.active.getLine(screen.buffer.active.baseY + y)?.translateToString(true, 0, screen.cols) || '').join('\n');
const wait = async (predicate, label) => { const end = Date.now() + 20000; while (!predicate()) { if (Date.now() > end) throw new Error(`Timed out: ${label}\n${text()}`); await sleep(100); } };
try {
  await wait(() => text().includes('VT PROTOCOL FIXTURE') && text().includes('Brainpane'), 'nested screen and panel');
  child.write('\x1b[200~첫 줄\n둘째 줄\x1b[201~'); await sleep(400);
  child.write('CLEAR'); await wait(() => text().includes('cleared only'), 'erase in child');
  assert.ok(text().includes('Brainpane'));
  child.write('\x1dc'); await sleep(200);
  child.write('\x1b[<0;1;2M\x1b[<32;10;2M\x1b[<0;10;2m'); await sleep(200); child.write('y');
  if (process.platform === 'win32') {
    await wait(() => text().includes('Copied selection'), 'clipboard copy');
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard']);
    assert.ok(stdout.includes('V T cleare'));
  }
  child.write('\x1b'); await sleep(100); child.write('HISTORY'); await sleep(500);
  child.write('\x1du'); await sleep(200); assert.ok(text().includes('scrollback'));
  child.write('\x1de'); await sleep(200); assert.ok(!text().includes('[scrollback'));
  await wait(() => text().includes('v8'), 'eight published demo turns');
  assert.ok(text().includes('표시 방식과 가시성'));
  const state = JSON.parse(await readFile(`.brainpane/runs/${id}/sessions/${id}.json`, 'utf8'));
  assert.equal(state.focusTopicId, 'visibility'); assert.equal(state.topics.length, 5); assert.equal(state.topics.find(t => t.id === 'cost').status, 'parked');
  child.write('\x1d\t'); await sleep(200); child.write('\x1b[A'); await sleep(300);
  const view = JSON.parse(await readFile(`.brainpane/runs/${id}/view.json`, 'utf8')); assert.notEqual(view.selected, state.focusTopicId);
  child.write('\r'); await sleep(200); assert.ok(text().includes('상세:'));
  screen.resize(70, 26); child.resize(70, 26); await sleep(500); assert.ok(text().includes('Brainpane')); assert.ok(!text().includes('VT PROTOCOL FIXTURE'));
  await writeFile('.brainpane/test-results/narrow-terminal.txt', text());
  child.write('\x1d\t'); await sleep(300); assert.ok(!text().includes('○ Brainpane'));
  tail = ''; screen.resize(130, 38); child.resize(130, 38); await sleep(400); assert.ok(text().includes('Brainpane'));
  // Host mouse/paste modes are re-asserted after a resize and on focus-in, so a host that
  // dropped them (re-attach/replay) reports wheel events again instead of sending arrows.
  assert.ok(tail.includes('\x1b[?1000h') && tail.includes('\x1b[?1006h') && tail.includes('\x1b[?2004h'), 'host modes re-asserted after resize');
  tail = ''; child.write('\x1b[I'); await sleep(300); assert.ok(tail.includes('\x1b[?1000h'), 'host modes re-asserted on focus-in');
  assert.ok(!tail.includes('\x1b[?1049h'), 'focus-in must not re-enter the alternate screen');
  child.write('\x1dp'); await sleep(300); assert.ok(!text().includes('Brainpane'));
  child.write('\x1dp'); await sleep(300); assert.ok(text().includes('Brainpane'));
  await writeFile('.brainpane/test-results/terminal.txt', text());
  child.write('MOUSE'); await wait(() => text().includes('MOUSE TRACKING ON'), 'child mouse tracking');
  child.write('\x1b[<0;110;12M\x1b[<0;110;12m');
  await wait(() => text().includes('지도 탐색 중 · 채팅하려면'), 'visible map focus guidance');
  child.write('\x1b[<0;4;12M\x1b[<0;4;12m'); await sleep(200);
  child.write('\x1b[200~채팅 복귀 확인\x1b[201~');
  await wait(() => text().includes('Received:') && text().includes('채팅 복귀 확인'), 'click restores chat with child mouse tracking');
  assert.ok(!text().includes('지도 탐색 중 · 채팅하려면'));
  child.write('\x1b[<65;110;12M'); await sleep(200);
  assert.ok(!text().includes('지도 탐색 중 · 채팅하려면'), 'map wheel does not steal typing focus');
  child.write('\x03'); await wait(() => !!exit, 'Ctrl+C forwarded / CLI exit');
  assert.equal(exit.exitCode, 0); assert.ok(tail.includes('\x1b[?1049l'));
  assert.ok(tail.includes('\x1b[?2004l'));
  await assert.rejects(readFile(`.brainpane/runs/${id}/runtime.json`));
  console.log(JSON.stringify({ passed: true, id, checks: ['PTY streaming', 'VT clipping', 'Korean paste', 'demo publish to panel', 'selection separation', 'details', 'narrow toggle', 'resize', 'hide', 'mouse focus recovery', 'wheel preserves focus', 'host modes re-asserted', 'Ctrl+C forwarding', 'terminal restore', 'managed service cleanup'] }));
  screen.dispose(); process.exit(0);
} catch (e) {
  child.write('\x1dq'); await sleep(1000); try { child.kill(); } catch {} screen.dispose(); console.error(e); process.exit(1);
}
