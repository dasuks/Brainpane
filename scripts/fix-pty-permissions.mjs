// node-pty 1.1.0 ships macOS prebuilt spawn-helper without an executable bit.
// Upstream: https://github.com/microsoft/node-pty/issues/850
// Confined to the installed dependency's known helper paths; no shell/chmod glob.
import { createRequire } from 'node:module';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { realpath, stat, chmod } from 'node:fs/promises';

if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const root = await realpath(dirname(require.resolve('node-pty/package.json')));
  for (const directory of ['build/Release', 'build/Debug', `prebuilds/darwin-${process.arch}`]) {
    const candidate = join(root, directory, 'spawn-helper');
    let path;
    try { path = await realpath(candidate); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    const inside = relative(root, path);
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('PTY helper resolved outside its dependency');
    const info = await stat(path);
    if (!info.isFile()) throw new Error('PTY helper is not a regular file');
    if ((info.mode & 0o111) !== 0o111) {
      await chmod(path, info.mode | 0o111);
      console.log('Brainpane: restored executable permission on the installed macOS PTY helper.');
    }
  }
}
