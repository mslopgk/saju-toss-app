/**
 * S8 궁합 — 단일 진입점.
 *
 * 근거: C00 §S8 / C08 §11(참조 구현 시그니처) / C18 전문.
 *
 * `computeCompatibility()` 는 **결정론 순수함수**다: 같은 두 차트 + 같은 자기신고 값이면
 * 언제 어디서 불러도 같은 점수·같은 등급이 나온다. `Date.now()`·`Math.random()`·`Intl`·
 * 로컬 타임존을 쓰지 않고, 시기(대운)도 보지 않는다(C00 §3-H10: 원국만, v1).
 *
 * 점수는 여기서 끝난다. 문장 생성기(`features/compat`)는 이 결과를 **읽기만** 한다 —
 * 숫자를 만들거나 고치지 않는다(§S8-4).
 */

import { COMPAT_ENGINE_VERSION } from './params';
import {
  anchorInterp,
  axisSetKeyOf,
  bandOf,
  ecdf,
  redistributeWeights,
  roundHalfUp,
  z2pOf,
} from './normalize';
import { makeSajuSide, scoreSaju } from './saju';
import { scoreBlood, scoreMbti, scoreZodiac } from './subsystems';
import type {
  CompatAxis,
  CompatAxisScore,
  CompatChart,
  CompatProfile,
  CompatResult,
} from './types';

const AXES: readonly CompatAxis[] = ['saju', 'zodiac', 'mbti', 'blood'];

export function computeCompatibility(
  chartA: CompatChart,
  chartB: CompatChart,
  profileA: CompatProfile,
  profileB: CompatProfile,
): CompatResult {
  const sideA = makeSajuSide(chartA.pillars, chartA.strength);
  const sideB = makeSajuSide(chartB.pillars, chartB.strength);

  const saju = scoreSaju(sideA, sideB);
  const zodiac = scoreZodiac(chartA.astro.sun.sign, chartB.astro.sun.sign);
  const mbti = scoreMbti(profileA.mbti, profileB.mbti);
  const blood = scoreBlood(profileA.blood, profileB.blood, chartA.input.gender, chartB.input.gender);

  const raw: Readonly<Record<CompatAxis, number>> = {
    saju: saju.total,
    zodiac: zodiac.score,
    mbti: mbti?.score ?? 0,
    blood: blood?.score ?? 0,
  };
  const present: Readonly<Record<CompatAxis, boolean>> = {
    saju: true,
    zodiac: true,
    mbti: mbti !== null,
    blood: blood !== null,
  };
  const weights = redistributeWeights(present);

  const axes = {} as Record<CompatAxis, CompatAxisScore>;
  const contributions = {} as Record<CompatAxis, number>;
  let combined = 0;
  for (const axis of AXES) {
    const normalized = present[axis] ? z2pOf(axis, raw[axis]) : 0;
    const contribution = weights[axis] * normalized;
    axes[axis] = {
      axis,
      raw: present[axis] ? raw[axis] : 0,
      normalized,
      weight: weights[axis],
      present: present[axis],
    };
    contributions[axis] = contribution;
    combined += contribution;
  }

  // 백분위는 **그 자기신고 조합 자신의** 경험분포로 읽는다 (C18 §6.4 정리의 전제).
  const percentile = ecdf(combined, axisSetKeyOf(present));
  const score = roundHalfUp(anchorInterp(percentile));

  return {
    version: COMPAT_ENGINE_VERSION,
    score,
    band: bandOf(score),
    percentile,
    combined,
    axes,
    saju,
    zodiac,
    mbti,
    blood,
    contributions,
  };
}

export { COMPAT_ENGINE_VERSION, BANDS, WEIGHTS } from './params';
export type { CompatAxisSetKey } from './params';
export { anchorInterp, axisSetKeyOf, bandOf, ecdf, redistributeWeights, z2p, z2pOf } from './normalize';
export { compatElementVector, coefficientOfVariation } from './elements';
export { branchPairKinds, stemHeName, stemPairKind } from './relations';
export { makeSajuSide, scoreS1, scoreS2, scoreS3, scoreS4, scoreS5, scoreS6, scoreSaju } from './saju';
export { scoreBlood, scoreMbti, scoreZodiac } from './subsystems';
export * from './types';
