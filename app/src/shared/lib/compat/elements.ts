/**
 * 궁합 전용 오행 벡터 `w(chart)` 와 변동계수(CV).
 *
 * 근거: C08 §3.4 / C00 §3-H3(부족 오행 = **지장간 가중** < 0.5) / `compat-params-ext.json`.
 *
 * ## 왜 `chart.strength.strength.scores` 를 쓰지 않는가
 *
 * S5(C05-STD)의 오행 점수는 **자리 가중 + 합=80** 체계다. 반면 S3 의 `improveCoef 22` /
 * `fillCoef 2.5` 는 C08 §3.4 의 벡터(천간 1.0 + 지장간 [0.3,0.5,1.0], 합 ≈ 11.2) 위에서
 * 캘리브레이션된 값이다. CV 는 척도무관이라 괜찮지만 **`fill` 의 임계(0.5 / 1.5)는 척도의존**이라,
 * 벡터를 바꾸면 결핍 판정이 통째로 달라진다. 그래서 궁합은 자기 벡터를 따로 만든다.
 *
 * 두 벡터를 헷갈리지 않도록 이름을 `compatElementVector` 로 길게 둔다 — 리포트가 화면에
 * 보여주는 오행 점수는 여전히 S5 값이고, 이 벡터는 **점수를 만들 때만** 쓰이고 노출되지 않는다.
 */

import { HIDDEN_STEMS, STEM_META } from '../saju/constants';
import { ELEMENTS } from '../saju/strength';
import type { Element, FourPillars, Pillar, Stem } from '../saju/types';
import { S3_EXT, S3_HIDDEN_WEIGHTS } from './params';

export type ElementVector = Readonly<Record<Element, number>>;

const ZERO: ElementVector = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };

const elementOf = (stem: string): Element => STEM_META.get(stem as Stem)!.element;

/**
 * 지장간을 [여기, 중기, 정기] 순으로 늘어놓고 실재하는 것만 남긴 뒤 같은 길이의 가중 배열과
 * 자리별로 짝짓는다. 정기가 항상 마지막(=1.0)이다 (`compat-params-ext.json` 의
 * `hiddenStemWeightOrder` 가 정본).
 */
function hiddenStemWeights(branch: string): { stem: string; weight: number }[] {
  const row = HIDDEN_STEMS[branch];
  if (row === undefined) return [];
  const present = [row.여기, row.중기, row.정기].filter((s): s is string => s !== null);
  const weights = S3_HIDDEN_WEIGHTS[String(present.length)];
  if (weights === undefined) return [];
  return present.map((stem, i) => ({ stem, weight: weights[i]! }));
}

/** C08 §3.4 `w(chart)`. 삼주 모드면 시주가 없으므로 3기둥만 더한다 */
export function compatElementVector(pillars: FourPillars): ElementVector {
  const out: Record<Element, number> = { ...ZERO };
  const list: Pillar[] = [pillars.year, pillars.month, pillars.day];
  if (pillars.hour !== null) list.push(pillars.hour);

  for (const p of list) {
    out[elementOf(p.stem)] += S3_EXT.stemWeight;
    for (const { stem, weight } of hiddenStemWeights(p.branch)) {
      out[elementOf(stem)] += weight;
    }
  }
  return out;
}

export function addVectors(a: ElementVector, b: ElementVector): ElementVector {
  return {
    木: a.木 + b.木,
    火: a.火 + b.火,
    土: a.土 + b.土,
    金: a.金 + b.金,
    水: a.水 + b.水,
  };
}

export const vectorTotal = (v: ElementVector): number =>
  ELEMENTS.reduce((sum, e) => sum + v[e], 0);

/**
 * 변동계수 = 불균형도. 모집단 표준편차(n)와 표본 표준편차(n−1) 중 어느 쪽인지는
 * `compat-params-ext.json > S3_elementComplement.cvStdev` 가 정한다 — Python `statistics.stdev`
 * 는 표본이라 C08 원본을 그대로 옮기면 n−1 이고, 그 선택이 S3 분포를 바꾼다.
 */
export function coefficientOfVariation(v: ElementVector): number {
  const n = ELEMENTS.length;
  const mean = vectorTotal(v) / n;
  if (mean === 0) return 0;
  const ss = ELEMENTS.reduce((sum, e) => sum + (v[e] - mean) ** 2, 0);
  const divisor = S3_EXT.cvStdev === 'sample' ? n - 1 : n;
  return Math.sqrt(ss / divisor) / mean;
}
