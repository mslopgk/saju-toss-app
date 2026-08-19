import { describe, expect, it } from 'vitest';
import tables from '../../data/tables.json';
import type { Branch, Stem } from '../saju/types';
import { branchPairKinds, stemPairKind } from './relations';
import { scoreS1, scoreS2, scoreS5, scoreS6 } from './saju';

const STEMS = tables._meta.index_convention.GAN as Stem[];
const BRANCHES = tables._meta.index_convention.ZHI as Branch[];

/**
 * S1/S2/S5/S6 은 룩업이라 원국 없이 검증할 수 있다. S3/S4 는 원국 전체가 필요해
 * `index.test.ts` 의 실차트 경로에서 본다.
 *
 * 기대값 출처는 C08 §3.2·§3.3·§3.6·§3.7 의 **규칙**과 §테스트벡터 TV-01~TV-06 이다.
 */
describe('S1 일간 합충 (C08 §3.2)', () => {
  it('C08 §3.2 의 10×10 표를 정확히 재현한다', () => {
    const published = `10 14 17 17 8 20 4 8 17 17
14 10 17 17 8 8 20 4 17 17
17 17 10 14 17 17 8 20 4 8
17 17 14 10 17 17 8 8 20 4
8 8 17 17 10 14 17 17 8 20
20 8 17 17 14 10 17 17 8 8
4 20 8 8 17 17 10 14 17 17
8 4 20 8 17 17 14 10 17 17
17 17 4 20 8 8 17 17 10 14
17 17 8 4 20 8 17 17 14 10`
      .trim()
      .split('\n')
      .map((r) => r.trim().split(/\s+/).map(Number));

    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        expect(scoreS1(STEMS[i]!, STEMS[j]!).score, `${STEMS[i]}${STEMS[j]}`).toBe(published[i]![j]);
      }
    }
  });

  it('합이 극보다 먼저다 — 甲己는 木剋土 이면서 천간합이라 순서가 결과를 바꾼다', () => {
    expect(stemPairKind('甲', '己')).toBe('천간합');
    expect(scoreS1('甲', '己').score).toBe(20);
    expect(stemPairKind('甲', '戊')).toBe('상극');
  });

  it('TV-01~TV-06 의 S1 기대값', () => {
    expect(scoreS1('甲', '己').score).toBe(20); // TV-01 천간합
    expect(scoreS1('庚', '甲').score).toBe(4); // TV-02 천간충
    expect(scoreS1('丙', '丙').score).toBe(10); // TV-03 비화
    expect(scoreS1('甲', '癸').score).toBe(17); // TV-04 상생
    expect(scoreS1('庚', '壬').score).toBe(17); // TV-05 상생
    expect(scoreS1('乙', '辛').score).toBe(4); // TV-06 천간충
  });
});

