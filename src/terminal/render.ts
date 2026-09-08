import stringWidth from 'string-width';
import type { IBufferCell } from '@xterm/headless';
import type { EmbeddedTerminal } from './child.js';

export type Row = string;
export const esc = '\x1b[';
export const clean = (s: string) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
export function fit(text: string, width: number) {
  let result = '', used = 0;
  for (const char of clean(text)) { const w = stringWidth(char); if (used + w > width) break; result += char; used += w; }
  return result + ' '.repeat(Math.max(0, width - used));
}
export function wrap(text: string, width: number) {
  if (width < 1) return [];
  const rows: string[] = []; let row = '', used = 0;
  for (const char of clean(text)) { const w = stringWidth(char); if (used + w > width) { rows.push(row); row = ''; used = 0; } row += char; used += w; }
  if (row) rows.push(row); return rows;
}
function style(cell: IBufferCell) {
  const codes = [0];
  if (cell.isBold()) codes.push(1); if (cell.isDim()) codes.push(2); if (cell.isItalic()) codes.push(3);
  if (cell.isUnderline()) codes.push(4); if (cell.isInverse()) codes.push(7); if (cell.isInvisible()) codes.push(8); if (cell.isStrikethrough()) codes.push(9);
  for (const fg of [true, false]) {
    const value = fg ? cell.getFgColor() : cell.getBgColor();
    if (fg ? cell.isFgRGB() : cell.isBgRGB()) codes.push(fg ? 38 : 48, 2, (value >> 16) & 255, (value >> 8) & 255, value & 255);
    else if (fg ? cell.isFgPalette() : cell.isBgPalette()) codes.push(fg ? 38 : 48, 5, value);
    else codes.push(fg ? 39 : 49);
  }
  return `${esc}${codes.join(';')}m`;
}
export type Selection = { start: { x: number; y: number }; end: { x: number; y: number } };
export function selected(selection: Selection | null, x: number, y: number, cols: number) {
  if (!selection) return false;
  const a = selection.start.y * cols + selection.start.x, b = selection.end.y * cols + selection.end.x, at = y * cols + x;
  return at >= Math.min(a, b) && at <= Math.max(a, b);
}
export function childRows(term: EmbeddedTerminal, cols: number, rows: number, selection: Selection | null = null) {
  const buffer = term.screen.buffer.active; const start = Math.max(0, buffer.baseY - term.scrollOffset); const result: Row[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '', previous = ''; const cells = buffer.getLine(start + y);
    for (let x = 0; x < cols; x++) {
      const cell = cells?.getCell(x);
      if (!cell) { line += ' '; continue; }
      if (cell.getWidth() === 0) continue;
      const current = style(cell) + (selected(selection, x, y, cols) ? `${esc}7m` : '');
      if (current !== previous) { line += current; previous = current; }
      // Cell content only. OSC, cursor movement, erase and title commands cannot escape this layer.
      line += cell.getWidth() === 2 && x === cols - 1 ? ' ' : clean(cell.getChars()) || ' ';
    }
    result.push(line + `${esc}0m`);
  }
  return result;
}
export function selectionText(term: EmbeddedTerminal, selection: Selection) {
  const cols = term.screen.cols, buffer = term.screen.buffer.active;
  const a = selection.start.y * cols + selection.start.x, b = selection.end.y * cols + selection.end.x;
  const low = Math.min(a, b), high = Math.max(a, b); const lines = [];
  for (let y = Math.floor(low / cols); y <= Math.floor(high / cols); y++) {
    const line = buffer.getLine(Math.max(0, buffer.baseY - term.scrollOffset) + y);
    lines.push(line?.translateToString(true, y === Math.floor(low / cols) ? low % cols : 0, y === Math.floor(high / cols) ? high % cols + 1 : cols) || '');
  }
  return lines.join('\n');
}
export class Painter {
  private previous: string[] = [];
  private lastCursor = '';
  invalidate() { this.previous = []; this.lastCursor = ''; }
  draw(rows: Row[], cursor: { x: number; y: number } | null): string {
    const cursorKey = JSON.stringify(cursor);
    if (this.lastCursor === cursorKey && rows.length === this.previous.length && rows.every((row, i) => row === this.previous[i])) return '';
    this.lastCursor = cursorKey;
    let output = `${esc}?25l`;
    for (let y = 0; y < rows.length; y++) if (this.previous[y] !== rows[y]) output += `${esc}${y + 1};1H${rows[y]}${esc}0m`;
    this.previous = rows;
    if (cursor) output += `${esc}${cursor.y + 1};${cursor.x + 1}H${esc}?25h`;
    return output;
  }
}
