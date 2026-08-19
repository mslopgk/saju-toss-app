// 계산 엔진 단일 진입점 — 근거: C00 §1.1 파이프라인, §S0, §9 (엔진 버전)
//
// 구현 범위(v1 이식본): S0(양력 + 음력 환산) · S1 · S2 · S3 · S4-1(십신) · S6-1~3(대운).
// S4-2 이후(신살·십이운성) · S5(신강신약) · S7(별자리) · S8(궁합)은 별도 영역에서 확장한다.

import { z } from 'zod';
import { computeAstroChart } from './astro';
import { lunarToSolar } from './lunar';
import { computeDaewoon } from './luck';
import { DEFAULT_PILLAR_RULES, computeFourPillars } from './pillars';
import { computeSinsalChart } from './sinsal';
import { buildJieContext, jieContextPrecision } from './solar-terms';
import { computeStrengthChart } from './strength';
import { computeTenGodChart } from './ten-gods';
import { normalizeTime } from './time';
import type {
  Chart,
  EngineWarning,
  JasiRule,
  NormalizedInput,
  PlaceRegion,
  RawBirthInput,
} from './types';
import { EngineError } from './types';

export const ENGINE_VERSION = 'SAJU-ENGINE-1.0.0';

/** 서울시청 (C00 §S0-3). 출생지 미선택 시 기본 좌표 */
export const DEFAULT_LONGITUDE = 126.9784204;
export const DEFAULT_LATITUDE = 37.5665;

/** 지원 범위 (C00 §F9 / §S0-1) */
export const SUPPORTED_YEAR_MIN = 1900;
export const SUPPORTED_YEAR_MAX = 2100;

const birthPlaceSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  ianaTz: z.string().optional(),
  stdOffsetMinutes: z.number().min(-720).max(840).optional(),
  dstMinutes: z.number().min(0).max(120).optional(),
  region: z.enum(['KR', 'GENERIC']).optional(),
});

const rawBirthInputSchema = z.object({
  calendarType: z.enum(['solar', 'lunar', 'lunar_leap']),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  timeUnknown: z.boolean(),
  gender: z.enum(['M', 'F']),
  birthPlace: birthPlaceSchema,
});

export interface ChartOptions {
  /** C00 §3-C3 확정값. 노출하지 않는다 */
  jasiRule?: JasiRule;
  /** C00 §3-A2 확정값 = true. C23 반대 사례 때문에 분리만 해뒀다 */
  applyTrueSolarToDayBoundary?: boolean;
  /** false 면 경도·균시차 보정을 끈다(STANDARD 유파). 기본 true (§3-A1) */
  trueSolar?: boolean;
  /** false 면 표준시 이력을 무시하고 +09:00 고정 (§3-A5, 골든셋 축① `raw_kst`) */
  applyHistoricalTz?: boolean;
}

function assertRealDate(year: number, month: number, day: number): void {
  const probe = new Date(Date.UTC(year, month - 1, day));
  const ok =
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  if (!ok) throw new EngineError('INVALID_DATE', `존재하지 않는 날짜: ${year}-${month}-${day}`);
}

