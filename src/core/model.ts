import { z } from 'zod';

export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const short = z.string().trim().min(1).max(140);
const prose = z.string().max(1200);
export const statusSchema = z.enum(['open', 'resolved', 'parked']);
export const sourceSchema = z.object({ id, role: z.enum(['user', 'assistant']), text: z.string().min(1).max(4000) }).strict();
const statement = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('proposal'), text: prose }).strict(),
  z.object({ kind: z.literal('decision'), text: prose, sourceId: id }).strict(),
]);
const presentation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('flow'), steps: z.array(z.object({ text: short, sourceId: id }).strict()).min(2).max(8), certainty: z.enum(['proposal', 'confirmed']) }).strict(),
  z.object({ kind: z.literal('table'), columns: z.array(short).min(2).max(4), rows: z.array(z.object({ cells: z.array(short).min(2).max(4), sourceId: id }).strict()).min(1).max(8) }).strict(),
]);
const fields = { title: short, summary: prose, progress: prose, remaining: prose,
  presentation: presentation.nullable().optional(),
  status: statusSchema, sources: z.array(sourceSchema).max(20), statements: z.array(statement).max(20) };
export const topicSchema = z.object({ id, parentId: id.nullable(), ...fields,
  locks: z.array(z.enum(['title', 'status'])).max(2) }).strict();
const changes = z.object(fields).partial().strict().refine(v => Object.keys(v).length > 0, 'Empty changes');
export const patchSchema = z.object({
  updateId: id, baseVersion: z.number().int().nonnegative(),
  operations: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('add'), topic: topicSchema.omit({ locks: true }) }).strict(),
    z.object({ type: z.literal('edit'), topicId: id, changes }).strict(),
    z.object({ type: z.literal('focus'), topicId: id, certainty: z.enum(['confirmed', 'inferred']), reason: prose.nullable() }).strict(),
    z.object({ type: z.literal('goal'), goal: short, evidence: sourceSchema.refine(s => s.role === 'user', 'User evidence required') }).strict(),
  ])).min(1).max(30),
}).strict();
export const createSchema = z.object({ id, goal: short, rootTitle: short, waitingForGoal: z.boolean().optional(),
  binding: z.object({ cli: z.enum(['codex', 'claude', 'demo']), conversation: short }).strict() }).strict();
