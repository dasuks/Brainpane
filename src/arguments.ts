import { parseArgs } from 'node:util';

const options = {
  session: { type: 'string' }, file: { type: 'string' }, goal: { type: 'string' }, title: { type: 'string' },
  cli: { type: 'string' }, conversation: { type: 'string' }, data: { type: 'string' },
  project: { type: 'string' }, port: { type: 'string' }, open: { type: 'boolean' }, interval: { type: 'string' },
  width: { type: 'string' }, prefix: { type: 'string' }, 'no-bootstrap': { type: 'boolean' }, demo: { type: 'boolean' },
} as const;

export function parseCliArgs(argv: string[]) {
  let end = argv.length;
  let childArgs: string[] = [];
  if (argv[0] === 'run') {
    // PowerShell can consume -- before npm's .ps1 shim sees it. The first
    // positional executable also ends wrapper options; every later token is
    // owned by the child, including options whose names overlap with ours.
    for (let i = 1; i < argv.length; i++) {
      const token = argv[i];
      if (token === '--') { end = i; childArgs = argv.slice(i + 1); break; }
      if (!token.startsWith('-')) { end = i; childArgs = argv.slice(i); break; }
      const name = token.slice(2).split('=')[0] as keyof typeof options;
      if (token.startsWith('--') && !token.includes('=') && options[name]?.type === 'string') i++;
    }
  }
  return { ...parseArgs({ args: argv.slice(0, end), allowPositionals: true, options }), childArgs };
}
