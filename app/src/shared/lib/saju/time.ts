// S1 시각 정규화 — 근거: C00 §S1-1 ~ §S1-6, §3-A1/A5~A12, C15, C20
// 이식 원본: docs/research/calc/proto/ref.mjs (offsetAt / wallToUtc / eotMinutes)
//
// F4: 표준시 이력·서머타임·경도·균시차는 100% 자체 구현이다. `Intl` / `toLocaleString` 금지.
// F7: 순수함수. `Date.now()` / `Math.random()` 없음. `Date.UTC` 와 `getUTC*` 는 로케일 비의존이라 허용.

import type {
  CivilDateTime,
  NormalizedTime,
  PlaceRegion,
  TimeFlags,
  TrueSolarMode,
} from './types';
import { EngineError } from './types';

export interface TzOffset {
  /** 총오프셋 (분) = std + dst */
  total: number;
  /** 표준시 오프셋 (분) */
  std: number;
  /** 서머타임 가산 (분) */
  dst: number;
}

export interface TzSegment extends TzOffset {
  /** 이 세그먼트가 유효해지는 UTC 절대순간 */
  fromUtcMs: number;
}

const seg = (fromUtcMs: number, total: number, std: number, dst: number): TzSegment =>
  ({ fromUtcMs, total, std, dst });

/**
 * KR_TIMELINE — 표준시 4 epoch + 서머타임 12구간 = 29세그먼트 (C00 §S1-2 / §S1-3).
 *
 * ⚠️ 1954 전환은 **15:30Z** 다. tzdb 의 `1954 Mar 21`(=15:00Z)은 대통령령 제876호 원문
 *    「檀紀四二八七年三月二十一日午前零時三十分부터」의 `零時三十分` 을 누락한 오류다(C20 / §3-A9).
 *    C00 §S1-2 표는 아직 15:00Z 로 남아 있으나 §3-A9 결정표가 이긴다.
 * ⚠️ 1945-09-08 은 전환이 아니다(약칭만 JST→KST). 세그먼트를 만들지 않는다.
 * ⚠️ 1955~1960 서머타임 총오프셋은 +09:30 이다(표준시가 +08:30 이었으므로, §3-A7).
 */
export const KR_TIMELINE: readonly TzSegment[] = [
  seg(-Infinity, 507.8667, 507.8667, 0), // LMT +08:27:52 (§3-A8)
  seg(Date.UTC(1908, 2, 31, 15, 32, 8), 510, 510, 0), // 칙령 제5호 (§3-A10)
  seg(Date.UTC(1911, 11, 31, 15, 30, 0), 540, 540, 0), // 총독부 관보 367호 (§3-A10b)
  seg(Date.UTC(1948, 4, 31, 15, 0, 0), 600, 540, 60),
  seg(Date.UTC(1948, 8, 12, 14, 0, 0), 540, 540, 0),
  seg(Date.UTC(1949, 3, 2, 15, 0, 0), 600, 540, 60),
  seg(Date.UTC(1949, 8, 10, 14, 0, 0), 540, 540, 0),
  seg(Date.UTC(1950, 2, 31, 15, 0, 0), 600, 540, 60),
  seg(Date.UTC(1950, 8, 9, 14, 0, 0), 540, 540, 0),
  seg(Date.UTC(1951, 4, 5, 15, 0, 0), 600, 540, 60),
  seg(Date.UTC(1951, 8, 8, 14, 0, 0), 540, 540, 0),
  seg(Date.UTC(1954, 2, 20, 15, 30, 0), 510, 510, 0), // 대통령령 제876호 (§3-A9)
  seg(Date.UTC(1955, 4, 4, 15, 30, 0), 570, 510, 60),
  seg(Date.UTC(1955, 8, 8, 14, 30, 0), 510, 510, 0),
  seg(Date.UTC(1956, 4, 19, 15, 30, 0), 570, 510, 60),
  seg(Date.UTC(1956, 8, 29, 14, 30, 0), 510, 510, 0),
  seg(Date.UTC(1957, 4, 4, 15, 30, 0), 570, 510, 60),
  seg(Date.UTC(1957, 8, 21, 14, 30, 0), 510, 510, 0),
  seg(Date.UTC(1958, 4, 3, 15, 30, 0), 570, 510, 60),
  seg(Date.UTC(1958, 8, 20, 14, 30, 0), 510, 510, 0),
  seg(Date.UTC(1959, 4, 2, 15, 30, 0), 570, 510, 60),
  seg(Date.UTC(1959, 8, 19, 14, 30, 0), 510, 510, 0),
  seg(Date.UTC(1960, 3, 30, 15, 30, 0), 570, 510, 60),
  seg(Date.UTC(1960, 8, 17, 14, 30, 0), 510, 510, 0),
  seg(Date.UTC(1961, 7, 9, 15, 30, 0), 540, 540, 0), // 법률 제676호
  seg(Date.UTC(1987, 4, 9, 17, 0, 0), 600, 540, 60),
  seg(Date.UTC(1987, 9, 10, 17, 0, 0), 540, 540, 0),
  seg(Date.UTC(1988, 4, 7, 17, 0, 0), 600, 540, 60),
  seg(Date.UTC(1988, 9, 8, 17, 0, 0), 540, 540, 0),
];

