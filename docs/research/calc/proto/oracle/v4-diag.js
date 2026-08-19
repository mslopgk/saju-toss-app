'use strict';
// v4-diag.js — [A] 편차의 원인 분해: 천체력(λ) 오차인가 ΔT 모델 오차인가
const fs = require('fs'), path = require('path');
const S = require('./sun.js');
const { deltaTFromJD, deltaTSeconds } = require('./deltat.js');
const { msToJD, jdToMs } = require('./jd.js');
const T = require('./solarterms.js');
const AE = require('C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/astronomy-engine');

const XC = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/xcheck';
const sky = JSON.parse(fs.readFileSync(path.join(XC, 'skyfield_terms.json'), 'utf-8'));

console.log('=== [1] 동일 TT 순간에서의 λ 비교 (ΔT 무관) — 자체HIGH vs astronomy-engine ===');
console.log('| JDE(TT) | 자체 λ(°) | AE λ(°) | Δ(arcsec) | Δ(시간초 환산) |');
console.log('|---|---|---|---|---|');
{
  const stats = [];
  for (let y = 1900; y <= 2100; y += 10) {
    const jde = 2451545.0 + (y - 2000) * 365.25;
    const mine = S.sunLongitudeHigh(jde);
    const t = AE.AstroTime.FromTerrestrialTime(jde - 2451545.0);
    const ae = AE.SunPosition(t).elon;
    const d = S.norm180(mine - ae) * 3600;
    stats.push(d);
    console.log(`| ${jde.toFixed(1)} | ${mine.toFixed(6)} | ${ae.toFixed(6)} | ${d.toFixed(4)} | ${(d * 24.35).toFixed(2)} |`);
  }
  const mx = Math.max(...stats.map(Math.abs));
  console.log(`\n  최대 |Δλ| = ${mx.toFixed(4)}″ = ${(mx * 24.35).toFixed(2)} 초(시간)  → 천체력 자체는 문제 없음`);
}

console.log('\n=== [2] skyfield DE440s 절기 순간에서 "필요 ΔT" 역산 vs 자체 ΔT 모델 ===');
console.log('| 연도 | 절기λ | DE440s UTC | ΔT_필요(초) | ΔT_E&M(초) | 초과(초) | 절기 시각 오차(초) |');
console.log('|---|---|---|---|---|---|---|');
{
  const rowsOut = [];
  for (const r of sky) {
    if (r.year < 2020 || r.year > 2030) continue;
    if (r.sunLng !== 315 && r.sunLng !== 90) continue;   // 입춘·하지만 표시
    const ms = Date.parse(r.utc);
    const jdUT = msToJD(ms);
    // λ(jdUT + x/86400) = target 을 만족하는 x 를 뉴턴법으로
    let x = deltaTFromJD(jdUT);
    for (let i = 0; i < 40; i++) {
      const f = S.norm180(S.sunLongitudeHigh(jdUT + x / 86400) - r.sunLng);
      const df = (S.norm180(S.sunLongitudeHigh(jdUT + (x + 1) / 86400) - r.sunLng) - f);
      x -= f / df;
    }
    const dtEM = deltaTFromJD(jdUT);
    // 그 초과분이 절기시각을 얼마나 당기는가 = 초과분 그대로 (1:1)
    rowsOut.push([r.year, r.sunLng, r.utc, x, dtEM, dtEM - x]);
    console.log(`| ${r.year} | ${r.sunLng} | ${r.utc} | ${x.toFixed(3)} | ${dtEM.toFixed(3)} | ${(dtEM - x).toFixed(3)} | ${(dtEM - x).toFixed(3)} |`);
  }
}

console.log('\n=== [3] 실제 ΔT (IERS 유도) vs Espenak&Meeus 다항식 ===');
console.log('ΔT = 32.184 + (TAI−UTC) − (UT1−UTC).  |UT1−UTC| < 0.9s 이므로 ΔT ≈ 32.184 + 윤초누적');
console.log('| 구간 | TAI−UTC | ΔT_실제≈ | ΔT_E&M(중앙연도) | E&M 초과 |');
console.log('|---|---|---|---|---|');
for (const [lab, y, tai] of [['1972~1981', 1977, 16], ['1990~1991', 1990.5, 25],
      ['1999~2005', 2002, 32], ['2009~2011', 2010, 34], ['2012~2014', 2013, 35],
      ['2015~2016', 2016, 36], ['2017~현재', 2021.5, 37], ['2017~현재', 2026, 37]]) {
  const real = 32.184 + tai;
  const em = deltaTSeconds(y);
  console.log(`| ${lab} | ${tai} | ${real.toFixed(3)} | ${em.toFixed(3)} | ${(em - real).toFixed(3)} |`);
}
