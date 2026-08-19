// S0-2 음력 ↔ 양력 회귀 — 근거: C00 §S0-2, §4.1 자산 A7, §S0-1(범위 가드)
//
// 이 파일이 지키는 것은 **표 하나가 밀리면 그 뒤 전부가 밀린다**는 성질이다.
// `lunar-table.packed.ts` 는 각 해 정월 초하루를 저장하지 않고 월 길이 누적으로 만들어 내므로,
// 대소월 비트 하나만 뒤집혀도 그 이후 200년이 하루씩 어긋난다. 표본 검사로는 안 잡힌다.
// 그래서 전 구간 전수 왕복을 돌린다(음→양→음 73,767건 · 양→음→양 73,414건).
//
// manseryeok 대조는 여기서 하지 않는다 — 그건 추출 시점의 일이고
// (`src/shared/data/tools/gen-lunar-table.mjs` 가 같은 두 축을 전수로 돌린다),
// 이 파일은 런타임 코드가 그 표를 **자기 힘으로** 일관되게 읽는지만 본다.

import { describe, expect, it } from 'vitest';
import {
  LUNAR_BASE_YEAR,
  LUNAR_MAX_YEAR,
  computeChart,
  isValidLunarDate,
  lunarJdn,
  lunarLeapMonthOf,
  lunarMonthDays,
  lunarMonthsOf,
  lunarTableSolarJdnRange,
  lunarToSolar,
  solarJdn,
  solarToLunar,
} from '../../src/shared/lib/saju';
import { jdnFromYmd } from '../../src/shared/lib/saju/pillars';
import type { EngineErrorCode, RawBirthInput } from '../../src/shared/lib/saju';
import { EngineError } from '../../src/shared/lib/saju';
// 배럴(`shared/interpret`)이 아니라 파일을 직접 집는다 — 이 테스트는 화면이 아니지만
// 시스템 프롬프트를 끌고 오는 import 를 습관으로 만들지 않는다(ARCHITECTURE.md 두 진입점).
import { chartIdentityKey } from '../../src/shared/interpret/buildRequest';

const SOLAR_MIN = { year: 1900, month: 1, day: 1 };
const SOLAR_MAX = { year: 2100, month: 12, day: 31 };

describe('번들 경계 — lunar.ts 는 데이터 파일 말고 아무것도 import 하지 않는다', () => {
  // 온보딩 화면(초기 청크)이 이 모듈을 딥 임포트해서 음력 월 목록을 그린다.
  // 여기에 `./pillars` 나 `./types` 한 줄이 들어오면 간지·납음 상수가 초기 청크로 따라 들어온다.
  // 타입체크도 테스트도 전부 초록이라 번들을 굽기 전에는 아무도 모른다 — 그래서 소스를 직접 읽는다.
  const SOURCE = (
    import.meta.glob('../../src/shared/lib/saju/lunar.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
  )['../../src/shared/lib/saju/lunar.ts'];

  it('소스를 읽었다(테스트가 헛돌지 않는지)', () => {
    expect(SOURCE).toBeTypeOf('string');
    expect(SOURCE?.length ?? 0).toBeGreaterThan(500);
  });

  it('값 import 는 lunar-table.packed 하나뿐이다', () => {
    const specs: string[] = [];
    for (const m of (SOURCE ?? '').matchAll(/^\s*(?:import|export)\s+([\s\S]*?)\s*from\s*'([^']+)'/gm)) {
      if (/^type\b/.test((m[1] ?? '').trim())) continue;
      specs.push(m[2] ?? '');
    }
    expect(specs).toEqual(['../../data/lunar-table.packed']);
  });
});

