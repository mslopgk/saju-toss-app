'use strict';
// v6-golden.js — golden-set.json 전수 실행 + 3자 대조 (자체 / manseryeok / sxtwl)
const fs = require('fs');
const P = require('./pillars.js');
const NM = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/';
const M = require(NM + 'manseryeok');
const { Solar } = require(NM + 'lunar-javascript');

const S = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const B = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const KS = ['갑','을','병','정','무','기','경','신','임','계'];
const KB = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const h = s => S[KS.indexOf(s[0])] + B[KB.indexOf(s[1])];
const four = r => [h(r.yearString), h(r.monthString), h(r.dayString), h(r.hourString)].join(' ');
const safe = fn => { try { return fn(); } catch (e) { return 'ERR:' + e.message; } };

const G = JSON.parse(fs.readFileSync('golden-set.json', 'utf-8'));
const SX = fs.existsSync('sxtwl-golden.json') ? JSON.parse(fs.readFileSync('sxtwl-golden.json', 'utf-8')) : {};

const parse = ts => { const [ds, tm] = ts.split(' '); const [y, mo, d] = ds.split('-').map(Number);
                      const [hh, mi] = tm.split(':').map(Number); return { y, mo, d, hh, mi }; };

let pass = 0, fail = 0; const fails = [];
const out = [];
console.log('## A. 골든셋 전수 — 자체(CIVIL/GENERIC+540) vs 기대값(= manseryeok default)');
console.log('| ID | 입력(KST) | 기대 | 자체 | manseryeok | sxtwl | LJ sect1 | 판정 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const c of G.cases) {
  const t = parse(c.ts);
  const mine = safe(() => P.fourPillars(Object.assign({}, t, G.selfConfig)).text);
  const mans = safe(() => four(M.calculateFourPillars({ year: t.y, month: t.mo, day: t.d, hour: t.hh, minute: t.mi })));
  const lj = safe(() => { const ec = Solar.fromYmdHms(t.y, t.mo, t.d, t.hh, t.mi, 0).getLunar().getEightChar();
                          ec.setSect(1); return [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()].join(' '); });
  const sx = SX[c.id] || '-';
  const ok = mine === c.expect;
  ok ? pass++ : (fail++, fails.push([c, mine, mans, sx]));
  out.push({ id: c.id, ts: c.ts, expect: c.expect, self: mine, mans, sx, lj });
  console.log(`| ${c.id} | ${c.ts} | ${c.expect} | ${mine} | ${mans} | ${sx} | ${lj} | ${ok ? 'PASS' : '**FAIL**'} |`);
}
console.log(`\n통과 ${pass}/${G.cases.length} (${(pass/G.cases.length*100).toFixed(1)}%)  실패 ${fail}`);

// 열별 일치율
const cnt = k => out.filter(r => r[k] === r.expect).length;
console.log('\n## B. 열별 기대값 일치 (n=%d)', out.length);
console.log('| 구현 | 일치 | 비율 |');
console.log('|---|---|---|');
for (const [k, nm] of [['self','자체 구현'],['mans','manseryeok default'],['sx','sxtwl(+KST그대로)'],['lj','lunar-javascript sect1']]) {
  const c = cnt(k); console.log(`| ${nm} | ${c}/${out.length} | ${(c/out.length*100).toFixed(1)}% |`);
}

// 3자 대조 — 기둥별 분해
console.log('\n## C. 3자(자체/manseryeok/sxtwl) 기둥별 불일치 분해');
const cols = ['year','month','day','hour'];
const label = ['연주','월주','일주','시주'];
const diff = { mans: [0,0,0,0], sx: [0,0,0,0] };
for (const r of out) {
  const a = r.self.split(' ');
  for (const [k, arr] of [['mans', diff.mans], ['sx', diff.sx]]) {
    if (!r[k] || r[k] === '-' || r[k].startsWith('ERR')) continue;
    const b = r[k].split(' ');
    for (let i = 0; i < 4; i++) if (a[i] !== b[i]) arr[i]++;
  }
}
console.log('| 대조 | 연주 | 월주 | 일주 | 시주 |');
console.log('|---|---|---|---|---|');
console.log(`| 자체 vs manseryeok | ${diff.mans.join(' | ')} |`);
console.log(`| 자체 vs sxtwl | ${diff.sx.join(' | ')} |`);

if (fails.length) {
  console.log('\n## D. 실패 케이스 상세');
  for (const [c, mine] of fails) {
    const t = parse(c.ts);
    const r = P.fourPillars(Object.assign({}, t, G.selfConfig));
    console.log(`\n### ${c.id} ${c.ts} (${c.note})`);
    console.log(`  기대   : ${c.expect}`);
    console.log(`  자체   : ${mine}`);
    console.log(`  진태양시(=CIVIL 벽시계): ${r.trueSolar}`);
    console.log(`  utcMs=${new Date(r.norm.utcMs).toISOString()} std=${r.norm.std} dst=${r.norm.dst} flags=${r.norm.flags}`);
    console.log(`  입춘(${r.ipchun.year}) = ${r.ipchun.kst}`);
    console.log(`  월경계: prev λ=${r.jie.prevJie.lng} ${r.jie.prevJie.kst} / next λ=${r.jie.nextJie.lng} ${r.jie.nextJie.kst} / monthOrder=${r.jie.monthOrder}`);
  }
}
fs.writeFileSync('v6-golden-out.json', JSON.stringify(out, null, 1));