describe('S2 일지 합충 (C08 §3.3 / C00 §3-H2)', () => {
  it('TV-01~TV-06 의 S2 기대값 — 특히 子丑 은 육합+방합이 겹쳐 clamp 20 이다', () => {
    // TV-01 이 "base10 +육합8 +방합3 → clamp 20" 이라고 못박은 칸이다.
    expect(branchPairKinds('子', '丑')).toEqual(['육합', '방합']);
    expect(scoreS2('子', '丑').score).toBe(20);
    expect(scoreS2('午', '子').score).toBe(1); // TV-02 충
    expect(scoreS2('申', '申').score).toBe(12); // TV-03 동일
    expect(scoreS2('寅', '酉').score).toBe(4); // TV-04 원진
    expect(scoreS2('申', '子').score).toBe(16); // TV-05 삼합
    expect(scoreS2('卯', '酉').score).toBe(1); // TV-06 충
  });

  it('원진과 해는 독립 적용이다 — 子未·丑午 는 −10 (C00 §3-H2)', () => {
    expect(branchPairKinds('子', '未')).toEqual(['원진', '해']);
    expect(scoreS2('子', '未').score).toBe(0);
    expect(scoreS2('丑', '午').score).toBe(0);
  });

  it('겹치는 관계를 전부 더한다 — 巳申 은 육합·형·파 세 개 (10+8−5−2)', () => {
    expect(branchPairKinds('巳', '申')).toEqual(['육합', '형', '파']);
    expect(scoreS2('巳', '申').score).toBe(11);
  });

  it('교환대칭이고 [0,20] 안이다 (144칸 전수)', () => {
    for (const a of BRANCHES) {
      for (const b of BRANCHES) {
        const v = scoreS2(a, b).score;
        expect(v).toBe(scoreS2(b, a).score);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(20);
      }
    }
  });

  /**
   * ⚠ C08 §3.3 이 실은 12×12 표는 **같은 문서의 규칙·테스트벡터·시뮬 실측과 어긋난다.**
   * 그 표는 최댓값이 19 인데 §3.8 시뮬은 max 20 이고, TV-01 은 子丑 을 20 이라고 못박았는데
   * 표는 18 이다. 규칙 쪽이 정본이라는 근거를 여기에 고정해 둔다 — 나중에 누가 "표와 다르다"
   * 며 되돌리지 않도록.
   */
  it('규칙 기반 표는 최댓값 20 에 닿는다 — C08 §3.3 표(최댓값 19)가 산출물 오류라는 근거', () => {
    let max = 0;
    let n20 = 0;
    for (const a of BRANCHES) {
      for (const b of BRANCHES) {
        const v = scoreS2(a, b).score;
        max = Math.max(max, v);
        if (v === 20) n20++;
      }
    }
    expect(max).toBe(20);
    expect(n20).toBe(4); // 子丑·丑子·午未·未午
  });
});

describe('S5 십신 교차 (C08 §3.6)', () => {
  it('TV-01~TV-06 의 S5 기대값 — 두 방향 십신의 평균', () => {
    expect(scoreS5('甲', '己').item.score).toBe(15); // 정재 15 · 정관 15
    expect(scoreS5('庚', '甲').item.score).toBe(10); // 편재 11 · 편관 9
    expect(scoreS5('丙', '丙').item.score).toBe(9); // 비견 9 · 비견 9
    expect(scoreS5('甲', '癸').item.score).toBe(10); // 정인 13 · 상관 7
    expect(scoreS5('庚', '壬').item.score).toBe(10); // 식신 13 · 편인 7
    expect(scoreS5('乙', '辛').item.score).toBe(10); // 편관 9 · 편재 11
  });

  it('TV-01 의 십신 방향이 정재/정관이다', () => {
    expect(scoreS5('甲', '己').crossTenGods).toEqual(['정재', '정관']);
  });

  it('교환대칭이고 [5,15] 안이다 (100칸 전수)', () => {
    for (const a of STEMS) {
      for (const b of STEMS) {
        const v = scoreS5(a, b).item.score;
        expect(v).toBe(scoreS5(b, a).item.score);
        expect(v).toBeGreaterThanOrEqual(5);
        expect(v).toBeLessThanOrEqual(15);
      }
    }
  });
});

describe('S6 띠(년지) 궁합 (C08 §3.7)', () => {
  it('TV-01~TV-06 의 S6 기대값', () => {
    expect(scoreS6('子', '巳').score).toBe(5); // 무관계
    expect(scoreS6('午', '子').score).toBe(1); // 충
    expect(scoreS6('申', '申').score).toBe(6); // 동일
    expect(scoreS6('寅', '申').score).toBe(1); // 충
    expect(scoreS6('申', '子').score).toBe(8); // 삼합
    expect(scoreS6('卯', '酉').score).toBe(1); // 충
  });

  it('S6 는 S2 가 세는 관계 중 delta 에 있는 6종만 본다 — 형·파는 띠에 없다', () => {
    // 未戌 은 형이자 파라 S2 에서는 −7 이지만, S6 delta 에는 둘 다 없어 base 그대로다.
    expect(branchPairKinds('未', '戌')).toEqual(['형', '파']);
    expect(scoreS6('未', '戌').score).toBe(5);
    expect(scoreS6('未', '戌').reasons).toEqual([]);
  });

  it('교환대칭이고 [0,10] 안이다 (144칸 전수)', () => {
    for (const a of BRANCHES) {
      for (const b of BRANCHES) {
        const v = scoreS6(a, b).score;
        expect(v).toBe(scoreS6(b, a).score);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(10);
      }
    }
  });
});
