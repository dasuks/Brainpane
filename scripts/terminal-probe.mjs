// Development vertical probe only: real CLI + a clearly marked static panel.
import { terminalApp } from '../dist/server/terminal/app.js';
const code = await terminalApp({ command: process.argv[2] || 'codex', args: process.argv.slice(3),
  env: process.env, width: 38, prefix: '\x1d', panel: {
    render(width, height) { return Array.from({ length: height }, (_, i) => (['[static terminal isolation probe]', '', 'Goal: keep context in this terminal', '', 'Conversation', '  +-- execution', '  |   `-- real CLI in PTY', '  `-- display < current', '', 'No semantic interpretation in probe.'][i] || '').padEnd(width).slice(0, width)); },
    input() {}, click() {}, async close() {},
  } });
process.exit(code);
