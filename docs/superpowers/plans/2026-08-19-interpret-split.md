# 해석 분할 + 서버 배포 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 94초짜리 단일 LLM 호출을 "요약 1회 + 카드 N회 병렬"로 쪼개 첫 결과를 10초 안에 띄우고, 해석 서버를 실제로 배포한다.

**Architecture:** `shared/interpret` 에 요청 종류를 둘 추가한다 — `summary`(한 단어 + 한 문장)와 `card`(섹션 하나의 본문). 둘은 기존 전체 리포트 요청과 **system 블록·팩트팩·지식카드 접두를 글자 단위로 공유**하고 user 턴 **끝**의 지시문만 다르다. 프롬프트 캐시가 프리픽스 일치이므로 이 순서가 원가를 결정한다. 검증기는 임의 텍스트에 도는 부분(금지표현·지어낸 간지·지어낸 수치)을 공통 함수로 뽑아 셋이 나눠 쓴다. 기존 전체 리포트 경로는 **손대지 않는다** — 폴백이자 회귀 기준선이다.

**Tech Stack:** TypeScript 6(strict, `erasableSyntaxOnly`), zod 4, vitest, Anthropic SDK 0.75, esbuild, Caddy, systemd

**Spec:** `docs/superpowers/specs/2026-08-19-report-redesign-design.md`

## Global Constraints

- **계산·판정을 새로 만들지 않는다.** 렌더러·프롬프트는 엔진이 낸 값을 배치만 한다 (C00 §H).
- **프롬프트는 서버에서만 조립한다.** 클라이언트는 `InterpretationInput`(차트+프로필)만 보낸다.
- **시스템 프롬프트를 클라이언트 번들에 넣지 않는다.** 화면은 `shared/interpret/ui` 에서만 import.
- **캐시 브레이크포인트는 `cacheable: true` 인 마지막 system 블록에만** 건다.
- Anthropic 파라미터 금지 목록(전부 400): `temperature` / `top_p` / `top_k` / `thinking.budget_tokens` / 마지막 assistant 턴 prefill. `output_config.format` 이 받는 키는 `type` 과 `schema` **뿐**이다.
- 새 파일은 기존 관례를 따른다 — 왜 그렇게 했는지를 주석에 남기고, 표를 코드에 다시 적지 않는다.
- 검증 순서: `npm test` → `npm run typecheck` → `npm run lint` → `npm run build` → `npm run ui-smoke`.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `app/src/shared/interpret/guard.ts` (수정) | `verifyAuthoredText()` 추출. 기존 `verifyInterpretation` 은 이를 호출 |
| `app/src/shared/interpret/schema.ts` (수정) | `SUMMARY_*` · `CARD_*` 스키마·상수 추가 |
| `app/src/shared/interpret/buildRequest.ts` (수정) | `buildSummaryRequest` · `buildCardRequest` 추가 |
| `app/src/shared/interpret/prompt.ts` (수정) | 작업별 **꼬리** 지시문 (`summaryTail` · `cardTail`) |
| `server/src/interpret.ts` (수정) | `interpretSummary` · `interpretCard` 오케스트레이션 |
| `server/src/main.ts` (수정) | 라우트 둘 추가 |
| `server/scripts/smoke.ts` (수정) | 분할 호출 실측 |

---

### Task 1: 검증기 공통화

기존 `verifyInterpretation` 의 ③④⑤(금지 표현·지어낸 간지·지어낸 수치)는 **임의 텍스트**에 도는 검사다. 요약·카드도 같은 규율이 필요하므로 먼저 뽑아낸다. 동작은 바뀌지 않는다.

**Files:**
- Modify: `app/src/shared/interpret/guard.ts`
- Test: `app/src/shared/interpret/guard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AuthoredGuardContext {
    readonly factPack: FactPack;
    readonly knowledgeCardIds: readonly string[];
  }
  export function verifyAuthoredText(
    text: string,
    usedCardIds: readonly string[],
    ctx: AuthoredGuardContext,
  ): readonly VerificationFailure[];
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/shared/interpret/guard.test.ts` 끝에 추가:

```ts
describe('verifyAuthoredText — 임의 텍스트 공통 검사', () => {
  const ctx = { factPack: FIXTURE_FACT_PACK, knowledgeCardIds: ['ilgan:庚'] }

  it('깨끗한 텍스트는 실패가 없다', () => {
    expect(verifyAuthoredText('방향을 정하면 끝까지 갑니다.', ['ilgan:庚'], ctx)).toEqual([])
  })

  it('목록 밖 카드를 인용하면 UNKNOWN_CARD', () => {
    const f = verifyAuthoredText('문장.', ['ilgan:甲'], ctx)
    expect(f.map((x) => x.code)).toContain('UNKNOWN_CARD')
  })

  it('원국에 없는 간지를 쓰면 FABRICATED_GANJI', () => {
    const f = verifyAuthoredText('당신은 甲子 일주입니다.', [], ctx)
    expect(f.map((x) => x.code)).toContain('FABRICATED_GANJI')
  })

  it('팩트팩에 없는 수치를 쓰면 FABRICATED_NUMBER', () => {
    const f = verifyAuthoredText('신강지수는 99점입니다.', [], ctx)
    expect(f.map((x) => x.code)).toContain('FABRICATED_NUMBER')
  })
})
```

