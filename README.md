# Brainpane

**대화의 현재 위치와 돌아갈 가지를, 기존 AI CLI와 같은 터미널 화면에서.**

A conversation compass beside your actual Codex or Claude Code process. One terminal, one command. No browser, replacement chat client, or separate model API key.

```text
brainpane run -- codex
brainpane run -- claude
```

왼쪽은 기존 로그인·세션을 사용하는 **실제 AI CLI**, 오른쪽은 출발점·현재 경로·미결/보류한 가지가 남는 고정 패널입니다. 내부 프로세스는 Brainpane이 시작하고 종료합니다. 별도 서버·브라우저·두 번째 터미널·tmux·zellij·호스트 전용 API가 필요하지 않습니다.

MVP / MIT. 갱신은 현재 에이전트의 스킬 지침에 따른 방식이며, **매 턴 실행을 강제하는 훅은 없습니다**. 누락 시 재동기화를 제공합니다.

## 설치

Node.js **22.12 이상**, npm, 사용할 Codex 또는 Claude Code가 필요합니다. 각 CLI의 로그인은 기존 방법 그대로 사용합니다.

```text
git clone https://github.com/dasuks/Brainpane.git
cd Brainpane
npm ci
npm run build
npm link
```

설치 후 평소 작업하던 프로젝트의 터미널에서 `brainpane run -- codex` 또는 `brainpane run -- claude`를 실행하세요. CLI의 기존 프로젝트 신뢰/권한 확인은 평소처럼 처리합니다. Brainpane은 이를 우회하지 않습니다. 준비 후 첫 실제 질문부터 지도가 만들어집니다.

전역 링크 없이 이 체크아웃에서 실행하려면 `npm run brainpane -- run -- codex`를 사용합니다. `npm start`도 Codex 터미널 모드를 실행합니다. 아직 레지스트리에 게시한 패키지가 아니므로 `npx brainpane`로 설치하지 마세요.

