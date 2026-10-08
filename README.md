# 챗쿠 게이트웨이

개인이 자신의 ChatKHU API 키로 Claude Code를 실행할 수 있도록 만드는 도구의 구현 명세다. 공모전 프로젝트를 Claude Code의 작업 흐름으로 개발하면서, 모델 호출은 ChatKHU 공식 API를 이용하는 것이 목적이다.

현재 저장소에는 **다른 AI에게 전달할 상세 프롬프트와 조사 기록만 있다. 게이트웨이 프로그램은 아직 구현하지 않았다.**

## 구현을 맡기는 방법

이 저장소를 작업 폴더로 연 뒤 [IMPLEMENTATION_PROMPT.md](./IMPLEMENTATION_PROMPT.md)의 내용을 구현 담당 AI에게 전달한다. 기존 대화가 없어도 시작할 수 있도록 목표, 확인된 API 규격, 구현 단계, 완료 기준을 포함했다.

짧게 지시하려면 다음 문장을 사용한다.

> 이 저장소의 IMPLEMENTATION_PROMPT.md를 읽고, 요구사항에 따라 ChatKHU API를 Claude Code에서 사용할 수 있는 도구를 구현해줘. README.md와 docs/RESEARCH.md도 확인하고, 실제 API 키는 출력하거나 커밋하지 마. 구현·테스트·사용 설명까지 진행하되, 실제 계정으로 확인하지 못한 기능은 검증 결과에 구분해서 남겨줘.

## 설계의 출발점

ChatKHU는 이미 Anthropic Messages API와 Claude Code 연결을 공식 문서로 안내한다. 이 프로젝트는 해당 API를 기반으로 개인 키 설정, 사용 가능한 Claude 모델 조회, 로컬 실행, 진단과 종료를 편리하게 제공하는 방향이다. [ChatKHU의 Claude Code 연결 가이드](https://docs.mindlogic.ai/docs/khu/api-gateway/integrations/claude-code)

기본 요청 흐름은 다음과 같다.

```text
Claude Code
  → 개인 PC의 로컬 게이트웨이
  → ChatKHU 공식 Anthropic API
  → 해당 계정에서 사용할 수 있는 Claude 모델
```

유효한 ChatKHU API 키와 모델 호출 권한을 가진 사용자가 자신의 PC에서 설정하는 구성을 목표로 한다. 공용 키나 공동 과금 서버는 필요하지 않다.

## 문서

- [구현용 프롬프트](./IMPLEMENTATION_PROMPT.md): 구현 담당 AI에게 전달할 전체 지시문
- [공식 문서 확인 기록](./docs/RESEARCH.md): 확인된 사실, 출처, 실계정 검증이 필요한 항목

사용자가 제공한 챗봇 호출·Chat Completions 문서를 반영했으며, Claude 네이티브 연결과 다른 모델용 변환 어댑터의 차이도 프롬프트에 정리했다.

작성 기준일: 2026-10-08. 실제 API 키 발급, 유료 모델 호출, Claude Code의 기존 설정 변경은 수행하지 않았다.
