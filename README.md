# Brainpane

**평소처럼 AI와 대화하다가, 필요할 때 같은 터미널 옆에 대화 지도를 꺼내세요.**

A conversation compass for your real Codex / Claude Code session. Open it when you need it; keep your existing CLI, login and conversation.

```text
codex                      claude
  …평소처럼 대화…            …평소처럼 대화…
  $brainpane start           /brainpane start
  → 오른쪽에 현재 대화 지도   → 오른쪽에 현재 대화 지도
```

현재 에이전트가 읽을 수 있는 **앞선 대화의 출발점·주제 가지·현재 위치**를 지도에 반영합니다. 채팅은 왼쪽에서 계속하고, 지도는 오른쪽에 남습니다. MIT · 0.2 preview · 별도 API 키·브라우저·tmux·호스트 전용 API 불필요.

## 설치

Node.js **22.12 이상**, npm, Git과 기존에 사용하는 Codex 또는 Claude Code가 필요합니다.

```text
git clone https://github.com/dasuks/Brainpane.git
cd Brainpane
npm ci
npm run build
npm run setup
```

설치 후 **새 터미널을 열고**, 평소 작업 폴더에서 `codex` 또는 `claude`를 실행하세요. 처음에는 지도가 숨겨져 있고 지도 생성은 비활성입니다. 대화 중 `$brainpane start` / `/brainpane start`를 입력하면 패널이 열리고 현재 문맥을 정리합니다.

기본 설치 셸은 Windows에서 PowerShell, 그 외에는 현재 bash/zsh입니다. 직접 선택할 수도 있습니다.

```text
node bin/brainpane.mjs setup --shell powershell
node bin/brainpane.mjs setup --shell bash
node bin/brainpane.mjs setup --shell zsh
```

GitHub 링크로 에이전트에게 설치를 맡기려면:

> https://github.com/dasuks/Brainpane 의 docs/INSTALL.md를 읽고 이 PC에 설치해줘. 기존 CLI와 설정을 보존하고 설치 확인까지 해줘.

[상세 설치·업데이트·제거 안내](docs/INSTALL.md). npm 레지스트리에 게시한 패키지는 아닙니다. `npx brainpane`으로 다른 패키지를 설치하지 마세요. 설치한 소스 폴더는 실행에 사용되므로 유지해야 합니다.

## 사용

Codex는 `$brainpane`, Claude는 `/brainpane`을 대화에 입력합니다.

| 명령 뒤에 붙이는 말 | 동작 |
| --- | --- |
| `start` | 패널을 열고 앞선 공개 대화부터 현재까지 지도에 반영 |
| `sync` | 사용 가능한 현재 문맥으로 명시적 재동기화 |
| `hide` | 화면만 숨김; 지도 갱신은 계속 |
| `stop` | 패널을 닫고 추가 지도 작업 중단 |
| 다시 `start` | 기존 가지와 사용자 수정을 보존하며 재개 |

처음 열 때는 ‘지금까지의 대화를 정리 중’으로 표시하고, 패치가 저장되면 지도가 나타납니다. **에이전트가 현재 볼 수 있는 문맥까지만 정리합니다.** 압축되거나 사라진 과거 발언을 완벽하게 복원하지 않습니다. 시작 명령을 원래 질문으로 기록하지 않도록 스킬에 규칙을 두었습니다. 권한 확인과 도구 호출은 원래 CLI에 보일 수 있습니다.

### 화면 조작

기본 입력 포커스는 채팅입니다. 지도 탐색 뒤 **왼쪽 클릭** 또는 **`Ctrl+]`를 누르고 손을 뗀 다음 `Tab`**으로 채팅에 돌아갑니다. 지도 포커스에서는 하단에 복귀 안내를 표시합니다.

| 조작 | 동작 |
| --- | --- |
| `Ctrl+]` 다음 `Tab` | 채팅 ↔ 지도 포커스 |
| `Ctrl+]` 다음 `p` | 패널 표시/숨김; 지도 작업 중단은 `stop` |
| `Ctrl+]` 다음 `+` / `-` | 지도 폭 조절 |
| `Ctrl+]` 다음 `u` / `d` / `e` | 채팅 스크롤백 위/아래/최신 출력 |
| `Ctrl+]` 다음 `c` | 선택·복사 모드; 드래그 후 `y` 복사 |
| `Ctrl+]` 다음 `q` | CLI와 내부 서비스 종료 |
| 지도에서 방향키·Enter | 선택·접기/펼치기·상세 보기 |
| 지도에서 `n` / `f` | 현재 위치로 돌아가기 / 추적 토글 |
| 지도에서 `e` / `s` | 주제 제목 / 진행 상태 수정 |

접두키를 두 번 누르면 원래 키가 CLI로 전달됩니다. 좁은 화면은 같은 터미널에서 채팅/지도를 전환합니다. 지도를 클릭해도 실제 대화 위치는 바뀌지 않습니다. 전체 지도를 매번 재배치하거나 강제로 현재 노드로 이동하지 않습니다.

## 설치 범위와 제거

- 셸 프로필에 **표시된 관리 구간**을 추가해 `codex`, `claude`, `brainpane` 함수를 정의합니다. 기존 동명 별칭/함수가 있으면 보존하고 충돌 안내를 표시합니다.
- 사용자 스킬을 `~/.agents/skills/brainpane`와 `~/.claude/skills/brainpane`에 설치합니다. 초기 자동 호출은 비활성화합니다.
- 원래 CLI 실행 파일·로그인·Codex/Claude 설정은 교체하지 않습니다. 비대화형 실행, 도움말·버전·관리 명령은 원래 CLI에 전달하고 래퍼 중첩을 방지합니다.

