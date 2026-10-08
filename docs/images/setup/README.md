# README 안내 이미지와 촬영 기록

[설치 안내로 돌아가기](../../../README.md)

2026-10-08에 확인한 ChatKHU 웹 화면과 Windows Claude Desktop 2.26454.2.0 화면입니다. README의 빨간 박스는 클릭할 메뉴와 확인할 입력란을 나타냅니다.

## 원본과 안내 이미지

실제 화면을 먼저 캡처한 뒤, 별도 사본에 빨간 박스를 추가했습니다. `-annotated.png` 파일은 이미지 편집 도구로 만든 안내용 사본으로, 확대·여백 등 원본과 픽셀 단위 차이가 있을 수 있습니다. 원래 UI를 확인할 수 있도록 편집 전 캡처도 함께 보관합니다. 메뉴 이름·주소·인증 방식·가려진 키가 원본과 맞는지 대조했습니다.

| 안내 순서 | 원본 캡처 | 빨간 박스가 있는 안내 이미지 | 표시한 부분 |
| --- | --- | --- | --- |
| 2-1. 학교 계정 로그인 | [로그인 화면](01-chatkhu-sign-in.jpg) | 원본 사용 | 아이디·비밀번호가 비어 있는 로그인 화면 |
| 2-2. API Gateway 열기 | [메뉴 원본](02a-chatkhu-gateway-menu.jpg) | [메뉴 강조](02a-chatkhu-gateway-menu-annotated.png) | 왼쪽 아래 API Gateway 메뉴 |
| 2-3. API 키 발급 | [버튼 원본](02c-chatkhu-create-key.jpg) | [버튼 강조](02c-chatkhu-create-key-annotated.png) | API 키 생성 버튼 |
| 2-4. 주소 확인 | [Base URL 원본](02b-chatkhu-base-url.jpg) | [Base URL 강조](02b-chatkhu-base-url-annotated.png) | Base URL 행과 오른쪽 복사 버튼 |
| 6-1. 도움말 | [앱 메뉴 원본](03-claude-app-menu.png) | [도움말 강조](03-claude-app-menu-annotated.png) | 도움말 메뉴 |
| 6-2. 개발자 모드 진입 경로 | [도움말 원본](04-claude-help-menu.png) | [문제 해결 강조](04-claude-help-menu-annotated.png) | 문제 해결 메뉴 |
| 6-3. 타사 추론 설정 | [개발자 메뉴 원본](05-claude-developer-menu.png) | [설정 메뉴 강조](05-claude-developer-menu-annotated.png) | 타사 추론 설정 메뉴 |
| 7-2. Gateway 연결 | [설정 창 원본](06-claude-gateway-settings.png) | [설정 항목 강조](06-claude-gateway-settings-annotated.png) | 제공자·자격 증명·URL·가려진 키·인증 방식·연결 테스트 |
| 8. Gateway 로그인 | [로그인 원본](07-claude-gateway-login.png) | [Gateway 링크 강조](07-claude-gateway-login-annotated.png) | 또는 Gateway로 로그인 링크 |

## 촬영 범위와 화면의 상태

