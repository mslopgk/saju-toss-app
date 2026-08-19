'use strict';
// v9-tengod-luck.js — 십신 100칸 / 지지십신 120칸 / 공망 60행 / 대운 6케이스 대조
const P = require('./pillars.js');
const TG = require('./tengods.js');
const L = require('./luck.js');
const NM = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/';
const M = require(NM + 'manseryeok');

const GAN = P.GAN, ZHI = P.ZHI;
const KS = ['갑','을','병','정','무','기','경','신','임','계'];
const KB = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const ko2h = s => GAN[KS.indexOf(s[0])] + ZHI[KB.indexOf(s[1])];

console.log('====== [1] 십신 10×10 — 자체규칙 vs tables.json vs manseryeok ======');
{
  let a = 0, b = 0, n = 0; const bad = [];
  for (const dg of GAN) for (const og of GAN) {
    n++;
    const rule = TG.tenGodRule(dg, og);
    const tbl = TG.tenGodTable(dg, og);
    let mans;
    try { mans = M.getTenGod(KS[GAN.indexOf(dg)], KS[GAN.indexOf(og)]); } catch (e) { mans = 'ERR'; }
    if (rule === tbl) a++; else bad.push(['tbl', dg, og, rule, tbl]);
    if (rule === mans) b++; else bad.push(['mans', dg, og, rule, mans]);
  }
  console.log(`  자체규칙 == tables.json : ${a}/${n}`);
  console.log(`  자체규칙 == manseryeok  : ${b}/${n}`);
  if (bad.length) console.log('  불일치:', JSON.stringify(bad.slice(0, 20), null, 0));
}

console.log('\n====== [2] 지지(정기) 십신 10×12 ======');
{
  let a = 0, b = 0, n = 0; const bad = [];
  for (const dg of GAN) for (const z of ZHI) {
    n++;
    const hidden = TG.hiddenStems(z)['정기'];
    const rule = TG.tenGodRule(dg, hidden);
    const tbl = TG.tenGodBranch(dg, z);
    let mans; try { mans = M.getBranchTenGod(KS[GAN.indexOf(dg)], KB[ZHI.indexOf(z)]); } catch (e) { mans = 'ERR'; }
    if (rule === tbl) a++; else bad.push(['tbl', dg, z, rule, tbl]);
    if (rule === mans) b++; else bad.push(['mans', dg, z, rule, mans]);
  }
  console.log(`  자체규칙(지장간 정기) == tables.json : ${a}/${n}`);
  console.log(`  자체규칙 == manseryeok getBranchTenGod : ${b}/${n}`);
  if (bad.length) console.log('  불일치:', JSON.stringify(bad.slice(0, 20)));
}

console.log('\n====== [3] 공망 60행 ======');
{
  let a = 0, n = 0; const bad = [];
  for (let i = 0; i < 60; i++) {
    const g = i % 10, z = i % 12, s = GAN[g] + ZHI[z];
    n++;
    const tbl = TG.gongmangOf(s);
    // 규칙: 旬首 = i - (i mod 10) → 空亡 = 그 旬首의 지지 −2, −1
    const xunStart = i - (i % 10);
    const v = [ZHI[(xunStart % 12 + 10) % 12], ZHI[(xunStart % 12 + 11) % 12]];
    let mans; try { mans = M.getVoidBranches(KS[g], KB[z]); } catch (e) { mans = null; }
    const mansH = Array.isArray(mans) ? mans.map(x => ZHI[KB.indexOf(x)]) : mans;
    const ok = JSON.stringify(v) === JSON.stringify(tbl) &&
               (mansH === null || JSON.stringify(v) === JSON.stringify(mansH));
    if (ok) a++; else bad.push([s, v, tbl, mansH]);
  }
  console.log(`  자체규칙 == tables.json == manseryeok : ${a}/${n}`);
  if (bad.length) console.log('  불일치:', JSON.stringify(bad.slice(0, 10)));
}

