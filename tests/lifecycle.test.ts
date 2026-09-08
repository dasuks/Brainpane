import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server/server.js';

test('bound panel lifecycle activates explicitly, preserves history, stops writes and rejects other sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brainpane-lifecycle-')), events: any[] = [];
  const server = await startServer({ dataDir: dir, webDir: '', port: 0, serveWeb: false, terminalSession: 'bound', onEvent: e => events.push(e) });
  const call = async (id: string, route: string, body: unknown) => fetch(`${server.origin}/api/sessions/${id}/${route}`, {
    method: 'POST', headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    for (const id of ['bound', 'other']) await server.store.create({ id, goal: 'waiting', rootTitle: 'waiting', waitingForGoal: true, active: false, binding: { cli: 'codex', conversation: id } });
    const patch = { updateId: 'before-start', baseVersion: 0, operations: [{ type: 'edit', topicId: 'root', changes: { title: 'should not apply' } }] };
    assert.equal((await call('bound', 'publish', patch)).status, 409);
    assert.equal((await server.store.get('bound')).version, 0);
    assert.equal((await call('bound', 'panel', { action: 'ready' })).status, 409);
    assert.equal((await call('other', 'panel', { action: 'open' })).status, 404);
    assert.equal((await server.store.get('other')).active, false);
    assert.equal((await call('bound', 'panel', { action: 'open', focusTopicId: 'other' })).status, 422);
    assert.equal((await call('bound', 'panel', { action: 'open' })).status, 200);
    assert.equal((await call('bound', 'panel', { action: 'open' })).status, 200);
    assert.equal((await server.store.get('bound')).version, 1);
    assert.equal((await call('bound', 'panel', { action: 'ready' })).status, 200);
    assert.equal((await server.store.get('bound')).version, 1);
    const initial = { updateId: 'retroactive', baseVersion: 1, operations: [
      { type: 'goal', goal: 'Original public question', evidence: { id: 'actual-user', role: 'user', text: 'Original public question' } },
      { type: 'edit', topicId: 'root', changes: { title: 'Original topic' } },
    ] };
    assert.equal((await call('bound', 'publish', initial)).status, 200);
    assert.equal((await call('bound', 'panel', { action: 'hide' })).status, 200);
    assert.equal((await server.store.get('bound')).active, true);
    assert.equal((await call('bound', 'panel', { action: 'close' })).status, 200);
    const stopped = await server.store.get('bound');
    assert.equal(stopped.active, false);
    assert.equal((await call('bound', 'panel', { action: 'sync' })).status, 409);
    assert.equal((await call('bound', 'publish', { ...patch, baseVersion: stopped.version })).status, 409);
    assert.equal((await call('bound', 'panel', { action: 'open' })).status, 200);
    assert.equal((await server.store.get('bound')).originalGoal, 'Original public question');
    assert.deepEqual(events.filter(e => e.type === 'panel').map(e => e.action), ['open', 'open', 'ready', 'hide', 'close', 'open']);
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
