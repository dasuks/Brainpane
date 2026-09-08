import { randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/server.js';
import { id } from '../core/model.js';
import { MapPanel } from './panel.js';
import { terminalApp } from './app.js';
import { executable } from './child.js';

export async function run(options: { command: string; args: string[]; session?: string; data?: string; width?: string; prefix?: string; bootstrap?: boolean; demo?: boolean }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run Brainpane in an interactive terminal. No browser or second terminal is needed.');
  const resolved = await executable(options.command, options.args);
  const mapId = id.parse(options.session || `map-${randomUUID().slice(0, 8)}`);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const dataDir = resolve(options.data || join('.brainpane', 'runs', mapId));
  const width = Number(options.width || 40);
  if (!Number.isInteger(width) || width < 28 || width > 90) throw new Error('--width must be 28..90 columns');
  const prefixName = options.prefix || 'ctrl-]';
  if (!/^ctrl-[@A-Z\[\\\]\^_a-z]$/.test(prefixName)) throw new Error('--prefix must be ctrl-] or another Ctrl+character');
  const prefix = String.fromCharCode(prefixName.slice(5).toUpperCase().charCodeAt(0) & 31);
  if (['\x03', '\r', '\t', '\x1b'].includes(prefix)) throw new Error('Do not reserve Ctrl+C, Enter, Tab or Escape; choose another prefix');
  let panel: MapPanel | undefined;
  const server = await startServer({ dataDir, port: 0, webDir: '', serveWeb: false, onEvent: event => {
    if (event.type === 'state') panel?.update(event.session);
    else if (event.type === 'error' && panel) panel.error = event.message;
  } });
  let timer: NodeJS.Timeout | undefined;
  try {
    let state;
    try { state = await server.store.get(mapId); }
    catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
      state = await server.store.create({ id: mapId, goal: '첫 질문을 기다립니다', rootTitle: '대화 시작 대기', waitingForGoal: true,
        binding: { cli: resolved.adapter || 'demo', conversation: `${options.command} · ${mapId}` } });
    }
    if (resolved.adapter && state.binding.cli !== resolved.adapter && !options.demo) throw new Error('This map belongs to another CLI. Choose a new --session.');
    if (!state.active) state = await server.store.mutate(mapId, 'active', true);
    panel = new MapPanel(state, dataDir, async (kind, value) => server.store.mutate(mapId, kind, value)); await panel.init();
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    Object.assign(env, { BRAINPANE_SESSION: mapId, BRAINPANE_DATA_DIR: dataDir, BRAINPANE_CLI: resolved.adapter || '', BRAINPANE_COMMAND: join(root, 'bin/brainpane.mjs'), BRAINPANE_SKILL: join(root, 'skills/brainpane/SKILL.md') });
    let args = [...options.args];
    if (!resolved.adapter) panel.notice = '화면 실행만 지원 · 이 CLI의 지도 어댑터는 없습니다.';
    else if (options.bootstrap !== false && args.length === 0 && !options.demo) {
      const prompt = `Brainpane terminal mapping is explicitly enabled for this CLI conversation. Read the Brainpane skill at ${JSON.stringify(env.BRAINPANE_SKILL)} and its protocol. Use node ${JSON.stringify(env.BRAINPANE_COMMAND)} for local commands; BRAINPANE_SESSION and BRAINPANE_DATA_DIR already bind this process to map ${mapId}. The server is managed by the wrapper; do not start any server/browser or other model. Read context once, then maintain small updates after meaningful public conversation changes. This startup instruction is control metadata, NOT the user's original question: preserve waitingForGoal until their first substantive message. When it arrives, initialize the goal with its captured user evidence and update the root title. Respond to this startup only with a short readiness sentence. Do not analyze repository files, hidden reasoning, terminal output or tool logs for the map. Stop/sync follow the skill.`;
      args = [prompt];
    } else if (resolved.adapter && !options.demo) panel.notice = `왼쪽에서 ${resolved.adapter === 'claude' ? '/brainpane' : '$brainpane'} start로 지도를 활성화하세요.`;
    if (options.demo) {
      const fixture = JSON.parse(await readFile(join(root, 'fixtures/demo.json'), 'utf8'));
      if (state.version > 0) throw new Error('Demo needs a new session ID; existing maps are preserved.');
      // Replay published patches through the exact authenticated API; no semantic claims about the child CLI.
      let step = 0; let pending = false;
      panel.notice = '예정된 8턴 패치 재생 · LLM 판단 평가 아님';
      timer = setInterval(async () => {
        if (pending || step >= fixture.turns.length) return; pending = true;
        try {
          const patch = structuredClone(fixture.turns[step].patch);
          if (step === 0) patch.operations.unshift({ type: 'goal', goal: fixture.session.goal, evidence: { id: 'fixture-start', role: 'user', text: fixture.turns[0].text } }, { type: 'edit', topicId: 'root', changes: { title: fixture.session.rootTitle } });
          const response = await fetch(`${server.origin}/api/sessions/${mapId}/publish`, { method: 'POST', headers: { Authorization: `Bearer ${server.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
          if (!response.ok) throw new Error('Demo patch rejected'); step++;
          panel!.notice = `예정된 패치 ${step}/8 · 실제 CLI 해석과 별개`;
        } catch (e) { panel!.error = (e as Error).message; clearInterval(timer); }
        finally { pending = false; }
      }, 1100);
    }
    return await terminalApp({ command: options.command, args, env, width, prefix, panel });
  } finally { clearInterval(timer); await server.close(); }
}
