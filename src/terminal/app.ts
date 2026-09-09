import { StringDecoder } from 'node:string_decoder';
import { execFile } from 'node:child_process';
import { EmbeddedTerminal, executable } from './child.js';
import { InputDecoder, type Input } from './input.js';
import { childRows, esc, fit, Painter, selectionText, type Selection } from './render.js';
import type { PanelControl } from './control.js';

export type Panel = {
  render(width: number, height: number): string[];
  input(data: string): boolean | void;
  click(row: number): void;
  close(): Promise<void>;
};
export type AppOptions = { command: string; args: string[]; env: Record<string, string>; width: number; prefix: string; panel: Panel; control?: PanelControl; hidden?: boolean; onSpawn?: () => void };

export async function terminalApp(options: AppOptions) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('brainpane run requires an interactive terminal (TTY).');
  const resolved = await executable(options.command, options.args);
  const output = process.stdout; const input = process.stdin;
  const painter = new Painter(); let dirty = true, stopped = false, exitCode = 0, focus: 'cli' | 'map' = 'cli';
  let shown = !options.hidden, width = options.width, prefixPending = false, copyMode = false, help = false, status = '';
  let controlRevision = 0;
  let selection: Selection | null = null;
  const size = () => ({ cols: Math.max(10, output.columns || 80), rows: Math.max(5, output.rows || 24) });
  const geometry = () => {
    const { cols, rows } = size(); const narrow = cols < 88;
    const mapWidth = shown ? narrow ? (focus === 'map' ? cols : 0) : Math.min(width, cols - 42) : 0;
    const cliWidth = mapWidth === cols ? 0 : cols - mapWidth - (mapWidth ? 1 : 0);
    return { cols, rows, mapWidth, cliWidth, cliRows: rows - 2 };
  };
  const initial = geometry();
  const term = new EmbeddedTerminal(resolved.file, resolved.args, initial.cliWidth || initial.cols, initial.cliRows,
    options.env, () => { dirty = true; }, code => { exitCode = code; stopped = true; });
  options.onSpawn?.();
  const oldRaw = input.isRaw;
  // Host modes are re-asserted on resize and focus-in: a host that re-attaches or
  // replays its screen (Orca tabs, reconnects) may drop them, after which the host
  // turns wheel into arrow keys instead of reporting mouse events. Plain CLIs such as
  // Claude re-emit their own modes on every re-render; the compositor must do the same.
  const hostModes = `${esc}?25l${esc}?7l${esc}?2004h${esc}?1000h${esc}?1002h${esc}?1006h${esc}?1004h`;
  const restore = () => {
    if (input.isTTY) input.setRawMode(!!oldRaw);
    output.write(`${esc}0m${esc}?1004l${esc}?1000l${esc}?1002l${esc}?1006l${esc}?2004l${esc}?7h${esc}?25h${esc}?1049l`);
  };
  const onSignal = () => { stopped = true; };
  const onResize = () => {
    const g = geometry(); term.resize(g.cliWidth || g.cols, g.cliRows); selection = null; painter.invalidate(); output.write(`${hostModes}${esc}2J`); dirty = true;
  };
  function prefixAction(data: string) {
    prefixPending = false;
    if (data === options.prefix) term.write(data);
    else if (data === 'p') { shown = !shown; if (!shown) focus = 'cli'; onResize(); }
    else if (data === '\t' || data === 'm') { focus = focus === 'cli' ? 'map' : 'cli'; shown = true; onResize(); }
    else if (data === '+' || data === '=') { width = Math.min(90, width + 4); onResize(); }
    else if (data === '-') { width = Math.max(28, width - 4); onResize(); }
    else if (data === 'q') stopped = true;
    else if (data === 'c') { copyMode = !copyMode; selection = null; }
    else if (data === '?') help = !help;
    else if (data === 'u') term.scroll(Math.max(1, geometry().cliRows - 2));
    else if (data === 'd') term.scroll(-Math.max(1, geometry().cliRows - 2));
    else if (data === 'e') { term.scrollOffset = 0; copyMode = false; selection = null; }
    else { status = 'Unknown prefix command. Prefix + ? shows help.'; }
    dirty = true;
  }
  function copy() {
    if (!selection) return;
    const text = selectionText(term, selection);
    if (process.platform === 'win32') {
      // UTF-8 stdin, literal clipboard value, no shell text interpolation.
      const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new(); Set-Clipboard -Value ([Console]::In.ReadToEnd())'], { windowsHide: true }, err => { status = err ? 'Clipboard failed; use host selection with mouse capture off.' : 'Copied selection'; dirty = true; });
      child.stdin?.end(text);
    } else {
      const child = execFile(process.platform === 'darwin' ? 'pbcopy' : 'xclip', process.platform === 'darwin' ? [] : ['-selection', 'clipboard'], err => { status = err ? 'Clipboard tool unavailable; use host selection with mouse capture off.' : 'Copied selection'; dirty = true; });
      child.stdin?.end(text);
    }
  }
  function event(e: Input) {
    dirty = true;
    if (e.type === 'paste') { if (focus === 'cli') term.paste(e.data); else options.panel.input(e.data); return; }
    if (e.type === 'key') {
      if (e.data === `${esc}I` || e.data === `${esc}O`) {
        // Host focus report: re-assert host modes on focus-in, and pass the event on
        // only when the child asked for focus reporting itself.
        if (e.data === `${esc}I`) { output.write(hostModes); painter.invalidate(); }
        if (term.screen.modes.sendFocusMode) term.write(e.data, true);
        return;
      }
      if (prefixPending) { prefixAction(e.data); return; }
      if (e.data === options.prefix) { prefixPending = true; return; }
      if (copyMode) {
        if (e.data === '\x1b' || e.data === 'q') { copyMode = false; selection = null; }
        else if (e.data === 'y' || e.data === '\x03') copy();
        else if (e.data === '\x1b[A' || e.data === 'k') term.scroll(1);
        else if (e.data === '\x1b[B' || e.data === 'j') term.scroll(-1);
        else if (e.data === '\x1b[5~') term.scroll(geometry().cliRows - 1);
        else if (e.data === '\x1b[6~') term.scroll(-(geometry().cliRows - 1));
        return;
      }
      if (focus === 'map') { const handled = options.panel.input(e.data); if (e.data === '\x1b' && !handled) { focus = 'cli'; onResize(); } }
      else {
        // Preserve host key sequences, with the one VT application-cursor translation required by DECCKM.
        const data = term.screen.modes.applicationCursorKeysMode && /^\x1b\[[ABCDHF]$/.test(e.data) ? e.data.replace('[', 'O') : e.data;
        term.write(data);
      }
      return;
    }
    const g = geometry();
    const primaryPress = !e.release && e.button === 0;
    if (g.mapWidth && e.x >= g.cliWidth + (g.cliWidth ? 1 : 0)) {
      // Hover, release, drag and wheel must never steal keyboard focus.
      if (primaryPress) { const changed = focus !== 'map'; focus = 'map'; options.panel.click(e.y - 1); if (changed) onResize(); }
      else if (!e.release && (e.button === 64 || e.button === 65)) options.panel.input(e.button === 64 ? '\x1b[A' : '\x1b[B');
      return;
    }
    if (e.x >= g.cliWidth) return; // Divider is not a pane.
    if (e.y < 1 || e.y > g.cliRows || !g.cliWidth) return;
    // Restore typing even when the child (e.g. Claude) captures mouse events.
    if (primaryPress) focus = 'cli';
    const point = { x: Math.min(g.cliWidth - 1, e.x), y: e.y - 1 };
    if (copyMode || (e.button & 4)) {
      if (e.button === 64 || e.button === 68) term.scroll(3);
      else if (e.button === 65 || e.button === 69) term.scroll(-3);
      else if (!e.release && !(e.button & 32)) selection = { start: point, end: point };
      else if (selection) selection.end = point;
      return;
    }
    if (term.screen.modes.mouseTrackingMode === 'none') {
      if (e.button === 64) term.scroll(3); else if (e.button === 65) term.scroll(-3);
    } else term.write(`${esc}<${e.button};${point.x + 1};${point.y + 1}${e.release ? 'm' : 'M'}`);
  }
  const decoder = new InputDecoder(event); const utf8 = new StringDecoder('utf8'); let escapeTimer: NodeJS.Timeout;
  const onInput = (data: Buffer) => { decoder.feed(utf8.write(data)); clearTimeout(escapeTimer); escapeTimer = setTimeout(() => decoder.flushEscape(), 25); };
  const onError = () => { exitCode = 1; stopped = true; };
  try {
    input.setRawMode(true); input.resume();
    output.write(`${esc}?1049h${hostModes}${esc}2J`);
    input.on('data', onInput); input.on('error', onError); output.on('error', onError); output.on('resize', onResize);
    process.on('SIGTERM', onSignal); process.on('SIGHUP', onSignal); process.on('SIGINT', onSignal);
    while (!stopped) {
      if (options.control && options.control.revision !== controlRevision) {
        controlRevision = options.control.revision;
        shown = options.control.action === 'open' || options.control.action === 'sync';
        // Preserve typing focus on wide screens. Narrow screens announce the
        // newly opened map; the standard toggle returns to the same CLI.
        if (!shown) focus = 'cli';
        else if (size().cols < 88) focus = 'map';
        onResize();
      }
      if (dirty && !output.writableNeedDrain) {
        dirty = false; const g = geometry(); const left = g.cliWidth ? childRows(term, g.cliWidth, g.cliRows, selection) : [];
        const right = g.mapWidth ? options.panel.render(g.mapWidth, g.cliRows) : [];
        const title = `${focus === 'cli' ? '●' : '○'} ${options.command}${focus === 'cli' ? ' · 채팅 입력' : ''}  ${copyMode ? '[COPY: drag, y copies, Esc exits]' : term.scrollOffset ? `[scrollback ${term.scrollOffset}]` : ''}`;
        const top = g.cliWidth ? `${esc}1;38;5;151m${fit(title, g.cliWidth)}${esc}0m` : '';
        const lines = [top + (g.mapWidth ? `${g.cliWidth ? '│' : ''}${esc}1;38;5;151m${fit(`${(focus as string) === 'map' ? '●' : '○'} Brainpane`, g.mapWidth)}${esc}0m` : '')];
        for (let y = 0; y < g.cliRows; y++) lines.push((left[y] || '') + (g.mapWidth ? `${g.cliWidth ? `${esc}0;38;5;240m│${esc}0m` : ''}${right[y] || ' '.repeat(g.mapWidth)}` : ''));
        const prefixLabel = `Ctrl+${String.fromCharCode(options.prefix.charCodeAt(0) + 64)}`;
        const hint = prefixPending ? 'PREFIX: p panel · Tab focus · +/- width · c copy · u/d scroll · e live · q quit · ? help' : (focus as string) === 'map' ? `지도 탐색 중 · 채팅하려면 왼쪽 클릭 또는 ${prefixLabel} 누른 뒤 Tab` : help ? 'Map: ↑↓ select, ←→ fold, Enter details, e edit, s state, f follow, n current, r sync, x stop. Esc → chat' : status || `${prefixLabel} then: p panel / Tab focus / +/- width / ? help`;
        lines.push(`${esc}0;38;5;245m${fit(hint, g.cols)}${esc}0m`);
        const b = term.screen.buffer.active;
        const cursor = focus === 'cli' && !copyMode && !term.scrollOffset && term.cursorVisible && g.cliWidth ? { x: Math.min(g.cliWidth - 1, b.cursorX), y: Math.min(g.cliRows, b.cursorY + 1) } : null;
        output.write(painter.draw(lines, cursor));
      }
      await new Promise(r => setTimeout(r, 25));
      // Panel age / async updates are cheap; Painter emits only changed rows.
      dirty = true;
    }
  } finally {
    input.off('data', onInput); input.off('error', onError); output.off('error', onError); output.off('resize', onResize);
    process.off('SIGTERM', onSignal); process.off('SIGHUP', onSignal); process.off('SIGINT', onSignal);
    clearTimeout(escapeTimer!); term.dispose(); await options.panel.close().catch(() => {}); restore(); input.pause();
  }
  return exitCode;
}
