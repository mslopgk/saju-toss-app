// 별자리(S7) 데이터 자산 생성기 — 개발 전용, 결정론적.
// 출력: src/shared/data/astro-tables.json
//
// 실행: node src/shared/data/tools/gen-astro-tables.mjs   (앱 루트에서)
// 요구: docs/research/calc/proto/oracle/deltat-obs.js (USNO ser7 관측/예측 ΔT, 리서치 워크스페이스)
//
// 담기는 것 3종:
//  ① 12궁 메타 — 경계 황경 {0,30,…,330} 은 **24절기 중 12중기와 동일**하다(C19 §3.5).
//     그래서 태양궁은 solar-terms.packed 이분탐색으로 나오고 별도 좌표 데이터가 필요 없다.
//  ② 달 급수 — Meeus 『Astronomical Algorithms』 2nd ed. Ch.47 Table 47.A/47.B 60+60항 전량 + 가산항.
//     C00 §S7-1(b) 는 "예제 47.a 를 자릿수까지 재현" 을 요구하며, 이 스크립트는 쓰기 직전에
//     그 재현을 실제로 검사한다(불일치면 파일을 쓰지 않고 죽는다) — 전사 오류 방지 게이트.
//  ③ ΔT — USNO ser7 관측표(E&M 다항식 단독 사용 금지, C00 §S7-1(a)/§3-G4).
//     원표는 1657.0~2033.75 · 1,302점(0.5년/1개월/0.25년 혼합 간격)이라 그대로 담으면 크다.
//     지원범위(1900~2100) 가 실제로 조회하는 구간만 **0.5년 균일 격자로 재표본**하고,
//     격자 밖(> 2033.75)은 E&M 다항식 2구간 + 경계 연속성 보정으로 잇는다(oracle deltaTHybrid 와 동일 구조).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTO = path.resolve(HERE, '../../../../../docs/research/calc/proto');
const OUT = path.resolve(HERE, '../astro-tables.json');
const require = createRequire(path.join(PROTO, 'oracle/x.js'));

// ── ① 12궁 ────────────────────────────────────────────────────────────────
// id 는 지식카드 `zodiac:*` 의 key 와 글자 단위로 같아야 한다(cards.json).
// midTerm 은 그 궁의 시작 황경과 같은 절기(중기) — 태양궁 조회가 실제로 읽는 값이다.
const SIGNS = [
  ['aries', '양자리', 'Aries', 'fire', '춘분', '春分'],
  ['taurus', '황소자리', 'Taurus', 'earth', '곡우', '穀雨'],
  ['gemini', '쌍둥이자리', 'Gemini', 'air', '소만', '小滿'],
  ['cancer', '게자리', 'Cancer', 'water', '하지', '夏至'],
  ['leo', '사자자리', 'Leo', 'fire', '대서', '大暑'],
  ['virgo', '처녀자리', 'Virgo', 'earth', '처서', '處暑'],
  ['libra', '천칭자리', 'Libra', 'air', '추분', '秋分'],
  ['scorpio', '전갈자리', 'Scorpio', 'water', '상강', '霜降'],
  ['sagittarius', '사수자리', 'Sagittarius', 'fire', '소설', '小雪'],
  ['capricorn', '염소자리', 'Capricorn', 'earth', '동지', '冬至'],
  ['aquarius', '물병자리', 'Aquarius', 'air', '대한', '大寒'],
  ['pisces', '물고기자리', 'Pisces', 'water', '우수', '雨水'],
].map(([id, ko, en, element, termKo, termHanja], i) => ({
  index: i,
  id,
  ko,
  en,
  element,
  lambda: i * 30,
  midTerm: { ko: termKo, hanja: termHanja },
}));

// ── ② 달 (Meeus Ch.47) ────────────────────────────────────────────────────
// 기본 인수 다항식 (Meeus 47.1~47.6, T = 율리우스세기(TT) from J2000). 계수 순서 = T^0, T^1, ….
const MOON_ARGS = {
  Lp: [218.3164477, 481267.88123421, -0.0015786, 1 / 538841, -1 / 65194000],
  D: [297.8501921, 445267.1114034, -0.0018819, 1 / 545868, -1 / 113065000],
  M: [357.5291092, 35999.0502909, -0.0001536, 1 / 24490000],
  Mp: [134.9633964, 477198.8675055, 0.0087414, 1 / 69699, -1 / 14712000],
  F: [93.272095, 483202.0175233, -0.0036539, -1 / 3526000, 1 / 863310000],
  A1: [119.75, 131.849],
  A2: [53.09, 479264.29],
  A3: [313.45, 481266.484],
  E: [1, -0.002516, -0.0000074],
};

