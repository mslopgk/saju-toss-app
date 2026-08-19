// 축② 프로덕션 회귀 — golden-set-prod.json 321건 (C00 §F10 ② / §6.3)
// 확정 유파: historical TZ + TRUE_SOLAR + 출생지 경도 + yajasi.
// **머지 게이트는 이 축이다.** 축①의 수치를 프로덕션 게이트로 쓰면 안 된다.

import { describe, expect, it } from 'vitest';
import { tenGodsOfGanji } from '../../src/shared/lib/saju/ten-gods';
import type { GoldenCase } from './harness';
import { computeCase, directionOf, expectedQuad, quadOf, readCalcJson } from './harness';

interface ProdSet {
  axis: string;
  convention: Record<string, string | number>;
  counts: Record<string, number>;
  cases: GoldenCase[];
  needsReCollection: GoldenCase[];
}

const P = readCalcJson<ProdSet>('golden-set-prod.json');

describe('축② 메타 · 규약 무결성', () => {
  it('axis=production, 확정 유파가 C00 §3 과 일치', () => {
    expect(P.axis).toBe('production');
    expect(P.convention).toMatchObject({
      tzMode: 'historical',
      trueSolarMode: 'TRUE_SOLAR',
      jasiRule: 'yajasi',
      eotAlgorithm: 'NOAA_MEEUS',
      gapPolicy: 'SHIFT_FORWARD',
      overlapPolicy: 'FIRST',
      defaultLongitude: 126.9784204,
    });
    expect(P.cases.length).toBe(321);
    expect(P.needsReCollection.length).toBe(80);
  });

  it('전 케이스가 longitude 숫자 + (KR:ianaTz | GENERIC:std+dst) 를 갖는다', () => {
    for (const c of [...P.cases, ...P.needsReCollection]) {
      expect(typeof c.input.longitude, c.id).toBe('number');
      if (c.input.region === 'GENERIC') {
        expect(typeof c.input.stdOffsetMinutes, c.id).toBe('number');
        expect(typeof c.input.dstMinutes, c.id).toBe('number');
      } else {
        expect(c.input.ianaTz, c.id).toBe('Asia/Seoul');
      }
      expect(c.input.tzMode, c.id).toBe('historical');
      expect(c.input.jasiRule, c.id).toBe('yajasi');
      expect(c.input.trueSolarMode, c.id).toBe('TRUE_SOLAR');
    }
  });

  it('F3 정정본이다 — 서울 2025-02-03 23:20 TRUE_SOLAR → 乙巳 戊寅', () => {
    const { pillars } = computeCase({
      date: '2025-02-03',
      time: '23:20',
      gender: 'M',
      calendarType: 'solar',
      longitude: 126.9784204,
      tzMode: 'historical',
      jasiRule: 'yajasi',
      region: 'KR',
    });
    expect(`${pillars.year.ganji} ${pillars.month.ganji}`).toBe('乙巳 戊寅');
  });
});

describe(`축② 4기둥 재현 (n=${P.cases.length})`, () => {
  for (const c of P.cases) {
    it(`${c.id} ${c.input.date} ${c.input.time}`, () => {
      expect(quadOf(computeCase(c.input).pillars), `${c.id} :: ${c.label ?? ''}`).toEqual(
        expectedQuad(c.expected!),
      );
    });
  }
});

describe('축② 십신 · 대운 · 교운절대순간 · sajuYear/dayJdn', () => {
  it(`십신 ${P.cases.length}건`, () => {
    for (const c of P.cases) {
      const e = c.expected!;
      const got = tenGodsOfGanji({
        yearPillar: e.yearPillar!,
        monthPillar: e.monthPillar!,
        dayPillar: e.dayPillar!,
        hourPillar: e.hourPillar!,
      });
      expect(got, c.id).toEqual(e.tenGods);
    }
  });

  it(`대운수·방향 ${P.cases.length}건`, () => {
    for (const c of P.cases) {
      const d = computeCase(c.input).daewoon;
      expect({ n: d.daewoonNumber, dir: directionOf(d) }, c.id).toEqual({
        n: c.expected!.daewoonNumber,
        dir: c.expected!.daewoonDirection,
      });
    }
  });

  it('교운 절대순간 changeoverUtcMs — C00 §5.2 게이트 ±60초', () => {
    let maxAbsSec = 0;
    for (const c of P.cases) {
      const d = computeCase(c.input).daewoon;
      const absSec = Math.abs(d.changeoverUtcMs - c.expected!.changeoverUtcMs!) / 1000;
      maxAbsSec = Math.max(maxAbsSec, absSec);
      expect(absSec, c.id).toBeLessThanOrEqual(60);
    }
    // ref.mjs 와 동일 산술이므로 실제로는 완전 일치해야 한다
    expect(maxAbsSec).toBe(0);
  });

  it('sajuYear · dayJdn 도 재현된다', () => {
    for (const c of P.cases) {
      const { pillars } = computeCase(c.input);
      expect(pillars.sajuYear, c.id).toBe(c.expected!.sajuYear);
      expect(pillars.dayJdn, c.id).toBe(c.expected!.dayJdn);
    }
  });
});

describe('축② F3 판별력 — 절입 직후 0~46분 창', () => {
  const f3 = P.cases.filter((c) => c.family === 'F3-절입직후창');
  it(`판별 케이스가 존재한다 (n=${f3.length})`, () => {
    expect(f3.length).toBeGreaterThan(0);
  });
  it('F3 위반 구현과 연·월주가 실제로 갈린다', () => {
    for (const c of f3) {
      expect(c.f3Discriminator!.violatingImpl, c.id).not.toBe(c.f3Discriminator!.correct);
      expect(`${c.expected!.yearPillar} ${c.expected!.monthPillar}`, c.id).toBe(
        c.f3Discriminator!.correct,
      );
    }
  });
});
