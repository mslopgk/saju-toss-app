# 하네스 엔지니어링을 미니앱 시작에 적용하기

## 출처

- OpenAI, Harness engineering: https://openai.com/index/harness-engineering/
- Apps in Toss, AI 바이브 코딩: https://developers-apps-in-toss.toss.im/tutorials/ai-vibe-coding.md
- Apps in Toss, 기존 웹 프로젝트에 SDK 연동: https://developers-apps-in-toss.toss.im/tutorials/webview.md
- TDS Mobile Start: https://tossmini-docs.toss.im/tds-mobile/start/

## 적용한 원칙

OpenAI 문서는 에이전트가 안정적으로 일하려면 코드만이 아니라 환경, 구조, 도구, 문서, 피드백 루프가 필요하다고 설명한다. 거대한 단일 지침 대신 짧은 `AGENTS.md`를 지도처럼 사용하고, 상세 지식을 구조화된 `docs/`에 두며, 중요한 경계는 문서뿐 아니라 검증 가능한 구조로 만드는 접근을 권한다.

미니앱 시작 스킬에서는 이를 다음처럼 축소 적용한다.

1. `AGENTS.md`는 명령과 문서 링크만 담는 짧은 입구다.
2. 제품 의도, 아키텍처, TDS 사용 규칙은 각각 별도 문서에 둔다.
3. 소스 경계는 `app/pages → features → shared`로 단순화한다.
4. TDS 문서를 AI가 검색할 수 있게 하고, UI 추측을 줄인다.
5. `ait init`과 로컬 검증 명령처럼 반복 가능한 도구를 수동 파일 작성보다 우선한다.
6. 작은 앱에 불필요한 대규모 하네스, 커스텀 린터, 관측성 스택은 만들지 않는다.

## 의존 방향

```text
app / pages
    ↓
features
    ↓
shared/api · shared/lib · shared/ui
```

- `shared`는 기능 도메인에 의존하지 않는다.
- `features`끼리 직접 얽히기보다 페이지나 앱 조합 계층에서 연결한다.
- 외부 API 응답은 `shared/api` 경계에서 타입 검증한 뒤 앱 내부로 전달한다.
- TDS에 없는 공용 표현만 `shared/ui`에 둔다.

## 피해야 할 과잉 구성

- 기능이 하나뿐인데 모든 레이어에 빈 폴더 만들기
- 수백 줄짜리 `AGENTS.md`
- 실제 합의가 없는 제품 요구사항 생성
- CLI 생성 파일을 예쁜 구조에 맞추려고 이동
- TDS 컴포넌트를 감싸기만 하는 의미 없는 래퍼
- 시작 단계에서 샌드박스·배포 자동화까지 한꺼번에 구축

