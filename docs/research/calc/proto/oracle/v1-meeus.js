'use strict';
// v1-meeus.js — Meeus 원서 예제로 JD / 장동 / 황도경사 / 태양황경 구현을 1차 검증
const { calendarToJD, jdToParts, jdnNoon } = require('./jd.js');
const S = require('./sun.js');
const { deltaTSeconds } = require('./deltat.js');

const rows = [];
const chk = (name, got, exp, tol, unit) => {
  const d = got - exp;
  rows.push([name, String(exp), (typeof got === 'number' ? got.toFixed(8) : got),
             d.toExponential(2), Math.abs(d) <= tol ? 'PASS' : '**FAIL**', unit || '']);
};

console.log('=== [1] Meeus Ch.7 JD 변환 ===');
const jdcases = [
  ['1957-10-04.81 스푸트니크1호', 1957, 10, 4.81, 2436116.31],
  ['2000-01-01.5 J2000.0',       2000, 1, 1.5,  2451545.0],
  ['1987-01-27.0 ex.7.a',        1987, 1, 27.0, 2446822.5],
  ['1987-06-19.5 ex.7.b',        1987, 6, 19.5, 2446966.0],
  ['1988-01-27.0 ex.7.c',        1988, 1, 27.0, 2447187.5],
  ['1988-06-19.5',               1988, 6, 19.5, 2447332.0],
  ['1900-01-01.0',               1900, 1, 1.0,  2415020.5],
  ['1600-01-01.0',               1600, 1, 1.0,  2305447.5],
  ['1600-12-31.0',               1600, 12, 31.0, 2305812.5],
  ['837-04-10.3 (Julian)',        837, 4, 10.3, 2026871.8],
  ['-1000-07-12.5 (Julian)',    -1000, 7, 12.5, 1356001.0],
  ['-4712-01-01.5 (Julian)',    -4712, 1, 1.5,  0.0],
];
for (const [nm, y, m, d, exp] of jdcases) {
  const got = calendarToJD(y, m, d);
  console.log(`${nm.padEnd(30)} JD=${got.toFixed(2).padStart(12)}  expected=${String(exp).padStart(12)}  ${Math.abs(got-exp)<1e-6?'PASS':'**FAIL**'}`);
}
console.log('-- 역변환 --');
for (const [jd, exp] of [[2436116.31,'1957-10-04.81'],[2418781.5,'1910-04-20.0'],[1842713.0,'333-01-27.5']]) {
  const p = jdToParts(jd);
  console.log(`JD ${jd} -> ${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')} ${String(p.hh).padStart(2,'0')}:${String(p.mi).padStart(2,'0')}:${p.ss.toFixed(3)}   expected ${exp}`);
}
console.log('-- 왕복(1600-01-01 ~ 2200-12-31 전 일자) --');
{
  let bad = 0, n = 0;
  for (let jdn = jdnNoon(1600,1,1); jdn <= jdnNoon(2200,12,31); jdn++) {
    const p = jdToParts(jdn - 0.5);           // 자정
    const back = calendarToJD(p.y, p.m, p.d + (p.hh*3600+p.mi*60+p.ss)/86400);
    if (Math.abs(back - (jdn - 0.5)) > 1e-6) bad++;
    if (jdnNoon(p.y, p.m, p.d) !== jdn) bad++;
    n++;
  }
  console.log(`  n=${n}  불일치=${bad}`);
}

console.log('\n=== [2] Meeus ex.22.a 장동/황도경사 (1987-04-10.0 TD, JDE=2446895.5) ===');
{
  const jde = 2446895.5;
  const nut = S.nutation(jde);
  const e0 = S.meanObliquity(jde);
  const e0as = e0 * 3600, epsTrue = e0 + nut.depsArcsec / 3600;
  console.log(`  Δψ  = ${nut.dpsiArcsec.toFixed(4)}"   책값 -3.788"   ${Math.abs(nut.dpsiArcsec + 3.788) < 0.002 ? 'PASS' : '**FAIL**'}`);
  console.log(`  Δε  = ${nut.depsArcsec.toFixed(4)}"   책값 +9.443"   ${Math.abs(nut.depsArcsec - 9.443) < 0.002 ? 'PASS' : '**FAIL**'}`);
  console.log(`  ε0  = ${Math.floor(e0)}°${Math.floor((e0%1)*60)}'${(((e0*60)%1)*60).toFixed(3)}"   책값 23°26'27.407"`);
  console.log(`  ε   = ${Math.floor(epsTrue)}°${Math.floor((epsTrue%1)*60)}'${(((epsTrue*60)%1)*60).toFixed(3)}"   책값 23°26'36.850"`);
}

