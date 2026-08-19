// S4-2 전수 불변식 · 분포 게이트 — 근거: C00 §S4-4 ~ §S4-7, §3-D, C04 §12, C16
//
// 정합 사주 전수 = 년주 60 × 월지 12 × 일주 60 × 시지 12 = **518,400**.
// 표본이 아니라 전수다 — 게이트·배점·관계 판정이 어긋나면 여기서 빌드를 세운다.
// 순회는 한 번만 돌고 통계를 모두 모은 뒤 검증한다.

import { beforeAll, describe, expect, it } from 'vitest';
import params from '../../src/shared/data/sinsal-params.json';
import { computeSinsalChart } from '../../src/shared/lib/saju/sinsal';
import type { PillarKey } from '../../src/shared/lib/saju/types';
import { GRID_SIZE, gridPillars } from './strength-fixtures';

const PILLARS: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];
const SCORE_NAMES = new Set(Object.keys(params.sinsalScore.data));
const REL_TYPES = new Set(Object.keys(params.relationStrength.data));

interface Stats {
  n: number;
  scoreOutOfRange: number;
  energyOutOfRange: number;
  minScore: number;
  maxScore: number;
  sumScore: number;
  minEnergy: number;
  maxEnergy: number;
  sumEnergy: number;
  /** 신살 이름 → 성립 사주 수 */
  byName: Map<string, number>;
  /** 관계 타입 → 성립 사주 수 */
  byRelation: Map<string, number>;
  unknownScoreName: number;
  unknownRelation: number;
  gateViolation: number;
  gongmangSelfHit: number;
  emptyPillarList: number;
  sinsal12Missing: number;
  sinsal12NameOutOfSet: number;
  hitsPerChart: number;
}

const SINSAL12 = new Set([
  '겁살', '재살', '천살', '지살', '연살', '월살',
  '망신살', '장성살', '반안살', '역마살', '육해살', '화개살',
]);

let s: Stats;

beforeAll(() => {
  s = {
    n: 0,
    scoreOutOfRange: 0,
    energyOutOfRange: 0,
    minScore: Infinity,
    maxScore: -Infinity,
    sumScore: 0,
    minEnergy: Infinity,
    maxEnergy: -Infinity,
    sumEnergy: 0,
    byName: new Map(),
    byRelation: new Map(),
    unknownScoreName: 0,
    unknownRelation: 0,
    gateViolation: 0,
    gongmangSelfHit: 0,
    emptyPillarList: 0,
    sinsal12Missing: 0,
    sinsal12NameOutOfSet: 0,
    hitsPerChart: 0,
  };
  const gated = params.gates.data as Record<string, string>;

  for (const p of gridPillars()) {
    const c = computeSinsalChart(p);
    s.n += 1;

    if (c.sinsalScore < 0 || c.sinsalScore > 100) s.scoreOutOfRange += 1;
    if (c.unseongEnergy < 0 || c.unseongEnergy > 100) s.energyOutOfRange += 1;
    s.minScore = Math.min(s.minScore, c.sinsalScore);
    s.maxScore = Math.max(s.maxScore, c.sinsalScore);
    s.sumScore += c.sinsalScore;
    s.minEnergy = Math.min(s.minEnergy, c.unseongEnergy);
    s.maxEnergy = Math.max(s.maxEnergy, c.unseongEnergy);
    s.sumEnergy += c.unseongEnergy;

    s.hitsPerChart += c.sinsal.length;
    for (const h of c.sinsal) {
      s.byName.set(h.name, (s.byName.get(h.name) ?? 0) + 1);
      if (h.pillars.length === 0) s.emptyPillarList += 1;
      // 배점표에 없는 이름은 조용히 0점으로 먹히므로 여기서 잡는다
      if (!SCORE_NAMES.has(h.name)) s.unknownScoreName += 1;
      // dayPillarFirst 게이트: 일주가 목록에 없으면 그 신살이 아예 없어야 한다
      if (gated[h.name] === 'dayPillarFirst') {
        const list =
          h.name === '백호대살'
            ? ['戊辰', '丁丑', '丙戌', '乙未', '甲辰', '癸丑', '壬戌']
            : ['庚辰', '庚戌', '壬辰', '壬戌'];
        if (!list.includes(p.day.ganji)) s.gateViolation += 1;
      }
      if (h.name === '공망' && h.pillars.includes('day')) s.gongmangSelfHit += 1;
    }

    for (const r of c.branchRelations) {
      s.byRelation.set(r.type, (s.byRelation.get(r.type) ?? 0) + 1);
      if (!REL_TYPES.has(r.type)) s.unknownRelation += 1;
    }
    for (const r of c.stemRelations) {
      s.byRelation.set(r.type, (s.byRelation.get(r.type) ?? 0) + 1);
    }

    for (const k of PILLARS) {
      const v = c.sinsal12[k];
      if (v === null) {
        s.sinsal12Missing += 1;
        continue;
      }
      if (!SINSAL12.has(v.byYear) || !SINSAL12.has(v.byDay)) s.sinsal12NameOutOfSet += 1;
    }
  }
}, 300000);

