/**
 * 상대방 입력 화면의 로컬 상태.
 *
 * 근거: C00 §1.2.2(입력 필드) / §S0-3(출생지 기본값 서울) / §S0-4(삼주 모드).
 *
 * ## `features/onboarding` 의 리듀서를 재사용하지 않는 이유
 * ARCHITECTURE.md 「`features` 끼리 직접 import 하지 않는다」. 그리고 **입력이 다르다** —
 * 상대방 화면에는 토스 프리필(사용자 **본인**의 생년월일을 가져오는 경로)이 있으면 안 되고,
 * 출생지도 묻지 않는다(상대의 출생 도시를 아는 사람은 드물고, 진태양시 보정은 국내에서 최대
 * 8분대라 시주 경계에 걸리지 않는 한 결과를 바꾸지 않는다 — 그 사실을 화면이 그대로 밝힌다).
 *
 * 리듀서를 React 밖 순수 함수로 두는 이유는 테스트 때문이다.
 */

import { EMPTY_MBTI_AXES, composeMbti, type MbtiAxes } from '../../shared/lib/mbti';
import { isValidLunarDate, lunarMonthsOf } from '../../shared/lib/saju/lunar';
import type { CalendarType, Gender, RawBirthInput } from '../../shared/lib/saju/types';
import type { CompatBloodType, CompatProfile } from '../../shared/lib/compat/types';

export interface PartnerDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}
export interface PartnerTime {
  readonly hour: number;
  readonly minute: number;
}

/** 그 해에 실제로 있는 달 한 칸. 음력은 윤달이 끼어 13칸이 될 수 있다 */
export interface PartnerMonth {
  readonly month: number;
  readonly leap: boolean;
  readonly days: number;
}

export interface PartnerDraft {
  readonly calendarType: CalendarType;
  readonly date: PartnerDate | null;
  readonly time: PartnerTime | null;
  readonly timeUnknown: boolean;
  readonly gender: Gender | null;
  readonly mbtiAxes: MbtiAxes;
  readonly blood: CompatBloodType | null;
}

/** 휠이 처음 서 있을 자리. `Date.now()` 로 "올해" 를 잡지 않는다(§F7) */
export const SEED_DATE: PartnerDate = { year: 1995, month: 1, day: 1 };
export const SEED_TIME: PartnerTime = { hour: 12, minute: 0 };

export const INITIAL_PARTNER_DRAFT: PartnerDraft = {
  calendarType: 'solar',
  date: null,
  time: null,
  timeUnknown: false,
  gender: null,
  mbtiAxes: EMPTY_MBTI_AXES,
  blood: null,
};

export type PartnerAction =
  | { readonly type: 'setDate'; readonly calendarType: CalendarType; readonly date: PartnerDate }
  | { readonly type: 'setTime'; readonly time: PartnerTime }
  | { readonly type: 'setTimeUnknown' }
  | { readonly type: 'setGender'; readonly gender: Gender }
  | { readonly type: 'setMbtiAxis'; readonly patch: Partial<MbtiAxes> }
  | { readonly type: 'setBlood'; readonly blood: CompatBloodType | null };

export function partnerReducer(state: PartnerDraft, action: PartnerAction): PartnerDraft {
  switch (action.type) {
    case 'setDate':
      return { ...state, calendarType: action.calendarType, date: action.date };
    case 'setTime':
      // 시각을 고르는 행위 자체가 "생시를 안다"는 선언이다.
      return { ...state, time: action.time, timeUnknown: false };
    case 'setTimeUnknown':
      return { ...state, time: null, timeUnknown: true };
    case 'setGender':
      return { ...state, gender: action.gender };
    case 'setMbtiAxis':
      return { ...state, mbtiAxes: { ...state.mbtiAxes, ...action.patch } };
    case 'setBlood':
      return { ...state, blood: action.blood };
  }
}

/** C00 §F9 */
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;
const SOLAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isGregorianLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** 그 해·그 달력에 **실제로 있는** 달만 낸다. 없는 윤달을 고를 길을 화면에서 없앤다 */
export function monthsOf(calendarType: CalendarType, year: number): PartnerMonth[] {
  if (calendarType === 'solar') {
    return SOLAR_MONTH_DAYS.map((days, i) => ({
      month: i + 1,
      leap: false,
      days: i === 1 && isGregorianLeapYear(year) ? 29 : days,
    }));
  }
  // 음력 표는 1900~2100 밖에서 null 을 낸다. 그때는 빈 배열을 주고 화면이 CTA 를 잠근다.
  return (lunarMonthsOf(year) ?? []).map((m) => ({ month: m.month, leap: m.leap, days: m.days }));
}