/** 절대순간 → 그 순간 한국에서 유효했던 오프셋 */
export function offsetAt(utcMs: number): TzOffset {
  let found = KR_TIMELINE[0];
  for (const s of KR_TIMELINE) {
    if (utcMs >= s.fromUtcMs) found = s;
    else break;
  }
  return { total: found.total, std: found.std, dst: found.dst };
}

export type TimeAnomaly = 'GAP' | 'OVERLAP';

export interface WallResolution {
  utcMs: number;
  offsetMinutes: number;
  anomalies: readonly TimeAnomaly[];
}

/**
 * 한국 벽시계 → UTC 절대순간.
 * 후보 0개 = 갭(SHIFT_FORWARD), 2개 이상 = 오버랩(FIRST). C00 §S1-4 / §3-A11·A12.
 */
export function wallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): WallResolution {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const candidates: { utc: number; off: number }[] = [];
  const seen = new Set<number>();
  for (const s of KR_TIMELINE) {
    const cand = naive - Math.round(s.total * 60000);
    if (seen.has(cand)) continue;
    seen.add(cand);
    if (offsetAt(cand).total === s.total) candidates.push({ utc: cand, off: s.total });
  }
  candidates.sort((a, b) => a.utc - b.utc);
  if (candidates.length === 1) {
    return { utcMs: candidates[0].utc, offsetMinutes: candidates[0].off, anomalies: [] };
  }
  if (candidates.length >= 2) {
    return { utcMs: candidates[0].utc, offsetMinutes: candidates[0].off, anomalies: ['OVERLAP'] };
  }
  // GAP: 전환 **직전** 오프셋으로 UTC 를 확정한다 → 벽시계가 갭 폭만큼 앞으로 밀린다
  //      (SHIFT_FORWARD = Temporal 'compatible'). C00 §4.3 V4 정정 ②.
  let best: number | null = null;
  for (let i = 1; i < KR_TIMELINE.length; i++) {
    const transition = KR_TIMELINE[i].fromUtcMs;
    const before = KR_TIMELINE[i - 1].total;
    const cand = naive - Math.round(before * 60000);
    if (cand >= transition && cand < transition + 86400000) {
      if (best === null || cand < best) best = cand;
    }
  }
  if (best === null) best = naive - Math.round(KR_TIMELINE[0].total * 60000);
  return { utcMs: best, offsetMinutes: offsetAt(best).total, anomalies: ['GAP'] };
}

const DEG = Math.PI / 180;

/**
 * 균시차 E (분). NOAA/Meeus 고정밀식 — C00 §S1-5 / §3-A4.
 * 고정밀 기준 대비 최대 3.03초. 간이식(±36~156초)은 시지 오판율이 15~70배 크다.
 */
export function eotMinutes(utcMs: number): number {
  const jd = utcMs / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const eps0 =
    23 + 26 / 60 + 21.448 / 3600 - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
  const omega = 125.04 - 1934.136 * T;
  const eps = eps0 + 0.00256 * Math.cos(omega * DEG);
  const y = Math.tan((eps / 2) * DEG) ** 2;
  const E =
    y * Math.sin(2 * L0 * DEG) -
    2 * e * Math.sin(M * DEG) +
    4 * e * y * Math.sin(M * DEG) * Math.cos(2 * L0 * DEG) -
    0.5 * y * y * Math.sin(4 * L0 * DEG) -
    1.25 * e * e * Math.sin(2 * M * DEG);
  return (E / DEG) * 4;
}

