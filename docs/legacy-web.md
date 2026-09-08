# Brainpane

> Archived browser-first prototype notes. Superseded by the same-terminal requirement. These old run commands are not the current installation contract; use the root README. The maintained/default interface is `brainpane run -- codex|claude`.

**LLM과 대화하면서 길을 잃지 않도록, 현재 위치와 대화의 가지를 보여주는 로컬 지도.**

Claude Code / Codex에서 평소처럼 대화하고, 옆의 브라우저에서 지도를 봅니다. `brainpane` CLI가 서버 실행·스킬 설치·구조화 업데이트 발행을 담당합니다. 웹은 지도 표시와 사용자 수정만 담당하며, 새 AI 채팅 서비스가 아닙니다.

MVP · MIT · 별도 LLM API 키 없음 · 기본 텔레메트리 없음

## 설치와 첫 실행

Node.js **22.12 이상**과 npm이 필요합니다. 이 저장소를 내려받은 디렉터리에서 실행하세요. PowerShell, 일반 터미널 모두 같은 명령입니다.

```text
npm ci
npm run build
npm start
```

서버가 출력한 `Open privately: http://127.0.0.1:4783/#access=...` 링크를 브라우저에서 여세요. 최초 접속 권한을 전달하는 링크이므로 공유하지 마세요. 브라우저는 인증 직후 주소에서 fragment를 제거합니다. 로그인이나 LLM API 키 입력 화면은 없습니다.

다른 터미널에서, **같은 프로젝트 디렉터리**에서:

```text
npm run brainpane -- demo --session demo-first
```

웹의 세션 선택에서 `demo-first`를 선택하세요. 8개의 예정된 패치가 실제 HTTP → 검증 → 저장 → SSE 경로로 전달됩니다. 다시 재생할 때는 다른 ID를 쓰세요. 기존 지도를 덮어쓰지 않습니다. 애니메이션 없이 빠르게 재생하려면 `--interval 0`을 붙입니다.

전역 명령을 원하는 경우 로컬 체크아웃에서 한 번 `npm link`를 실행하면 아래 예시의 `brainpane`을 바로 사용할 수 있습니다. 전역 설치 없이도 **모든 `brainpane ...` 명령을 `npm run brainpane -- ...`로 실행**할 수 있습니다. 아직 npm 레지스트리에 게시한 패키지가 아니므로 `npx brainpane`로 설치하지 마세요.

```text
brainpane start --open
brainpane install codex
brainpane install claude
```

`--open`은 선택 사항입니다. 기본 포트는 4783이며 `--port 4784`로 변경합니다. 서버는 전경에서 실행되며 Ctrl+C로 종료합니다. 다시 같은 저장소/포트로 시작하면 지도와 열린 브라우저 연결을 복구합니다. 별도 `npm run dev` 서버는 필요 없습니다. 코드를 변경한 경우 빌드 후 서버를 재시작하세요.

## 기존 CLI에서 시작하기

프로젝트 범위 스킬 설치:

```text
npm run brainpane -- install codex
```

Codex CLI에서 입력합니다. `$`는 셸 명령이 아니라 **Codex 대화 입력란**에서 입력하는 스킬 호출입니다.

```text
$brainpane start --session my-conversation
지금 이 대화를 지도에 기록해 줘. 처음 질문은 LLM 대화에서 길을 잃지 않는 방법이야.
```

Claude Code를 쓰면 `npm run brainpane -- install claude` 후 대화 입력란에:

```text
/brainpane start --session my-conversation
```

그다음 원래 대화를 계속하세요. 에이전트가 현재 문맥으로 작은 업데이트를 작성하고 설치된 Node 어댑터로 발행합니다. 지도의 ID와 CLI 종류·대화 라벨은 명시적으로 연결됩니다. 대화 라벨은 사람이 식별하기 위한 것이며 네이티브 CLI 세션 ID라고 가장하지 않습니다. 같은 ID를 서로 다른 CLI 대화에 연결하지 마세요.

