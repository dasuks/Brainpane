// Deterministic control-flow test. This does not claim LLM interpretation.
import assert from 'node:assert/strict';
import pty from 'node-pty';
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
const id = `lifecycle-${Date.now()}`, data = resolve('.brainpane/runs', id);
const screen = new xterm.Terminal({ cols: 130, rows: 38, allowProposedApi: true, logLevel: 'off' });
screen.loadAddon(new unicode11.Unicode11Addon()); screen.unicode.activeVersion = '11';
const child = pty.spawn(process.execPath, ['bin/brainpane.mjs', 'run', '--dormant', '--session', id, '--', process.execPath, 'scripts/terminal-fixture.mjs'],
  { cols: 130, rows: 38, cwd: process.cwd(), env: { ...process.env, TERM: 'xterm-256color' } });
let exited;
screen.onData(data => child.write(data)); child.onData(data => screen.write(data)); child.onExit(e => { exited = e; });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = () => Array.from({ length: screen.rows }, (_, y) => screen.buffer.active.getLine(screen.buffer.active.baseY + y)?.translateToString(true) || '').join('\n');
const wait = async (predicate, label) => { const end = Date.now() + 15000; while (!(await predicate())) { if (exited || Date.now() > end) throw new Error(`${label}\n${text()}`); await sleep(100); } };
const cli = (...args) => promisify(execFile)(process.execPath, ['bin/brainpane.mjs', ...args, '--session', id, '--data', data]);
const load = async () => JSON.parse(await readFile(`${data}/sessions/${id}.json`, 'utf8'));
try {
  await wait(() => text().includes('VT PROTOCOL FIXTURE'), 'dormant CLI startup');
  assert.ok(!text().includes('Brainpane'));
  child.write('\x1b[200~지도 전 대화\x1b[201~'); await wait(() => text().includes('지도 전 대화'), 'typing before activation');
  assert.equal((await load()).active, false); assert.equal((await load()).version, 0);
  await cli('open'); await wait(() => text().includes('Brainpane') && text().includes('정리 중'), 'skill opens loading panel');
  const state = await load(), file = `${data}/test-patch.json`;
  const patch = { updateId: 'prior-context', baseVersion: state.version, operations: [
    { type: 'goal', goal: '지도 전 대화', evidence: { id: 'captured', role: 'user', text: '지도 전 대화' } },
    { type: 'edit', topicId: 'root', changes: { title: '원래 대화', summary: '호출 전의 공개 맥락' } },
  ] };
  await writeFile(file, JSON.stringify(patch)); await cli('publish', '--file', file);
  await wait(() => text().includes('원래 대화') && !text().includes('정리 중'), 'publish fills panel');
  await cli('hide'); await wait(() => !text().includes('Brainpane'), 'hide leaves CLI'); assert.equal((await load()).active, true);
  await cli('sync'); await wait(() => text().includes('Brainpane'), 'sync reopens active panel');
  await cli('ready'); await wait(() => !text().includes('정리 중'), 'no-change sync clears loading without moving the view');
  await cli('stop'); await wait(() => !text().includes('Brainpane'), 'stop closes panel');
  assert.equal((await load()).active, false); await assert.rejects(cli('sync'));
  const stopped = await load();
  await writeFile(file, JSON.stringify({ ...patch, updateId: 'stopped', baseVersion: stopped.version })); await assert.rejects(cli('publish', '--file', file));
  child.write('\x1b[200~중단 뒤 채팅\x1b[201~'); await wait(() => text().includes('중단 뒤 채팅'), 'typing after stop');
  await cli('open'); await wait(() => text().includes('원래 대화'), 'reopen preserves existing map');
  assert.equal((await load()).topics.length, 1); assert.equal((await load()).originalGoal, '지도 전 대화');
  child.write('\x1dq'); await wait(() => !!exited, 'normal quit');
  await assert.rejects(readFile(`${data}/runtime.json`));
  console.log(JSON.stringify({ passed: true, scope: 'dormant → open → publish → hide → sync → stop → reopen; no semantic inference', id }));
  screen.dispose(); process.exit(0);
} catch (e) { child.write('\x1dq'); await sleep(500); try { child.kill(); } catch {} screen.dispose(); console.error(e); process.exit(1); }
