// L0 불변식 · 데이터 무결성 — 근거: C00 §6.2, §4.2, §3-A9/A11/A12, V4 정정 2건
// 골든셋이 잡지 못하는 계열(패킹 왕복, F3 불변, 갭/오버랩)을 여기서 막는다.

import { describe, expect, it } from 'vitest';
import {
  SOLAR_TERMS_BASE_YEAR,
  SOLAR_TERMS_COUNT,
  SOLAR_TERMS_MAX_YEAR,
} from '../../src/shared/data/solar-terms.packed';
import { BRANCHES, STEMS, ganjiIdxOf, ganjiOf } from '../../src/shared/lib/saju/constants';
import { computeFourPillars, jdnFromYmd } from '../../src/shared/lib/saju/pillars';
import { buildJieContext, findSolarTerm } from '../../src/shared/lib/saju/solar-terms';
import { normalizeTime, offsetAt, wallToUtc } from '../../src/shared/lib/saju/time';
import { computeCase, readCalcJson } from './harness';

const kstIso = (ms: number): string =>
  new Date(ms + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');

describe('60갑자 · JDN 불변식', () => {
  it('60갑자 인덱스 왕복: (6g − 5z) mod 60 === n', () => {
    for (let n = 0; n < 60; n++) {
      expect(ganjiIdxOf(n % 10, n % 12)).toBe(n);
      expect(ganjiOf(n)).toBe(STEMS[n % 10] + BRANCHES[n % 12]);
    }
  });

  it('일주 60일 주기 (1900-01-01 + 73,000일)', () => {
    const base = jdnFromYmd(1900, 1, 1);
    let bad = 0;
    for (let i = 0; i < 73000; i++) {
      if (ganjiOf(base + i - 11) !== ganjiOf(base + i + 60 - 11)) bad++;
    }
    expect(bad).toBe(0);
  });

  it('JDN 앵커 5점 (C03 TV-1)', () => {
    const anchors: [number, number, number, number, string][] = [
      [1900, 1, 1, 2415021, '甲戌'],
      [1949, 10, 1, 2433191, '甲子'],
      [1992, 10, 24, 2448920, '癸酉'],
      [2000, 1, 1, 2451545, '戊午'],
      [2026, 8, 11, 2461264, '丁巳'],
    ];
    for (const [y, m, d, jdn, pillar] of anchors) {
      expect(jdnFromYmd(y, m, d)).toBe(jdn);
      expect(ganjiOf(jdn - 11)).toBe(pillar);
    }
  });

  it('일주 외부 앵커 — 율리우스/그레고리 자동 분기 (골든셋 dayPillarAnchors)', () => {
    const golden = readCalcJson<{
      dayPillarAnchors: { date: string; dayPillar: string; calendar: string }[];
    }>('golden-set.json');
    const julianJdn = (y: number, m: number, d: number): number => {
      const a = Math.floor((14 - m) / 12);
      const yy = y + 4800 - a;
      const mm = m + 12 * a - 3;
      return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
    };
    for (const a of golden.dayPillarAnchors) {
      const negative = a.date.startsWith('-');
      const [ys, ms, ds] = (negative ? a.date.slice(1) : a.date).split('-');
      const y = (negative ? -1 : 1) * Number(ys);
      const jdn = jdnFromYmd(y, Number(ms), Number(ds));
      expect(ganjiOf(jdn - 11), a.date).toBe(a.dayPillar);
      if (a.calendar === 'julian') expect(jdn).toBe(julianJdn(y, Number(ms), Number(ds)));
    }
  });
});

describe('절기 테이블 무결성 (패킹 왕복)', () => {
  const raw = readCalcJson<{ year: number; sunLng: number; utc: string }[]>(
    'proto/solarterms-de440s.json',
  );

  it(`원본 ${raw.length}건과 ms 단위까지 완전 일치`, () => {
    expect(raw.length).toBe(SOLAR_TERMS_COUNT);
    let mismatched = 0;
    for (const r of raw) {
      const hit = findSolarTerm(r.year, r.sunLng);
      if (hit === null || hit.utcMs !== Date.parse(r.utc)) mismatched++;
    }
    expect(mismatched).toBe(0);
  });

  it(`범위 = ${SOLAR_TERMS_BASE_YEAR}~${SOLAR_TERMS_MAX_YEAR}, 지원범위(1900~2100)를 넉넉히 덮는다`, () => {
    expect(SOLAR_TERMS_BASE_YEAR).toBeLessThan(1900);
    expect(SOLAR_TERMS_MAX_YEAR).toBeGreaterThan(2100);
    expect(findSolarTerm(1900, 315)?.precision).toBe('de440s');
    expect(findSolarTerm(2100, 315)?.precision).toBe('de440s');
  });

  it('인접 절기 간격 게이트 [21180, 22665]분 (C00 §4.2)', () => {
    let violations = 0;
    let prev: number | null = null;
    for (let y = SOLAR_TERMS_BASE_YEAR; y <= SOLAR_TERMS_MAX_YEAR; y++) {
      for (const lng of [285, 300, 315, 330, 345, 0, 15, 30, 45, 60, 75, 90,
                         105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270]) {
        const t = findSolarTerm(y, lng)!.utcMs;
        if (prev !== null) {
          const gap = (t - prev) / 60000;
          if (!(gap >= 21180 && gap <= 22665)) violations++;
        }
        prev = t;
      }
    }
    expect(violations).toBe(0);
  });

  it('입춘 초정밀 앵커 2024/2025/2026 (KST)', () => {
    expect(kstIso(findSolarTerm(2024, 315)!.utcMs)).toBe('2024-02-04 17:27:07');
    expect(kstIso(findSolarTerm(2025, 315)!.utcMs)).toBe('2025-02-03 23:10:28');
    expect(kstIso(findSolarTerm(2026, 315)!.utcMs)).toBe('2026-02-04 05:02:07');
  });
});

describe('표준시 이력 (C15 / C20)', () => {
  it('1954 전환은 15:30Z 다 — tzdb 의 15:00Z 는 대통령령 제876호 「零時三十分」 누락 (§3-A9)', () => {
    expect(offsetAt(Date.UTC(1954, 2, 20, 15, 29, 59)).std).toBe(540);
    expect(offsetAt(Date.UTC(1954, 2, 20, 15, 30, 0)).std).toBe(510);
  });

  it('1954-03-21 00:00~00:29 는 오버랩 창이고 FIRST(더 이른 UTC)를 고른다 (§3-A12)', () => {
    const r = wallToUtc(1954, 3, 21, 0, 10);
    expect(r.anomalies).toEqual(['OVERLAP']);
    expect(new Date(r.utcMs).toISOString()).toBe('1954-03-20T15:10:00.000Z');
    expect(wallToUtc(1954, 3, 21, 0, 30).anomalies).toEqual([]);
  });

  it('1988-05-08 02:30 은 갭이고 SHIFT_FORWARD 로 17:30Z 가 된다 (V4 정정 ②)', () => {
    const r = wallToUtc(1988, 5, 8, 2, 30);
    expect(r.anomalies).toEqual(['GAP']);
    expect(new Date(r.utcMs).toISOString()).toBe('1988-05-07T17:30:00.000Z');
    expect(r.offsetMinutes).toBe(600);

    const { pillars } = computeCase({
      date: '1988-05-08', time: '02:30', gender: 'M', calendarType: 'solar',
      longitude: 126.9784204, tzMode: 'historical', jasiRule: 'yajasi', region: 'KR',
    });
    // C00 §S1-1(b) 검산: apparent 02:01:2x → 戊辰 丁巳 癸亥 癸丑
    expect([pillars.year.ganji, pillars.month.ganji, pillars.day.ganji, pillars.hour!.ganji])
      .toEqual(['戊辰', '丁巳', '癸亥', '癸丑']);
  });

  it('1955~1960 서머타임 총오프셋은 +09:30 이다 (§3-A7)', () => {
    expect(offsetAt(Date.UTC(1958, 5, 1, 0, 0, 0)).total).toBe(570);
  });

  it('1908 이전은 LMT +08:27:52 (§3-A8)', () => {
    expect(offsetAt(Date.UTC(1900, 0, 1)).std).toBeCloseTo(507.8667, 4);
  });
});

describe('I17 — 연주·월주는 longitude / jasiRule 에 불변이다 (F3)', () => {
  it('1900~2100 을 훑는 결정론 표본 2,400건에서 위반 0', () => {
    let violations = 0;
    for (let y = 1900; y <= 2100; y += 1) {
      for (const [m, d, hh, mi] of [[2, 3, 23, 20], [1, 5, 0, 30], [8, 7, 12, 0], [12, 7, 23, 59]] as const) {
        const base = {
          date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          time: `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
          gender: 'M' as const,
          calendarType: 'solar',
          tzMode: 'historical' as const,
          region: 'KR' as const,
        };
        const a = computeCase({ ...base, longitude: 126.9784204, jasiRule: 'yajasi' }).pillars;
        const b = computeCase({ ...base, longitude: null, jasiRule: 'johjasi' }).pillars;
        if (a.year.ganji !== b.year.ganji || a.month.ganji !== b.month.ganji) violations++;
      }
    }
    expect(violations).toBe(0);
  });
});

describe('applyTrueSolarToDayBoundary 플래그 (C00 §3-A2 vs C23)', () => {
  const seoul = { region: 'KR' as const, longitude: 126.9784204, applyTz: true };

  it('기본값(적용)은 A2 를 따른다 — 2024-06-15 00:10 서울 → 己酉일 甲子시', () => {
    const time = normalizeTime({ year: 2024, month: 6, day: 15, hour: 0, minute: 10 }, seoul);
    const jie = buildJieContext(time.instantUtcMs);
    const p = computeFourPillars(time, jie, {
      jasiRule: 'yajasi', applyTrueSolarToDayBoundary: true, threePillarMode: false,
    });
    expect([p.day.ganji, p.hour!.ganji]).toEqual(['己酉', '甲子']);
  });

  it('끄면 일주만 벽시계 자정 기준으로 바뀐다 → 庚戌일 (시주는 그대로 진태양시)', () => {
    const time = normalizeTime({ year: 2024, month: 6, day: 15, hour: 0, minute: 10 }, seoul);
    const jie = buildJieContext(time.instantUtcMs);
    const p = computeFourPillars(time, jie, {
      jasiRule: 'yajasi', applyTrueSolarToDayBoundary: false, threePillarMode: false,
    });
    expect(p.day.ganji).toBe('庚戌');
    expect(p.year.ganji).toBe('甲辰'); // 연·월주는 플래그에 불변
  });
});

describe('야자시 3유파 (C00 §S3-5 c)', () => {
  const base = {
    date: '1990-05-05', time: '23:30', gender: 'M' as const, calendarType: 'solar',
    longitude: null, tzMode: 'raw_kst' as const, region: 'KR' as const,
  };
  it('yajasi / johjasi / yajasi-nextstem 이 문서의 실측표와 일치한다', () => {
    const q = (rule: 'yajasi' | 'johjasi' | 'yajasi-nextstem'): string => {
      const p = computeCase({ ...base, jasiRule: rule }).pillars;
      return `${p.year.ganji} ${p.month.ganji} ${p.day.ganji} ${p.hour!.ganji}`;
    };
    expect(q('yajasi')).toBe('庚午 庚辰 庚午 丙子');
    expect(q('johjasi')).toBe('庚午 庚辰 辛未 戊子');
    expect(q('yajasi-nextstem')).toBe('庚午 庚辰 庚午 戊子');
  });
});