누락이 보이면 같은 CLI 대화에서:

```text
$brainpane sync --session my-conversation
```

중단/재개:

```text
$brainpane stop --session my-conversation
$brainpane start --session my-conversation
```

Claude에서는 `$brainpane` 대신 `/brainpane`을 사용합니다. 중단 이후 스킬은 추가 지도 해석·발행을 하지 않도록 지시됩니다. 웹의 중단 버튼은 서버에서 이후 발행을 거절하고, 에이전트가 다음 context를 읽을 때 중단을 확인하게 합니다. **웹 버튼은 CLI 대화에 지시를 주입할 수 없으므로 추가 지도 도구 호출까지 즉시 끊으려면 CLI에도 stop을 입력하세요.**

### 자동 갱신의 정확한 범위

Current Agent Mode입니다. 시작한 이후의 갱신은 현재 에이전트가 스킬 지침을 따르는 방식입니다. **매 턴을 강제하는 훅·이벤트 연결은 구현하지 않았습니다. 스킬 설치만으로 완전 자동 실행을 보장하지 않습니다.** 문맥 압축·스킬 누락·도구 권한·서버 중단으로 갱신이 빠질 수 있습니다. AI 갱신 시각과 연결 상태를 보고 명시적으로 sync할 수 있습니다. 연결 복구는 저장된 지도를 복구하며, 누락된 대화의 의미 해석은 sync가 담당합니다.

본래 CLI의 입력/응답/스크롤/단축키는 변경하지 않습니다. CLI가 보여주는 도구 호출은 보일 수 있습니다. 연동 오류는 지도 명령에서 끝나며 기존 대화를 재귀 호출하거나 추가 응답을 강제하지 않습니다. PTY·화면 캡처·ANSI 파싱·내부 로그·구독 토큰 추출을 사용하지 않습니다.

별도 API 키는 필요 없지만 지도 생성에 기존 CLI의 **추가 추론과 도구 호출 사용량**이 들 수 있습니다. 무료나 추가 토큰 0을 보장하지 않습니다. 지도 저장은 로컬이지만 기존 CLI가 클라우드 모델을 쓰면 추론까지 오프라인인 것은 아닙니다.

### 설치 파일과 다른 프로젝트

공통 원본은 `skills/brainpane/`입니다. 설치 시 아래에 `SKILL.md`, `protocol.md`, `bridge.mjs` 3개를 복사/생성합니다.

| CLI | 프로젝트 경로 | 명시적 호출 |
| --- | --- | --- |
| Codex | `.agents/skills/brainpane/` | `$brainpane` 또는 `/skills`에서 선택 |
| Claude Code | `.claude/skills/brainpane/` | `/brainpane` |

기존 디렉터리가 있으면 거절하며 다른 설정·AGENTS.md·CLAUDE.md·훅은 수정하지 않습니다. CLI에서 스킬이 나타나지 않으면 해당 CLI를 재시작하세요. 제거하려면 설치한 디렉터리의 위 3개 파일과 빈 디렉터리만 삭제하면 됩니다. 전역 링크는 `npm unlink -g brainpane`으로 제거합니다.

다른 프로젝트에 설치하려면 `brainpane install codex --project "C:/work/my-project"`를 사용하세요. 서버도 그 프로젝트에서 실행하거나 `brainpane start --data "C:/work/my-project/.brainpane"`로 실행합니다. 설치 어댑터는 해당 프로젝트의 `.brainpane`을 고정하며, Brainpane 빌드 경로를 절대경로로 참조합니다. 빌드를 이동하면 스킬을 재설치하세요. 다른 프로젝트에서는 `.gitignore`에 `.brainpane/`를 추가하세요. 설치기는 기존 ignore 파일도 변경하지 않습니다.

## 지도 읽기

