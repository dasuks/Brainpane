// Opt-in actual CLI test, using existing login/usage. Requires brainpane setup.
// Conversation comes before skill invocation; no predetermined patches.
import assert from 'node:assert/strict';
import pty from 'node-pty';
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const cli = process.argv[2] || 'codex';
assert.ok(['codex', 'claude'].includes(cli));
const cwd = await mkdtemp(join(tmpdir(), `brainpane-late-${cli}-`));
const reports = resolve('.brainpane/test-results'); await mkdir(reports, { recursive: true });
const screen = new xterm.Terminal({ cols: 140, rows: 42, allowProposedApi: true, logLevel: 'off', scrollback: 1000 });
screen.loadAddon(new unicode11.Unicode11Addon()); screen.unicode.activeVersion = '11';
// Normal shell command: no brainpane run, no activation prompt, no flags.
const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
const child = pty.spawn(shell, process.platform === 'win32' ? ['-Command', cli] : ['-ic', cli],
  { cols: 140, rows: 42, cwd, env: { ...process.env, BRAINPANE_WRAPPED: '', TERM: 'xterm-256color' } });
let exited, mapId, dataDir;
const sleep = ms => new Promise(r => setTimeout(r, ms));
screen.onData(d => child.write(d)); child.onData(d => screen.write(d)); child.onExit(e => { exited = e; });
const text = () => Array.from({ length: screen.rows }, (_, y) => screen.buffer.active.getLine(screen.buffer.active.baseY + y)?.translateToString(true) || '').join('\n');
const snapshot = () => writeFile(join(reports, `${cli}-late-screen.txt`), text());
async function state() {
  if (!mapId) { const dirs = await readdir(join(cwd, '.brainpane/runs')).catch(() => []); if (dirs.length === 1) { mapId = dirs[0]; dataDir = join(cwd, '.brainpane/runs', mapId); } }
  if (mapId) return JSON.parse(await readFile(join(dataDir, 'sessions', `${mapId}.json`), 'utf8'));
}
async function wait(check, label, ms = 180000) {
  const end = Date.now() + ms;
  while (!(await check())) { await snapshot(); if (exited || Date.now() > end) throw new Error(`${cli}: ${label} failed; see ${cli}-late-screen.txt`); await sleep(400); }
  await snapshot();
}
async function send(s) { child.write(`\x1b[200~${s}\x1b[201~`); await sleep(1000); child.write('\r'); }
async function replyMarker(marker) {
  await wait(() => text().split(marker).length >= 3, `public response ${marker}`); await sleep(2500);
}
try {
  console.log(`On-demand ${cli}: ordinary shell launch in isolated workspace; real existing CLI usage.`);
  let trusted = false;
  await wait(async () => {
    if (process.argv.includes('--trust-project') && !trusted) {
      if (cli === 'claude' && text().includes('Yes, I trust this folder')) { trusted = true; child.write('\x1b[B'); await sleep(150); child.write('\r'); }
      if (cli === 'codex' && text().includes('Yes, continue')) { trusted = true; child.write('\r'); }
    }
    return (await state()) && (cli === 'codex' ? text().includes('OpenAI Codex') : text().includes('Claude Code')) && !text().includes('Yes, I trust this folder') && !text().includes('Yes, continue');
  }, 'ordinary dormant startup');
  assert.ok(!text().includes('○ Brainpane')); assert.equal((await state()).active, false);
  const first = '작은 독서모임을 만들려고 해. 온라인과 오프라인 중 아직 정하지 않았어. 외부 검색과 도구 없이 두 문장으로 아이디어만 답하고 마지막에 PRE_ONE_DONE이라고 적어줘.';
  await send(first); await replyMarker('PRE_ONE_DONE');
  await send('오프라인 장소 비용은 걱정되지만 일단 보류하자. 지금은 온라인 참여 방법을 비교해보자. 아직 결정하지 않았어. 도구 없이 두 문장만 답하고 마지막에 PRE_TWO_DONE이라고 적어줘.');
  await replyMarker('PRE_TWO_DONE');
  const before = await state(); assert.equal(before.version, 0); assert.equal(before.active, false); assert.equal(before.goalHistory.length, 0);
  await send(`${cli === 'codex' ? '$' : '/'}brainpane start`);
  await wait(() => text().includes('Brainpane') && text().includes('정리 중'), 'skill opens panel');
  await wait(async () => { const s = await state(); return s.active && !s.waitingForGoal && s.lastAgentUpdateAt; }, 'retroactive map publish');
  const initialized = await state();
  assert.ok(JSON.stringify(initialized.goalHistory).includes('작은 독서모임'));
  assert.ok(initialized.topics.length >= 2); assert.ok(!initialized.originalGoal.includes('Brainpane'));
  child.write('\x1b[<0;120;9M\x1b[<0;120;9m'); await sleep(300);
  child.write('\x1b[<0;4;9M\x1b[<0;4;9m'); await sleep(300);
  await send(`${cli === 'codex' ? '$' : '/'}brainpane stop`);
  await wait(async () => !(await state()).active && !text().includes('○ Brainpane') && !text().includes('● Brainpane'), 'skill stop hides panel');
  await sleep(1500); const stopped = await state();
  await send('온라인 모임 초대 문구를 한 문장만 써줘. 도구를 쓰지 말고 마지막에 STOPPED_CHAT_DONE이라고 적어줘.');
  await replyMarker('STOPPED_CHAT_DONE'); assert.equal((await state()).version, stopped.version);
  await send(`${cli === 'codex' ? '$' : '/'}brainpane start`);
  await wait(async () => { const s = await state(); return s.active && s.version > stopped.version + 1; }, 'reopen resynchronizes');
  const reopened = await state();
  assert.equal(reopened.originalGoal, initialized.originalGoal);
  for (const topic of initialized.topics) assert.ok(reopened.topics.some(t => t.id === topic.id));
  const report = { passed: true, cli, mapId, checks: ['normal command', 'dormant before skill', 'two prior public turns', 'retroactive original goal and branches', 'skill opens', 'click restores typing', 'stop hides', 'chat continues without updates', 'reopen preserves IDs'], topics: reopened.topics.length, version: reopened.version };
  await writeFile(join(reports, `${cli}-on-demand.json`), JSON.stringify(report, null, 2));
  child.write('\x1dq'); await wait(() => !!exited, 'quit', 15000); await assert.rejects(readFile(join(dataDir, 'runtime.json')));
  console.log(JSON.stringify(report)); screen.dispose(); process.exit(0);
} catch (e) { await snapshot(); child.write('\x1dq'); await sleep(700); try { child.kill(); } catch {} screen.dispose(); console.error(e.message); process.exit(1); }
