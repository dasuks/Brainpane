// Dependency-direction check for src/. No third-party parser: TypeScript 7 ships no JS
// compiler API, so this reads import/export specifiers with a regular expression.
// Rules live in docs/ARCHITECTURE.md; keep the two in sync.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Layer name → directory prefix (POSIX, relative to the repository root) and allowed targets. */
export const LAYERS = {
  core: { prefix: 'src/core/', allowed: ['core'] },
  server: { prefix: 'src/server/', allowed: ['core', 'server'] },
  terminal: { prefix: 'src/terminal/', allowed: ['core', 'server', 'terminal'] },
  web: { prefix: 'src/web/', allowed: ['core', 'web'] },
  entry: { prefix: 'src/', allowed: ['core', 'server', 'terminal', 'entry'] },
};
/** Files that must stay free of runtime concerns: no Node built-ins, no I/O. */
export const PURE = ['src/core/model.ts'];

const toPosix = p => p.split('\\').join('/');
/** Layer of a repository-relative POSIX path, or null when the file is outside src/. */
export function layerOf(rel) {
  for (const [name, layer] of Object.entries(LAYERS)) {
    if (name === 'entry') continue;
    if (rel.startsWith(layer.prefix)) return name;
  }
  return /^src\/[^/]+$/.test(rel) ? 'entry' : null;
}
/** Evaluate one import. Returns a violation message or null. */
export function evaluateImport(fromRel, specifier) {
  const from = toPosix(fromRel); const fromLayer = layerOf(from);
  if (!fromLayer) return null;
  if (PURE.includes(from) && specifier.startsWith('node:')) return `${from} imports ${specifier}: core/model.ts must stay pure (no Node built-ins)`;
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const target = posix.normalize(posix.join(posix.dirname(from), specifier));
  const toLayer = layerOf(target);
  if (!toLayer) return `${from} imports ${specifier}: relative import leaves src/`;
  if (!LAYERS[fromLayer].allowed.includes(toLayer)) return `${from} imports ${specifier}: ${fromLayer} may not depend on ${toLayer}`;
  return null;
}
const IMPORT = /(?:^|[\n;])\s*(?:import|export)\s[^'"`]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
export function specifiersOf(source) {
  const found = []; let m;
  while ((m = IMPORT.exec(source))) found.push(m[1] ?? m[2] ?? m[3]);
  return found;
}
async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) yield full;
  }
}
/** Check every source file under <root>/src. Returns violation messages. */
export async function checkArchitecture(root = process.cwd()) {
  const violations = [];
  for await (const file of walk(resolve(root, 'src'))) {
    const rel = toPosix(relative(root, file));
    for (const spec of specifiersOf(await readFile(file, 'utf8'))) {
      const violation = evaluateImport(rel, spec);
      if (violation) violations.push(violation);
    }
  }
  return violations;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const violations = await checkArchitecture(root);
  if (violations.length) { console.error(`Architecture violations (${violations.length}):\n- ${violations.join('\n- ')}\nSee docs/ARCHITECTURE.md.`); process.exit(1); }
  console.log('Architecture check passed: dependency direction and core purity hold.');
}
