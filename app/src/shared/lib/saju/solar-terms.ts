// S2 절기 — 근거: C00 §S2-1 ~ §S2-3, §3-B1~B4, §4.2
//
// F2: 런타임 천문계산 없음. 빌드타임 Skyfield + JPL DE440s 로 만든 초(ms) 정밀 사전계산표만 읽는다.
// B3: 절입 정각은 새 월지에 **포함**된다(`>=`). `>` 로 쓰면 오차가 1분이 아니라 한 달이다.
// B4: 절기 비교 기준 시계는 **UTC 절대순간**이다(F3). 진태양시·야자시 옵션의 영향을 받지 않는다.

import {
  SOLAR_TERMS_BASE_YEAR,
  SOLAR_TERMS_COUNT,
  SOLAR_TERMS_EPOCH_MS,
  SOLAR_TERMS_MAX_YEAR,
  SOLAR_TERMS_PACKED,
} from '../../data/solar-terms.packed';
import { SOLAR_TERMS_EXT } from '../../data/solar-terms-ext';
import type { BranchIdx, JieContext, JieDef, JieHit, JieIndex } from './types';
import { EngineError } from './types';

/** 12절(節) — λ mod 30 === 15. 월주에는 12절만 쓴다(中氣 사용 금지, C00 §S2-1) */
export const JIE: readonly JieDef[] = [
  { jieIndex: 0, lambda: 315, ko: '입춘', hanja: '立春', monthBranchIdx: 2, monthOrder: 0 },
  { jieIndex: 1, lambda: 345, ko: '경칩', hanja: '驚蟄', monthBranchIdx: 3, monthOrder: 1 },
  { jieIndex: 2, lambda: 15, ko: '청명', hanja: '淸明', monthBranchIdx: 4, monthOrder: 2 },
  { jieIndex: 3, lambda: 45, ko: '입하', hanja: '立夏', monthBranchIdx: 5, monthOrder: 3 },
  { jieIndex: 4, lambda: 75, ko: '망종', hanja: '芒種', monthBranchIdx: 6, monthOrder: 4 },
  { jieIndex: 5, lambda: 105, ko: '소서', hanja: '小暑', monthBranchIdx: 7, monthOrder: 5 },
  { jieIndex: 6, lambda: 135, ko: '입추', hanja: '立秋', monthBranchIdx: 8, monthOrder: 6 },
  { jieIndex: 7, lambda: 165, ko: '백로', hanja: '白露', monthBranchIdx: 9, monthOrder: 7 },
  { jieIndex: 8, lambda: 195, ko: '한로', hanja: '寒露', monthBranchIdx: 10, monthOrder: 8 },
  { jieIndex: 9, lambda: 225, ko: '입동', hanja: '立冬', monthBranchIdx: 11, monthOrder: 9 },
  { jieIndex: 10, lambda: 255, ko: '대설', hanja: '大雪', monthBranchIdx: 0, monthOrder: 10 },
  { jieIndex: 11, lambda: 285, ko: '소한', hanja: '小寒', monthBranchIdx: 1, monthOrder: 11 },
];

export const SOLAR_TERM_TABLE_RANGE: readonly [number, number] = [
  SOLAR_TERMS_BASE_YEAR,
  SOLAR_TERMS_MAX_YEAR,
];

let decoded: Float64Array | null = null;

/** 2차차분 zigzag varint base64 → 절대 ms 배열. 첫 호출에서만 디코드한다 */
function table(): Float64Array {
  if (decoded !== null) return decoded;
  const bin = atob(SOLAR_TERMS_PACKED);
  let p = 0;
  const readVarint = (): number => {
    let value = 0;
    let mul = 1;
    for (;;) {
      const b = bin.charCodeAt(p++);
      value += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) return value;
      // 값이 2^32 를 넘으므로 비트연산이 아니라 곱셈으로 자릿수를 올린다
      mul *= 128;
    }
  };
  const unzigzag = (v: number): number => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);

  const out = new Float64Array(SOLAR_TERMS_COUNT);
  out[0] = SOLAR_TERMS_EPOCH_MS + readVarint();
  let delta = readVarint();
  out[1] = out[0] + delta;
  for (let i = 2; i < SOLAR_TERMS_COUNT; i++) {
    delta += unzigzag(readVarint());
    out[i] = out[i - 1] + delta;
  }
  decoded = out;
  return out;
}

/** 황경 → 태양년 블록 안의 슬롯. 블록은 소한(285)에서 시작한다 */
const slotOf = (sunLng: number): number => ((((sunLng - 285) % 360) + 360) % 360) / 15;

const extIndex: Map<string, number> = new Map(
  SOLAR_TERMS_EXT.map((r) => [`${r[0]}:${r[1]}`, r[2]]),
);

