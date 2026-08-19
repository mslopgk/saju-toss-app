'use strict';
// v8-kasi-full.js — KASI 골든셋 전량(2004~2026, 결함 제외 526건) 대조 + 1분해상도 연주/월주 스캔
const fs = require('fs');
const ST = require('./solarterms.js');
const { jdnNoon } = require('./jd.js');
const P = require('./pillars.js');
const dt = require('./deltat.js');
const NM = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/';
const M = require(NM + 'manseryeok');
const G = JSON.parse(fs.readFileSync('C:/Users/user/orca/projects/saju-toss-app/docs/research/calc/golden-solarterms.json', 'utf-8'));

console.log('====== [1] KASI 골든셋 전량 대조 (2004~2026) ======');
{
  let n = 0, defect = 0, eqSelf = 0, eqMans = 0; const ds = []; const bad = [];
  for (const r of G.terms) {
    if (r.defect) { defect++; continue; }
    const kms = Date.parse(r.kasi_kst.replace(' ', 'T') + ':00+09:00');
    const self = ST.solarTerm(r.year, r.sunLng, true);
    // KST 연도가 다른 레코드(연말/연초)는 그대로 두되 검증
    if (self.kst.slice(0, 4) !== String(r.year)) { bad.push(['YEAR-MISMATCH', r.year, r.name, self.kst]); continue; }
    n++;
    ds.push((self.utcMs - kms) / 1000);
    if (Math.round(self.utcMs / 60000) * 60000 === kms) eqSelf++;
    const mm = Date.parse(r.manseryeok_kst.replace(' ', 'T') + ':00+09:00');
    if (mm === kms) eqMans++;
  }
  ds.sort((a, b) => a - b);
  console.log(`  결함 제외 = ${defect},  대조 n = ${n}`);
  console.log(`  자체−KASI(초) mean=${(ds.reduce((s,v)=>s+v,0)/ds.length).toFixed(3)} med=${ds[ds.length>>1].toFixed(3)} min=${ds[0].toFixed(1)} max=${ds[ds.length-1].toFixed(1)}`);
  console.log(`  round(자체,분)==KASI : ${eqSelf}/${n} = ${(eqSelf/n*100).toFixed(2)}%`);
  console.log(`  manseryeok==KASI    : ${eqMans}/${n} = ${(eqMans/n*100).toFixed(2)}%   (C14 실측 재현)`);
  if (bad.length) console.log('  이상:', JSON.stringify(bad));
  // 연도별
  console.log('\n  | 연도 | n | 자체 분일치 | manseryeok 분일치 | 자체−KASI 평균(초) |');
  console.log('  |---|---|---|---|---|');
  for (let y = 2004; y <= 2026; y++) {
    const sub = G.terms.filter(r => r.year === y && !r.defect);
    if (!sub.length) { console.log(`  | ${y} | 0 | — | — | — |`); continue; }
    let a = 0, b = 0; const dd = [];
    for (const r of sub) {
      const kms = Date.parse(r.kasi_kst.replace(' ', 'T') + ':00+09:00');
      const self = ST.solarTerm(r.year, r.sunLng, true);
      dd.push((self.utcMs - kms) / 1000);
      if (Math.round(self.utcMs / 60000) * 60000 === kms) a++;
      if (Date.parse(r.manseryeok_kst.replace(' ', 'T') + ':00+09:00') === kms) b++;
    }
    console.log(`  | ${y} | ${sub.length} | ${a}/${sub.length} | ${b}/${sub.length} | ${(dd.reduce((s,v)=>s+v,0)/dd.length).toFixed(2)} |`);
  }
}

console.log('\n====== [2] ΔT 모델 교체 전후 (동일 코드, MODE 만 변경) ======');
{
  console.log('| 절기 | ΔT=E&M | ΔT=USNO관측 | 차(초) | KASI |');
  console.log('|---|---|---|---|---|');
  for (const [y, lng, nm] of [[2004,315,'입춘'],[2010,315,'입춘'],[2015,315,'입춘'],
                              [2020,315,'입춘'],[2024,315,'입춘'],[2025,315,'입춘'],[2026,315,'입춘']]) {
    dt.setDeltaTMode('em');  const a = ST.solarTerm(y, lng, true);
    dt.setDeltaTMode('hybrid'); const b = ST.solarTerm(y, lng, true);
    const k = G.terms.find(r => r.year === y && r.sunLng === lng && !r.defect);
    console.log(`| ${y} ${nm} | ${a.kst} | ${b.kst} | ${((b.utcMs-a.utcMs)/1000).toFixed(1)} | ${k ? k.kasi_kst : '-'} |`);
  }
  dt.setDeltaTMode('hybrid');
}

console.log('\n====== [3] 2024년 1분 해상도 전수 스캔 — 연주+월주 (자체 vs manseryeok) ======');
{
  // 자체: 12절 테이블 사전계산 후 O(log n) 판정
  const jieMs = [];   // {ms, monthOrder}
  for (let y = 2023; y <= 2025; y++) {
    for (const t of ST.TERMS) if (t.jie) jieMs.push({ ms: ST.solarTerm(y, t.lng, true).utcMs, mo: t.monthOrder, lng: t.lng, y });
  }
  jieMs.sort((a, b) => a.ms - b.ms);
  const ipchun = {};
  for (let y = 2023; y <= 2025; y++) ipchun[y] = ST.solarTerm(y, 315, true).utcMs;

  const selfYM = utcMs => {
    let lo = 0, hi = jieMs.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (jieMs[m].ms <= utcMs) { k = m; lo = m + 1; } else hi = m - 1; }
    const mo = jieMs[k].mo;
    const cy = new Date(utcMs + 9 * 3600e3).getUTCFullYear();
    const iy = utcMs < ipchun[cy] ? cy - 1 : cy;
    const yg = ((iy - 4) % 10 + 10) % 10, yz = ((iy - 4) % 12 + 12) % 12;
    const mg = (P.OHODUN(yg) + mo) % 10, mz = (mo + 2) % 12;
    return P.gz(yg, yz) + ' ' + P.gz(mg, mz);
  };

  const S = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const B = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const KS = ['갑','을','병','정','무','기','경','신','임','계'];
  const KB = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
  const h = s => S[KS.indexOf(s[0])] + B[KB.indexOf(s[1])];

  let n = 0, diff = 0; const samples = [];
  const t0 = Date.UTC(2024, 0, 1, 0, 0) - 9 * 3600e3;      // 2024-01-01 00:00 KST
  const t1 = Date.UTC(2025, 0, 1, 0, 0) - 9 * 3600e3;
  for (let t = t0; t < t1; t += 60000) {
    const d = new Date(t + 9 * 3600e3);
    const a = selfYM(t);
    const r = M.calculateFourPillars({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
                                       hour: d.getUTCHours(), minute: d.getUTCMinutes() });
    const b = h(r.yearString) + ' ' + h(r.monthString);
    n++;
    if (a !== b) { diff++; if (samples.length < 20) samples.push([d.toISOString().slice(0,16).replace('T',' '), a, b]); }
  }
  console.log(`  표본 n = ${n} 분`);
  console.log(`  자체 vs manseryeok 연주+월주 불일치 = ${diff} (${(diff/n*100).toFixed(4)}%)`);
  if (samples.length) { console.log('  불일치 구간 샘플 (KST):'); for (const s of samples) console.log('   ', s.join('  |  ')); }
}
