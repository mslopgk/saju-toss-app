// S7 회귀 — 근거: `docs/research/calc/golden-astro.json`(39벡터), C19, C00 §S7 · §3-G
//
// 골든셋 JSON 은 앱 번들에 넣지 않는다(CI 전용 자산). 리서치 워크스페이스에서 직접 읽는다.
// 기준값 `own` 은 C19 의 자체구현(VSOP87D + Meeus47 60+60항 + USNO ΔT + GAST + Asc1)이고
// astronomy-engine / Skyfield(DE440s) 3자 대조를 통과한 값이다.

import { describe, expect, it } from 'vitest';
import astroTables from '../../src/shared/data/astro-tables.json';
import {
  MOON_BADGE_DEG,
  SIGNS,
  deltaTFromJd,
  jdFromMs,
  moonAt,
  nutationDpsiArcsec,
  sunSample,
} from '../../src/shared/lib/saju/astro';
import { computeChart } from '../../src/shared/lib/saju';
import { findSolarTerm } from '../../src/shared/lib/saju/solar-terms';
import type { RawBirthInput } from '../../src/shared/lib/saju/types';
import { readCalcJson } from './harness';

interface AstroVector {
  id: string;
  kind: string;
  note: string;
  wallLocal: string;
  utcMs: number | null;
  jdeDirect?: number;
  own: {
    deltaT?: number;
    sunLon?: number;
    sunSign?: number;
    moonLon?: number;
    moonLonGeo?: number;
    moonLat?: number;
    moonDist?: number;
    moonSign?: number;
  };
}
interface GoldenAstro {
  tolerance: { sunLonArcsec: number; moonLonArcsec: number };
  count: number;
  vectors: AstroVector[];
}

const GOLDEN = readCalcJson<GoldenAstro>('golden-astro.json');
const WITH_INSTANT = GOLDEN.vectors.filter((v) => v.utcMs !== null);
const ARCSEC = 3600;
const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

const SEOUL: RawBirthInput['birthPlace'] = { latitude: 37.5665, longitude: 126.9784204 };