`FIXTURE_FACT_PACK` 대신 `guard.test.ts` 에 이미 있는 `fusionRequest()` 의 `factPack`·`knowledgeCardIds` 를 쓴다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd app && npx vitest run src/shared/interpret/guard.test.ts`
Expected: FAIL — `verifyAuthoredText is not exported`

- [ ] **Step 3: 함수를 뽑아낸다**

`guard.ts` 에 추가하고, `verifyInterpretation` 의 ②③④⑤ 블록을 이 호출로 교체한다:

```ts
/**
 * 서술 텍스트 공통 검사 — 리포트·요약·카드가 나눠 쓴다.
 *
 * 여기 있는 네 가지는 **출력 모양과 무관**하다: 인용한 카드가 목록 안인가, 금지 표현이 있는가,
 * 지어낸 간지·수치가 있는가. 출력 모양에 딸린 검사(섹션 구성 등)는 호출부가 따로 한다.
 */
export function verifyAuthoredText(
  text: string,
  usedCardIds: readonly string[],
  ctx: AuthoredGuardContext,
): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];

  const allowedCards = new Set(ctx.knowledgeCardIds);
  for (const id of usedCardIds) {
    if (!allowedCards.has(id)) failures.push({ code: 'UNKNOWN_CARD', detail: id });
  }

  failures.push(...findBannedPhrases(text));

  const allowedGanji = ganjiAllowList(ctx.factPack);
  const seenGanji = new Set<string>();
  for (const m of text.matchAll(GANJI_RE)) {
    const g = m[0];
    if (!allowedGanji.has(g) && !seenGanji.has(g)) {
      seenGanji.add(g);
      failures.push({ code: 'FABRICATED_GANJI', detail: g });
    }
  }

  const allowedNumbers = numberAllowList(ctx.factPack);
  const seenNumbers = new Set<string>();
  for (const m of text.matchAll(NUMERIC_CLAIM_RE)) {
    const n = m[1] ?? '';
    if (!allowedNumbers.has(n) && !seenNumbers.has(n)) {
      seenNumbers.add(n);
      failures.push({ code: 'FABRICATED_NUMBER', detail: m[0] });
    }
  }

  return failures;
}
```

`verifyInterpretation` 안에서는 ① 섹션 검사만 남기고 나머지를 이렇게 바꾼다:

```ts
  failures.push(
    ...verifyAuthoredText(authoredText(value), value.usedCardIds, {
      factPack: req.factPack,
      knowledgeCardIds: req.knowledgeCardIds,
    }),
  );
```

- [ ] **Step 4: 전체 테스트로 동작이 안 바뀌었는지 확인한다**

Run: `cd app && npm test`
Expected: PASS — 기존 guard 테스트 전건 통과(리팩터라 결과가 같아야 한다) + 새 4건

- [ ] **Step 5: 커밋**

```bash
git add app/src/shared/interpret/guard.ts app/src/shared/interpret/guard.test.ts
git commit -m "refactor(interpret): 서술 텍스트 공통 검사를 verifyAuthoredText 로 분리"
```

---

### Task 2: 요약 스키마와 검증

**Files:**
- Modify: `app/src/shared/interpret/schema.ts`
- Modify: `app/src/shared/interpret/guard.ts`
- Test: `app/src/shared/interpret/summary.test.ts` (신규)

**Interfaces:**
- Consumes: `verifyAuthoredText`, `AuthoredGuardContext` (Task 1)
- Produces:
  ```ts
  export const WORD_MIN = 2; export const WORD_MAX = 10;
  export const SENTENCE_MIN = 20; export const SENTENCE_MAX = 80;
  export interface SummaryValue {
    readonly word: string;
    readonly sentence: string;
    readonly usedCardIds: readonly string[];
  }
  export const SUMMARY_JSON_SCHEMA: { ... };
  export function verifySummary(raw: unknown, ctx: AuthoredGuardContext): 
    { readonly ok: true; readonly value: SummaryValue } |
    { readonly ok: false; readonly failures: readonly VerificationFailure[] };
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/shared/interpret/summary.test.ts`:

```ts
/**
 * 요약(한 단어 + 한 문장) 검증.
 *
 * 홈 화면 첫 인상을 만드는 값이라 **짧고 단정적**이다. 그만큼 지어낸 수치·간지가 섞이면
 * 눈에 잘 띄고 신뢰를 크게 깎는다 — 본문 카드와 같은 규율을 그대로 적용한다.
 */
import { describe, expect, it } from 'vitest'
import { verifySummary } from './guard'
import { WORD_MAX, WORD_MIN } from './schema'

const ok = { word: '버티는 사람', sentence: '한번 정한 방향으로는 곧게 가되, 시작 전에 오래 잽니다.', used_card_ids: ['ilgan:庚'] }

