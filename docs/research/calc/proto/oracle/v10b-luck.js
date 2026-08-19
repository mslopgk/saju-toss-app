'use strict';
const P = require('./pillars.js');
const L = require('./luck.js');
const NM = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/';
const M = require(NM + 'manseryeok');
const GAN = P.GAN, ZHI = P.ZHI;
const KS = ['갑','을','병','정','무','기','경','신','임','계'];
const KB = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const ko2h = s => GAN[KS.indexOf(s[0])] + ZHI[KB.indexOf(s[1])];
console.log('| 입력(KST) | 성별 | 자체 방향 | manseryeok forward | 자체 정밀(년/월/일) | manseryeok(년/월/일) | 자체 C/D | manseryeok startAge | 자체 1~5 | manseryeok 1~5 | 판정 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
let ok=0,n=0;
for (const [y,mo,d,hh,mi,g] of [[1990,8,17,10,0,'M'],[1990,8,17,10,0,'F'],[2000,1,1,12,0,'F'],
     [2000,1,1,12,0,'M'],[2023,11,11,4,30,'M'],[1982,3,21,14,20,'F'],[1990,5,5,23,30,'M'],[2024,2,4,18,0,'F']]) {
  const p = P.fourPillars({ y, mo, d, hh, mi, region:'GENERIC', stdOffsetMin:540, mode:'CIVIL' });
  const lc = L.luckCycles(p, g, { count: 5 });
  const r = M.getLuckPillars({ instantUTCms: Date.UTC(y,mo-1,d,hh-9,mi), birthYear: y,
    monthPillar: { heavenlyStem: KS[p.month.gan], earthlyBranch: KB[p.month.zhi] },
    sajuYearStemIndex: p.year.gan, gender: g==='M'?'male':'female', count: 5 });
  const mlist = r.pillars.map(x=>ko2h(x.korean)).join(' ');
  const selfL = lc.list.map(x=>x.gz).join(' ');
  const dirOK = (lc.direction==='forward') === r.forward;
  const exOK = lc.exact.year===r.startYears && lc.exact.month===r.startMonths && lc.exact.day===r.startDays;
  const good = dirOK && exOK && selfL===mlist;
  good?ok++:0; n++;
  console.log(`| ${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')} ${hh}:${String(mi).padStart(2,'0')} | ${g} | ${lc.direction} | ${r.forward?'forward':'backward'} | ${lc.exact.year}/${lc.exact.month}/${lc.exact.day} | ${r.startYears}/${r.startMonths}/${r.startDays} | ${lc.numKorean}/${lc.numRound} | ${r.startAge} | ${selfL} | ${mlist} | ${good?'PASS':'**FAIL**'} |`);
}
console.log(`\n통과 ${ok}/${n}`);
