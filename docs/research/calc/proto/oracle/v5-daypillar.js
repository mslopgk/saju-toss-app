'use strict';
// v5-daypillar.js — 일주 1900-01-01 ~ 2100-12-31 전수 대조 (자체 vs manseryeok)
// 입력은 12:00 KST 고정, 진태양시 보정 OFF(mode=CIVIL) → 순수 JDN 규칙만 비교
const fs = require('fs');
const P = require('./pillars.js');
const { jdnNoon } = require('./jd.js');
const M = require('C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/manseryeok');

const S = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const B = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const KS = ['갑','을','병','정','무','기','경','신','임','계'];
const KB = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const h = s => S[KS.indexOf(s[0])] + B[KB.indexOf(s[1])];

const selfDay = (y, mo, d) => {
  const i = ((jdnNoon(y, mo, d) - 11) % 60 + 60) % 60;
  return S[i % 10] + B[i % 12];
};

let n = 0, bad = 0; const badList = [];
const dist = new Array(60).fill(0);
console.time('sweep');
for (let y = 1900; y <= 2100; y++) {
  for (let mo = 1; mo <= 12; mo++) {
    const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      const mine = selfDay(y, mo, d);
      let theirs;
      try { theirs = h(M.calculateFourPillars({ year: y, month: mo, day: d, hour: 12, minute: 0 }).dayString); }
      catch (e) { theirs = 'ERR'; }
      dist[((jdnNoon(y, mo, d) - 11) % 60 + 60) % 60]++;
      n++;
      if (mine !== theirs) { bad++; if (badList.length < 40) badList.push([`${y}-${mo}-${d}`, mine, theirs]); }
    }
  }
}
console.timeEnd('sweep');
console.log(`## 일주 전수 대조 1900-01-01 ~ 2100-12-31`);
console.log(`   표본 n = ${n}`);
console.log(`   자체(JDN−11 mod 60) vs manseryeok(dayString) 불일치 = ${bad}`);
if (badList.length) { console.log('   불일치 샘플:'); for (const r of badList) console.log('    ', r.join(' | ')); }
console.log(`   60갑자 출현 분포: 종류=${dist.filter(v=>v>0).length}, min=${Math.min(...dist)}, max=${Math.max(...dist)} (기대 ${Math.floor(n/60)}±1)`);

// 앵커 검증
console.log('\n## 앵커 검증 (C03 §5.3)');
console.log('| 날짜 | JDN(정오) | idx60 | 자체 | manseryeok | 기대 |');
console.log('|---|---|---|---|---|---|');
for (const [y, mo, d, exp] of [[1900,1,1,'甲戌'],[1949,10,1,'甲子'],[1992,10,24,'癸酉'],
                               [2000,1,1,'戊午'],[2026,8,11,'丁巳']]) {
  const j = jdnNoon(y, mo, d), i = ((j - 11) % 60 + 60) % 60;
  const t = h(M.calculateFourPillars({ year: y, month: mo, day: d, hour: 12, minute: 0 }).dayString);
  console.log(`| ${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')} | ${j} | ${i} | ${selfDay(y,mo,d)} | ${t} | ${exp} | ${selfDay(y,mo,d)===exp&&t===exp?'PASS':'**FAIL**'}`);
}
