// 궁합 최종 점수·등급 분포 실측 — **홀드아웃 검증**.
//
// 근거: C18 §6.3(기준 분포) · §6.4(분포 불변 정리) / C00 §S8-3.
//
// `gen-compat-calib.mjs` 가 ECDF 를 적합한 표본(seed 20260813)과 **다른 시드**로 원국 풀과 쌍을
// 새로 뽑아, 배포되는 `computeCompatibility()` 를 그대로 통과시킨다. 같은 표본으로 적합하고 같은
// 표본으로 검증하면 등급 비율이 맞는 것이 당연해서 아무것도 증명하지 못한다.
//
// 실행: node src/shared/data/tools/check-compat-distribution.mjs [--seed 20260814] [--pairs 100000]

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../../../..');
const jiti = createJiti(path.join(APP_ROOT, 'noop.js'));
const engine = jiti('./src/shared/lib/saju/index.ts');
const compat = jiti('./src/shared/lib/compat/index.ts');
const params = jiti('./src/shared/lib/compat/params.ts');

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i < 0 ? d : Number(argv[i + 1]);
};
const SEED = argOf('--seed', 20260814);
const N_PAIRS = argOf('--pairs', 100_000);
const N_CHARTS = argOf('--charts', 20_000);
/** 자기신고 미입력 비율. 0 이면 전원이 MBTI·혈액형을 다 적은 세계 (C18 시뮬과 같은 조건) */
const MISSING_RATE = argOf('--missing', 0);

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const randInt = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const MBTI = params.MBTI_TYPE_ORDER;
const BLOOD_CUM = [
  ['A', 34],
  ['B', 61],
  ['O', 89],
  ['AB', 100],
];
const randBlood = () => {
  const r = rnd() * 100;
  for (const [t, c] of BLOOD_CUM) if (r < c) return t;
  return 'AB';
};
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function randomPerson() {
  const year = randInt(1930, 2020);
  const month = randInt(1, 12);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = randInt(1, month === 2 && leap ? 29 : DIM[month - 1]);
  const gender = rnd() < 0.5 ? 'M' : 'F';
  const chart = engine.computeChart({
    calendarType: 'solar',
    year,
    month,
    day,
    hour: randInt(0, 23),
    minute: randInt(0, 59),
    timeUnknown: false,
    gender,
    birthPlace: { region: 'KR' },
  });
  const profile = {
    mbti: rnd() < MISSING_RATE ? null : MBTI[randInt(0, MBTI.length - 1)],
    blood: rnd() < MISSING_RATE ? null : randBlood(),
  };
  return { chart, profile };
}

console.log(`seed=${SEED} charts=${N_CHARTS} pairs=${N_PAIRS} missingRate=${MISSING_RATE}`);
console.log(`engine=${compat.COMPAT_ENGINE_VERSION}`);
const pool = [];
for (let i = 0; i < N_CHARTS; i++) pool.push(randomPerson());

const scores = new Int32Array(N_PAIRS);
const bandCount = new Map();
const t0 = Date.now();
for (let i = 0; i < N_PAIRS; i++) {
  const a = pool[randInt(0, pool.length - 1)];
  let b = pool[randInt(0, pool.length - 1)];
  while (b === a) b = pool[randInt(0, pool.length - 1)];
  const r = compat.computeCompatibility(a.chart, b.chart, a.profile, b.profile);
  scores[i] = r.score;
  bandCount.set(r.band.tag, (bandCount.get(r.band.tag) ?? 0) + 1);
}
const ms = Date.now() - t0;

const arr = Array.from(scores).sort((x, y) => x - y);
const q = (p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))];
const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
const f = (v, d = 2) => Number(v.toFixed(d));

console.log(`\n[최종 점수]  (${ms} ms / ${f(ms / N_PAIRS, 4)} ms per pair)`);
console.log(
  `  mean ${f(mean)} / sd ${f(sd)} / min ${arr[0]} / p01 ${q(0.01)} / p05 ${q(0.05)} / p25 ${q(0.25)} / ` +
    `p50 ${q(0.5)} / p75 ${q(0.75)} / p95 ${q(0.95)} / p99 ${q(0.99)} / max ${arr[arr.length - 1]}`,
);
console.log('  ← C18 §6.3  mean 67.67 / sd 13.51 / min 32 / p01 35 / p05 45 / p25 59 / p50 68 / p75 77 / p95 89 / p99 95 / max 99');

console.log('\n[5점 구간 히스토그램]');
for (let lo = 30; lo < 100; lo += 5) {
  const n = arr.filter((v) => v >= lo && v < lo + 5).length;
  const pct = (n / N_PAIRS) * 100;
  console.log(`  ${lo}~${lo + 5}  ${String(n).padStart(6)}  ${f(pct).toString().padStart(5)}%  ${'#'.repeat(Math.round(pct))}`);
}

console.log('\n[등급 분포]  (좌: 실측 / 우: C18 §6.3)');
let maxAbsDiff = 0;
for (const b of params.BANDS) {
  const n = bandCount.get(b.tag) ?? 0;
  const pct = n / N_PAIRS;
  const diff = (pct - b.observed) * 100;
  maxAbsDiff = Math.max(maxAbsDiff, Math.abs(diff));
  console.log(
    `  ${b.tag.padEnd(3)} ${b.name.padEnd(12)} ${String(n).padStart(6)}  ${f(pct * 100).toString().padStart(6)}%` +
      `   ← ${f(b.observed * 100)}%   Δ ${diff >= 0 ? '+' : ''}${f(diff)}%p`,
  );
}
console.log(`\n최대 등급비율 편차: ${f(maxAbsDiff)}%p`);
