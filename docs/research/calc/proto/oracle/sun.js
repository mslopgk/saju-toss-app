'use strict';
// sun.js — 태양 겉보기 황경 2종 (Meeus Ch.25) + 장동(Ch.22) + 황도경사(Ch.22) + 균시차(Ch.28)
// LOW  : Meeus 25.2~25.5 저정밀식 (3항 중심차). 이론오차 ~0.01°
// HIGH : VSOP87D(Earth) 전항 + FK5 보정 + 장동 Δψ + 광행차 −20.4898″/R. 이론오차 ~0.001″
const D = require('./vsop87-earth.js');

const DEG = Math.PI / 180;
const mod360 = x => ((x % 360) + 360) % 360;
const norm180 = x => { const v = mod360(x); return v > 180 ? v - 360 : v; };
const sind = d => Math.sin(d * DEG), cosd = d => Math.cos(d * DEG), tand = d => Math.tan(d * DEG);

/* ---------- Meeus Ch.25 저정밀 ---------- */
function sunLongitudeLow(jde) {
  const T = (jde - 2451545.0) / 36525.0;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M  = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const C  = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M)
           + (0.019993 - 0.000101 * T) * sind(2 * M)
           +  0.000289 * sind(3 * M);
  const Om = 125.04 - 1934.136 * T;
  return mod360(L0 + C - 0.00569 - 0.00478 * sind(Om));
}

/* ---------- VSOP87D (Earth) ---------- */
function vsopSum(series, tau) {
  let total = 0, p = 1;
  for (let i = 0; i < series.length; i++) {
    let s = 0;
    const arr = series[i];
    for (let j = 0; j < arr.length; j++) s += arr[j][0] * Math.cos(arr[j][1] + arr[j][2] * tau);
    total += s * p; p *= tau;
  }
  return total * 1e-8;              // rad (L,B) / AU (R)
}
/** 지구 일심 황경/황위/동경 (VSOP87D, 날짜의 평균황도·평균분점) */
function earthHelio(jde) {
  const tau = (jde - 2451545.0) / 365250.0;
  return {
    L: mod360(vsopSum(D.L, tau) / DEG),
    B: vsopSum(D.B, tau) / DEG,
    R: vsopSum(D.R, tau),
  };
}

/* ---------- 장동 (Meeus Ch.22, IAU1980 63항) ---------- */
function nutation(jde) {
  const T = (jde - 2451545.0) / 36525.0;
  const d  = 297.85036 + T * (445267.111480 + T * (-0.0019142 + T / 189474.0));
  const m  = 357.52772 + T * (35999.050340 + T * (-0.0001603 - T / 300000.0));
  const mp = 134.96298 + T * (477198.867398 + T * (0.0086972 + T / 56250.0));
  const f  =  93.27191 + T * (483202.017538 + T * (-0.0036825 + T / 327270.0));
  const om = 125.04452 + T * (-1934.136261 + T * (0.0020708 + T / 450000.0));
  const args = [d, m, mp, f, om];
  let dpsi = 0, deps = 0;
  for (let i = 0; i < D.nutArg.length; i++) {
    let a = 0;
    for (let j = 0; j < 5; j++) if (D.nutArg[i][j]) a += D.nutArg[i][j] * args[j];
    const ar = a * DEG;
    const s = D.nutSin[i];
    dpsi += (s[0] + (s[1] ? s[1] * T : 0)) * Math.sin(ar);
    if (i < D.nutCos.length) {
      const c = D.nutCos[i];
      deps += (c[0] + (c[1] ? c[1] * T : 0)) * Math.cos(ar);
    }
  }
  return { dpsiArcsec: dpsi / 10000.0, depsArcsec: deps / 10000.0 };   // 각초
}