describe('verifySummary', () => {
  it('정상 응답을 통과시킨다', () => {
    const r = verifySummary(ok, FIXTURE_CTX)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.word).toBe('버티는 사람')
  })

  it('단어가 너무 길면 거부한다', () => {
    const r = verifySummary({ ...ok, word: '가'.repeat(WORD_MAX + 1) }, FIXTURE_CTX)
    expect(r.ok).toBe(false)
  })

  it('단어가 너무 짧으면 거부한다', () => {
    const r = verifySummary({ ...ok, word: '가'.repeat(WORD_MIN - 1) }, FIXTURE_CTX)
    expect(r.ok).toBe(false)
  })

  it('지어낸 수치를 거부한다', () => {
    const r = verifySummary({ ...ok, sentence: '신강지수 99점인 사람입니다. 방향을 정하면 끝까지 갑니다.' }, FIXTURE_CTX)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain('FABRICATED_NUMBER')
  })

  it('목록 밖 카드를 거부한다', () => {
    const r = verifySummary({ ...ok, used_card_ids: ['ilgan:甲'] }, FIXTURE_CTX)
    expect(r.ok).toBe(false)
  })
})
```

픽스처는 **기존 `./fixtures` 를 쓴다**(`SAMPLE_CHART` · `SAMPLE_PROFILE` · `SAMPLE_CARDS`).
새 픽스처 파일을 만들지 않는다 — 두 벌이 되면 한쪽만 고쳐진다. 테스트 상단에서 이렇게 만든다:

```ts
import { buildFactPack } from './factPack'
import { selectKnowledgeCards } from './retrieve'
import { SAMPLE_CARDS, SAMPLE_CHART, SAMPLE_PROFILE } from './fixtures'
import type { AuthoredGuardContext } from './guard'

const fact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion')
const picked = selectKnowledgeCards(fact, SAMPLE_CARDS)
const FIXTURE_CTX: AuthoredGuardContext = {
  factPack: fact,
  knowledgeCardIds: picked.map((c) => c.id),
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd app && npx vitest run src/shared/interpret/summary.test.ts`
Expected: FAIL — `verifySummary is not exported`

- [ ] **Step 3: 스키마와 검증기를 쓴다**

`schema.ts` 에 추가:

```ts
/** 홈 히어로의 한 단어. 너무 짧으면 의미가 없고 길면 제목이 두 줄로 깨진다. */
export const WORD_MIN = 2;
export const WORD_MAX = 10;
/** 한 문장. 카드 본문(40~1200)보다 훨씬 짧게 강제해야 "요약"이 된다. */
export const SENTENCE_MIN = 20;
export const SENTENCE_MAX = 80;

export const rawSummarySchema = z.object({
  word: z.string().min(WORD_MIN).max(WORD_MAX),
  sentence: z.string().min(SENTENCE_MIN).max(SENTENCE_MAX),
  used_card_ids: z.array(z.string().min(1)).min(1).max(USED_CARDS_MAX),
});

export type RawSummary = z.infer<typeof rawSummarySchema>;

export interface SummaryValue {
  readonly word: string;
  readonly sentence: string;
  readonly usedCardIds: readonly string[];
}

export function toSummary(raw: RawSummary): SummaryValue {
  return { word: raw.word, sentence: raw.sentence, usedCardIds: raw.used_card_ids };
}

/**
 * 구조화 출력 스키마.
 * ⚠ Claude 구조화 출력은 `minLength`/`maxLength` 를 지원하지 않는다 — 길이는 zod 가 사후 검증한다.
 */
export const SUMMARY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    word: { type: 'string', description: `이 사람을 한 단어로. ${WORD_MIN}~${WORD_MAX}자.` },
    sentence: { type: 'string', description: `한 문장 요약. ${SENTENCE_MIN}~${SENTENCE_MAX}자.` },
    used_card_ids: { type: 'array', items: { type: 'string' }, description: '근거로 쓴 카드 id' },
  },
  required: ['word', 'sentence', 'used_card_ids'],
  additionalProperties: false,
} as const;
```

`guard.ts` 에 추가:

```ts
export type SummaryVerifyResult =
  | { readonly ok: true; readonly value: SummaryValue }
  | { readonly ok: false; readonly failures: readonly VerificationFailure[] };

