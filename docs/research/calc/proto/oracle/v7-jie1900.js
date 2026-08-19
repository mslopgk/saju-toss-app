'use strict';
// v7-jie1900.js — 12節 1900~2100 (2412건) 자체 계산 → manseryeok 전수 대조 + 테이블 생성
const fs = require('fs');
const ST = require('./solarterms.js');
const NM = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/';
const M = require(NM + 'manseryeok');

const JIE = ST.TERMS.filter(t => t.jie);                 // 12절
const IDX = ST.TERMS.map(t => t.lng);                    // manseryeok index → λ
const Y0 = 1900, Y1 = 2100;

console.time('# 자체 12절 2412건');
const tbl = [];
for (let y = Y0; y <= Y1; y++) for (const t of JIE) {
  const r = ST.solarTerm(y, t.lng, true);
  tbl.push({ y, lng: t.lng, kor: t.kor, ms: r.utcMs, kst: r.kst });
}
console.timeEnd('# 자체 12절 2412건');
console.log('n =', tbl.length);

// manseryeok 전수
const mans = new Map();
for (let y = Y0; y <= Y1; y++) {
  for (let i = 0; i < 24; i++) {
    try { const d = M.getSolarTerm(y, i); const t = d && (d.date ? d.date.getTime() : d.getTime());
          if (t) mans.set(`${y}:${IDX[i]}`, t); }
    catch (e) { /* 범위 밖 */ }
  }
}
console.log('manseryeok 레코드 =', mans.size);

let n = 0, eq = 0, miss = 0; const diffs = []; const big = [];
for (const r of tbl) {
  const k = `${r.y}:${r.lng}`;
  if (!mans.has(k)) { miss++; continue; }
  n++;
  const d = (mans.get(k) - r.ms) / 1000;
  diffs.push(d);
  if (Math.round(mans.get(k) / 60000) === Math.round(r.ms / 60000)) eq++;
  if (Math.abs(d) > 45) big.push([r, mans.get(k), d]);
}
diffs.sort((a, b) => a - b);
const mean = diffs.reduce((s, v) => s + v, 0) / diffs.length;
const rms = Math.sqrt(diffs.reduce((s, v) => s + v * v, 0) / diffs.length);
console.log(`\n## 12節 1900~2100 자체 vs manseryeok`);
console.log(`   대조 n=${n} (결측 ${miss})`);
console.log(`   편차(초) mean=${mean.toFixed(3)} med=${diffs[Math.floor(diffs.length/2)].toFixed(3)} rms=${rms.toFixed(3)} min=${diffs[0].toFixed(1)} max=${diffs[diffs.length-1].toFixed(1)}`);
console.log(`   분 단위 일치 = ${eq}/${n} = ${(eq/n*100).toFixed(2)}%`);
console.log(`   |편차| > 45초 = ${big.length}건`);

// 10년 구간별
console.log('\n| 구간 | n | 분일치% | mean(초) | min | max |');
console.log('|---|---|---|---|---|---|');
for (let d0 = Y0; d0 <= Y1; d0 += 20) {
  const sub = tbl.filter(r => r.y >= d0 && r.y < d0 + 20 && mans.has(`${r.y}:${r.lng}`));
  if (!sub.length) continue;
  const ds = sub.map(r => (mans.get(`${r.y}:${r.lng}`) - r.ms) / 1000);
  const e = sub.filter(r => Math.round(mans.get(`${r.y}:${r.lng}`) / 60000) === Math.round(r.ms / 60000)).length;
  console.log(`| ${d0}~${Math.min(d0+19,Y1)} | ${sub.length} | ${(e/sub.length*100).toFixed(1)} | ${(ds.reduce((s,v)=>s+v,0)/ds.length).toFixed(2)} | ${Math.min(...ds).toFixed(1)} | ${Math.max(...ds).toFixed(1)} |`);
}

if (big.length) {
  console.log('\n## |편차| > 45초 전량');
  console.log('| 연도 | 절 | 자체(KST) | manseryeok(KST) | Δ초 |');
  console.log('|---|---|---|---|---|');
  for (const [r, mms, d] of big.slice(0, 60))
    console.log(`| ${r.y} | ${r.kor} | ${r.kst} | ${ST.fmtKST(mms)} | ${d.toFixed(1)} |`);
  if (big.length > 60) console.log(`... 외 ${big.length - 60}건 (v7-jie-full.json 참조)`);
}

fs.writeFileSync('jie-1900-2100.json', JSON.stringify(tbl.map(r => ({ y: r.y, lng: r.lng, kst: r.kst, ms: r.ms })), null, 0));
fs.writeFileSync('v7-jie-full.json', JSON.stringify(big.map(([r, m, d]) => ({ y: r.y, kor: r.kor, self: r.kst, mans: ST.fmtKST(m), d })), null, 1));
console.log('\n# jie-1900-2100.json / v7-jie-full.json 기록');