console.log('\n====== [4] 십신 전개 실행 예 (1990-05-05 23:30, yajasi) ======');
{
  const p = P.fourPillars({ y: 1990, mo: 5, d: 5, hh: 23, mi: 30, region: 'GENERIC', stdOffsetMin: 540, mode: 'CIVIL' });
  const a = TG.analyze(p);
  console.log(`  4기둥 = ${p.text}   일간 = ${a.dayGan}   공망 = ${a.gongmang.join('')}`);
  console.log('  | 기둥 | 간지 | 天干십신 | 地支(정기)십신 | 지장간 | 지장간십신 | 십이운성 |');
  console.log('  |---|---|---|---|---|---|---|');
  for (const c of a.cells)
    console.log(`  | ${c.label} | ${c.gz} | ${c.ganTenGod} | ${c.zhiTenGod} | ${Object.entries(c.hidden).filter(([,v])=>v).map(([k,v])=>k+':'+v).join(' ')} | ${Object.entries(c.hiddenTenGods).map(([k,v])=>k+':'+v).join(' ')} | ${c.stage} |`);
  console.log('  C13 §11.4 기재: 공망 戌亥 / 십신 비견·비견·일간·편관');
}

console.log('\n====== [5] 대운 — 자체 vs manseryeok getLuckPillars ======');
{
  const cases = [
    [1990, 8, 17, 10, 0, 'M'], [1990, 8, 17, 10, 0, 'F'],
    [2000, 1, 1, 12, 0, 'F'],  [2000, 1, 1, 12, 0, 'M'],
    [2023, 11, 11, 4, 30, 'M'],[1982, 3, 21, 14, 20, 'F'],
    [1990, 5, 5, 23, 30, 'M'],
  ];
  console.log('| 입력 | 성별 | 연간 | 방향(자체) | 대운수C(한국) | 대운수D(반올림) | 정밀교운 | manseryeok startAge | 1~3 대운(자체) | manseryeok 1~3 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const [y, mo, d, hh, mi, g] of cases) {
    const p = P.fourPillars({ y, mo, d, hh, mi, region: 'GENERIC', stdOffsetMin: 540, mode: 'CIVIL' });
    const lc = L.luckCycles(p, g, { count: 3 });
    let ms = '-', mlist = '-';
    try {
      const r = M.getLuckPillars({ year: y, month: mo, day: d, hour: hh, minute: mi, gender: g === 'M' ? 'male' : 'female' });
      ms = (r.startAge !== undefined ? r.startAge : JSON.stringify(r).slice(0, 40));
      const arr = r.pillars || r.list || r;
      mlist = Array.isArray(arr) ? arr.slice(0, 3).map(x => ko2h(x.ganji || x.pillar || x.string || '')).join(' ') : '-';
    } catch (e) { ms = 'ERR:' + e.message.slice(0, 40); }
    console.log(`| ${y}-${mo}-${d} ${hh}:${String(mi).padStart(2,'0')} | ${g} | ${P.GAN[p.year.gan]} | ${lc.direction} | ${lc.numKorean} | ${lc.numRound} | ${lc.exact.year}년${lc.exact.month}월${lc.exact.day}일${lc.exact.hour}시 | ${ms} | ${lc.list.map(x=>x.gz).join(' ')} | ${mlist} |`);
  }
}

console.log('\n====== [6] 대운 상세 (1990-08-17 10:00 男, C06 케이스 A) ======');
{
  const p = P.fourPillars({ y: 1990, mo: 8, d: 17, hh: 10, mi: 0, region: 'GENERIC', stdOffsetMin: 540, mode: 'CIVIL' });
  const lc = L.luckCycles(p, 'M', { count: 10 });
  console.log(`  원국 = ${p.text}`);
  console.log(`  방향 = ${lc.direction} (연간 ${P.GAN[p.year.gan]} ${p.year.gan % 2 === 0 ? '陽' : '陰'}, 男)`);
  console.log(`  직전節 = λ${lc.prevJie.lng} ${lc.prevJie.kst}`);
  console.log(`  다음節 = λ${lc.nextJie.lng} ${lc.nextJie.kst}`);
  console.log(`  Δ = ${lc.totalMin.toFixed(2)}분 = ${lc.days.toFixed(4)}일`);
  console.log(`  (A)정밀 = ${lc.exact.year}년 ${lc.exact.month}개월 ${lc.exact.day}일 ${lc.exact.hour}시간, 교운 ${lc.exact.crossOverUTC}`);
  console.log(`  (C)한국 = ${lc.numKorean}   (D)반올림 = ${lc.numRound}`);
  console.log('  | # | 간지 | 나이 |');
  console.log('  |---|---|---|');
  for (const r of lc.list) console.log(`  | ${r.n} | ${r.gz} | ${r.fromAge}~${r.toAge} |`);
}