/** 평균 황도경사 (Meeus 22.3, Laskar). 반환 도(deg) */
function meanObliquity(jde) {
  const U = (jde - 2451545.0) / 3652500.0;   // 만년 단위
  const c = [23.43929111 * 3600, -4680.93, -1.55, 1999.25, -51.38, -249.67,
             -39.05, 7.12, 27.87, 5.79, 2.45];
  let e = c[0], p = 1;
  for (let i = 1; i < c.length; i++) { p *= U; e += c[i] * p; }
  return e / 3600.0;
}

/* ---------- 태양 겉보기 황경 (고정밀) ---------- */
function sunGeometric(jde) {
  const e = earthHelio(jde);
  const T = (jde - 2451545.0) / 36525.0;
  const theta = mod360(e.L + 180);           // 태양 기하황경 (평균분점 of date)
  const beta = -e.B;
  // FK5 보정 (Meeus 25.9)
  const lp = theta - 1.397 * T - 0.00031 * T * T;
  const dLam = -0.09033 / 3600.0;
  const dBet = 0.03916 * (cosd(lp) - sind(lp)) / 3600.0;
  return { theta: mod360(theta + dLam), beta: beta + dBet, R: e.R };
}

function sunLongitudeHigh(jde) {
  const g = sunGeometric(jde);
  const nut = nutation(jde);
  const aber = -20.4898 / g.R / 3600.0;      // 도
  return mod360(g.theta + nut.dpsiArcsec / 3600.0 + aber);
}

/** 태양 겉보기 적경/적위 (도). 겉보기 황도좌표 → 진황도경사 */
function sunApparentEquatorial(jde) {
  const g = sunGeometric(jde);
  const nut = nutation(jde);
  const lam = mod360(g.theta + nut.dpsiArcsec / 3600.0 - 20.4898 / g.R / 3600.0);
  const bet = g.beta;
  const eps = meanObliquity(jde) + nut.depsArcsec / 3600.0;
  const ra = Math.atan2(sind(lam) * cosd(eps) - tand(bet) * sind(eps), cosd(lam)) / DEG;
  const dec = Math.asin(sind(bet) * cosd(eps) + cosd(bet) * sind(eps) * sind(lam)) / DEG;
  return { ra: mod360(ra), dec, lam, eps, R: g.R };
}

/** 균시차 (Meeus 28.3). 반환 분(minute). E = L0 − 0.0057183° − α + Δψ·cos ε */
function equationOfTimeHigh(jde) {
  const tau = (jde - 2451545.0) / 365250.0;
  // 태양 평균황경 L0 (Meeus 28.2, 도)
  const L0 = mod360(280.4664567 + 360007.6982779 * tau + 0.03032028 * tau ** 2
            + tau ** 3 / 49931 - tau ** 4 / 15300 - tau ** 5 / 2000000);
  const eq = sunApparentEquatorial(jde);
  const nut = nutation(jde);
  let E = L0 - 0.0057183 - eq.ra + (nut.dpsiArcsec / 3600.0) * cosd(eq.eps);
  E = norm180(E);
  return E * 4;    // 도 → 분
}

/** NOAA solcalc calcEquationOfTime 이식 (C15 E-1, 비교용). 반환 분 */
function equationOfTimeNOAA(jde) {
  const T = (jde - 2451545.0) / 36525.0;
  const epsm = 23 + (26 + ((21.448 - T * (46.815 + T * (0.00059 - T * 0.001813)))) / 60) / 60;
  const om = 125.04 - 1934.136 * T;
  const eps = epsm + 0.00256 * cosd(om);
  const l0 = mod360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const e  = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const m  = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const y  = tand(eps / 2) ** 2;
  const Etime = y * sind(2 * l0) - 2 * e * sind(m) + 4 * e * y * sind(m) * cosd(2 * l0)
              - 0.5 * y * y * sind(4 * l0) - 1.25 * e * e * sind(2 * m);
  return (Etime / DEG) * 4;
}

module.exports = {
  DEG, mod360, norm180, sind, cosd, tand,
  sunLongitudeLow, sunLongitudeHigh, sunGeometric, sunApparentEquatorial,
  earthHelio, nutation, meanObliquity, equationOfTimeHigh, equationOfTimeNOAA,
};