describe('S7 · 골든셋 39벡터', () => {
  it('벡터 수와 절대순간 보유 수', () => {
    expect(GOLDEN.count).toBe(39);
    expect(GOLDEN.vectors).toHaveLength(39);
    expect(WITH_INSTANT).toHaveLength(38); // GA-37 은 TT 직접 입력(utcMs=null)
  });

  it('태양궁 — 38/38 완전 일치 (절기 테이블 이분탐색, 천문계산 0)', () => {
    for (const v of WITH_INSTANT) {
      expect.soft(sunSample(v.utcMs!).sign, v.id).toBe(v.own.sunSign);
    }
  });

  it('태양 황경 — 표시용 큐빅 보간이 골든값과 1′ 안에서 일치', () => {
    let max = 0;
    for (const v of WITH_INSTANT) {
      if (v.own.sunLon === undefined) continue;
      max = Math.max(max, Math.abs(wrapDeg(sunSample(v.utcMs!).lon - v.own.sunLon)) * ARCSEC);
    }
    // 궁 판정은 보간과 무관하다(노드에서 직접 나온다). 이 값은 화면에 찍히는 도·분의 오차 한계다.
    expect(max).toBeLessThan(60);
  });

  it('달별자리 — 38/38 완전 일치', () => {
    for (const v of WITH_INSTANT) {
      const jde = jdFromMs(v.utcMs!) + deltaTFromJd(jdFromMs(v.utcMs!)) / 86400;
      expect.soft(Math.floor(moonAt(jde).lon / 30), v.id).toBe(v.own.moonSign);
    }
  });

  it('달 황경 — 골든 허용오차(20″) 안, 실측 최대 1″ 미만', () => {
    let max = 0;
    for (const v of WITH_INSTANT) {
      if (v.own.moonLon === undefined) continue;
      const jd = jdFromMs(v.utcMs!);
      const d = Math.abs(wrapDeg(moonAt(jd + deltaTFromJd(jd) / 86400).lon - v.own.moonLon)) * ARCSEC;
      max = Math.max(max, d);
    }
    expect(max).toBeLessThan(GOLDEN.tolerance.moonLonArcsec);
    expect(max).toBeLessThan(1);
  });

  it('ΔT — 0.5년 재표본 격자가 USNO 원표와 0.1초 안에서 일치', () => {
    let max = 0;
    for (const v of WITH_INSTANT) {
      if (v.own.deltaT === undefined) continue;
      max = Math.max(max, Math.abs(deltaTFromJd(jdFromMs(v.utcMs!)) - v.own.deltaT));
    }
    expect(max).toBeLessThan(0.1);
    // 달로 환산하면 0.549″/초 × 0.1초 = 0.055″ — 궁 경계(108,000″)에 견줘 무시 가능
  });

  it('GA-37 Meeus 예제 47.a — 출판된 자릿수를 그대로 재현한다', () => {
    const v = GOLDEN.vectors.find((x) => x.id === 'GA-37')!;
    const jde = v.jdeDirect!;
    const m = moonAt(jde);
    const geo = m.lon - nutationDpsiArcsec(jde) / 3600;
    expect(geo).toBeCloseTo(133.162655, 6);
    expect(m.lat).toBeCloseTo(-3.229126, 6);
    expect(m.distKm).toBeCloseTo(368409.7, 1);
    // 겉보기(장동 포함)도 골든과 맞는다 — 저정밀 Δψ 라 0.5″ 를 허용한다
    expect(Math.abs(m.lon - v.own.moonLon!) * ARCSEC).toBeLessThan(0.5);
    expect(Math.floor(m.lon / 30)).toBe(v.own.moonSign);
  });

  it('경계 벡터 6쌍 — 2분 차이로 궁이 실제로 갈린다', () => {
    const pairs: [string, string][] = [
      ['GA-13', 'GA-14'],
      ['GA-15', 'GA-16'],
      ['GA-17', 'GA-18'],
      ['GA-19', 'GA-20'],
      ['GA-21', 'GA-22'],
      ['GA-23', 'GA-24'],
    ];
    for (const [a, b] of pairs) {
      const va = GOLDEN.vectors.find((x) => x.id === a)!;
      const vb = GOLDEN.vectors.find((x) => x.id === b)!;
      expect(vb.utcMs! - va.utcMs!).toBe(120000);
      const sunA = sunSample(va.utcMs!).sign;
      const sunB = sunSample(vb.utcMs!).sign;
      const moonA = Math.floor(moonAt(jdFromMs(va.utcMs!) + deltaTFromJd(jdFromMs(va.utcMs!)) / 86400).lon / 30);
      const moonB = Math.floor(moonAt(jdFromMs(vb.utcMs!) + deltaTFromJd(jdFromMs(vb.utcMs!)) / 86400).lon / 30);
      expect.soft(sunA, `${a} sun`).toBe(va.own.sunSign);
      expect.soft(sunB, `${b} sun`).toBe(vb.own.sunSign);
      expect.soft(moonA, `${a} moon`).toBe(va.own.moonSign);
      expect.soft(moonB, `${b} moon`).toBe(vb.own.moonSign);
    }
  });
});

