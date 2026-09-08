import { readFile, writeFile, mkdir, unlink, rmdir, lstat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { skillFiles } from './skill-files.js';
import { rename } from 'node:fs/promises';

type Shell = 'powershell' | 'bash' | 'zsh';
const BEGIN = '# >>> Brainpane managed integration v1 >>>';
const END = '# <<< Brainpane managed integration v1 <<<';
const hash = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const manifestSchema = z.object({ version: z.literal(1), packageRoot: z.string(), profiles: z.array(z.object({ path: z.string(), block: z.string(), created: z.boolean() })),
  files: z.array(z.object({ path: z.string(), hash: z.string() })) });
type Manifest = z.infer<typeof manifestSchema>;
const ps = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const psPath = (s: string) => `([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String(${ps(Buffer.from(s).toString('base64'))})))`;
const sh = (s: string) => "'" + s.replaceAll("'", "'\"'\"'") + "'";
async function existing(path: string): Promise<Buffer | null> {
  try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected a regular file: ${path}`); return await readFile(path); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
function decode(bytes: Buffer | null, shell: Shell) {
  if (bytes?.subarray(0, 2).equals(Buffer.from([255, 254]))) return { text: bytes.subarray(2).toString('utf16le'), encode: (text: string) => Buffer.concat([Buffer.from([255, 254]), Buffer.from(text, 'utf16le')]) };
  const bom = bytes?.subarray(0, 3).equals(Buffer.from([239, 187, 191])) || (!bytes && shell === 'powershell');
  const text = bytes ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : '';
  return { text, encode: (s: string) => Buffer.concat([bom ? Buffer.from([239, 187, 191]) : Buffer.alloc(0), Buffer.from(s)]) };
}
export function integrationBlock(shell: Shell, entry: string, node: string) {
  const lines = [BEGIN];
  for (const name of ['brainpane', 'codex', 'claude']) {
    const command = name === 'brainpane' ? '' : ` launch -- ${name}`;
    if (shell === 'powershell') {
      lines.push(`$brainpaneExisting = Get-Command ${name} -CommandType Alias,Function -ErrorAction SilentlyContinue`,
        `if (-not $brainpaneExisting -or $brainpaneExisting.Definition.Contains('Brainpane managed function v1')) {`,
        `  function global:${name} { # Brainpane managed function v1`,
        `    if ($MyInvocation.ExpectingInput) {`,
        `      $input | & ${psPath(node)} ${psPath(entry)}${command} @args`,
        `    } else { & ${psPath(node)} ${psPath(entry)}${command} @args }`,
        `    $global:LASTEXITCODE = $LASTEXITCODE`, '  }',
        `} else { Write-Warning 'Brainpane: existing ${name} alias/function preserved. Use brainpane run --dormant -- ${name} or inspect your profile.' }`);
    } else {
      lines.push(`if ! alias ${name} >/dev/null 2>&1 && ! typeset -f ${name} >/dev/null 2>&1; then`,
        `  ${name}() { command ${sh(node)} ${sh(entry)}${command} "$@"; }`,
        `else printf '%s\n' 'Brainpane: existing ${name} alias/function preserved.' >&2; fi`);
    }
  }
  if (shell === 'powershell') lines.push('Remove-Variable brainpaneExisting -ErrorAction SilentlyContinue');
  lines.push(END);
  return lines.join('\n');
}
async function profiles(shell: Shell, home: string, explicit?: string) {
  if (explicit) return [resolve(explicit)];
  if (shell !== 'powershell') return [join(home, shell === 'bash' ? '.bashrc' : '.zshrc')];
  if (home !== homedir()) return [join(home, 'Documents', 'PowerShell', 'profile.ps1')];
  const paths: string[] = [];
  for (const command of process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh']) {
    try {
      const { stdout } = await promisify(execFile)(command, ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); $PROFILE.CurrentUserAllHosts'], { windowsHide: true });
      const path = stdout.trim(); if (path) paths.push(resolve(path));
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  if (!paths.length) throw new Error('PowerShell is not installed; choose --shell bash or --shell zsh');
  return [...new Set(paths)];
}
export async function setup(options: { packageRoot: string; home?: string; shell?: string; profile?: string }) {
  const home = resolve(options.home || homedir());
  const shell = z.enum(['powershell', 'bash', 'zsh']).parse(options.shell || (process.platform === 'win32' ? 'powershell' : process.env.SHELL?.endsWith('zsh') ? 'zsh' : 'bash'));
  const root = resolve(options.packageRoot), dir = join(home, '.brainpane'), manifestPath = join(dir, 'installation.json');
  const previous = await existing(manifestPath);
  const old = previous ? manifestSchema.parse(JSON.parse(previous.toString('utf8'))) : null;
  const planned = new Map<string, { before: Buffer | null; after: Buffer }>();
  const next: Manifest = old ? structuredClone(old) : { version: 1, packageRoot: root, profiles: [], files: [] };
  next.packageRoot = root;
  // Preflight every file before any mutation. Only byte-identical managed files
  // can be upgraded; a same-named user skill is not ours to replace.
  for (const scope of ['.agents', '.claude']) {
    for (const [file, content] of Object.entries(await skillFiles(root, scope === '.agents' ? 'codex' : 'claude'))) {
      const path = join(home, scope, 'skills', 'brainpane', file);
      const before = await existing(path), owned = old?.files.find(f => f.path === path);
      if (before && (!owned || hash(before) !== owned.hash)) throw new Error(`Preserving existing or edited skill: ${path}`);
      const after = Buffer.from(content);
      planned.set(path, { before, after }); next.files = next.files.filter(f => f.path !== path); next.files.push({ path, hash: hash(after) });
    }
  }
  const targets = [...new Set([...(old?.profiles.map(p => p.path) || []), ...await profiles(shell, home, options.profile)])];
  for (const path of targets) {
    const before = await existing(path), encoding = decode(before, path.endsWith('.ps1') ? 'powershell' : shell);
    const previousProfile = old?.profiles.find(p => p.path === path);
    const targetShell: Shell = path.endsWith('.ps1') ? 'powershell' : path.endsWith('.zshrc') ? 'zsh' : shell;
    const block = integrationBlock(targetShell, join(root, 'bin/brainpane.mjs'), process.execPath);
    let text = encoding.text;
    if (previousProfile) {
      if (text.split(previousProfile.block).length !== 2) throw new Error(`Managed profile block was edited or removed; preserving ${path}`);
      text = text.replace(previousProfile.block, block);
    } else {
      if (text.includes(BEGIN) || text.includes(END)) throw new Error(`Unowned Brainpane block in ${path}; inspect before installing`);
      text += `\n${block}\n`;
    }
    planned.set(path, { before, after: encoding.encode(text) });
    next.profiles = next.profiles.filter(p => p.path !== path); next.profiles.push({ path, block, created: previousProfile?.created ?? before === null });
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, 'setup.lock'); await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  const changed: string[] = [];
  try {
    // Persist only ownership and an interrupted-operation recovery journal;
    // never print profile contents or overwrite a concurrent edit.
    const journal = join(dir, 'setup-recovery.json');
    if (await existing(journal)) throw new Error('An interrupted setup journal exists. Run brainpane recover before retrying.');
    planned.set(manifestPath, { before: previous, after: Buffer.from(JSON.stringify(next, null, 2)) });
    await writeFile(journal, JSON.stringify([...planned].map(([path, p]) => ({ path, before: p.before?.toString('base64') ?? null, afterHash: hash(p.after) }))), { mode: 0o600 });
    for (const [path, p] of planned) {
      const current = await existing(path);
      if (hash(current || '') !== hash(p.before || '')) throw new Error(`File changed during setup: ${path}`);
      await mkdir(dirname(path), { recursive: true });
      await replaceFile(path, p.after); changed.push(path);
    }
    await unlink(journal).catch(() => {});
  } catch (error) {
    for (const path of changed.reverse()) {
      const p = planned.get(path)!;
      if (hash(await existing(path) || '') !== hash(p.after)) continue;
      if (p.before) await replaceFile(path, p.before); else await unlink(path);
    }
    throw error;
  } finally { await unlink(lock); }
  return { installed: true, profiles: next.profiles.map(p => p.path), skills: next.files.map(f => f.path),
    next: 'Open a new terminal, run codex or claude, then invoke $brainpane start or /brainpane start. No map work occurs before activation.',
    remove: 'brainpane uninstall (then open a new terminal). Map data is retained.' };
}

async function replaceFile(path: string, bytes: Buffer) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temp, bytes, { mode: 0o600 }); await rename(temp, path); }
  finally { await unlink(temp).catch(() => {}); }
}

