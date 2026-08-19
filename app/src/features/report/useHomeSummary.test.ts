/**
 * 홈 요약의 채택 판단.
 *
 * `useHomeSummary` 의 이펙트는 정적 렌더 테스트에서 돌지 않는다. 그래서 **판단을 순수함수로
 * 떼어 두고** 여기서 본다 — 이 파일이 없으면 "서버 응답을 언제 쓰고 언제 버리는가"를 검증하는
 * 테스트가 하나도 없게 된다.
 */
import { describe, expect, it } from 'vitest';
import { adoptSummary } from './useHomeSummary';

const VALUE = { word: '밝히는 힘', sentence: '한번 정한 방향으로는 곧게 갑니다.', usedCardIds: ['A'] };

describe('adoptSummary', () => {
  it('정상 응답은 채택한다', () => {
    expect(adoptSummary({ status: 'ok', source: 'llm', value: VALUE })).toEqual({
      kind: 'adopt',
      origin: 'llm',
      value: VALUE,
    });
  });

  it('캐시에서 온 값도 채택하되 출처를 구분한다', () => {
    const result = adoptSummary({ status: 'ok', source: 'cache', value: VALUE });
    expect(result).toMatchObject({ kind: 'adopt', origin: 'cache' });
  });

  /** 서버가 모르는 출처를 보내도 화면은 그려야 한다. 'cache' 가 아니면 전부 LLM 으로 본다. */
  it('모르는 출처는 llm 으로 본다', () => {
    expect(adoptSummary({ status: 'ok', source: 'mock', value: VALUE })).toMatchObject({
      origin: 'llm',
    });
  });

  it.each([
    ['거부', { status: 'rejected' } as const],
    ['오류', { status: 'error', code: 'TIMEOUT' } as const],
  ])('%s 응답은 규칙 기반으로 남는다', (_label, outcome) => {
    expect(adoptSummary(outcome)).toEqual({ kind: 'fallback' });
  });

  /**
   * 서버 검증을 통과한 값이라도 화면에 빈 글자가 나가면 홈 첫 화면이 빈다.
   * 마지막 방어선을 여기 둔다 — 규칙 기반 값이 언제나 빈 문자열보다 낫다.
   */
  it.each([
    ['단어가 비면', { ...VALUE, word: '   ' }],
    ['문장이 비면', { ...VALUE, sentence: '' }],
  ])('%s 채택하지 않는다', (_label, value) => {
    expect(adoptSummary({ status: 'ok', source: 'llm', value })).toEqual({ kind: 'fallback' });
  });
});
