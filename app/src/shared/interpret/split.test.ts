/**
 * 분할 응답 검증 — 요약(한 단어 + 한 문장)과 카드 한 장.
 *
 * 전체 리포트 검증(`guard.test.ts`)과 나누는 이유: 이 둘은 **섹션 배열이 없다.** 기존 검증기는
 * 섹션 구성이 요청과 일치하는지를 보므로 그대로 쓸 수 없고, 대신 공통 검사(`verifyAuthoredText`)
 * 위에 각자의 스키마 검사를 얹는다. 여기서 고정하는 것은 **짧은 출력에서도 규율이 같다**는 것이다.
 */
import { describe, expect, it } from 'vitest';
import { buildFactPack, ganjiAllowList } from './factPack';
import { selectKnowledgeCards } from './retrieve';
import { verifyCard, verifySummary, type AuthoredGuardContext } from './guard';
import {
  buildCardRequest,
  buildInterpretationRequest,
  buildSummaryRequest,
} from './buildRequest';
import {
  BODY_MAX,
  BODY_MIN,
  CARD_JSON_SCHEMA,
  SENTENCE_MAX,
  SENTENCE_MIN,
  SUMMARY_JSON_SCHEMA,
  WORD_MAX,
  WORD_MIN,
} from './schema';
import { toMessagesApiParams } from './client';
import { SAMPLE_CARDS, SAMPLE_CHART, SAMPLE_PROFILE } from './fixtures';

const fact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion');
const picked = selectKnowledgeCards(fact, SAMPLE_CARDS);
const ctx: AuthoredGuardContext = {
  factPack: fact,
  knowledgeCardIds: picked.map((c) => c.id),
};
const allowedCard = ctx.knowledgeCardIds[0] ?? '';

/** 픽스처 차트에 없는 간지 하나. 환각 경로를 만들 때 쓴다. */
const absentGanji =
  ['甲子', '乙丑', '丙寅', '丁卯', '戊辰'].find((g) => !ganjiAllowList(fact).has(g)) ?? '';

describe('verifySummary', () => {
  const ok = {
    word: '버티는 사람',
    sentence: '한번 정한 방향으로는 곧게 가되, 시작 전에 오래 재는 편입니다.',
    used_card_ids: [allowedCard],
  };

  it('정상 응답을 통과시킨다', () => {
    const result = verifySummary(ok, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.word).toBe('버티는 사람');
      expect(result.value.usedCardIds).toEqual([allowedCard]);
    }
  });

  it.each([
    ['단어가 너무 길면', { word: '가'.repeat(WORD_MAX + 1) }],
    ['단어가 너무 짧으면', { word: '가'.repeat(WORD_MIN - 1) }],
    ['문장이 너무 짧으면', { sentence: '가'.repeat(SENTENCE_MIN - 1) }],
    ['문장이 너무 길면', { sentence: '가'.repeat(SENTENCE_MAX + 1) }],
  ])('%s 거부한다', (_name, patch) => {
    expect(verifySummary({ ...ok, ...patch }, ctx).ok).toBe(false);
  });

  /**
   * 요약은 숫자를 말하는 자리가 아니다. 그래도 모델이 "신강지수 80점" 같은 값을 넣을 수 있는데,
   * **팩트팩에 있는 값이면 통과시킨다** — 거짓이 아니기 때문이다. 막는 것은 지어낸 값뿐이다.
   */
  it('지어낸 수치를 거부한다', () => {
    const result = verifySummary({ ...ok, sentence: `신강지수가 9999점인 사람입니다. 방향을 정하면 끝까지 갑니다.` }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.map((f) => f.code)).toContain('FABRICATED_NUMBER');
  });

  it('원국에 없는 간지를 거부한다', () => {
    const result = verifySummary({ ...ok, sentence: `${absentGanji} 일주라서 곧게 가는 사람입니다.` }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.map((f) => f.code)).toContain('FABRICATED_GANJI');
  });

  it('목록 밖 카드를 인용하면 거부한다', () => {
    const result = verifySummary({ ...ok, used_card_ids: ['ilgan:없는카드'] }, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.map((f) => f.code)).toContain('UNKNOWN_CARD');
  });

  it('빈 카드 목록을 거부한다 — 근거 없이 쓴 글이다', () => {
    expect(verifySummary({ ...ok, used_card_ids: [] }, ctx).ok).toBe(false);
  });
});