export async function uninstall(homeInput?: string): Promise<{ removed: string[]; preserved: string[]; message?: string; next?: string }> {
  const home = resolve(homeInput || homedir()), path = join(home, '.brainpane/installation.json');
  const bytes = await existing(path); if (!bytes) return { removed: [], preserved: [], message: 'No managed installation found' };
  const manifest = manifestSchema.parse(JSON.parse(bytes.toString('utf8')));
  const lock = join(home, '.brainpane/setup.lock'); await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  try {
  const removed: string[] = [], preserved: string[] = [];
  for (const p of [...manifest.profiles]) {
    const before = await existing(p.path); if (!before) { manifest.profiles = manifest.profiles.filter(x => x.path !== p.path); continue; }
    const encoding = decode(before, p.path.endsWith('.ps1') ? 'powershell' : 'bash');
    if (encoding.text.split(p.block).length !== 2) { preserved.push(p.path); continue; }
    const after = encoding.text.replace(`\n${p.block}\n`, '').replace(p.block, '');
    if (p.created && !after.trim()) await unlink(p.path); else await replaceFile(p.path, encoding.encode(after));
    manifest.profiles = manifest.profiles.filter(x => x.path !== p.path); removed.push(p.path);
  }
  for (const f of [...manifest.files]) {
    const before = await existing(f.path);
    if (before && hash(before) !== f.hash) { preserved.push(f.path); continue; }
    if (before) { await unlink(f.path); await rmdir(dirname(f.path)).catch(() => {}); }
    manifest.files = manifest.files.filter(x => x.path !== f.path); removed.push(f.path);
  }
  if (preserved.length) await writeFile(path, JSON.stringify(manifest, null, 2), { mode: 0o600 }); else await unlink(path);
  return { removed, preserved, next: 'Open a new terminal to remove loaded functions. Edited files and all map data are retained.' };
  } finally { await unlink(lock); }
}

