/** Incremental host input framing, NOT an output/terminal emulator. */
export type Input = { type: 'key'; data: string } | { type: 'paste'; data: string } |
  { type: 'mouse'; button: number; x: number; y: number; release: boolean };
export class InputDecoder {
  private pending = '';
  private paste: string | null = null;
  constructor(private emit: (event: Input) => void) {}
  feed(data: string) {
    this.pending += data;
    while (this.pending) {
      if (this.paste !== null) {
        const end = this.pending.indexOf('\x1b[201~');
        if (end < 0) { const keep = Math.min(5, this.pending.length); this.paste += this.pending.slice(0, -keep); this.pending = this.pending.slice(-keep); return; }
        this.paste += this.pending.slice(0, end); this.emit({ type: 'paste', data: this.paste }); this.paste = null; this.pending = this.pending.slice(end + 6); continue;
      }
      if (this.pending.startsWith('\x1b[200~')) { this.paste = ''; this.pending = this.pending.slice(6); continue; }
      const mouse = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(this.pending);
      if (mouse) { this.emit({ type: 'mouse', button: +mouse[1], x: +mouse[2] - 1, y: +mouse[3] - 1, release: mouse[4] === 'm' }); this.pending = this.pending.slice(mouse[0].length); continue; }
      if (this.pending[0] === '\x1b') {
        if (this.pending.length === 1) return;
        if (this.pending[1] === '[') {
          const csi = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(this.pending);
          if (!csi) return;
          this.emit({ type: 'key', data: csi[0] }); this.pending = this.pending.slice(csi[0].length); continue;
        }
        if (this.pending[1] === 'O' && this.pending.length < 3) return;
        const length = this.pending[1] === 'O' ? 3 : 2;
        this.emit({ type: 'key', data: this.pending.slice(0, length) }); this.pending = this.pending.slice(length); continue;
      }
      const char = String.fromCodePoint(this.pending.codePointAt(0)!);
      this.emit({ type: 'key', data: char }); this.pending = this.pending.slice(char.length);
    }
  }
  flushEscape() { if (this.pending === '\x1b' && this.paste === null) { this.pending = ''; this.emit({ type: 'key', data: '\x1b' }); } }
}
