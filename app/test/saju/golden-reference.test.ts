// 축① 레퍼런스 회귀 — golden-set.json 287건 (C00 §F10 ① / §6.3)
// 각 케이스에 **기록된 규약**(tzMode / longitude / jasiRule / region / std+dst)으로 재현한다.
// 이 수치는 프로덕션 머지 게이트가 아니다(축②가 게이트다).

import { describe, expect, it } from 'vitest';
import { tenGodsOfGanji } from '../../src/shared/lib/saju/ten-gods';
import type { GoldenCase } from './harness';
import { computeCase, directionOf, expectedQuad, quadOf, readCalcJson } from './harness';

interface GoldenSet {
  axis: string;
  count: number;
  revision: { version: string };
  conventions: Record<string, string>;
  cases: GoldenCase[];
  dayPillarAnchors: { date: string; dayPillar: string; calendar: string; source: string }[];
}

const GOLDEN = readCalcJson<GoldenSet>('golden-set.json');
const withPillars = GOLDEN.cases.filter((c) => c.expected?.yearPillar);
const withDaewoon = GOLDEN.cases.filter((c) => c.expected?.daewoonNumber !== undefined);

describe('축① 메타', () => {
  it('axis=reference · golden-set v1.1 · count 정합', () => {
    expect(GOLDEN.axis).toBe('reference');
    expect(GOLDEN.revision.version).toBe('golden-set v1.1');
    expect(GOLDEN.count).toBe(GOLDEN.cases.length);
    expect(GOLDEN.cases.length).toBe(287);
    expect(withPillars.length).toBe(280);
    expect(withDaewoon.length).toBe(275);
  });
});

describe(`축① 4기둥 (n=${withPillars.length})`, () => {
  for (const c of withPillars) {
    it(`${c.id} ${c.input.date} ${c.input.time} [${c.confidence}]`, () => {
      const got = quadOf(computeCase(c.input).pillars);
      expect(got, `${c.id} :: ${c.label ?? ''}`).toEqual(expectedQuad(c.expected!));
    });
  }
});

describe(`축① 십신 (4기둥 파생)`, () => {
  for (const c of withPillars) {
    if (!c.expected?.tenGods) continue;
    it(`${c.id} 십신`, () => {
      const e = c.expected!;
      const got = tenGodsOfGanji({
        yearPillar: e.yearPillar!,
        monthPillar: e.monthPillar!,
        dayPillar: e.dayPillar!,
        hourPillar: e.hourPillar!,
      });
      expect(got).toEqual(e.tenGods);
    });
  }
});

describe(`축① 대운수·방향 (n=${withDaewoon.length})`, () => {
  for (const c of withDaewoon) {
    it(`${c.id} 대운수=${c.expected?.daewoonNumber} ${c.expected?.daewoonDirection}`, () => {
      const d = computeCase(c.input).daewoon;
      expect({ n: d.daewoonNumber, dir: directionOf(d) }, c.id).toEqual({
        n: c.expected!.daewoonNumber,
        dir: c.expected!.daewoonDirection,
      });
    });
  }
});

describe('축① 규약 재확인 (C00 §6.3)', () => {
  it('max(1,·) 클램프는 규범이다 — 빼면 275건 중 216건만 통과한다', () => {
    let withClamp = 0;
    let without = 0;
    let rawZero = 0;
    let deltaLt3 = 0;
    for (const c of withDaewoon) {
      const d = computeCase(c.input).daewoon;
      const deltaDays = d.deltaMinutes / 1440;
      const raw = Math.round(Math.floor(deltaDays) / 3);
      if (Math.floor(deltaDays) < 3) deltaLt3++;
      if (Math.max(1, raw) === c.expected!.daewoonNumber) withClamp++;
      if (raw === c.expected!.daewoonNumber) without++;
      else if (raw === 0) rawZero++;
    }
    expect(withClamp).toBe(275);
    expect(without).toBe(216);
    expect(rawZero).toBe(59);
    expect(deltaLt3).toBe(65);
  });

  it('4기둥 없는 케이스는 정확히 7건 (G-C06-TV-3-A~G) 이고 전부 pillarsOmitted 다', () => {
    const noPillars = GOLDEN.cases.filter((c) => !c.expected?.yearPillar);
    expect(noPillars.map((c) => c.id).sort()).toEqual([
      'G-C06-TV-3-A', 'G-C06-TV-3-B', 'G-C06-TV-3-C', 'G-C06-TV-3-D',
      'G-C06-TV-3-E', 'G-C06-TV-3-F', 'G-C06-TV-3-G',
    ]);
    for (const c of noPillars) expect(c.expected?.pillarsOmitted).toBe(true);
  });

  it('해외 케이스 4건은 std/dst 를 넘겨야만 통과한다 (음성 대조)', () => {
    const xs = GOLDEN.cases.filter((c) => c.input.region === 'GENERIC');
    expect(xs.length).toBe(4);
    let brokenAsKr = 0;
    for (const c of xs) {
      expect(quadOf(computeCase(c.input).pillars), c.id).toEqual(expectedQuad(c.expected!));
      const asKr = quadOf(computeCase({ ...c.input, region: 'KR' }).pillars);
      if (asKr.join(' ') !== expectedQuad(c.expected!).join(' ')) brokenAsKr++;
    }
    expect(brokenAsKr).toBe(4);
  });

  it('G-EDGE-104 는 DE440s 기준 정답을 유지한다 (정정 철회 케이스)', () => {
    const c = GOLDEN.cases.find((x) => x.id === 'G-EDGE-104')!;
    expect(expectedQuad(c.expected!)).toEqual(['己未', '丁丑', '丁丑', '壬寅']);
    expect(quadOf(computeCase(c.input).pillars)).toEqual(['己未', '丁丑', '丁丑', '壬寅']);
  });
});
