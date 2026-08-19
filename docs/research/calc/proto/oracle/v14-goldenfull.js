'use strict';
// v14-goldenfull.js — docs/research/calc/golden-set.json (287 케이스) 전수 실행
const fs = require('fs');
const P = require('./pillars.js');
const TG = require('./tengods.js');
const L = require('./luck.js');
const ST = require('./solarterms.js');

const G = JSON.parse(fs.readFileSync('C:/Users/user/orca/projects/saju-toss-app/docs/research/calc/golden-set.json', 'utf-8'));
console.log(`# golden-set.json : ${G.title}  n=${G.cases.length}  byConfidence=${JSON.stringify(G.byConfidence)}`);
console.log(`# engines: ${JSON.stringify(G.engines)}`);

/** 골든셋 input 에 표준시 오프셋 필드가 없다 → 해외 케이스는 경도로 식별해 수기 지정 */
const FOREIGN = {  // 경도 → [stdOffsetMin, 설명]
  '-122.42': [-480, 'America/Los_Angeles PST 1955'],
  '9.99':    [60,   'Europe/Berlin CET 1879'],
  '-157.86': [-600, 'Pacific/Honolulu HST 1961'],
  '-74.01':  [-300, 'America/New_York EST 1963'],
};
function cfgOf(inp) {
  const c = { jasiRule: inp.jasiRule, eotAlgo: 'NOAA_MEEUS' };
  const fk = inp.longitude == null ? null : String(inp.longitude);
  if (fk && FOREIGN[fk]) { c.region = 'GENERIC'; c.stdOffsetMin = FOREIGN[fk][0]; c.dstOffsetMin = 0; }
  else if (inp.tzMode === 'raw_kst') { c.region = 'GENERIC'; c.stdOffsetMin = 540; c.dstOffsetMin = 0; }
  else { c.region = 'KR'; }
  if (inp.longitude == null) c.mode = (inp.tzMode === 'raw_kst') ? 'CIVIL' : 'DST_ONLY';
  else { c.mode = 'TRUE_SOLAR'; c.lon = inp.longitude; }
  return c;
}
/** 골든셋 conventions: 한국식 대운수 = round(floor(Δ일)/3) */
const daewoonGolden = totalMin => Math.round(Math.floor(totalMin / 1440) / 3);

const stat = { total: 0, four: 0, y: 0, mo: 0, d: 0, hh: 0, tg: 0, dw: 0, dir: 0, dwN: 0 };
const byConf = {};
const fails = []; const noPillar = []; const dwRules = {};
for (const c of G.cases) {
  const [Y, MO, D] = c.input.date.split('-').map(Number);
  const [HH, MI] = c.input.time.split(':').map(Number);
  const cfg = cfgOf(c.input);
  let p, err = null;
  try { p = P.fourPillars(Object.assign({ y: Y, mo: MO, d: D, hh: HH, mi: MI }, cfg)); }
  catch (e) { err = e.message; }
  stat.total++;
  const cf = c.confidence; byConf[cf] = byConf[cf] || { n: 0, ok: 0 };
  byConf[cf].n++;
  if (err) { fails.push([c, 'ERR:' + err, null]); continue; }
  const got = { y: p.year.gz, mo: p.month.gz, d: p.day.gz, hh: p.hour.gz };
  const ex = c.expected;
  if (ex.yearPillar === undefined) { stat.total--; byConf[cf].n--; noPillar.push(c.id); }
  const okY = got.y === ex.yearPillar, okM = got.mo === ex.monthPillar;
  const okD = got.d === ex.dayPillar, okH = got.hh === ex.hourPillar;
  if (okY) stat.y++; if (okM) stat.mo++; if (okD) stat.d++; if (okH) stat.hh++;
  const ok4 = okY && okM && okD && okH;
  if (ex.yearPillar === undefined) { /* 4주 미수록 케이스 */ }
  else if (ok4) { stat.four++; byConf[cf].ok++; }

  // 십신
  if (ex.tenGods && ok4) {
    const dg = P.GAN[p.day.gan];
    const t = {
      yearStem: TG.tenGodTable(dg, P.GAN[p.year.gan]), monthStem: TG.tenGodTable(dg, P.GAN[p.month.gan]),
      hourStem: TG.tenGodTable(dg, P.GAN[p.hour.gan]),
      yearBranch: TG.tenGodBranch(dg, P.ZHI[p.year.zhi]), monthBranch: TG.tenGodBranch(dg, P.ZHI[p.month.zhi]),
      dayBranch: TG.tenGodBranch(dg, P.ZHI[p.day.zhi]), hourBranch: TG.tenGodBranch(dg, P.ZHI[p.hour.zhi]),
    };
    if (Object.keys(ex.tenGods).every(k => ex.tenGods[k] === t[k])) stat.tg++;
    else fails.push([c, 'TENGOD', JSON.stringify(t)]);
  }
  // 대운
  if (ex.daewoonNumber !== undefined && c.input.gender) {
    const lc = L.luckCycles(p, c.input.gender, { count: 1 });
    stat.dwN++;
    const dirOK = (lc.direction === 'forward' ? 'forward' : 'reverse') === ex.daewoonDirection;
    if (dirOK) stat.dir++;
    // 대운수 규칙 후보 6종 동시 채점
    const days = lc.totalMin / 1440, fl = Math.floor(days);
    const CAND = {
      'round(floor(d)/3)':        Math.round(fl / 3),
      'max(1,round(floor(d)/3))': Math.max(1, Math.round(fl / 3)),
      'round(d/3)':               Math.round(days / 3),
      'max(1,round(d/3))':        Math.max(1, Math.round(days / 3)),
      'floor(d/3)+1버림2올림':      Math.floor(fl / 3) + (fl % 3 === 2 ? 1 : 0),
      'max(1,한국전통)':            Math.max(1, Math.floor(fl / 3) + (fl % 3 === 2 ? 1 : 0)),
    };
    for (const k of Object.keys(CAND)) { dwRules[k] = dwRules[k] || 0; if (CAND[k] === ex.daewoonNumber) dwRules[k]++; }
    if (daewoonGolden(lc.totalMin) === ex.daewoonNumber) stat.dw++;
    else if (fails.length < 400) fails.push([c, 'DAEWOON',
      `자체 round(floor(${(lc.totalMin/1440).toFixed(3)}일)/3)=${daewoonGolden(lc.totalMin)} vs 기대 ${ex.daewoonNumber} (dir ${lc.direction}/${ex.daewoonDirection})`]);
  }
  if (!ok4) fails.push([c, 'PILLAR', `${got.y} ${got.mo} ${got.d} ${got.hh}`]);
}