export function verifySummary(raw: unknown, ctx: AuthoredGuardContext): SummaryVerifyResult {
  const parsed = rawSummarySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      failures: parsed.error.issues.map((i) => ({
        code: 'SCHEMA' as const,
        detail: `${i.path.join('.') || '(root)'}: ${i.message}`,
      })),
    };
  }
  const value = toSummary(parsed.data);
  const failures = verifyAuthoredText(`${value.word}\n${value.sentence}`, value.usedCardIds, ctx);
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, value };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd app && npx vitest run src/shared/interpret/summary.test.ts && npm run typecheck`
Expected: PASS 5건, typecheck 통과

- [ ] **Step 5: 커밋**

```bash
git add app/src/shared/interpret/schema.ts app/src/shared/interpret/guard.ts app/src/shared/interpret/summary.test.ts app/src/shared/interpret/_fixtures.ts
git commit -m "feat(interpret): 요약(한 단어+한 문장) 스키마와 검증 추가"
```

---

### Task 3: 카드 스키마와 검증

**Files:**
- Modify: `app/src/shared/interpret/schema.ts`
- Modify: `app/src/shared/interpret/guard.ts`
- Test: `app/src/shared/interpret/card.test.ts` (신규)

**Interfaces:**
- Consumes: `verifyAuthoredText`, `AuthoredGuardContext`, `FIXTURE_CTX`
- Produces:
  ```ts
  export interface CardValue {
    readonly id: SectionId;
    readonly body: string;
    readonly usedCardIds: readonly string[];
  }
  export const CARD_JSON_SCHEMA: { ... };
  export function verifyCard(raw: unknown, sectionId: SectionId, ctx: AuthoredGuardContext):
    { readonly ok: true; readonly value: CardValue } |
    { readonly ok: false; readonly failures: readonly VerificationFailure[] };
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`app/src/shared/interpret/card.test.ts`:

```ts
/**
 * 카드 한 장 검증.
 *
 * 전체 리포트와 달리 **섹션 id 를 응답에 넣지 않는다** — 어느 섹션을 요청했는지는 호출부가 알고,
 * 모델이 그걸 되돌려주게 하면 틀린 값을 돌려줄 여지만 생긴다(검증할 대상이 하나 늘 뿐이다).
 */
import { describe, expect, it } from 'vitest'
import { verifyCard } from './guard'
import { BODY_MAX, BODY_MIN } from './schema'

const body = '일간은 경금이고, 방향을 정하면 끝까지 가는 편입니다. 다만 시작 전에 오래 재는 습관이 있습니다.'
const ok = { body, used_card_ids: ['ilgan:庚'] }

describe('verifyCard', () => {
  it('정상 응답을 통과시키고 요청한 섹션 id 를 붙인다', () => {
    const r = verifyCard(ok, 'saju', FIXTURE_CTX)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.id).toBe('saju')
      expect(r.value.body).toBe(body)
    }
  })

  it('본문이 너무 짧으면 거부한다', () => {
    expect(verifyCard({ ...ok, body: '가'.repeat(BODY_MIN - 1) }, 'saju', FIXTURE_CTX).ok).toBe(false)
  })

  it('본문이 너무 길면 거부한다', () => {
    expect(verifyCard({ ...ok, body: '가'.repeat(BODY_MAX + 1) }, 'saju', FIXTURE_CTX).ok).toBe(false)
  })

  it('지어낸 간지를 거부한다', () => {
    const r = verifyCard({ ...ok, body: `${body} 甲子 일주라서 그렇습니다.` }, 'saju', FIXTURE_CTX)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.failures.map((f) => f.code)).toContain('FABRICATED_GANJI')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd app && npx vitest run src/shared/interpret/card.test.ts`
Expected: FAIL — `verifyCard is not exported`

- [ ] **Step 3: 스키마와 검증기를 쓴다**

`schema.ts`:

```ts
export const rawCardSchema = z.object({
  body: z.string().min(BODY_MIN).max(BODY_MAX),
  used_card_ids: z.array(z.string().min(1)).min(1).max(USED_CARDS_MAX),
});
export type RawCard = z.infer<typeof rawCardSchema>;

export interface CardValue {
  readonly id: SectionId;
  readonly body: string;
  readonly usedCardIds: readonly string[];
}

export const CARD_JSON_SCHEMA = {
  type: 'object',
  properties: {
    body: { type: 'string', description: `이 섹션의 본문. ${BODY_MIN}~${BODY_MAX}자.` },
    used_card_ids: { type: 'array', items: { type: 'string' }, description: '근거로 쓴 카드 id' },
  },
  required: ['body', 'used_card_ids'],
  additionalProperties: false,
} as const;
```

`guard.ts`:

```ts
export type CardVerifyResult =
  | { readonly ok: true; readonly value: CardValue }
  | { readonly ok: false; readonly failures: readonly VerificationFailure[] };

export function verifyCard(
  raw: unknown,
  sectionId: SectionId,
  ctx: AuthoredGuardContext,
): CardVerifyResult {
  const parsed = rawCardSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      failures: parsed.error.issues.map((i) => ({
        code: 'SCHEMA' as const,
        detail: `${i.path.join('.') || '(root)'}: ${i.message}`,
      })),
    };
  }
  const failures = verifyAuthoredText(parsed.data.body, parsed.data.used_card_ids, ctx);
  if (failures.length > 0) return { ok: false, failures };
  return {
    ok: true,
    value: { id: sectionId, body: parsed.data.body, usedCardIds: parsed.data.used_card_ids },
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd app && npx vitest run src/shared/interpret/card.test.ts && npm run typecheck`
Expected: PASS 4건

- [ ] **Step 5: 커밋**

```bash
git add app/src/shared/interpret/schema.ts app/src/shared/interpret/guard.ts app/src/shared/interpret/card.test.ts
git commit -m "feat(interpret): 카드 한 장 스키마와 검증 추가"
```