describe('S7 · 12궁 데이터 무결성', () => {
  it('12개 · 경계 황경 = index × 30 · 원소는 4주기 반복', () => {
    expect(SIGNS).toHaveLength(12);
    const cycle = ['fire', 'earth', 'air', 'water'];
    SIGNS.forEach((s, i) => {
      expect(s.index).toBe(i);
      expect(s.lambda).toBe(i * 30);
      expect(s.element).toBe(cycle[i % 4]);
    });
  });

  it('사인 id 는 지식카드 `zodiac:*` 의 key 와 같다', () => {
    expect(SIGNS.map((s) => s.id)).toEqual([
      'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
      'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
    ]);
  });

  it('★ 12궁 경계 = 24절기 중 12중기 (C19 §3.5) — 표에서 실제로 조회된다', () => {
    // 이 성질이 깨지면 태양궁은 추가 데이터 없이 구할 수 없다.
    for (const s of SIGNS) {
      const hit = findSolarTerm(2024, s.lambda);
      expect(hit, `${s.midTerm.ko} λ=${s.lambda}`).not.toBeNull();
      expect(hit!.precision).toBe('de440s');
    }
  });

  it('고정 날짜표를 쓰지 않는다 — 같은 날 10분 차이로 궁이 바뀐다 (C00 §S7-2)', () => {
    // 2000-03-20 춘분 입궁 = 16:35:15 KST. 어떤 고정표도 이 날의 절반을 틀린다.
    const at = (h: number, m: number) => Date.UTC(2000, 2, 20, h - 9, m);
    expect(sunSample(at(16, 30)).sign).toBe(11); // 물고기자리
    expect(sunSample(at(16, 40)).sign).toBe(0); // 양자리
  });

  it('입궁 정각은 새 궁에 포함된다(좌폐구간)', () => {
    const cusp = findSolarTerm(2024, 0)!.utcMs; // 2024 춘분
    expect(sunSample(cusp).sign).toBe(0);
    expect(sunSample(cusp - 1).sign).toBe(11);
  });
});

describe('S7 · ΔT 로더', () => {
  const dt = astroTables.deltaT.data;
  it('격자 메타가 코드 가정과 맞는다', () => {
    expect(dt.stepYears).toBe(0.5);
    expect(dt.unitSeconds).toBe(0.01);
    expect(dt.values.length).toBeGreaterThan(200);
  });
  it('알려진 값 — 1900.0 ≈ −2.70초 / 2000.0 ≈ 63.83초', () => {
    const jd1900 = jdFromMs(Date.UTC(1900, 0, 1));
    const jd2000 = jdFromMs(Date.UTC(2000, 0, 1));
    expect(deltaTFromJd(jd1900)).toBeCloseTo(-2.7, 1);
    expect(deltaTFromJd(jd2000)).toBeCloseTo(63.83, 1);
  });
  it('격자 밖(2034~2100)에서도 연속이고 단조증가다', () => {
    let prev = deltaTFromJd(jdFromMs(Date.UTC(2033, 0, 1)));
    for (let y = 2034; y <= 2100; y += 1) {
      const v = deltaTFromJd(jdFromMs(Date.UTC(y, 0, 1)));
      expect(v).toBeGreaterThan(prev);
      expect(v - prev).toBeLessThan(5); // 단차 없음
      prev = v;
    }
  });
});