**프로필을 읽는 셸**에 적용됩니다. `-NoProfile`, CLI 절대 경로 직접 실행, 이미 켜져 있던 일반 CLI에는 적용되지 않습니다. CMD·fish·모든 앱 호스트의 자동 연동은 제공하지 않습니다.

```text
brainpane doctor
brainpane uninstall
```

제거 후 새 터미널을 열면 원래 CLI 명령으로 돌아갑니다. 설치 후 사용자가 수정한 스킬/관리 구간은 삭제하지 않고 보고합니다. 지도 데이터도 보존합니다.

설정 변경 없이 직접 실행하는 기존 인터페이스도 유지합니다.

```text
node bin/brainpane.mjs run --dormant -- codex
node bin/brainpane.mjs run -- claude
```

첫 명령은 지도를 숨기고 시작하고, 두 번째는 처음부터 지도를 활성화합니다. 프로젝트 스킬만 설치하려면 `node bin/brainpane.mjs install codex` / `install claude`를 사용합니다. **스킬 파일만 설치해서 이미 실행 중인 CLI 화면을 분할할 수는 없습니다.**

## 동작 방식과 한계

```text
일반 codex / claude 명령 → 숨겨진 터미널 래퍼 → 실제 CLI + PTY + xterm 화면 해석
사용자의 스킬 호출 → 현재 에이전트가 open → context → JSON publish
                  → 검증 → 세션별 저장 → 같은 터미널 오른쪽 지도
```

PTY 출력은 왼쪽 화면 표시용입니다. ANSI 화면을 대화 원문으로 분석하지 않습니다. 공개 발언 해석은 현재 에이전트, 검증·저장·배치는 일반 코드가 맡습니다.

노드는 메시지나 명사 단위가 아닌 주제 단위입니다. 기존 가지의 ID를 재사용하고, 주제 이동을 자동 해결로 취급하지 않습니다. 제안과 사용자 결정을 구분하며 결정에는 확보된 사용자 발언 근거가 필요합니다. 사용자 수정 제목·상태는 다음 AI 패치가 덮어쓰지 못합니다. 상세 흐름도·비교표도 같은 주제 데이터에서 그립니다.

**스킬은 매 턴 실행되는 훅이 아닙니다.** 활성화 뒤에도 갱신이 누락될 수 있습니다. 마지막 갱신 시각·오류를 확인하고 `sync`하세요. `stop`하면 이후 지도 작업을 하지 않도록 지시하고 서버도 업데이트를 거절합니다. 지도 오류가 본래 대화를 막지 않도록 처리합니다.

추가 추론·도구 호출은 기존 CLI 세션의 사용량을 소비할 수 있습니다. 별도 API 키가 없다는 것이 무료나 추가 토큰 0을 뜻하지 않습니다. 로컬 저장이 클라우드 CLI의 추론까지 오프라인으로 만들지는 않습니다.

기본 저장 위치는 작업 폴더의 `.brainpane/runs/<map-id>/`이며 세션 폴더 안에 Git 제외 파일을 만듭니다. 프로젝트 `.gitignore`에도 `.brainpane/`를 추가하는 것이 좋습니다. 명시적 세션 바인딩을 전달하며 최신 로그를 추측하지 않습니다. 의미 상태와 화면 선택·접힘·스크롤을 분리합니다. 인증 정보 추출·기본 텔레메트리는 없습니다. 내부 API는 loopback·Host·Origin·접근 키와 패널의 세션 바인딩을 검증합니다.

패치에는 스키마·중복·버전 충돌·참조·순환·사용자 잠금 검증을 적용하고, 실패 시 마지막 정상 상태를 유지합니다. 최대 300개 주제, 10,000개 업데이트, 요청 128 KiB입니다. 확보된 발언만 원문으로 표시하고 네이티브 메시지 ID나 터미널 점프 링크를 만들지 않습니다.

## 검증과 기여

```text
npm run build
npm test
npm run test:e2e
npm run test:lifecycle
node bin/brainpane.mjs run --demo -- codex
```

데모는 8턴의 **예정된 패치 재생**입니다. 별도 API 키가 필요 없고 실사용과 같은 저장·표시 경로를 사용하지만, LLM 의미 판단의 검증은 아닙니다.

설치된 CLI의 실제 로그인·사용량을 쓰는 선택적 검증:

```text
node scripts/verify-on-demand.mjs codex
node scripts/verify-on-demand.mjs claude
```

먼저 대화한 뒤 스킬을 호출해 초기 지도·중단·재개를 확인합니다. 테스트용 새 작업 폴더를 명시적으로 신뢰할 때만 `--trust-project`를 추가합니다. 한국어 완성 문자열·붙여넣기·문자 폭을 검증하며, 모든 호스트의 IME 조합·복잡한 이모지·확장 키보드/이미지 프로토콜을 지원한다고 주장하지 않습니다. 다른 OS와 터미널의 검증 여부는 기록을 보세요.

[검증 기록](docs/VERIFICATION.md) · [의미 평가](docs/EVALUATION.md) · [패치 계약](skills/brainpane/protocol.md) · [기여 안내](CONTRIBUTING.md) · [MIT](LICENSE) · [의존성 라이선스](THIRD_PARTY.md)

과거 웹 UI는 `src/web`에 보존한 실험 코드이며 기본 경로가 아닙니다. [0.1 실행 안내](docs/terminal-0.1.md)는 이전 버전 기록입니다.