---

### Task 4: 요청 조립 — 캐시 접두를 공유한다

이 계획의 **원가가 여기서 결정된다.** 세 종류 요청이 system 블록과 user 턴 앞부분(팩트팩·카드)을 글자 단위로 공유하고, 지시문만 **끝**에 붙어야 프롬프트 캐시가 산다.

**Files:**
- Modify: `app/src/shared/interpret/prompt.ts`
- Modify: `app/src/shared/interpret/buildRequest.ts`
- Test: `app/src/shared/interpret/buildRequest.test.ts`

**Interfaces:**
- Consumes: `SUMMARY_JSON_SCHEMA`, `CARD_JSON_SCHEMA` (Task 2·3)
- Produces:
  ```ts
  export const SUMMARY_ROUTING: ModelRouting;   // opus-5 / low / maxTokens 1500
  export const CARD_ROUTING: ModelRouting;      // opus-5 / medium / maxTokens 3000
  export function buildSummaryRequest(chart, profile, knowledge): InterpretationRequest;
  export function buildCardRequest(chart, profile, knowledge, sectionId): InterpretationRequest;
  ```
  두 함수 모두 기존 `InterpretationRequest` 를 돌려준다. 새로 추가되는 필드는 없다 —
  `outputJsonSchema` 와 `userText` 꼬리, `routing` 만 다르다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`buildRequest.test.ts` 끝에 추가:

```ts
describe('분할 요청 — 프롬프트 캐시 접두 공유', () => {
  const args = [CHART, PROFILE, CARDS] as const

  it('요약과 카드가 같은 system 블록을 쓴다', () => {
    const s = buildSummaryRequest(...args)
    const c = buildCardRequest(...args, 'saju')
    expect(s.system).toEqual(c.system)
  })

  /**
   * 캐시는 프리픽스 일치다. 지시문이 앞에 붙으면 두 요청의 접두가 갈려 캐시가 통째로 깨진다.
   * 이 테스트가 깨지면 원가가 조용히 몇 배로 뛴다 — 실패 시 반드시 꼬리로 되돌릴 것.
   */
  it('user 턴의 공통 접두가 글자 단위로 같다', () => {
    const s = buildSummaryRequest(...args)
    const c = buildCardRequest(...args, 'saju')
    const prefixLen = Math.min(s.userText.length, c.userText.length)
    let common = 0
    while (common < prefixLen && s.userText[common] === c.userText[common]) common += 1
    // 팩트팩 + 카드 목록이 통째로 공통이어야 한다. 지시문만 갈리므로 공통 접두가 매우 길다.
    expect(common).toBeGreaterThan(Math.min(s.userText.length, c.userText.length) * 0.9)
  })

  it('카드 요청은 요청한 섹션만 지시한다', () => {
    const c = buildCardRequest(...args, 'zodiac')
    expect(c.userText).toContain('zodiac')
    expect(c.sections).toEqual(['zodiac'])
  })

  it('요약은 카드보다 짧게 답하도록 라우팅된다', () => {
    expect(buildSummaryRequest(...args).routing.maxTokens)
      .toBeLessThan(buildCardRequest(...args, 'saju').routing.maxTokens)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd app && npx vitest run src/shared/interpret/buildRequest.test.ts`
Expected: FAIL — `buildSummaryRequest is not exported`

- [ ] **Step 3: 조립기를 쓴다**

`prompt.ts` 에 꼬리 지시문을 추가한다:

```ts
/**
 * 작업별 **꼬리** 지시문.
 *
 * ⚠ 반드시 user 턴 **맨 끝**에 붙인다. 앞에 붙이면 프롬프트 캐시 접두가 갈려
 *   두 번째 호출부터 입력이 전액 과금된다(`buildRequest.test.ts` 가 이를 고정한다).
 */
export function summaryTail(): string {
  return [
    '',
    '# 이번 작업: 요약',
    '위 사실만으로 이 사람을 한 단어와 한 문장으로 요약한다.',
    '- word: 이 사람을 한 단어로. 명사구. 2~10자.',
    '- sentence: 한 문장. 20~80자. 단정하되 과장하지 않는다.',
    '- 수치·간지를 문장에 넣지 않는다. 요약은 숫자를 말하는 자리가 아니다.',
  ].join('\n');
}

export function cardTail(sectionId: SectionId): string {
  return [
    '',
    '# 이번 작업: 카드 한 장',
    `대상 섹션: ${sectionId} — ${SECTION_TITLES[sectionId]}`,
    '이 섹션 하나만 쓴다. 다른 섹션 내용을 끌어오지 않는다.',
    '- body: 40~1200자.',
    '- used_card_ids: 실제로 근거로 쓴 카드만 적는다.',
  ].join('\n');
}
```

`buildRequest.ts` 에 추가한다. 기존 `buildInterpretationRequest` 의 공통 부분(팩트팩·카드 렌더·시스템 블록)을 내부 함수로 뽑아 셋이 나눠 쓴다:

