'use strict';
// solarterms.js — 24절기 절입시각 역산 (이분법). ΔT 보정 포함. 출력 = UTC ms / KST 문자열
const { calendarToJD, jdToParts, jdToMs, msToJD } = require('./jd.js');
const { deltaTFromJD } = require('./deltat.js');
const S = require('./sun.js');

/** 24절기 정의 — 태양황경 순. jieqi=true 가 節(월 경계), false 가 中氣 */
const TERMS = [
  { lng: 285, hanja: '小寒', kor: '소한', jie: true,  monthOrder: 11, zhi: 1 },
  { lng: 300, hanja: '大寒', kor: '대한', jie: false, monthOrder: null, zhi: null },
  { lng: 315, hanja: '立春', kor: '입춘', jie: true,  monthOrder: 0,  zhi: 2 },
  { lng: 330, hanja: '雨水', kor: '우수', jie: false, monthOrder: null, zhi: null },
  { lng: 345, hanja: '驚蟄', kor: '경칩', jie: true,  monthOrder: 1,  zhi: 3 },
  { lng: 0,   hanja: '春分', kor: '춘분', jie: false, monthOrder: null, zhi: null },
  { lng: 15,  hanja: '淸明', kor: '청명', jie: true,  monthOrder: 2,  zhi: 4 },
  { lng: 30,  hanja: '穀雨', kor: '곡우', jie: false, monthOrder: null, zhi: null },
  { lng: 45,  hanja: '立夏', kor: '입하', jie: true,  monthOrder: 3,  zhi: 5 },
  { lng: 60,  hanja: '小滿', kor: '소만', jie: false, monthOrder: null, zhi: null },
  { lng: 75,  hanja: '芒種', kor: '망종', jie: true,  monthOrder: 4,  zhi: 6 },
  { lng: 90,  hanja: '夏至', kor: '하지', jie: false, monthOrder: null, zhi: null },
  { lng: 105, hanja: '小暑', kor: '소서', jie: true,  monthOrder: 5,  zhi: 7 },
  { lng: 120, hanja: '大暑', kor: '대서', jie: false, monthOrder: null, zhi: null },
  { lng: 135, hanja: '立秋', kor: '입추', jie: true,  monthOrder: 6,  zhi: 8 },
  { lng: 150, hanja: '處暑', kor: '처서', jie: false, monthOrder: null, zhi: null },
  { lng: 165, hanja: '白露', kor: '백로', jie: true,  monthOrder: 7,  zhi: 9 },
  { lng: 180, hanja: '秋分', kor: '추분', jie: false, monthOrder: null, zhi: null },
  { lng: 195, hanja: '寒露', kor: '한로', jie: true,  monthOrder: 8,  zhi: 10 },
  { lng: 210, hanja: '霜降', kor: '상강', jie: false, monthOrder: null, zhi: null },
  { lng: 225, hanja: '立冬', kor: '입동', jie: true,  monthOrder: 9,  zhi: 11 },
  { lng: 240, hanja: '小雪', kor: '소설', jie: false, monthOrder: null, zhi: null },
  { lng: 255, hanja: '大雪', kor: '대설', jie: true,  monthOrder: 10, zhi: 0 },
  { lng: 270, hanja: '冬至', kor: '동지', jie: false, monthOrder: null, zhi: null },
];

const MEAN_RATE = 0.98564736;              // °/day

/** JD(UT) → 겉보기 태양황경. ΔT 를 내부에서 더해 TT 로 변환 */
function lonAtUT(jdUT, precise) {
  const jde = jdUT + deltaTFromJD(jdUT) / 86400;
  return precise ? S.sunLongitudeHigh(jde) : S.sunLongitudeLow(jde);
}

/**
 * 이분법. g(jd) = norm180(λ(jd) − target). 구간 [lo,hi] 에서 부호변화 1회 보장 필요.
 * 60회 반복 = 구간폭/2^60 → 10일 구간이면 8.7e-18일 (기계정밀도 한계)
 */
