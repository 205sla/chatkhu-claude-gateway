# ChatKHU와 Claude Code 연결 조사 기록

확인일: 2026-10-08. 공개 공식 문서와 로컬 Claude Code의 도움말을 확인했다. ChatKHU 실계정 API는 호출하지 않았다.

## 확인한 사실

| 항목 | 확인 결과 | 출처 |
| --- | --- | --- |
| 공식 연결 지원 | ChatKHU가 Claude Code 연결 가이드를 제공한다 | [연동 가이드](https://docs.mindlogic.ai/docs/khu/api-gateway/integrations/claude-code) |
| 기본 API 주소 | `https://factchat-cloud.mindlogic.ai/v1/gateway` | [API 개요](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/overview) |
| Anthropic Base URL | 위 주소 아래 `/claude`. 클라이언트가 `/v1/messages`를 붙인다 | [Messages](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/messages-api) |
| 키와 과금 | 개인 키를 발급하며 그 계정에서 크레딧을 차감한다 | [인증](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/authentication) |
| 모델 | 기관·사용자 권한에 따라 목록이 달라지므로 API로 조회해야 한다 | [모델 조회](https://docs.mindlogic.ai/docs/khu/api-gateway/getting-started/models) |
| 모델 범위 | Anthropic 네이티브 경로는 Anthropic 모델만 허용한다 | [Messages 제한](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/messages-api) |
| 형식 보존 | 네이티브 API가 요청·SSE를 전달하며 도구 사용, 사고, 캐싱, 토큰 계산을 문서상 지원한다 | [Messages](https://docs.mindlogic.ai/docs/khu/api-gateway/reference/messages-api) |
| 클라이언트 인증 | ChatKHU는 Claude Code에 `ANTHROPIC_AUTH_TOKEN` 사용을 안내한다 | [연동 가이드](https://docs.mindlogic.ai/docs/khu/api-gateway/integrations/claude-code) |
| 설정 우선순위 | Claude 설정의 `env`가 셸 환경 변수보다 우선할 수 있다 | [Claude Code 연결](https://code.claude.com/docs/en/llm-gateway-connect) |
| 호환성 | beta·version 헤더, 새 요청 필드와 upstream 오류를 보존해야 한다 | [프로토콜 가이드](https://code.claude.com/docs/en/llm-gateway-protocol) |

## 설계에 반영할 구분

ChatKHU의 스튜디오 챗봇 API와 모델 Gateway API는 다르다. 스튜디오 챗봇 API는 챗봇에 저장된 모델·시스템 프롬프트를 사용하며 호출의 `system` 메시지를 무시한다고 안내한다. Claude Code의 시스템 지시와 도구 흐름을 유지할 목적에는 모델 Gateway의 Anthropic 네이티브 경로가 적합하다. [챗봇 API 설명](https://docs.mindlogic.ai/docs/khu/baze/product/api-access)

ChatKHU의 인증 헤더 설명과 Claude Code의 설명에는 차이가 있다. 구현에서는 한 가지 헤더를 추측해 고정하지 말고, 현재 CLI를 관찰하면서 로컬에서는 Bearer와 `x-api-key`를 처리하고 upstream에는 명시적으로 ChatKHU 키를 넣도록 한다.

공식 문서에 연결 방법이 있으므로 프로토콜 변환기를 새로 만드는 작업은 우선순위가 낮다. 개인 설정, 모델 선택, 설정 충돌 방지, 진단·실행·종료 자동화가 이 도구의 주된 역할이다.

## 사용자가 지정한 두 문서

[일반 제품의 챗봇 API 안내](https://docs.mindlogic.ai/docs/general/baze/product/api-access#api%EB%A1%9C-%EC%B1%97%EB%B4%87-%ED%98%B8%EC%B6%9C)는 브라우저에서 직접 확인했다. 챗봇은 자체 시스템 프롬프트를 사용하고 호출의 `system`을 무시한다. 응답의 `usage`는 `null`이며 호출 크레딧은 별도 `credits`로 반환한다. 같은 페이지의 “내 에이전트에 연결하기” 안내는 계정 화면에서 올바른 Base URL을 확인하는 데 활용할 수 있다.

[일반 Chat Completions 문서](https://docs.mindlogic.ai/docs/general/api-gateway/reference/chat-completions#chat-completions-api)는 모델 직접 호출 경로, system/developer 메시지, `tools`, `tool_choice`, SSE와 마지막 usage 청크를 안내한다. 이 경로는 여러 제공사의 모델을 다루지만 Claude Code가 사용하는 Anthropic 형식과 같지는 않다. 다른 모델을 연결하려면 요청·응답·도구 왕복·스트리밍을 변환하는 어댑터가 필요하다는 점을 구현 프롬프트에 반영했다.

기본 구현은 Claude 네이티브 경로를 우선하고, Chat Completions 경로는 확장 지점을 분리하도록 했다. 이는 기능 보존과 검증 범위를 고려한 설계 판단이다. [Anthropic의 안내](https://code.claude.com/docs/en/llm-gateway)는 비Claude 모델로의 라우팅을 공식 지원하지 않는다고 명시한다.

## 로컬 참고 환경

- Node.js 22.17.0, npm 10.9.2, Claude Code 2.1.280 확인.
- Claude Code 도움말에서 `--settings`, `--setting-sources`, `--model`, `--print` 지원 확인.
- 이 PC의 npm 설치는 `.cmd`에서 패키지 내 native `claude.exe`를 실행한다. 다른 설치 방식과 운영체제도 고려해야 한다.
- 기존 Kiro 게이트웨이 핸드북은 운영 흐름 참고용이다. 그 안의 Kiro 계정·세션·Desktop 설정을 이번 프로젝트에 적용하지 않는다.

## 실제 구현에서 확인할 항목

계정에 표시되는 Base URL, 발급 키의 Gateway 사용 권한, 이용 가능한 Claude 모델 ID, 현재 CLI의 실제 요청, 스트리밍·도구 왕복, 토큰 계산, 크레딧 사용, 조직 필터의 영향은 실제 설정 후 확인해야 한다.

공식 문서의 광범위한 지원 설명만으로 모든 Claude Code 기능의 동작을 보장할 수는 없다. 이 저장소의 프롬프트는 mock 검증과 실제 계정 검증을 분리하도록 요구한다.