describe('S4-2 전수 불변식 (518,400)', () => {
  it('전수를 다 돌았다', () => {
    expect(s.n).toBe(GRID_SIZE);
  });

  it('I-S1 신살점수 0..100 · I-S2 십이운성 에너지 0..100', () => {
    expect(s.scoreOutOfRange).toBe(0);
    expect(s.energyOutOfRange).toBe(0);
  });

  it('I-S3 배점표에 없는 신살 이름이 나오지 않는다', () => {
    // 나오면 그 신살은 조용히 0점으로 취급돼 점수가 유파와 어긋난다.
    expect(s.unknownScoreName).toBe(0);
  });

  it('I-S4 관계 타입이 강도표 밖으로 나가지 않는다', () => {
    expect(s.unknownRelation).toBe(0);
  });

  it('I-S5 백호·괴강 dayPillarFirst 게이트가 전수에서 한 번도 깨지지 않는다 (C00 §3-D7)', () => {
    expect(s.gateViolation).toBe(0);
  });

  it('I-S6 공망은 일주 자신을 히트로 세지 않는다 (C04 §8-7)', () => {
    expect(s.gongmangSelfHit).toBe(0);
  });

  it('I-S7 히트에는 기둥이 최소 하나 있다 · 십이운성/십이신살은 4주 전부 채워진다', () => {
    expect(s.emptyPillarList).toBe(0);
    expect(s.sinsal12Missing).toBe(0);
    expect(s.sinsal12NameOutOfSet).toBe(0);
  });
});

describe('S4-2 분포', () => {
  it('신살점수 — 기준선 50 근처에 중심을 두고 양끝까지 퍼진다', () => {
    const mean = s.sumScore / s.n;
    // C04 §12-3 은 50 을 기준선으로 잡는다. 길신/흉신 배점이 균형을 잃으면 평균이 한쪽으로 무너진다.
    expect(mean).toBeGreaterThan(45);
    expect(mean).toBeLessThan(60);
    expect(s.minScore).toBe(0);
    expect(s.maxScore).toBe(100);
  });

  it('십이운성 에너지 — 표 최소/최대(10 · 100) 사이에서 실제로 퍼진다', () => {
    const mean = s.sumEnergy / s.n;
    expect(s.minEnergy).toBeGreaterThanOrEqual(10);
    expect(s.maxEnergy).toBeLessThanOrEqual(100);
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(60);
  });

  it('백호대살·괴강 성립률 = 일주 게이트 비율 (7/60 · 4/60) 을 넘지 않는다', () => {
    const baekho = (s.byName.get('백호대살') ?? 0) / s.n;
    const goegang = (s.byName.get('괴강') ?? 0) / s.n;
    expect(baekho).toBeCloseTo(7 / 60, 6);
    expect(goegang).toBeCloseTo(4 / 60, 6);
  });

  it('십이신살 12종의 성립률이 이론값과 정확히 일치한다', () => {
    // 격자에서 연·월·일·시 지지는 각각 12분의 1로 균일하고 서로 독립이다.
    // 연지는 자기 자신에 대해 三合局 위치에 따라 旺地→장성살 / 生地→지살 / 墓地→화개살 로 **항상** 매핑되므로
    //   장성살·지살·화개살 = 1/3 + 2/3 × (1 − (11/12)³)   ← 연지가 그 이름일 확률 1/3
    //   나머지 9종        = 1 − (11/12)³                  ← 월·일·시 지지 3칸에서만 나온다
    const base = 1 - (11 / 12) ** 3;
    const anchored = 1 / 3 + (2 / 3) * base;
    for (const name of SINSAL12) {
      const pct = (s.byName.get(name) ?? 0) / s.n;
      const want = ['장성살', '지살', '화개살'].includes(name) ? anchored : base;
      expect.soft(pct, name).toBeCloseTo(want, 10);
    }
  });

  it('지식카드 `sinsal:*` 30장이 전부 도달 가능하다', () => {
    // cards.json 의 sinsal key 전량. 하나라도 0이면 그 카드는 어떤 사주에서도 뽑히지 않는다.
    const CARD_KEYS = [
      '건록', '겁살', '고신', '공망', '과숙', '괴강', '귀문관살', '금여', '망신살', '문창귀인',
      '반안살', '백호대살', '비인살', '암록', '양인살', '역마살', '연살', '원진', '월덕귀인', '월살',
      '육해살', '장성살', '재살', '지살', '천덕귀인', '천살', '천을귀인', '학당귀인', '홍염살', '화개살',
    ];
    expect(CARD_KEYS).toHaveLength(30);
    for (const name of CARD_KEYS) {
      expect.soft(s.byName.get(name) ?? 0, name).toBeGreaterThan(0);
    }
  });

  it('원진·귀문관살은 관계와 신살 양쪽으로 나간다(같은 판정, 두 모양)', () => {
    expect(s.byRelation.get('원진') ?? 0).toBeGreaterThan(0);
    expect(s.byRelation.get('귀문') ?? 0).toBeGreaterThan(0);
    expect(s.byName.get('원진') ?? 0).toBeGreaterThan(0);
    expect(s.byName.get('귀문관살') ?? 0).toBeGreaterThan(0);
  });

  it('관계 13종 + 천간 3종이 전수에서 모두 관측된다', () => {
    for (const t of [
      '육합', '육충', '육해', '육파', '원진', '귀문',
      '삼합', '반합', '공합', '방합', '삼형', '형', '자형',
      '천간합', '천간충', '천간극',
    ]) {
      expect.soft(s.byRelation.get(t) ?? 0, t).toBeGreaterThan(0);
    }
  });

  it('사주 한 장당 신살 히트 수가 UI 가 감당할 범위다', () => {
    const per = s.hitsPerChart / s.n;
    expect(per).toBeGreaterThan(4);
    expect(per).toBeLessThan(14);
  });
});