- ChatKHU 화면은 사용자가 직접 로그인한 후 브라우저에서 촬영했습니다. 개인 이름, 기존 키 목록, 사용량이 들어가지 않도록 필요한 영역만 캡처했습니다.
- 설명용 키를 새로 만들지 않았습니다. API 키 생성 사진은 버튼의 위치를 보여 주며, 발급 결과나 개인 키를 포함하지 않습니다. 키 발급 후 복사 절차는 [ChatKHU 공식 인증 안내](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/authentication)를 참고했습니다.
- Claude 메뉴는 실제 열린 메뉴를 캡처했습니다. 개발자 모드가 이미 활성화된 PC였으므로 `개발자 모드 활성화` 버튼 자체는 사진에 없습니다. 활성화 경로는 [Anthropic 공식 안내](https://claude.com/docs/third-party/claude-desktop/in-app-configuration)로 확인했습니다.
- Gateway 설정 창의 토큰은 앱 자체에서 가려진 상태입니다. 촬영한 PC의 기존 관리 설정 때문에 `조직 관리`·읽기 전용 안내가 표시됩니다. 일반 개인 PC의 편집 가능한 화면과 차이가 있으며, README에서 설명했습니다.
- Gateway 로그인 원본은 사용자가 이 대화에 첨부한 `codex-clipboard-321391ac-a4fc-4881-b9bc-2b782a08dbba.png`입니다.
- 예제 주소는 공개 Base URL과 로컬 루프백 주소입니다. 실제 API 키나 로컬 토큰 값은 문서와 이미지에 기록하지 않았습니다.

## 빨간 박스 편집 방법과 프롬프트

내장 `image_gen` 도구로 원본을 각각 참조해 8장의 안내 이미지를 만들었습니다. 아래 공통 지시와 이미지별 대상을 사용했습니다. 글자와 주소를 대조한 뒤 README 표시 폭을 조정했습니다.

공통 지시:

> 실제 스크린샷 위에 얇고 선명한 빨간 사각형 테두리만 추가한다. 테두리 안쪽은 투명하게 유지하고 글자·아이콘을 가리지 않는다. 원래의 한국어·영어 UI, 주소, 색, 배치, 가려진 키와 상태를 유지한다. 새 문구·화살표·번호·입력값·화면 요소를 만들지 않는다. 작은 메뉴 이미지는 원래 비율을 유지해 확대할 수 있다.

| 이미지 | 추가 지시 |
| --- | --- |
| API Gateway 메뉴 | `API Gateway` 메뉴 행 전체를 하나의 빨간 사각형으로 표시한다. |
| API 키 생성 | `API 키 생성` 버튼 바깥을 하나의 빨간 사각형으로 표시한다. |
| Base URL | `https://factchat-cloud.mindlogic.ai/v1/gateway`가 있는 행과 오른쪽 복사 버튼을 함께 표시한다. |
| 앱 메뉴 | `도움말` 행을 하나의 빨간 사각형으로 표시한다. |
| 도움말 메뉴 | `문제 해결` 행을 하나의 빨간 사각형으로 표시한다. |
| 개발자 메뉴 | `타사 추론 설정…` 행을 하나의 빨간 사각형으로 표시한다. |
| Gateway 설정 | `Gateway`, `정적 API 키`, `http://127.0.0.1:8787`, 가려진 API 키, `bearer`, `연결 테스트`를 각각 표시한다. 읽기 전용 안내와 키의 가림 상태를 유지한다. |
| Claude 로그인 | 화면 아래 `또는 Gateway로 로그인` 링크와 오른쪽 꺾쇠를 함께 표시한다. |

이미지는 조작 순서를 설명하기 위한 자료입니다. 실제 연결 성공 여부와 요청 결과는 [Desktop 연결 기록](../../DESKTOP_GATEWAY_SETUP_2026-10-08.md)에 따로 기록했습니다.

## 문서 검수 기록

2026-10-08 기준으로 다음을 확인했습니다.

- README와 이 기록의 로컬 파일·이미지·목차 참조 56곳이 유효합니다.
- README의 이미지 9장 중 8장에 빨간 박스가 있으며, 각 이미지에 대체 설명과 표시 폭을 지정했습니다.
- PowerShell 코드 블록 14개의 구문 검사와 토큰 생성 블록 안의 JavaScript 구문 검사를 통과했습니다.
- 로컬 토큰 예제는 별도의 임시 폴더에서 두 번 실행했습니다. 처음에는 생성되고 두 번째에는 같은 값이 유지됐으며, 값은 콘솔에 출력되지 않았습니다. 실제 사용 중인 토큰 파일은 변경하지 않았습니다.
- Git에 포함될 수 있는 파일 47개와 스테이징 내용을 검사해 실제 개인 API 키·Desktop 로컬 토큰 값이 검출되지 않았습니다. 이미지도 개인 키와 계정 정보가 들어가지 않도록 시각적으로 확인했습니다.
- 브라우저 미리보기에서 이미지 9장의 로딩, 사진 크기, 빨간 박스와 설명의 배치를 확인했습니다. 가로 넘침과 해석되지 않은 굵은 글씨 표시는 없었습니다.

이번 검수에서는 유료 모델 요청을 추가로 보내지 않았습니다. 실제 Desktop 연결 결과는 위 연결 기록의 검증 범위를 따릅니다.
