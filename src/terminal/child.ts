import { access } from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, basename, resolve } from 'node:path';
import * as pty from 'node-pty';
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
const { Terminal } = xterm;
const { Unicode11Addon } = unicode11;

export async function executable(command: string, args: string[]) {
  const supported = /^(codex|claude)(?:\.exe|\.cmd|\.ps1)?$/i.exec(basename(command))?.[1]?.toLowerCase();
  const exists = async (p: string) => access(p).then(() => true, () => false);
  const folders = isAbsolute(command) || /[\\/]/.test(command) ? [dirname(resolve(command))] : (process.env.PATH || '').split(delimiter);
  for (const folder of folders) {
    const stem = join(folder, basename(command));
    if (process.platform !== 'win32') { if (await exists(stem)) return { file: stem, args, adapter: supported }; continue; }
    for (const file of [stem.endsWith('.exe') ? stem : `${stem}.exe`]) if (await exists(file)) return { file, args, adapter: supported };
    // Supported npm entrypoints are resolved directly; never interpolate .cmd arguments into a shell.
    if (supported === 'codex') {
      const entry = join(folder, 'node_modules/@openai/codex/bin/codex.js');
      if (await exists(entry)) return { file: process.execPath, args: [entry, ...args], adapter: supported };
    }
    if (supported === 'claude') {
      const native = join(folder, 'node_modules/@anthropic-ai/claude-code/bin/claude.exe');
      if (await exists(native)) return { file: native, args, adapter: supported };
      const js = join(folder, 'node_modules/@anthropic-ai/claude-code/cli.js');
      if (await exists(js)) return { file: process.execPath, args: [js, ...args], adapter: supported };
    }
  }
  throw new Error(`Cannot resolve ${command}. Use an installed codex/claude or a native executable path. Shell scripts are not interpolated.`);
}

/** PTY transport and a real VT screen engine. Output never goes directly to the host. */
export class EmbeddedTerminal {
  readonly screen: xterm.Terminal;
  readonly child: pty.IPty;
  exited = false;
  cursorVisible = true;
  scrollOffset = 0;
  private queued = 0;
  private paused = false;
  constructor(file: string, args: string[], cols: number, rows: number, env: Record<string, string>,
    onChange: () => void, onExit: (code: number) => void) {
    this.screen = new Terminal({ cols, rows, scrollback: 10000, allowProposedApi: true, logLevel: 'off',
      theme: { foreground: '#d8ded6', background: '#101611', cursor: '#d8ded6' } });
    this.screen.loadAddon(new Unicode11Addon()); this.screen.unicode.activeVersion = '11';
    this.child = pty.spawn(file, args, { cols, rows, cwd: process.cwd(), name: 'xterm-256color',
      env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }, useConpty: true });
    this.screen.onData(data => { if (!this.exited) this.child.write(data); });
    // Let xterm answer terminal queries in child coordinates. Never advertise host-specific modes.
    for (const code of [10, 11, 12]) this.screen.parser.registerOscHandler(code, data => {
      if (data === '?') this.child.write(`\x1b]${code};rgb:${code === 11 ? '1010/1616/1111' : 'd8d8/dede/d6d6'}\x1b\\`);
      return true;
    });
    for (const final of ['h', 'l']) this.screen.parser.registerCsiHandler({ prefix: '?', final }, params => {
      if (params.includes(25)) this.cursorVisible = final === 'h'; return false;
    });
    this.child.onData(data => {
      const length = Buffer.byteLength(data); this.queued += length;
      if (this.queued > 1024 * 1024 && !this.paused) { this.child.pause(); this.paused = true; }
      this.screen.write(data, () => {
        this.queued -= length;
        if (this.paused && this.queued < 256 * 1024 && !this.exited) { this.child.resume(); this.paused = false; }
        onChange();
      });
    });
    this.child.onExit(e => { this.exited = true; onExit(e.exitCode); });
  }
  write(data: string) { if (!this.exited) { this.scrollOffset = 0; this.child.write(data); } }
  paste(text: string) {
    // Real paste remains one bracketed paste; Enter inside it never becomes a separate submit.
    this.write(this.screen.modes.bracketedPasteMode ? `\x1b[200~${text.replace(/\x1b/g, '')}\x1b[201~` : text);
  }
  resize(cols: number, rows: number) {
    this.screen.resize(Math.max(2, cols), Math.max(1, rows));
    if (!this.exited) this.child.resize(Math.max(2, cols), Math.max(1, rows));
  }
  scroll(amount: number) { this.scrollOffset = Math.max(0, Math.min(this.screen.buffer.active.baseY, this.scrollOffset + amount)); }
  kill() { if (!this.exited) { try { this.child.kill(); } catch {} } }
  dispose() { this.kill(); this.screen.dispose(); }
}