// [D, M, M', F, Σl(1e-6 deg), Σr(1e-3 km)] — Table 47.A
const TABLE_A = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];

// [D, M, M', F, Σb(1e-6 deg)] — Table 47.B
const TABLE_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777], [4, 0, -2, 1, 671], [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366], [2, 1, 0, 1, -351], [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315], [2, -2, 0, -1, 302], [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181], [0, 1, 2, 1, -177], [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166], [1, 0, 1, -1, -164], [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107],
];

// 가산항. 인수는 [L', D, M, M', F, A1, A2, A3] 의 정수 결합으로 적는다(코드에 식을 다시 쓰지 않기 위해).
const ADDITIVE_ARG_ORDER = ['Lp', 'D', 'M', 'Mp', 'F', 'A1', 'A2', 'A3'];
const ADDITIVE_L = [
  [3958, [0, 0, 0, 0, 0, 1, 0, 0]],
  [1962, [1, 0, 0, 0, -1, 0, 0, 0]],
  [318, [0, 0, 0, 0, 0, 0, 1, 0]],
];
const ADDITIVE_B = [
  [-2235, [1, 0, 0, 0, 0, 0, 0, 0]],
  [382, [0, 0, 0, 0, 0, 0, 0, 1]],
  [175, [0, 0, 0, 0, -1, 1, 0, 0]],
  [175, [0, 0, 0, 0, 1, 1, 0, 0]],
  [127, [1, 0, 0, -1, 0, 0, 0, 0]],
  [-115, [1, 0, 0, 1, 0, 0, 0, 0]],
];
/** 거리 상수항 (km) — Δ = 385000.56 + Σr/1000 */
const MOON_DISTANCE_BASE = 385000.56;

// 장동 Δψ 저정밀식 (Meeus Ch.22, 정확도 약 0.5″). 인수 = [Ω, L, L'].
const NUTATION_ARGS = {
  Omega: [125.04452, -1934.136261],
  L: [280.4665, 36000.7698],
  Lp: [218.3165, 481267.8813],
};
const NUTATION_ARG_ORDER = ['Omega', 'L', 'Lp'];
const NUTATION_DPSI = [
  [-17.2, [1, 0, 0]],
  [-1.32, [0, 2, 0]],
  [-0.23, [0, 0, 2]],
  [0.21, [2, 0, 0]],
];

// ── 생성 직전 자체검증: Meeus 예제 47.a ────────────────────────────────────
const DEG = Math.PI / 180;
const poly = (c, t) => c.reduce((s, k, i) => s + k * t ** i, 0);

function moonSelfTest(jde) {
  const T = (jde - 2451545.0) / 36525;
  const A = {};
  for (const [k, c] of Object.entries(MOON_ARGS)) A[k] = poly(c, T);
  const E = A.E;
  let sl = 0, sr = 0, sb = 0;
  const ecc = (m) => (m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E);
  for (const [d, m, mp, f, cl, cr] of TABLE_A) {
    const arg = (d * A.D + m * A.M + mp * A.Mp + f * A.F) * DEG;
    sl += cl * ecc(m) * Math.sin(arg);
    sr += cr * ecc(m) * Math.cos(arg);
  }
  for (const [d, m, mp, f, cb] of TABLE_B) {
    const arg = (d * A.D + m * A.M + mp * A.Mp + f * A.F) * DEG;
    sb += cb * ecc(m) * Math.sin(arg);
  }
  const combo = (v) => ADDITIVE_ARG_ORDER.reduce((s, k, i) => s + v[i] * A[k], 0);
  for (const [c, v] of ADDITIVE_L) sl += c * Math.sin(combo(v) * DEG);
  for (const [c, v] of ADDITIVE_B) sb += c * Math.sin(combo(v) * DEG);
  return {
    lon: ((((A.Lp + sl / 1e6) % 360) + 360) % 360),
    lat: sb / 1e6,
    dist: MOON_DISTANCE_BASE + sr / 1000,
  };
}

