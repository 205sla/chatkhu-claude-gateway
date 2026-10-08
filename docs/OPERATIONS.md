# 실행·진단·종료·복구

## 일상 실행

저장소에서 `npm run doctor`로 생성 없이 설정·모델 목록을 확인한다. `npm run claude -- --cwd '작업 폴더 절대경로'`로 시작하고 Claude의 `/status`에서 로컬 주소·인증 출처·모델을 확인한다. `npm run models`는 현재 ID를 보여준다. 설정 변경은 `npm run setup`으로 한다.

기본 포트는 매번 빈 포트다. 고정하려면 --port 8787을 쓴다. serve 시작 시 출력된 주소의 /health로 확인한다.

```powershell
Invoke-RestMethod 'http://127.0.0.1:8787/health'
```

health는 로컬 리스너만 의미한다. upstream·모델 접근은 doctor, 실제 생성은 명시적 smoke로 확인한다.

## Claude Desktop 연결

설정 변경 과정, MSIX·Electron 오류 원인, 실제 앱 테스트 근거는 [2026-10-08 Desktop 상세 기록](DESKTOP_GATEWAY_SETUP_2026-10-08.md)에 정리했다.

이 PC에서는 사용자 승인 후 Claude Desktop의 Gateway 주소를 `http://127.0.0.1:8787`로 연결했다. 앱에 저장된 로컬 토큰을 재사용하려면 저장소 폴더의 PowerShell에서 다음과 같이 실행한다.

```powershell
$env:CHATKHU_LOCAL_TOKEN_FILE = Join-Path $env:LOCALAPPDATA 'chatkhu-gateway\desktop\local-token.key'
npm run serve -- --port 8787
```

이 터미널을 켜 둔 채 Claude 앱을 사용한다. 2026-10-08에는 Gateway 로그인 후 Haiku 4.5를 선택해 실제 응답을 확인했다. 고정 포트와 토큰 파일을 생략하면 새 주소·토큰을 생성하므로 기존 앱 설정과 맞지 않을 수 있다. 자동 시작이나 서비스는 설치하지 않았다.

