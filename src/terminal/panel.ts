import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from '../core/store.js';
import type { Session, Topic } from '../core/model.js';
import { clean, esc, fit, wrap } from './render.js';
import type { Panel } from './app.js';

export type MapView = { selected: string | null; collapsed: string[]; follow: boolean; topId: string | null; detail: boolean; detailScroll: number };
export const newMapView = (): MapView => ({ selected: null, collapsed: [], follow: false, topId: null, detail: false, detailScroll: 0 });
export function topicPath(s: Session, id: string): Topic[] {
  const path: Topic[] = []; let t = s.topics.find(t => t.id === id);
  while (t) { path.unshift(t); t = s.topics.find(n => n.id === t!.parentId); } return path;
}
export function treeRows(s: Session, view: MapView) {
  const rows: { id: string; text: string; focus: boolean; selected: boolean; inside: boolean }[] = [];
  const path = topicPath(s, s.focusTopicId).map(t => t.id);
  const visit = (t: Topic, prefix: string, last: boolean, root = false) => {
    const children = s.topics.filter(n => n.parentId === t.id); const folded = view.collapsed.includes(t.id);
    const inside = folded && path.includes(t.id) && t.id !== s.focusTopicId;
    rows.push({ id: t.id, text: `${root ? '' : prefix + (last ? '└─ ' : '├─ ')}${children.length ? folded ? '+ ' : '− ' : ''}${t.title}${t.id === s.focusTopicId ? ' ◀ 지금' : inside ? ' ◀ 안에서 대화 중' : t.status === 'parked' ? ' Ⅱ 보류' : t.status === 'resolved' ? ' ✓ 해결' : ' ○'}`,
      focus: t.id === s.focusTopicId, selected: view.selected === t.id, inside });
    if (!folded) children.forEach((c, i) => visit(c, root ? '' : prefix + (last ? '   ' : '│  '), i === children.length - 1));
  };
  visit(s.topics.find(t => t.id === s.rootTopicId)!, '', true, true); return rows;
}
export function topicDetail(t: Topic, width: number): string[] {
  const lines: string[] = [];
  const paragraph = (label: string, value: string) => { lines.push(label, ...wrap(value || '아직 기록되지 않았습니다.', width), ''); };
  paragraph('이야기한 내용', t.summary); paragraph('어디까지 왔나요', t.progress);
  for (const c of t.statements) paragraph(c.kind === 'proposal' ? '[제안]' : '[결정 · 사용자 근거]', c.text);
  paragraph('남은 질문', t.remaining);
  if (t.presentation?.kind === 'flow') {
    const presentation = t.presentation;
    lines.push(t.presentation.certainty === 'proposal' ? '[검토 중인 흐름]' : '[대화에서 확인한 흐름]');
    t.presentation.steps.forEach((step, i) => {
      const w = Math.max(4, width - 2); lines.push(`┌${'─'.repeat(w)}┐`, ...wrap(step.text, w - 2).map(r => `│ ${fit(r, w - 2)} │`), `└${'─'.repeat(w)}┘`);
      if (i < presentation.steps.length - 1) lines.push(`${' '.repeat(Math.floor(width / 2))}↓`);
    }); lines.push('');
  }
  if (t.presentation?.kind === 'table') {
    const p = t.presentation; const w = Math.max(3, Math.floor((width - p.columns.length - 1) / p.columns.length));
    const border = (a: string, b: string, c: string) => a + p.columns.map(() => '─'.repeat(w)).join(b) + c;
    const tableRow = (cells: string[]) => {
      const all = cells.map(c => wrap(c, w));
      for (let row = 0; row < Math.max(...all.map(x => x.length)); row++) lines.push('│' + all.map(x => fit(x[row] || '', w)).join('│') + '│');
    };
    lines.push(border('┌', '┬', '┐')); tableRow(p.columns); lines.push(border('├', '┼', '┤'));
    p.rows.forEach(r => tableRow(r.cells)); lines.push(border('└', '┴', '┘'), '');
  }
  lines.push('확보된 공개 원문');
  if (!t.sources.length) lines.push(...wrap('요약만 제공 · 원문 출처 연결 미지원', width));
  for (const source of t.sources) lines.push(`[${source.role} · ${source.id}]`, ...wrap(source.text, width), '');
  return lines;
}
export class MapPanel implements Panel {
  view = newMapView(); error = ''; notice = ''; private rowIds = new Map<number, string>();
  private editTitle: string | null = null; private busy = false; private saveQueue = Promise.resolve();
  private lastFocus: string; private seen = new Set<string>(); private availableRows = 10;
  constructor(public state: Session, private dataDir: string,
    private mutate: (kind: 'edit' | 'active', value: unknown) => Promise<Session>) { this.lastFocus = state.focusTopicId; }
  async init() {
    try {
      const v = JSON.parse(await readFile(join(this.dataDir, 'view.json'), 'utf8'));
      if (typeof v.follow === 'boolean' && Array.isArray(v.collapsed) && v.collapsed.every((x: unknown) => typeof x === 'string') &&
        (v.selected === null || typeof v.selected === 'string') && (v.topId === null || typeof v.topId === 'string') && typeof v.detail === 'boolean' && Number.isInteger(v.detailScroll) && v.detailScroll >= 0) this.view = v;
    } catch {}
    this.update(this.state);
  }
  update(state: Session) {
    if (state.id !== this.state.id || state.version < this.state.version) return;
    const prior = this.state.focusTopicId; this.state = state;
    const path = topicPath(state, state.focusTopicId).map(t => t.id);
    for (const t of state.topics) if (!this.seen.has(t.id)) {
      this.seen.add(t.id);
      if (!path.includes(t.id) && state.topics.some(n => n.parentId === t.id) && !this.view.collapsed.includes(t.id)) this.view.collapsed.push(t.id);
    }
    if (this.view.follow && this.lastFocus !== state.focusTopicId && (this.view.selected === null || this.view.selected === prior)) {
      this.view.selected = null; this.view.topId = state.focusTopicId; this.view.collapsed = this.view.collapsed.filter(k => !path.includes(k));
    }
    this.lastFocus = state.focusTopicId; this.error = '';
  }
  private save() {
    const content = JSON.stringify(this.view);
    this.saveQueue = this.saveQueue.then(() => atomicWrite(join(this.dataDir, 'view.json'), content)).catch(() => { this.error = '화면 상태 저장 실패'; });
  }
  private selectedTopic() { return this.state.topics.find(t => t.id === (this.view.selected || this.state.focusTopicId)) || this.state.topics[0]; }
  private async change(kind: 'edit' | 'active', value: unknown) {
    this.busy = true;
    try { this.update(await this.mutate(kind, value)); this.editTitle = null; }
    catch (e) { this.error = (e as Error).message; }
    finally { this.busy = false; }
  }
  input(data: string): boolean {
    if (this.editTitle !== null) {
      if (data === '\x1b') this.editTitle = null;
      else if (data === '\r' && this.editTitle.trim() && !this.busy) void this.change('edit', { baseVersion: this.state.version, topicId: this.selectedTopic().id, title: this.editTitle.trim() });
      else if (data === '\x7f' || data === '\b') this.editTitle = [...this.editTitle].slice(0, -1).join('');
      else if (!data.startsWith('\x1b') && data >= ' ') this.editTitle = (this.editTitle + clean(data)).slice(0, 140);
      return true;
    }
    const rows = treeRows(this.state, this.view); const current = this.selectedTopic(); const index = rows.findIndex(r => r.id === current.id);
    if (data === '\x1b' && this.view.detail) { this.view.detail = false; this.save(); return true; }
    if (data === '\x1b') return false;
    if (data === '\r') { this.view.detail = !this.view.detail; this.view.detailScroll = 0; }
    else if (data === 'n') { this.view.selected = null; this.view.collapsed = this.view.collapsed.filter(k => !topicPath(this.state, this.state.focusTopicId).some(t => t.id === k)); this.view.topId = this.state.focusTopicId; }
    else if (data === 'f') this.view.follow = !this.view.follow;
    else if (data === 'e') this.editTitle = current.title;
    else if (data === 's' && !this.busy) { const states = ['open', 'resolved', 'parked']; void this.change('edit', { baseVersion: this.state.version, topicId: current.id, status: states[(states.indexOf(current.status) + 1) % 3] }); }
    else if (data === 'x' && !this.busy) { void this.change('active', !this.state.active); this.notice = 'CLI에도 brainpane stop을 말하면 추가 지도 작업을 멈춥니다.'; }
    else if (data === 'r') this.notice = `왼쪽에 입력: ${this.state.binding.cli === 'claude' ? '/brainpane' : '$brainpane'} sync (현재 지도 ${this.state.id})`;
    else if (data === '\x1b[D' || data === 'h') { if (!this.view.collapsed.includes(current.id)) this.view.collapsed.push(current.id); }
    else if (data === '\x1b[C' || data === 'l') this.view.collapsed = this.view.collapsed.filter(k => k !== current.id);
    else if (['\x1b[A', '\x1b[B', 'j', 'k', '\x1b[5~', '\x1b[6~'].includes(data)) {
      const up = data === '\x1b[A' || data === 'k' || data === '\x1b[5~';
      const step = data.endsWith('~') ? this.availableRows : 1;
      if (this.view.detail) this.view.detailScroll = Math.max(0, this.view.detailScroll + (up ? -step : step));
      else {
        const next = Math.max(0, Math.min(rows.length - 1, index + (up ? -step : step))); this.view.selected = rows[next].id;
        const top = Math.max(0, rows.findIndex(r => r.id === this.view.topId));
        if (next < top || next >= top + this.availableRows) this.view.topId = rows[Math.max(0, next - (up ? 0 : this.availableRows - 1))].id;
      }
    }
    this.save(); return true;
  }
  click(row: number) { const id = this.rowIds.get(row); if (id) { this.view.selected = id; this.save(); } }
  render(width: number, height: number) {
    const w = Math.max(1, width - 2), lines: string[] = []; this.rowIds.clear();
    const plain = (s: string, color = '37') => `${esc}${color}m ${fit(s, w)} ${esc}0m`;
    const add = (s: string, color?: string) => lines.push(plain(s, color));
    const s = this.state; const selected = this.selectedTopic();
    const currentPath = topicPath(s, s.focusTopicId).map(t => t.title).join(' → ');
    for (const row of wrap(s.waitingForGoal ? '출발점: 첫 질문을 기다립니다' : `출발점: ${s.originalGoal}`, w).slice(0, 3)) add(row, '38;5;245');
    add('');
    add(`${s.active ? '◉ 지금' : 'Ⅱ 중단'}${s.certainty === 'inferred' ? ' · 추정' : ''}`, '1;38;5;151');
    for (const row of wrap(currentPath, w).slice(-2)) add(row, '1;38;5;151');
    add('─'.repeat(w), '38;5;240');
    if (this.editTitle !== null) {
      add('제목 수정 · Enter 저장 · Esc 취소');
      for (const row of wrap(this.editTitle + '▏', w)) add(row, '7');
      add('수정한 제목은 AI 덮어쓰기에서 보호됩니다.');
    } else {
      const footer = [this.error ? `! 갱신 실패: ${this.error}` : this.notice,
        `${s.lastAgentUpdateAt ? `AI 갱신 ${new Date(s.lastAgentUpdateAt).toLocaleTimeString('ko-KR')}` : 'AI 갱신 대기'} · v${s.version}`,
        `${this.view.follow ? '추적 켜짐' : '추적 꺼짐'} · ${this.view.selected && this.view.selected !== s.focusTopicId ? '과거 가지 탐색 중' : '현재 가지 보기'}`,
        '↑↓ 선택 · ←→ 접기 · Enter 상세 · n 현재'];
      this.availableRows = Math.max(1, height - lines.length - footer.length - 1);
      if (this.view.detail) {
        add(`상세: ${topicPath(s, selected.id).map(t => t.title).join(' → ')}`, '38;5;180');
        const details = topicDetail(selected, w);
        this.view.detailScroll = Math.min(this.view.detailScroll, Math.max(0, details.length - this.availableRows + 1));
        for (const row of details.slice(this.view.detailScroll, this.view.detailScroll + this.availableRows - 1)) add(row);
      } else {
        const rows = treeRows(s, this.view); const start = Math.max(0, rows.findIndex(r => r.id === this.view.topId));
        for (const row of rows.slice(start, start + this.availableRows)) {
          this.rowIds.set(lines.length, row.id);
          add(row.text, row.selected ? '7' : row.focus || row.inside ? '1;38;5;151' : '38;5;250');
        }
      }
      while (lines.length < height - footer.length) add('');
      for (const row of footer) add(row || '', row.startsWith('!') ? '38;5;209' : '38;5;245');
    }
    while (lines.length < height) add(''); return lines.slice(0, height);
  }
  async close() { this.save(); await this.saveQueue; }
}