Windows에서는 node-pty의 ConPTY를 사용합니다. 이 Windows x64 / Node 24 환경에서는 포함된 네이티브 바이너리로 설치됐습니다. 다른 OS/아키텍처에서 사전 빌드가 없으면 [node-pty 빌드 의존성](https://github.com/microsoft/node-pty#dependencies)이 필요할 수 있습니다. Bash 전용 실행 스크립트는 없습니다.

## 조작

기본 입력은 왼쪽 CLI로 전달됩니다. 예약하는 키는 **`Ctrl+]` 접두키 하나**입니다. 누르고 놓은 뒤 다음 키를 누르세요. 접두키를 두 번 누르면 원래 키가 CLI에 전달됩니다.

| 접두키 다음 | 동작 |
| --- | --- |
| `Tab` / `m` | 채팅 ↔ 지도 포커스 |
| `p` | 패널 숨기기/표시 |
| `+` / `-` | 패널 폭 조절 |
| `u` / `d` | 왼쪽 스크롤백 위/아래 |
| `e` | 왼쪽 최신 출력으로 복귀 |
| `c` | 선택·복사 모드 |
| `?` | 도움말 |
| `q` | CLI와 내부 서비스 종료 |

좁은 터미널에서는 같은 화면에서 채팅과 지도를 전환합니다. 크기 변경은 자식 PTY에도 전달됩니다. 접두키와 초기 폭은 설정 가능합니다.

```text
brainpane run --width 46 --prefix ctrl-g -- codex
```

Ctrl+C·Enter·Tab·Escape는 접두키로 예약할 수 없습니다. 채팅 포커스에서 기존 키/방향키/응답 중단은 자식으로 전달됩니다. 실제 단축키 지원 범위는 사용 중인 호스트와 CLI의 영향을 받습니다.

지도 포커스의 키:

| 키 | 동작 |
| --- | --- |
| `↑↓` / `jk` | 주제 선택 |
| `←→` / `hl` | 접기/펼치기 |
| `Enter` | 주제 상세 ↔ 전체 지도 |
| `PageUp/Down` | 지도/상세 스크롤 |
| `n` | 실제 현재 주제로 돌아가기 |
| `f` | 현재 위치 추적 토글 |
| `e` | 제목 수정; Enter 저장, Esc 취소 |
| `s` | 상태 변경: 검토 중 → 해결 → 보류 |
| `r` | CLI 재동기화 명령 안내 |
| `x` | 지도 발행 수락 중단/재개 |
| `Esc` | 상세/편집 닫기, 이후 채팅 복귀 |

마우스로 지도 노드를 선택할 수 있습니다. 왼쪽 휠은 CLI가 마우스를 사용하는 경우 그 CLI로 전달하고, 그 외에는 스크롤백을 이동합니다. 복사 모드에서 드래그로 텍스트를 선택하고 `y`로 복사합니다. Windows 기본 PowerShell 클립보드, macOS pbcopy, Linux의 설치된 xclip을 사용합니다. 도구가 없으면 오류를 표시합니다. 호스트의 Shift+선택/복사 키 동작은 호스트마다 다를 수 있습니다.

## 스킬 활성화와 복구

인자 없는 `run -- codex` / `run -- claude`는 **현재 CLI의 첫 프롬프트**로 공통 스킬 지침을 전달합니다. 별도 모델이나 API를 추가하지 않습니다. 이 시작 지침은 대화의 출발점으로 기록하지 않습니다.

CLI에 다른 인자를 전달하면 인자 의미를 보존하기 위해 시작 프롬프트를 추가하지 않습니다. 프로젝트 스킬을 한 번 설치하고 해당 CLI 대화에서 활성화하세요.

```text
brainpane install codex
brainpane run --session my-map -- codex resume <actual-cli-session-id>
```

Codex 대화 입력란:

```text
$brainpane start
$brainpane sync
$brainpane stop
```

Claude는 `brainpane install claude` 후 `/brainpane start`, `/brainpane sync`, `/brainpane stop`을 사용합니다. `--no-bootstrap`은 첫 프롬프트 삽입을 끕니다.

지도 ID와 저장 위치는 래퍼가 자식 환경에 명시적으로 전달합니다. 최신 로그를 추측하지 않습니다. 지도 ID와 네이티브 CLI 세션 ID는 다릅니다. `--session`으로 기존 지도를 열 때는 원래 CLI 대화도 직접 지정하세요. 임의 네이티브 실행 파일을 왼쪽에 실행할 수는 있지만 **지도 어댑터는 Codex/Claude만 지원**합니다.

설치 파일은 `.agents/skills/brainpane/` 또는 `.claude/skills/brainpane/`의 `SKILL.md`, `protocol.md`, `bridge.mjs`입니다. 기존 디렉터리가 있으면 거절합니다. 다른 설정/AGENTS.md/CLAUDE.md/훅을 바꾸지 않습니다. 다른 프로젝트는 `--project <path>`를 지정합니다. 제거는 위 세 파일과 빈 디렉터리를 삭제하고, 전역 링크는 `npm unlink -g brainpane`으로 제거합니다.

### 정확한 갱신 범위

- 의미 있는 주제 변화만 작은 패치로 발행합니다. 기존 주제는 ID를 재사용합니다. 모든 메시지나 명사가 노드가 되는 방식이 아닙니다.
- 제안은 결정이 아닙니다. 질문의 전제나 애매한 동의를 합의로 만들지 않습니다. 결정은 확보된 사용자 발언 근거가 필요합니다.
- 현재 위치와 진행 상태는 별개입니다. 떠난 주제를 자동 해결하지 않습니다. 사용자 수정 제목/상태는 AI 덮어쓰기에서 보호합니다.
- **스킬은 매 턴 스케줄러가 아닙니다.** 문맥 압축·권한·지침 누락으로 갱신이 빠질 수 있습니다. AI 갱신 시각/오류를 보고 같은 CLI에서 sync하세요.
- 패널 `x`는 서버에서 발행을 거절하게 합니다. 추가 추론·도구 호출까지 멈추려면 CLI에도 stop을 말하세요. 패널은 채팅 입력을 덮어쓰거나 명령을 몰래 제출하지 않습니다.
- 기존 CLI의 추가 추론·도구 사용량이 발생할 수 있습니다. 별도 API 키가 없다는 것이 무료나 추가 토큰 0을 뜻하지 않습니다. 도구 호출은 CLI에 보일 수 있습니다.
- 지도 오류는 본래 대화를 차단하지 않습니다. 스킬 재시도는 제한되어 있으며 재귀 응답이나 무한 루프를 만들지 않습니다.

## 지도 표현

`◀ 지금`은 실제 대화 위치, `◀ 안에서 대화 중`은 접힌 가지 속 현재 위치입니다. `○` 검토 중, `✓` 해결, `Ⅱ` 보류를 표시합니다. 선택은 실제 대화 위치를 바꾸지 않습니다. 추적은 기본 꺼짐이며 켜도 과거 가지 탐색 중 강제 이동하지 않습니다.

상세에는 맥락·진행·남은 질문·확보된 원문을 표시합니다. 실제 관계/비교가 기록된 주제는 흐름도나 작은 표로 볼 수 있습니다. 같은 Topic 데이터로 그리며 LLM은 좌표·열 너비를 생성하지 않습니다. 원문이 없으면 연결 미지원으로 표시합니다. 네이티브 메시지 ID나 터미널 점프 링크를 만들지 않습니다.

## 데모와 검증

```text
brainpane run --demo -- codex
```

실제 CLI 옆에 예정된 8턴 패치를 재생합니다. 모델 호출용 프롬프트를 보내지 않으며 별도 API 키가 필요 없습니다. CLI 자체의 시작/로그인 조건은 그대로입니다. 패치는 실사용과 같은 HTTP → 검증 → 저장 → 패널 경로를 사용합니다. **데모 재생 성공은 LLM 의미 판단 검증이 아닙니다.**

```text
npm run build
npm test
npm run test:e2e
```

상태·HTTP·VT·지도 테스트와 중첩 PTY 터미널 통합 테스트가 포함됩니다. 통합 테스트 fixture는 터미널 제어용이며, 이를 실제 AI 호환성이라고 보고하지 않습니다.

설치된 실제 CLI/현재 로그인으로 4턴 발행·가지 재사용을 확인하는 선택적 테스트:

```text
npm run test:codex
npm run test:claude
```

**기존 CLI 사용량을 소비합니다.** CLI의 신뢰/권한 확인에서 대기할 수 있습니다. 전체 8턴 수동 평가는 [EVALUATION.md](docs/EVALUATION.md), 확인 환경/제약은 [VERIFICATION.md](docs/VERIFICATION.md)를 보세요.

## 구조와 저장

```text
실제 AI CLI ── PTY 출력 ── xterm headless 화면 셀 ── 왼쪽 영역
    └─ 현재 에이전트 스킬 ── JSON publish ── 검증·저장 ── 오른쪽 지도
```

`src/terminal`: 화면·입력·자식 수명·내장 터미널·지도. `src/core`: 의미 모델·검증·저장. `src/server`: 래퍼가 관리하는 내부 loopback API. `skills/brainpane`: 공통 스킬/패치 계약.

PTY 출력은 **화면 표시용**이며 대화 원문 수집/의미 분석에 사용하지 않습니다. 화면 지우기·커서 이동·대체 화면은 xterm이 해석하고 셀 데이터만 왼쪽에 렌더링합니다. 터미널 에뮬레이터를 처음부터 작성하지 않았습니다.

Rust/Ratatui/portable-pty/tui-term을 우선 검토했습니다. 기존 TypeScript 상태 엔진을 유지하고 Windows에서 실제 실행 검증한 node-pty + xterm headless를 선택했습니다. Rust나 브라우저 런타임은 필요 없습니다. 이전 웹 코드는 `src/web`와 `web-legacy` 경로에 보존한 **과거 구현**이며 기본 실행·완료 기준에 포함하지 않습니다.

저장 위치는 실행 프로젝트의 `.brainpane/runs/<map-id>/`입니다. 의미 snapshot과 별도 view.json(선택/접힘/상세/스크롤), 내부 접근 키/실행 정보를 보관합니다. 첫 실제 질문으로 원래 목표를 초기화하고 이후 변경 이력을 보존합니다. 프로젝트의 `.gitignore`에 `.brainpane/`를 추가하세요.

내부 API는 loopback만 사용하며 Host·Origin·접근 키를 검증합니다. run에서는 웹 UI를 제공하지 않습니다. 실패 패치는 정상 상태를 보존하고, 오래된 버전은 충돌로 거절하며 같은 업데이트를 중복 적용하지 않습니다. 참조·순환·단일 루트·사용자 보호 필드·결정 및 표/흐름의 출처 참조를 검증합니다. 대화 의미의 정확성까지 스키마가 증명하지는 못합니다.

최대 300개 주제, 10,000개 업데이트, 요청 128 KiB입니다. 파일은 임시 작성 후 rename으로 교체합니다. 평문 로컬 데이터는 OS 계정 권한의 보호를 받습니다. 디스크 손상 복구/마이그레이션은 아직 없습니다. 기본 텔레메트리와 인증 정보 추출은 없습니다. 로컬 지도 저장이 기존 클라우드 CLI의 추론까지 오프라인으로 만들지는 않습니다.

## 지원 경계와 라이선스

Windows ConPTY에서 실제 Codex/Claude 화면을 확인하며 개발했습니다. 모든 호스트·OS·버전 조합의 100% 호환성을 주장하지 않습니다. 한국어 완성 문자열/붙여넣기·문자 폭을 검증하며 IME 조합 과정과 복잡한 이모지 폭에는 호스트 영향이 남습니다. Sixel/Kitty 이미지, 확장 키보드 프로토콜 전체, 자식 OSC 클립보드 전달은 지원하지 않습니다.

이슈에는 OS·호스트·Node/CLI 버전과 개인정보를 뺀 재현 방법을 남겨주세요. 실제 대화·인증 정보·`.brainpane/`·전체 터미널 로그는 첨부하지 마세요.

2026-09-09에 [node-pty](https://github.com/microsoft/node-pty), [xterm headless](https://github.com/xtermjs/xterm.js#nodejs-support), [화면 셀 API](https://xtermjs.org/docs/api/terminal/interfaces/ibuffercell/), [Ratatui](https://ratatui.rs/), [portable-pty](https://docs.rs/portable-pty/latest/portable_pty/), [tui-term](https://docs.rs/tui-term/latest/tui_term/) 문서를 확인했습니다. 스킬 경로와 호출은 [Codex 공식 Skills](https://learn.chatgpt.com/docs/build-skills), [Claude 공식 Skills](https://code.claude.com/docs/en/skills)를 따릅니다.

[패치 프로토콜](skills/brainpane/protocol.md) · [MIT](LICENSE) · [의존성 라이선스](THIRD_PARTY.md)
