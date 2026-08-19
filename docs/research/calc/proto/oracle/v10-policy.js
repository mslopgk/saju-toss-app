'use strict';
// v10-policy.js — 정책(진태양시/야자시) 영향 정량화 · manseryeok 대운 대조 · 성능 벤치
const P = require('./pillars.js');
const L = require('./luck.js');
const ST = require('./solarterms.js');
const TN = require('./timenorm.js');
const S = require('./sun.js');
const { jdnNoon, msToJD } = require('./jd.js');
const { deltaTFromJD } = require('./deltat.js');
const NM = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/';
const M = require(NM + 'manseryeok');

const GAN = P.GAN, ZHI = P.ZHI;
const KS = ['갑','을','병','정','무','기','경','신','임','계'];
const KB = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const h = s => GAN[KS.indexOf(s[0])] + ZHI[KB.indexOf(s[1])];

console.log('====== [1] manseryeok getLuckPillars 대조 (정확한 시그니처) ======');
console.log('| 입력 | 성별 | 자체 방향 | 자체 C/D | manseryeok startAge | 자체 1~5 | manseryeok 1~5 | 간지일치 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [y, mo, d, hh, mi, g] of [[1990,8,17,10,0,'M'],[1990,8,17,10,0,'F'],[2000,1,1,12,0,'F'],
                                     [2000,1,1,12,0,'M'],[2023,11,11,4,30,'M'],[1982,3,21,14,20,'F']]) {
  const p = P.fourPillars({ y, mo, d, hh, mi, region: 'GENERIC', stdOffsetMin: 540, mode: 'CIVIL' });
  const lc = L.luckCycles(p, g, { count: 5 });
  let ms = '-', mlist = '-';
  try {
    const r = M.getLuckPillars({
      instantUTCms: Date.UTC(y, mo - 1, d, hh - 9, mi),
      birthYear: y,
      monthPillar: { stemIndex: p.month.gan, branchIndex: p.month.zhi },
      sajuYearStemIndex: p.year.gan,
      gender: g === 'M' ? 'male' : 'female', count: 5,
    });
    const arr = Array.isArray(r) ? r : (r.pillars || r.list || []);
    ms = (r.startAge !== undefined) ? r.startAge : (arr[0] && arr[0].startAge !== undefined ? arr[0].startAge : '?');
    mlist = arr.map(x => GAN[x.stemIndex] + ZHI[x.branchIndex]).join(' ');
  } catch (e) { ms = 'ERR:' + e.message.slice(0, 60); }
  const selfL = lc.list.map(x => x.gz).join(' ');
  console.log(`| ${y}-${mo}-${d} ${hh}:${String(mi).padStart(2,'0')} | ${g} | ${lc.direction} | ${lc.numKorean}/${lc.numRound} | ${ms} | ${selfL} | ${mlist} | ${selfL === mlist ? 'OK' : '**DIFF**'} |`);
}

console.log('\n====== [2] 진태양시 ON/OFF 가 일주를 바꾸는 비율 (서울, 1950~2050 전일 × 1분해상도 창) ======');
{
  // 진태양시 시프트는 하루 안에서 −44.2 ~ −13.5분. 자정 근처 |shift| 분만 일주가 바뀐다.
  let flipDays = 0, totalMin = 0, flipMin = 0;
  const perMonth = new Array(13).fill(0);
  for (let y = 1950; y <= 2050; y++) {
    for (let mo = 1; mo <= 12; mo++) {
      const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      for (let d = 1; d <= dim; d++) {
        const n = TN.normalizeBirthTime({ y, mo, d, hh: 12, mi: 0, mode: 'TRUE_SOLAR' });
        const shiftMin = (n.tMs - (n.utcMs + (n.std + n.dst) * 60000)) / 60000;   // 벽시계 대비 이동
        const w = Math.max(0, Math.min(1440, Math.round(-shiftMin)));             // 00:00~|shift| 구간
        totalMin += 1440; flipMin += w;
        if (w > 0) { flipDays++; perMonth[mo] += w; }
      }
    }
  }
  console.log(`  일주가 바뀌는 분 = ${flipMin} / ${totalMin} = ${(flipMin / totalMin * 100).toFixed(4)}%`);
  console.log(`  (C13 §10.1 실측 2.1409% 와 대조)`);
  console.log('  | 월 | 평균 이동창(분/일) |');
  console.log('  |---|---|');
  for (let mo = 1; mo <= 12; mo++) console.log(`  | ${mo} | ${(perMonth[mo] / (101 * 30.4)).toFixed(2)} |`);
}