```ts
export const SUMMARY_ROUTING: ModelRouting = {
  model: 'claude-opus-5', maxTokens: 1500, thinking: { type: 'adaptive' }, effort: 'low',
};
export const CARD_ROUTING: ModelRouting = {
  model: 'claude-opus-5', maxTokens: 3000, thinking: { type: 'adaptive' }, effort: 'medium',
};

/** 세 요청이 공유하는 접두. 여기서 만든 문자열 뒤에 작업별 꼬리만 붙는다. */
function commonUserPrefix(factPack: FactPack, knowledge: readonly KnowledgeCard[]): string {
  return [
    '# fact_pack',
    '계산 엔진이 확정한 사실이다. 값을 바꾸지 않는다.',
    canonicalJson(factPack),
    '',
    '# knowledge_cards',
    '아래 카드에 적힌 내용만 해석 근거로 쓴다.',
    renderCards(knowledge),
  ].join('\n');
}

export function buildSummaryRequest(
  chart: ChartLike, profile: UserProfile, knowledge: readonly KnowledgeCard[],
): InterpretationRequest {
  const { factPack, ids } = prepare(chart, profile, knowledge, 'fusion');
  return {
    v: 1, kind: 'fusion', promptVersion: PROMPT_VERSION, engineVersion: chart.engineVersion,
    routing: SUMMARY_ROUTING, system: buildSystemBlocks(),
    userText: commonUserPrefix(factPack, knowledge) + summaryTail(),
    outputJsonSchema: SUMMARY_JSON_SCHEMA as never,
    sections: [], knowledgeCardIds: ids, factPack,
    narrativeKey: `${narrativeKeyOf(chart, profile, 'fusion', ids)}|summary`,
  };
}

export function buildCardRequest(
  chart: ChartLike, profile: UserProfile, knowledge: readonly KnowledgeCard[], sectionId: SectionId,
): InterpretationRequest {
  const { factPack, ids } = prepare(chart, profile, knowledge, 'fusion');
  return {
    v: 1, kind: 'fusion', promptVersion: PROMPT_VERSION, engineVersion: chart.engineVersion,
    routing: CARD_ROUTING, system: buildSystemBlocks(),
    userText: commonUserPrefix(factPack, knowledge) + cardTail(sectionId),
    outputJsonSchema: CARD_JSON_SCHEMA as never,
    sections: [sectionId], knowledgeCardIds: ids, factPack,
    narrativeKey: `${narrativeKeyOf(chart, profile, 'fusion', ids)}|card:${sectionId}`,
  };
}
```

`prepare()` 는 기존 `buildInterpretationRequest` 앞부분(라우팅 확인·카드 0장·중복 id 검사·팩트팩 생성)을 그대로 뽑아낸 내부 함수다. **기존 함수의 동작을 바꾸지 않는다** — 같은 검사를 같은 순서로 한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd app && npm test && npm run typecheck && npm run lint`
Expected: 전건 PASS. 기존 `buildInterpretationRequest` 테스트가 하나도 안 깨져야 한다

- [ ] **Step 5: 커밋**

```bash
git add app/src/shared/interpret/prompt.ts app/src/shared/interpret/buildRequest.ts app/src/shared/interpret/buildRequest.test.ts app/src/shared/interpret/index.ts
git commit -m "feat(interpret): 요약·카드 요청 조립 (캐시 접두 공유)"
```

---

### Task 5: 서버 오케스트레이션과 라우트

**Files:**
- Modify: `server/src/interpret.ts`
- Modify: `server/src/main.ts`
- Test: `server/test/interpret.split.test.ts` (신규)

**Interfaces:**
- Consumes: `buildSummaryRequest`, `buildCardRequest`, `verifySummary`, `verifyCard`
- Produces:
  ```ts
  export async function interpretSummary(input: InterpretInput, deps: InterpretDeps): Promise<SummaryResult>;
  export async function interpretCard(input: InterpretInput, sectionId: SectionId, deps: InterpretDeps): Promise<CardResult>;
  ```
  라우트: `POST /api/interpret/summary`, `POST /api/interpret/card` (body 에 `sectionId`)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`server/test/interpret.split.test.ts`:

```ts
/**
 * 분할 호출 오케스트레이션.
 *
 * 전송(`Caller`)만 갈아 끼운다. HTTP 를 흉내 내지 않는다 — 기존 interpret 테스트와 같은 방식.
 */
import { describe, expect, it } from 'vitest'
import { interpretCard, interpretSummary } from '../src/interpret'
import { makeDeps, CHART, PROFILE } from './helpers'

