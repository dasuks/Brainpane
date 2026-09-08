import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { request as httpRequest } from 'node:http';
import { startServer } from '../src/server/server';

test('CLI publish → durable snapshot → SSE, access controls and restart recovery', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brainpane-http-'));
  let server = await startServer({ dataDir: dir, webDir: resolve('dist/web'), port: 0 });
  const abort = new AbortController();
  try {
    const call = (path: string, payload?: unknown, extra = {}) => fetch(server.origin + path, {
      method: payload === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json', ...extra },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    assert.equal((await fetch(server.origin + '/api/sessions')).status, 401);
    assert.equal((await call('/api/sessions', undefined, { Origin: 'https://evil.example' })).status, 403);
    const invalidHost = await new Promise<number | undefined>((ok, fail) => {
      const req = httpRequest(server.origin + '/api/sessions', { headers: { Host: 'evil.example', Authorization: `Bearer ${server.token}` } }, res => { res.resume(); ok(res.statusCode); });
      req.on('error', fail); req.end();
    });
    assert.equal(invalidHost, 403);
    assert.equal((await call('/api/files?path=C:/private')).status, 404);
    assert.equal((await call('/api/sessions', { id: 'live', goal: 'Live flow', rootTitle: 'Original', binding: { cli: 'codex', conversation: 'integration test' } })).status, 201);
    const response = await fetch(server.origin + '/api/events', { headers: { Authorization: `Bearer ${server.token}` }, signal: abort.signal });
    const reader = response.body!.getReader(); await reader.read();
    const patch = { updateId: 'real-publish', baseVersion: 0, operations: [{ type: 'edit', topicId: 'root', changes: { title: '실제 CLI 입력' } }] };
    const file = join(dir, 'patch.json'); await writeFile(file, JSON.stringify(patch));
    await promisify(execFile)(process.execPath, ['bin/brainpane.mjs', 'publish', '--session', 'live', '--file', file, '--data', dir]);
    const message = new TextDecoder().decode((await reader.read()).value);
    assert.match(message, /실제 CLI 입력/);
    assert.equal(JSON.parse(await readFile(join(dir, 'sessions/live.json'), 'utf8')).version, 1);
    assert.equal((await call('/api/sessions/live/publish', patch)).status, 200);
    const invalid = await call('/api/sessions/live/publish', { ...patch, updateId: 'bad', baseVersion: 1, operations: [{ type: 'focus', topicId: 'absent', certainty: 'confirmed', reason: null }] });
    assert.equal(invalid.status, 422); assert.equal((await (await call('/api/sessions/live')).json()).version, 1);
    abort.abort(); await server.close();
    server = await startServer({ dataDir: dir, webDir: resolve('dist/web'), port: 0 });
    assert.equal((await server.store.get('live')).topics[0].title, '실제 CLI 입력');
  } finally { abort.abort(); await server.close(); await rm(dir, { recursive: true, force: true }); }
});

test('installers use separate project directories and refuse overwrites', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brainpane-install-'));
  try {
    const exec = promisify(execFile);
    for (const target of ['codex', 'claude']) {
      const args = ['bin/brainpane.mjs', 'install', target, '--project', dir];
      await exec(process.execPath, args);
      const skill = join(dir, target === 'codex' ? '.agents' : '.claude', 'skills/brainpane/SKILL.md');
      const before = await readFile(skill, 'utf8');
      await assert.rejects(exec(process.execPath, args));
      assert.equal(await readFile(skill, 'utf8'), before);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