/** S0 — 입력 검증 · 정규화 */
export function normalizeInput(raw: RawBirthInput, options: ChartOptions = {}): NormalizedInput {
  const parsed = rawBirthInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EngineError('INVALID_INPUT', `입력 검증 실패: ${parsed.error.issues[0]?.message ?? ''}`);
  }
  const input = parsed.data;

  // S0-2. 음→양 환산을 **범위 가드보다 먼저** 끝낸다 — §S0-1 의 1900~2100 은 「양력 환산 후」의
  // 조건이다. 음력 1899-12-01 은 양력 1900-01-01 이라 음력 연도로 먼저 자르면 정당한 입력이 잘린다.
  const lunarSource =
    input.calendarType === 'solar'
      ? null
      : {
          year: input.year,
          month: input.month,
          day: input.day,
          leap: input.calendarType === 'lunar_leap',
        };
  let solar = { year: input.year, month: input.month, day: input.day };
  if (lunarSource !== null) {
    const converted = lunarToSolar(
      lunarSource.year,
      lunarSource.month,
      lunarSource.day,
      lunarSource.leap,
    );
    if (converted === null) {
      // 표 밖 연도든 없는 윤달이든 사용자에게는 같은 사실이다: 그런 음력 날짜는 없다.
      throw new EngineError(
        'INVALID_LUNAR_DATE',
        `존재하지 않는 음력 날짜: ${lunarSource.year}-${lunarSource.leap ? '윤' : ''}${lunarSource.month}-${lunarSource.day}`,
      );
    }
    solar = converted;
  }

  // 범위 가드를 날짜 유효성보다 **먼저** 본다 — Date.UTC 가 0~99 년을 1900+ 로 접기 때문에
  // 순서를 바꾸면 서기 50년 입력이 OUT_OF_RANGE 가 아니라 INVALID_DATE 로 보고된다.
  if (solar.year < SUPPORTED_YEAR_MIN || solar.year > SUPPORTED_YEAR_MAX) {
    throw new EngineError(
      'OUT_OF_RANGE',
      `지원 범위(${SUPPORTED_YEAR_MIN}~${SUPPORTED_YEAR_MAX}) 밖: ${solar.year}`,
    );
  }
  // 음력에서 환산한 날짜는 표가 실재하는 날만 내므로 이 검사는 양력 입력용이다.
  assertRealDate(solar.year, solar.month, solar.day);

  const place = input.birthPlace;
  const region: PlaceRegion = place.region ?? 'KR';
  if (region === 'GENERIC' && (place.stdOffsetMinutes === undefined || place.dstMinutes === undefined)) {
    throw new EngineError(
      'MISSING_TZ',
      "해외 출생(region='GENERIC')은 stdOffsetMinutes / dstMinutes 가 필수다",
    );
  }
  if (region === 'GENERIC' && place.longitude === undefined) {
    throw new EngineError('MISSING_PLACE', '해외 출생은 경도가 필수다');
  }

  const trueSolar = options.trueSolar ?? true;
  const longitude = trueSolar ? (place.longitude ?? DEFAULT_LONGITUDE) : null;

  return {
    v: 1,
    solar,
    // 양력 입력에서는 키 자체를 만들지 않는다 — `lunarSource: undefined` 를 넣으면 직렬화·비교에서
    // "음력이 아니다"와 "음력인데 값이 없다"가 구분되지 않는다.
    ...(lunarSource === null ? {} : { lunarSource }),
    wall: input.timeUnknown
      ? { hour: 12, minute: 0 } // 삼주 모드에서도 대운 근사용으로 유지 (§S0-4)
      : { hour: input.hour ?? 0, minute: input.minute ?? 0 },
    timeUnknown: input.timeUnknown,
    gender: input.gender,
    place: {
      latitude: place.latitude ?? (region === 'KR' ? DEFAULT_LATITUDE : null),
      longitude,
      region,
      ianaTz: place.ianaTz ?? (region === 'KR' ? 'Asia/Seoul' : null),
      stdOffsetMinutes: place.stdOffsetMinutes ?? null,
      dstMinutes: place.dstMinutes ?? null,
    },
  };
}

