'use strict';
// deltat.js — ΔT = TT − UT (Espenak & Meeus 다항식, C02 §5 표 전체)
// 입력: 십진 연도 y = year + (month - 0.5)/12

function deltaTSeconds(y) {
  let t, u;
  if (y < -500) { u = (y - 1820) / 100; return -20 + 32 * u * u; }
  if (y < 500)  { u = y / 100; return 10583.6 - 1014.41*u + 33.78311*u**2 - 5.952053*u**3
                        - 0.1798452*u**4 + 0.022174192*u**5 + 0.0090316521*u**6; }
  if (y < 1600) { u = (y - 1000) / 100; return 1574.2 - 556.01*u + 71.23472*u**2 + 0.319781*u**3
                        - 0.8503463*u**4 - 0.005050998*u**5 + 0.0083572073*u**6; }
  if (y < 1700) { t = y - 1600; return 120 - 0.9808*t - 0.01532*t**2 + t**3/7129; }
  if (y < 1800) { t = y - 1700; return 8.83 + 0.1603*t - 0.0059285*t**2 + 0.00013336*t**3 - t**4/1174000; }
  if (y < 1860) { t = y - 1800; return 13.72 - 0.332447*t + 0.0068612*t**2 + 0.0041116*t**3
                        - 0.00037436*t**4 + 0.0000121272*t**5 - 0.0000001699*t**6 + 0.000000000875*t**7; }
  if (y < 1900) { t = y - 1860; return 7.62 + 0.5737*t - 0.251754*t**2 + 0.01680668*t**3
                        - 0.0004473624*t**4 + t**5/233174; }
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119*t - 0.0598939*t**2 + 0.0061966*t**3 - 0.000197*t**4; }
  if (y < 1941) { t = y - 1920; return 21.20 + 0.84493*t - 0.076100*t**2 + 0.0020936*t**3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407*t - t**2/233 + t**3/2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067*t - t**2/260 - t**3/718; }
  if (y < 2005) { t = y - 2000; return 63.86 + 0.3345*t - 0.060374*t**2 + 0.0017275*t**3
                        + 0.000651814*t**4 + 0.00002373599*t**5; }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217*t + 0.005589*t**2; }
  if (y < 2150) { return -20 + 32*((y-1820)/100)**2 - 0.5628*(2150 - y); }
  u = (y - 1820) / 100; return -20 + 32 * u * u;
}

/* ───────────────────────────────────────────────────────────────
 * 관측 ΔT (USNO ser7).  ★ Espenak&Meeus 다항식은 2005~2050 구간에서
 *   실측을 최대 11초 과대평가한다(v4-diag.js 실측). 절기 시각이 그만큼
 *   빨라져 KASI 분 단위 공표값과 어긋난다. → 관측표를 1순위로 쓴다.
 * ─────────────────────────────────────────────────────────────── */
const OBS = require('./deltat-obs.js');          // [[십진연도, ΔT초], ...] 1657.0~2033.75
const OBS_MIN = OBS[0][0], OBS_MAX = OBS[OBS.length - 1][0];

function deltaTObserved(y) {
  if (y <= OBS_MIN) return OBS[0][1];
  if (y >= OBS_MAX) return OBS[OBS.length - 1][1];
  let lo = 0, hi = OBS.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (OBS[m][0] <= y) lo = m; else hi = m; }
  const [y0, v0] = OBS[lo], [y1, v1] = OBS[hi];
  return v0 + (v1 - v0) * (y - y0) / (y1 - y0);
}

/** 하이브리드 ΔT.  [1657, 2033.75] = USNO 관측/예측, 밖 = E&M(경계 연속성 보정) */
function deltaTHybrid(y) {
  if (y >= OBS_MIN && y <= OBS_MAX) return deltaTObserved(y);
  if (y < OBS_MIN) {
    const bias = deltaTSeconds(OBS_MIN) - OBS[0][1];
    return deltaTSeconds(y) - bias;
  }
  const bias = deltaTSeconds(OBS_MAX) - OBS[OBS.length - 1][1];
  return deltaTSeconds(y) - bias;
}

let MODE = 'hybrid';                            // 'hybrid' | 'em'
function setDeltaTMode(m) { MODE = m; }
function getDeltaTMode() { return MODE; }

/** JD(UT) → ΔT(초) */
function deltaTFromJD(jdUT) {
  const y = 2000 + (jdUT - 2451545.0) / 365.25;
  return MODE === 'em' ? deltaTSeconds(y) : deltaTHybrid(y);
}

module.exports = { deltaTSeconds, deltaTObserved, deltaTHybrid, deltaTFromJD,
                   setDeltaTMode, getDeltaTMode, OBS_MIN, OBS_MAX };
