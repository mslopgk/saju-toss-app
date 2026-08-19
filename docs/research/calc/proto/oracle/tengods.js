'use strict';
// tengods.js — 십신 판정. C16 tables.json 을 그대로 로드하되, 규칙식으로 독립 재생성해 대조한다.
const path = require('path');
const TBL = require(path.resolve('C:/Users/user/orca/projects/saju-toss-app/docs/research/calc/tables.json'));
const { GAN, ZHI } = require('./pillars.js');

const WX = ['木', '火', '土', '金', '水'];
const elemOf = g => WX[Math.floor(GAN.indexOf(g) / 2)];
const yangOf = g => GAN.indexOf(g) % 2 === 0;
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };   // 生
const KE    = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };   // 剋

/** 규칙식 십신 (C16 _rule 그대로 독립 구현) */
function tenGodRule(dayGan, other) {
  const de = elemOf(dayGan), oe = elemOf(other);
  const same = yangOf(dayGan) === yangOf(other);
  if (de === oe)            return same ? '비견' : '겁재';
  if (SHENG[de] === oe)     return same ? '식신' : '상관';
  if (KE[de] === oe)        return same ? '편재' : '정재';
  if (KE[oe] === de)        return same ? '편관' : '정관';
  if (SHENG[oe] === de)     return same ? '편인' : '정인';
  throw new Error('unreachable');
}
/** tables.json 룩업 */
const tenGodTable = (dayGan, other) => TBL.tenGods.data[dayGan][other];
/** 지지 정기 기준 십신 */
const tenGodBranch = (dayGan, zhi) => TBL.tenGodsByBranchMain.data[dayGan][zhi];
const hiddenStems = zhi => TBL.hiddenStems.data[zhi];
const twelveStage = (dayGan, zhi) => TBL.twelveStages.data[dayGan][zhi];
const gongmangOf = gzStr => TBL.gongmang.data[gzStr].void;

/** 사주 8자 → 십신 전개 */
function analyze(p) {
  const dg = GAN[p.day.gan];
  const cell = (pil, label) => ({
    label, gz: pil.gz,
    ganTenGod: label === '일주' ? '일간' : tenGodTable(dg, GAN[pil.gan]),
    zhiTenGod: tenGodBranch(dg, ZHI[pil.zhi]),
    hidden: hiddenStems(ZHI[pil.zhi]),
    hiddenTenGods: Object.fromEntries(Object.entries(hiddenStems(ZHI[pil.zhi]))
      .filter(([, v]) => v).map(([k, v]) => [k, tenGodTable(dg, v)])),
    stage: twelveStage(dg, ZHI[pil.zhi]),
  });
  return {
    dayGan: dg,
    cells: [cell(p.year, '연주'), cell(p.month, '월주'), cell(p.day, '일주'), cell(p.hour, '시주')],
    gongmang: gongmangOf(p.day.gz),
  };
}

module.exports = { tenGodRule, tenGodTable, tenGodBranch, hiddenStems, twelveStage, gongmangOf, analyze, TBL };
