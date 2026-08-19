/**
 * S8-3 — 정규화 · 가중합 · 분포 보정.
 *
 * 근거: C00 §S8-3 (z2p · POP · combined · ecdf · ANCHOR) / C18 §6.4(분포 불변 정리) · §7 X6.
 *
 * ```
 * z2p(x, mu, sd) = 100 / (1 + exp(−k·(x−mu)/sd)),   k = logisticK   ※ sd < 1e-9 이면 50
 * combined       = Σ wᵢ′ · z2p(rawᵢ)                ※ wᵢ′ = 미입력 축을 뺀 뒤 비례 재분배
 * p              = ecdf(combined)                    ※ 101분위 그리드 선형보간
 * final          = round(interp(ANCHOR, p))          ※ 32 ~ 99
 * ```
 *
 * **분포 불변 정리**(C18 §6.4): `ecdf` 를 그 가중치 조합 자신의 경험분포로 재적합하면
 * `ecdf(combined) ~ U(0,1)` 이므로 최종 점수의 주변분포는 가중치·서브매트릭스와 **무관**하다.
 * 그래서 가중치를 만지는 것은 "점수 분포"가 아니라 **"누가 그 점수를 받는가"(순위)** 를 바꾼다.
 * `compat-calib.json` 의 ECDF 를 본 구현체로 다시 구운 이유가 이것이다 — 재적합하지 않으면
 * 정리의 전제가 깨지고 등급 비율이 C18 §6.3 표와 어긋난다.
 */

import {
  ANCHOR,
  BANDS,
  ECDF_GRIDS,
  LOGISTIC_K,
  POP,
  SD_ZERO_EPSILON,
  WEIGHTS,
  type CompatAxisSetKey,
} from './params';
import type { CompatAxis, CompatBand } from './types';

/** C18 §7 X6 — `sd < 1e-9` 이면 50. 혈액형 균등 매트릭스(BL-1)로 전환하면 그때 발동한다 */
export function z2p(x: number, mu: number, sd: number): number {
  if (!(Math.abs(sd) >= SD_ZERO_EPSILON)) return 50;
  return 100 / (1 + Math.exp((-LOGISTIC_K * (x - mu)) / sd));
}

export function z2pOf(axis: CompatAxis, raw: number): number {
  const [mu, sd] = POP[axis];
  return z2p(raw, mu, sd);
}

/**
 * 미입력 축은 가중치를 나머지에 **비례 재분배**한다 (C00 §S8-3 a).
 * 전 축이 빠지는 일은 없다 — 사주·별자리는 생년월일시만 있으면 항상 나온다.
 */
export function redistributeWeights(
  present: Readonly<Record<CompatAxis, boolean>>,
): Readonly<Record<CompatAxis, number>> {
  const axes: CompatAxis[] = ['saju', 'zodiac', 'mbti', 'blood'];
  const kept = axes.filter((a) => present[a]);
  // 재분배할 것이 없으면 나누지 않는다 — 0.5/0.9999999999999999 = 0.5000000000000001 같은
  // 부동소수 잡음이 전 축 입력(가장 흔한 경로)에 끼는 것을 막는다.
  if (kept.length === axes.length) return WEIGHTS;
  const sum = kept.reduce((acc, a) => acc + WEIGHTS[a], 0);
  const out: Record<CompatAxis, number> = { saju: 0, zodiac: 0, mbti: 0, blood: 0 };
  if (sum <= 0) return out;
  for (const a of kept) out[a] = WEIGHTS[a] / sum;
  return out;
}

/**
 * 자기신고 조합 → ECDF 그리드 키.
 *
 * ⚠ **왜 조합마다 그리드가 따로인가.** C18 §6.4 의 분포 불변 정리는 `ecdf` 를 *그 가중치 조합
 *   자신의* 경험분포로 재적합했을 때만 성립한다. MBTI·혈액형이 빠지면 가중치가 재분배되고,
 *   축이 줄어 평균화가 덜 되므로 `combined` 의 분산이 커진다. 그리드 한 벌을 돌려쓰면 그 조합의
 *   최종 점수가 통째로 벌어진다 — 실측(N=60,000): 둘 다 미입력일 때 최종 sd 13.4 → **17.3**,
 *   S등급 비율 2.67% → **8.18%**. 즉 "MBTI 를 안 적었을 뿐인데 천생연분이 3배" 가 된다.
 */
export function axisSetKeyOf(present: Readonly<Record<CompatAxis, boolean>>): CompatAxisSetKey {
  if (present.mbti && present.blood) return 'saju+zodiac+mbti+blood';
  if (present.mbti) return 'saju+zodiac+mbti';
  if (present.blood) return 'saju+zodiac+blood';
  return 'saju+zodiac';
}

/**
 * 경험적 CDF. `ECDF_GRIDS[key][i]` 는 combined 의 i 백분위 값이므로, 그 사이를 선형보간해
 * 값 → 백분위(0~1)를 되돌린다. 그리드가 평평한 구간(같은 값이 반복)은 왼쪽 끝을 준다 —
 * 그래야 같은 combined 가 항상 같은 백분위를 받는다(결정론).
 */
export function ecdf(x: number, key: CompatAxisSetKey = 'saju+zodiac+mbti+blood'): number {
  const g = ECDF_GRIDS[key];
  const last = g.length - 1;
  if (x <= g[0]!) return 0;
  if (x >= g[last]!) return 1;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const span = g[hi]! - g[lo]!;
  const frac = span <= 0 ? 0 : (x - g[lo]!) / span;
  return (lo + frac) / last;
}

/** ANCHOR 조각별 선형보간. p 는 0~1 */
export function anchorInterp(p: number): number {
  const t = ANCHOR;
  if (p <= t[0]![0]!) return t[0]![1]!;
  const last = t.length - 1;
  if (p >= t[last]![0]!) return t[last]![1]!;
  for (let i = 0; i < last; i++) {
    const [p0, v0] = [t[i]![0]!, t[i]![1]!];
    const [p1, v1] = [t[i + 1]![0]!, t[i + 1]![1]!];
    if (p <= p1) return v0 + ((p - p0) / (p1 - p0)) * (v1 - v0);
  }
  return t[last]![1]!;
}

/** `compat-params-ext.json > final.rounding` = HALF_UP. Python 의 은행가 반올림과 갈리는 지점이다 */
export const roundHalfUp = (v: number): number => Math.round(v);

export function bandOf(score: number): CompatBand {
  for (const b of BANDS) {
    if (score >= b.min) return { tag: b.tag, name: b.name, min: b.min, observed: b.observed };
  }
  const lastBand = BANDS[BANDS.length - 1]!;
  return { tag: lastBand.tag, name: lastBand.name, min: lastBand.min, observed: lastBand.observed };
}
