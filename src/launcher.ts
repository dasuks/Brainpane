import { spawn } from 'node:child_process';
import { executable } from './terminal/child.js';
import { run } from './terminal/run.js';

export function needsTerminal(cli: string, args: string[], interactive: boolean, env: NodeJS.ProcessEnv) {
  if (!interactive || env.BRAINPANE_WRAPPED === '1' || env.BRAINPANE_DISABLE === '1') return false;
  if (args.some(a => ['--help', '-h', '--version', '-V', '-v'].includes(a))) return false;
  const valueFlags = new Set(['-c', '--config', '-i', '--image', '-m', '--model', '-p', '--profile', '-s', '--sandbox', '-C', '--cd', '--add-dir', '-a', '--ask-for-approval', '--remote', '--remote-auth-token-env', '--enable', '--disable', '--permission-mode', '--settings']);
  let positional: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') { positional = args[i + 1]; break; }
    if (valueFlags.has(args[i])) { i++; continue; }
    if (!args[i].startsWith('-')) { positional = args[i]; break; }
  }
  if (cli === 'claude') return !args.some(a => ['-p', '--print', '--bg', '--background'].includes(a)) &&
    !['auth', 'mcp', 'plugin', 'plugins', 'doctor', 'install', 'update', 'upgrade', 'setup-token', 'agents', 'attach', 'stop', 'kill', 'logs', 'rm', 'gateway'].includes(positional || '');
  return !['exec', 'e', 'review', 'login', 'logout', 'mcp', 'plugin', 'mcp-server', 'app-server', 'exec-server', 'completion', 'update', 'doctor', 'sandbox', 'debug', 'apply', 'queue', 'archive', 'delete', 'migrate-rollouts', 'unarchive', 'cloud', 'features', 'help', 'agents', 'app'].includes(positional || '');
}

export async function launch(cli: string, args: string[]) {
  if (!['codex', 'claude'].includes(cli)) throw new Error('launch supports codex or claude');
  if (needsTerminal(cli, args, !!process.stdin.isTTY && !!process.stdout.isTTY, process.env)) {
    let spawned = false;
    try { return await run({ command: cli, args, dormant: true, bootstrap: false, onSpawn: () => { spawned = true; } }); }
    catch (e) {
      if (spawned) throw e;
      console.error('Brainpane could not start; continuing with the original CLI. Mapping will be unavailable.');
    }
  }
  const resolved = await executable(cli, args);
  // A nested CLI must not accidentally publish to its parent's conversation.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('BRAINPANE_')));
  env.BRAINPANE_WRAPPED = '1';
  return new Promise<number>((ok, fail) => {
    const child = spawn(resolved.file, resolved.args, { stdio: 'inherit', env, windowsHide: true });
    child.once('error', fail); child.once('exit', code => ok(code ?? 1));
  });
}
