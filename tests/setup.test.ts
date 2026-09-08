import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { setup, uninstall, doctor, integrationBlock, recover } from '../src/setup.js';
import { createHash } from 'node:crypto';
import { needsTerminal } from '../src/launcher.js';

test('setup is repeatable; uninstall preserves UTF-16 profiles and later edits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'brainpane-setup-'));
  const profile = join(home, 'profile.ps1');
  const original = '# 사용자 설정\r\n$custom = "keep"\r\n';
  const utf16 = (s: string) => Buffer.concat([Buffer.from([255, 254]), Buffer.from(s, 'utf16le')]);
  try {
    await writeFile(profile, utf16(original));
    const opts = { home, profile, shell: 'powershell', packageRoot: resolve('.') };
    await setup(opts); const first = await readFile(profile); await setup(opts);
    assert.deepEqual(await readFile(profile), first);
    assert.ok((await doctor(home)).installed);
    const claude = await readFile(join(home, '.claude/skills/brainpane/SKILL.md'), 'utf8');
    assert.match(claude, /disable-model-invocation: true/);
    assert.match(await readFile(join(home, '.agents/skills/brainpane/agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
    await writeFile(profile, Buffer.concat([first, Buffer.from('# later edit\r\n', 'utf16le')]));
    const result = await uninstall(home); assert.deepEqual(result.preserved, []);
    assert.deepEqual(await readFile(profile), utf16(original + '# later edit\r\n'));
    assert.equal((await doctor(home)).installed, false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('setup refuses foreign skills before modifying profiles; uninstall retains user edits', async () => {
  const home = await mkdtemp(join(tmpdir(), 'brainpane-own-'));
  const profile = join(home, '.bashrc'), skill = join(home, '.claude/skills/brainpane/SKILL.md');
  const opts = { home, profile, shell: 'bash', packageRoot: resolve('.') };
  try {
    await writeFile(profile, '# keep\n'); await mkdir(join(home, '.claude/skills/brainpane'), { recursive: true });
    await writeFile(skill, 'my skill');
    await assert.rejects(setup(opts), /Preserving existing/);
    assert.equal(await readFile(profile, 'utf8'), '# keep\n');
    await assert.rejects(readFile(join(home, '.agents/skills/brainpane/SKILL.md')));
    await rm(skill); await setup(opts); await writeFile(skill, 'my edited managed skill');
    await assert.rejects(setup(opts), /Preserving existing/);
    const result = await uninstall(home); assert.ok(result.preserved.includes(skill));
    assert.equal(await readFile(skill, 'utf8'), 'my edited managed skill');
    assert.equal(await readFile(profile, 'utf8'), '# keep\n');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('PowerShell shell functions preserve Unicode paths, arguments, exit status and existing functions', { skip: process.platform !== 'win32' }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'brainpane-profile-'));
  const entry = join(home, '한글 경로.mjs'), profile = join(home, 'profile.ps1');
  const ps = (s: string) => "'" + s.replaceAll("'", "''") + "'";
  try {
    await writeFile(entry, 'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = 7;');
    await writeFile(profile, integrationBlock('powershell', entry, process.execPath));
    const exec = promisify(execFile);
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', `. ${ps(profile)}; codex --model 'two words' -- '--literal'; Write-Output "exit=$LASTEXITCODE"`]);
    const args = JSON.parse(stdout.split('\n')[0]);
    assert.ok(args.includes('two words')); assert.ok(args.includes('--literal')); assert.ok(stdout.includes('exit=7'));
    const preserved = await exec('powershell.exe', ['-NoProfile', '-Command', `function global:codex { 'existing function' }; . ${ps(profile)}; codex`]);
    assert.ok(preserved.stdout.includes('existing function'));
    assert.ok(!preserved.stdout.includes('["launch"'));
    await writeFile(entry, 'let input = ""; for await (const chunk of process.stdin) input += chunk; console.log(JSON.stringify({input, args:process.argv.slice(2)}));');
    const piped = await exec('powershell.exe', ['-NoProfile', '-Command', `. ${ps(profile)}; 'pipeline input' | codex exec -`]);
    assert.equal(JSON.parse(piped.stdout).input.trim(), 'pipeline input');
  } finally { await rm(home, { recursive: true, force: true }); }
});

test('launcher bypasses help, scripts, noninteractive and nested CLI processes', () => {
  assert.equal(needsTerminal('codex', [], true, {}), true);
  assert.equal(needsTerminal('claude', ['--resume', 'exact-id'], true, {}), true);
  for (const [cli, args] of [['codex', ['exec', 'task']], ['claude', ['-p', 'task']], ['codex', ['--version']], ['claude', ['auth', 'status']]] as const)
    assert.equal(needsTerminal(cli, [...args], true, {}), false);
  assert.equal(needsTerminal('codex', [], false, {}), false);
  assert.equal(needsTerminal('codex', ['-c', 'model="example"', 'exec', 'task'], true, {}), false);
  assert.equal(needsTerminal('claude', ['--bg'], true, {}), false);
  assert.equal(needsTerminal('codex', [], true, { BRAINPANE_WRAPPED: '1' }), false);
  assert.equal(needsTerminal('claude', [], true, { BRAINPANE_DISABLE: '1' }), false);
});

test('interrupted setup recovery restores only intact owned writes and rejects a live lock', async () => {
  const home = await mkdtemp(join(tmpdir(), 'brainpane-recover-'));
  const dir = join(home, '.brainpane'), file = join(home, 'profile.ps1'), edited = join(home, 'edited.ps1');
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  try {
    await mkdir(dir); await writeFile(file, 'installed'); await writeFile(edited, 'user changed');
    await writeFile(join(dir, 'setup-recovery.json'), JSON.stringify([
      { path: file, before: Buffer.from('before').toString('base64'), afterHash: hash('installed') },
      { path: edited, before: null, afterHash: hash('installed') },
    ]));
    await writeFile(join(dir, 'setup.lock'), String(process.pid));
    await assert.rejects(recover(home), /still running/);
    await rm(join(dir, 'setup.lock'));
    const result = await recover(home);
    assert.equal(await readFile(file, 'utf8'), 'before');
    assert.equal(await readFile(edited, 'utf8'), 'user changed');
    assert.deepEqual(result.preserved, [edited]);
  } finally { await rm(home, { recursive: true, force: true }); }
});