// Meeus 예제 47.a — 1992 April 12.0 TD (JDE 2448724.5)
const ex = moonSelfTest(2448724.5);
const EXPECT = { lon: 133.162655, lat: -3.229126, dist: 368409.7 };
const bad = [];
if (Math.abs(ex.lon - EXPECT.lon) > 5e-7) bad.push(`λ ${ex.lon} ≠ ${EXPECT.lon}`);
if (Math.abs(ex.lat - EXPECT.lat) > 5e-7) bad.push(`β ${ex.lat} ≠ ${EXPECT.lat}`);
if (Math.abs(ex.dist - EXPECT.dist) > 0.05) bad.push(`Δ ${ex.dist} ≠ ${EXPECT.dist}`);
if (bad.length > 0) {
  console.error('Meeus 예제 47.a 재현 실패 — 계수 전사 오류다. 파일을 쓰지 않는다.');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}

// ── ③ ΔT ─────────────────────────────────────────────────────────────────
const OBS = require('./deltat-obs.js'); // [[십진연도, ΔT초], …] 1657.0 ~ 2033.75
const obsAt = (y) => {
  if (y <= OBS[0][0]) return OBS[0][1];
  const last = OBS[OBS.length - 1];
  if (y >= last[0]) return last[1];
  let lo = 0, hi = OBS.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (OBS[m][0] <= y) lo = m; else hi = m;
  }
  const [y0, v0] = OBS[lo], [y1, v1] = OBS[hi];
  return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
};

/** 재표본 격자 — 지원범위(1900~2100) 조회가 닿는 구간만. 상한은 원표 끝(2033.75) 직전 0.5년 눈금 */
const GRID_START = 1899.0;
const GRID_STEP = 0.5;
const GRID_END = 2033.5;
const grid = [];
for (let y = GRID_START; y <= GRID_END + 1e-9; y += GRID_STEP) {
  grid.push(Math.round(obsAt(+y.toFixed(4)) * 100)); // 0.01초 단위 정수
}

/**
 * 격자 밖(> GRID_END) 다항식. Espenak & Meeus 2006, 우리 지원범위에 닿는 두 구간만 담는다.
 *  2005 ≤ y < 2050 : 62.92 + 0.32217 t + 0.005589 t²      (t = y − 2000)
 *  2050 ≤ y < 2150 : −20 + 32u² − 0.5628(2150 − y), u=(y−1820)/100
 *                  = −205.724 + 0.5628 s + 0.0032 s²       (s = y − 1820)
 * 경계 연속성 보정(bias)은 로더가 격자 끝값으로 직접 계산한다 — 여기서 굽지 않는다.
 */
const EXTRAPOLATION = [
  { maxYear: 2050, origin: 2000, coeffs: [62.92, 0.32217, 0.005589] },
  { maxYear: 2150, origin: 1820, coeffs: [-205.724, 0.5628, 0.0032] },
];

// 재표본 오차 실측 (원표 vs 격자 선형보간)
const gridAt = (y) => {
  if (y <= GRID_START) return grid[0] / 100;
  if (y >= GRID_END) {
    const seg = EXTRAPOLATION.find((s) => y < s.maxYear) ?? EXTRAPOLATION[EXTRAPOLATION.length - 1];
    const biasSeg = EXTRAPOLATION.find((s) => GRID_END < s.maxYear);
    const bias = poly(biasSeg.coeffs, GRID_END - biasSeg.origin) - grid[grid.length - 1] / 100;
    return poly(seg.coeffs, y - seg.origin) - bias;
  }
  const f = (y - GRID_START) / GRID_STEP;
  const i = Math.floor(f);
  return (grid[i] + (grid[i + 1] - grid[i]) * (f - i)) / 100;
};
let maxDev = 0, maxDevAt = 0;
for (let y = 1900; y <= 2033.5; y += 1 / 365.25) {
  const d = Math.abs(gridAt(y) - obsAt(y));
  if (d > maxDev) { maxDev = d; maxDevAt = y; }
}

