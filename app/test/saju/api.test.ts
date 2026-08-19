// 공개 API — computeChart 진입점 (C00 §1.1 S0→S9, §S0-1, §S0-4, §3-A14)

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LONGITUDE,
  ENGINE_VERSION,
  computeChart,
} from '../../src/shared/lib/saju';
import { EngineError } from '../../src/shared/lib/saju/types';
import type { RawBirthInput } from '../../src/shared/lib/saju/types';

const seoulBirth: RawBirthInput = {
  calendarType: 'solar',
  year: 2020,
  month: 2,
  day: 4,
  hour: 17,
  minute: 3,
  timeUnknown: false,
  gender: 'M',
  birthPlace: { region: 'KR', longitude: DEFAULT_LONGITUDE, latitude: 37.5665, ianaTz: 'Asia/Seoul' },
};

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return e instanceof EngineError ? e.code : `UNEXPECTED:${String(e)}`;
  }
  return 'NO_THROW';
};

describe('computeChart — 확정 유파 기본값', () => {
  it('골든셋 축② G-EDGE-01 을 기본 옵션만으로 재현한다', () => {
    const chart = computeChart(seoulBirth);
    expect(chart.engineVersion).toBe(ENGINE_VERSION);
    expect(chart.pillars.gz8).toBe('己亥 丁丑 丁丑 戊申');
    expect(chart.pillars.sajuYear).toBe(2019);
    expect(chart.pillars.dayJdn).toBe(2458884);
    expect(chart.luck.daewoon.daewoonNumber).toBe(10);
    expect(chart.luck.daewoon.forward).toBe(false);
    expect(chart.luck.daewoon.changeoverUtcMs).toBe(2801718660000);
  });

  it('십신 차트가 일간 칸을 "일간" 으로 표시하고 그룹 배점이 S5 와 같은 체계다', () => {
    const chart = computeChart(seoulBirth);
    expect(chart.tenGods.byPillar.day.stem).toBe('일간');
    expect(chart.tenGods.byPillar.year.stem).toBe('식신');
    // v1 의 「임시 정의(합 7.0)」는 폐기. 유일한 배점은 S5 오행 점수(합 80.00)다 — C00 §S5-1
    const total = Object.values(chart.tenGods.groupWeights).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(80, 6);
    expect(chart.tenGods.groupWeights).toBe(chart.strength.strength.groupScores);
  });

  it('S5 신강신약 섹션은 옵셔널이 아니다 — computeChart 가 항상 채운다', () => {
    const chart = computeChart(seoulBirth);
    const { strength, geokguk, yongsin } = chart.strength;
    expect(Object.values(strength.scores).reduce((a, b) => a + b, 0)).toBeCloseTo(80, 9);
    expect(strength.total).toBe(80);
    expect(strength.SI).toBeGreaterThanOrEqual(0);
    expect(strength.SI).toBeLessThanOrEqual(100);
    expect(strength.ally + strength.foe).toBeCloseTo(80, 9);
    expect(geokguk.name.endsWith('격')).toBe(true);
    expect(yongsin.favorable[0]).toBe(yongsin.primary);
    expect(yongsin.avoid).not.toContain(yongsin.primary);
    expect(yongsin.steps.length).toBeGreaterThan(0);
  });

  it('삼주 모드는 총점 62.00 이다 (시간 8.0 + 시지 10.0 제외)', () => {
    const chart = computeChart({ ...seoulBirth, timeUnknown: true, hour: undefined, minute: undefined });
    expect(chart.strength.strength.total).toBe(62);
    expect(Object.values(chart.strength.strength.scores).reduce((a, b) => a + b, 0)).toBeCloseTo(62, 9);
  });

  it('대운은 index 0(교운 전) + 10칸을 낸다', () => {
    const d = computeChart(seoulBirth).luck.daewoon;
    expect(d.pillars.length).toBe(11);
    expect(d.pillars[0].ganji).toBeNull();
    expect(d.pillars[1].startAgeWestern).toBe(d.daewoonNumber);
  });

  it('timeUnknown 은 삼주 모드다 — hour=null, approx=true, 경고 배지', () => {
    const chart = computeChart({ ...seoulBirth, timeUnknown: true, hour: undefined, minute: undefined });
    expect(chart.pillars.hour).toBeNull();
    expect(chart.pillars.threePillarMode).toBe(true);
    expect(chart.luck.daewoon.approx).toBe(true);
    expect(chart.warnings).toContain('THREE_PILLAR_MODE');
    expect(chart.pillars.gz8.split(' ').length).toBe(3);
  });

  it('trueSolar=false 는 경도 보정을 끄고 그 사실이 corrections 에 남는다', () => {
    const chart = computeChart(seoulBirth, { trueSolar: false });
    expect(chart.time.corrections.mode).toBe('STANDARD');
    expect(chart.time.corrections.longitudeMinutes).toBe(0);
    expect(chart.input.place.longitude).toBeNull();
  });
});

