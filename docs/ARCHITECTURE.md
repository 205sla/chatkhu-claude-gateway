# 구현 구조와 결정

## 경계

공식 ChatKHU `/claude` 엔드포인트에 직접 보내는 요청이 기준선이다. 로컬 서버는 개인 키 관리, 세션별 실행, 실제 모델 선택, 상태 진단을 더한다. 프로토콜 변환이나 인증 우회 서버가 아니다. 초기 CLI 구현은 Kiro 핸드북의 시작→상태→종료→복구 흐름만 참고했다. 후속 Desktop 검증에서는 사용자 승인 후 기존 개인 Gateway 연결의 주소·로컬 토큰만 백업·교체했다. Kiro 구현·계정 DB·OAuth를 ChatKHU 인증에 사용하지 않는다.

Node.js 22+ 표준 라이브러리만 사용한다. JavaScript ESM으로 TypeScript 빌드와 설치 의존성을 없앴다. package-lock.json으로 설치 입력을 고정하며 npm ci 후 바로 실행한다.

| 모듈 | 역할 |
| --- | --- |
| config.mjs, private-files.mjs | URL/키/모델 설정, 원자적 저장, 파일 권한 |
| adapters/anthropic.mjs | 경로·헤더, 재시도 없는 HTTP 전송, 실제 모델 목록 |
| gateway.mjs | loopback HTTP, 로컬 인증, 요청 제한, 스트리밍·취소 |
| launcher.mjs | 설정 충돌 점검, 실행 파일 해석, 임시 설정, 자식 수명 |
| cli.mjs | setup/models/doctor/claude/serve/smoke |
| smoke.mjs | 명시적 실제 호출 검사; 고정된 덧셈 도구만 실행 |
| test/, scripts/verify-*.mjs | HTTP/프로세스 테스트, 선택적 실제 CLI·실계정 검사 |

## 전달 규칙

| 클라이언트 경로 | upstream (baseUrl 뒤에 붙임) |
| --- | --- |
| POST /v1/messages[/] | /v1/messages/ |
| POST /v1/messages/count_tokens[/] | /v1/messages/count_tokens/ |
| GET /v1/models[/] | /v1/models |

Messages 문서의 모델 목록 경로를 채택했다. 개요 표에는 끝 `/`가 있지만, 실제 계정에서 위 unsuffixed 경로가 리디렉션 없이 성공했다. 쿼리는 raw 문자열 순서·인코딩·중복을 보존한다. 절대 URL 요청 및 다른 경로는 거절한다.

요청 본문은 크기 제한 안에서 먼저 전부 읽는다. 한도를 넘는 생성 요청이 upstream에서 실행되는 것을 막기 위해서다. JSON으로 해석하거나 다시 직렬화하지 않는다. 시스템, 이미지, 도구, 사고, 캐시, 미래 확장 필드를 같은 바이트로 전달한다. 실제 본문 길이로 Content-Length를 계산한다.

**응답은 버퍼링하지 않는다.** Node stream pipeline으로 bytes를 즉시 보내고 backpressure를 적용한다. SSE 파싱을 하지 않아 분할된 UTF-8/JSON, ping, 사고/서명, 여러 도구 delta, error 이벤트가 그대로 간다. 압축도 자동으로 풀지 않는다. 진단 명령의 응답 해석과 중계 경로는 분리되어 있다.

요청 헤더는 content type/encoding, accept, user agent와 `anthropic-*`만 전달한다. Connection이 지목한 헤더와 hop-by-hop, 쿠키, 로컬 인증, 임의 custom header는 보내지 않는다. Host는 실제 대상, 인증은 개인 키의 Bearer다. Accept-Encoding은 identity를 요청한다. 응답은 요청 ID·Retry-After·사용량 등 end-to-end 헤더를 보존하되 쿠키·인증·CORS·hop-by-hop은 제외한다.

일반 upstream HTTP 상태와 오류 본문은 그대로 전달한다. **3xx는 예외**다. SDK가 Location을 따라 로컬 토큰을 다른 호스트로 보낼 수 있으므로 Location을 제거하고 로컬 502 및 x-chatkhu-upstream-status를 반환한다. 연결/유휴 오류도 로컬 오류로 구분한다. 이미 시작된 응답은 닫으며 JSON 성공 본문이나 가짜 토큰 수를 추가하지 않는다.

클라이언트가 끊으면 upstream 요청을 파괴한다. DNS/TCP/TLS 연결 시간, 업로드 및 upstream 유휴 시간, 로컬 소켓 유휴 시간에 제한이 있다. 매우 느린 클라이언트도 유휴 제한에 걸릴 수 있다. 게이트웨이는 자동 재시도를 전혀 하지 않는다. Claude Code와 SDK의 재시도는 이 계층 밖에 있다.

## 키와 실행 환경

