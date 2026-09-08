import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function skillFiles(root: string, cli: 'codex' | 'claude') {
  let skill = await readFile(join(root, 'skills/brainpane/SKILL.md'), 'utf8');
  if (cli === 'claude') skill = skill.replace(/name: brainpane\r?\n/, 'name: brainpane\ndisable-model-invocation: true\n');
  const files: Record<string, string> = {
    'SKILL.md': skill,
    'protocol.md': await readFile(join(root, 'skills/brainpane/protocol.md'), 'utf8'),
    'bridge.mjs': `// Brainpane managed bridge v1\nimport { spawn } from 'node:child_process';\nconst child = spawn(process.execPath, [${JSON.stringify(join(root, 'bin/brainpane.mjs'))}, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });\nchild.on('error', () => { console.error('Brainpane unavailable; continue your conversation.'); process.exitCode = 1; });\nchild.on('exit', code => { process.exitCode = code ?? 1; });\n`,
  };
  if (cli === 'codex') files['agents/openai.yaml'] = 'interface:\n  display_name: "Brainpane"\n  short_description: "Open a map of this conversation"\npolicy:\n  allow_implicit_invocation: false\n';
  return files;
}