- 상단: 원래 출발점, 현재 주제, 경로, 근거가 있을 때 이동 이유, 추정 표시, 마지막 AI 갱신 시각.
- 중앙: 계층형 주제 지도. 현재 노드는 `◉ 현재 대화`, 상태는 `○ 검토 중 / ✓ 해결됨 / Ⅱ 보류됨`으로 표시합니다.
- 노드 선택: 맥락, 진행, 남은 질문, 제안/결정, 확보된 공개 발언 원문. 선택은 대화의 현재 위치를 바꾸지 않습니다.
- 현재 대화로 돌아가기: 현재 노드를 선택하고 보이게 합니다. 현재 위치가 접힌 가지 안에 있으면 그 가지에 표시합니다.
- 현재 위치 추적: 기본 꺼짐. 켜도 과거 가지를 선택해 보는 동안 강제로 이동하지 않습니다. 콘텐츠 수정만으로 줌이나 좌표가 바뀌지 않습니다.
- 드래그·접힘·선택·배율은 브라우저에 저장됩니다. 전체 보기와 재정렬은 사용자가 누르는 별도 동작입니다. 좁은 창에서는 가지 설명이 지도 아래로 내려갑니다.
- 제목/상태를 수정하면 해당 필드를 보호합니다. AI의 덮어쓰기 패치는 409로 거절됩니다. 사용자 수정은 계속 가능합니다.

원문은 실제로 확보한 텍스트만 표시합니다. 출처 ID는 저장된 발언의 로컬 라벨이며 네이티브 메시지 ID가 아닙니다. 원문이 없으면 요약만 보여주며 원문 연결 미지원으로 표시합니다. 터미널 점프 링크는 없습니다.

## 로컬 명령

```text
brainpane begin --session idea-1 --goal "대화의 원래 질문" --cli codex --conversation "이번 CLI 대화"
brainpane context --session idea-1
brainpane publish --session idea-1 --file ".brainpane/patch.json"
brainpane stop --session idea-1
brainpane resume --session idea-1
```

`publish --file -`는 stdin도 지원합니다. UTF-8 JSON 파일을 권장합니다. 거대한 JSON을 셸 인자로 조립하지 마세요. 정확한 패치 예시는 [프로토콜](skills/brainpane/protocol.md)에 있습니다. 모든 명령은 `--data path`를 지원하고 기본값은 현재 디렉터리의 `.brainpane`입니다. 실행 중인 서버와 같은 경로를 사용해야 합니다.

## 데이터·오류·보안

`src/core`: Zod 모델·순수 reducer·직렬화된 저장. `src/server`: loopback API·인증·SSE. `src/cli.ts`: 로컬 명령과 얇은 설치기. `src/web`: React Flow와 브라우저 ViewState. LLM은 의미 판단만 하며 HTML·SVG·좌표·뷰 상태를 생성하지 않습니다.

