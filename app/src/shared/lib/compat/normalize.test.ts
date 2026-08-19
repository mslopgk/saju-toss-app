import { describe, expect, it } from 'vitest';
import { BANDS, ECDF_GRIDS, LOGISTIC_K, WEIGHTS } from './params';
import { anchorInterp, axisSetKeyOf, bandOf, ecdf, redistributeWeights, z2p } from './normalize';

describe('z2p (C00 §S8-3 / C18 §7 X6)', () => {
  it('평균에서 50, 단조증가, 0~100 안에서 유한하다', () => {
    expect(z2p(60, 60, 9)).toBeCloseTo(50, 12);
    expect(z2p(80, 60, 9)).toBeGreaterThan(z2p(70, 60, 9));
    // 수식상 열린구간이지만 극단 z 는 배정도에서 0/100 으로 언더플로한다. 요구는 "유한" 이다.
    expect(z2p(-1e6, 60, 9)).toBe(0);
    expect(z2p(1e6, 60, 9)).toBe(100);
    expect(Number.isFinite(z2p(1e6, 60, 9))).toBe(true);
  });

  it('로지스틱 계수는 파라미터 파일에서 온다', () => {
    // z2p(mu+sd) = 100/(1+exp(−k))
    expect(z2p(69, 60, 9)).toBeCloseTo(100 / (1 + Math.exp(-LOGISTIC_K)), 12);
  });

  it('sd < 1e-9 이면 50 을 낸다 — 혈액형 균등 매트릭스(BL-1) 대비 방어', () => {
    expect(z2p(70, 70, 0)).toBe(50);
    expect(z2p(99, 70, 0)).toBe(50);
    expect(z2p(1, 70, 1e-12)).toBe(50);
    expect(Number.isFinite(z2p(70, 70, 0))).toBe(true);
  });

  it('sd 가 NaN 이어도 폭발하지 않는다', () => {
    expect(z2p(70, 70, Number.NaN)).toBe(50);
  });
});

describe('가중치 재분배 (C00 §S8-3 a)', () => {
  it('전 축이 있으면 원래 가중치 그대로다', () => {
    const w = redistributeWeights({ saju: true, zodiac: true, mbti: true, blood: true });
    expect(w).toEqual(WEIGHTS);
  });

  it('빠진 축의 몫을 비례 재분배하고 합은 항상 1이다', () => {
    const cases = [
      { saju: true, zodiac: true, mbti: true, blood: false },
      { saju: true, zodiac: true, mbti: false, blood: true },
      { saju: true, zodiac: true, mbti: false, blood: false },
    ];
    for (const present of cases) {
      const w = redistributeWeights(present);
      expect(w.saju + w.zodiac + w.mbti + w.blood).toBeCloseTo(1, 12);
      expect(w.mbti === 0).toBe(!present.mbti);
      expect(w.blood === 0).toBe(!present.blood);
      // 비례 재분배 = 남은 축 사이의 **비율**이 보존된다
      expect(w.saju / w.zodiac).toBeCloseTo(WEIGHTS.saju / WEIGHTS.zodiac, 12);
    }
  });

  it('혈액형만 빠지면 0.50/0.90 · 0.20/0.90 · 0.20/0.90 이다 (C00 §S8-3 a 의 예시)', () => {
    const w = redistributeWeights({ saju: true, zodiac: true, mbti: true, blood: false });
    expect(w.saju).toBeCloseTo(0.5 / 0.9, 12);
    expect(w.zodiac).toBeCloseTo(0.2 / 0.9, 12);
    expect(w.mbti).toBeCloseTo(0.2 / 0.9, 12);
  });
});

describe('ECDF · ANCHOR (C00 §S8-3 / C18 §6.4)', () => {
  it('자기신고 조합이 그리드 키를 고른다', () => {
    expect(axisSetKeyOf({ saju: true, zodiac: true, mbti: true, blood: true })).toBe('saju+zodiac+mbti+blood');
    expect(axisSetKeyOf({ saju: true, zodiac: true, mbti: true, blood: false })).toBe('saju+zodiac+mbti');
    expect(axisSetKeyOf({ saju: true, zodiac: true, mbti: false, blood: true })).toBe('saju+zodiac+blood');
    expect(axisSetKeyOf({ saju: true, zodiac: true, mbti: false, blood: false })).toBe('saju+zodiac');
  });

  it('그리드 밖은 0/1 로 잘리고 안에서는 단조증가한다', () => {
    const g = ECDF_GRIDS['saju+zodiac+mbti+blood'];
    expect(ecdf(g[0]! - 10)).toBe(0);
    expect(ecdf(g[100]! + 10)).toBe(1);
    let prev = -1;
    for (let x = 10; x <= 90; x += 0.5) {
      const p = ecdf(x);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
  });

  it('그리드 격자점에서는 정확히 i/100 을 낸다', () => {
    const g = ECDF_GRIDS['saju+zodiac+mbti+blood'];
    for (const i of [0, 25, 50, 75, 100]) {
      expect(ecdf(g[i]!)).toBeCloseTo(i / 100, 6);
    }
  });

  it('ANCHOR 는 조각별 선형이고 양끝에서 32·99 다', () => {
    expect(anchorInterp(0)).toBe(32);
    expect(anchorInterp(1)).toBe(99);
    expect(anchorInterp(-1)).toBe(32);
    expect(anchorInterp(2)).toBe(99);
    expect(anchorInterp(0.5)).toBe(68);
    expect(anchorInterp(0.025)).toBeCloseTo(38.5, 9); // (0,32)~(0.05,45) 의 중점
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.001) {
      const v = anchorInterp(Math.min(p, 1));
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('등급 (C18 §6.3)', () => {
  it('경계값이 위쪽 등급에 속한다', () => {
    for (const b of BANDS) {
      expect(bandOf(b.min).tag).toBe(b.tag);
    }
  });

  it('32~99 전 구간이 8등급 안에 들어간다', () => {
    const seen = new Set<string>();
    for (let s = 32; s <= 99; s++) seen.add(bandOf(s).tag);
    expect(seen.size).toBe(BANDS.length);
  });
});