export async function recover(homeInput?: string) {
  const dir = resolve(homeInput || homedir(), '.brainpane'), lock = join(dir, 'setup.lock'), journal = join(dir, 'setup-recovery.json');
  const bytes = await existing(journal);
  if (!bytes) return { recovered: [], preserved: [], message: 'No interrupted installation journal found' };
  const entries = z.array(z.object({ path: z.string(), before: z.string().nullable(), afterHash: z.string().regex(/^[a-f0-9]{64}$/) })).parse(JSON.parse(bytes.toString('utf8')));
  const owner = await existing(lock);
  if (owner) {
    const pid = Number(owner.toString('utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid setup lock; inspect before recovery');
    try { process.kill(pid, 0); throw new Error('Setup/recovery process is still running'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
    await unlink(lock);
  }
  await writeFile(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  const recovered: string[] = [], preserved: string[] = [];
  try {
    for (const entry of entries.reverse()) {
      const current = await existing(entry.path), before = entry.before === null ? null : Buffer.from(entry.before, 'base64');
      if ((current === null && before === null) || (current && before && current.equals(before))) continue;
      if (!current || hash(current) !== entry.afterHash) { preserved.push(entry.path); continue; }
      if (before) await replaceFile(entry.path, before); else await unlink(entry.path);
      recovered.push(entry.path);
    }
    if (!preserved.length) await unlink(journal);
    return { recovered, preserved, next: preserved.length ? 'Edited files retained. Reconcile the recovery journal before setup.' : 'Recovery complete. Rerun brainpane setup.' };
  } finally { await unlink(lock); }
}

export async function doctor(homeInput?: string) {
  const home = resolve(homeInput || homedir());
  const bytes = await existing(join(home, '.brainpane/installation.json'));
  if (!bytes) return { installed: false, next: 'Run brainpane setup; already-running unwrapped CLIs must be restarted.' };
  const manifest = manifestSchema.parse(JSON.parse(bytes.toString('utf8')));
  const files = await Promise.all(manifest.files.map(async f => ({ path: f.path, intact: hash(await existing(f.path) || '') === f.hash })));
  const profiles = await Promise.all(manifest.profiles.map(async p => ({ path: p.path, intact: decode(await existing(p.path), 'bash').text.includes(p.block) })));
  return { installed: true, packageRoot: manifest.packageRoot, files, profiles, recoveryPending: !!await existing(join(home, '.brainpane/setup-recovery.json')),
    next: 'In the target shell run Get-Command codex,claude (PowerShell) or type codex claude (bash/zsh). They should be functions. Then use the skill in a newly started CLI.' };
}