describe('verifyCard', () => {
  const body =
    '일간은 경금이고, 한번 정한 방향으로는 곧게 가는 편입니다. 다만 시작하기 전에는 스스로도 놀랄 만큼 오래 재는 습관이 있습니다.';
  const ok = { body, used_card_ids: [allowedCard] };

  it('정상 응답을 통과시키고 요청한 섹션 id 를 붙인다', () => {
    const result = verifyCard(ok, 'saju', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('saju');
      expect(result.value.body).toBe(body);
    }
  });

  /** 모델이 섹션 id 를 되돌려주지 않으므로, 같은 응답이라도 요청에 따라 다른 id 가 붙는다. */
  it('같은 본문이라도 요청한 섹션에 따라 id 가 달라진다', () => {
    const a = verifyCard(ok, 'saju', ctx);
    const b = verifyCard(ok, 'zodiac', ctx);
    expect(a.ok && a.value.id).toBe('saju');
    expect(b.ok && b.value.id).toBe('zodiac');
  });

  it.each([
    ['본문이 너무 짧으면', '가'.repeat(BODY_MIN - 1)],
    ['본문이 너무 길면', '가'.repeat(BODY_MAX + 1)],
  ])('%s 거부한다', (_name, patched) => {
    expect(verifyCard({ ...ok, body: patched }, 'saju', ctx).ok).toBe(false);
  });

  it('지어낸 간지를 거부한다', () => {
    const result = verifyCard({ ...ok, body: `${body} ${absentGanji} 일주이기 때문입니다.` }, 'saju', ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.map((f) => f.code)).toContain('FABRICATED_GANJI');
  });

  it('스키마를 벗어난 응답은 SCHEMA 로 거부한다', () => {
    const result = verifyCard({ body: 123, used_card_ids: 'nope' }, 'saju', ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures.every((f) => f.code === 'SCHEMA')).toBe(true);
  });
});

/* ─────────────────────────── 요청 조립 ─────────────────────────── */

