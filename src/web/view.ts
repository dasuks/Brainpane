import type { Session } from '../core/model';
export type Point = { x: number; y: number };
export type ViewState = { selectedTopicId: string | null; positions: Record<string, Point>; collapsed: string[];
  viewport: { x: number; y: number; zoom: number }; follow: boolean };
export const emptyView = (): ViewState => ({ selectedTopicId: null, positions: {}, collapsed: [], viewport: { x: 45, y: 65, zoom: 0.85 }, follow: false });
export function readView(key: string): ViewState {
  try {
    const v = JSON.parse(localStorage.getItem(`brainpane:view:${key}`) || 'null');
    if (v && typeof v.follow === 'boolean' && Array.isArray(v.collapsed) && v.collapsed.every((x: unknown) => typeof x === 'string') &&
      (v.selectedTopicId === null || typeof v.selectedTopicId === 'string') && v.positions &&
      Object.values(v.positions).every((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
      [v.viewport?.x, v.viewport?.y, v.viewport?.zoom].every(Number.isFinite) && v.viewport.zoom >= 0.2 && v.viewport.zoom <= 2) return v;
  } catch { /* corrupt/disabled browser storage starts a fresh view */ }
  return emptyView();
}
export function pathTo(s: Session, key: string): string[] {
  const path: string[] = []; let t = s.topics.find(t => t.id === key);
  while (t) { path.unshift(t.id); t = s.topics.find(n => n.id === t!.parentId); }
  return path;
}
export function placeNew(s: Session, old: Record<string, Point>): Record<string, Point> {
  const positions = { ...old };
  for (const t of s.topics) if (!Object.hasOwn(positions, t.id)) {
    const depth = pathTo(s, t.id).length - 1;
    const x = depth * 310; let y = t.parentId ? positions[t.parentId]?.y || 0 : 0;
    while (Object.values(positions).some(p => Math.abs(p.x - x) < 285 && Math.abs(p.y - y) < 155)) y += 165;
    positions[t.id] = { x, y };
  }
  return positions;
}
export function browse(view: ViewState, key: string): ViewState { return { ...view, selectedTopicId: key }; }
export function visible(s: Session, key: string, collapsed: string[]) { return !pathTo(s, key).slice(0, -1).some(p => collapsed.includes(p)); }
