# 검증 기록

확인일: **2026-10-08 (Asia/Seoul)**. Windows, Node.js 22.17.0, npm 10.9.2, Claude Code 2.1.280. 이 문서에 키·로컬 토큰·사용자 프로젝트 내용·대화 전문은 없다.

## 외부 호출 없는 자동 테스트

실행: `npm test` — **19개 통과, 실패 0, skip 0**. Desktop 호환 수정과 회귀 검사를 포함한 최종 결과다.

| 검증 | 관찰한 결과 |
| --- | --- |
| 비스트리밍 | HTTP 요청/응답 바이트 일치, system·이미지·사고·캐시·도구·미래 필드 보존 |
| SSE | upstream 완료 전에 첫 이벤트 수신; 7바이트 경계, UTF-8/JSON, 사고/서명, 다중 도구 delta·ping·error 보존 |
| 도구 루프 | tool_use ID/인자 → 로컬 결과 → 다음 응답 및 cache usage 보존 |
| 인증 | Bearer/x-api-key 정상, 누락·오류·충돌 거절, upstream 키와 로컬 토큰 분리 |
| 브라우저/로그 | 잘못된 Host·Origin·none 이외의 fetch-site 차단, 쿠키/custom/hop 헤더 제외, 키·프롬프트 로그 부재 |
| Electron 호환 | Origin 없는 sec-fetch-site: none 요청의 모델 조회·Messages 성공. 인증 누락/오류 401, Origin/다른 fetch-site/잘못된 Host 403, CORS 없음, fetch metadata upstream 제외 |
| 모델/토큰 계산 | 목록 페이지네이션, 실제 ID·별칭 검증, count_tokens/ 및 쿼리 유지 |
| 오류 | 400/401/402/403/404/422/429/500/503 상태·본문·Retry-After·요청 ID 보존; 재시도 없음 |
| 장애 | 리디렉션 차단, 무응답·TLS handshake timeout, 시작된 스트림 중단 시 가짜 JSON 없음 |
| 제한/정리 | 취소 시 upstream 종료, Content-Length와 chunked 업로드 제한, 32 MiB 느린 응답 backpressure·digest 일치 |
| 실행기 | 실제 자식 프로세스, 한글·공백·셸 특수 문자·줄바꿈 인자, 기존 설정 원문 보존 |
| 수명 | 오류 종료·SIGINT handler에서 자식/손자 프로세스 정리, 포트 충돌 및 리스너 해제 |
| 설정/CLI | HTTPS 강제, 운영 HTTP mock 우회 불가, 파일 권한, key/정책 충돌 거절, help/키 없는 doctor/유료 검사 명시 실행 |

초기 실행 환경의 샌드박스가 loopback TCP를 EACCES로 막아 일반 권한에서 다시 실행했다. 실패를 API 장애로 간주하지 않았다. HTTP GET 테스트 도우미의 잘못된 본문 전송도 수정한 뒤 전체 통과를 확인했다.

새 설치 검증: `npm run test:install` — Desktop 수정 전 Git ignore를 적용한 소스 28개를 빈 임시 폴더에 복사하고 `npm ci --ignore-scripts --no-audit --no-fund`, 당시 18개 테스트, CLI help가 모두 통과했다. .env.local, 사용자 설정, node_modules, .git은 복사하지 않았다. GitHub에서 아직 푸시하지 않은 구현을 clone했다고 주장하는 검사는 아니다.

## 설치된 실제 Claude CLI + 로컬 mock

실행: `npm run test:claude` — **PASS**.

- 임시 사용자 프로필·임시 한글/공백 작업 폴더를 사용했다.
- 기존 mock 설정에 다른 URL/token/model/custom headers를 넣어도 임시 --settings의 로컬 경로가 적용됐다.
- 실제 CLI가 system, **26개 도구 정의**, beta 헤더, 스트리밍 Messages를 전송했다.
- mock이 요청한 Read를 CLI가 수행하고 실제 임시 파일 결과를 tool_result로 돌려준 후 두 번째 모델 응답으로 종료했다.
- 로컬 인증은 Bearer, upstream 인증은 별도의 fake 키였다. 연결 설정 보존 및 세션 파일 삭제를 확인했다.
- 이 결과는 **실제 ChatKHU 추론 성공과 다르다**. mock usage를 CLI가 비용처럼 표시할 수 있으므로 비용 근거로 사용하지 않는다.

대화형 실행: `node scripts/verify-claude.mjs --interactive`.

- 실제 `/status`에서 버전, 로컬 Base URL, AUTH_TOKEN 출처, 모델, User settings + Command line settings 적용을 확인했다.
- Ctrl+C 안내 후 연속 두 번 입력으로 종료했고 세션 파일이 삭제됐다. 생성 요청은 0회였다.
- 최초 테스트는 onboarding이 저장한 theme를 전체 파일 변경으로 판정했다. 비교를 연결·모델·권한으로 구분한 뒤 다시 성공했다. print 검사는 여전히 파일 원문 전체 일치를 검사한다.

## 실제 ChatKHU 계정

사용자가 제공한 로컬 비밀 파일을 프로그램이 읽었다. Git ignore 적용을 확인했고 키 값은 출력하지 않았다. 사용자 전용 설정 디렉터리의 제한된 권한 파일에 보관했다.

실행 명령:

```powershell
node bin/chatkhu.mjs models --env-file .env.local
node bin/chatkhu.mjs setup --env-file .env.local --non-interactive --model claude-haiku-4-5-20251001
node bin/chatkhu.mjs doctor
node bin/chatkhu.mjs smoke --confirm-cost
node scripts/verify-live-claude.mjs --confirm-cost
```

실제 upstream: `https://factchat-cloud.mindlogic.ai/v1/gateway/claude`.