설정 우선순위는 명령 인자 → 명시적 --env-file의 CHATKHU 변수 → 상속 환경 → 저장 설정 → 기본값이다. 일반 키 조회는 환경 CHATKHU_API_KEY → 지정/저장된 CHATKHU_KEY_FILE → 기본 credentials.key다. setup에서 --key-file을 명시하면 해당 파일을 우선 읽고 경로를 저장한다. dotenv는 자동 탐색하지 않는다.

저장 전 임시 파일 권한을 제한하고 atomic rename한다. 새로 만든 세션 디렉터리만 경계를 검사해 삭제한다. 사용자 파일을 탐색해 일괄 삭제하지 않는다. 같은 OS 계정 및 관리자 접근, 메모리 덤프, 사용자 관리 키 파일 권한은 이 도구만으로 격리하지 못한다.

리스너는 127.0.0.1만 사용한다. Host는 정확한 loopback 주소/포트와 일치해야 한다. Origin이 있거나 sec-fetch-site가 none 이외의 값이면 거절하고 CORS를 제공하지 않는다. Electron 데스크톱의 main-process 요청은 Origin 없이 sec-fetch-site: none을 보내므로 허용하되, API에는 동일한 로컬 토큰 인증을 요구한다. /health는 최소 상태만 반환한다. 메시지·모델·토큰 계산은 랜덤 로컬 토큰이 필요하다. 두 인증 헤더가 함께 오면 모두 일치해야 한다.

Claude 자식에게 개인 키 대신 세션 토큰을 넘긴다. ChatKHU 변수, OAuth/API key/custom headers를 자식 환경에서 비우고 provider 선택을 이번 실행에서만 해제한다. 임시 settings.env에도 적용해 기존 env와의 충돌을 막는다. 기존 apiKeyHelper 및 강제 로그인 설정은 시작을 중단하고 알린다. 관리자 정책을 덮어쓰지 않으며 MDM/레지스트리를 포함한 최종 판단은 Claude CLI가 한다.

메인, 보조 기본 모델, 문서의 opus/sonnet/haiku/fable 별칭을 실제 목록의 ID에 연결한다. small-fast 변수도 Haiku 매핑을 쓴다. 능력치/문맥 창/사고 옵션을 만들어 넣지 않는다. 개별 스킬·에이전트의 명시적 모델, 향후 새로운 별칭, 1m 옵션까지 보장하지 않는다. 모델 오류를 다른 제공사로 대체하지 않는다.

기존 설정 소스를 끄지 않는다. 로그인 저장소, MCP 설정, CLAUDE.md를 복사하지 않는다. permission bypass를 추가하지 않고 MCP/훅/스킬을 보존한다. 선택적 검증 스크립트만 임시 사용자 프로필을 사용한다.

Windows에서는 npm package.json의 이름·bin·실경로를 확인해 native EXE 또는 Node entrypoint를 찾는다. cmd/ps1/bat를 직접 실행하지 않는다. spawn은 shell:false와 인자 배열이다. SIGINT/SIGTERM에서 생성한 자식 PID의 트리만 정리한다. POSIX는 독립 프로세스 그룹에 TERM 이후 필요한 경우 KILL을 보낸다. 강제 종료나 전원 차단은 finally 실행을 보장하지 못한다.

## Chat Completions 확장

기본 완성 범위는 Claude 네이티브 경로다. GPT/Gemini를 Claude로 표시하지 않는다. 비Claude 모델에 대한 Claude Code 공식 지원을 주장하지 않는다. [공식 게이트웨이 안내](https://code.claude.com/docs/en/llm-gateway)

어댑터 경계는 route/request/models다. OpenAI 어댑터는 raw pass-through만 재사용할 수 없으며 별도 변환 상태기가 필요하다.

| 영역 | 구현·검증해야 할 내용 |
| --- | --- |
| 입력 | system/messages/content → system/developer/messages; 지시 순서 유지 |
| 도구 | input_schema/tool_choice, tool_use ↔ tool_calls, tool_result ↔ tool 메시지 |
| 식별자 | 호출 ID, JSON 인자 오류, 여러 병렬 호출과 결과 순서 |
| 출력 | 종료 사유, 텍스트, 실제 usage/cache usage의 의미 매핑 |
| SSE | 도구 index/ID별 delta 누적; 교차 청크·분할 UTF-8/JSON; 조기 오류/취소 |
| 범위 | 사고 블록·서명·캐싱·이미지·서버 도구의 등가성 및 명시적 거절 |
| 모델 옵션 | 실제 모델의 추론 옵션+도구 조합, 출력 토큰 제한 |

의미를 유지할 수 없는 기능은 명시적 오류 또는 사용자가 선택한 제한 모드로 처리한다. 조용히 버리지 않는다. 요청 모델 범위와 검증 계정이 확인된 뒤 별도 기능으로 진행한다. 챗봇 경로는 저장된 시스템/RAG/도구 파이프라인을 실행하므로 기본 경로로 삼지 않는다. [Chat Completions](https://docs.mindlogic.ai/docs/general/api-gateway/reference/chat-completions), [챗봇 호출](https://docs.mindlogic.ai/docs/general/baze/product/api-access)
