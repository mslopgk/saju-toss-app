// S5 전수 불변식 · 분포 게이트 — 근거: C00 §5.2(S5 3행) · §6.2 I5/I6, C05 TV-10, C17 TV-C17-07
//
// 정합 사주 전수 = 년주 60 × 월지 12 × 일주 60 × 시지 12 = **518,400**(월간 오호둔 / 시간 오서둔 결정).
// 표본이 아니라 전수다 — 한쪽으로 쏠리면 계수나 앵커가 틀린 것이므로 여기서 빌드를 세운다.
//
// 실행 시간 실측 ≈ 9초(1회 순회). 순회를 한 번만 돌고 통계를 모두 모은 뒤 검증한다.

import { beforeAll, describe, expect, it } from 'vitest';
import { computeStrengthChart } from '../../src/shared/lib/saju/strength';
import type { StrengthGrade, YongsinRoute } from '../../src/shared/lib/saju/types';
import { GRID_SIZE, gridPillars } from './strength-fixtures';
import params from '../../src/shared/data/strength-params.json';

interface Stats {
  n: number;
  sumViolations: number;
  siViolations: number;
  allyFoeViolations: number;
  primaryInAvoid: number;
  emptyFavorable: number;
  favorableAvoidOverlap: number;
  meanR: number;
  medianR: number;
  pstdevR: number;
  minR: number;
  maxR: number;
  strongPct: number;
  grade: Record<string, number>;
  route: Record<string, number>;
  geokguk: Record<string, number>;
  specialPct: number;
  siDecile: number[];
}

let stats: Stats;

beforeAll(() => {
  const rs = new Float64Array(GRID_SIZE);
  const grade: Record<string, number> = {};
  const route: Record<string, number> = {};
  const geokguk: Record<string, number> = {};
  const siDecile = new Array<number>(11).fill(0);
  let n = 0;
  let sumViolations = 0;
  let siViolations = 0;
  let allyFoeViolations = 0;
  let primaryInAvoid = 0;
  let emptyFavorable = 0;
  let favorableAvoidOverlap = 0;
  let strong = 0;
  let special = 0;

  for (const p of gridPillars()) {
    const c = computeStrengthChart(p);
    const s = c.strength;

    // I5 — 총점 고정
    let total = 0;
    for (const v of Object.values(s.scores)) total += v;
    if (Math.abs(total - 80) > 1e-9) sumViolations++;
    // I6
    if (!(s.SI >= 0 && s.SI <= 100)) siViolations++;
    if (Math.abs(s.ally + s.foe - s.total) > 1e-9) allyFoeViolations++;
    if (c.yongsin.avoid.includes(c.yongsin.primary)) primaryInAvoid++;
    if (c.yongsin.favorable.length === 0 || c.yongsin.favorable[0] !== c.yongsin.primary) {
      emptyFavorable++;
    }
    // 같은 오행이 희신이자 기신으로 나가면 리포트가 자기모순이 된다
    if (c.yongsin.favorable.some((e) => c.yongsin.avoid.includes(e))) favorableAvoidOverlap++;

    rs[n] = s.R;
    grade[s.grade] = (grade[s.grade] ?? 0) + 1;
    route[c.yongsin.route] = (route[c.yongsin.route] ?? 0) + 1;
    geokguk[c.geokguk.name] = (geokguk[c.geokguk.name] ?? 0) + 1;
    siDecile[Math.min(10, Math.floor(s.SI / 10))]!++;
    if (s.isStrong) strong++;
    if (c.geokguk.special) special++;
    n++;
  }

  const arr = rs.subarray(0, n);
  let sumR = 0;
  for (const v of arr) sumR += v;
  const meanR = sumR / n;
  let varSum = 0;
  for (const v of arr) varSum += (v - meanR) ** 2;
  const sorted = Float64Array.from(arr).sort();

  stats = {
    n,
    sumViolations,
    siViolations,
    allyFoeViolations,
    primaryInAvoid,
    emptyFavorable,
    favorableAvoidOverlap,
    meanR,
    medianR: sorted[Math.floor(n / 2)]!,
    pstdevR: Math.sqrt(varSum / n),
    minR: sorted[0]!,
    maxR: sorted[n - 1]!,
    strongPct: strong / n,
    grade,
    route,
    geokguk,
    specialPct: special / n,
    siDecile: siDecile.map((v) => v / n),
  };
}, 1_800_000);

const pct = (m: Record<string, number>, k: string): number => (m[k] ?? 0) / GRID_SIZE;