| 검사 | 결과 |
| --- | --- |
| 인증·계정 모델 목록 | 성공. 초기 11개, 최종 재조회 12개 Claude ID 반환. 작업 중 목록이 바뀌어 하드코딩하지 않는 이유도 확인됨 |
| 직접 연결 기준선 | 짧은 텍스트 응답 성공 |
| 로컬 Messages | 짧은 텍스트 응답 성공 |
| 로컬 SSE | 텍스트 delta·종료 이벤트 확인 |
| 로컬 도구 왕복 | 7+5 도구 요청 → 고정 로컬 계산 → 최종 텍스트 12 확인 |
| 응답 모델 | 위 smoke 단계 모두 `claude-haiku-4-5-20251001` |
| 실제 Claude Code + ChatKHU | 임시 fixture.txt를 Read로 읽고 marker 반환. 2턴·Messages 2회·권한 거절 0·Bearer·세션 정리 확인 |
| 토큰 계산 | 공식 count_tokens 경로 직접 호출. 같은 모델·고정 user 입력 Hello에서 input_tokens=8 반환 |
| serve 명령 | 시작 후 health 200, 인증된 로컬 models 200·12개. Ctrl+C 뒤 리스너 해제·세션 디렉터리 삭제 확인 |

smoke 생성 요청은 5회, 실제 CLI 검사에서 관찰한 Messages는 2회였다. 게이트웨이는 재시도하지 않았다. 비용/크레딧 잔액 화면은 조회하지 않았으므로 차감량을 추정해 쓰지 않는다. 기본 저장 모델과 모든 별칭은 작은 검증에 사용한 Haiku로 되어 있으며 setup으로 변경할 수 있다.

Desktop 상세 기록을 추가한 뒤 저장소의 Git 포함 후보 29개 및 staging을 개인 API 키·Desktop 로컬 토큰의 원문·JSON 이스케이프·Base64 형태와 대조한 로컬 검사에서 유출을 발견하지 못했다. 검사 결과만 출력했고 staging은 비어 있었다. `.run/`과 `.env.local`의 Git 제외도 확인했다.

## Claude Desktop 실제 앱

단계별 진단, 변경한 설정, 테스트 문구와 복구 범위는 [Desktop 연결 상세 기록](DESKTOP_GATEWAY_SETUP_2026-10-08.md)을 참고한다.

Windows MSIX Claude **2.26454.2.0**에서 컴퓨터 유즈로 Gateway 로그인과 응답을 확인했다. 기존 개인 Kiro 연결의 주소·토큰 두 값을 사용자 승인 후 백업하고 변경했다. 일반 HKCU와 앱의 MSIX 가상 HKCU에 각각 적용했으며 HKLM·레지스트리 ACL·제공자·인증 종류는 변경하지 않았다.

처음에는 로컬 토큰이 맞아도 Electron의 `sec-fetch-site: none` 때문에 로컬 403이 발생했다. Origin 없는 none 요청을 허용하고 인증·Host·브라우저 차단 회귀 검사를 추가했다. 수정 후 전체 자동 테스트 19개가 통과했다.

| 검사 | 관찰한 결과 |
| --- | --- |
| Gateway 연결 | `http://127.0.0.1:8787` 연결 성공, 키 오류 배너 해소 |
| 모델 조회 | GET /v1/models 200, 앱 모델 선택기에 12개 표시 |
| 실제 응답 | 앱에서 Haiku 4.5 선택 후 짧은 연결 확인 요청에 `CHATKHU_DESKTOP_OK` 응답 표시 |
| 메시지·토큰 계산 | 앱이 보낸 POST /v1/messages 및 POST /v1/messages/count_tokens 모두 200 관찰 |
| 인증 | 로컬 Bearer 토큰과 upstream의 개인 ChatKHU 키 분리 유지 |
| 재시작 | 고정 포트 8787과 사용자 전용 local-token.key로 서버 재시작 후 앱 재연결 성공 |

앱 시작·연결 확인·세션 준비 중 자동 Messages 및 여러 토큰 계산 요청도 발생했다. 화면의 한 번 전송을 API 호출 한 번으로 간주하지 않으며, 차감량은 조회하지 않았다. 이 Desktop 검사는 도구·파일 작업을 요청하지 않은 짧은 응답 검사다. 앞의 CLI Read 왕복 검사와 구분한다. 재실행 명령과 백업 위치는 [운영 문서](OPERATIONS.md#claude-desktop-연결)에 기록했다.

## 남은 범위

- Haiku 이외 모델의 실제 생성, 모델별 사고·effort·beta 조합, 멀티모달/서버 도구, 캐시 적중은 확인하지 않았다. raw 전달만으로 기능 성공을 주장하지 않는다.
- main/별칭 매핑·보조 기본값 설정은 검증했지만 모든 CLI 내부 작업, 사용자 스킬/에이전트의 고정 ID, 향후 CLI 버전의 모든 별칭을 실계정으로 실행하지 않았다.
- macOS/Linux와 Node 24의 실환경 실행은 남아 있다. CI matrix는 작성했으나 이 세션에서 GitHub CI를 실행하지 않았다.
- 이 PC의 개인 HKCU/MSIX 설정 외에 조직이 배포한 MDM 정책 환경, HTTP 프록시가 필요한 조직 네트워크, 강제 전원 차단·강제 종료 후 상황은 검증하지 않았다. HTTPS upstream 전송은 Node 직접 연결이며 환경 HTTP_PROXY를 자동 적용하지 않는다.
- Desktop의 파일 편집·도구 왕복·모든 기능은 미검증이다. GPT/Gemini 변환, VS Code·cloud/background, 대회 요건 인정은 범위 밖이다.
- 커밋·푸시·PR·배포는 수행하지 않았다.
