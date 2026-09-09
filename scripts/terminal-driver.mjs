// Opt-in local compatibility harness. Captures ONLY the explicitly launched synthetic test.
import pty from 'node-pty';
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
const { Terminal } = xterm;
const { Unicode11Addon } = unicode11;
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('.brainpane', { recursive: true });
const screen = new Terminal({ cols: 130, rows: 38, allowProposedApi: true, scrollback: 3000, logLevel: 'off' });
screen.loadAddon(new Unicode11Addon()); screen.unicode.activeVersion = '11';
const args = process.argv.slice(2);
const child = pty.spawn(process.execPath, args.length ? args : ['scripts/terminal-probe.mjs', 'codex'], { cols: 130, rows: 38, cwd: process.cwd(), env: { ...process.env, TERM: 'xterm-256color' } });
screen.onData(data => child.write(data));
child.onData(data => screen.write(data));
child.onExit(async e => { await writeFile('.brainpane/terminal-exit.json', JSON.stringify(e)); clearInterval(timer); screen.dispose(); process.exit(e.exitCode); });
let last = '';
const timer = setInterval(async () => {
  const b = screen.buffer.active;
  await writeFile('.brainpane/terminal-screen.txt', Array.from({ length: screen.rows }, (_, y) => b.getLine(b.baseY + y)?.translateToString(true, 0, screen.cols) || '').join('\n'));
  try {
    const raw = await readFile('.brainpane/terminal-control.json', 'utf8');
    if (raw !== last) { last = raw; const c = JSON.parse(raw); if (c.resize) { screen.resize(...c.resize); child.resize(...c.resize); } if (c.input) child.write(c.input); if (c.kill) child.kill(); }
  } catch {}
}, 300);
setTimeout(() => { child.write('\x1dq'); setTimeout(() => { child.kill(); screen.dispose(); process.exit(124); }, 3000); }, 600000).unref();
console.log('Synthetic terminal harness running. Screen: .brainpane/terminal-screen.txt; control: .brainpane/terminal-control.json');
