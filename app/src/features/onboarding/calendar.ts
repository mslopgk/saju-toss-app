/**
 * 온보딩 입력에 필요한 달력 유틸.
 *
 * 근거: C00 §F9(지원 범위 1900-01-01 ~ 2100-12-31), §S0-1(범위 가드·실재 날짜 검사),
 *       §S0-2(음→양 변환), §4.1 자산 A7.
 *
 * ## 음력 표를 화면이 직접 읽는 이유
 *
 * 예전에는 "화면이 자체 음력 테이블을 들고 있으면 엔진과 두 벌이 된다"는 이유로 음력 대소월을
 * 30일로 열어 두고 엔진이 거르게 했다. 지금은 **표가 한 벌**이다 —
 * `shared/lib/saju/lunar` 가 유일한 출처이고 화면과 엔진이 같은 함수를 부른다. 두 벌 위험이
 * 사라졌으므로 화면이 미리 좁히는 편이 낫다: 윤달 체크박스를 따로 두면 그 해에 없는 윤달을
 * 고를 수 있고, 사용자는 폼을 다 채운 뒤에야 `INVALID_LUNAR_DATE` 를 만난다.
 *
 * ⚠ `shared/lib/saju`(배럴)이 아니라 `shared/lib/saju/lunar` 를 **딥 임포트**한다.
 *   배럴을 쓰면 계산 엔진 전체가 초기 청크로 끌려온다(ARCHITECTURE.md「청크 경계」).
 *   `lunar.ts` 가 데이터 파일 말고는 아무것도 import 하지 않는다는 사실이 이 경계를 지탱하고,
 *   그 사실은 `test/saju/lunar.test.ts` 가 소스를 훑어 고정한다.
 *
 * 결정론 유지를 위해 `Date`·`Intl`·`toLocaleString` 을 쓰지 않는다(§F7).
 */

import {
  isValidLunarDate,
  lunarMonthsOf,
  lunarToSolar,
} from '../../shared/lib/saju/lunar'
import type { CalendarType } from './types'

/** C00 §F9 */
export const MIN_BIRTH_YEAR = 1900
export const MAX_BIRTH_YEAR = 2100

export interface BirthDate {
  year: number
  month: number
  day: number
}

export interface BirthTime {
  hour: number
  minute: number
}

/** 한 해 안의 달 한 칸. 음력은 윤달이 끼어들어 13칸이 될 수 있다. */
export interface BirthMonth {
  readonly month: number
  /** 음력 윤달인가. 양력은 언제나 false */
  readonly leap: boolean
  readonly days: number
}

export function isGregorianLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const SOLAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export function daysInSolarMonth(year: number, month: number): number {
  if (month < 1 || month > 12) {
    return 0
  }
  if (month === 2) {
    return isGregorianLeapYear(year) ? 29 : 28
  }
  return SOLAR_MONTH_DAYS[month - 1] ?? 0
}

export const isLunarCalendar = (calendarType: CalendarType): boolean => calendarType !== 'solar'

/** 달력 종류를 (음력 여부, 윤달 여부) 로 나눈 것 — 엔진 입력과 화면 상태 사이의 유일한 번역 지점 */
export function toCalendarType(lunar: boolean, leap: boolean): CalendarType {
  if (!lunar) return 'solar'
  return leap ? 'lunar_leap' : 'lunar'
}

const SOLAR_MONTHS_OF = (year: number): readonly BirthMonth[] =>
  Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    leap: false,
    days: daysInSolarMonth(year, i + 1),
  }))

/**
 * 그 해에 실제로 있는 달을 순서대로. 월 휠이 이 목록을 그대로 쓴다.
 * 음력 표 밖 연도면 빈 배열 — 휠에 아무것도 뜨지 않는 것이 없는 달을 보여 주는 것보다 낫다.
 */
export function monthsOf(calendarType: CalendarType, year: number): readonly BirthMonth[] {
  if (!isLunarCalendar(calendarType)) {
    return SOLAR_MONTHS_OF(year)
  }
  return lunarMonthsOf(year) ?? []
}

/** 그 달의 일수. 없는 달이면 0 */
export function daysInMonth(calendarType: CalendarType, year: number, month: number, leap = false): number {
  const found = monthsOf(calendarType, year).find((m) => m.month === month && m.leap === leap)
  return found?.days ?? 0
}

export function isValidSolarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }
  if (year < MIN_BIRTH_YEAR || year > MAX_BIRTH_YEAR) {
    return false
  }
  const max = daysInSolarMonth(year, month)
  return max > 0 && day >= 1 && day <= max
}