console.log('\n====== [3] 야자시 3유파 — 2024년 23시대 366일 전수 ======');
{
  let ab = 0, ac = 0, bc = 0;
  const samples = [];
  for (let mo = 1; mo <= 12; mo++) {
    const dim = new Date(Date.UTC(2024, mo, 0)).getUTCDate();
    for (let d = 1; d <= dim; d++) {
      const base = { y: 2024, mo, d, hh: 23, mi: 30, region: 'GENERIC', stdOffsetMin: 540, mode: 'CIVIL' };
      const a = P.fourPillars({ ...base, jasiRule: 'yajasi' }).text;
      const b = P.fourPillars({ ...base, jasiRule: 'johjasi' }).text;
      const c = P.fourPillars({ ...base, jasiRule: 'yajasi-nextstem' }).text;
      if (a !== b) ab++; if (a !== c) ac++; if (b !== c) bc++;
      if (samples.length < 3) samples.push([`2024-${mo}-${d} 23:30`, a, b, c]);
    }
  }
  console.log(`  (a)yajasi != (b)johjasi        : ${ab}/366`);
  console.log(`  (a)yajasi != (c)yajasi-nextstem: ${ac}/366`);
  console.log(`  (b) != (c)                     : ${bc}/366`);
  console.log('  | 입력 | (a)yajasi | (b)johjasi | (c)yajasi-nextstem |');
  console.log('  |---|---|---|---|');
  for (const s of samples) console.log(`  | ${s[0]} | ${s[1]} | ${s[2]} | ${s[3]} |`);
}

console.log('\n====== [4] 균시차 알고리즘 — 자체 고정밀(Meeus 28.3) vs NOAA_MEEUS (2024 전일 12:00UT) ======');
{
  const ds = [];
  for (let i = 0; i < 366; i++) {
    const ms = Date.UTC(2024, 0, 1 + i, 12);
    const jde = msToJD(ms) + deltaTFromJD(msToJD(ms)) / 86400;
    ds.push((S.equationOfTimeHigh(jde) - S.equationOfTimeNOAA(jde)) * 60);
  }
  ds.sort((a, b) => a - b);
  console.log(`  차(초): min=${ds[0].toFixed(2)} max=${ds[ds.length-1].toFixed(2)} rms=${Math.sqrt(ds.reduce((s,v)=>s+v*v,0)/ds.length).toFixed(2)}`);
  console.log('  | 날짜 | 자체 E(분) | NOAA E(분) | 차(초) |');
  console.log('  |---|---|---|---|');
  for (const dd of [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 336]) {
    const ms = Date.UTC(2024, 0, dd, 12);
    const jde = msToJD(ms) + deltaTFromJD(msToJD(ms)) / 86400;
    const a = S.equationOfTimeHigh(jde), b = S.equationOfTimeNOAA(jde);
    console.log(`  | ${new Date(ms).toISOString().slice(0,10)} | ${a.toFixed(4)} | ${b.toFixed(4)} | ${((a-b)*60).toFixed(2)} |`);
  }
}

console.log('\n====== [5] 성능 (Windows 11 / node ' + process.version + ') ======');
{
  const bench = (nm, fn, n) => {
    fn(); const t = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn();
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    console.log(`  ${nm.padEnd(46)} ${n}회 ${ms.toFixed(1)}ms  = ${(ms/n*1000).toFixed(1)}µs/회`);
  };
  bench('sunLongitudeHigh (VSOP87 전항)', () => S.sunLongitudeHigh(2460000.5), 2000);
  bench('sunLongitudeLow  (Meeus 25 저정밀)', () => S.sunLongitudeLow(2460000.5), 200000);
  bench('solarTerm 1건 (이분법 60회)', () => ST.solarTerm(2024, 315, true), 200);
  bench('jdnNoon', () => jdnNoon(2024, 2, 4), 1000000);
  bench('normalizeBirthTime', () => TN.normalizeBirthTime({ y: 2024, mo: 2, d: 4, hh: 17, mi: 27 }), 20000);
  bench('fourPillars (절기 실시간 계산)', () => P.fourPillars({ y: 2024, mo: 2, d: 4, hh: 17, mi: 27 }), 100);
}