/** DE440s 표 안이면 'de440s', 저정밀 확장표면 'approx' */
export type SolarTermPrecision = 'de440s' | 'approx';

export interface SolarTermLookup {
  utcMs: number;
  precision: SolarTermPrecision;
}

/** (테이블 연도, 황경) → 절기 절대순간. 없으면 null */
export function findSolarTerm(year: number, sunLng: number): SolarTermLookup | null {
  if (year >= SOLAR_TERMS_BASE_YEAR && year <= SOLAR_TERMS_MAX_YEAR) {
    const idx = (year - SOLAR_TERMS_BASE_YEAR) * 24 + slotOf(sunLng);
    return { utcMs: table()[idx], precision: 'de440s' };
  }
  const ext = extIndex.get(`${year}:${sunLng}`);
  return ext === undefined ? null : { utcMs: ext, precision: 'approx' };
}

/** (테이블 연도, 황경) → 절기 절대순간. 없으면 OUT_OF_RANGE */
export function solarTermUtcMs(year: number, sunLng: number): number {
  const hit = findSolarTerm(year, sunLng);
  if (hit === null) {
    throw new EngineError('OUT_OF_RANGE', `절기 테이블 범위 밖: ${year}년 λ=${sunLng}°`);
  }
  return hit.utcMs;
}

interface JieScan extends JieHit {
  precision: SolarTermPrecision;
}

/**
 * 후보 연도 3개(y−1, y, y+1) × 12절 을 훑는다.
 * 테이블에 없는 연도는 건너뛴다 — prev 탐색에서 y+1 이, next 탐색에서 y−1 이 없어도
 * 정답은 바뀌지 않기 때문이다(태양년 블록이 연도 경계를 한 칸만 넘는다).
 */
function scan(utcMs: number, want: 'prev' | 'next'): JieScan {
  const y = new Date(utcMs).getUTCFullYear();
  let best: JieScan | null = null;
  for (const yy of [y - 1, y, y + 1]) {
    for (const def of JIE) {
      const hit = findSolarTerm(yy, def.lambda);
      if (hit === null) continue;
      const t = hit.utcMs;
      const ok = want === 'prev' ? t <= utcMs : t > utcMs;
      if (!ok) continue;
      const better = best === null || (want === 'prev' ? t > best.utcMs : t < best.utcMs);
      if (better) best = { ...def, utcMs: t, gregYear: yy, precision: hit.precision };
    }
  }
  if (best === null) {
    throw new EngineError('OUT_OF_RANGE', `절기 테이블 범위 밖: ${new Date(utcMs).toISOString()}`);
  }
  return best;
}

/** 절입 정각 포함(`<=`) — C00 §3-B3 */
export function prevJie(utcMs: number): JieHit {
  return scan(utcMs, 'prev');
}
export function nextJie(utcMs: number): JieHit {
  return scan(utcMs, 'next');
}

/** 경계 경고 임계 — C00 §5.4 (|절입 − 출생| < 60초) */
const BOUNDARY_WARNING_MS = 60000;

export function buildJieContext(instantUtcMs: number): JieContext {
  const prev = scan(instantUtcMs, 'prev');
  const next = scan(instantUtcMs, 'next');
  // 사주년: 소한(monthOrder 11) 구간이면 절기 테이블 연도 − 1 (C00 §S2-1)
  const sajuYear = prev.monthOrder === 11 ? prev.gregYear - 1 : prev.gregYear;
  return {
    prev,
    next,
    sajuYear,
    monthOrder: prev.monthOrder,
    monthBranchIdx: ((prev.monthOrder + 2) % 12) as BranchIdx,
    minutesFromPrevJie: (instantUtcMs - prev.utcMs) / 60000,
    minutesToNextJie: (next.utcMs - instantUtcMs) / 60000,
    boundaryWarning:
      instantUtcMs - prev.utcMs < BOUNDARY_WARNING_MS ||
      next.utcMs - instantUtcMs < BOUNDARY_WARNING_MS,
  };
}

/** 절기 조회 정밀도. 지원범위(1900~2100) 밖에서만 'approx' 가 나온다 */
export function jieContextPrecision(instantUtcMs: number): SolarTermPrecision {
  return scan(instantUtcMs, 'prev').precision === 'de440s' &&
    scan(instantUtcMs, 'next').precision === 'de440s'
    ? 'de440s'
    : 'approx';
}

/** 사주년 확정 (입춘 경계). JieContext 없이 연주만 필요할 때 */
export function sajuYearOf(instantUtcMs: number): number {
  const prev = scan(instantUtcMs, 'prev');
  return prev.monthOrder === 11 ? prev.gregYear - 1 : prev.gregYear;
}

export type { JieIndex };
