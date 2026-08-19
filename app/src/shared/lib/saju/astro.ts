// S7 별자리 — 근거: C00 §S7, §3-G(G1~G15b), C07, C19
//
// ★ 이 파일이 사주와 **다른 시계**를 쓴다는 점을 반드시 기억할 것 (C00 §S7-5).
//   사주: 진태양시(경도·균시차 보정) → `time.apparent`
//   별자리: **보정 없는 절대순간** → `time.instantUtcMs`
//   G13 — 항성시/황경 계산은 지리경도를 직접 쓰므로 진태양시를 또 적용하면 이중 보정이다.
//         잘못 적용하면 ASC 궁이 25.31% 바뀐다(C19 §7.3).
//   G14 — 서머타임·표준시 이력은 **적용한다**. `instantUtcMs` 가 이미 반영하고 있다.
//         미적용 시 ASC 궁 50.17% 변경(C19 §7.1).
//   C19 §11-2 — 1972 이전 벽시계는 UT1 로 해석한다. 우리는 UTC↔UT1 변환을 하지 않으므로 그대로 만족한다.
//
// ★ 태양궁은 **런타임 천문계산 0 · 추가 데이터 0** 이다 (C19 §3.5).
//   12궁 경계 황경 {0,30,…,330} 은 24절기 중 12중기의 황경과 정확히 같다. 사주 엔진이 이미 로드한
//   `solar-terms.packed`(24절기 전량) 를 이분탐색하면 태양궁이 그대로 나온다.
//   30만 표본 대조 불일치 0. 고정 날짜표는 어떤 것을 써도 1.07~1.20% 를 오판한다(C19 §3.3).
//
// ★ ASC(상승궁)는 산출하지 않는다 (C00 §3-G15, C19 §5.2).
//   생시 모름 12:00 가정 시 오답률 90.965% ≒ 무작위 91.667% → 정보량 0.
//   생시를 아는 사용자만 내는 것도 가능하지만, 그러려면 GAST + Laskar ε + Asc1 이 붙어
//   번들이 늘고 "어떤 사용자는 나오고 어떤 사용자는 안 나오는" 화면 분기가 생긴다. v1 은 미산출.

import astroTables from '../../data/astro-tables.json';
import { findSolarTerm } from './solar-terms';
import type {
  AmbiguousPlacement,
  AstroChart,
  MoonPlacement,
  NormalizedTime,
  Placement,
  SignIdx,
  ZodiacElement,
} from './types';
import { EngineError } from './types';

const DEG = Math.PI / 180;
const mod360 = (x: number): number => ((x % 360) + 360) % 360;

/** 유닉스 ms → 율리우스일(UT). C19 §11-1: 문자열 파싱을 거치지 않는다 */
export function jdFromMs(utcMs: number): number {
  return utcMs / 86400000 + 2440587.5;
}

export interface SignMeta {
  readonly index: number;
  readonly id: string;
  readonly ko: string;
  readonly en: string;
  readonly element: string;
  readonly lambda: number;
  readonly midTerm: { readonly ko: string; readonly hanja: string };
}

/** 12궁 메타. 지식카드 `zodiac:*` 의 key 가 `id` 다 */
export const SIGNS = astroTables.signs.data as readonly SignMeta[];

/** 생시 모름일 때 달의 "두 궁 병기" 배지 임계 (도). C00 §3-G15b = 5° */
export const MOON_BADGE_DEG = astroTables.moonBadge.data.boundaryDeg;

const polyOf = (coeffs: readonly number[], t: number): number => {
  let s = 0;
  let p = 1;
  for (const c of coeffs) {
    s += c * p;
    p *= t;
  }
  return s;
};

// ── 절기 테이블 이분탐색 기반 태양 황경 ────────────────────────────────────
/** 24절기 황경 슬롯(소한 285 에서 시작해 15° 씩). solar-terms.packed 의 저장 순서와 같다 */
const SLOT_COUNT = 24;
const SLOT_STEP_DEG = 15;
const SLOT_BASE_DEG = 285;

interface TermNode {
  /** 절대순간 */
  t: number;
  /** 연도 블록을 펼친 누적 황경 (단조증가) */
  lam: number;
}

