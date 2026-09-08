import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPatch, createSession, userEdit, validateTree, type Patch } from '../src/core/model';
import { Store } from '../src/core/store';
import { browse, emptyView, placeNew, visible } from '../src/web/view';

const create = (id = 'test') => ({ id, goal: 'Understand this conversation', rootTitle: 'Original question', binding: { cli: 'codex', conversation: 'explicit test label' } });
const topic = (id: string, parentId = 'root') => ({ id, parentId, title: id, summary: '', progress: '', remaining: '', status: 'open' as const, sources: [], statements: [] });
const patch = (operations: Patch['operations'], baseVersion = 0, updateId = 'one') => ({ updateId, baseVersion, operations });
test('atomic validation: unknown fields, invalid focus/parent and cycles leave input untouched', () => {
  const s = createSession(create()); const before = structuredClone(s);
  for (const p of [
    patch([{ type: 'focus', topicId: 'missing', certainty: 'inferred', reason: null }]),
    patch([{ type: 'add', topic: topic('child', 'missing') }]),
    patch([{ type: 'add', topic: topic('a', 'b') }, { type: 'add', topic: topic('b', 'a') }]),
    { ...patch([{ type: 'add', topic: topic('good') }]), viewport: { zoom: 1 } },
  ]) { assert.throws(() => applyPatch(s, p, 'hash')); assert.deepEqual(s, before); }
});
test('idempotence, reused update IDs and stale updates', () => {
  const p = patch([{ type: 'add', topic: topic('branch') }]);
  const s = applyPatch(createSession(create()), p, 'hash');
  assert.equal(applyPatch(s, p, 'hash'), s);
  assert.throws(() => applyPatch(s, p, 'different'), /different content/);
  assert.throws(() => applyPatch(s, { ...p, updateId: 'two' }, 'other'), /Version conflict/);
  assert.equal(s.topics.length, 2);
});
test('user corrections lock only edited fields; blocked AI patch is atomic', () => {
  const s = userEdit(createSession(create()), { baseVersion: 0, topicId: 'root', title: 'My title' });
  assert.deepEqual(s.topics[0].locks, ['title']);
  assert.throws(() => applyPatch(s, patch([{ type: 'edit', topicId: 'root', changes: { title: 'AI title', summary: 'changed' } }], 1), 'h'), /User-protected/);
  assert.equal(s.topics[0].summary, '');
  const next = applyPatch(s, patch([{ type: 'edit', topicId: 'root', changes: { summary: 'New public context' } }], 1), 'h');
  assert.equal(next.topics[0].title, 'My title');
});
test('decision provenance requires actual captured user source structure; suggestions stay proposals', () => {
  const s = createSession(create());
  assert.throws(() => applyPatch(s, patch([{ type: 'edit', topicId: 'root', changes: { statements: [{ kind: 'decision', text: 'Web selected', sourceId: 'absent' }] } }]), 'h'), /user evidence/);
  const next = applyPatch(s, patch([{ type: 'edit', topicId: 'root', changes: { statements: [{ kind: 'proposal', text: 'Web could work' }] } }]), 'h');
  assert.equal(next.topics[0].status, 'open');
});
test('selection and stable layout survive focus and content changes', () => {
  let s = createSession(create());
  s = applyPatch(s, patch([{ type: 'add', topic: topic('branch') }, { type: 'focus', topicId: 'branch', certainty: 'confirmed', reason: null }]), 'h');
  const positions = placeNew(s, {}); const view = browse({ ...emptyView(), positions }, 'root');
  assert.equal(s.focusTopicId, 'branch'); assert.equal(view.selectedTopicId, 'root');
  const next = applyPatch(s, patch([{ type: 'edit', topicId: 'branch', changes: { summary: 'More detail' } }], 1, 'two'), 'h2');
  assert.deepEqual(placeNew(next, positions), positions);
  assert.equal(visible(next, 'branch', ['root']), false);
  const added = applyPatch(next, patch([{ type: 'add', topic: topic('third') }], 2, 'three'), 'h3');
  assert.deepEqual(placeNew(added, positions).branch, positions.branch);
});
test('eight-turn fixture: branch reuse, deferral, proposals and original goal', async () => {
  const fixture = JSON.parse(await readFile('fixtures/demo.json', 'utf8'));
  let s = createSession({ ...fixture.session, id: 'demo' });
  for (const turn of fixture.turns) {
    s = applyPatch(s, turn.patch, `h${turn.step}`);
    if (turn.step >= 4) assert.equal(s.topics.find(t => t.id === 'compatibility')?.status, 'open');
    if (turn.step === 5) assert.equal(s.topics.find(t => t.id === 'visibility')?.statements[0].kind, 'proposal');
  }
  assert.equal(s.focusTopicId, 'visibility'); assert.equal(s.topics.length, 5);
  assert.equal(s.topics.find(t => t.id === 'cost')?.status, 'parked');
  assert.equal(s.topics.find(t => t.id === 'visibility')?.status, 'open');
  assert.equal(s.goal, s.originalGoal); assert.equal(s.topics.flatMap(t => t.statements).filter(c => c.kind === 'decision').length, 0);
  validateTree(s);
});
test('storage restore, isolation, concurrent conflicts and stopped sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brainpane-store-'));
  try {
    const store = new Store(dir); await store.init(); await store.create(create('a')); await store.create(create('b'));
    const p = patch([{ type: 'add', topic: topic('branch') }]);
    const results = await Promise.allSettled([store.mutate('a', 'publish', p), store.mutate('a', 'publish', { ...p, updateId: 'second' })]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const restored = new Store(dir); assert.equal((await restored.get('a')).topics.length, 2);
    assert.equal((await restored.get('b')).version, 0);
    await store.mutate('a', 'active', false);
    await assert.rejects(store.mutate('a', 'publish', { ...p, baseVersion: 2, updateId: 'stopped' }), /stopped/);
    await assert.rejects(store.get('../a'));
    assert.equal((await restored.get('a')).version, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