function bisect(target, lo, hi, precise, maxIter) {
  const g = t => S.norm180(lonAtUT(t, precise) - target);
  let flo = g(lo), fhi = g(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) throw new Error(`bracket fail target=${target} lo=${lo}(${flo.toFixed(4)}) hi=${hi}(${fhi.toFixed(4)})`);
  const N = maxIter || 60;
  for (let i = 0; i < N; i++) {
    const mid = (lo + hi) / 2, fm = g(mid);
    if (fm === 0) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/**
 * (그레고리 연도 y, 태양황경 target) → 절입 JD(UT).
 * 초기추정: 해당 연도 춘분(λ=0) 시각을 기준으로 평균이동률 선형 외삽.
 * 285~345 는 춘분보다 앞이므로 음의 오프셋이 나온다 → 자동으로 같은 해 1~3월.
 */
function termJD_UT(y, target, precise) {
  const equinoxGuess = calendarToJD(y, 3, 20.5);
  const off = (target >= 285 ? target - 360 : target) / MEAN_RATE;
  let guess = equinoxGuess + off;
  // ★ 1차 선형 외삽은 J2000 근방에서만 ±3일이다. 세차 때문에 1391년에는 3월 춘분이
  //   3월 11일경이라 ±6일 bracket 이 깨진다(실측: 1391 立春 bracket fail).
  //   → Meeus Ch.27 고정점 반복으로 guess 를 먼저 수렴시킨 뒤 좁은 bracket 을 씌운다.
  for (let i = 0; i < 5; i++) {
    const lam = lonAtUT(guess, precise !== false);
    const corr = 58.0 * Math.sin(S.norm180(target - lam) * Math.PI / 180);
    guess += corr;
    if (Math.abs(corr) < 1e-6) break;
  }
  return bisect(target, guess - 2, guess + 2, precise !== false);
}

const KST_MS = 9 * 3600 * 1000;
function fmtKST(utcMs) {
  const d = new Date(utcMs + KST_MS);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} `
       + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** (y, target) → { utcMs, kst, jdUT } */
function solarTerm(y, target, precise) {
  const jdUT = termJD_UT(y, target, precise);
  const utcMs = jdToMs(jdUT);
  return { jdUT, utcMs, kst: fmtKST(utcMs) };
}

/** 해당 연도의 24절기 전부 (KST 연도 기준으로 필터링) */
function yearTerms(y, precise) {
  return TERMS.map(t => {
    const r = solarTerm(y, t.lng, precise);
    return Object.assign({ year: y }, t, r);
  });
}

/**
 * 임의 UTC 순간이 속한 月支/monthOrder 를 결정하는 12절 경계.
 * 반환: { monthOrder(0=寅..11=丑), zhi, prevJie:{utcMs,lng}, nextJie:{utcMs,lng} }
 */
function monthBoundary(utcMs) {
  const jdUT = msToJD(utcMs);
  const lon = lonAtUT(jdUT, true);
  const monthOrder = Math.floor(S.mod360(lon - 315) / 30);      // 0=寅
  const jieLng = (315 + monthOrder * 30) % 360;
  const nextLng = (jieLng + 30) % 360;
  // 해당 節의 연도 후보를 ±1 로 훑어 실제 경계를 찾는다
  const dref = new Date(utcMs + KST_MS);
  const yy = dref.getUTCFullYear();
  const pick = (lng, want) => {
    let best = null;
    for (const cy of [yy - 1, yy, yy + 1]) {
      const r = solarTerm(cy, lng, true);
      if (want === 'prev' && r.utcMs <= utcMs && (!best || r.utcMs > best.utcMs)) best = r;
      if (want === 'next' && r.utcMs >  utcMs && (!best || r.utcMs < best.utcMs)) best = r;
    }
    return best;
  };
  return {
    monthOrder, zhi: (monthOrder + 2) % 12,
    prevJie: Object.assign({ lng: jieLng }, pick(jieLng, 'prev')),
    nextJie: Object.assign({ lng: nextLng }, pick(nextLng, 'next')),
  };
}

module.exports = { TERMS, lonAtUT, bisect, termJD_UT, solarTerm, yearTerms, monthBoundary, fmtKST, KST_MS };