/**
 * y−1 · y · y+1 세 해의 24절기를 시간순으로 펼친다.
 * 테이블 블록이 소한(285°)에서 시작해 동지(270°)로 끝나므로 슬롯 순서 = 시간 순서다(정렬 불필요).
 */
function termNodes(utcMs: number): TermNode[] {
  const y = new Date(utcMs).getUTCFullYear();
  const out: TermNode[] = [];
  for (const yy of [y - 1, y, y + 1]) {
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const lambda = (SLOT_BASE_DEG + slot * SLOT_STEP_DEG) % 360;
      const hit = findSolarTerm(yy, lambda);
      if (hit === null) continue;
      out.push({ t: hit.utcMs, lam: (yy - y) * 360 + SLOT_BASE_DEG + slot * SLOT_STEP_DEG });
    }
  }
  return out;
}

export interface SunSample {
  /** 겉보기 황경(도, 0~360). 절기 노드 4점 큐빅 보간 — **표시 전용**(1900~2100 실측 최대 13.5″) */
  lon: number;
  /** 궁. 보간값이 아니라 **테이블 노드에서 직접** 나온다(경계 오차 0) */
  sign: SignIdx;
  /** 현재 궁의 입궁 절대순간 */
  cuspEnteredUtcMs: number;
  /** 다음 궁의 입궁 절대순간 */
  cuspNextUtcMs: number;
}

/**
 * 태양궁 + 표시용 황경.
 *
 * 궁은 **노드 자체**에서 나온다: 노드 간격이 15° 이고 궁 간격이 30° 라 한 구간 [λⱼ, λⱼ+15) 는
 * 항상 궁 하나 안에 완전히 들어간다 → `floor(λⱼ/30)` 이 곧 궁이다. 보간 오차가 궁을 바꿀 수 없다.
 */
export function sunSample(utcMs: number): SunSample {
  const nodes = termNodes(utcMs);
  if (nodes.length === 0 || utcMs < nodes[0].t || utcMs >= nodes[nodes.length - 1].t) {
    throw new EngineError('OUT_OF_RANGE', `절기 테이블 범위 밖: ${new Date(utcMs).toISOString()}`);
  }
  let lo = 0;
  let hi = nodes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid].t <= utcMs) lo = mid;
    else hi = mid;
  }

  const sign = (((Math.floor(nodes[lo].lam / 30) % 12) + 12) % 12) as SignIdx;

  // 큐빅 라그랑주 4점 보간. 끝단은 안쪽으로 밀어 넣는다.
  let i = lo;
  if (i < 1) i = 1;
  if (i > nodes.length - 3) i = nodes.length - 3;
  let lam = 0;
  for (let k = i - 1; k <= i + 2; k += 1) {
    let p = nodes[k].lam;
    for (let j = i - 1; j <= i + 2; j += 1) {
      if (j !== k) p *= (utcMs - nodes[j].t) / (nodes[k].t - nodes[j].t);
    }
    lam += p;
  }
  // 궁 안으로 가둔다 — 보간 오차 때문에 "양자리인데 29°59′" 같은 표시가 나오지 않게.
  const base = sign * 30;
  const inSign = Math.min(Math.max(mod360(lam) - base, 0), 30 - 1e-9);

  // 현재 궁의 입궁/다음 입궁 = λ ≡ 0 (mod 30) 인 노드
  let enter = lo;
  while (enter > 0 && (((nodes[enter].lam % 30) + 30) % 30) !== 0) enter -= 1;
  let next = lo + 1;
  while (next < nodes.length - 1 && (((nodes[next].lam % 30) + 30) % 30) !== 0) next += 1;

  return {
    lon: base + inSign,
    sign,
    cuspEnteredUtcMs: nodes[enter].t,
    cuspNextUtcMs: nodes[next].t,
  };
}

// ── ΔT (USNO ser7 관측표 + 다항식 외삽) ────────────────────────────────────
const DT = astroTables.deltaT.data;
const DT_VALUES = DT.values as readonly number[];
const DT_END_YEAR = DT.startYear + (DT_VALUES.length - 1) * DT.stepYears;
const DT_SEGMENTS = DT.extrapolation as readonly {
  maxYear: number;
  origin: number;
  coeffs: number[];
}[];
/** 격자 끝에서 다항식이 만드는 단차. 로더에서 한 번만 계산한다 */
const DT_BIAS = (() => {
  const seg = DT_SEGMENTS.find((s) => DT_END_YEAR < s.maxYear) ?? DT_SEGMENTS[DT_SEGMENTS.length - 1];
  return polyOf(seg.coeffs, DT_END_YEAR - seg.origin) - DT_VALUES[DT_VALUES.length - 1] * DT.unitSeconds;
})();