export function isValidPartnerDate(calendarType: CalendarType, date: PartnerDate): boolean {
  if (date.year < MIN_YEAR || date.year > MAX_YEAR) return false;
  if (calendarType === 'solar') {
    const months = monthsOf('solar', date.year);
    const days = months[date.month - 1]?.days ?? 0;
    return date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= days;
  }
  return isValidLunarDate(date.year, date.month, date.day, calendarType === 'lunar_leap');
}

export type MissingPartnerField = 'date' | 'time' | 'gender' | 'mbti' | 'blood';

export function missingPartnerFields(draft: PartnerDraft): MissingPartnerField[] {
  const missing: MissingPartnerField[] = [];
  if (draft.date === null) missing.push('date');
  if (!draft.timeUnknown && draft.time === null) missing.push('time');
  if (draft.gender === null) missing.push('gender');
  /*
    MBTI·혈액형도 필수다. 온보딩(나)만 필수로 바꾸고 **여기를 빠뜨린 판이 한 번 있었다** —
    문구는 "필수" 인데 검증은 통과시켜, 상대방 정보가 비어도 제출되고 궁합 배점에서 두 축이
    조용히 재분배됐다. 두 화면이 같은 규칙을 지켜야 사용자가 두 결과를 비교할 수 있다.

    네 축이 다 차야 유형이 된다 — 두 축만 고른 상태는 "아직 안 고름" 과 같다.
  */
  if (composeMbti(draft.mbtiAxes) === null) missing.push('mbti');
  if (draft.blood === null) missing.push('blood');
  return missing;
}

export type BuildPartnerResult =
  | { readonly ok: true; readonly input: RawBirthInput; readonly profile: CompatProfile }
  | { readonly ok: false; readonly missing: readonly MissingPartnerField[] };

/**
 * 화면 상태 → 엔진 입력. **최종 판정은 엔진의 zod 스키마가 한다** — 여기서는 완결 여부만 본다.
 * `birthPlace` 는 비워 둔다: 엔진이 region='KR' + 서울시청 좌표를 기본값으로 채운다(§S0-3).
 */
export function buildPartnerInput(draft: PartnerDraft): BuildPartnerResult {
  const missing = missingPartnerFields(draft);
  if (missing.length > 0) return { ok: false, missing };

  const date = draft.date!;
  const gender = draft.gender!;
  // 삼주 모드에서는 키 자체를 넣지 않는다. `hour: undefined` 는 "시각 없음" 과 "시각 미정" 을 섞는다.
  const timePart =
    draft.timeUnknown || draft.time === null
      ? {}
      : { hour: draft.time.hour, minute: draft.time.minute };

  return {
    ok: true,
    input: {
      calendarType: draft.calendarType,
      year: date.year,
      month: date.month,
      day: date.day,
      ...timePart,
      timeUnknown: draft.timeUnknown,
      gender,
      birthPlace: {},
    },
    profile: { mbti: composeMbti(draft.mbtiAxes), blood: draft.blood },
  };
}

export const YEAR_OPTIONS: number[] = Array.from(
  { length: MAX_YEAR - MIN_YEAR + 1 },
  (_, i) => MIN_YEAR + i,
);
export const HOUR_OPTIONS: number[] = Array.from({ length: 24 }, (_, i) => i);
export const MINUTE_OPTIONS: number[] = Array.from({ length: 60 }, (_, i) => i);

export const rangeInclusive = (from: number, to: number): number[] =>
  to < from ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const formatMonthOption = (m: PartnerMonth): string =>
  `${m.leap ? '윤' : ''}${m.month}월`;
export const formatHourOption = (h: number): string => `${String(h).padStart(2, '0')}시`;
export const formatMinuteOption = (m: number): string => `${String(m).padStart(2, '0')}분`;

/** 월 목록에서 같은 달을 다시 찾는다. 연도·달력을 바꾸면 윤달 자리가 달라진다 */
export function monthIndexOf(
  calendarType: CalendarType,
  year: number,
  month: number,
  leap: boolean,
): number {
  const months = monthsOf(calendarType, year);
  const exact = months.findIndex((m) => m.month === month && m.leap === leap);
  if (exact >= 0) return exact;
  const fallback = months.findIndex((m) => m.month === month);
  return fallback >= 0 ? fallback : 0;
}

export function describePartnerDate(calendarType: CalendarType, date: PartnerDate): string {
  const label = calendarType === 'solar' ? '양력' : calendarType === 'lunar' ? '음력' : '음력 윤달';
  return `${label} ${date.year}년 ${date.month}월 ${date.day}일`;
}

export function describePartnerTime(draft: PartnerDraft): string {
  if (draft.timeUnknown) return '모름 · 삼주(三柱)로 계산';
  if (draft.time === null) return '선택해 주세요';
  return `${formatHourOption(draft.time.hour)} ${formatMinuteOption(draft.time.minute)}`;
}