describe('S7 · computeChart 결선', () => {
  const raw = (over: Partial<RawBirthInput>): RawBirthInput => ({
    calendarType: 'solar',
    year: 1990,
    month: 5,
    day: 15,
    hour: 13,
    minute: 30,
    timeUnknown: false,
    gender: 'M',
    birthPlace: SEOUL,
    ...over,
  });

  it('C00 §3-G13 — 별자리는 진태양시가 아니라 절대순간을 쓴다', () => {
    const chart = computeChart(raw({}));
    expect(chart.astro.trueSolarApplied).toBe(false);
    expect(chart.astro.jdUt).toBe(jdFromMs(chart.time.instantUtcMs));
    // 진태양시 프레임과 실제로 다르다(같으면 이 테스트가 아무것도 지키지 못한다)
    expect(chart.time.apparent.ms).not.toBe(chart.time.instantUtcMs);
    expect(chart.astro.jdUt).not.toBe(jdFromMs(chart.time.apparent.ms));
  });

  it('C00 §3-G14 — 서머타임이 적용된 절대순간을 그대로 받는다', () => {
    // 1988-08-15 14:00 벽시계는 서머타임(+10) 구간이다. 골든 GA-31 의 utcMs 와 같아야 한다.
    const ga31 = GOLDEN.vectors.find((v) => v.id === 'GA-31')!;
    const chart = computeChart(
      raw({ year: 1988, month: 8, day: 15, hour: 14, minute: 0 }),
    );
    expect(chart.time.instantUtcMs).toBe(ga31.utcMs);
    expect(chart.astro.jdUt).toBe(jdFromMs(ga31.utcMs!));
    expect(chart.astro.sun.sign).toBe(4);
    expect(chart.astro.moon.sign).toBe(5);
  });

  it('C00 §3-G15 — ASC 는 항상 미산출', () => {
    expect(computeChart(raw({})).astro.asc).toBeNull();
    expect(computeChart(raw({ timeUnknown: true })).astro.asc).toBeNull();
  });

  it('C00 §3-G1 — Tropical 고정', () => {
    expect(computeChart(raw({})).astro.zodiac).toBe('tropical');
  });

  it('생시를 알면 두 궁 병기가 붙지 않는다', () => {
    const chart = computeChart(raw({}));
    expect(chart.astro.moon.assumedNoon).toBe(false);
    expect(chart.astro.moon.alsoSign).toBeNull();
    expect(chart.astro.sun.alsoSign).toBeNull();
  });

  it('생시 모름 — 달은 12:00 가정으로 산출하고 경계면 두 궁을 병기한다 (C00 §3-G15b)', () => {
    const chart = computeChart(raw({ timeUnknown: true, hour: undefined, minute: undefined }));
    expect(chart.astro.moon.assumedNoon).toBe(true);
    expect(MOON_BADGE_DEG).toBe(5);
    const within = chart.astro.moon.lon - chart.astro.moon.sign * 30;
    const shouldBadge = within < MOON_BADGE_DEG || within > 30 - MOON_BADGE_DEG;
    expect(chart.astro.moon.alsoSign !== null).toBe(shouldBadge);
  });

  it('생시 모름 — 출생일에 입궁 시각이 있으면 태양궁도 두 궁을 병기한다', () => {
    // 2000-03-20 KST 는 16:35:15 에 입궁한다 → 12:00 가정이면 물고기자리, 실제로는 절반이 양자리
    const chart = computeChart(
      raw({ year: 2000, month: 3, day: 20, timeUnknown: true, hour: undefined, minute: undefined }),
    );
    expect(chart.astro.sun.sign).toBe(11);
    expect(chart.astro.sun.alsoSign).toBe(0);
    expect(chart.astro.sun.alsoSignKo).toBe('양자리');
    // 입궁이 없는 날은 병기하지 않는다
    const plain = computeChart(
      raw({ year: 2000, month: 4, day: 5, timeUnknown: true, hour: undefined, minute: undefined }),
    );
    expect(plain.astro.sun.alsoSign).toBeNull();
  });

  it('deg·min 이 궁 안에 갇힌다 (0..29도)', () => {
    for (const day of [1, 10, 20, 28]) {
      const c = computeChart(raw({ month: 3, day }));
      for (const p of [c.astro.sun, c.astro.moon]) {
        expect(p.deg).toBeGreaterThanOrEqual(0);
        expect(p.deg).toBeLessThan(30);
        expect(p.min).toBeGreaterThanOrEqual(0);
        expect(p.min).toBeLessThan(60);
        expect(Math.floor(p.lon / 30)).toBe(p.sign);
        expect(p.signKo).toBe(SIGNS[p.sign].ko);
        expect(p.signId).toBe(SIGNS[p.sign].id);
      }
    }
  });

  it('결정론 — 같은 입력이면 비트 단위로 같다', () => {
    const a = computeChart(raw({}));
    const b = computeChart(raw({}));
    expect(JSON.stringify(a.astro)).toBe(JSON.stringify(b.astro));
  });

  it('지원범위 양 끝(1900 · 2100)에서 예외가 없다', () => {
    for (const year of [1900, 2100]) {
      const c = computeChart(raw({ year, month: 6, day: 15 }));
      expect(c.astro.sun.sign).toBeGreaterThanOrEqual(0);
      expect(c.astro.moon.sign).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(c.astro.deltaTSeconds)).toBe(true);
    }
  });
});
