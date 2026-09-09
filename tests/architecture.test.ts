import test from 'node:test';
import assert from 'node:assert/strict';
import { checkArchitecture, evaluateImport, layerOf, specifiersOf } from '../scripts/check-architecture.mjs';

test('layers follow directory placement', () => {
  assert.equal(layerOf('src/core/model.ts'), 'core');
  assert.equal(layerOf('src/server/server.ts'), 'server');
  assert.equal(layerOf('src/terminal/app.ts'), 'terminal');
  assert.equal(layerOf('src/web/view.ts'), 'web');
  assert.equal(layerOf('src/cli.ts'), 'entry');
  assert.equal(layerOf('tests/core.test.ts'), null);
});

test('dependency direction: lower layers never import higher ones', () => {
  assert.equal(evaluateImport('src/terminal/run.ts', '../server/server.js'), null);
  assert.equal(evaluateImport('src/server/server.ts', '../core/store.js'), null);
  assert.equal(evaluateImport('src/cli.ts', './terminal/run.js'), null);
  assert.match(evaluateImport('src/core/model.ts', '../terminal/app.js')!, /core may not depend on terminal/);
  assert.match(evaluateImport('src/server/server.ts', '../terminal/panel.js')!, /server may not depend on terminal/);
  assert.match(evaluateImport('src/terminal/app.ts', '../web/view')!, /terminal may not depend on web/);
  assert.match(evaluateImport('src/cli.ts', './web/main')!, /entry may not depend on web/);
  assert.match(evaluateImport('src/core/store.ts', '../../scripts/x.mjs')!, /leaves src/);
});

test('core/model.ts stays free of Node built-ins; packages are allowed everywhere', () => {
  assert.match(evaluateImport('src/core/model.ts', 'node:fs')!, /must stay pure/);
  assert.equal(evaluateImport('src/core/store.ts', 'node:fs/promises'), null);
  assert.equal(evaluateImport('src/core/model.ts', 'zod'), null);
});

test('specifier scanner sees static, side-effect, re-export and dynamic imports', () => {
  const source = `import a from './a.js';\nimport './side.js';\nexport { b } from '../b.js';\nconst c = await import('./c.js');\nconst text = "from './not-an-import'";`;
  assert.deepEqual(specifiersOf(source), ['./a.js', './side.js', '../b.js', './c.js']);
});

test('repository source obeys the documented architecture', async () => {
  assert.deepEqual(await checkArchitecture(process.cwd()), []);
});
