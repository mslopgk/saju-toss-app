'use strict';
// timenorm.js — 입력 벽시계 → UTC 순간 → 진태양시. C15 §9 확정 사양의 독립 구현.
//   · KR_TIMELINE: IANA tzdata asia(Zone Asia/Seoul + Rule ROK) 전개, C15 §2.2/§3.1 표 그대로
//   · 균시차: 본 프로토타입 자체 고정밀(Meeus 28.3) 을 기본값으로 사용. NOAA_MEEUS 도 선택 가능
const S = require('./sun.js');
const { msToJD } = require('./jd.js');
const { deltaTFromJD } = require('./deltat.js');

const U = (y, mo, d, h, mi, s) => Date.UTC(y, mo - 1, d, h, mi, s || 0);

/** [전환 UTC(ms), 표준오프셋(분), 서머타임(분)] */
const KR_TIMELINE = [
  [-Infinity,               507 + 52 / 60, 0],   // LMT +08:27:52
  [U(1908, 3, 31, 15, 32, 8), 510,  0],
  [U(1911, 12, 31, 15, 30),   540,  0],
  [U(1948, 5, 31, 15, 0),     540, 60],
  [U(1948, 9, 12, 14, 0),     540,  0],
  [U(1949, 4, 2, 15, 0),      540, 60],
  [U(1949, 9, 10, 14, 0),     540,  0],
  [U(1950, 3, 31, 15, 0),     540, 60],
  [U(1950, 9, 9, 14, 0),      540,  0],
  [U(1951, 5, 5, 15, 0),      540, 60],
  [U(1951, 9, 8, 14, 0),      540,  0],
  [U(1954, 3, 20, 15, 0),     510,  0],
  [U(1955, 5, 4, 15, 30),     510, 60],
  [U(1955, 9, 8, 14, 30),     510,  0],
  [U(1956, 5, 19, 15, 30),    510, 60],
  [U(1956, 9, 29, 14, 30),    510,  0],
  [U(1957, 5, 4, 15, 30),     510, 60],
  [U(1957, 9, 21, 14, 30),    510,  0],
  [U(1958, 5, 3, 15, 30),     510, 60],
  [U(1958, 9, 20, 14, 30),    510,  0],
  [U(1959, 5, 2, 15, 30),     510, 60],
  [U(1959, 9, 19, 14, 30),    510,  0],
  [U(1960, 4, 30, 15, 30),    510, 60],
  [U(1960, 9, 17, 14, 30),    510,  0],
  [U(1961, 8, 9, 15, 30),     540,  0],
  [U(1987, 5, 9, 17, 0),      540, 60],
  [U(1987, 10, 10, 17, 0),    540,  0],
  [U(1988, 5, 7, 17, 0),      540, 60],
  [U(1988, 10, 8, 17, 0),     540,  0],
];

function krOffsetAt(utcMs) {
  let seg = KR_TIMELINE[0];
  for (const s of KR_TIMELINE) { if (utcMs >= s[0]) seg = s; else break; }
  return { std: seg[1], dst: seg[2], total: seg[1] + seg[2] };
}

/** 벽시계(ms) → 가능한 UTC 후보 전부. 0개=GAP, 2개=OVERLAP */
function resolveKR(wallMs) {
  const cands = [], seen = new Set();
  for (const s of KR_TIMELINE) {
    const off = s[1] + s[2];
    const utc = wallMs - off * 60000;
    const a = krOffsetAt(utc);
    if (a.std + a.dst === off && !seen.has(utc)) { seen.add(utc); cands.push({ utc, std: a.std, dst: a.dst }); }
  }
  cands.sort((a, b) => a.utc - b.utc);
  return cands;
}

const EOT = {
  SELF_HIGH: utcMs => S.equationOfTimeHigh(msToJD(utcMs) + deltaTFromJD(msToJD(utcMs)) / 86400),
  NOAA_MEEUS: utcMs => S.equationOfTimeNOAA(msToJD(utcMs) + deltaTFromJD(msToJD(utcMs)) / 86400),
  NONE: () => 0,
};

const SEOUL_LON = 126.9784204;      // C15 §7.2 서울특별시청 (Nominatim 실측)

/**
 * @returns { utcMs, std, dst, L, E, delta, tMs(진태양시를 UTC필드로 담은 ms), flags }
 */
function normalizeBirthTime(o) {
  const { y, mo, d, hh, mi, region = 'KR', lon = SEOUL_LON, mode = 'TRUE_SOLAR',
          gapPolicy = 'SHIFT_FORWARD', overlapPolicy = 'FIRST', eotAlgo = 'SELF_HIGH',
          stdOffsetMin = null, dstOffsetMin = 0 } = o;
  const flags = [];
  const wallMs = U(y, mo, d, hh, mi);
  let utcMs, std, dst;

  if (region === 'KR') {
    const c = resolveKR(wallMs);
    if (c.length === 1) { utcMs = c[0].utc; std = c[0].std; dst = c[0].dst; }
    else if (c.length === 0) {
      flags.push('GAP');
      let nextIdx = -1;
      for (let i = 0; i < KR_TIMELINE.length; i++) {
        const s = KR_TIMELINE[i];
        if (wallMs - (s[1] + s[2]) * 60000 < s[0]) { nextIdx = i; break; }
      }
      if (gapPolicy === 'THROW') throw new Error(`NONEXISTENT_WALL_TIME ${y}-${mo}-${d} ${hh}:${mi}`);
      if (gapPolicy === 'SHIFT_FORWARD') {
        const pre = KR_TIMELINE[nextIdx - 1];
        utcMs = wallMs - (pre[1] + pre[2]) * 60000;
        const a = krOffsetAt(utcMs); std = a.std; dst = a.dst;
        flags.push('GAP_SHIFT_FORWARD');
      } else {
        utcMs = KR_TIMELINE[nextIdx][0];
        const a = krOffsetAt(utcMs); std = a.std; dst = a.dst;
        flags.push('GAP_SNAP_TO_TRANSITION');
      }
    } else {
      flags.push('OVERLAP');
      if (overlapPolicy === 'THROW') throw new Error(`AMBIGUOUS_WALL_TIME ${y}-${mo}-${d} ${hh}:${mi}`);
      const pick = overlapPolicy === 'LAST' ? c[c.length - 1] : c[0];
      utcMs = pick.utc; std = pick.std; dst = pick.dst; flags.push('OVERLAP_' + overlapPolicy);
    }
  } else {
    if (stdOffsetMin === null) throw new Error('stdOffsetMin required for GENERIC');
    std = stdOffsetMin; dst = dstOffsetMin; utcMs = wallMs - (std + dst) * 60000;
  }

  const lamStd = std / 4;
  const L = 4 * (lon - lamStd);
  const E = EOT[eotAlgo](utcMs);

  let tMs;
  if (mode === 'CIVIL')          tMs = utcMs + (std + dst) * 60000;
  else if (mode === 'DST_ONLY')  tMs = utcMs + std * 60000;
  else if (mode === 'LONGITUDE') tMs = utcMs + 4 * lon * 60000;
  else                           tMs = utcMs + 4 * lon * 60000 + E * 60000;

  return { utcMs, std, dst, lamStd, L, E, tMs: Math.round(tMs / 1000) * 1000,
           delta: (tMs - wallMs) / 60000, flags };
}

module.exports = { KR_TIMELINE, krOffsetAt, resolveKR, normalizeBirthTime, EOT, SEOUL_LON, U };
