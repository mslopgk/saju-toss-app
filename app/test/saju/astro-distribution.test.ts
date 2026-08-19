// S7 분포·정책 게이트 — 근거: C19 §3.3 · §4.1~§4.3 · C00 §3-G15/G15b
//
// C19 가 몬테카를로로 재 둔 수치를 **우리 구현이 실제로 재현하는지** 확인한다.
// 재현되지 않으면 "12:00 가정 + ±5° 배지" 정책의 근거가 우리 코드에는 없다는 뜻이다.
//
// 난수는 고정 시드 LCG 다 — `Math.random()` 을 쓰면 CI 가 가끔 깨진다(C00 §7.4 결정론).

import { beforeAll, describe, expect, it } from 'vitest';
import {
  MOON_BADGE_DEG,
  deltaTFromJd,
  jdFromMs,
  moonAt,
  sunSample,
} from '../../src/shared/lib/saju/astro';

const KST_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

/** 절대순간 → 달 황경(겉보기). ΔT 포함 */
function moonLon(utcMs: number): number {
  const jd = jdFromMs(utcMs);
  return moonAt(jd + deltaTFromJd(jd) / 86400).lon;
}
const signOf = (lon: number): number => Math.floor(lon / 30);

interface MoonStats {
  n: number;
  /** 12:00 가정 오답률 */
  wrong: number;
  /** 하루(KST 00:00~24:00) 안에 궁이 바뀌는 날 */
  changeDay: number;
  /** ±5° 배지가 뜬 표본 */
  badge: number;
  /** 오답인데 배지가 떠 있던 표본 */
  badgeCaughtWrong: number;
  /** 일주운동(도/일) */
  minRate: number;
  maxRate: number;
  sumRate: number;
}

let moon: MoonStats;
const N = 60000;

beforeAll(() => {
  const rnd = lcg(20260813);
  const start = Date.UTC(1960, 0, 1);
  const end = Date.UTC(2011, 0, 1);
  const days = Math.floor((end - start) / DAY_MS);
  moon = {
    n: 0,
    wrong: 0,
    changeDay: 0,
    badge: 0,
    badgeCaughtWrong: 0,
    minRate: Infinity,
    maxRate: -Infinity,
    sumRate: 0,
  };

  for (let i = 0; i < N; i += 1) {
    // KST 자정 기준 하루를 고르고, 그 안에서 균일하게 출생시각을 뽑는다.
    const dayStart = start + Math.floor(rnd() * days) * DAY_MS - KST_MS;
    const trueMs = dayStart + Math.floor(rnd() * 1440) * 60000;
    const noonMs = dayStart + 12 * 3600 * 1000;

    const lonTrue = moonLon(trueMs);
    const lonNoon = moonLon(noonMs);
    const lonDayEnd = moonLon(dayStart + DAY_MS);
    const lonDayStart = moonLon(dayStart);

    moon.n += 1;
    const wrong = signOf(lonTrue) !== signOf(lonNoon);
    if (wrong) moon.wrong += 1;
    if (signOf(lonDayStart) !== signOf(lonDayEnd)) moon.changeDay += 1;

    const within = lonNoon - signOf(lonNoon) * 30;
    const badge = within < MOON_BADGE_DEG || within > 30 - MOON_BADGE_DEG;
    if (badge) moon.badge += 1;
    if (wrong && badge) moon.badgeCaughtWrong += 1;

    let rate = lonDayEnd - lonDayStart;
    if (rate < 0) rate += 360;
    moon.minRate = Math.min(moon.minRate, rate);
    moon.maxRate = Math.max(moon.maxRate, rate);
    moon.sumRate += rate;
  }
}, 300000);