describe('interpretSummary', () => {
  it('정상 응답을 ok 로 돌려준다', async () => {
    const deps = makeDeps({ word: '버티는 사람', sentence: '한번 정한 방향으로는 곧게 가되, 시작 전에 오래 잽니다.', used_card_ids: ['ilgan:庚'] })
    const r = await interpretSummary({ kind: 'fusion', chart: CHART, profile: PROFILE }, deps)
    expect(r.status).toBe('ok')
  })

  it('두 번째 호출은 캐시에서 나온다', async () => {
    const deps = makeDeps({ word: '버티는 사람', sentence: '한번 정한 방향으로는 곧게 가되, 시작 전에 오래 잽니다.', used_card_ids: ['ilgan:庚'] })
    const input = { kind: 'fusion' as const, chart: CHART, profile: PROFILE }
    await interpretSummary(input, deps)
    const second = await interpretSummary(input, deps)
    expect(second.status === 'ok' && second.source).toBe('cache')
  })
})

describe('interpretCard', () => {
  it('요청한 섹션 id 가 결과에 붙는다', async () => {
    const deps = makeDeps({ body: '가'.repeat(80), used_card_ids: ['ilgan:庚'] })
    const r = await interpretCard({ kind: 'fusion', chart: CHART, profile: PROFILE }, 'zodiac', deps)
    expect(r.status === 'ok' && r.value.id).toBe('zodiac')
  })

  /** 카드는 서로 다른 캐시 키를 써야 한다 — 안 그러면 모든 섹션이 같은 글을 받는다. */
  it('섹션이 다르면 캐시가 갈린다', async () => {
    const deps = makeDeps({ body: '가'.repeat(80), used_card_ids: ['ilgan:庚'] })
    const input = { kind: 'fusion' as const, chart: CHART, profile: PROFILE }
    await interpretCard(input, 'saju', deps)
    const other = await interpretCard(input, 'zodiac', deps)
    expect(other.status === 'ok' && other.source).toBe('llm')
  })
})
```

`server/test/helpers.ts` 가 없으면 기존 `server/test/interpret.test.ts` 의 목 전송·픽스처를 그 파일로 옮겨 공유한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd server && npx vitest run test/interpret.split.test.ts`
Expected: FAIL — `interpretSummary is not exported`

- [ ] **Step 3: 오케스트레이션을 쓴다**

`server/src/interpret.ts` 에 추가한다. 기존 `interpret()` 의 흐름(캐시 조회 → single-flight → 호출 → 검증 → 캐시 저장)을 그대로 따르되, 조립기와 검증기만 갈아 끼운다. **캐시 키는 요청의 `narrativeKey` 를 그대로 쓴다** — Task 4 에서 `|summary` · `|card:<id>` 접미가 이미 붙어 있다.

`server/src/main.ts` 에 라우트 둘을 추가한다. 기존 `/api/interpret` 은 **그대로 둔다**(폴백 경로).

- [ ] **Step 4: 통과를 확인한다**

Run: `cd server && npx vitest run && npx tsc -p tsconfig.json --noEmit`
Expected: 기존 90건 + 새 4건 PASS

- [ ] **Step 5: 커밋**

```bash
git add server/src/interpret.ts server/src/main.ts server/test/
git commit -m "feat(server): 요약·카드 분할 엔드포인트"
```

---

### Task 6: 실호출로 지연과 원가를 잰다

**설계의 핵심 가정을 여기서 검증한다.** "쪼개면 첫 결과가 10초, 원가는 비슷하다"가 사실이 아니면 설계를 되돌려야 한다.

**Files:**
- Modify: `server/scripts/smoke.ts`

- [ ] **Step 1: 스모크를 확장한다**

`--split` 플래그를 추가해 다음을 순서대로 재고 표로 출력한다:

1. `summary` 1회 — 소요(ms), 입력/출력 토큰, **cacheWrite 토큰**
2. `card` 6회 **병렬** — 각 소요, 입력/출력 토큰, **cacheRead 토큰**
3. 합계 원가(원) 와 **분할 전 262원** 비교
4. 첫 결과까지 걸린 시간(= summary 소요)

`bundle_list` 식 표 출력은 `model-ab.ts` 의 요약표 포맷을 그대로 쓴다.

- [ ] **Step 2: 실제로 돌린다**

Run: `cd server && npm run build && ANTHROPIC_API_KEY=... npm run smoke -- --split`
Expected: summary 10초 이내, card 병렬 총 30초 이내, cacheRead 토큰이 두 번째 호출부터 0 이 아님

- [ ] **Step 3: 결과를 문서에 적는다**

`app/AGENTS.md` 의 LLM 항목에 실측값을 적는다 — 분할 전(94초·262원)과 분할 후를 나란히. **추정치를 적지 않는다.**

- [ ] **Step 4: 가정이 깨졌으면 멈춘다**

cacheRead 가 0 이면 접두가 갈린 것이다. Task 4 의 캐시 테스트가 통과하는데도 0 이면 `system` 블록의 `cache_control` 위치를 확인한다(마지막 `cacheable` 블록 하나에만).
**원가가 분할 전의 1.5배를 넘으면 진행하지 말고 보고한다.**

- [ ] **Step 5: 커밋**

```bash
git add server/scripts/smoke.ts app/AGENTS.md
git commit -m "test(server): 분할 호출 지연·원가 실측"
```

---

### Task 7: 서버 배포

