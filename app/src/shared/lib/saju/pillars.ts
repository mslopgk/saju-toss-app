// S3 네 기둥 — 근거: C00 §S3-1 ~ §S3-5, §3-C1~C6
// 이식 원본: docs/research/calc/proto/ref.mjs (fourPillars / jdnFromYmd)
//
// F3: 연주·월주는 **UTC 절대순간**으로 절기를 비교해 얻는다. 진태양시/야자시 옵션에 불변이다.
// F5: 일주는 (JDN_정오 − 11) mod 60. 1582-10-15 이전은 율리우스력 JDN 으로 분기한다.

import {
  BRANCHES,
  GANJI_INDEX,
  NAEUM,
  OHODUN,
  OSEODUN,
  STEMS,
  ganjiIdxOf,
  ganjiKoOf,
  mod,
} from './constants';
import type {
  Branch,
  BranchIdx,
  CivilDateTime,
  Element,
  FourPillars,
  JasiRule,
  JieContext,
  JieIndex,
  NormalizedTime,
  Pillar,
  Stem,
  StemIdx,
} from './types';

/**
 * 정오 기준 JDN. 1582-10-15 이후는 그레고리력, 이전은 율리우스력으로 해석한다(C00 §S2-4 / §3-C6).
 * proleptic 그레고리 단일식을 쓰면 1391년 일주가 정확히 8칸 어긋난다.
 */
export function jdnFromYmd(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const common = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4);
  const isGregorian = year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 15)));
  return isGregorian
    ? common - Math.floor(y / 100) + Math.floor(y / 400) - 32045
    : common - 32083;
}

export function calendarUsedForJdn(
  year: number,
  month: number,
  day: number,
): 'gregorian' | 'julian' {
  return year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 15)))
    ? 'gregorian'
    : 'julian';
}

/** 시지 인덱스. 경계는 진태양시 정각(23:00 / 01:00 / …) — C00 §S3-4 */
export function hourBranchIdx(hour: number, minute: number): BranchIdx {
  const t = hour * 60 + minute;
  return Math.floor(mod(t + 60, 1440) / 120) as BranchIdx;
}

export function makePillar(stemIdx: number, branchIdx: number): Pillar {
  const s = mod(stemIdx, 10);
  const b = mod(branchIdx, 12);
  const stem = STEMS[s];
  const branch = BRANCHES[b];
  const ganji = stem + branch;
  const naeum = NAEUM[ganji];
  return {
    stem,
    stemIdx: s as StemIdx,
    branch,
    branchIdx: b as BranchIdx,
    ganji,
    ganjiIdx: GANJI_INDEX[ganji],
    ganjiKo: ganjiKoOf(ganjiIdxOf(s, b)),
    naeum: { hanja: naeum.hanja, ko: naeum.ko, element: naeum.element as Element },
  };
}

export interface PillarRules {
  /** C00 §3-C3 확정값 'yajasi'. 나머지는 골든셋 축① 재현용 */
  jasiRule: JasiRule;
  /**
   * 진태양시를 **일주 경계**에도 적용할지 (C00 §3-A2 = 적용).
   * C23 이 상용 서비스 1곳의 반대 사례(시주에만 적용)를 찾아 분리 가능하게 뒀다.
   * 기본값 true 를 바꾸면 일주가 2.14~2.25% 뒤집힌다.
   */
  applyTrueSolarToDayBoundary: boolean;
  /** 생시 모름 → hour 를 null 로 낸다 (C00 §S0-4) */
  threePillarMode: boolean;
}

export const DEFAULT_PILLAR_RULES: PillarRules = {
  jasiRule: 'yajasi',
  applyTrueSolarToDayBoundary: true,
  threePillarMode: false,
};

export function computeFourPillars(
  time: NormalizedTime,
  jie: JieContext,
  rules: PillarRules = DEFAULT_PILLAR_RULES,
): FourPillars {
  const { sajuYear, monthOrder } = jie;

  // 연주 — 서기 4년 = 甲子년
  const yearStemIdx = mod(sajuYear - 4, 10);
  const yearBranchIdx = mod(sajuYear - 4, 12);

  // 월주 — 오호둔. `(2g + 지지idx) % 10` 식은 子·丑월에서 2 어긋난다(§3-C5)
  const monthBranchIdx = jie.monthBranchIdx;
  const monthStemIdx = mod(OHODUN[yearStemIdx] + monthOrder, 10);

  // 일주 — 달력 날짜의 프레임만 플래그로 갈린다. 시주는 언제나 진태양시다.
  const dayFrame: CivilDateTime = rules.applyTrueSolarToDayBoundary ? time.apparent : time.standard;
  const hourFrame: CivilDateTime = time.apparent;

  // 야자시(23시대) 판정은 시지 프레임을 따른다 — 시지와 일주가 같은 시계를 봐야 오서둔이 자기정합적이다
  const isYajasi = hourFrame.hour === 23;
  let dayJdn = jdnFromYmd(dayFrame.year, dayFrame.month, dayFrame.day);
  if (isYajasi && rules.jasiRule === 'johjasi') dayJdn += 1; // 자초환일: 23시부터 일주도 익일
  const dayGanjiIdx = mod(dayJdn - 11, 60);

  // 시주 — 오서둔
  const hbIdx = hourBranchIdx(hourFrame.hour, hourFrame.minute);
  const stemBaseDay =
    isYajasi && rules.jasiRule === 'yajasi-nextstem' ? mod(dayGanjiIdx + 1, 10) : dayGanjiIdx % 10;
  const hourStemIdx = mod(OSEODUN[stemBaseDay] + hbIdx, 10);

  const year = makePillar(yearStemIdx, yearBranchIdx);
  const month = makePillar(monthStemIdx, monthBranchIdx);
  const day = makePillar(dayGanjiIdx % 10, dayGanjiIdx % 12);
  const hour = rules.threePillarMode ? null : makePillar(hourStemIdx, hbIdx);

  const gz8 = [year.ganji, month.ganji, day.ganji, hour?.ganji]
    .filter((g): g is string => typeof g === 'string')
    .join(' ');

  return {
    year,
    month,
    day,
    hour,
    threePillarMode: rules.threePillarMode,
    sajuYear,
    monthOrder: monthOrder as JieIndex,
    dayJdn,
    calendarUsedForJdn: calendarUsedForJdn(dayFrame.year, dayFrame.month, dayFrame.day),
    jasiRule: rules.jasiRule,
    isYajasi,
    gz8,
    jie: { ko: jie.prev.ko, hanja: jie.prev.hanja, enteredUtcMs: jie.prev.utcMs },
    boundaryWarning: jie.boundaryWarning,
  };
}

export type { Branch, Stem };
