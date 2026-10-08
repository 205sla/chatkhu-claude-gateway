# ChatKHU와 Claude Code를 연결하는 게이트웨이 구현 요청

당신은 이 저장소에서 ChatKHU API를 Claude Code에 연결하는 도구를 구현하는 개발 담당 AI다. 아래 요구사항에 따라 구현, 검증, 문서화를 완료하라. 제안이나 설계 설명만으로 끝내지 말고 실제 실행 가능한 결과물을 만들어라.

## 목표와 사용자

사용자는 Claude Code의 파일 탐색·수정·명령 실행·도구 사용·대화 관리 등 개발 작업 흐름을 사용하면서, 추론 요청을 자신의 ChatKHU API 키로 처리하고 싶다. 특히 KHU AI Challenge 관련 개발 작업에 이 구성을 활용하려 한다.

다른 사용자도 유효한 ChatKHU API 키와 모델 호출 권한이 있으면 자기 PC에서 쉽게 설정하고 실행할 수 있어야 한다. API 키는 각 사용자의 계정 크레딧을 사용한다. 제작자의 키를 배포하거나 중앙 서버에 사용자의 키를 모으는 서비스는 범위에 포함하지 않는다.

게이트웨이는 공모전 작업에 사용할 개발 도구다. 게이트웨이 자체가 공모전 제출작이라고 가정하지 말고, 제출작의 주제나 기능을 임의로 정하지 마라. API 경유 사용이 대회 참가 요건에 어떻게 인정되는지도 이 도구의 기술적 동작과 구분하라.

## 현재 저장소 상태와 참고자료

이 저장소는 프롬프트와 조사 문서로 시작했으며, 아직 게이트웨이 구현은 없다. 작업 시작 시 실제 파일과 Git 상태를 먼저 읽고, 이후 다른 사람이 추가한 변경이 있으면 보존하라.

작성자가 제공한 로컬 참고 폴더는 `C:\Users\young\prg\ai\0. 도구\AI도구\kiro-claude-gateway-handbook`이다. 접근 가능하면 README, 전체 구조, 운영·복구 문서를 읽어 시작·종료·상태 확인 흐름을 참고하라. 다른 PC에서 이 폴더가 없어도 작업을 진행할 수 있어야 한다.

해당 핸드북은 Kiro 인증과 Claude Desktop 연결에 관한 사례다. ChatKHU의 API 인증과 Claude Code CLI에 그대로 적용하지 마라. Kiro 세션 DB, OAuth 토큰, 계정 전환 로직, 개인 PC의 기존 게이트웨이 설정은 이번 구현에 필요하지 않다. 기존 게이트웨이의 소스를 복사하지 말고 공식 ChatKHU API를 사용하는 독립적인 구현을 작성하라.

## 확인된 공식 API 규격

다음은 2026-10-08에 공식 문서로 확인한 내용이다. 구현 시 링크를 다시 읽고 변경 여부를 확인하라. 문서상 지원과 실제 계정에서의 성공은 별도로 기록하라.

| 용도 | 문서에 안내된 주소 또는 설정 |
| --- | --- |
| ChatKHU Gateway 기본 URL | `https://factchat-cloud.mindlogic.ai/v1/gateway` |
| Anthropic 클라이언트 Base URL | `https://factchat-cloud.mindlogic.ai/v1/gateway/claude` |
| Messages 요청 | `POST /v1/gateway/claude/v1/messages/` |
| 토큰 수 계산 | Messages 경로 아래 `count_tokens/` |
| Anthropic 형식 모델 목록 | `GET /v1/gateway/claude/v1/models` |
| 전체 모델 목록 | `GET /v1/gateway/models/`, LLM 필터 `type=llm` |
| Claude Code 연결 | `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN` |

계정의 API Gateway 화면에 다른 Base URL이 표시된다면 그 계정에 맞는 주소를 사용자가 설정할 수 있게 하라. 기관별로 키의 유효 범위가 다르므로 문서의 예시 호스트를 모든 계정에 강제하지 마라.

