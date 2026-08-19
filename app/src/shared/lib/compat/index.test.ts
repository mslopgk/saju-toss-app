import { describe, expect, it } from 'vitest';
import { computeChart, type Chart, type Gender } from '../saju';
import { computeCompatibility } from './index';
import { BANDS, MBTI_TYPE_ORDER } from './params';
import type { CompatBloodType, CompatProfile } from './types';

const chartOf = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  gender: Gender,
): Chart =>
  computeChart({
    calendarType: 'solar',
    year,
    month,
    day,
    hour,
    minute,
    timeUnknown: false,
    gender,
    birthPlace: { region: 'KR' },
  });

const A = chartOf(1990, 5, 15, 10, 30, 'M');
const B = chartOf(1992, 11, 3, 22, 10, 'F');
const PA: CompatProfile = { mbti: 'ENFP', blood: 'O' };
const PB: CompatProfile = { mbti: 'INFJ', blood: 'A' };

/** 결정론 스윕용 고정 시드 난수. `Math.random()` 은 계산 경로 밖에서도 쓰지 않는다 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('computeCompatibility — 결정론 순수함수', () => {
  it('같은 입력이면 같은 출력이다 (JSON 전량 동일, 200회)', () => {
    const first = JSON.stringify(computeCompatibility(A, B, PA, PB));
    for (let i = 0; i < 200; i++) {
      expect(JSON.stringify(computeCompatibility(A, B, PA, PB))).toBe(first);
    }
  });

  it('두 사람의 순서를 바꿔도 점수·등급·백분위가 같다 (C08 TV-07 교환대칭)', () => {
    const ab = computeCompatibility(A, B, PA, PB);
    const ba = computeCompatibility(B, A, PB, PA);
    expect(ba.score).toBe(ab.score);
    expect(ba.band.tag).toBe(ab.band.tag);
    expect(ba.percentile).toBeCloseTo(ab.percentile, 12);
    expect(ba.combined).toBeCloseTo(ab.combined, 12);
    expect(ba.saju.total).toBeCloseTo(ab.saju.total, 12);
  });

  it('시각(대운·세운)에 의존하지 않는다 — 원국만 본다 (C00 §3-H10)', () => {
    // 결과 객체 어디에도 연·월·일 같은 시간 축이 없다. 있으면 캐시 키가 날마다 갈린다.
    const r = computeCompatibility(A, B, PA, PB);
    expect(JSON.stringify(r)).not.toMatch(/asOf|today|now/i);
  });

  it('사주 6항목의 합이 saju.total 이고 각 항목이 cap 안에 있다', () => {
    const r = computeCompatibility(A, B, PA, PB);
    const sum = r.saju.items.reduce((acc, it) => acc + it.score, 0);
    expect(sum).toBeCloseTo(r.saju.total, 12);
    for (const it of r.saju.items) {
      expect(it.score, it.id).toBeGreaterThanOrEqual(0);
      expect(it.score, it.id).toBeLessThanOrEqual(it.cap);
    }
  });

  it('축 기여도의 합이 combined 이고 가중치 합이 1이다', () => {
    const r = computeCompatibility(A, B, PA, PB);
    const contribution = Object.values(r.contributions).reduce((a, b) => a + b, 0);
    expect(contribution).toBeCloseTo(r.combined, 12);
    const weight = Object.values(r.axes).reduce((a, ax) => a + ax.weight, 0);
    expect(weight).toBeCloseTo(1, 12);
  });
});

describe('자기신고 미입력', () => {
  const NONE: CompatProfile = { mbti: null, blood: null };

  it('MBTI 를 모르면 축이 빠지고 가중치가 재분배된다', () => {
    const r = computeCompatibility(A, B, { mbti: null, blood: 'O' }, PB);
    expect(r.mbti).toBeNull();
    expect(r.axes.mbti.present).toBe(false);
    expect(r.axes.mbti.weight).toBe(0);
    expect(r.contributions.mbti).toBe(0);
    expect(r.axes.saju.weight + r.axes.zodiac.weight + r.axes.blood.weight).toBeCloseTo(1, 12);
  });

  it('한쪽만 알아도 축은 빠진다 — 둘이 있어야 비교가 성립한다', () => {
    expect(computeCompatibility(A, B, PA, { mbti: null, blood: 'A' }).mbti).toBeNull();
    expect(computeCompatibility(A, B, PA, { mbti: 'INFJ', blood: null }).blood).toBeNull();
  });

  it('둘 다 모르면 사주+별자리만으로 계산하고 여전히 32~99 다', () => {
    const r = computeCompatibility(A, B, NONE, NONE);
    expect(r.mbti).toBeNull();
    expect(r.blood).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(32);
    expect(r.score).toBeLessThanOrEqual(99);
    expect(r.axes.saju.weight).toBeCloseTo(0.5 / 0.7, 12);
  });
});

describe('같은 사주끼리 (C08 TV-03)', () => {
  it('완전히 같은 원국이어도 만점이 아니다 — 같은 결핍을 공유하므로 S3 가 최저다', () => {
    const r = computeCompatibility(A, A, PA, PA);
    expect(r.score).toBeLessThan(99);
    const s3 = r.saju.items.find((it) => it.id === 'S3')!;
    // improve = 0, fill = 0 → base 그대로
    expect(s3.score).toBeCloseTo(8, 9);
    expect(r.saju.complementedElements).toEqual([]);
  });

  it('같은 원국의 S1/S2/S5/S6 은 비화·동일 경로를 탄다', () => {
    const r = computeCompatibility(A, A, PA, PA);
    expect(r.saju.items.find((it) => it.id === 'S1')!.reasons).toEqual(['비화']);
    expect(r.saju.items.find((it) => it.id === 'S2')!.reasons).toEqual(['동일']);
    expect(r.saju.crossTenGods).toEqual(['비견', '비견']);
  });
});

describe('스윕 (고정 시드 · 3,000쌍)', () => {
  const rnd = mulberry32(20260813);
  const randInt = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const BLOOD: CompatBloodType[] = ['A', 'B', 'O', 'AB'];

  const pool = Array.from({ length: 240 }, () => {
    const gender: Gender = rnd() < 0.5 ? 'M' : 'F';
    return {
      chart: chartOf(randInt(1935, 2020), randInt(1, 12), randInt(1, 28), randInt(0, 23), randInt(0, 59), gender),
      profile: {
        mbti: rnd() < 0.15 ? null : MBTI_TYPE_ORDER[randInt(0, 15)]!,
        blood: rnd() < 0.15 ? null : BLOOD[randInt(0, 3)]!,
      } satisfies CompatProfile,
    };
  });

  const results = Array.from({ length: 3000 }, () => {
    const a = pool[randInt(0, pool.length - 1)]!;
    const b = pool[randInt(0, pool.length - 1)]!;
    return computeCompatibility(a.chart, b.chart, a.profile, b.profile);
  });

  it('전 결과가 32~99 정수이고 NaN 이 없다', () => {
    for (const r of results) {
      expect(Number.isInteger(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(32);
      expect(r.score).toBeLessThanOrEqual(99);
      expect(Number.isFinite(r.combined)).toBe(true);
      expect(Number.isFinite(r.percentile)).toBe(true);
      expect(Number.isFinite(r.saju.total)).toBe(true);
    }
  });

  it('사주 총점이 0~100 안이고 C08 §3.8 실측 범위(29.07~96.37) 근처다', () => {
    const totals = results.map((r) => r.saju.total);
    expect(Math.min(...totals)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...totals)).toBeLessThanOrEqual(100);
    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    expect(mean).toBeGreaterThan(55);
    expect(mean).toBeLessThan(65);
  });

  it('한쪽 등급에 쏠리지 않는다 — 최빈 등급이 40% 를 넘지 않는다', () => {
    const count = new Map<string, number>();
    for (const r of results) count.set(r.band.tag, (count.get(r.band.tag) ?? 0) + 1);
    const top = Math.max(...count.values());
    expect(top / results.length).toBeLessThan(0.4);
    // 흔한 6등급(S·D 제외)은 3,000쌍이면 반드시 나온다
    for (const b of BANDS.filter((x) => x.observed >= 0.02)) {
      expect(count.get(b.tag) ?? 0, b.tag).toBeGreaterThan(0);
    }
  });

  it('등급은 점수의 함수다 — 같은 점수가 다른 등급을 받지 않는다', () => {
    const byScore = new Map<number, string>();
    for (const r of results) {
      const seen = byScore.get(r.score);
      if (seen === undefined) byScore.set(r.score, r.band.tag);
      else expect(r.band.tag).toBe(seen);
    }
  });
});
