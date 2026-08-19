// compat-calib.json 생성기 — 궁합 정규화 상수(POP)와 101분위 ECDF 그리드를 **본 구현체로 실측**한다.
//
// 근거: C00 §S8-3 (`p = ecdf(combined)` — 101분위 그리드 선형보간) / C18 §6.2~§6.4.
//
// ## 왜 C18 의 상수를 그대로 쓰지 않는가
// C18 은 POP(모집단 mu/sd)은 공개했지만 **ECDF 그리드(`calib.json`)는 공개하지 않았다.** 그리고
// C18 §6.4 의 분포 불변 정리는 "`ecdf` 를 **그 조합 자신의** 경험분포로 재적합했을 때"만 성립한다.
// 재적합하지 않으면 등급 비율이 C18 §6.3 표와 어긋난다. 그래서 여기서 다시 측정한다.
// POP 도 같은 실행에서 함께 측정한다 — z2p 의 mu/sd 가 실제 분포와 어긋나면 축 사이 실효 가중이
// 50/20/20/10 에서 밀린다. 측정값과 C18 값의 차이는 아래 리포트가 그대로 찍는다.
//
// ## 결정론
// `Math.random()` 을 쓰지 않는다. mulberry32 + 고정 시드다. 같은 시드 → 같은 파일이 나온다.
//
// ## 의존
// TS 엔진을 노드에서 그대로 부르려고 `jiti` 를 쓴다. **`package.json` 에 직접 선언돼 있지 않고**
// `vite`(devDependency)의 직접 의존으로 딸려 온다(vite 가 TS 설정 파일을 읽는 데 쓴다).
// 지금은 `node_modules/jiti` 에 실재하지만, vite 메이저가 바뀌며 사라지면 이 생성기만 깨진다
// (런타임·빌드는 영향 없다). 그때는 `npm i -D jiti` 한 줄이면 된다.
//
// 실행: node src/shared/data/tools/gen-compat-calib.mjs [--pairs 100000] [--charts 20000] [--write]
//       (`--write` 없이 돌리면 측정만 하고 파일을 건드리지 않는다)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../../../..');
const OUT = path.join(APP_ROOT, 'src/shared/data/compat-calib.json');

const jiti = createJiti(path.join(APP_ROOT, 'noop.js'));
const engine = jiti('./src/shared/lib/saju/index.ts');
const compatSaju = jiti('./src/shared/lib/compat/saju.ts');
const compatSub = jiti('./src/shared/lib/compat/subsystems.ts');
const compatParams = jiti('./src/shared/lib/compat/params.ts');
const compatNorm = jiti('./src/shared/lib/compat/normalize.ts');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i < 0 ? fallback : Number(argv[i + 1]);
};
const SEED = argOf('--seed', 20260813);
const N_PAIRS = argOf('--pairs', 100_000);
const N_CHARTS = argOf('--charts', 20_000);
const WRITE = argv.includes('--write');
const VERSION = '1.0.0';

// ── 결정론 난수 (mulberry32) ──────────────────────────────────────────────
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
const pick = (arr) => arr[randInt(0, arr.length - 1)];

// C18 §6.1 시뮬 조건: MBTI 16타입 균등 / 혈액형 A34 B27 O28 AB11 (한국 인구비)
const MBTI = compatParams.MBTI_TYPE_ORDER;
const BLOOD_POP = [
  ['A', 34],
  ['B', 27],
  ['O', 28],
  ['AB', 11],
];
const BLOOD_CUM = (() => {
  let acc = 0;
  return BLOOD_POP.map(([t, w]) => [t, (acc += w)]);
})();
function randBlood() {
  const r = rnd() * 100;
  for (const [t, c] of BLOOD_CUM) if (r < c) return t;
  return 'AB';
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function randomPerson() {
  const year = randInt(1930, 2020);
  const month = randInt(1, 12);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDay = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1];
  const day = randInt(1, maxDay);
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
  return {
    chart,
    side: compatSaju.makeSajuSide(chart.pillars, chart.strength),
    gender,
    mbti: pick(MBTI),
    blood: randBlood(),
  };
}

