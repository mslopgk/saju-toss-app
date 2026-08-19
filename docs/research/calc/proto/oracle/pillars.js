'use strict';
// pillars.js — 사주 네 기둥. C03 확정 규칙의 독립 구현.
const { jdnNoon, jdnNoonAuto } = require('./jd.js');
const ST = require('./solarterms.js');
const { normalizeBirthTime } = require('./timenorm.js');

const GAN  = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const ZHI  = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const GAN_KO = ['갑','을','병','정','무','기','경','신','임','계'];
const ZHI_KO = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const OHODUN  = g => (g * 2 + 2) % 10;      // 五虎遁: 연간 → 寅월 天干
const OSEODUN = g => (g % 5) * 2;           // 五鼠遁: 일간 → 子시 天干
const gz = (g, z) => GAN[g] + ZHI[z];
const idx60 = (g, z) => { for (let i = 0; i < 60; i++) if (i % 10 === g && i % 12 === z) return i; return -1; };

/** 진태양시 ms(UTC필드 표현) → {y,mo,d,hh,mi,ss, minutesOfDay} */
function fields(tMs) {
  const d = new Date(tMs);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
           hh: d.getUTCHours(), mi: d.getUTCMinutes(), ss: d.getUTCSeconds(),
           minutesOfDay: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** 시지 index (정자시 23:00~00:59 = 子) */
function hourZhiIndex(minutesOfDay) {
  if (minutesOfDay >= 23 * 60) return 0;
  return Math.floor((minutesOfDay + 60) / 120) % 12;
}

/**
 * @param opt {y,mo,d,hh,mi, gender?:'M'|'F', lon?, mode?, jasiRule?:'yajasi'|'johjasi'|'yajasi-nextstem',
 *             termCompare?:'UTC'|'TRUESOLAR', eotAlgo?, region?, stdOffsetMin?, gapPolicy?, overlapPolicy?}
 */
function fourPillars(opt) {
  const jasiRule = opt.jasiRule || 'yajasi';
  const termCompare = opt.termCompare || 'UTC';
  const norm = normalizeBirthTime(opt);
  const F = fields(norm.tMs);

  // 절기 비교에 쓸 "절대 순간"
  const cmpMs = termCompare === 'TRUESOLAR' ? norm.tMs : norm.utcMs;

  // ── 연주 : 입춘 절입 기준
  const civilYear = new Date(norm.utcMs + 9 * 3600e3).getUTCFullYear();
  let ipchunYear = civilYear;
  const ipchunThis = ST.solarTerm(civilYear, 315, true);
  const ipchunMs = termCompare === 'TRUESOLAR'
      ? ipchunThis.utcMs + (norm.tMs - norm.utcMs) : ipchunThis.utcMs;
  if (cmpMs < ipchunMs) ipchunYear = civilYear - 1;
  const yearGan = ((ipchunYear - 4) % 10 + 10) % 10;
  const yearZhi = ((ipchunYear - 4) % 12 + 12) % 12;

  // ── 월주 : 12절 경계
  const mb = ST.monthBoundary(cmpMs);
  const monthOrder = mb.monthOrder;                 // 0=寅
  const monthZhi = (monthOrder + 2) % 12;
  const monthGan = (OHODUN(yearGan) + monthOrder) % 10;

  // ── 일주 : 진태양시 달력일의 JDN, offset 11
  //   calendarRule: 'auto'(기본) = 1582-10-15 미만은 율리우스력. 'gregorian' = proleptic 그레고리 전용
  const JDN = (opt.calendarRule === 'gregorian') ? jdnNoon : jdnNoonAuto;
  let dayJdn = JDN(F.y, F.mo, F.d);
  const isYaja = F.minutesOfDay >= 23 * 60;
  if (isYaja && jasiRule === 'johjasi') dayJdn += 1;
  const dIdx = ((dayJdn - 11) % 60 + 60) % 60;
  const dayGan = dIdx % 10, dayZhi = dIdx % 12;

  // ── 시주
  const hourZhi = hourZhiIndex(F.minutesOfDay);
  let stemBase = dayGan;
  if (isYaja && jasiRule === 'yajasi-nextstem') stemBase = (((JDN(F.y, F.mo, F.d) + 1 - 11) % 60 + 60) % 60) % 10;
  const hourGan = (OSEODUN(stemBase) + hourZhi) % 10;

  return {
    input: opt, norm,
    trueSolar: `${F.y}-${String(F.mo).padStart(2,'0')}-${String(F.d).padStart(2,'0')} `
             + `${String(F.hh).padStart(2,'0')}:${String(F.mi).padStart(2,'0')}:${String(F.ss).padStart(2,'0')}`,
    year:  { gan: yearGan,  zhi: yearZhi,  gz: gz(yearGan, yearZhi),   idx60: idx60(yearGan, yearZhi) },
    month: { gan: monthGan, zhi: monthZhi, gz: gz(monthGan, monthZhi), idx60: idx60(monthGan, monthZhi), monthOrder },
    day:   { gan: dayGan,   zhi: dayZhi,   gz: gz(dayGan, dayZhi),     idx60: dIdx, jdn: dayJdn },
    hour:  { gan: hourGan,  zhi: hourZhi,  gz: gz(hourGan, hourZhi),   idx60: idx60(hourGan, hourZhi) },
    text: [gz(yearGan,yearZhi), gz(monthGan,monthZhi), gz(dayGan,dayZhi), gz(hourGan,hourZhi)].join(' '),
    ipchun: { year: ipchunYear, kst: ipchunThis.kst, utcMs: ipchunThis.utcMs },
    jie: mb, isYaja, jasiRule,
  };
}

module.exports = { GAN, ZHI, GAN_KO, ZHI_KO, OHODUN, OSEODUN, gz, idx60,
                   hourZhiIndex, fields, fourPillars };