**Files:**
- Modify: `server/README.md` (실제 배포 결과 반영)
- 서버: `/etc/systemd/system/sajumix-interpret.service`, `/etc/sajumix/interpret.env`, `/etc/caddy/Caddyfile`

**공유 서버 규율:** blend(156.228.4.156)에는 다른 서비스가 여럿 돈다. Caddyfile 은 **백업 → 블록 추가 → `caddy validate` → `reload`** 순서를 지키고, 기존 블록은 한 줄도 건드리지 않는다.

- [ ] **Step 1: 서버로 코드를 올리고 빌드한다**

```bash
ssh blend 'sudo mkdir -p /srv/sajumix && sudo chown ubuntu:ubuntu /srv/sajumix'
rsync -az --exclude node_modules --exclude dist server/ app/ blend:/srv/sajumix/
ssh blend 'cd /srv/sajumix/server && npm ci --omit=dev && npm run build'
```

- [ ] **Step 2: 키 파일과 유닛을 만든다**

`/etc/sajumix/interpret.env` (0600, root:root) 에 `ANTHROPIC_API_KEY=...`.
유닛 파일은 `server/README.md` §배포의 내용을 그대로 쓴다.

- [ ] **Step 3: Caddy 블록을 추가한다**

`sajumix.kodekorea.kr` 블록 안에 API 경로만 프록시한다 — 약관 정적 파일 서빙을 깨지 않도록 `handle /api/*` 로 감싼다:

```
	handle /api/* {
		reverse_proxy 127.0.0.1:8787
	}
```

`sudo caddy validate` 통과 후 `reload`. 기존 도메인 3개가 여전히 200 인지 확인한다.

- [ ] **Step 4: 밖에서 확인한다**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://sajumix.kodekorea.kr/api/health
curl -s -o /dev/null -w '%{http_code}\n' https://sajumix.kodekorea.kr/terms.html
```
Expected: 둘 다 200

- [ ] **Step 5: 커밋**

```bash
git add server/README.md
git commit -m "docs(server): 배포 실행 결과 반영"
```

---

### Task 8: 개인정보처리방침 개정 — AI 연결과 같은 배포에

**이 작업 없이 앱이 서버를 부르면 방침이 거짓이 된다.** 현재 방침에는 "저장할 서버 자체가 없습니다", "회사의 서버로 전송되지 않습니다"가 적혀 있다.

**Files:**
- Modify: `legal/privacy.html`
- Modify: `legal/consent.html`

- [ ] **Step 1: 무엇이 실제로 나가는지 확정한다**

`FactPack` 을 읽고 서버로 전송되는 항목을 **정확히** 나열한다. 확인된 사실: 원본 생년월일·이름·연락처는 팩트팩에 **없고**, 간지 8자·오행 점수·십신·신살·별자리·성별·MBTI·혈액형이 들어간다.

- [ ] **Step 2: 방침 3·5조를 고친다**

3조(처리 장소): "단말에서만 처리" → 계산은 단말, **해설 문장 생성 시 파생 정보가 서버로 전송**됨을 명시.
5조(위탁·국외이전): "위탁하지 않습니다" → **Anthropic(미국)** 위탁을 명시. 이전 항목·국가·목적·보유기간을 표로.

- [ ] **Step 3: 콘솔에 국외 이전 동의문을 등록한다**

앱인토스 콘솔 → 토스로그인 → 국외 이전 동의문 `설정` 으로 전환하고 이전받는 자·국가·연락처를 채운다. **MCP 로는 못 한다 — 콘솔 웹에서 사람이 한다.**

- [ ] **Step 4: 배포하고 확인한다**

```bash
scp legal/privacy.html legal/consent.html blend:/var/www/sajumix/
curl -s https://sajumix.kodekorea.kr/privacy.html | grep -c "Anthropic"
```
Expected: 1 이상

- [ ] **Step 5: 커밋**

```bash
git add legal/
git commit -m "docs(legal): AI 해석 서버 연결에 따른 처리방침 개정"
```

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 담당 |
|---|---|
| §5 호출 분할 (summary/card) | Task 2·3·4·5 |
| §5 프롬프트 캐싱으로 원가 억제 | Task 4(접두 공유 테스트) · Task 6(실측) |
| §5 카드 단위 폴백 | Task 5 (카드별 독립 결과) |
| §5 서버 배포 | Task 7 |
| §10 방침 개정 | Task 8 |
| §5 `ask` 스트리밍 | **이 계획 범위 밖** — 정책 검토 후 별도 계획 |
| §4·§6 화면·에셋 | 별도 계획 (B·C) |

**타입 일관성** — `AuthoredGuardContext`(T1) → `verifySummary`(T2) · `verifyCard`(T3) 가 같은 이름으로 소비한다. `SummaryValue`·`CardValue` 는 `schema.ts` 에서 한 번만 정의하고 `guard.ts` 가 import 한다.

**미해결 의존** — Task 5 의 `server/test/helpers.ts` 는 기존 `server/test/interpret.test.ts` 에서 목 전송·픽스처를 옮겨 만든다. 없으면 Task 5 Step 1 에서 먼저 만든다.
