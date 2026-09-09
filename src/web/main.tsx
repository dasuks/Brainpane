import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, Handle, Position, type NodeProps, type Node, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './style.css';
import type { Session, Topic } from '../core/model';
import { browse, pathTo, placeNew, readView, visible, type ViewState } from './view';

const statuses = { open: '○ 검토 중', resolved: '✓ 해결됨', parked: 'Ⅱ 보류됨' };
async function api(path: string, body?: unknown, token?: string) {
  const r = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await r.json(); if (!r.ok) throw new Error(value.error || '요청 실패'); return value;
}
type TopicNode = Node<{ topic: Topic; focus: boolean; onPath: boolean; collapsed: boolean; inside: boolean; count: number; toggle: () => void }, 'topic'>;
function MapNode({ data }: NodeProps<TopicNode>) {
  return <div className={`topic-node ${data.focus ? 'focused' : ''} ${data.onPath ? 'on-path' : 'aside-path'}`} data-testid={`topic-${data.topic.id}`}>
    <Handle type="target" position={Position.Left} />
    <div className="node-kicker">{data.focus ? '◉ 현재 대화' : data.topic.parentId === null ? '출발점' : statuses[data.topic.status]}</div>
    <strong>{data.topic.title}</strong>
    <div className="node-bottom"><span>{data.focus ? statuses[data.topic.status] : data.topic.locks.length ? '사용자 수정 보호' : '대화 주제'}</span>
      {data.count > 0 && <button className="nodrag nopan fold" aria-label={`${data.topic.title} ${data.collapsed ? '펼치기' : '접기'}`} onClick={e => { e.stopPropagation(); data.toggle(); }}>{data.collapsed ? '+' : '−'} {data.count}</button>}</div>
    {data.inside && <div className="inside">◉ 이 가지 안에서 대화 중</div>}
    <Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { topic: MapNode };
function App() {
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('access');
    // Consume the fragment once; never send it in a URL, referrer or localStorage.
    if (token) history.replaceState(null, '', location.pathname + location.search);
    (async () => { if (token) await api('auth', {}, token); await api('sessions'); setReady(true); })().catch(e => setError(e.message));
  }, []);
  if (!ready) return <div className="gate"><div className="brand">◈ Brainpane</div><h1>대화의 길을 잃지 않도록.</h1><p>{error || '로컬 지도에 연결하고 있습니다…'}</p>{error && <p>서버의 <code>brainpane start</code> 출력에 있는 접속 링크를 열어주세요.</p>}</div>;
  return <Workspace />;
}
function Workspace() {
  const [sessions, setSessions] = useState<Array<Pick<Session, 'id' | 'goal' | 'binding'>>>([]);
  const [key, setKey] = useState(() => new URLSearchParams(location.search).get('session') || '');
  const keyRef = useRef(key); keyRef.current = key;
  const [state, setState] = useState<Session | null>(null);
  const [connection, setConnection] = useState('연결 중'); const [error, setError] = useState('');
  const [tick, setTick] = useState(Date.now());
  async function refresh() {
    const list = await api('sessions'); setSessions(list);
    if (keyRef.current) { const captured = keyRef.current; const s = await api(`sessions/${captured}`); if (keyRef.current === captured) setState(old => old && old.id === s.id && old.version > s.version ? old : s); }
  }
  useEffect(() => {
    const stream = new EventSource('/api/events');
    stream.addEventListener('ready', () => { setConnection('실시간 연결'); void refresh().catch(e => setError(e.message)); });
    stream.onmessage = event => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'error' && msg.sessionId === keyRef.current) setError(`갱신 실패 · ${msg.message}`);
      if (msg.type === 'state') {
        const s = msg.session as Session;
        setSessions(old => [...old.filter(x => x.id !== s.id), s]);
        if (s.id === keyRef.current) { setState(old => old?.id === s.id && old.version > s.version ? old : s); setError(''); }
      }
    };
    stream.onerror = () => setConnection('연결 끊김 · 재연결 중');
    const timer = setInterval(() => setTick(Date.now()), 10000);
    return () => { stream.close(); clearInterval(timer); };
  }, []);
  useEffect(() => { setState(null); setError(''); if (key) void refresh().catch(e => setError(e.message)); }, [key]);
  function select(id: string) { keyRef.current = id; setKey(id); history.replaceState(null, '', `?session=${encodeURIComponent(id)}`); }
  return <div className="app"><header className="app-header"><a className="brand" href="/">◈ <span>Brainpane</span></a><span className="divider"/><span className="edition">CONVERSATION MAP</span>
    <span className={`connection ${connection.startsWith('연결 끊김') ? 'offline' : ''}`} role="status">{connection.startsWith('실시간') ? '●' : '○'} {connection}</span></header>
    <div className="session-bar"><span>로컬 지도</span><select aria-label="대화 세션" value={key} onChange={e => select(e.target.value)}><option value="">지도를 선택하세요</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.goal} · {s.id}</option>)}</select></div>
    {error && <div className="error" role="alert">{error}<button onClick={() => void refresh().then(() => setError('')).catch(e => setError(e.message))}>다시 불러오기</button></div>}
    {state ? <Conversation key={state.id} session={state} tick={tick} onError={setError} onState={setState} /> : <main className="empty"><span className="eyebrow">YOUR CONVERSATION, IN PERSPECTIVE</span><h1>지금, 어느 이야기에<br/>와 있나요?</h1><p>기존 CLI에서 자유롭게 대화하세요.<br/>여기에는 출발점과 돌아갈 가지가 남습니다.</p><div className="empty-instruction"><span>먼저 API 키 없는 데모를 시작해 보세요</span><code>npm run brainpane -- demo</code><small>실행 후 위에서 생성된 지도를 선택하세요.</small></div></main>}
  </div>;
}
function Conversation({ session: s, tick, onError, onState }: { session: Session; tick: number; onError: (e: string) => void; onState: (s: Session) => void }) {
  const [view, setView] = useState<ViewState>(() => readView(s.id));
  const flow = useRef<ReactFlowInstance<TopicNode> | null>(null); const lastFocus = useRef(s.focusTopicId);
  const [sync, setSync] = useState(false); const [busy, setBusy] = useState(false);
  const positions = placeNew(s, view.positions);
  const selectedId = view.selectedTopicId || s.focusTopicId;
  const selected = s.topics.find(t => t.id === selectedId) || s.topics[0];
  const focus = s.topics.find(t => t.id === s.focusTopicId)!;
  const path = pathTo(s, s.focusTopicId);
  useEffect(() => { setView(v => ({ ...v, positions: placeNew(s, v.positions) })); }, [s.topics.length]);
  useEffect(() => { try { localStorage.setItem(`brainpane:view:${s.id}`, JSON.stringify(view)); } catch { onError('화면 상태를 저장할 수 없습니다. 브라우저 저장 공간을 확인하세요.'); } }, [view, s.id]);
  function center(key: string) { const p = positions[key]; if (p) void flow.current?.setCenter(p.x + 128, p.y + 60, { zoom: flow.current.getZoom() }); }
  useEffect(() => {
    if (lastFocus.current !== s.focusTopicId && view.follow && (view.selectedTopicId === null || view.selectedTopicId === lastFocus.current)) {
      setView(v => ({ ...v, selectedTopicId: null, collapsed: v.collapsed.filter(k => !path.includes(k)) })); center(s.focusTopicId);
    }
    lastFocus.current = s.focusTopicId;
  }, [s.focusTopicId]);
  const nodes: TopicNode[] = s.topics.filter(t => visible(s, t.id, view.collapsed)).map(t => ({
    id: t.id, type: 'topic', position: positions[t.id], selected: selectedId === t.id,
    data: { topic: t, focus: t.id === s.focusTopicId, onPath: path.includes(t.id),
      collapsed: view.collapsed.includes(t.id), inside: t.id !== s.focusTopicId && path.includes(t.id) && view.collapsed.includes(t.id),
      count: s.topics.filter(n => n.parentId === t.id).length,
      toggle: () => setView(v => ({ ...v, collapsed: v.collapsed.includes(t.id) ? v.collapsed.filter(k => k !== t.id) : [...v.collapsed, t.id] })) },
  }));
  const shown = new Set(nodes.map(n => n.id));
  const edges = s.topics.filter(t => t.parentId && shown.has(t.id) && shown.has(t.parentId)).map(t => ({ id: `${t.parentId}-${t.id}`, source: t.parentId!, target: t.id, type: 'smoothstep', style: { stroke: path.includes(t.id) ? '#467465' : '#c8ccc5', strokeWidth: path.includes(t.id) ? 2 : 1.2 } }));
  const age = Math.max(0, Math.floor((tick - new Date(s.lastAgentUpdateAt || s.updatedAt).getTime()) / 60000));
  async function active() { setBusy(true); try { onState(await api(`sessions/${s.id}/active`, !s.active)); } catch (e) { onError((e as Error).message); } finally { setBusy(false); } }
  function returnNow() { setView(v => ({ ...v, selectedTopicId: null, collapsed: v.collapsed.filter(k => !path.includes(k)) })); center(s.focusTopicId); }
  return <>
    <section className="current"><div className="current-meta"><span className="eyebrow">{s.active ? '현재 대화의 위치' : '지도 생성 중단됨'} {s.certainty === 'inferred' && '· 추정'}</span><span className="update-time">{s.lastAgentUpdateAt ? `${age === 0 ? '방금' : `${age}분 전`} AI 갱신` : 'AI 갱신 대기'} · v{s.version}</span></div>
      <nav aria-label="현재 대화 경로">{path.map((id, i) => <React.Fragment key={id}>{i > 0 && <span className="crumb-arrow">/</span>}<button onClick={() => setView(v => browse(v, id))}>{s.topics.find(t => t.id === id)!.title}</button></React.Fragment>)}</nav>
      <h1>{focus.title}</h1>{s.reason && <p className="reason">↳ {s.reason}</p>}
      <div className="origin"><span>출발점</span> {s.originalGoal}</div>
      {s.goal !== s.originalGoal && <div className="origin"><span>변경된 목표</span> {s.goal}</div>}
    </section>
    <main className="work-area"><section className="map-area" aria-label="대화 지도"><div className="map-toolbar"><span className="map-label">대화의 가지 <small>{s.topics.length}</small></span><div className="map-actions"><label><input type="checkbox" checked={view.follow} onChange={e => setView(v => ({ ...v, follow: e.target.checked }))}/>현재 위치 추적</label><button onClick={() => { setView(v => ({ ...v, positions: placeNew(s, {}), collapsed: [] })); }}>재정렬</button><button onClick={() => void flow.current?.fitView({ padding: 0.18 })}>전체 보기</button></div></div>
      <div className="canvas"><ReactFlow<TopicNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={instance => { flow.current = instance; }} defaultViewport={view.viewport}
        minZoom={0.2} maxZoom={2} nodesConnectable={false} nodesDraggable deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null}
        onNodeClick={(_, node) => setView(v => browse(v, node.id))}
        onNodeDrag={(_, node) => setView(v => ({ ...v, positions: { ...placeNew(s, v.positions), [node.id]: node.position } }))}
        onMoveEnd={(_, viewport) => setView(v => ({ ...v, viewport }))}>
        <Background color="#d8dcd5" gap={24}/><Controls showInteractive={false}/>
      </ReactFlow><div className="canvas-note">선을 따라 맥락을, 가지에서 다른 이야기를.</div></div>
      <div className="map-footer"><span>{selectedId !== s.focusTopicId ? '과거 가지를 둘러보는 중' : '◉ 현재 대화 보고 있음'}</span><button className="return-button" onClick={returnNow}>현재 대화로 돌아가기 ↗</button></div>
    </section><Detail key={`${s.id}:${selected.id}`} topic={selected} session={s} onError={onError} onState={onState}/></main>
    <footer className="statusbar"><span>{s.binding.cli.toUpperCase()} · {s.binding.conversation} · {s.id}</span><span title={s.updatedAt}>마지막 저장 {new Date(s.updatedAt).toLocaleTimeString('ko-KR')} · {s.lastUpdateBy === 'agent' ? 'AI' : s.lastUpdateBy === 'user' ? '사용자' : '시작'}</span><div><button onClick={() => setSync(!sync)}>다시 동기화</button><button disabled={busy} onClick={() => void active()}>{s.active ? '지도 생성 중단' : '지도 생성 재개'}</button></div></footer>
    {sync && <div className="sync-help" role="status"><strong>현재 CLI 대화에 입력하세요</strong><code>{s.binding.cli === 'claude' ? '/brainpane' : '$brainpane'} {s.active ? 'sync' : 'start'} --session {s.id}</code><p>에이전트가 현재 문맥을 다시 읽고 갱신합니다. 스킬 기반 갱신은 누락될 수 있으며, 매 턴 실행을 보장하지 않습니다.</p><button onClick={() => setSync(false)}>닫기</button></div>}
  </>;
}
function Detail({ topic: t, session: s, onError, onState }: { topic: Topic; session: Session; onError: (e: string) => void; onState: (s: Session) => void }) {
  const [editing, setEditing] = useState(false); const [title, setTitle] = useState(t.title); const [status, setStatus] = useState(t.status); const [busy, setBusy] = useState(false);
  async function save() {
    const change: Record<string, unknown> = { topicId: t.id, baseVersion: s.version };
    if (title !== t.title) change.title = title; if (status !== t.status) change.status = status;
    setBusy(true); try { onState(await api(`sessions/${s.id}/edit`, change)); setEditing(false); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }
  return <aside className="detail"><div className="detail-top"><span className="eyebrow">선택한 가지</span><span>{t.id === s.focusTopicId ? '◉ 현재' : '둘러보기'}</span></div><h2>{t.title}</h2><div className="detail-status">{statuses[t.status]}<button onClick={() => { setTitle(t.title); setStatus(t.status); setEditing(!editing); }}>수정</button></div>
    {editing && <form onSubmit={e => { e.preventDefault(); void save(); }}><label>주제 제목<input value={title} maxLength={140} required onChange={e => setTitle(e.target.value)}/></label><label>진행 상태<select value={status} onChange={e => setStatus(e.target.value as Topic['status'])}>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><small>수정한 필드는 이후 AI 갱신으로 덮어쓰지 않습니다.</small><button disabled={busy} type="submit">수정 저장</button></form>}
    {t.locks.length > 0 && <p className="protected">사용자 수정 보호 · {t.locks.map(k => k === 'title' ? '제목' : '상태').join(', ')}</p>}
    <section><h3>무엇을 이야기했나요</h3><p>{t.summary || '아직 맥락이 기록되지 않았습니다.'}</p></section>
    <section><h3>어디까지 왔나요</h3><p>{t.progress || '아직 기록되지 않았습니다.'}</p>{t.statements.map((a, i) => <p className="statement" key={i}><span>{a.kind === 'proposal' ? '제안' : '결정 · 사용자 근거 있음'}</span>{a.text}</p>)}</section>
    <section><h3>남아 있는 이야기</h3><p>{t.remaining || '남은 질문이 기록되지 않았습니다.'}</p></section>
    <section className="sources"><h3>확보된 원문 <span>{t.sources.length}</span></h3>{t.sources.length ? t.sources.map(source => <details key={source.id}><summary>{source.role === 'user' ? '사용자' : '어시스턴트'} 발언 · {source.id}</summary><blockquote>{source.text}</blockquote></details>) : <p className="muted">요약만 제공됩니다. 원문 출처 연결은 지원되지 않습니다.</p>}<small>직접 확보한 발언만 표시합니다. CLI 원문으로 이동하는 기능은 없습니다.</small></section>
  </aside>;
}
createRoot(document.getElementById('root')!).render(<App/>);