describe('음력 표 범위', () => {
  it('양력 지원 범위(1900-01-01 ~ 2100-12-31)를 빈틈없이 덮는다', () => {
    const [from, to] = lunarTableSolarJdnRange();
    expect(from).toBeLessThanOrEqual(solarJdn(SOLAR_MIN.year, SOLAR_MIN.month, SOLAR_MIN.day));
    expect(to).toBeGreaterThanOrEqual(solarJdn(SOLAR_MAX.year, SOLAR_MAX.month, SOLAR_MAX.day));
  });

  it('표는 1899년부터다 — 양력 1900-01-01 이 음력 1899-12-01 이기 때문', () => {
    expect(LUNAR_BASE_YEAR).toBe(1899);
    expect(LUNAR_MAX_YEAR).toBe(2100);
    expect(solarToLunar(1900, 1, 1)).toEqual({ year: 1899, month: 12, day: 1, leap: false });
  });

  it('표 밖 연도는 null 이다 (예외를 던지지 않는다 — 판정은 엔진 S0 이 한다)', () => {
    expect(lunarToSolar(1898, 1, 1, false)).toBeNull();
    expect(lunarToSolar(2101, 1, 1, false)).toBeNull();
    expect(lunarLeapMonthOf(2101)).toBeNull();
    expect(lunarMonthsOf(1898)).toBeNull();
  });
});

describe('알려진 기준일', () => {
  // 실제 달력과 대조 가능한 앵커만 고른다 — 표가 통째로 밀리는 사고를 사람 눈으로 잡는 마지막 그물이다.
  const anchors: readonly [string, [number, number, number, boolean], [number, number, number]][] = [
    ['음력 기원(1900 정월 초하루)', [1900, 1, 1, false], [1900, 1, 31]],
    ['2023 설날', [2023, 1, 1, false], [2023, 1, 22]],
    ['2024 설날', [2024, 1, 1, false], [2024, 2, 10]],
    ['2025 설날', [2025, 1, 1, false], [2025, 1, 29]],
    ['2024 추석', [2024, 8, 15, false], [2024, 9, 17]],
    ['2020 윤4월 초하루', [2020, 4, 1, true], [2020, 5, 23]],
    ['표 마지막 달 초하루', [2100, 12, 1, false], [2100, 12, 31]],
  ];

  for (const [name, [y, m, d, leap], expected] of anchors) {
    it(name, () => {
      expect(lunarToSolar(y, m, d, leap)).toEqual({
        year: expected[0],
        month: expected[1],
        day: expected[2],
      });
      expect(solarToLunar(expected[0], expected[1], expected[2])).toEqual({
        year: y,
        month: m,
        day: d,
        leap,
      });
    });
  }

  it('윤달 위치가 실제 달력과 맞는다', () => {
    expect(lunarLeapMonthOf(1900)).toBe(8);
    expect(lunarLeapMonthOf(1999)).toBe(0);
    expect(lunarLeapMonthOf(2020)).toBe(4);
    expect(lunarLeapMonthOf(2023)).toBe(2);
    expect(lunarLeapMonthOf(2025)).toBe(6);
    expect(lunarLeapMonthOf(2100)).toBe(0);
  });
});

describe('실재하지 않는 음력 날짜', () => {
  it('없는 윤달은 거부한다', () => {
    expect(lunarLeapMonthOf(2024)).toBe(0);
    expect(lunarToSolar(2024, 5, 1, true)).toBeNull();
    // 윤달이 있는 해라도 **다른 달**의 윤달은 없다
    expect(lunarToSolar(2023, 3, 1, true)).toBeNull();
    expect(lunarToSolar(2023, 2, 1, true)).not.toBeNull();
  });

  it('소월(29일)의 30일은 거부한다', () => {
    let checkedShort = 0;
    for (let year = LUNAR_BASE_YEAR; year <= LUNAR_MAX_YEAR; year++) {
      for (const m of lunarMonthsOf(year) ?? []) {
        if (m.days !== 29) continue;
        expect(lunarToSolar(year, m.month, 30, m.leap)).toBeNull();
        checkedShort++;
      }
    }
    // 소월이 전체의 절반쯤은 되어야 한다(삭망월 29.53일). 0 이면 표를 잘못 읽은 것이다.
    expect(checkedShort).toBeGreaterThan(1000);
  });

  it('0일·13월·비정수를 거부한다', () => {
    expect(lunarToSolar(2024, 1, 0, false)).toBeNull();
    expect(lunarToSolar(2024, 13, 1, false)).toBeNull();
    expect(lunarToSolar(2024, 0, 1, false)).toBeNull();
    expect(lunarToSolar(2024.5, 1, 1, false)).toBeNull();
    expect(lunarToSolar(2024, 1, 1.5, false)).toBeNull();
    expect(isValidLunarDate(2024, 1, 31, false)).toBe(false);
  });
});

