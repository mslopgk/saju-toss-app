'use strict';
// jd.js — 그레고리력 ↔ 율리우스일 (Meeus, Astronomical Algorithms 2nd ed., Ch.7)
// 의존성 없음.

/** Meeus (7.1). D는 소수 포함 일. gregorian=false 이면 율리우스력. */
function calendarToJD(Y, M, D, gregorian) {
  if (gregorian === undefined) {
    // 1582-10-15 이후 = 그레고리력
    gregorian = (Y > 1582) || (Y === 1582 && (M > 10 || (M === 10 && D >= 15)));
  }
  let y = Y, m = M;
  if (m <= 2) { y -= 1; m += 12; }
  let B = 0;
  if (gregorian) {
    const A = Math.floor(y / 100);
    B = 2 - A + Math.floor(A / 4);
  }
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + D + B - 1524.5;
}

/** Meeus Ch.7 역변환. 반환 day 는 소수 포함. */
function jdToCalendar(jd) {
  const x = jd + 0.5;
  const Z = Math.floor(x), F = x - Z;
  let A;
  if (Z < 2299161) { A = Z; }
  else {
    const alpha = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);
  const day = B - D - Math.floor(30.6001 * E) + F;
  const month = (E < 14) ? E - 1 : E - 13;
  const year = (month > 2) ? C - 4716 : C - 4715;
  return { year, month, day };
}

/** 소수일 → {y,m,d,hh,mi,ss(소수)} */
function jdToParts(jd) {
  const c = jdToCalendar(jd);
  const d = Math.floor(c.day);
  let rest = (c.day - d) * 24;
  const hh = Math.floor(rest); rest = (rest - hh) * 60;
  const mi = Math.floor(rest); const ss = (rest - mi) * 60;
  return { y: c.year, m: c.month, d, hh, mi, ss };
}

/**
 * 달력 전환 자동 판정 JDN. 1582-10-15 미만은 **율리우스력**으로 해석한다.
 * ⚠️ 1582-10-15 이전 날짜에서 `jdnNoon`(그레고리 전용)과 최대 10일(14세기 8일) 어긋난다.
 *   → 일주가 60갑자에서 그만큼 이동. manseryeok / 전통 만세력은 율리우스 해석을 쓴다.
 */
function jdnNoonAuto(y, m, d) {
  return Math.floor(calendarToJD(y, m, d) + 0.5);
}

/** Fliegel–Van Flandern 정수 JDN (그날 정오의 JD). 그레고리력 전용(proleptic). */
function jdnNoon(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy
         + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

/** Unix ms(UTC) ↔ JD(UT). 1970-01-01T00:00Z = JD 2440587.5 */
const JD_UNIX_EPOCH = 2440587.5;
const msToJD = ms => ms / 86400000 + JD_UNIX_EPOCH;
const jdToMs = jd => (jd - JD_UNIX_EPOCH) * 86400000;

module.exports = { calendarToJD, jdToCalendar, jdToParts, jdnNoon, jdnNoonAuto, msToJD, jdToMs, JD_UNIX_EPOCH };