/** epoch ms 를 UTC 필드로 분해한다 (= "그 오프셋을 더한 로컬 시각" 규약, C00 §S1-1 a-2) */
export function civilFromMs(ms: number): CivilDateTime {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export interface TimeInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface TimeOptions {
  region: PlaceRegion;
  /** null = 진태양시 미적용(STANDARD). 숫자 = 경도 + 균시차 보정(TRUE_SOLAR) */
  longitude: number | null;
  /** false = 표준시 이력 미적용(+09:00 고정, 골든셋 축① 의 `raw_kst`) */
  applyTz: boolean;
  /** region='GENERIC' 필수 */
  stdOffsetMinutes?: number;
  /** region='GENERIC' 필수 */
  dstMinutes?: number;
}

/**
 * 벽시계 입력 → NormalizedTime.
 * 공식은 C00 §S1-1 의 6줄 그대로다. 특히 apparent 에 O_std 를 반드시 더한다(a-2).
 */
export function normalizeTime(input: TimeInput, options: TimeOptions): NormalizedTime {
  const { year, month, day, hour, minute } = input;
  let utcMs: number;
  let offset: TzOffset;
  let anomalies: readonly TimeAnomaly[] = [];

  if (options.region === 'GENERIC') {
    const std = options.stdOffsetMinutes;
    const dst = options.dstMinutes;
    if (typeof std !== 'number' || typeof dst !== 'number') {
      throw new EngineError(
        'MISSING_TZ',
        "region='GENERIC' 은 stdOffsetMinutes / dstMinutes 가 필수다 (ianaTz 만으로는 오프셋을 결정할 수 없다)",
      );
    }
    utcMs = Date.UTC(year, month - 1, day, hour, minute) - (std + dst) * 60000;
    offset = { total: std + dst, std, dst };
  } else if (options.applyTz) {
    const resolved = wallToUtc(year, month, day, hour, minute);
    utcMs = resolved.utcMs;
    anomalies = resolved.anomalies;
    offset = offsetAt(utcMs);
  } else {
    utcMs = Date.UTC(year, month - 1, day, hour, minute) - 540 * 60000;
    offset = { total: 540, std: 540, dst: 0 };
  }

  const standardMs = utcMs + offset.std * 60000;
  let longitudeMinutes = 0;
  let eot = 0;
  let apparentMs = standardMs;
  const mode: TrueSolarMode = options.longitude === null ? 'STANDARD' : 'TRUE_SOLAR';
  if (options.longitude !== null) {
    const standardMeridian = offset.std / 4;
    longitudeMinutes = 4 * (options.longitude - standardMeridian);
    eot = eotMinutes(utcMs);
    apparentMs = standardMs + Math.round((longitudeMinutes + eot) * 60000);
  }

  const effectiveWallMs = utcMs + offset.total * 60000;
  const effectiveWall = civilFromMs(effectiveWallMs);
  const apparent = civilFromMs(apparentMs);
  const standard = civilFromMs(standardMs);

  // 자시 경계 경고 프레임은 **벽시계** 다 (C00 §S1-6 c-2). apparent 로 판정하면
  // 유도 프레임과 적용 프레임이 최대 46분 어긋나 정작 갈리는 케이스를 놓친다.
  const wallMinuteOfDay = effectiveWall.hour * 60 + effectiveWall.minute;
  const nearJasiBoundary = wallMinuteOfDay >= 22 * 60 + 45 || wallMinuteOfDay <= 45;

  const flags: TimeFlags = {
    gap: anomalies.includes('GAP'),
    overlap: anomalies.includes('OVERLAP'),
    dstApplied: offset.dst > 0,
    historicalOffset: offset.std !== 540,
    dayShiftedByTrueSolar:
      apparent.year !== standard.year || apparent.month !== standard.month || apparent.day !== standard.day,
    nearJasiBoundary,
  };

  return {
    instantUtcMs: utcMs,
    effectiveWall,
    apparent: { ms: apparentMs, ...apparent },
    standard: { ms: standardMs, ...standard },
    corrections: {
      stdOffsetMinutes: offset.std,
      standardMeridianDeg: offset.std / 4,
      dstMinutes: offset.dst,
      longitudeMinutes,
      eotMinutes: eot,
      totalMinutes: -offset.dst + longitudeMinutes + eot,
      eotAlgorithm: 'NOAA_MEEUS',
      mode,
    },
    flags,
  };
}
