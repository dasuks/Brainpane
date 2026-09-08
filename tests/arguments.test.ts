import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseCliArgs } from '../src/arguments.js';

test('run accepts a consumed separator and preserves every child argument', () => {
  for (const separator of [[], ['--']]) {
    const child = ['claude', '--session', 'child-session', '--model', 'a model', '--', 'literal'];
    const parsed = parseCliArgs(['run', '--session', 'map', '--width=46', '--no-bootstrap', ...separator, ...child]);
    assert.deepEqual(parsed.childArgs, child);
    assert.equal(parsed.values.session, 'map');
    assert.equal(parsed.values.width, '46');
    assert.equal(parsed.values['no-bootstrap'], true);
    assert.deepEqual(parseCliArgs(['run', ...separator, 'codex']).childArgs, ['codex']);
  }
  assert.deepEqual(parseCliArgs(['run', '--', 'C:\\Program Files\\CLI\\cli.exe', 'two words']).childArgs,
    ['C:\\Program Files\\CLI\\cli.exe', 'two words']);
  assert.throws(() => parseCliArgs(['run', '--unknown', 'claude']));
  assert.throws(() => parseCliArgs(['run', '--width']));
  assert.deepEqual(parseCliArgs(['run', '--']).childArgs, []);
  assert.equal(parseCliArgs(['publish', '--session', 'map', '--file', 'patch.json']).values.file, 'patch.json');
});

test('PowerShell npm-style script forwarding reaches terminal startup', { skip: process.platform !== 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brainpane-powershell-'));
  const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  try {
    const shim = join(dir, 'brainpane.ps1');
    // Same $args forwarding used by npm's generated launcher, without needing
    // a globally linked package in a fresh test environment.
    await writeFile(shim, `& ${literal(process.execPath)} ${literal(resolve('bin/brainpane.mjs'))} $args\nexit $LASTEXITCODE\n`);
    for (const cli of ['claude', 'codex']) {
      await assert.rejects(promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', `& ${literal(shim)} run -- ${cli}`]),
        (error: any) => { assert.match(error.stderr, /interactive terminal/); assert.doesNotMatch(error.stderr, /Use brainpane run/); return true; });
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
