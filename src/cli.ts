import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { startServer } from './server/server.js';
import { id } from './core/model.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2); const separator = argv.indexOf('--');
const childArgs = argv[0] === 'run' && separator >= 0 ? argv.slice(separator + 1) : [];
const { values, positionals } = parseArgs({ args: argv[0] === 'run' && separator >= 0 ? argv.slice(0, separator) : argv, allowPositionals: true, options: {
  session: { type: 'string' }, file: { type: 'string' }, goal: { type: 'string' }, title: { type: 'string' },
  cli: { type: 'string' }, conversation: { type: 'string' }, data: { type: 'string' },
  project: { type: 'string' }, port: { type: 'string' }, open: { type: 'boolean' }, interval: { type: 'string' },
  width: { type: 'string' }, prefix: { type: 'string' }, 'no-bootstrap': { type: 'boolean' }, demo: { type: 'boolean' },
} });
const dataDir = resolve(values.data || process.env.BRAINPANE_DATA_DIR || '.brainpane'); const command = positionals[0];
function session() { return id.parse(values.session || process.env.BRAINPANE_SESSION); }
async function request(path: string, payload?: unknown) {
  let runtime;
  try { runtime = JSON.parse(await readFile(join(dataDir, 'runtime.json'), 'utf8')); }
  catch { throw new Error('Start the server first with the same --data directory.'); }
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
if (command === 'run') {
  if (!childArgs.length) throw new Error('Use brainpane run [--session ID] -- codex or -- claude');
  const { run } = await import('./terminal/run.js');
  const code = await run({ command: childArgs[0], args: childArgs.slice(1), session: values.session, data: values.data, width: values.width, prefix: values.prefix, bootstrap: !values['no-bootstrap'], demo: values.demo });
  process.exit(code);
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
  const s = await request(`sessions/${session()}/active`, command === 'resume');
  console.log(JSON.stringify({ id: s.id, active: s.active, version: s.version }));
} else if (command === 'install') {
  const target = positionals[1]; if (target !== 'codex' && target !== 'claude') throw new Error('Use install codex or install claude');
  const project = resolve(values.project || '.');
  const dest = join(project, target === 'codex' ? '.agents' : '.claude', 'skills', 'brainpane');
  await mkdir(dirname(dest), { recursive: true });
  await mkdir(dest).catch(() => { throw new Error(`Refusing to overwrite ${dest}. Inspect/remove it before reinstalling.`); });
  const template = await readFile(join(packageRoot, 'skills/brainpane/SKILL.md'), 'utf8');
  await writeFile(join(dest, 'SKILL.md'), template);
  await writeFile(join(dest, 'protocol.md'), await readFile(join(packageRoot, 'skills/brainpane/protocol.md'), 'utf8'));
  await writeFile(join(dest, 'bridge.mjs'), `// Generated project-local adapter. No shell, hooks, transcript access or auth extraction.\nimport { spawn } from 'node:child_process';\nconst child = spawn(process.execPath, [${JSON.stringify(join(packageRoot, 'bin/brainpane.mjs'))}, ...process.argv.slice(2), '--data', process.env.BRAINPANE_DATA_DIR || ${JSON.stringify(join(project, '.brainpane'))}], { stdio: 'inherit', windowsHide: true });\nchild.on('error', () => { console.error('Brainpane unavailable; continue the conversation.'); process.exitCode = 1; });\nchild.on('exit', code => { process.exitCode = code ?? 1; });\n`);
  console.log(`Installed ${dest}\nFiles: SKILL.md, protocol.md, bridge.mjs\nNo existing settings or hooks changed.\nRemove those three files and the empty brainpane directory to uninstall.\nRestart CLI if skill is not discovered. Invocation: ${target === 'codex' ? '$brainpane' : '/brainpane'} start`);
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
  console.log('brainpane run [--session ID] [--width 40] [--prefix ctrl-]] [--no-bootstrap] [--demo] -- codex|claude [CLI args]\nbrainpane install codex|claude [--project path]\nbrainpane context [--session ID]\nbrainpane publish [--session ID] --file path.json|-\nbrainpane stop|resume [--session ID]\nInside the child, session and data directory are inherited automatically. No browser or second terminal.');
}