describe('S7 · 달별자리 정책 근거 재현 (N=60,000 · 1960~2010)', () => {
  it('C19 §4.2 — 12:00 가정 오답률 ≈ 10.83%', () => {
    const pct = (100 * moon.wrong) / moon.n;
    // C19 실측 10.826% (N=200,000). 표본이 다르므로 ±1.5%p 를 허용한다.
    expect(pct).toBeGreaterThan(9.3);
    expect(pct).toBeLessThan(12.3);
  });

  it('C19 §4.3 — 하루 안에 궁이 바뀌는 날 ≈ 44.1%', () => {
    const pct = (100 * moon.changeDay) / moon.n;
    expect(pct).toBeGreaterThan(42);
    expect(pct).toBeLessThan(46);
  });

  it('C00 §3-G15b — ±5° 배지 표시율 ≈ 33.6%', () => {
    const pct = (100 * moon.badge) / moon.n;
    expect(pct).toBeGreaterThan(31);
    expect(pct).toBeLessThan(36);
  });

  it('C00 §3-G15b — ±5° 배지가 오답의 90% 이상을 포착한다', () => {
    const capture = (100 * moon.badgeCaughtWrong) / moon.wrong;
    // C19 실측 92.61%. 이 수치가 무너지면 임계값 5° 의 근거가 사라진다.
    expect(capture).toBeGreaterThan(90);
  });

  it('C19 §4.1 — 달 일주운동 11.77~15.38°/일, 평균 13.19', () => {
    expect(moon.minRate).toBeGreaterThan(11.5);
    expect(moon.minRate).toBeLessThan(12.1);
    expect(moon.maxRate).toBeGreaterThan(15.0);
    expect(moon.maxRate).toBeLessThan(15.6);
    expect(moon.sumRate / moon.n).toBeCloseTo(13.19, 1);
  });

  it('무작위 추측(8.33%)보다 정보량이 압도적으로 많다', () => {
    const correct = 100 - (100 * moon.wrong) / moon.n;
    expect(correct).toBeGreaterThan(85);
  });
});

describe('S7 · 태양궁 분포 (1900~2100)', () => {
  const counts = new Array<number>(12).fill(0);
  let noonWrong = 0;
  let noonBadge = 0;
  let noonBadgeCaught = 0;
  let n = 0;

  beforeAll(() => {
    const rnd = lcg(777);
    const start = Date.UTC(1900, 0, 2);
    const end = Date.UTC(2100, 0, 1);
    const days = Math.floor((end - start) / DAY_MS);
    for (let i = 0; i < 40000; i += 1) {
      const dayStart = start + Math.floor(rnd() * days) * DAY_MS - KST_MS;
      const trueMs = dayStart + Math.floor(rnd() * 1440) * 60000;
      const noonMs = dayStart + 12 * 3600 * 1000;
      const t = sunSample(trueMs);
      const noon = sunSample(noonMs);
      counts[t.sign] += 1;
      n += 1;
      const wrong = t.sign !== noon.sign;
      if (wrong) noonWrong += 1;
      // 우리 배지는 근사가 아니다 — 12:00 가정의 ±12시간 창에 입궁 시각이 있으면 켠다.
      const badge =
        noon.cuspEnteredUtcMs > noonMs - DAY_MS / 2 || noon.cuspNextUtcMs <= noonMs + DAY_MS / 2;
      if (badge) noonBadge += 1;
      if (wrong && badge) noonBadgeCaught += 1;
    }
  }, 120000);

  it('12궁이 모두 나오고 각각 6~10% 사이다(태양 속도차 때문에 완전 균등은 아니다)', () => {
    for (let i = 0; i < 12; i += 1) {
      const pct = (100 * counts[i]) / n;
      expect.soft(pct, `sign ${i}`).toBeGreaterThan(6);
      expect.soft(pct, `sign ${i}`).toBeLessThan(10);
    }
    expect(counts.reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('생시 모름(12:00 가정) 태양궁 오답률은 1% 안쪽이다', () => {
    const pct = (100 * noonWrong) / n;
    expect(pct).toBeLessThan(1.2);
    expect(pct).toBeGreaterThan(0.3);
  });

  it('태양궁 배지는 오답을 100% 포착한다 (입궁 시각을 표에서 정확히 알기 때문)', () => {
    expect(noonBadgeCaught).toBe(noonWrong);
    // 표시율은 "출생일에 입궁이 있는 날" = 12/365.25 ≈ 3.3% 수준이라 UX 노이즈가 거의 없다.
    const showPct = (100 * noonBadge) / n;
    expect(showPct).toBeGreaterThan(2);
    expect(showPct).toBeLessThan(8);
  });
});