/** 십진 연도 → ΔT(초). C00 §3-G4: Espenak–Meeus 다항식 **단독** 사용 금지 */
export function deltaTSeconds(decimalYear: number): number {
  if (decimalYear <= DT.startYear) return DT_VALUES[0] * DT.unitSeconds;
  if (decimalYear < DT_END_YEAR) {
    const f = (decimalYear - DT.startYear) / DT.stepYears;
    const i = Math.floor(f);
    const a = DT_VALUES[i];
    const b = DT_VALUES[i + 1];
    return (a + (b - a) * (f - i)) * DT.unitSeconds;
  }
  const seg =
    DT_SEGMENTS.find((s) => decimalYear < s.maxYear) ?? DT_SEGMENTS[DT_SEGMENTS.length - 1];
  return polyOf(seg.coeffs, decimalYear - seg.origin) - DT_BIAS;
}

/** JD(UT) → ΔT(초) */
export function deltaTFromJd(jdUt: number): number {
  return deltaTSeconds(2000 + (jdUt - 2451545.0) / 365.25);
}

// ── 달 (Meeus Ch.47) ──────────────────────────────────────────────────────
const MOON = astroTables.moon.data;
const MOON_ARG_KEYS = Object.keys(MOON.args) as (keyof typeof MOON.args)[];
const ADDITIVE_ORDER = MOON.additiveArgOrder as readonly (keyof typeof MOON.args)[];
const NUT = astroTables.nutation.data;
const NUT_ORDER = NUT.argOrder as readonly (keyof typeof NUT.args)[];

/** 장동 Δψ(각초). Meeus Ch.22 저정밀식 — 궁 판정에는 무영향이나 골든셋 대조 오차를 없앤다 */
export function nutationDpsiArcsec(jde: number): number {
  const T = (jde - 2451545.0) / 36525;
  const a: Record<string, number> = {};
  for (const k of NUT_ORDER) a[k] = polyOf(NUT.args[k], T);
  let s = 0;
  for (const [coef, mult] of NUT.dpsiArcsec as unknown as readonly [number, readonly number[]][]) {
    let arg = 0;
    NUT_ORDER.forEach((k, i) => {
      arg += mult[i] * a[k];
    });
    s += coef * Math.sin(arg * DEG);
  }
  return s;
}

export interface MoonSample {
  /** 겉보기 황경(도, 0~360) = 기하 황경 + Δψ */
  lon: number;
  /** 황위(도) */
  lat: number;
  /** 지심 거리(km) */
  distKm: number;
}

/** JDE(TT) → 지심 겉보기 달 위치. Meeus 47.A/47.B 60+60항 전량 + 가산항(C19 §9.2: 가산항 필수) */
export function moonAt(jde: number): MoonSample {
  const T = (jde - 2451545.0) / 36525;
  const a: Record<string, number> = {};
  for (const k of MOON_ARG_KEYS) a[k] = polyOf(MOON.args[k], T);
  const E = a.E;
  const ecc = (m: number): number => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);

  let sumL = 0;
  let sumR = 0;
  for (const [d, m, mp, f, cl, cr] of MOON.tableA as readonly number[][]) {
    const arg = (d * a.D + m * a.M + mp * a.Mp + f * a.F) * DEG;
    const e = ecc(m);
    sumL += cl * e * Math.sin(arg);
    sumR += cr * e * Math.cos(arg);
  }
  let sumB = 0;
  for (const [d, m, mp, f, cb] of MOON.tableB as readonly number[][]) {
    const arg = (d * a.D + m * a.M + mp * a.Mp + f * a.F) * DEG;
    sumB += cb * ecc(m) * Math.sin(arg);
  }
  const combo = (mult: readonly number[]): number => {
    let s = 0;
    ADDITIVE_ORDER.forEach((k, i) => {
      s += mult[i] * a[k];
    });
    return s;
  };
  for (const [coef, mult] of MOON.additiveL as unknown as readonly [number, readonly number[]][]) {
    sumL += coef * Math.sin(combo(mult) * DEG);
  }
  for (const [coef, mult] of MOON.additiveB as unknown as readonly [number, readonly number[]][]) {
    sumB += coef * Math.sin(combo(mult) * DEG);
  }

  return {
    lon: mod360(a.Lp + sumL / 1e6 + nutationDpsiArcsec(jde) / 3600),
    lat: sumB / 1e6,
    distKm: MOON.distanceBaseKm + sumR / 1000,
  };
}

