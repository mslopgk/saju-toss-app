'use strict';
// v3-terms.js — 절기 264건(2020~2030 × 24) 다자 대조
//   자체(HIGH) / 자체(LOW) / Skyfield DE440s / Swiss Ephemeris / manseryeok / sxtwl / KASI
const fs = require('fs');
const path = require('path');
const T = require('./solarterms.js');
const S = require('./sun.js');

const XC = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/xcheck';
const DOC = 'C:/Users/user/orca/projects/saju-toss-app/docs/research/calc';
const rd = p => JSON.parse(fs.readFileSync(p, 'utf-8'));

const sky = rd(path.join(XC, 'skyfield_terms.json'));   // [{year,sunLng,utc,tt_jd}]
const swe = rd(path.join(XC, 'swe_terms.json'));
const sxt = rd(path.join(XC, 'sxtwl_terms.json'));
const mns = rd(path.join(XC, 'mans_terms.json'));       // [{year,index,utc}]
const kasi = rd(path.join(DOC, 'golden-solarterms.json'));

// ---- 인덱싱 (key = "year:lng"). 각 소스의 연도는 KST 기준으로 재계산해 통일한다.
const KST = 9 * 3600e3;
const kstYear = ms => new Date(ms + KST).getUTCFullYear();
const key = (y, l) => `${y}:${l}`;

const map = (arr, getMs, getLng) => {
  const m = new Map();
  for (const r of arr) { const ms = getMs(r); if (ms == null || isNaN(ms)) continue;
    m.set(key(kstYear(ms), getLng(r)), ms); }
  return m;
};
const M_sky = map(sky, r => Date.parse(r.utc), r => r.sunLng);
const M_swe = map(swe, r => Date.parse(r.utc), r => r.sunLng);
const M_sxt = map(sxt, r => Date.parse(r.utc), r => r.sunLng);
// manseryeok 은 index 만 있으므로 index→황경 (0=소한 285 … 23=동지 270)
const IDX2LNG = T.TERMS.map(t => t.lng);
const M_mns = map(mns, r => Date.parse(r.utc), r => IDX2LNG[r.index]);
// KASI: terms[] = {year,name,sunLng,kstISO?...}
const M_kasi = new Map();
let kasiDefects = 0;
for (const r of kasi.terms) {
  if (r.defect) { kasiDefects++; continue; }              // C14 가 판정한 결함 레코드 제외
  const ms = Date.parse(r.kasi_kst.replace(' ', 'T') + ':00+09:00');
  if (isNaN(ms)) continue;
  M_kasi.set(key(kstYear(ms), r.sunLng), ms);
}
console.log('# KASI 결함 레코드 제외 =', kasiDefects);
console.log('# 소스 로드: sky=%d swe=%d sxtwl=%d manseryeok=%d KASI=%d',
  M_sky.size, M_swe.size, M_sxt.size, M_mns.size, M_kasi.size);
console.log('# KASI 레코드 샘플 키:', Object.keys(kasi.terms[0]).join(','));

// ---- 자체 구현 계산
const YEARS = []; for (let y = 2020; y <= 2030; y++) YEARS.push(y);
const rows = [];
console.time('# 자체 HIGH 264건 계산');
for (const y of YEARS) for (const t of T.TERMS) {
  const hi = T.solarTerm(y, t.lng, true);
  rows.push({ y, lng: t.lng, kor: t.kor, hanja: t.hanja, ms: hi.utcMs, kst: hi.kst });
}
console.timeEnd('# 자체 HIGH 264건 계산');
console.time('# 자체 LOW  264건 계산');
const lowMs = rows.map(r => T.solarTerm(r.y, r.lng, false).utcMs);
console.timeEnd('# 자체 LOW  264건 계산');

// ---- 통계 헬퍼
function stat(name, diffs) {
  if (!diffs.length) { console.log(`${name.padEnd(26)} n=0`); return; }
  const a = diffs.slice().sort((x, y) => x - y);
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  const rms = Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const med = a[Math.floor(a.length / 2)];
  const mx = a.reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0);
  console.log(`${name.padEnd(26)} n=${String(a.length).padStart(4)}  mean=${mean.toFixed(3)}  med=${med.toFixed(3)}  rms=${rms.toFixed(3)}  min=${a[0].toFixed(3)}  max=${a[a.length-1].toFixed(3)}  |max|=${mx.toFixed(3)}`);
}

console.log('\n================ [A] 자체(HIGH) 기준 편차 (초) — 2020~2030 x 24 ================');
const D = { low: [], sky: [], swe: [], sxt: [], mns: [] };
const miss = { sky: 0, swe: 0, sxt: 0, mns: 0 };
rows.forEach((r, i) => {
  D.low.push((lowMs[i] - r.ms) / 1000);
  const k = key(r.y, r.lng);
  for (const [src, M] of [['sky', M_sky], ['swe', M_swe], ['sxt', M_sxt], ['mns', M_mns]]) {
    if (M.has(k)) D[src].push((M.get(k) - r.ms) / 1000); else miss[src]++;
  }
});
stat('자체LOW − 자체HIGH', D.low);
stat('Skyfield DE440s − 자체', D.sky);
stat('SwissEph − 자체', D.swe);
stat('sxtwl − 자체', D.sxt);
stat('manseryeok − 자체', D.mns);
console.log('결측:', JSON.stringify(miss));