const json = {
  _meta: {
    name: 'astro-tables',
    version: '1.0.0',
    generated_by: 'src/shared/data/tools/gen-astro-tables.mjs',
    generated_from: [
      'Meeus, Astronomical Algorithms 2nd ed., Ch.47 Table 47.A/47.B (60+60항 + 가산항) · Ch.22 저정밀 Δψ',
      'docs/research/calc/proto/oracle/deltat-obs.js (USNO ser7 historic_deltat + deltat + deltat.preds)',
      'docs/research/calc/C19-별자리-계산-실측검증.md §3.5 · §4.3 · §9.2',
      'docs/research/calc/C00-계산엔진-통합명세서.md §S7 · §3-G',
    ],
    selfTest: {
      note: '생성 시 Meeus 예제 47.a 를 재현해야만 파일이 쓰인다.',
      jde: 2448724.5,
      lon: ex.lon,
      lat: ex.lat,
      distKm: ex.dist,
    },
    deltaTResample: {
      note: 'USNO 원표(혼합 간격 1,302점) → 0.5년 균일 격자 재표본. 아래는 1900~2033.5 일 단위 스캔 실측 최대 편차(초).',
      maxDeviationSeconds: +maxDev.toFixed(6),
      atDecimalYear: +maxDevAt.toFixed(3),
      moonArcsecEquivalent: +(maxDev * 0.549).toFixed(6),
    },
  },

  signs: {
    _source: 'C19 §3.5 (12궁 경계 황경 = 24절기 중 12중기) · C00 §S7-1 (Tropical 고정)',
    _confidence: 'A',
    _rule: 'signIndex = floor(mod(λ,360)/30), 좌폐구간 [start,end). id 는 지식카드 zodiac:* 의 key 와 동일',
    data: SIGNS,
  },

  moonBadge: {
    _source: 'C00 §3-G15b · C19 §4.3 (X=5° 권고: 표시율 33.59%, 전체 오답의 92.61% 포착)',
    _confidence: 'A',
    _note: '생시 모름(12:00 가정)일 때만 적용한다.',
    data: { boundaryDeg: 5 },
  },

  moon: {
    _source: 'Meeus Ch.47 Table 47.A/47.B 전량 + 가산항 (C00 §S7-1(a), C19 §9.2: 가산항 누락 시 최대 0.372′)',
    _confidence: 'A',
    _rule: 'ecc: |M|=1 이면 ×E, |M|=2 이면 ×E². λ = L\' + Σl/1e6, β = Σb/1e6, Δ = 385000.56 + Σr/1000',
    data: {
      args: MOON_ARGS,
      additiveArgOrder: ADDITIVE_ARG_ORDER,
      tableA: TABLE_A,
      tableB: TABLE_B,
      additiveL: ADDITIVE_L,
      additiveB: ADDITIVE_B,
      distanceBaseKm: MOON_DISTANCE_BASE,
    },
  },

  nutation: {
    _source: 'Meeus Ch.22 저정밀 Δψ (정확도 약 0.5″)',
    _confidence: 'B',
    _note: '겉보기 황경 = 기하 황경 + Δψ. 궁 판정에는 사실상 무영향(17″/108000″)이나 골든셋 대조 오차를 없앤다.',
    data: { args: NUTATION_ARGS, argOrder: NUTATION_ARG_ORDER, dpsiArcsec: NUTATION_DPSI },
  },

  deltaT: {
    _source: 'USNO ser7 관측/예측표 (C00 §3-G4: E&M 다항식 단독 사용 금지)',
    _confidence: 'A',
    _rule: 'y = 2000 + (jdUT − 2451545)/365.25. 격자 안이면 선형보간, 밖이면 다항식 − 경계 bias',
    data: {
      startYear: GRID_START,
      stepYears: GRID_STEP,
      unitSeconds: 0.01,
      values: grid,
      extrapolation: EXTRAPOLATION,
    },
  },
};

fs.writeFileSync(OUT, JSON.stringify(json, null, 1) + '\n', 'utf8');
const bytes = fs.statSync(OUT).size;
console.log(`wrote ${OUT} (${bytes} B)`);
console.log(`  Meeus 47.a: λ=${ex.lon.toFixed(6)} β=${ex.lat.toFixed(6)} Δ=${ex.dist.toFixed(1)} ✔`);
console.log(`  ΔT 격자 ${grid.length}점 (${GRID_START}~${GRID_END}), 재표본 최대편차 ${maxDev.toFixed(4)}초 (달 ${(maxDev * 0.549).toFixed(3)}″)`);