console.log('\n=== [3] Meeus ex.25.a 저정밀 태양 (1992-10-13.0 TD, JDE=2448908.5) ===');
{
  const jde = 2448908.5, T = (jde - 2451545) / 36525;
  const L0 = S.mod360(280.46646 + 36000.76983*T + 0.0003032*T*T);
  const M  = S.mod360(357.52911 + 35999.05029*T - 0.0001537*T*T);
  const lam = S.sunLongitudeLow(jde);
  console.log(`  T   = ${T.toFixed(12)}       책값 -0.072183436`);
  console.log(`  L0  = ${L0.toFixed(5)}°           책값 201.80720°`);
  console.log(`  M   = ${M.toFixed(5)}°           책값 278.99397°`);
  console.log(`  λapp= ${lam.toFixed(5)}°           책값 199.90895°   Δ=${((lam-199.90895)*3600).toFixed(2)}"`);
}

console.log('\n=== [4] Meeus ex.25.b 고정밀(VSOP87) 태양 (JDE=2448908.5) ===');
{
  const jde = 2448908.5;
  const e = S.earthHelio(jde);
  const g = S.sunGeometric(jde);
  const lamH = S.sunLongitudeHigh(jde);
  const eq = S.sunApparentEquatorial(jde);
  console.log(`  지구 L = ${e.L.toFixed(6)}°     책값 19.907372°   Δ=${((e.L-19.907372)*3600).toFixed(3)}"`);
  console.log(`  지구 B = ${e.B.toFixed(8)}°   책값 -0.000179°`);
  console.log(`  지구 R = ${e.R.toFixed(8)} AU  책값 0.99760775`);
  console.log(`  Θ(FK5) = ${g.theta.toFixed(6)}°   책값 199.907347°  Δ=${((g.theta-199.907347)*3600).toFixed(3)}"`);
  console.log(`  λapp   = ${lamH.toFixed(6)}°   책값 199.90988°    Δ=${((lamH-199.90988)*3600).toFixed(3)}"`);
  console.log(`  α app  = ${(eq.ra/15).toFixed(6)} h  책값 13h13m30.749s = ${(13+13/60+30.749/3600).toFixed(6)} h`);
  console.log(`  δ app  = ${eq.dec.toFixed(6)}°  책값 -7°47'01.74" = ${(-(7+47/60+1.74/3600)).toFixed(6)}°`);
  console.log(`  저정밀 − 고정밀 = ${((S.sunLongitudeLow(jde)-lamH)*3600).toFixed(2)}"  = ${((S.sunLongitudeLow(jde)-lamH)*3600/(360/365.2422*3600/86400)).toFixed(1)} 초(시간)`);
}

console.log('\n=== [5] ΔT (C02 §5.1 표 재현) ===');
for (const [y, mo, exp] of [[1900,1,-2.73],[1950,1,29.09],[1961,8,33.82],[1988,5,55.96],
                            [2024,1,73.90],[2024,12,74.44],[2025,2,74.54],[2026,2,75.15],
                            [2050,1,93.08],[2100,1,202.84]]) {
  const yy = y + (mo - 0.5) / 12;
  const got = deltaTSeconds(yy);
  console.log(`  ${y}-${String(mo).padStart(2,'0')}  ΔT=${got.toFixed(2)}초   C02기재=${exp}   ${Math.abs(got-exp)<0.02?'PASS':'**FAIL**'}`);
}

console.log('\n=== [6] Meeus ex.28.b 균시차 (1992-10-13.0 TD) ===');
{
  const jde = 2448908.5;
  console.log(`  E(high, Meeus 28.3) = ${S.equationOfTimeHigh(jde).toFixed(5)} 분   책값 13m42.6s = ${(13+42.6/60).toFixed(5)} 분`);
  console.log(`  E(NOAA_MEEUS)       = ${S.equationOfTimeNOAA(jde).toFixed(5)} 분`);
  console.log(`  차이                = ${((S.equationOfTimeHigh(jde)-S.equationOfTimeNOAA(jde))*60).toFixed(2)} 초`);
}