describe('computeChart — 입력 가드 (§S0-1 / §3-A14)', () => {
  it('지원범위 밖은 OUT_OF_RANGE', () => {
    expect(codeOf(() => computeChart({ ...seoulBirth, year: 1899 }))).toBe('OUT_OF_RANGE');
    expect(codeOf(() => computeChart({ ...seoulBirth, year: 2101 }))).toBe('OUT_OF_RANGE');
    expect(codeOf(() => computeChart({ ...seoulBirth, year: 50 }))).toBe('OUT_OF_RANGE');
  });
  it('존재하지 않는 날짜는 INVALID_DATE', () => {
    expect(codeOf(() => computeChart({ ...seoulBirth, year: 2023, month: 2, day: 29 }))).toBe('INVALID_DATE');
    expect(codeOf(() => computeChart({ ...seoulBirth, year: 1900, month: 2, day: 29 }))).toBe('INVALID_DATE');
  });
  it('해외 출생에 ianaTz 만 주면 MISSING_TZ (tzdb 미번들 + Intl 금지)', () => {
    expect(
      codeOf(() =>
        computeChart({
          ...seoulBirth,
          birthPlace: { region: 'GENERIC', ianaTz: 'America/New_York', longitude: -74.006 },
        }),
      ),
    ).toBe('MISSING_TZ');
  });
  it('음력을 환산해 계산한다 (§S0-2, A7 음력 표)', () => {
    // 음력 2020-02-04 = 양력 2020-02-27. 양력 입력 2020-02-04 와는 다른 사주여야 한다.
    const lunar = computeChart({ ...seoulBirth, calendarType: 'lunar' });
    expect(lunar.input.solar).toEqual({ year: 2020, month: 2, day: 27 });
    expect(lunar.input.lunarSource).toEqual({ year: 2020, month: 2, day: 4, leap: false });
    expect(lunar.warnings).toContain('LUNAR_CONVERTED');
    expect(lunar.pillars.gz8).not.toBe(computeChart(seoulBirth).pillars.gz8);
  });
  it('존재하지 않는 음력 날짜는 INVALID_LUNAR_DATE', () => {
    // 2020년 윤달은 4월이다 — 윤2월은 없다.
    expect(codeOf(() => computeChart({ ...seoulBirth, calendarType: 'lunar_leap' }))).toBe(
      'INVALID_LUNAR_DATE',
    );
  });
  it('스키마 위반은 INVALID_INPUT', () => {
    expect(codeOf(() => computeChart({ ...seoulBirth, month: 13 }))).toBe('INVALID_INPUT');
    expect(codeOf(() => computeChart({ ...seoulBirth, hour: 24 }))).toBe('INVALID_INPUT');
  });
});

describe('computeChart — 결정론 (F7)', () => {
  it('같은 입력은 JSON 직렬화까지 동일하다 (캐시 키 전제)', () => {
    const a = JSON.stringify(computeChart(seoulBirth));
    const b = JSON.stringify(computeChart(seoulBirth));
    expect(a).toBe(b);
  });
  it('Chart 는 함수 필드를 갖지 않는다 (§1.2.8 Json<T> 제약)', () => {
    const chart = computeChart(seoulBirth);
    const restored: unknown = JSON.parse(JSON.stringify(chart));
    expect(restored).toEqual(JSON.parse(JSON.stringify(chart)));
  });
});
