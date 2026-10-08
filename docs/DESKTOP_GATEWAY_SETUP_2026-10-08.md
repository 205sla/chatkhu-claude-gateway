# Claude Desktop · ChatKHU Gateway 연결 및 검증 기록

기록일: **2026-10-08 (Asia/Seoul)**

대상: 이 PC에 설치된 Claude Desktop의 Code 화면과 개인 ChatKHU 로컬 게이트웨이

상태: **Gateway 로그인, 모델 조회, Haiku 4.5의 실제 응답 확인 완료**

이 문서는 당시의 설정 변경과 테스트 결과를 기록한다. 이후 일상 실행은 [운영 문서](OPERATIONS.md#claude-desktop-연결), 전체 CLI·API 검증은 [검증 기록](VALIDATION.md)을 기준으로 확인한다. 키·로컬 토큰의 실제 값과 개인 대화 내용은 포함하지 않았다.

## 1. 요청과 완료 기준

열려 있는 Claude 앱에서 **Gateway로 로그인**을 눌러 ChatKHU 연결을 확인하는 작업이었다. 컴퓨터 유즈로 실제 앱을 조작하고, 다음 결과로 완료 여부를 판단했다.

| 완료 기준 | 결과 | 확인 근거 |
| --- | --- | --- |
| Gateway 연결 | 완료 | 로컬 주소 `http://127.0.0.1:8787`에 연결, 키 오류 배너 해소 |
| 사용 가능한 모델 조회 | 완료 | 앱의 모델 선택기에 12개 표시, 모델 조회 HTTP 200 |
| 실제 모델 응답 | 완료 | Haiku 4.5 선택 후 `CHATKHU_DESKTOP_OK` 표시 |
| 토큰 계산 | 완료 | 앱의 토큰 계산 요청 HTTP 200 |
| 수정 후 회귀 검사 | 완료 | 자동 테스트 19개 통과, 실패 0, skip 0 |
| 원래 설정 보존 | 완료 | 일반 HKCU와 MSIX 앱 컨텍스트의 기존 연결 값 각각 백업 |

Desktop의 짧은 응답 성공을 확인한 범위다. Desktop에서 파일 편집이나 도구 왕복까지 검증한 결과는 아니다.

## 2. 환경과 최종 연결 구성

| 항목 | 검증 당시 값 |
| --- | --- |
| 운영체제 | Windows |
| Claude Desktop | `2.26454.2.0`, MSIX 설치 |
| 패키지 식별자 | `Claude_pzs8sxrjxfjjc`, 앱 ID `Claude` |
| Node.js / npm | `22.17.0` / `10.9.2` |
| 별도로 검증한 Claude Code CLI | `2.1.280` |
| 프로젝트 폴더 | `C:\Users\young\prg\ai\0. 도구\AI도구\챗쿠 게이트웨이` |
| 로컬 Base URL | `http://127.0.0.1:8787` |
| ChatKHU Base URL | `https://factchat-cloud.mindlogic.ai/v1/gateway/claude` |
| 앱에서 선택한 모델 | Haiku 4.5 |
| 같은 모델의 실제 API ID | `claude-haiku-4-5-20251001` |
| 실행 방식 | 터미널에서 실행하는 `serve`; 자동 시작·서비스 등록 없음 |

```mermaid
flowchart LR
    Desktop["Claude Desktop · Code"] -->|"로컬 토큰 / Bearer"| Local["127.0.0.1:8787"]
    Local -->|"개인 ChatKHU API 키 / HTTPS"| ChatKHU["ChatKHU Anthropic Gateway"]
```

앱에 설정한 인증값은 **로컬 게이트웨이용 토큰**이다. 게이트웨이는 별도로 보관한 개인 ChatKHU API 키로 upstream을 호출한다. 두 값은 다르며 로컬 토큰 파일을 유지하면 서버 재시작 후 같은 앱 설정으로 연결할 수 있다.

Desktop은 CLI의 환경 변수나 `settings.json`과 별도의 타사 추론 설정을 사용한다. 따라서 `npm run setup`으로 CLI 설정을 저장했다고 Desktop 연결까지 자동으로 적용되지는 않는다. [Claude 연결 안내](https://code.claude.com/docs/en/llm-gateway-connect), [Desktop Gateway 설정](https://claude.com/docs/third-party/claude-desktop/gateway)

## 3. 진행 과정과 문제 해결

### 3.1 기존 연결과 관리 설정 확인

앱은 기존 개인 Kiro 게이트웨이 주소인 `http://127.0.0.1:8000`을 사용하고 있었다. 개발자 모드의 타사 추론 설정 화면은 관리 설정 때문에 읽기 전용이었다.

확인한 사용자 정책 위치는 `HKCU\SOFTWARE\Policies\Claude`였다. 연결 관련 값은 다음 네 개였으며, 사용자 승인 후 주소와 토큰 두 값만 변경했다.

| 레지스트리 값 | 적용 내용 |
| --- | --- |
| `inferenceGatewayBaseUrl` | `http://127.0.0.1:8000` → `http://127.0.0.1:8787` |
| `inferenceGatewayApiKey` | 기존 연결 토큰 → ChatKHU 로컬 게이트웨이 토큰 |
| `inferenceProvider` | 기존 값 유지 |
| `inferenceCredentialKind` | 기존 값 유지 |

HKLM 정책은 없음을 확인했다. 기존 HKCU 키의 쓰기 권한 때문에 Windows 관리자 승인이 필요했으며, 승인 후 두 값만 적용했다. HKLM과 레지스트리 ACL은 변경하지 않았다. 이 작업은 이 PC의 기존 개인 연결을 바꾼 기록이며, 조직 MDM 설정을 자동 변경하는 기능은 구현하지 않았다. [Desktop MDM 설정](https://claude.com/docs/third-party/claude-desktop/mdm)

### 3.2 일반 HKCU를 바꿔도 앱에 남은 이전 주소

일반 HKCU를 변경한 뒤에도 앱은 이전 `8000` 주소를 읽었다. Claude가 MSIX 패키지로 설치되어 있었고, **앱의 가상 HKCU에 기존 연결 값이 별도로 남아 있는 것**을 확인했다.

Microsoft의 `Invoke-CommandInDesktopPackage`로 패키지 컨텍스트에서 확인한 뒤, 해당 컨텍스트의 원래 값도 따로 백업했다. 사용자 승인과 Windows UAC를 거쳐 같은 두 연결 값을 적용했다. 일반 HKCU의 변경만으로 앱의 설정까지 바뀌었다고 판단하지 않고, 앱이 실제로 읽는 값까지 대조했다. [MSIX 가상화](https://learn.microsoft.com/en-us/windows/msix/desktop/flexible-virtualization), [패키지 컨텍스트 실행 도구](https://learn.microsoft.com/en-us/powershell/module/appx/invoke-commandindesktoppackage?view=windowsserver2025-ps)

### 3.3 올바른 토큰인데도 API 키 오류가 표시됨

주소 변경 후에는 앱에 API 키 오류가 나타났다. 비밀값을 출력하지 않고 요청 조건만 확인한 결과는 다음과 같았다.

| 진단 항목 | 관찰 결과 |
| --- | --- |
| Host | 설정한 loopback 주소·포트와 일치 |
| 로컬 토큰 | 서버 토큰과 일치 |
| Origin | 없음 |
| `sec-fetch-site` | `none` |
| `sec-fetch-mode` | `no-cors` |
| 오류 발생 계층 | 로컬 게이트웨이, HTTP 403 |

원인은 기존 게이트웨이가 `sec-fetch-site` 헤더가 있으면 값과 관계없이 거절한 데 있었다. Electron의 정상 요청도 이 조건에 걸렸다. 개인 API 키를 재발급하는 대신, Origin이 없고 `sec-fetch-site`가 `none`인 요청을 처리하도록 호환 조건을 수정했다.

### 3.4 연결 복구 후에도 모델 선택이 비활성화됨

수정한 게이트웨이에서 앱의 다시 확인을 실행하자 모델 조회와 메시지 요청이 성공하고 오류 배너가 사라졌다. 다만 시작 시 모델 조회가 실패했던 앱의 모델 선택 상태는 바로 갱신되지 않았다.

앱 메뉴에서 정상 종료한 뒤 다시 실행하자 모델 선택기에 12개 모델이 표시됐다. Haiku 4.5를 선택하고 짧은 응답 테스트를 진행했다.

## 4. 코드 수정과 회귀 검사

수정 파일은 [src/gateway.mjs](../src/gateway.mjs), 회귀 검사는 [test/gateway.test.mjs](../test/gateway.test.mjs)에 있다.

| 요청 조건 | 최종 처리 |
| --- | --- |
| 정확한 Host, Origin 없음, fetch-site 없음 또는 `none`, 올바른 로컬 인증 | 지원 API로 전달 |
| 로컬 토큰 누락 또는 불일치 | HTTP 401 |
| `Origin: null`, 외부 Origin 또는 앱 Origin | HTTP 403 |
| `sec-fetch-site: same-origin`, `same-site`, `cross-site` | HTTP 403 |
| 잘못된 Host | HTTP 403 |
| CORS 응답 헤더 | 제공하지 않음 |
| upstream으로 전달하는 인증 | 개인 ChatKHU API 키 |
| upstream으로 전달하는 fetch metadata | 제외 |

이 표의 인증 조건은 모델 조회·메시지·토큰 계산 API에 적용한다. `/health`는 Host·Origin 조건을 검사한 뒤 최소 상태만 반환하며 로컬 토큰은 요구하지 않는다.

추가한 테스트 이름:

```text
Electron main-process fetch is authenticated while browser origins and cross-site requests stay blocked
```

`npm test` 최종 결과는 **19개 통과, 실패 0, skip 0**이다. 샌드박스에서 loopback·파일 권한 제약으로 실패한 실행은 별도로 구분했고, 필요한 로컬 권한으로 재실행한 전체 결과를 기록했다. 이 자동 테스트는 외부 ChatKHU API를 호출하지 않는다.

## 5. 실제 앱 테스트와 결과

### 5.1 테스트 방법

컴퓨터 유즈로 Gateway 로그인과 모델 선택을 수행했다. 빈 테스트 폴더 `.run/desktop-smoke`를 선택한 뒤 Haiku 4.5에 다음 고정 문구를 보냈다.

```text
연결 확인 테스트입니다. 도구를 사용하거나 파일을 읽거나 수정하지 말고, 정확히 CHATKHU_DESKTOP_OK 한 줄만 답해 주세요.
```

앱에서 확인한 응답:

```text
CHATKHU_DESKTOP_OK
```

### 5.2 HTTP 및 화면에서 확인한 결과

| 확인 대상 | 결과 | 판단 범위 |
| --- | --- | --- |
| `GET /v1/models` | HTTP 200 | 해당 계정의 모델 목록 조회 성공 |
| 모델 선택기 | 12개 표시, Haiku 4.5 선택 | 검증 당시의 목록이며 고정 개수 아님 |
| `POST /v1/messages` | HTTP 200 | 실제 앱 응답까지 확인 |
| `POST /v1/messages/count_tokens` | HTTP 200 | 앱이 보낸 토큰 계산 요청 성공 |
| 서버 재시작 후 앱 연결 | 성공 | 같은 8787 포트와 로컬 토큰 사용 |
| 마무리 `/health` | `{"status":"ok"}` | 당시 로컬 서버 실행 확인 |

앱 시작과 연결 확인, 세션 준비 중 자동 메시지 및 여러 토큰 계산 요청도 발생했다. 화면에서 한 번 보냈다고 API 호출도 한 번이라고 계산하지 않는다. 크레딧 차감량은 확인하지 않았다.

모델 선택은 앱의 Haiku 4.5 표시를 기준으로 기록했다. 같은 계정의 앞선 CLI·API 검사에서는 실제 응답 ID `claude-haiku-4-5-20251001`을 확인했다. 모델에게 자기 이름을 물어 받은 답을 모델 식별의 근거로 쓰지 않는다.

## 6. 다음 실행과 상태 확인

아래는 **이미 연결을 마친 이 PC**의 재실행 절차다. 새 PC 설치나 최초 Desktop 설정을 자동으로 수행하는 명령은 아니다.

### 6.1 게이트웨이 시작

PowerShell에서 실행한다.

```powershell
Set-Location -LiteralPath 'C:\Users\young\prg\ai\0. 도구\AI도구\챗쿠 게이트웨이'
$env:CHATKHU_LOCAL_TOKEN_FILE = Join-Path $env:LOCALAPPDATA 'chatkhu-gateway\desktop\local-token.key'
npm run serve -- --port 8787
```

서버가 실행된 터미널을 유지하고 Claude 앱을 사용한다. 포트와 토큰 파일을 생략하면 기본 동작에서 새 포트·토큰을 생성하므로 저장된 Desktop 연결과 맞지 않을 수 있다. 이미 서버가 실행 중이면 같은 포트에 중복 실행하지 않는다.

### 6.2 상태 확인

다른 PowerShell에서 로컬 서버 상태를 확인할 수 있다.

```powershell
Invoke-RestMethod 'http://127.0.0.1:8787/health'
```

`status: ok`는 로컬 서버의 응답만 확인한다. ChatKHU 인증·모델 목록은 저장소에서 `npm run doctor`로 확인한다. 실제 생성 성공은 앱 응답으로 별도 판단한다.

앱에서 Gateway 연결 후 모델을 선택한다. 연결 수정 후에도 모델 선택이 비활성화되어 있으면 앱을 정상 종료하고 다시 연다. 서버 종료는 해당 터미널의 Ctrl+C로 한다. 자동 시작·서비스는 설치하지 않았으므로 다음 부팅 후에는 서버를 다시 실행해야 한다.

## 7. 저장 파일과 기존 연결 복구

### 7.1 운영 파일

아래 경로의 기준은 `%LOCALAPPDATA%\chatkhu-gateway`다.

| 상대 경로 | 용도 |
| --- | --- |
| `config.json` | ChatKHU 주소·기본 모델·CLI 별칭 설정 |
| `credentials.key` | 개인 ChatKHU API 키 |
| `desktop\local-token.key` | Desktop과 로컬 서버가 공유하는 고정 로컬 토큰 |
| `sessions\session-…\client-env.json` | 실행 중 생성되는 클라이언트 연결 정보 |

키·토큰은 평문 파일이며 사용자 전용 ACL로 접근을 제한했다. OS 자격 증명 금고에 저장한 것은 아니다. 문서에는 파일의 위치와 역할만 남겼다.

### 7.2 원래 연결의 백업

| 적용 컨텍스트 | 백업 경로 — `%LOCALAPPDATA%\chatkhu-gateway` 기준 |
| --- | --- |
| 일반 Windows 사용자 HKCU | `desktop-backups\20261008T132728\original-user-connection.json` |
| Claude MSIX 앱의 가상 HKCU | `desktop\original-package-user-connection.json` |

복구 시에는 Claude 앱을 정상 종료하고, 각 백업에서 **해당 컨텍스트의 주소·토큰 두 값**을 복원한 뒤 앱을 다시 실행한다. 제공자·인증 종류와 ACL은 이번 변경 대상이 아니었다. 백업에는 기존 인증값도 포함되므로 본문을 공유하거나 저장소에 추가하지 않는다.

실제 복원은 수행하지 않았다. 현재 설정은 ChatKHU 연결 상태로 두었으며 기존 Kiro 백엔드·계정 파일은 변경하지 않았다. 로컬 `.run/`의 연결 도우미는 당시의 `8000` 주소와 네 개 값이라는 사전 조건을 검사하는 일회성 도구다. 일반 설치·복구 명령으로 재사용하지 않는다.

## 8. 검증 범위와 후속 확인 사항

| 구분 | 상태 |
| --- | --- |
| Desktop 로그인·모델 조회·Haiku 4.5 짧은 응답 | 이번 작업에서 확인 |
| Desktop 토큰 계산 | HTTP 200 확인 |
| 실제 CLI의 Read 도구 왕복 | 앞선 별도 검사에서 확인 — [전체 검증 기록](VALIDATION.md) |
| Desktop 파일 편집·도구 왕복 | 미검증 |
| Haiku 외 모델의 생성·멀티모달·사고 옵션·캐시 적중 | 미검증 |
| 기업 MDM 배포·다른 PC·다른 OS의 Desktop | 미검증 |
| 기존 연결 백업으로의 실제 복원 | 미실행 |
| 자동 시작·서비스 설치 | 구현·등록하지 않음 |
| 커밋·푸시·PR·배포 | 이번 작업에서 수행하지 않음 |

이 상세 기록을 추가한 뒤 Git 포함 후보 29개와 staging을 개인 API 키·로컬 토큰의 원문, JSON 이스케이프, Base64 값과 대조했고 검출은 0건이었다. `.env.local`과 `.run/`은 Git 제외 대상이다. 이번에 정리한 문서 4개의 로컬 링크 25개와 PowerShell 예제 10개의 문법도 확인했다. 문서 정리 중 실제 API 생성 테스트를 다시 실행하지는 않았다.

## 9. 관련 문서

| 문서 | 찾을 내용 |
| --- | --- |
| [README](../README.md) | 설치·주요 명령·전체 사용 범위 |
| [운영·장애·복구](OPERATIONS.md) | 일상 실행, Desktop 재시작, 상태별 조치 |
| [검증 기록](VALIDATION.md) | 자동 테스트, CLI mock, 실제 ChatKHU·Desktop 결과 |
| [구현 구조](ARCHITECTURE.md) | 요청 전달, 인증, 스트리밍, 설정·프로세스 수명 |
| [조사 기록](RESEARCH.md) | 공식 문서 확인과 설계 근거 |
