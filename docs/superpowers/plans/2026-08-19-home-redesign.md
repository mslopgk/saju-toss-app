# 홈 화면 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 문단 11개가 쌓인 결과 화면을 "오행 오브젝트 + 한 단어 + 오행 분포"의 홈과 카드형 깊이읽기로 쪼개고, 분할 LLM 호출을 앱에 배선한다.

**Architecture:** `App.tsx` 의 화면 유니온에 `home`·`detail` 을 추가한다. 홈은 **AI 없이도 채워진다** — 규칙 기반 요약(`renderTemplateSummary`)이 먼저 그려지고 AI 요약이 도착하면 갈아끼운다. 기존 `ResultPage` 는 깊이읽기로 이름을 바꿔 그대로 산다(폴백이자 회귀 기준선).

**Spec:** `docs/superpowers/specs/2026-08-19-report-redesign-design.md` §3·§4

## Global Constraints

- 화면은 엔진 값을 **배치만** 한다. 정렬·임계값 판정·가중합을 하지 않는다 (C00 §H).
- 오행 분포 막대는 `elementScores` 를 그대로 쓴다. 합 80 은 엔진이 보장한다.
- AI 가 없거나 실패해도 **모든 화면이 채워진다.** 서버는 덧칠이지 전제가 아니다.
- `shared/assets` 가 `null` 을 주면 그림 없이 텍스트만 그린다.
- 검증: `npm test` → `typecheck` → `lint` → `build` → `ui-smoke`.

---

### Task 1: 규칙 기반 요약 — AI 없이도 홈이 채워진다

**Files:** `app/src/shared/interpret/template.ts`, `template.test.ts`

**Produces:** `renderTemplateSummary(factPack): SummaryValue`

한 단어는 **일간 오행 + 신강신약**에서, 한 문장은 기존 템플릿 어휘에서 만든다. 새 판정을 만들지 않는다 —
두 값 다 엔진이 이미 확정한 것이다. 결과는 `verifySummary` 를 통과해야 한다(길이·수치 규율이 같다).

- [ ] Step 1: 테스트 — 다섯 오행 × 신강/신약 조합에서 길이 규격을 지키고 `verifySummary` 를 통과한다
- [ ] Step 2: 실패 확인
- [ ] Step 3: 구현
- [ ] Step 4: 통과 확인
- [ ] Step 5: 커밋

### Task 2: 홈 화면

**Files:** `app/src/pages/HomePage.tsx`(신설), `HomePage.test.tsx`

세 덩어리: 오행 오브젝트 → 한 단어·한 문장 → 오행 분포 막대 5개. 배경은 같은 오행의 backdrop.
막대는 `elementScores` 값과 `elementPercent` 를 함께 보여 준다(둘 다 팩트팩 값이다).

- [ ] Step 1~5: 테스트 → 구현 → 검증 → 커밋

### Task 3: 깊이읽기 화면

**Files:** `app/src/pages/DetailPage.tsx`(= 기존 ResultPage 이동), `App.tsx`

섹션 하나 = 카드 하나. 접힌 상태에서 제목 + 첫 줄, 탭하면 본문·근거 카드가 펼쳐진다.
`SECTION_IDS` 가 정본이므로 섹션이 늘면 카드도 따라간다.

- [ ] Step 1~5

### Task 4: 화면 흐름

**Files:** `app/src/App.tsx`

`onboarding → home → detail` 로 넓힌다. 뒤로 가기는 `home` 으로 모인다.

- [ ] Step 1~5

### Task 5: AI 배선

**Files:** `app/src/features/report/useHomeSummary.ts`(신설), `interpretationClient.ts`

요약을 먼저 부르고(5.8초), 도착하면 규칙 기반 값을 갈아끼운다. 실패하면 규칙 기반 그대로.
카드는 깊이읽기에 들어갈 때 부른다 — 홈만 보고 나가는 사용자에게 6번 과금하지 않는다.

- [ ] Step 1~5

### Task 6: UI 스모크 확장

**Files:** `app/scripts/ui-smoke.mjs`

홈이 오행 5종 전부에서 렌더되는지, 카드가 펼쳐지는지, AI 없이도 화면이 차는지.

- [ ] Step 1~3