console.log('\n================ [B] KASI 공표값(분) 대조 ================');
// KASI 는 분 단위 공표. 자체값을 분으로 반올림/절사해 일치율 비교.
let nk = 0, eqRound = 0, eqFloor = 0; const kdiff = [];
const kmismatch = [];
for (const r of rows) {
  const k = key(r.y, r.lng);
  if (!M_kasi.has(k)) continue;
  nk++;
  const kms = M_kasi.get(k);
  const dsec = (r.ms - kms) / 1000;
  kdiff.push(dsec);
  const rnd = Math.round(r.ms / 60000) * 60000;
  const flr = Math.floor(r.ms / 60000) * 60000;
  if (rnd === kms) eqRound++; else kmismatch.push([r, kms, 'round', (rnd - kms) / 60000]);
  if (flr === kms) eqFloor++;
}
console.log(`KASI 대조 가능 = ${nk} 건 (골든셋 커버리지 2004~2026)`);
stat('자체HIGH − KASI (초)', kdiff);
console.log(`round(자체,분) == KASI : ${eqRound}/${nk} = ${(eqRound/nk*100).toFixed(2)}%`);
console.log(`floor(자체,분) == KASI : ${eqFloor}/${nk} = ${(eqFloor/nk*100).toFixed(2)}%`);
if (kmismatch.length) {
  console.log('\n-- round 불일치 전량 --');
  console.log('| 연도 | 절기 | 자체(KST) | KASI(KST) | Δ분 | DE440s(KST) | 판정 |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [r, kms, , dmin] of kmismatch) {
    const k = key(r.y, r.lng);
    const skyms = M_sky.get(k);
    const verdict = skyms == null ? '?' :
      (Math.abs(Math.round(skyms / 60000) * 60000 - kms) < 1 ? 'KASI=DE440s → **자체 오류**'
                                                             : '자체=DE440s → KASI 결함 의심');
    console.log(`| ${r.y} | ${r.kor} | ${r.kst} | ${T.fmtKST(kms)} | ${dmin} | ${skyms ? T.fmtKST(skyms) : '-'} | ${verdict} |`);
  }
}

console.log('\n================ [C] 자체 vs Skyfield DE440s 연도별 편차 중앙값 (초) ================');
console.log('| 연도 | n | median | min | max |');
console.log('|---|---|---|---|---|');
for (const y of YEARS) {
  const ds = rows.filter(r => r.y === y).map(r => {
    const k = key(r.y, r.lng); return M_sky.has(k) ? (M_sky.get(k) - r.ms) / 1000 : null;
  }).filter(v => v !== null).sort((a, b) => a - b);
  if (!ds.length) { console.log(`| ${y} | 0 | - | - | - |`); continue; }
  console.log(`| ${y} | ${ds.length} | ${ds[Math.floor(ds.length/2)].toFixed(2)} | ${ds[0].toFixed(2)} | ${ds[ds.length-1].toFixed(2)} |`);
}

console.log('\n================ [D] 자체 LOW(Meeus 저정밀) 오차 — 사주 영향 ================');
{
  let dateFlip = 0, minFlip = 0;
  const worst = [];
  rows.forEach((r, i) => {
    const d = (lowMs[i] - r.ms) / 1000;
    if (T.fmtKST(lowMs[i]).slice(0, 10) !== r.kst.slice(0, 10)) dateFlip++;
    if (Math.round(lowMs[i] / 60000) !== Math.round(r.ms / 60000)) minFlip++;
    worst.push([Math.abs(d), r, d]);
  });
  worst.sort((a, b) => b[0] - a[0]);
  console.log(`분 단위 불일치 = ${minFlip}/264 (${(minFlip/264*100).toFixed(1)}%)`);
  console.log(`KST 날짜 뒤집힘 = ${dateFlip}/264`);
  console.log('-- |오차| 상위 10건 --');
  console.log('| 연도 | 절기 | HIGH(KST) | LOW(KST) | Δ초 |');
  console.log('|---|---|---|---|---|');
  for (const [, r, d] of worst.slice(0, 10)) {
    const i = rows.indexOf(r);
    console.log(`| ${r.y} | ${r.kor} | ${r.kst} | ${T.fmtKST(lowMs[i])} | ${d.toFixed(1)} |`);
  }
}

// ---- 전량 표 저장
fs.writeFileSync('v3-terms-full.json', JSON.stringify(rows.map((r, i) => {
  const k = key(r.y, r.lng);
  return { year: r.y, lng: r.lng, kor: r.kor, self_kst: r.kst, self_ms: r.ms,
    low_kst: T.fmtKST(lowMs[i]),
    sky: M_sky.has(k) ? (M_sky.get(k) - r.ms) / 1000 : null,
    swe: M_swe.has(k) ? (M_swe.get(k) - r.ms) / 1000 : null,
    sxtwl: M_sxt.has(k) ? (M_sxt.get(k) - r.ms) / 1000 : null,
    mans: M_mns.has(k) ? (M_mns.get(k) - r.ms) / 1000 : null,
    kasi: M_kasi.has(k) ? (M_kasi.get(k) - r.ms) / 1000 : null };
}), null, 0));
console.log('\n# v3-terms-full.json 기록 완료');