// ── 조립 ──────────────────────────────────────────────────────────────────
function placementOf(lon: number, sign: SignIdx): Placement {
  const meta = SIGNS[sign];
  const within = mod360(lon) - sign * 30;
  const deg = Math.floor(within);
  return {
    lon: mod360(lon),
    sign,
    signId: meta.id,
    signKo: meta.ko,
    element: meta.element as ZodiacElement,
    deg,
    min: Math.floor((within - deg) * 60),
  };
}

/** 12시간(생시 모름 가정폭의 반) */
const HALF_DAY_MS = 43200000;

/**
 * S7 별자리 차트.
 *
 * @param time  S1 결과. **`instantUtcMs` 만** 읽는다(§S7-5 — 진태양시 미적용).
 * @param timeUnknown 생시 모름. 이때 `normalizeInput` 이 벽시계를 12:00 으로 고정해 두었다.
 */
export function computeAstroChart(time: NormalizedTime, timeUnknown: boolean): AstroChart {
  const utcMs = time.instantUtcMs;
  const jdUt = jdFromMs(utcMs);
  const dT = deltaTFromJd(jdUt);
  const jde = jdUt + dT / 86400;

  const s = sunSample(utcMs);
  const sun: AmbiguousPlacement = {
    ...placementOf(s.lon, s.sign),
    alsoSign: null,
    alsoSignKo: null,
  };
  if (timeUnknown) {
    // 12:00 가정이므로 실제 출생시각은 [t−12h, t+12h) 어딘가다. 그 창에 입궁 시각이 있으면 두 궁이 가능하다.
    // 달의 ±5° 배지(§G15b)와 같은 취지이되, 태양은 입궁 시각을 표에서 정확히 알기 때문에 **근사가 아니다**.
    if (s.cuspEnteredUtcMs > utcMs - HALF_DAY_MS) {
      sun.alsoSign = ((s.sign + 11) % 12) as SignIdx;
    } else if (s.cuspNextUtcMs <= utcMs + HALF_DAY_MS) {
      sun.alsoSign = ((s.sign + 1) % 12) as SignIdx;
    }
    if (sun.alsoSign !== null) sun.alsoSignKo = SIGNS[sun.alsoSign].ko;
  }

  const m = moonAt(jde);
  const moonSign = Math.floor(mod360(m.lon) / 30) as SignIdx;
  const moon: MoonPlacement = {
    ...placementOf(m.lon, moonSign),
    lat: m.lat,
    distKm: m.distKm,
    assumedNoon: timeUnknown,
    alsoSign: null,
    alsoSignKo: null,
  };
  if (timeUnknown) {
    // C00 §3-G15b — 12:00 황경이 궁 경계에서 X° 이내면 두 궁 병기.
    // X=5° 실측: 표시율 33.59%, 전체 오답의 92.61% 포착 (C19 §4.3).
    const within = mod360(m.lon) - moonSign * 30;
    if (within < MOON_BADGE_DEG) moon.alsoSign = ((moonSign + 11) % 12) as SignIdx;
    else if (within > 30 - MOON_BADGE_DEG) moon.alsoSign = ((moonSign + 1) % 12) as SignIdx;
    if (moon.alsoSign !== null) moon.alsoSignKo = SIGNS[moon.alsoSign].ko;
  }

  return {
    zodiac: 'tropical',
    jdUt,
    deltaTSeconds: dT,
    sun,
    moon,
    asc: null,
    ascOmittedReason: 'C00 §3-G15 — 생시 모름 12:00 가정 오답률 90.97% ≒ 무작위 91.67%. 정보량 0이라 v1은 미산출',
    trueSolarApplied: false,
  };
}
