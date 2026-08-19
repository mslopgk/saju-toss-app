/**
 * 규칙 기반 홈 요약.
 *
 * 이 값이 **홈 첫 화면**을 채운다. 서버가 없거나 죽어도 화면이 빈 적이 없어야 하므로,
 * 여기서 고정하는 것은 두 가지다:
 *   ① 모든 신강신약 등급·모든 일간 오행에서 값이 나온다(빈 문자열이나 undefined 가 없다)
 *   ② 그 값이 **AI 응답과 같은 검증기**를 통과한다 — 두 경로가 같은 규율을 지켜야
 *      화면이 어느 쪽 값을 받든 같은 품질 보장을 갖는다
 */
import { describe, expect, it } from 'vitest';
import { renderTemplateSummary } from './template';
import { verifySummary } from './guard';
import { buildFactPack } from './factPack';
import { selectKnowledgeCards } from './retrieve';
import { SENTENCE_MAX, SENTENCE_MIN, WORD_MAX, WORD_MIN } from './schema';
import { SAMPLE_CARDS, SAMPLE_CHART, SAMPLE_PROFILE } from './fixtures';
import type { StrengthGrade } from './contracts';
import type { FactPack } from './factPack';

const baseFact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion');
const cardIds = selectKnowledgeCards(baseFact, SAMPLE_CARDS).map((c) => c.id);

const GRADES: readonly StrengthGrade[] = [
  '극신약',
  '신약',
  '중화신약',
  '중화',
  '중화신강',
  '신강',
  '극신강',
];

/** 등급만 바꾼 팩트팩. 다른 값은 건드리지 않는다 — 등급이 문구를 가르는지만 본다. */
function withGrade(grade: StrengthGrade): FactPack {
  const strength = baseFact.saju.strength;
  if (strength === null) throw new Error('픽스처에 신강신약이 없다');
  return { ...baseFact, saju: { ...baseFact.saju, strength: { ...strength, strengthGrade: grade } } };
}

describe('renderTemplateSummary', () => {
  it.each(GRADES)('%s 등급에서 값이 나온다', (grade) => {
    const summary = renderTemplateSummary(withGrade(grade), cardIds);
    expect(summary.word.length).toBeGreaterThanOrEqual(WORD_MIN);
    expect(summary.word.length).toBeLessThanOrEqual(WORD_MAX);
    expect(summary.sentence.length).toBeGreaterThanOrEqual(SENTENCE_MIN);
    expect(summary.sentence.length).toBeLessThanOrEqual(SENTENCE_MAX);
  });

  /**
   * **이 테스트가 두 경로를 같은 규율에 묶는다.**
   * 규칙 기반 값이 검증기를 통과하지 못하면, AI 실패 시 화면에 나가는 글이 AI 성공 시보다
   * 낮은 기준을 받는다는 뜻이다.
   */
  it.each(GRADES)('%s 등급의 결과가 verifySummary 를 통과한다', (grade) => {
    const fact = withGrade(grade);
    const summary = renderTemplateSummary(fact, cardIds);
    const result = verifySummary(
      { word: summary.word, sentence: summary.sentence, used_card_ids: [...summary.usedCardIds] },
      { factPack: fact, knowledgeCardIds: cardIds },
    );
    expect(result.ok, result.ok ? '' : result.failures.map((f) => `${f.code}:${f.detail}`).join(',')).toBe(true);
  });

  it('등급이 다르면 문장도 다르다 — 같은 글이 모두에게 나가지 않는다', () => {
    const sentences = GRADES.map((g) => renderTemplateSummary(withGrade(g), cardIds).sentence);
    expect(new Set(sentences).size).toBeGreaterThan(1);
  });

  it('신강신약이 없는 차트(구버전)에서도 값이 나온다', () => {
    const fact: FactPack = { ...baseFact, saju: { ...baseFact.saju, strength: null } };
    const summary = renderTemplateSummary(fact, cardIds);
    expect(summary.word.length).toBeGreaterThanOrEqual(WORD_MIN);
    expect(summary.sentence.length).toBeGreaterThanOrEqual(SENTENCE_MIN);
  });

  it('근거 카드를 반드시 하나 남긴다 — 빈 목록은 검증에서 거부된다', () => {
    expect(renderTemplateSummary(baseFact, cardIds).usedCardIds).toHaveLength(1);
  });
});