describe('분할 요청 조립', () => {
  const summary = buildSummaryRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked);
  const card = buildCardRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked, 'saju');
  const full = buildInterpretationRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked, 'fusion');

  it('세 요청이 같은 system 블록을 쓴다', () => {
    expect(summary.system).toEqual(card.system);
    expect(summary.system).toEqual(full.system);
  });

  /**
   * **이 테스트가 원가를 지킨다.**
   *
   * 프롬프트 캐시는 프리픽스 일치다. 작업 지시문이 앞이나 중간에 끼면 요청들의 접두가 갈려
   * 캐시가 깨지고, 입력의 대부분인 팩트팩·지식카드가 호출마다 전액 과금된다 — 분할이 이득이
   * 아니라 손해가 되는 지점이다. 깨지면 지시문을 꼬리로 되돌릴 것.
   */
  it('user 턴의 공통 접두가 거의 전부를 차지한다', () => {
    const limit = Math.min(summary.userText.length, card.userText.length);
    let common = 0;
    while (common < limit && summary.userText[common] === card.userText[common]) common += 1;
    expect(common / limit).toBeGreaterThan(0.9);
  });

  it('공통 접두는 팩트팩과 지식카드를 통째로 포함한다', () => {
    for (const req of [summary, card]) {
      expect(req.userText).toContain('# fact_pack');
      expect(req.userText).toContain('# knowledge_cards');
    }
  });

  it('작업 지시문은 맨 끝에 온다', () => {
    expect(summary.userText.indexOf('# 이번 작업')).toBeGreaterThan(
      summary.userText.indexOf('# knowledge_cards'),
    );
    expect(card.userText.indexOf('# 이번 작업')).toBeGreaterThan(
      card.userText.indexOf('# knowledge_cards'),
    );
  });

  it('카드 요청은 요청한 섹션만 지시한다', () => {
    const zodiac = buildCardRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked, 'zodiac');
    expect(zodiac.userText).toContain('zodiac');
    expect(zodiac.sections).toEqual(['zodiac']);
  });

  /** 섹션마다 캐시 키가 갈려야 한다 — 안 그러면 모든 카드가 첫 섹션의 글을 받는다. */
  it('캐시 키가 작업·섹션마다 다르다', () => {
    const zodiac = buildCardRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked, 'zodiac');
    const keys = [summary.narrativeKey, card.narrativeKey, zodiac.narrativeKey, full.narrativeKey];
    expect(new Set(keys).size).toBe(keys.length);
    expect(summary.narrativeKey).toMatch(/\|summary$/);
    expect(card.narrativeKey).toMatch(/\|card:saju$/);
  });

  it('요약이 카드보다 짧게 답하도록 라우팅된다', () => {
    expect(summary.routing.maxTokens).toBeLessThan(card.routing.maxTokens);
    expect(summary.routing.effort).toBe('low');
  });

  it('작업마다 다른 출력 스키마를 쓴다', () => {
    expect(summary.outputJsonSchema).toBe(SUMMARY_JSON_SCHEMA);
    expect(card.outputJsonSchema).toBe(CARD_JSON_SCHEMA);
  });

  it('카드가 하나도 없으면 조립을 거부한다', () => {
    expect(() => buildSummaryRequest(SAMPLE_CHART, SAMPLE_PROFILE, [])).toThrow();
    expect(() => buildCardRequest(SAMPLE_CHART, SAMPLE_PROFILE, [], 'saju')).toThrow();
  });
});

/* ─────────────────────────── 캐시 브레이크포인트 ─────────────────────────── */

describe('toMessagesApiParams — 캐시 브레이크포인트', () => {
  const req = buildCardRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked, 'saju');
  const params = toMessagesApiParams(req);
  const messages = params['messages'] as readonly {
    readonly content: readonly Record<string, unknown>[];
  }[];
  const content = messages[0]?.content ?? [];

  /**
   * **이 테스트가 원가의 절반을 지킨다.**
   *
   * system 에만 브레이크포인트를 걸었을 때 카드 6장이 각각 5,846 토큰을 전액 과금으로 다시
   * 보냈다(2026-08-19 실측 565원). 접두를 공유하도록 만들어 두고 캐시 표시를 안 걸면 아무 소용이 없다.
   */
  it('user 턴 접두에 cache_control 이 걸린다', () => {
    expect(content).toHaveLength(2);
    expect(content[0]?.['cache_control']).toEqual({ type: 'ephemeral' });
  });

  it('꼬리에는 걸지 않는다 — 작업마다 달라서 캐시될 수 없다', () => {
    expect(content[1]?.['cache_control']).toBeUndefined();
  });

  it('두 블록을 이으면 userText 와 같다', () => {
    expect(`${String(content[0]?.['text'])}${String(content[1]?.['text'])}`).toBe(req.userText);
  });

  it('세 작업의 접두가 글자 단위로 같다 — 같은 캐시 항목을 쓴다', () => {
    const summary = buildSummaryRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked);
    const full = buildInterpretationRequest(SAMPLE_CHART, SAMPLE_PROFILE, picked, 'fusion');
    expect(summary.userPrefix).toBe(req.userPrefix);
    expect(full.userPrefix).toBe(req.userPrefix);
  });

  it('system 브레이크포인트도 그대로 있다', () => {
    const system = params['system'] as readonly Record<string, unknown>[];
    expect(system.filter((b) => b['cache_control'] !== undefined)).toHaveLength(1);
  });
});