const pc = (a, b) => `${a}/${b} = ${(a/b*100).toFixed(2)}%`;
console.log('\n## A. 전수 결과');
console.log('| 항목 | 통과 |');
console.log('|---|---|');
console.log(`| 4기둥 전부 일치 | ${pc(stat.four, stat.total)} |`);
console.log(`| 연주 | ${pc(stat.y, stat.total)} |`);
console.log(`| 월주 | ${pc(stat.mo, stat.total)} |`);
console.log(`| 일주 | ${pc(stat.d, stat.total)} |`);
console.log(`| 시주 | ${pc(stat.hh, stat.total)} |`);
console.log(`| 십신 7항 (4기둥 통과분만) | ${pc(stat.tg, stat.four)} |`);
console.log(`| 대운 순역 | ${pc(stat.dir, stat.dwN)} |`);
console.log(`| 대운수(골든 conventions 규칙 그대로) | ${pc(stat.dw, stat.dwN)} |`);
console.log('\n## B. confidence 별 4기둥 통과율');
console.log('| confidence | n | 통과 | 비율 |');
console.log('|---|---|---|---|');
for (const k of Object.keys(byConf)) console.log(`| ${k} | ${byConf[k].n} | ${byConf[k].ok} | ${(byConf[k].ok/byConf[k].n*100).toFixed(1)}% |`);

console.log('\n## B2. 대운수 규칙 후보별 적중 (기대값 = golden-set daewoonNumber)');
console.log('| 규칙 | 적중 |');
console.log('|---|---|');
for (const k of Object.keys(dwRules)) console.log(`| ${k} | ${dwRules[k]}/${stat.dwN} = ${(dwRules[k]/stat.dwN*100).toFixed(1)}% |`);
console.log(`\n(4기둥 기대값이 없는 케이스 ${noPillar.length}건 제외: ${noPillar.join(', ')})`);
const pf = fails.filter(f => f[1] === 'PILLAR' || String(f[1]).startsWith('ERR'));
console.log(`\n## C. 4기둥 불일치 전량 (${pf.length}건)`);
console.log('| ID | 입력 | tzMode/lon/jasi | 기대 | 자체 | confidence | label |');
console.log('|---|---|---|---|---|---|---|');
for (const [c, , got] of pf) {
  const e = c.expected;
  console.log(`| ${c.id} | ${c.input.date} ${c.input.time} ${c.input.gender||''} | ${c.input.tzMode}/${c.input.longitude??'-'}/${c.input.jasiRule} | ${e.yearPillar} ${e.monthPillar} ${e.dayPillar} ${e.hourPillar} | ${got} | ${c.confidence} | ${(c.label||'').slice(0,44)} |`);
}
const df = fails.filter(f => f[1] === 'DAEWOON');
console.log(`\n## D. 대운수 불일치 (${df.length}건, 상위 25)`);
console.log('| ID | 입력 | 성별 | 상세 | label |');
console.log('|---|---|---|---|---|');
for (const [c, , m] of df.slice(0, 25))
  console.log(`| ${c.id} | ${c.input.date} ${c.input.time} | ${c.input.gender} | ${m} | ${(c.label||'').slice(0,36)} |`);
const tf = fails.filter(f => f[1] === 'TENGOD');
console.log(`\n## E. 십신 불일치 (${tf.length}건)`);
for (const [c, , m] of tf.slice(0, 10)) console.log(`  ${c.id} ${c.input.date} ${c.input.time} : ${m}`);