export const sessionSchema = z.object({
  id, goal: short, originalGoal: short, goalHistory: z.array(z.object({ goal: short, evidence: sourceSchema }).strict()),
  binding: createSchema.shape.binding, rootTopicId: id, focusTopicId: id,
  certainty: z.enum(['confirmed', 'inferred']), reason: prose.nullable(), active: z.boolean(),
  version: z.number().int().nonnegative(), updatedAt: z.string().datetime(), lastAgentUpdateAt: z.string().datetime().nullable().default(null), waitingForGoal: z.boolean().default(false),
  lastUpdateBy: z.enum(['agent', 'user', 'system']), topics: z.array(topicSchema).min(1).max(300),
  receipts: z.array(z.object({ id, hash: z.string() }).strict()).max(10000),
}).strict();
export type Session = z.infer<typeof sessionSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Patch = z.infer<typeof patchSchema>;
export class Fault extends Error { constructor(public status: number, message: string) { super(message); } }
export function validateTree(s: Session) {
  const nodes = new Map(s.topics.map(t => [t.id, t]));
  if (nodes.size !== s.topics.length) throw new Fault(422, 'Duplicate topic ID');
  if (!nodes.has(s.focusTopicId) || !nodes.has(s.rootTopicId)) throw new Fault(422, 'Unknown root/focus');
  for (const t of s.topics) {
    if ((t.id === s.rootTopicId) !== (t.parentId === null)) throw new Fault(422, 'Exactly one preserved root required');
    const seen = new Set<string>(); let cursor: Topic | undefined = t;
    while (cursor) {
      if (seen.has(cursor.id)) throw new Fault(422, 'Cyclic hierarchy');
      seen.add(cursor.id);
      if (cursor.parentId && !nodes.has(cursor.parentId)) throw new Fault(422, 'Unknown parent');
      cursor = cursor.parentId ? nodes.get(cursor.parentId) : undefined;
    }
    if (new Set(t.sources.map(s => s.id)).size !== t.sources.length) throw new Fault(422, 'Duplicate source ID');
    for (const claim of t.statements) if (claim.kind === 'decision' && !t.sources.some(s => s.id === claim.sourceId && s.role === 'user'))
      throw new Fault(422, 'A decision requires captured user evidence on the topic');
    if (t.presentation) {
      const refs = t.presentation.kind === 'flow' ? t.presentation.steps : t.presentation.rows;
      if (refs.some(r => !t.sources.some(s => s.id === r.sourceId))) throw new Fault(422, 'Presentation needs captured source evidence');
      const p = t.presentation;
      if (p.kind === 'table' && p.rows.some(r => r.cells.length !== p.columns.length)) throw new Fault(422, 'Table column count mismatch');
    }
  }
}
export function createSession(input: unknown): Session {
  const c = createSchema.parse(input);
  return { id: c.id, goal: c.goal, originalGoal: c.goal, goalHistory: [], binding: c.binding,
    rootTopicId: 'root', focusTopicId: 'root', certainty: 'confirmed', reason: null,
    active: true, version: 0, updatedAt: new Date().toISOString(), lastAgentUpdateAt: null, waitingForGoal: c.waitingForGoal || false, lastUpdateBy: 'system', receipts: [],
    topics: [{ id: 'root', parentId: null, title: c.rootTitle, summary: '', progress: '', remaining: '', status: 'open', sources: [], statements: [], locks: [] }] };
}
export function applyPatch(previous: Session, input: unknown, hash: string): Session {
  const p = patchSchema.parse(input);
  const receipt = previous.receipts.find(r => r.id === p.updateId);
  if (receipt) {
    if (receipt.hash !== hash) throw new Fault(409, 'Update ID already used with different content');
    return previous;
  }
  if (!previous.active) throw new Fault(409, 'Mapping stopped');
  if (p.baseVersion !== previous.version) throw new Fault(409, 'Version conflict: read context and rebuild patch');
  const next = structuredClone(previous);
  for (const op of p.operations) {
    if (op.type === 'add') {
      if (next.topics.some(t => t.id === op.topic.id)) throw new Fault(409, 'Topic already exists; edit/reuse its ID');
      next.topics.push({ ...op.topic, locks: [] });
    } else if (op.type === 'edit') {
      const t = next.topics.find(t => t.id === op.topicId);
      if (!t) throw new Fault(422, 'Unknown topic');
      if (t.locks.some(k => k in op.changes && op.changes[k] !== t[k])) throw new Fault(409, 'User-protected field: keep the user value');
      Object.assign(t, op.changes);
    } else if (op.type === 'focus') {
      next.focusTopicId = op.topicId; next.certainty = op.certainty; next.reason = op.reason;
    } else {
      if (next.waitingForGoal) { next.originalGoal = op.goal; next.waitingForGoal = false; }
      next.goalHistory.push({ goal: op.goal, evidence: op.evidence }); next.goal = op.goal;
    }
  }
  next.version++; next.updatedAt = new Date().toISOString(); next.lastAgentUpdateAt = next.updatedAt; next.lastUpdateBy = 'agent';
  next.receipts.push({ id: p.updateId, hash });
  sessionSchema.parse(next); validateTree(next);
  return next;
}
export const userEditSchema = z.object({ baseVersion: z.number().int().nonnegative(), topicId: id,
  title: short.optional(), status: statusSchema.optional() }).strict();
export function userEdit(previous: Session, input: unknown): Session {
  const p = userEditSchema.parse(input);
  if (p.baseVersion !== previous.version) throw new Fault(409, 'Version conflict: reload and retry');
  const next = structuredClone(previous); const t = next.topics.find(t => t.id === p.topicId);
  if (!t) throw new Fault(422, 'Unknown topic');
  for (const key of ['title', 'status'] as const) if (p[key] !== undefined) {
    Object.assign(t, { [key]: p[key] }); if (!t.locks.includes(key)) t.locks.push(key);
  }
  next.version++; next.updatedAt = new Date().toISOString(); next.lastUpdateBy = 'user'; return next;
}