describe('S5 전수 518,400 — 불변식 (C00 §6.2 I5/I6)', () => {
  it('격자 크기가 518,400 이다', () => {
    expect(stats.n).toBe(518_400);
    expect(GRID_SIZE).toBe(518_400);
  });

  it('I5 — sum(scores) === 80.00 (±1e-9) 위반 0', () => {
    expect(stats.sumViolations).toBe(0);
  });

  it('I6 — 0 ≤ SI ≤ 100 / ally+foe === total / primary ∉ avoid 위반 0', () => {
    expect(stats.siViolations).toBe(0);
    expect(stats.allyFoeViolations).toBe(0);
    expect(stats.primaryInAvoid).toBe(0);
    expect(stats.emptyFavorable).toBe(0);
  });

  it('favorable ∩ avoid === ∅ — 같은 오행이 희신이자 기신일 수 없다', () => {
    expect(stats.favorableAvoidOverlap).toBe(0);
  });
});

describe('S5 전수 518,400 — 분포 (C00 §5.2 게이트 / C05 TV-10)', () => {
  it('mean(R) === 0.4000 ± 0.0005 — 아군 2오행 : 적군 3오행 구조', () => {
    expect(stats.meanR).toBeGreaterThan(0.4 - 0.0005);
    expect(stats.meanR).toBeLessThan(0.4 + 0.0005);
  });

  it('median(R) === 0.3950 ± 0.0005 / pstdev(R) === 0.1610 ± 0.0005', () => {
    expect(Math.abs(stats.medianR - 0.395)).toBeLessThan(0.0005);
    expect(Math.abs(stats.pstdevR - 0.161)).toBeLessThan(0.0005);
    expect(stats.minR).toBe(0);
    expect(stats.maxR).toBe(1);
  });

  it('P(SI ≥ 55) ∈ [0.44, 0.46] — 고정 임계가 아니라 백분위라서 성립한다', () => {
    expect(stats.strongPct).toBeGreaterThanOrEqual(0.44);
    expect(stats.strongPct).toBeLessThanOrEqual(0.46);
  });

  it('7등급 인구 비중이 설계값 ±1.5%p 안이다', () => {
    for (const g of params.threshold.grades) {
      const observed = pct(stats.grade, g.label);
      expect(Math.abs(observed - g.designShare), `${g.label} ${(observed * 100).toFixed(3)}%`)
        .toBeLessThan(0.015);
    }
    // 7등급이 전부 등장한다
    const labels: StrengthGrade[] = [
      '극신약', '신약', '중화신약', '중화', '중화신강', '신강', '극신강',
    ];
    for (const l of labels) expect(stats.grade[l], l).toBeGreaterThan(0);
  });

  it('SI 십분위가 고르다 (백분위 정규화가 실제로 작동하는지) — 각 구간 8~12%', () => {
    for (let i = 0; i < 10; i++) {
      expect(stats.siDecile[i], `decile ${i}`).toBeGreaterThan(0.08);
      expect(stats.siDecile[i], `decile ${i}`).toBeLessThan(0.12);
    }
  });

  it('용신 경로 3종이 전부 트리거되고 어느 하나로 쏠리지 않는다', () => {
    const routes: YongsinRoute[] = ['從/專旺', '調候', '抑扶+格局'];
    for (const r of routes) expect(stats.route[r], r).toBeGreaterThan(0);
    // v1 五道关에 通關 관문이 없다 → route 로는 나오지 않는다 (C00 §S5-4)
    expect(stats.route['通關']).toBeUndefined();
    expect(pct(stats.route, '抑扶+格局')).toBeGreaterThan(0.5);
    expect(pct(stats.route, '從/專旺')).toBeLessThan(0.05);
  });

  it('격국 10종 + 특수격 4종이 전부 등장하고 8격에 쏠림이 없다', () => {
    const eight = ['정관격', '칠살격', '정재격', '편재격', '정인격', '편인격', '식신격', '상관격'];
    for (const g of [...eight, '건록격', '양인격']) {
      const share = pct(stats.geokguk, g);
      expect(share, `${g} ${(share * 100).toFixed(3)}%`).toBeGreaterThan(0.06);
      expect(share, `${g} ${(share * 100).toFixed(3)}%`).toBeLessThan(0.14);
    }
    for (const g of ['전왕격', '종세격', '종아격', '종재격', '종살격']) {
      expect(stats.geokguk[g], g).toBeGreaterThan(0);
    }
    // 「见从就从」 방지 — 특수격은 5% 미만이어야 한다 (E21/E22)
    expect(stats.specialPct).toBeLessThan(0.05);
  });
});