// ── 통계 헬퍼 ─────────────────────────────────────────────────────────────
const stat = (xs) => {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
};
const f = (v, d = 3) => Number(v.toFixed(d));
/** 정렬된 배열의 p 분위 (선형보간). numpy 기본과 같은 정의 */
function quantile(sorted, p) {
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

// ── 1) 원국 풀 ────────────────────────────────────────────────────────────
console.log(`seed=${SEED} charts=${N_CHARTS} pairs=${N_PAIRS}`);
const t0 = Date.now();
const pool = [];
for (let i = 0; i < N_CHARTS; i++) {
  pool.push(randomPerson());
  if ((i + 1) % 5000 === 0) console.log(`  charts ${i + 1}/${N_CHARTS} (${Date.now() - t0} ms)`);
}
console.log(`원국 풀 ${pool.length}개 / ${Date.now() - t0} ms`);

// ── 2) 쌍 표본 ────────────────────────────────────────────────────────────
const rawSaju = new Float64Array(N_PAIRS);
const rawZodiac = new Float64Array(N_PAIRS);
const rawMbti = new Float64Array(N_PAIRS);
const rawBlood = new Float64Array(N_PAIRS);
const itemScores = { S1: [], S2: [], S3: [], S4: [], S5: [], S6: [] };

const t1 = Date.now();
for (let i = 0; i < N_PAIRS; i++) {
  const a = pool[randInt(0, pool.length - 1)];
  let b = pool[randInt(0, pool.length - 1)];
  while (b === a) b = pool[randInt(0, pool.length - 1)];

  const s = compatSaju.scoreSaju(a.side, b.side);
  rawSaju[i] = s.total;
  for (const it of s.items) itemScores[it.id].push(it.score);
  rawZodiac[i] = compatSub.scoreZodiac(a.chart.astro.sun.sign, b.chart.astro.sun.sign).score;
  rawMbti[i] = compatSub.scoreMbti(a.mbti, b.mbti).score;
  rawBlood[i] = compatSub.scoreBlood(a.blood, b.blood, a.gender, b.gender).score;
}
console.log(`쌍 ${N_PAIRS}개 / ${Date.now() - t1} ms`);

// ── 3) 항목·축 분포 ───────────────────────────────────────────────────────
console.log('\n[사주 6항목]  (C08 §3.8 / C18 §8.1 재실행 대조)');
const C08_ITEM = {
  S1: '20 | 13.32 / 4.91',
  S2: '20 | 10.19 / 5.21',
  S3: '20 | 12.11 / 3.01',
  S4: '15 |  9.14 / 2.45',
  S5: '15 | 10.41 / 2.71',
  S6: '10 |  5.14 / 2.40',
};
for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
  const st = stat(itemScores[id]);
  console.log(
    `  ${id}  mean ${f(st.mean, 2).toString().padStart(6)}  sd ${f(st.sd, 2).toString().padStart(5)}` +
      `  min ${f(st.min, 2).toString().padStart(6)}  max ${f(st.max, 2).toString().padStart(6)}   ← C18 ${C08_ITEM[id]}`,
  );
}

const axisArrays = { saju: rawSaju, zodiac: rawZodiac, mbti: rawMbti, blood: rawBlood };
const pop = {};
console.log('\n[축별 모집단 상수 POP]  (좌: 본 구현체 실측 / 우: C18 §6.2)');
const C18POP = compatParams.POP_C18;
const C18KEY = { saju: 'saju', zodiac: 'zodiac_MB', mbti: 'mbti_v3', blood: 'blood_ours' };
for (const axis of ['saju', 'zodiac', 'mbti', 'blood']) {
  const xs = Array.from(axisArrays[axis]);
  const st = stat(xs);
  pop[axis] = [f(st.mean), f(st.sd)];
  const ref = C18POP[C18KEY[axis]];
  console.log(
    `  ${axis.padEnd(7)} mu ${f(st.mean, 3).toString().padStart(7)}  sd ${f(st.sd, 3).toString().padStart(7)}` +
      `   ← C18 ${ref[0]} / ${ref[1]}   Δmu ${f(st.mean - ref[0], 3)}  Δsd ${f(st.sd - ref[1], 3)}`,
  );
}

// ── 4) combined → ECDF 그리드 (자기신고 조합마다 따로) ────────────────────
//
// ⚠ 그리드가 **4벌**인 이유. C18 §6.4 분포 불변 정리는 "`ecdf` 를 **그 가중치 조합 자신의**
//   경험분포로 재적합했을 때" 성립한다. MBTI·혈액형은 미입력이 정상값이라 가중치가
//   50/20/20/10 → 50/20/·/10 → 50/20/20/· → 50/20 네 가지로 갈리고, 축이 줄면 평균화가
//   덜 돼 combined 의 분산이 커진다. 그리드 한 벌을 돌려쓰면 그 조합의 최종 점수 분포가
//   통째로 늘어난다 — 실측: 둘 다 미입력일 때 sd 13.4 → 17.3, S등급 2.67% → 8.18%.
const AXIS_SETS = [
  { key: 'saju+zodiac+mbti+blood', mbti: true, blood: true },
  { key: 'saju+zodiac+mbti', mbti: true, blood: false },
  { key: 'saju+zodiac+blood', mbti: false, blood: true },
  { key: 'saju+zodiac', mbti: false, blood: false },
];

