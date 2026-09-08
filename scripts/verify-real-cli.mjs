// Explicit opt-in: uses the installed CLI's normal model session/usage. No API credentials read.
import pty from 'node-pty';
import xterm from '@xterm/headless';
import unicode11 from '@xterm/addon-unicode11';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const cli = process.argv[2] || 'codex';
if (!['codex', 'claude'].includes(cli)) throw new Error('Use codex or claude');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const id = `real-${cli}-${Date.now()}`;
await mkdir('.brainpane/test-results', { recursive: true });
const screen = new xterm.Terminal({ cols: 140, rows: 42, allowProposedApi: true, scrollback: 2000, logLevel: 'off' });
screen.loadAddon(new unicode11.Unicode11Addon()); screen.unicode.activeVersion = '11';
const child = pty.spawn(process.execPath, ['bin/brainpane.mjs', 'run', '--session', id, '--', cli], { cols: 140, rows: 42, cwd: process.cwd(), env: { ...process.env, TERM: 'xterm-256color' } });
let exited, state;
let trusted = false;
screen.onData(data => child.write(data)); child.onData(data => screen.write(data)); child.onExit(e => { exited = e; });
const text = () => Array.from({ length: screen.rows }, (_, y) => screen.buffer.active.getLine(screen.buffer.active.baseY + y)?.translateToString(true, 0, screen.cols) || '').join('\n');
async function snapshot() { if (!exited) await writeFile(`.brainpane/test-results/${cli}-screen.txt`, text()); }
async function wait(predicate, label, timeout = 180000) {
  const end = Date.now() + timeout;
  while (!(await predicate())) { await snapshot(); if (exited || Date.now() > end) throw new Error(`Real ${cli} check stopped at ${label}. Inspect .brainpane/test-results/${cli}-screen.txt`); await sleep(500); }
  await snapshot();
}
async function load() { try { state = JSON.parse(await readFile(`.brainpane/runs/${id}/sessions/${id}.json`, 'utf8')); } catch {} return state; }
async function send(message) { child.write(`\x1b[200~${message}\x1b[201~`); await sleep(350); child.write('\r'); }
try {
  console.log(`Testing actual ${cli}, map ${id}. Uses the CLI's existing usage. No fixture patches.`);
  await wait(async () => {
    if (cli === 'claude' && process.argv.includes('--trust-project') && !trusted && text().includes('Yes, I trust this folder') && text().includes(process.cwd())) {
      trusted = true; child.write('\x1b[B'); await sleep(200); child.write('\r');
    }
    return /(?:[•●].*(?:Brainpane.*ready|지도.*준비)|Brainpane is ready)/i.test(text());
  }, 'skill bootstrap');
  const turns = [
    'LLM이랑 얘기하다 보면 대화가 어디로 이어지는지 놓쳐. 같은 터미널 안에서 지도로 보여줄 수 있을까? 코드는 수정하지 말고 아이디어만 두 문장으로 답해 줘.',
    '근데 작은 터미널에서 글자만으로 지도가 잘 보일지 가시성을 이야기해 보자. 아직 표시 방식을 확정한 건 아니야.',
    '주제를 바꿔서, 지도 정리의 추가 토큰 부담을 논의하고 싶어. 지금은 질문만 기록하고 비용 조사나 검색은 하지 마.',
    '토큰 부담은 일단 놔두고, 아까 가시성 얘기로 돌아가자. 여전히 비교 중이야.',
  ];
  const results = [];
  for (const [index, turn] of turns.entries()) {
    const before = (await load()).version; await send(turn);
    await wait(async () => (await load())?.version > before, `turn ${index + 1} publish`);
    await sleep(1200); results.push({ version: state.version, focusTopicId: state.focusTopicId, topics: state.topics.length });
    console.log(`Published turn ${index + 1}: v${state.version}, focus=${state.focusTopicId}, topics=${state.topics.length}`);
  }
  if (results[1].focusTopicId !== results[3].focusTopicId) throw new Error('Return did not reuse the visibility topic');
  if (!state.topics.some(t => t.status === 'parked')) throw new Error('Deferred topic was not preserved as parked');
  await snapshot();
  const report = { cli, id, results, passed: true, scope: '4 real interactive turns; not a general semantic-quality guarantee' };
  await writeFile(`.brainpane/test-results/${cli}-verification.json`, JSON.stringify(report, null, 2));
  child.write('\x1dq'); await wait(() => !!exited, 'wrapper quit and child cleanup', 15000);
  console.log(JSON.stringify(report)); screen.dispose(); process.exit(0);
} catch (e) { await snapshot(); child.write('\x1dq'); await sleep(1500); try { child.kill(); } catch {} screen.dispose(); console.error(e.message); process.exit(1); }