/**
 * 그 달력에서 실재하는 날짜인가.
 *
 * 여기서 보는 것은 **날짜의 실재 여부**뿐이다. 음력을 양력으로 환산했을 때 지원 범위
 * (1900-01-01 ~ 2100-12-31)를 벗어나는지는 보지 않는다 — 그건 엔진 §S0-1 의 판정이고,
 * 화면이 같은 규칙을 한 벌 더 들면 언젠가 어긋난다. (해당 구간은 음력 2100년 12월 29일뿐이다.)
 */
export function isValidBirthDate(calendarType: CalendarType, date: BirthDate): boolean {
  if (!isLunarCalendar(calendarType)) {
    return isValidSolarDate(date.year, date.month, date.day)
  }
  return isValidLunarDate(date.year, date.month, date.day, calendarType === 'lunar_leap')
}

/**
 * (달력, 연도, 월, 윤달) → `monthsOf` 목록 안의 인덱스.
 *
 * 월 휠의 값이 월 번호가 아니라 **시퀀스 인덱스**인 이유는 윤2월과 2월이 같은 번호이기 때문이다.
 * 그 해에 없는 조합(딥링크·저장값이 어긋난 경우)이면 같은 번호의 평달로 떨어뜨린다 — 던지면
 * 사용자가 흰 화면을 본다.
 */
export function monthIndexOf(
  calendarType: CalendarType,
  year: number,
  month: number,
  leap: boolean,
): number {
  const months = monthsOf(calendarType, year)
  const exact = months.findIndex((m) => m.month === month && m.leap === leap)
  if (exact >= 0) {
    return exact
  }
  const plain = months.findIndex((m) => m.month === month && !m.leap)
  return plain >= 0 ? plain : 0
}

/** 월을 바꿨을 때 남은 일(日)이 그 달에 없으면 마지막 날로 당긴다. */
export function clampDay(
  calendarType: CalendarType,
  year: number,
  month: number,
  day: number,
  leap = false,
): number {
  const max = daysInMonth(calendarType, year, month, leap)
  if (max <= 0) {
    return day
  }
  return Math.min(Math.max(day, 1), max)
}

export function rangeInclusive(from: number, to: number): number[] {
  const result: number[] = []
  for (let value = from; value <= to; value += 1) {
    result.push(value)
  }
  return result
}

// TDS `Wheel` 의 `options` 가 `number[]`(가변)이라 readonly 로 두면 그대로 넘길 수 없다.
export const BIRTH_YEAR_OPTIONS: number[] = rangeInclusive(MIN_BIRTH_YEAR, MAX_BIRTH_YEAR)
export const MONTH_OPTIONS: number[] = rangeInclusive(1, 12)
export const HOUR_OPTIONS: number[] = rangeInclusive(0, 23)
export const MINUTE_OPTIONS: number[] = rangeInclusive(0, 59)

export function formatBirthDate(calendarType: CalendarType, date: BirthDate): string {
  const prefix = isLunarCalendar(calendarType) ? '음력' : '양력'
  const leap = calendarType === 'lunar_leap' ? '윤' : ''
  return `${prefix} ${date.year}년 ${leap}${date.month}월 ${date.day}일`
}

/**
 * 목록 행에 쓸 한 줄. 음력이면 **환산된 양력 날짜를 함께** 보인다.
 *
 * 음력 입력자가 확인할 수 있는 유일한 값이 이것이다 — 윤달을 잘못 골랐는지는 양력 날짜를
 * 봐야 알 수 있고, 결과 화면까지 가서야 알게 되면 되돌리는 비용이 크다.
 */
export function describeBirthDate(calendarType: CalendarType, date: BirthDate): string {
  const label = formatBirthDate(calendarType, date)
  if (!isLunarCalendar(calendarType)) {
    return label
  }
  const solar = lunarToSolar(date.year, date.month, date.day, calendarType === 'lunar_leap')
  return solar === null
    ? `${label} · 그 해에 없는 날짜예요`
    : `${label} · 양력 ${solar.year}년 ${solar.month}월 ${solar.day}일`
}

export function formatMonthOption(month: BirthMonth): string {
  return `${month.leap ? '윤' : ''}${month.month}월`
}

/** 24시간제 표기. 자시(23~01시) 경계를 다루므로 오전/오후 표기보다 오해가 적다. */
export function formatBirthTime(time: BirthTime): string {
  return `${time.hour}시 ${time.minute}분`
}

export function formatHourOption(hour: number): string {
  return `${hour}시`
}

export function formatMinuteOption(minute: number): string {
  return `${minute}분`
}
