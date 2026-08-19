'use strict';
// luck.js — 대운 순역 / 대운수 / 대운 목록. C06 §3~§5 확정 규칙의 독립 구현.
const { GAN, ZHI, gz } = require('./pillars.js');
const ST = require('./solarterms.js');

/** 순행/역행: 陽年男 · 陰年女 = 순행, 陰年男 · 陽年女 = 역행 */
function direction(yearGanIdx, gender) {
  const yang = yearGanIdx % 2 === 0;
  const male = gender === 'M';
  return (yang === male) ? 'forward' : 'backward';
}

/**
 * 대운수 4방식 전부 계산.
 * @param birthUtcMs 절기 비교에 쓰는 절대 순간
 */
function luckStart(birthUtcMs, dir) {
  const mb = ST.monthBoundary(birthUtcMs);
  const start = dir === 'forward' ? birthUtcMs : mb.prevJie.utcMs;
  const end   = dir === 'forward' ? mb.nextJie.utcMs : birthUtcMs;
  const totalMin = (end - start) / 60000;
  const days = totalMin / 1440;

  // (A) 분 단위 정밀식.
  //  ⚠️ 年·月 은 floor 로 확정(실측 398/400, 396/400).
  //     日 은 구현체가 갈린다 — lunar-python Yun.py 는 int()=floor,
  //     manseryeok v2.0.0 은 round (실측 round 384/400 vs floor 214/400, v10c).
  let m = totalMin;
  let A_year = Math.floor(m / 4320); m -= A_year * 4320;
  let A_month = Math.floor(m / 360); m -= A_month * 360;
  const A_dayFloor = Math.floor(m / 12);
  let A_dayRound = Math.round(m / 12);
  // ★ 자리올림: round 결과가 30일이 되면 1개월로, 12개월이면 1년으로 승격
  //   (manseryeok v2.0.0 이 이렇게 정규화한다 — v12 실측에서 6/1/30 vs 6/2/0 형태로 드러남)
  if (A_dayRound >= 30) { A_dayRound -= 30; A_month += 1; }
  if (A_month >= 12) { A_month -= 12; A_year += 1; }
  const A_day = A_dayRound;                     // manseryeok 호환 기본값
  const A_hour = Math.round((m - A_dayFloor * 12) * 2);
  const dob = new Date(birthUtcMs);
  const cross = new Date(Date.UTC(dob.getUTCFullYear() + A_year, dob.getUTCMonth() + A_month,
      dob.getUTCDate() + A_day, dob.getUTCHours() + A_hour, dob.getUTCMinutes(), dob.getUTCSeconds()));

  // (C) 한국 전통: 정수일 ÷3, 나머지1 버림 / 나머지2 올림
  const intDays = Math.floor(totalMin / 1440);
  const rem = intDays % 3;
  const C_num = Math.floor(intDays / 3) + (rem === 2 ? 1 : 0);
  // (D) 반올림
  const D_num = Math.round(days / 3);

  return {
    startMs: start, endMs: end, totalMin, days,
    exact: { year: A_year, month: A_month, day: A_day, dayFloor: A_dayFloor, dayRound: A_dayRound,
             hour: A_hour, crossOverUTC: cross.toISOString() },
    numKorean: C_num, numRound: D_num,
    prevJie: mb.prevJie, nextJie: mb.nextJie,
  };
}

/** 대운 간지 나열 (월주에서 ±1씩) */
function luckPillars(monthGan, monthZhi, dir, count) {
  const out = [];
  for (let i = 1; i <= (count || 10); i++) {
    const s = dir === 'forward' ? i : -i;
    const g = ((monthGan + s) % 10 + 10) % 10;
    const z = ((monthZhi + s) % 12 + 12) % 12;
    out.push({ n: i, gan: g, zhi: z, gz: gz(g, z) });
  }
  return out;
}

function luckCycles(p, gender, opt) {
  const o = opt || {};
  const dir = direction(p.year.gan, gender);
  const cmpMs = o.termCompare === 'TRUESOLAR' ? p.norm.tMs : p.norm.utcMs;
  const st = luckStart(cmpMs, dir);
  const num = (o.numberRule === 'round') ? st.numRound : st.numKorean;
  const list = luckPillars(p.month.gan, p.month.zhi, dir, o.count || 10)
      .map(r => Object.assign(r, { fromAge: num + (r.n - 1) * 10, toAge: num + r.n * 10 - 1 }));
  return { direction: dir, ...st, num, list };
}

module.exports = { direction, luckStart, luckPillars, luckCycles };