const ecdfGrids = {};
const combinedStats = {};
console.log('\n[combined]  자기신고 조합별 (C18 §6.7 기준선 sd 10.682 는 전축 입력 기준)');
for (const set of AXIS_SETS) {
  const weights = compatNorm.redistributeWeights({
    saju: true,
    zodiac: true,
    mbti: set.mbti,
    blood: set.blood,
  });
  const combined = new Float64Array(N_PAIRS);
  for (let i = 0; i < N_PAIRS; i++) {
    let c =
      weights.saju * compatNorm.z2p(rawSaju[i], pop.saju[0], pop.saju[1]) +
      weights.zodiac * compatNorm.z2p(rawZodiac[i], pop.zodiac[0], pop.zodiac[1]);
    if (set.mbti) c += weights.mbti * compatNorm.z2p(rawMbti[i], pop.mbti[0], pop.mbti[1]);
    if (set.blood) c += weights.blood * compatNorm.z2p(rawBlood[i], pop.blood[0], pop.blood[1]);
    combined[i] = c;
  }
  const sorted = Array.from(combined).sort((x, y) => x - y);
  const grid = [];
  for (let i = 0; i <= 100; i++) grid.push(f(quantile(sorted, i / 100), 6));
  for (let i = 1; i <= 100; i++) {
    if (grid[i] < grid[i - 1]) throw new Error(`ECDF 그리드가 단조가 아니다: ${set.key} i=${i}`);
  }
  ecdfGrids[set.key] = grid;
  const st = stat(sorted);
  combinedStats[set.key] = { mean: f(st.mean, 3), sd: f(st.sd, 3), min: f(st.min, 3), max: f(st.max, 3) };
  console.log(
    `  ${set.key.padEnd(24)} w ${f(weights.saju, 3)}/${f(weights.zodiac, 3)}/${f(weights.mbti, 3)}/${f(weights.blood, 3)}` +
      `   mean ${f(st.mean, 3)}  sd ${f(st.sd, 3)}  min ${f(st.min, 2)}  max ${f(st.max, 2)}`,
  );
}
const out = {
  $id: 'compat-calib.json',
  version: VERSION,
  note:
    '궁합 정규화 상수(POP)와 자기신고 조합별 101분위 ECDF 그리드. 본 구현체를 고정 시드로 돌려 **실측**한 값이며, ' +
    'C18 §6.4 분포 불변 정리의 전제(“ecdf 를 그 가중치 조합 자신의 경험분포로 재적합”)를 만족시키기 위해 존재한다. ' +
    '배점(compat-params.json)이나 S3/S4 정책(compat-params-ext.json)을 바꾸면 반드시 다시 구워야 한다.',
  generator: 'src/shared/data/tools/gen-compat-calib.mjs',
  meta: {
    seed: SEED,
    charts: N_CHARTS,
    pairs: N_PAIRS,
    engineVersion: engine.ENGINE_VERSION,
    paramsVersion: compatParams.COMPAT_PARAMS_VERSION,
    paramsExtVersion: compatParams.COMPAT_PARAMS_EXT_VERSION,
    birthYearRange: [1930, 2020],
    mbtiDistribution: 'uniform-16',
    bloodDistribution: 'KR A34/B27/O28/AB11',
    popC18Delta: Object.fromEntries(
      ['saju', 'zodiac', 'mbti', 'blood'].map((axis) => {
        const ref = C18POP[C18KEY[axis]];
        return [axis, { dMu: f(pop[axis][0] - ref[0], 3), dSd: f(pop[axis][1] - ref[1], 3) }];
      }),
    ),
    combined: combinedStats,
    sajuItems: Object.fromEntries(
      Object.entries(itemScores).map(([k, v]) => {
        const st = stat(v);
        return [k, { mean: f(st.mean), sd: f(st.sd), min: f(st.min), max: f(st.max) }];
      }),
    ),
  },
  pop,
  ecdf: ecdfGrids,
};

if (WRITE) {
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\n→ ${OUT} (${fs.statSync(OUT).size} B)`);
} else {
  console.log('\n(--write 없음: 파일을 쓰지 않았다)');
}