- `.brainpane/sessions/<id>.json`: 세션별 의미 데이터. 임시 파일 작성 후 rename으로 교체합니다. 한 데이터 디렉터리는 한 서버 프로세스만 소유합니다.
- 브라우저 localStorage: 세션별 선택·접힘·좌표·배율·추적. 같은 origin의 해당 브라우저에만 보존됩니다. 서버 포트나 브라우저가 달라지면 화면 상태는 별도입니다.
- `baseVersion` 불일치는 409. 동일 updateId + 같은 파싱된 JSON은 중복 적용하지 않고, 다른 내용으로 ID를 재사용하면 409입니다. 실패 패치는 마지막 정상 지도를 바꾸지 않습니다. 클라이언트는 전체 최신 snapshot을 SSE로 받아 재연결 시 다시 읽습니다.
- 안정적인 ID, 단일 루트, 올바른 참조, 순환 없음, 사용자 보호 필드, 결정 근거 구조를 검증합니다. 트리 삭제/부모 변경은 MVP 프로토콜에서 허용하지 않습니다. 의미 자체가 맞는지는 스키마가 증명하지 못합니다.
- 최대 300개 주제, 10,000개 업데이트 영수증, 요청 128 KiB입니다. 첫 버전은 소규모 지도 대상입니다. 포화 시 명시적인 새 세션을 사용하며 자동 삭제/롤오버는 없습니다.
- 기본 바인딩은 `127.0.0.1`뿐입니다. Host·Origin·교차 사이트 요청을 검증하고, 모든 데이터 API에 Brainpane 전용 로컬 접근 키를 요구합니다. 키는 `access.key`에 보관되며 CLI 인증 정보와 무관합니다. 브라우저는 HttpOnly / SameSite=Strict 쿠키로 접근합니다. 서버는 요청 본문이나 대화·키를 로그에 기록하지 않습니다.
- 최초 접속 링크는 터미널에만 출력합니다. 실제 대화/키/로그/테스트 산출물은 Git에서 제외합니다. 데이터는 평문 로컬 파일이므로 OS 계정과 파일 권한의 보호를 받습니다. 다른 OS 계정의 접근을 막으려면 Windows 폴더 ACL을 관리하세요.
- 임의 로컬 파일을 읽어주는 API, HTML 실행, 외부 폰트/스크립트, 기본 텔레메트리는 없습니다. 원문도 React 텍스트로 렌더링합니다.
- 서버 오류는 간결한 실패 응답과 UI 오류로 표시합니다. 서버 자체에 도달하지 못한 publish는 웹이 알 수 없으므로 CLI 실패와 마지막 AI 갱신 시각으로 확인합니다. 영구적인 디스크 손상 복구용 백업/마이그레이션은 아직 없습니다.

## 검증

```text
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

Node 테스트는 상태 검증, 중복/충돌, 세션 격리, 참조/순환, 저장 복구, 사용자 보호, 현재 위치/선택 분리, 8턴 fixture, 실제 CLI publish→저장→SSE, 인증과 비파괴 설치를 검사합니다. 브라우저 테스트는 publish→화면 반영, 탐색 중 화면 유지, 수정/실패, 접힘 표시, 중단, 재시작 자동 재연결, 새로고침과 390px 창을 검사합니다.

**예정된 데모 패치 재생은 LLM 판단 평가가 아닙니다.** 같은 대화를 실제 스킬로 한 턴씩 수행하는 절차와 점검표는 [의미 판단 평가](docs/EVALUATION.md), 실행 결과와 미검증 범위는 [검증 기록](docs/VERIFICATION.md)에 있습니다.

## 범위 밖

자체 채팅/터미널, PTY 래퍼, 터미널 자동 분할, 호스트 내장 웹뷰 통합, CLI 로그 파서, 강제 매 턴 훅, 멀티 LLM 공급자, 교차 관계 편집, 그래프 삭제/병합, 클라우드/협업/로그인/결제, 키·토큰 모니터링은 구현하지 않았습니다. 일반 터미널·Windows Terminal·cmux·Orca는 호스트이고 Claude Code·Codex는 AI CLI입니다. 브라우저는 사용자가 옆에 배치합니다. 호스트별 웹뷰 지원 여부는 가정하지 않습니다.

## 공식 문서와 의존성

2026-09-09에 확인했습니다. Codex의 프로젝트 스킬 경로와 `$` 호출은 [공식 Agent Skills 문서](https://learn.chatgpt.com/docs/build-skills), Claude의 경로와 `/brainpane` 호출은 [공식 Skills 문서](https://code.claude.com/docs/en/skills)에 근거합니다. 스킬 발견은 턴마다 실행되는 이벤트 계약이 아닙니다.

[React Flow API](https://reactflow.dev/api-reference/react-flow), [Vite 시작 가이드](https://vite.dev/guide/), [Zod 문서](https://zod.dev/)를 확인하고 설치된 타입으로 빌드를 검증했습니다. 정확한 의존성은 package-lock.json에 고정되어 있습니다. 라이선스 목록은 [THIRD_PARTY.md](THIRD_PARTY.md)에 있습니다.