Claude Code와 Anthropic SDK가 `/v1/messages`를 붙이므로 Anthropic Base URL은 `/claude`에서 끝난다. `/claude/v1`을 설정해 `/v1`이 중복되는 오류를 방지하라.

ChatKHU는 `Authorization: Bearer`와 `x-api-key`를 지원하며, Claude Code 연결에는 `ANTHROPIC_AUTH_TOKEN`을 안내한다. 헤더 설명은 제공사 문서와 Claude Code 문서의 표현이 다르므로, 로컬 게이트웨이는 두 인증 헤더를 모두 수용하고 현재 CLI에서 실제 전송 형식을 검증하라. 로컬 인증 정보를 그대로 외부에 넘기지 말고, upstream에는 사용자가 설정한 ChatKHU 키를 명시적으로 사용하라.

기본 지원 대상은 ChatKHU의 Anthropic 네이티브 엔드포인트에서 제공하는 Claude 모델이다. 모델 ID는 계정의 API 응답으로 조회해 사용하라. 특정 Opus·Sonnet·Haiku 버전을 존재한다고 가정하지 마라. 비Claude 모델을 Claude라고 표시하거나 자동으로 교체하지 마라.

참고할 공식 문서:

- [ChatKHU API 개요](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/overview)
- [API 키와 인증](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/authentication)
- [Claude Code 연결](https://docs.mindlogic.ai/docs/khu/api-gateway/integrations/claude-code)
- [Messages API](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/messages-api)
- [모델 목록](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/models)
- [Claude Code의 게이트웨이 연결](https://code.claude.com/docs/en/llm-gateway-connect)
- [Claude Code의 프로토콜 호환성](https://code.claude.com/docs/en/llm-gateway-protocol)
- [Claude Code 모델 설정](https://code.claude.com/docs/en/model-config)

## 사용자가 제공한 API 문서와 경로 선택

아래 두 문서는 사용자가 직접 참고자료로 지정했다. 반드시 읽고, 경희대학교 전용 문서와 계정에 표시되는 API 설정을 함께 대조하라.

- [API로 챗봇 호출](https://docs.mindlogic.ai/docs/general/baze/product/api-access#api%EB%A1%9C-%EC%B1%97%EB%B4%87-%ED%98%B8%EC%B6%9C)
- [Chat Completions API](https://docs.mindlogic.ai/docs/general/api-gateway/reference/chat-completions#chat-completions-api)

| 경로 | 특성 | 이 프로젝트에서의 판단 |
| --- | --- | --- |
| `/v1/gateway/claude/v1/messages/` | Anthropic 형식과 Claude 기능을 네이티브로 전달 | Claude 모델을 사용할 기본 경로 |
| `/v1/gateway/chat/completions/` | OpenAI 형식. 모델을 직접 지정하며 system/developer 지시, tools, tool_choice, SSE 지원을 안내 | 다른 계열 모델까지 연결할 때 검토할 변환 어댑터 경로 |
| `/v1/gateway/chatbots/{chatbot_id}/chat/completions/` | 스튜디오 챗봇의 모델·시스템 프롬프트·RAG·도구를 실행. 호출의 system은 무시 | Claude Code의 시스템 지시·도구 루프를 유지할 기본 추론 경로로 사용하지 않음 |

챗봇 문서의 “내 에이전트에 연결하기” 카드는 계정에 맞는 Base URL과 코딩 에이전트 설정을 안내한다. 설정 절차에서는 이 화면의 주소를 확인하게 하라. 키가 포함된 복사 프롬프트를 채팅·로그·저장소에 붙여넣도록 요구하지 마라.

### Chat Completions 확장 검토

사용자가 ChatKHU의 GPT·Gemini 등 다른 모델을 Claude Code의 작업 흐름에서 사용하려 할 수 있으므로, 코드 구조는 upstream 어댑터를 분리해 확장할 수 있게 설계하라. 첫 완성 기준은 Claude 네이티브 경로로 두되, 다른 모델을 연결하는 데 필요한 범위와 한계를 설계 문서에 남겨라. 실제 변환 모드 추가는 요청된 모델 범위와 검증 가능성을 확인한 뒤 진행한다.

OpenAI 형식을 연결하려면 URL만 바꾸는 것으로 충분하지 않다. Anthropic `system/messages/content`, 도구 스키마·선택, `tool_use/tool_result`와 OpenAI `tool_calls/tool` 메시지, 도구 ID·JSON 인자, 다중 도구 호출, 종료 사유와 usage를 서로 매핑해야 한다. 스트리밍에서는 도구 인자가 여러 chunk에 나뉘고 여러 도구의 delta가 섞이는 경우까지 검증해야 한다.

사고 블록·서명·캐싱·이미지·서버 도구처럼 의미가 같은 변환을 보장할 수 없는 기능은 지원 범위를 표시하고 명시적으로 오류를 내거나 선택 가능한 제한을 안내하라. 조용히 버리거나 성공했다고 꾸미지 마라. 각 모델의 추론 옵션과 도구 조합, 출력 토큰 제한도 실제 모델 기준으로 확인하라. Claude Code가 비Claude 모델 연결을 공식 지원한다고 표현하지 마라.

## 구현 방향

ChatKHU에는 이미 공식 게이트웨이가 있으므로, 먼저 공식 엔드포인트 직접 연결을 기준선으로 확인하라. 별도의 OpenAI 형식 변환기를 처음부터 만들 필요는 없다. 이 프로젝트의 로컬 게이트웨이는 키 관리와 실행 편의, 모델 설정, 상태 확인, 일관된 장애 진단을 제공한다.

목표 구조:

```text
Claude Code CLI
  │ Anthropic Messages API + 로컬 세션 토큰
  ▼
127.0.0.1의 로컬 게이트웨이
  │ 사용자 본인의 ChatKHU API 키
  ▼
ChatKHU 공식 Anthropic 네이티브 API
```

Windows PowerShell 환경을 우선 지원하고, 핵심 서버와 CLI는 macOS·Linux에서도 실행 가능하게 작성하라. 기본 기술 선택은 Node.js 22 이상과 최소한의 의존성이다. TypeScript를 사용한다면 빌드·실행·테스트 명령과 lockfile을 제공하라. 다른 기술이 더 적절하다면 이유를 문서화하고 같은 사용성을 유지하라.

사용자 인터페이스는 터미널 중심이면 충분하다. 웹 대시보드, 계정 서버, 과금 서버, 데이터베이스, Docker를 첫 실행의 필수 조건으로 만들지 마라.

## 사용자 실행 흐름

아래 명령 이름은 제안이다. 이름을 바꿔도 기능과 사용 절차는 명확하게 제공하라.

| 명령 | 필요한 동작 |
| --- | --- |
| `setup` | Base URL 입력, 화면에 표시하지 않는 개인 API 키 입력, 계정 모델 조회·선택, 로컬 설정 저장 |
| `models` | 현재 계정에서 이용 가능한 Claude 모델의 실제 ID 표시 |
| `doctor` | 설정·URL·인증·모델 접근·Claude Code 설치 상태 진단. 기본적으로 추론 요청 없이 수행 |
| `claude` | 게이트웨이 시작, 해당 실행에만 적용되는 설정으로 Claude Code 실행, 종료 시 게이트웨이 정리 |
| `serve` | 다른 로컬 클라이언트가 연결할 수 있도록 명시적으로 게이트웨이만 실행 |
| `smoke` | 사용자가 명시적으로 실행할 때 짧은 실제 추론·스트리밍·도구 왕복 확인 |

첫 사용자는 저장소를 받은 뒤 안내된 설치 명령, `setup`, `claude` 순서로 시작할 수 있어야 한다. 원본 코드를 고쳐 자기 키나 모델명을 넣게 하지 마라. 예시 설정에는 실제 키가 없는 `.env.example`만 제공하라.

키는 대화창이나 명령행 인자로 입력하도록 요구하지 마라. 대화형 입력에서는 화면 표시와 셸 기록 노출을 막고, 비대화형 환경에서는 환경 변수 또는 사용자가 지정한 로컬 파일을 사용할 수 있게 하라. 저장 위치와 방식은 사용자에게 분명히 알리고, 가능하면 운영체제의 파일 권한으로 접근을 제한하라.

프로젝트 작업 경로를 지정할 수 있어야 하며, 현재 디렉터리·한글·공백이 있는 경로·사용자 인자를 정확하게 보존하라. API 키와 로컬 토큰을 프로세스 명령행에 넣지 마라.

## Claude Code 연결 요구사항

1. 사용자의 기존 로그인, 전역 설정, MCP 설정, 스킬, 훅과 프로젝트 파일을 임의로 수정하거나 삭제하지 마라. 일반적인 Claude Code 작업 흐름과 도구 승인 절차를 유지하라.
2. 현재 실행에서만 사용할 Base URL, 로컬 인증 토큰, 모델 설정을 전달하라. 사용자 설정 파일의 `env`가 셸 환경 변수보다 우선할 수 있으므로, 단순한 환경 변수 주입만으로 연결을 보장했다고 판단하지 마라. 현재 버전의 `--settings` 등으로 기존 설정을 보존하면서 실행별 설정을 적용하고 `/status`로 실제 경로를 확인하라.
3. 기존 provider 선택·API 키·OAuth·custom header 설정과의 충돌을 확인하되 원본 사용자 설정은 바꾸지 마라. 관리자 정책은 우회하지 말고 충돌 원인을 안내하라.
4. 메인 모델뿐 아니라 보조 작업과 지원되는 모델 별칭도 실제 사용 가능한 모델로 연결되도록 검증하라. 별칭 매핑과 실제 모델명을 구분해 표시하고, 임의의 버전명이나 용량·성능을 꾸며내지 마라.
5. 시스템 프롬프트, 도구 정의, 프로젝트 컨텍스트, 사고 옵션을 임의로 축약·삭제·재작성하지 마라. 연결을 성공시키기 위해 요청을 빈 프롬프트로 바꾸거나 도구 기능을 끄지 마라.
6. 권한 검사를 생략하는 실행 옵션을 자동으로 추가하지 마라. 요청받지 않은 플러그인 설치·자동 업데이트·전역 설정 변경도 하지 마라.
7. CLI의 정상 종료, 오류 종료, Ctrl+C에서 자식 프로세스와 리스너를 정리하라. 다른 사람이 실행한 Claude나 다른 포트의 프로세스를 종료하지 마라.
8. Windows에서는 `.cmd` shim에 인자를 문자열로 이어 붙이는 방식의 셸 실행을 피하라. 실제 실행 파일 또는 검증된 CLI entrypoint를 안전한 인자 배열로 호출하고, native 설치와 npm 설치를 고려하라.
9. 수명이 다른 백그라운드 세션·클라우드 세션·Desktop·VS Code 확장을 CLI와 동일하게 지원한다고 주장하지 마라. 첫 버전의 지원 범위를 CLI로 명시하고, 추가 지원은 별도 확인 후 문서화하라.

## 로컬 게이트웨이 요구사항

### 요청과 응답 전달

- `POST /v1/messages`, `POST /v1/messages/count_tokens`, `GET /v1/models`를 지원하고 upstream의 정확한 경로로 연결하라. 슬래시와 쿼리 파라미터 처리도 검증하라.
- Anthropic 형식 요청의 본문을 가능한 한 바이트 그대로 전달하라. `system`, `tools`, `tool_choice`, `tool_use`, `tool_result`, 이미지 블록, `thinking`, `output_config`, `cache_control`과 미래에 추가될 필드를 보존하라.
- 필요한 `anthropic-*` 헤더, 특히 `anthropic-version`과 `anthropic-beta`를 보존하라. 특정 날짜의 beta 목록만 하드코딩해 나머지를 버리지 마라.
- 사용자 인증·쿠키·hop-by-hop 헤더는 upstream 전송 전에 정리하고, ChatKHU 인증은 명시적으로 주입하라. `Host`와 `Content-Length`는 실제 전송 대상과 본문에 맞게 처리하라.
- 비스트리밍 JSON, SSE의 이벤트 순서와 데이터, `stop_reason`, 도구 호출 ID·인자, usage·캐시 사용량을 보존하라. 실패한 요청을 성공 응답으로 바꾸거나 가짜 토큰 수를 생성하지 마라.
- 스트리밍은 완료될 때까지 전체를 모아서 보내지 말고 즉시 전달하라. 느린 클라이언트의 backpressure, UTF-8·JSON이 chunk 중간에서 갈리는 경우, ping·error·확장 사고 이벤트를 처리하라.
- upstream HTTP 상태와 오류 본문, 재시도·요청 ID·사용량 관련 응답 헤더를 보존하라. 중계 서버의 오류와 upstream 오류를 구분하라.
- 클라이언트 연결이 끊기면 upstream도 취소하고, 연결·유휴 타임아웃·요청 크기 제한을 설정 가능하게 하라. 스트리밍 도중 오류가 발생하면 이미 시작된 스트림에 잘못된 JSON 성공 응답을 추가하지 마라.
- 생성 요청을 자동으로 재전송해 크레딧이 중복 소모되지 않도록 하라. 재시도 책임과 조건을 명확히 하고, 스트리밍 출력이 시작된 뒤에는 새 추론으로 자동 재시작하지 마라.
- 리디렉션에 인증 정보를 자동으로 넘기지 마라. 실제 계정 URL이나 trailing slash 때문에 리디렉션이 필요하다면 목적지를 검증하고 정해진 경로를 사용하라.

### 로컬 인증과 키 관리

- 기본 리스너는 `127.0.0.1`에만 바인딩하고 인터넷에 노출하지 마라.
- 클라이언트의 로컬 인증 토큰과 ChatKHU API 키를 분리하라. 일반 `claude` 실행에서는 세션용 토큰을 생성하고 upstream 키가 Claude Code의 자식 도구 환경으로 불필요하게 전파되지 않게 하라.
- 헬스 체크는 최소한의 상태만 반환하고, 메시지·모델 등 API 경로에는 인증을 적용하라. 브라우저 Origin 요청과 DNS rebinding 등 로컬 웹 공격을 고려하고 불필요한 CORS를 켜지 마라.
- upstream은 HTTPS를 기본으로 요구하며 인증서 검증을 끄지 마라. 테스트용 로컬 mock HTTP 지원은 운영 설정과 분명히 분리하라.
- 로그 기본값에는 프롬프트, 응답 본문, API 키, Authorization 헤더, 환경 변수 전체, 파일 내용이 남지 않아야 한다. 진단용 요청 ID·상태·소요 시간 등 필요한 메타데이터만 기록하라.
- 원본 키를 README, 테스트 fixture, 스크린샷, 이슈, 커밋, CI 로그에 포함하지 마라. 기존 `.gitignore`를 유지하고 필요한 제외 항목을 보완하라.

## 오류 안내

사용자가 해결할 수 있는 다음 상황을 한국어로 구분해 안내하라. 원문 오류를 무분별하게 로그에 덤프하지 말고 상태 코드와 안전한 진단 정보를 활용하라.

- 키 누락·잘못된 인증·키와 Base URL의 기관 불일치
- 조직의 API 비활성화 또는 모델 접근 권한 부족
- 크레딧 부족과 속도 제한
- 모델 ID 오류와 잘못된 경로 또는 `/v1` 중복
- 지원하지 않는 API 기능·beta 값
- 조직의 개인정보 필터에 의한 요청 거절
- 포트 충돌, Claude Code 미설치, 연결 종료와 타임아웃

조직 필터를 우회하거나 자동으로 끄지 마라. CLI가 프로젝트 컨텍스트를 함께 보내므로 사용자가 실제 작업 자료와 조직 정책을 확인할 수 있게 설명하라.

## 검증 기준

외부 API를 호출하지 않는 자동 테스트를 먼저 만들고 통과시켜라. 테스트는 구현 내부 함수의 복사본이 아니라 공개 HTTP 경로와 실제 프로세스의 행동을 확인해야 한다.

1. 비스트리밍 요청·응답, 시스템 프롬프트와 알 수 없는 확장 필드 보존
2. SSE의 즉시 전달과 chunk 경계, 사고·도구 호출 이벤트 보존
3. 도구 호출 → 로컬 도구 결과 → 다음 모델 응답의 왕복
4. 인증 거절, 로컬 토큰·upstream 키 분리, 키·본문 로그 유출 방지
5. 모델 조회, 실제 모델 ID와 별칭 설정, token counting 경로
6. 400·401·403·429·5xx 오류와 관련 헤더 전달, 리디렉션과 무응답 처리
7. 클라이언트 취소, backpressure, 요청 크기 제한, 포트 충돌, 정상 종료 후 리스너 해제
8. 한글·공백·셸 특수문자가 있는 작업 경로와 인자, 기존 Claude 설정 보존
9. 새로 받은 저장소에서 문서에 나온 설치·실행 명령이 작동하는지 확인

가능하면 설치된 실제 Claude Code를 로컬 mock upstream에 연결해 Messages 요청과 도구 왕복을 확인하라. 사용자의 실제 프로젝트 대신 임시 테스트 폴더를 사용하고, mock 성공을 실제 ChatKHU 모델 성공으로 보고하지 마라.

실계정 검증은 사용자가 로컬에 키를 입력한 뒤 작은 비용의 요청으로 수행하라. 기본 `test`나 CI가 실제 API를 호출해서는 안 된다. `smoke`는 크레딧을 사용할 수 있음을 명시하고, 텍스트 응답·스트리밍·도구 왕복의 결과와 실제 응답 모델 ID를 구분해서 기록하라.

API 키가 없으면 키 없이 가능한 구현과 mock 검증을 완료하고, 실계정으로 확인할 명령과 남은 항목을 구체적으로 남겨라. 성공 결과를 추측하거나 실제 호출을 했다고 쓰지 마라.

## 작업 순서와 산출물

1. 현재 저장소와 공식 문서를 읽고, 직접 연결 기준선과 로컬 게이트웨이가 담당할 기능을 짧게 정리한다.
2. 비밀정보 제외 규칙을 적용하고, 설정·인증·모델 조회부터 구현한다.
3. Anthropic API 중계, 스트리밍·취소·오류 처리와 CLI 실행기를 구현한다.
4. mock 기반 자동 테스트와 실행기 검증을 완료한다.
5. 사용 가능한 실제 키가 있으면 사용자의 로컬 입력을 받아 최소한의 실제 확인을 수행한다.
6. README에 설치, 키 발급·입력, 모델 선택, 실행, 진단, 종료, 복구와 지원 범위를 작성한다.
7. 구현 구조와 설계 결정, 테스트 결과, 실계정 검증 여부를 문서화한다.

필수 산출물은 실행 코드, 예시 설정, 패키지·의존성 명세, 필요한 시작 스크립트, 자동 테스트, 한국어 사용 설명이다. 무의미한 빈 파일이나 성공하지 않은 명령의 성공 예시는 만들지 마라.

공모전 활용을 위해서는 ChatKHU의 역할, 사용 모델, 사람의 기획·수정 기여, 핵심 프롬프트·버전 변화·검증 결과를 사용자가 정리할 수 있는 문서 틀을 제공하라. 대화 전문이나 키를 자동 수집하지 말고, 사람의 기여와 대회 성과를 추측하지 마라.

Git 작업은 이 저장소에서 수행한다. 사용자의 다른 폴더를 이동하거나 기존 도구를 수정하지 마라. 원격 저장소가 연결돼 있다면 그것을 사용하고 동일 이름의 저장소를 새로 만들지 마라. 커밋·푸시·PR은 구현을 맡긴 세션에서 허용된 범위에 따르고, 공개 전환·패키지 배포·서버 공개는 별도 요청 없이 진행하지 마라.

최종 보고에는 실제 실행 명령, 지원 범위, 테스트 결과, 실제 모델 호출 여부, 미해결 사항을 적어라. “모든 기능 지원”이라고 단정하지 말고 확인한 기능과 추가 확인이 필요한 기능을 구분하라.