/** S0 → S9. 확정 유파: historical TZ + TRUE_SOLAR + 출생지 경도 + yajasi */
export function computeChart(raw: RawBirthInput, options: ChartOptions = {}): Chart {
  const input = normalizeInput(raw, options);

  const time = normalizeTime(
    {
      year: input.solar.year,
      month: input.solar.month,
      day: input.solar.day,
      hour: input.wall.hour,
      minute: input.wall.minute,
    },
    {
      region: input.place.region,
      longitude: input.place.longitude,
      applyTz: options.applyHistoricalTz ?? true,
      stdOffsetMinutes: input.place.stdOffsetMinutes ?? undefined,
      dstMinutes: input.place.dstMinutes ?? undefined,
    },
  );

  const jie = buildJieContext(time.instantUtcMs);
  const pillars = computeFourPillars(time, jie, {
    jasiRule: options.jasiRule ?? DEFAULT_PILLAR_RULES.jasiRule,
    applyTrueSolarToDayBoundary:
      options.applyTrueSolarToDayBoundary ?? DEFAULT_PILLAR_RULES.applyTrueSolarToDayBoundary,
    threePillarMode: input.timeUnknown,
  });
  // S5 를 먼저 낸다 — 십신 그룹 배점의 유일한 출처가 S5 의 오행 점수이기 때문이다(C00 §S5-1).
  const strength = computeStrengthChart(pillars);
  const tenGods = computeTenGodChart(pillars, strength.strength.groupScores);
  const sinsal = computeSinsalChart(pillars);
  // S7 은 **`time.instantUtcMs` 만** 먹는다 — 별자리에 진태양시를 적용하면 이중 보정이다(C00 §S7-5).
  const astro = computeAstroChart(time, input.timeUnknown);
  const daewoon = computeDaewoon(time.instantUtcMs, pillars, input.gender, input.solar.year, {
    approx: input.timeUnknown,
  });

  const warnings: EngineWarning[] = [];
  if (jie.boundaryWarning) warnings.push('JIE_BOUNDARY');
  if (time.flags.nearJasiBoundary) warnings.push('JASI_BOUNDARY');
  if (time.flags.dstApplied) warnings.push('DST_APPLIED');
  if (time.flags.historicalOffset) warnings.push('HISTORICAL_OFFSET');
  if (time.flags.gap) warnings.push('TIME_GAP');
  if (time.flags.overlap) warnings.push('TIME_OVERLAP');
  if (time.flags.dayShiftedByTrueSolar) warnings.push('DAY_SHIFTED_BY_TRUE_SOLAR');
  if (input.timeUnknown) warnings.push('THREE_PILLAR_MODE');
  if (jieContextPrecision(time.instantUtcMs) === 'approx') warnings.push('LOW_PRECISION_SOLAR_TERM');
  if (input.lunarSource !== undefined) warnings.push('LUNAR_CONVERTED');

  return {
    engineVersion: ENGINE_VERSION,
    input,
    time,
    jie,
    pillars,
    tenGods,
    strength,
    sinsal,
    astro,
    luck: { daewoon },
    warnings,
  };
}

export * from './types';
export {
  KR_TIMELINE,
  civilFromMs,
  eotMinutes,
  normalizeTime,
  offsetAt,
  wallToUtc,
} from './time';
export {
  JIE,
  SOLAR_TERM_TABLE_RANGE,
  buildJieContext,
  findSolarTerm,
  nextJie,
  prevJie,
  sajuYearOf,
  solarTermUtcMs,
} from './solar-terms';
export {
  DEFAULT_PILLAR_RULES,
  calendarUsedForJdn,
  computeFourPillars,
  hourBranchIdx,
  jdnFromYmd,
  makePillar,
} from './pillars';
export {
  GROUP_OF,
  computeTenGodChart,
  hiddenStemsOf,
  mainHiddenStem,
  tenGod,
  tenGodsOfGanji,
} from './ten-gods';
export {
  ELEMENTS,
  STRENGTH_PARAM_VIEW,
  climateIndexOf,
  computeElementScores,
  computeStrength,
  computeStrengthChart,
  deriveGyeokguk,
  deriveYongsin,
  elementAxesOf,
  gradeOf,
  strengthIndexOf,
  tiaohouPrimaryOf,
  unseongOf,
  wangSangOf,
} from './strength';
export { computeDaewoon, isForward } from './luck';
export {
  RELATION_KNOWLEDGE_KEY,
  computeSinsalChart,
  gongmangOf,
  samjaeOf,
  sinsal12Of,
  sinsalScoreOf,
  unseongEnergyOf,
} from './sinsal';
export {
  MOON_BADGE_DEG,
  SIGNS,
  computeAstroChart,
  deltaTFromJd,
  deltaTSeconds,
  jdFromMs,
  moonAt,
  nutationDpsiArcsec,
  sunSample,
} from './astro';
export {
  LUNAR_BASE_YEAR,
  LUNAR_MAX_YEAR,
  isValidLunarDate,
  lunarJdn,
  lunarLeapMonthOf,
  lunarMonthDays,
  lunarMonthsOf,
  lunarTableSolarJdnRange,
  lunarToSolar,
  solarJdn,
  solarToLunar,
} from './lunar';
export type { LunarDate, LunarMonth, SolarDate } from './lunar';
export {
  BRANCHES,
  BRANCH_INDEX,
  BRANCH_META,
  STEMS,
  STEM_INDEX,
  STEM_META,
  ganjiIdxOf,
  ganjiKoOf,
  ganjiOf,
} from './constants';