describe('전수 왕복 — 음 → 양 → 음', () => {
  it(`${LUNAR_BASE_YEAR}~${LUNAR_MAX_YEAR} 전 음력 날짜가 항등이다 (윤달 포함)`, () => {
    const failures: string[] = [];
    let checked = 0;
    let leapChecked = 0;
    let prevJdn: number | null = null;

    for (let year = LUNAR_BASE_YEAR; year <= LUNAR_MAX_YEAR; year++) {
      const months = lunarMonthsOf(year);
      expect(months).not.toBeNull();
      for (const m of months ?? []) {
        expect(lunarMonthDays(year, m.month, m.leap)).toBe(m.days);
        for (let day = 1; day <= m.days; day++) {
          const solar = lunarToSolar(year, m.month, day, m.leap);
          if (solar === null) {
            failures.push(`${year}-${m.leap ? '윤' : ''}${m.month}-${day}: 변환 실패`);
            continue;
          }
          const back = solarToLunar(solar.year, solar.month, solar.day);
          if (
            back === null ||
            back.year !== year ||
            back.month !== m.month ||
            back.day !== day ||
            back.leap !== m.leap
          ) {
            failures.push(
              `${year}-${m.leap ? '윤' : ''}${m.month}-${day} → ` +
                `${solar.year}-${solar.month}-${solar.day} → ${JSON.stringify(back)}`,
            );
          }
          // 음력 날짜를 순서대로 훑고 있으므로 JDN 도 1씩만 올라야 한다.
          // 여기서 튀면 어느 달의 길이가 틀린 것이다 — 왕복만으로는 안 잡히는 축이다.
          const jdn = lunarJdn(year, m.month, day, m.leap);
          if (prevJdn !== null && jdn !== prevJdn + 1) {
            failures.push(`JDN 불연속: ${year}-${m.month}-${day} ${prevJdn} → ${jdn}`);
          }
          prevJdn = jdn;
          checked++;
          if (m.leap) leapChecked++;
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
    expect(failures).toHaveLength(0);
    expect(checked).toBe(73_767);
    // 윤달 74회 × 29~30일. 윤달 경로가 통째로 빠지면 여기서 걸린다.
    expect(leapChecked).toBeGreaterThan(2_100);
  });
});

describe('전수 왕복 — 양 → 음 → 양', () => {
  it('양력 1900-01-01 ~ 2100-12-31 전 일자가 항등이다', () => {
    const from = solarJdn(SOLAR_MIN.year, SOLAR_MIN.month, SOLAR_MIN.day);
    const to = solarJdn(SOLAR_MAX.year, SOLAR_MAX.month, SOLAR_MAX.day);
    const failures: string[] = [];
    let checked = 0;

    for (let year = SOLAR_MIN.year; year <= SOLAR_MAX.year; year++) {
      for (let month = 1; month <= 12; month++) {
        const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let day = 1; day <= days; day++) {
          const lunar = solarToLunar(year, month, day);
          if (lunar === null) {
            failures.push(`${year}-${month}-${day}: 역변환 실패`);
            continue;
          }
          const back = lunarToSolar(lunar.year, lunar.month, lunar.day, lunar.leap);
          if (back === null || back.year !== year || back.month !== month || back.day !== day) {
            failures.push(
              `${year}-${month}-${day} → ${JSON.stringify(lunar)} → ${JSON.stringify(back)}`,
            );
          }
          checked++;
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
    expect(failures).toHaveLength(0);
    expect(checked).toBe(to - from + 1);
    expect(checked).toBe(73_414);
  });
});

describe('JDN 산술 정합', () => {
  it('lunar.solarJdn 과 pillars.jdnFromYmd 가 전 구간에서 같다', () => {
    // 두 벌이 된 이유는 번들 경계다(lunar.ts 주석). 값이 갈라지지 않는 것은 여기서 고정한다.
    let mismatch = 0;
    for (let year = SOLAR_MIN.year; year <= SOLAR_MAX.year; year++) {
      for (let month = 1; month <= 12; month++) {
        for (const day of [1, 15, 28]) {
          if (solarJdn(year, month, day) !== jdnFromYmd(year, month, day)) mismatch++;
        }
      }
    }
    expect(mismatch).toBe(0);
  });
});

// ── 엔진 S0 결합 ─────────────────────────────────────────────────────────

const seoul = { latitude: 37.5665, longitude: 126.9784204 };

function lunarBirth(
  year: number,
  month: number,
  day: number,
  leap = false,
): RawBirthInput {
  return {
    calendarType: leap ? 'lunar_leap' : 'lunar',
    year,
    month,
    day,
    hour: 9,
    minute: 30,
    timeUnknown: false,
    gender: 'M',
    birthPlace: seoul,
  };
}

function codeOf(fn: () => unknown): EngineErrorCode | 'NO_THROW' {
  try {
    fn();
    return 'NO_THROW';
  } catch (error) {
    return error instanceof EngineError ? error.code : 'NO_THROW';
  }
}

describe('S0 — 음력 입력', () => {
  it('음력 입력과 같은 날의 양력 입력이 완전히 같은 차트를 낸다 (§S0-2 b)', () => {
    const solar = lunarToSolar(1990, 4, 12, false);
    expect(solar).not.toBeNull();
    const lunarChart = computeChart(lunarBirth(1990, 4, 12));
    const solarChart = computeChart({
      ...lunarBirth(1990, 4, 12),
      calendarType: 'solar',
      year: solar!.year,
      month: solar!.month,
      day: solar!.day,
    });

    // 차이는 두 곳뿐이어야 한다: 표시용 원본(lunarSource)과 그 사실을 알리는 경고.
    const { lunarSource, ...lunarInput } = lunarChart.input;
    expect(lunarSource).toEqual({ year: 1990, month: 4, day: 12, leap: false });
    expect(lunarInput).toEqual(solarChart.input);
    expect(lunarChart.warnings).toContain('LUNAR_CONVERTED');
    expect(solarChart.warnings).not.toContain('LUNAR_CONVERTED');
    expect(lunarChart.warnings.filter((w) => w !== 'LUNAR_CONVERTED')).toEqual(solarChart.warnings);
    expect(JSON.stringify(lunarChart.pillars)).toBe(JSON.stringify(solarChart.pillars));
    expect(JSON.stringify(lunarChart.strength)).toBe(JSON.stringify(solarChart.strength));
    expect(JSON.stringify(lunarChart.astro)).toBe(JSON.stringify(solarChart.astro));
    expect(JSON.stringify(lunarChart.luck)).toBe(JSON.stringify(solarChart.luck));
  });

  it('윤달 입력은 평달과 다른 날로 간다', () => {
    const plain = computeChart(lunarBirth(2023, 2, 15, false));
    const leap = computeChart(lunarBirth(2023, 2, 15, true));
    expect(plain.input.solar).not.toEqual(leap.input.solar);
    expect(leap.input.lunarSource).toEqual({ year: 2023, month: 2, day: 15, leap: true });
    // 윤2월은 평2월 바로 뒤 달이다 — 29~30일 차이
    const gap = solarJdn(
      leap.input.solar.year,
      leap.input.solar.month,
      leap.input.solar.day,
    ) - solarJdn(plain.input.solar.year, plain.input.solar.month, plain.input.solar.day);
    expect([29, 30]).toContain(gap);
  });

  it('실재하지 않는 음력 날짜는 INVALID_LUNAR_DATE 다', () => {
    expect(codeOf(() => computeChart(lunarBirth(2024, 5, 1, true)))).toBe('INVALID_LUNAR_DATE');
    const short = (lunarMonthsOf(2024) ?? []).find((m) => m.days === 29);
    expect(short).toBeDefined();
    expect(codeOf(() => computeChart(lunarBirth(2024, short!.month, 30)))).toBe(
      'INVALID_LUNAR_DATE',
    );
  });

  it('표 밖 음력 연도도 INVALID_LUNAR_DATE 다 (그런 날짜가 없다는 사실이 사용자에게는 같다)', () => {
    expect(codeOf(() => computeChart(lunarBirth(2101, 1, 1)))).toBe('INVALID_LUNAR_DATE');
    expect(codeOf(() => computeChart(lunarBirth(1850, 1, 1)))).toBe('INVALID_LUNAR_DATE');
  });

  it('범위 가드는 **환산된 양력**으로 판정한다 (§S0-1)', () => {
    // 음력 1899-12-01 = 양력 1900-01-01 → 음력 연도는 1899 지만 양력이 범위 안이라 통과한다.
    expect(lunarToSolar(1899, 12, 1, false)).toEqual({ year: 1900, month: 1, day: 1 });
    const chart = computeChart(lunarBirth(1899, 12, 1));
    expect(chart.input.solar).toEqual({ year: 1900, month: 1, day: 1 });

    // 반대로 음력 1899-11-01 은 양력 1899-12-xx 라 범위 밖이다.
    expect(codeOf(() => computeChart(lunarBirth(1899, 11, 1)))).toBe('OUT_OF_RANGE');
    // 음력 2100-12-29 = 양력 2101-01-28 → 양력이 범위 밖
    expect(codeOf(() => computeChart(lunarBirth(2100, 12, 29)))).toBe('OUT_OF_RANGE');
  });

  it('양력 입력에는 lunarSource 키 자체가 없다', () => {
    const chart = computeChart({ ...lunarBirth(1990, 5, 6), calendarType: 'solar' });
    expect('lunarSource' in chart.input).toBe(false);
  });
});

describe('캐시 키 — 음력 출처가 새지 않는다 (C00 §7.3 규칙 1 · §S0-2 b)', () => {
  it('같은 양력일을 음력으로 넣은 사람과 양력으로 넣은 사람의 서사 키가 같다', () => {
    // 이 규칙을 깨는 가장 쉬운 길이 `warnings` 다 — chartIdentityKey 가 경고 목록을 축으로 쓴다.
    // LUNAR_CONVERTED 를 그대로 넣으면 같은 사주가 두 키로 갈려 캐시가 두 벌이 되고,
    // 같은 명식에 다른 문단이 나갈 수 있다.
    const solar = lunarToSolar(1990, 4, 12, false);
    expect(solar).not.toBeNull();
    const lunarChart = computeChart(lunarBirth(1990, 4, 12));
    const solarChart = computeChart({
      ...lunarBirth(1990, 4, 12),
      calendarType: 'solar',
      year: solar!.year,
      month: solar!.month,
      day: solar!.day,
    });

    expect(lunarChart.warnings).not.toEqual(solarChart.warnings); // 전제: 경고는 실제로 다르다
    expect(chartIdentityKey(lunarChart)).toBe(chartIdentityKey(solarChart));
  });

  it('차트를 실제로 가르는 경고는 여전히 키를 가른다 (위 단언이 헛돌지 않는지)', () => {
    const known = computeChart(lunarBirth(1990, 4, 12));
    const unknown = computeChart({ ...lunarBirth(1990, 4, 12), timeUnknown: true, hour: undefined, minute: undefined });
    expect(unknown.warnings).toContain('THREE_PILLAR_MODE');
    expect(chartIdentityKey(known)).not.toBe(chartIdentityKey(unknown));
  });
});
