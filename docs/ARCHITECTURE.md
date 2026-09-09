# 아키텍처 규칙

Brainpane은 작은 코드베이스이지만, 계층과 의존 방향을 지금부터 기계로 지킵니다. 이 문서는 `scripts/check-architecture.mjs`가 검사하는 규칙의 근거입니다. 규칙을 바꾸면 스크립트와 이 문서를 함께 고치세요.

## 계층

| 계층 | 위치 | 역할 | 의존해도 되는 계층 |
| --- | --- | --- | --- |
| core | `src/core/` | 지도 모델·패치 검증(`model.ts`), 로컬 저장(`store.ts`) | core |
| server | `src/server/` | 로컬 상태 서비스(HTTP·이벤트) | core |
| terminal | `src/terminal/` | PTY 래퍼, 화면 합성, 입력 라우팅, 지도 패널 | core, server |
| web | `src/web/` | 보존된 옛 웹 UI(legacy) | core |
| entry | `src/*.ts` | CLI 진입점, 인자 처리, 설치, 스킬 파일 | core, server, terminal |

의존은 표의 오른쪽 열로만 향합니다. 아래 방향은 금지입니다.

- core → server, terminal, web, entry
- server → terminal, web, entry
- terminal → web, entry
- 어떤 계층도 web을 가져오지 않습니다. web은 core.model만 읽습니다.

## 순수성

- `src/core/model.ts`는 Node 내장 모듈(`node:*`)을 가져오지 않습니다. 파일·네트워크·프로세스는 store, server, terminal의 일입니다.
- 상대 경로 import는 `src/` 밖으로 나가지 않습니다. `scripts/`, `tests/`, `skills/`는 실행·검증 도구이며 제품 코드가 의존하지 않습니다.

## 계층 밖의 원칙

검사기가 잡지 못하는 원칙은 `CONTRIBUTING.md`와 테스트가 지킵니다.

- 의미 데이터(주제·결정·출처)와 보기 상태(선택·접기·스크롤)는 분리합니다.
- 터미널 엔진(xterm)을 재사용하고, 임의의 ANSI를 직접 파싱해 대화 의미로 바꾸지 않습니다.
- 동작 계약(종료 시 모드 복구, 포커스 이벤트 처리, 패치 거부 규칙 등)을 바꾸면 같은 변경에서 검사를 추가합니다.

## 검사 실행

```text
npm run lint:arch   # 의존 방향·순수성
npm run lint        # oxlint 정확성 규칙(타입 인식 포함)
```

둘 다 CI의 차단 단계입니다. 규칙에 어긋나는 코드가 정말 필요하다면 규칙을 먼저 바꾸고 이유를 이 문서에 남기세요.
