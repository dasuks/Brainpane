import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseCliArgs } from './arguments.js';
import { startServer } from './server/server.js';
import { id } from './core/model.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { values, positionals, childArgs } = parseCliArgs(process.argv.slice(2));
const dataDir = resolve(values.data || process.env.BRAINPANE_DATA_DIR || '.brainpane'); const command = positionals[0];
function session() {
  const key = values.session || process.env.BRAINPANE_SESSION;
  if (!key) throw new Error('No bound Brainpane session. Open a new configured terminal and restart codex/claude, or use brainpane run --dormant -- codex.');
  return id.parse(key);
}
async function request(path: string, payload?: unknown) {
  let runtime;
  try { runtime = JSON.parse(await readFile(join(dataDir, 'runtime.json'), 'utf8')); }
  catch { throw new Error('No running Brainpane session in this data directory. Start the CLI through the configured shell or brainpane run.'); }
  const url = new URL(runtime.origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Invalid local server address');
  const response = await fetch(`${url.origin}/api/${path}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${runtime.token}`, 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(5000),
  }).catch(() => { throw new Error('Brainpane unavailable; continue your conversation. Restart the server, then resync.'); });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(`${response.status}: ${result.error}`); return result;
}
if (command === 'setup' || command === 'uninstall' || command === 'doctor' || command === 'recover') {
  const integration = await import('./setup.js');
  const result = command === 'setup' ? await integration.setup({ packageRoot, home: values.home, shell: values.shell, profile: values.profile }) : command === 'uninstall' ? await integration.uninstall(values.home) : command === 'recover' ? await integration.recover(values.home) : await integration.doctor(values.home);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'launch') {
  const { launch } = await import('./launcher.js');
  process.exit(await launch(childArgs[0], childArgs.slice(1)));
} else if (command === 'run') {
  if (!childArgs.length) throw new Error('Use brainpane run [--session ID] -- codex or -- claude');
  const { run } = await import('./terminal/run.js');
  const code = await run({ command: childArgs[0], args: childArgs.slice(1), session: values.session, data: values.data, width: values.width, prefix: values.prefix, bootstrap: !values['no-bootstrap'], demo: values.demo, dormant: values.dormant });
  process.exit(code);
} else if (command === 'open' || command === 'sync' || command === 'hide' || command === 'ready') {
  console.log(JSON.stringify(await request(`sessions/${session()}/panel`, { action: command })));
} else if (command === 'start') {
  throw new Error('Use brainpane run -- codex or brainpane run -- claude. Server and map run inside the same terminal.');
} else if (command === 'web-legacy') {
  const port = Number(values.port || 4783);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const server = await startServer({ dataDir, port, webDir: join(packageRoot, 'dist/web') });
  const access = `${server.origin}/#access=${server.token}`;
  console.log(`Brainpane: ${server.origin}\nOpen privately: ${access}\nData: ${dataDir}\nCtrl+C stops server.`);
  if (values.open) {
    // No shell interpolation. Windows URL is passed as a PowerShell parameter.
    const child = process.platform === 'win32'
      ? spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process -FilePath $args[0]', access], { windowsHide: true, stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [access], { stdio: 'ignore' });
    child.on('error', () => console.error('Browser could not open; use the printed access URL.'));
  }
  let closing = false;
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { if (!closing) { closing = true; void server.close().then(() => process.exit(0)); } });
} else if (command === 'begin') {
  const s = await request('sessions', { id: session(), goal: values.goal, rootTitle: values.title || values.goal,
    binding: { cli: values.cli, conversation: values.conversation } });
  console.log(JSON.stringify({ id: s.id, version: s.version, binding: s.binding }));
} else if (command === 'context') {
  const s = await request(`sessions/${session()}`); const { receipts, ...context } = s;
  // Quotes are available in the UI; omit full quotes from routine context reads.
  context.topics = context.topics.map((t: any) => ({ ...t, sources: t.sources.map((r: any) => ({ id: r.id, role: r.role })) }));
  console.log(JSON.stringify(context, null, 2));
} else if (command === 'publish') {
  if (!values.file) throw new Error('Use --file <UTF-8 JSON path> or --file - for stdin');
  let raw = '';
  if (values.file === '-') { for await (const chunk of process.stdin) raw += chunk.toString(); }
  else raw = await readFile(resolve(values.file), 'utf8');
  const s = await request(`sessions/${session()}/publish`, JSON.parse(raw.replace(/^\uFEFF/, '')));
  console.log(JSON.stringify({ id: s.id, version: s.version, focusTopicId: s.focusTopicId }));
} else if (command === 'stop' || command === 'resume') {
  const runtime = JSON.parse(await readFile(join(dataDir, 'runtime.json'), 'utf8'));
  const s = runtime.terminalSession ? await request(`sessions/${session()}/panel`, { action: command === 'stop' ? 'close' : 'open' }) : await request(`sessions/${session()}/active`, command === 'resume');
  console.log(JSON.stringify({ id: s.id, active: s.active, version: s.version }));
} else if (command === 'install') {
  const target = positionals[1]; if (target !== 'codex' && target !== 'claude') throw new Error('Use install codex or install claude');
  const project = resolve(values.project || '.');
  const dest = join(project, target === 'codex' ? '.agents' : '.claude', 'skills', 'brainpane');
  await mkdir(dirname(dest), { recursive: true });
  await mkdir(dest).catch(() => { throw new Error(`Refusing to overwrite ${dest}. Inspect/remove it before reinstalling.`); });
  const { skillFiles } = await import('./skill-files.js');
  const files = await skillFiles(packageRoot, target);
  for (const [file, content] of Object.entries(files)) { await mkdir(dirname(join(dest, file)), { recursive: true }); await writeFile(join(dest, file), content); }
  console.log(`Installed ${dest}\nFiles: ${Object.keys(files).join(', ')}\nSkill only; use brainpane setup for ordinary codex/claude shell integration. No existing settings or hooks changed.\nRemove the listed files to uninstall this project skill.\nRestart CLI if skill is not discovered. Invocation: ${target === 'codex' ? '$brainpane' : '/brainpane'} start`);
} else if (command === 'demo') {
  const key = values.session || `demo-${Date.now()}`; id.parse(key);
  const fixture = JSON.parse(await readFile(join(packageRoot, 'fixtures/demo.json'), 'utf8'));
  await request('sessions', { ...fixture.session, id: key });
  const delay = Number(values.interval || 700);
  if (!Number.isFinite(delay) || delay < 0 || delay > 10000) throw new Error('interval must be 0..10000 ms');
  for (const turn of fixture.turns) {
    await request(`sessions/${key}/publish`, turn.patch);
    console.log(`Demo ${turn.step}/8 → ${key}`);
    if (delay) await new Promise(r => setTimeout(r, delay));
  }
  console.log(`Recorded patch replay complete. Session: ${key}. This does not evaluate LLM interpretation.`);
} else {
  console.log('brainpane setup [--shell powershell|bash|zsh] [--profile path]\nbrainpane doctor\nbrainpane uninstall\nAfter setup: open a new terminal, run codex or claude, then invoke $brainpane start or /brainpane start.\nbrainpane run [--dormant] [--session ID] [--width 40] [--prefix ctrl-]] [--no-bootstrap] [--demo] -- codex|claude [CLI args]\nbrainpane install codex|claude [--project path] (skill only)\nbrainpane open|sync|hide|stop|resume [--session ID]\nbrainpane context [--session ID]\nbrainpane publish [--session ID] --file path.json|-\nInside the child, session and data directory are inherited automatically. No browser or second terminal.');
}