Desktop은 CLI의 환경 변수나 `settings.json` 대신 별도의 타사 추론 설정을 사용한다. 새 PC에서는 공식 Gateway 설정 절차를 따라야 하며, 이 실행기에 Desktop 자동 설정 명령은 없다. 조직 관리 설정이 적용되어 있으면 관리자와 변경 범위를 확인한다. [Claude 연결 안내](https://code.claude.com/docs/en/llm-gateway-connect), [Desktop Gateway 설정](https://claude.com/docs/third-party/claude-desktop/gateway)

이 PC의 기존 개인 Kiro 연결은 HKCU 정책 키와 Claude MSIX의 가상 HKCU에 각각 남아 있었다. 승인된 작업에서는 주소와 로컬 토큰 두 값만 바꾸고 제공자·인증 종류는 유지했다. HKLM과 레지스트리 권한은 변경하지 않았다. 원래 값의 비공개 백업은 `%LOCALAPPDATA%\chatkhu-gateway\desktop-backups\20261008T132728\original-user-connection.json`과 `%LOCALAPPDATA%\chatkhu-gateway\desktop\original-package-user-connection.json`에 있다. 백업에는 기존 인증값이 있으므로 공유하지 않는다. 복구가 필요하면 해당 실행 컨텍스트의 두 연결 값을 각각 원본에서 복원한다. 기존 Kiro 백엔드·계정 파일은 그대로다.

초기 버전은 Electron이 보내는 `sec-fetch-site: none`까지 거절해 앱에 API 키 오류가 표시됐다. 현재는 Origin이 없는 이 요청을 허용하며 정확한 Host와 로컬 인증을 계속 검사한다. 다른 fetch-site 값과 모든 Origin은 차단하고 CORS를 제공하지 않는다. 연결 수정 후 모델 선택이 계속 비활성화되어 있으면 앱을 정상 종료한 뒤 다시 열어 시작 시 모델 조회를 갱신한다.

## 오류별 조치

| 상태/상황 | 확인할 사항 |
| --- | --- |
| 키 없음 | setup 또는 환경 키/키 파일. 키를 콘솔에 출력하지 않음 |
| 401 | 해지·오타·키 발급 기관과 Base URL 불일치 |
| 403 | 조직 Gateway 활성화·모델 권한·기관·필터. 필요한 경우 기관/제공사 담당자에게 요청 |
| 402 | 계정 크레딧 잔액 |
| 429 | Retry-After와 동시 요청 수. 예약 한도는 Retry-After가 없을 수도 있음 |
| 404 | 모델 실제 ID, /claude URL, /v1 중복 여부 |
| 400/422 | 요청 옵션·beta·모델 기능 또는 조직 개인정보 필터. 상태만으로 확정하지 않음 |
| 413 | 입력·첨부·프로젝트 컨텍스트 크기. 로컬 및 upstream 제한 모두 적용 |
| 5xx | upstream 장애인지 x-chatkhu-error-source: local인지 구분 |
| 로컬 502 redirect | 계정 주소/슬래시 경로 확인. 키를 보낸 채 Location을 따라가지 않음 |
| 포트 충돌 | --port 0 또는 다른 번호. 다른 프로세스를 죽이지 않음 |
| Claude 미설치 | 공식 CLI 설치 후 새 터미널에서 claude --version; 자동 설치하지 않음 |
| apiKeyHelper 충돌 | 원본을 유지한 채 중단. 사용자가 helper 적용 범위/별도 프로필 검토 |
| 강제 로그인/조직 정책 | 관리자 확인. 실행기는 정책/MDM/레지스트리를 자동 변경하지 않음. Desktop의 승인된 수동 설정은 위 절차와 별도 |
| 연결 거절·DNS·TLS | 계정 URL·네트워크·신뢰 인증서 확인. TLS 검증을 끄지 않음 |
| 타임아웃·연결 종료 | 네트워크 및 CHATKHU_IDLE_TIMEOUT_MS. 무작정 재전송하지 않음 |

serve의 stderr 메타데이터는 로컬 요청 ID·API 경로·상태·소요 시간·오류 계층·인증 헤더 종류뿐이다. claude 실행의 게이트웨이는 기본적으로 로그를 출력하지 않는다. 프롬프트·본문·키·헤더 값·환경 전체는 기록하지 않는다. upstream 오류 원문은 클라이언트에 전달하므로 **Claude 자체의 화면/디버그 로그**에는 포함될 수 있다. 공유 전 개인정보·키·프로젝트 자료를 확인한다.

프로젝트 자료가 모델로 전달될 수 있으므로 조직 정책을 확인한다. 개인정보 필터를 끄거나 회피하는 기능은 없다. 일반 오류 안내는 [공식 오류 문서](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/errors)에 기반한다.

## 종료와 재시작

- Claude의 /exit, 또는 Ctrl+C 후 CLI 안내에 따라 한 번 더 누른다. 작업만 취소하고 Claude가 열려 있다면 게이트웨이도 유지된다.
- serve는 Ctrl+C로 종료한다. 같은 명령으로 재시작하며 자동 시작/서비스를 설치하지 않는다.
- 일반 claude 명령은 기존 설정을 사용한다. 부모 셸 환경이나 기존 로그인을 바꾸지 않는다.

정상/오류 종료와 처리 가능한 SIGINT/SIGTERM에서는 임시 설정과 리스너를 정리한다. 강제 종료·전원 차단 후에는 sessions에 파일이 남을 수 있다. 세션을 모두 종료했는지 확인한 다음 **그 세션 디렉터리만** 삭제한다. config.json, credentials.key, Claude 로그인/대화 저장소를 일괄 삭제하지 않는다.

PID 재사용 때문에 임시 파일의 PID만 믿고 자동으로 프로세스를 죽이지 않는다. 실제 프로세스 명령행을 로컬에서 확인한다. 다른 게이트웨이·Claude·Kiro를 일괄 종료하지 않는다.

노출된 키는 ChatKHU에서 해지·재발급한 뒤 setup으로 갱신한다. 원래 dotenv나 사용자 키 파일도 있다면 함께 갱신한다. 일반 재시작에는 재발급이 필요 없다.
