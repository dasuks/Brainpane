import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { applyPatch, createSession, Fault, id, sessionSchema, userEdit, validateTree, type Session } from './model.js';

export async function atomicWrite(path: string, content: string) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, content, { mode: 0o600 }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}
export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public dir: string) {}
  async init() { await mkdir(this.dir, { recursive: true, mode: 0o700 }); }
  private path(key: string) { return join(this.dir, `${id.parse(key)}.json`); }
  async get(key: string) {
    let raw: string;
    try { raw = await readFile(this.path(key), 'utf8'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Fault(404, 'Session not found'); throw e; }
    const state = sessionSchema.parse(JSON.parse(raw)); validateTree(state); return state;
  }
  async list() {
    const names = (await readdir(this.dir)).filter(n => n.endsWith('.json'));
    return Promise.all(names.map(async n => {
      const s = await this.get(n.slice(0, -5));
      return { id: s.id, goal: s.goal, active: s.active, binding: s.binding, updatedAt: s.updatedAt };
    }));
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn); this.queue = run.catch(() => {}); return run;
  }
  async create(input: unknown) {
    return this.serial(async () => {
      const s = createSession(input);
      try { await this.get(s.id); throw new Fault(409, 'Session already exists; use context/resume'); }
      catch (e) { if (!(e instanceof Fault && e.status === 404)) throw e; }
      await atomicWrite(this.path(s.id), JSON.stringify(s)); return s;
    });
  }
  async mutate(key: string, kind: 'publish' | 'edit' | 'active', input: unknown) {
    return this.serial(async () => {
      const old = await this.get(key); let next: Session;
      if (kind === 'publish') next = applyPatch(old, input, createHash('sha256').update(JSON.stringify(input)).digest('hex'));
      else if (kind === 'edit') next = userEdit(old, input);
      else {
        if (typeof input !== 'boolean') throw new Fault(422, 'Boolean active required');
        next = { ...old, active: input, version: old.version + 1, updatedAt: new Date().toISOString(), lastUpdateBy: 'user' };
      }
      if (next !== old) await atomicWrite(this.path(key), JSON.stringify(next));
      return next;
    });
  }
}
