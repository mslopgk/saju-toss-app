/**
 * S8-1 — 사주 궁합 100점 배점.
 *
 * 근거: C00 §S8-1 (S1~S6 · (a) 가감표 · (a-2) 용신은 C05-STD 호출) / C08 §3 / C18 §2.
 *
 * 배점·가감값은 **전부** `compat-params.json` 에서 읽는다. 이 파일에 숫자가 있으면 그건 버그다.
 */

import { tenGod } from '../saju/ten-gods';
import { ELEMENTS } from '../saju/strength';
import type { Element, FourPillars, Stem, StrengthChart, TenGod } from '../saju/types';
import {
  addVectors,
  coefficientOfVariation,
  compatElementVector,
  vectorTotal,
  type ElementVector,
} from './elements';
import {
  S1,
  S1_LOOKUP,
  S2,
  S2_DELTA,
  S3,
  S3_EXT,
  S4,
  S4_EXT,
  S5,
  S5_LOOKUP,
  S6,
  S6_DELTA,
} from './params';
import { branchPairHwa, branchPairKinds, elementOfStem, stemHeName, stemPairKind } from './relations';
import type { CompatSajuDetail, CompatSajuItem } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** 화면 라벨. 배점이 아니라 문구라 데이터 파일에 두지 않는다 */
const LABEL = {
  S1: '일간 합충',
  S2: '일지 합충',
  S3: '오행 상보성',
  S4: '용신 충족도',
  S5: '십신 교차',
  S6: '띠(년지) 궁합',
} as const;

/** 한 사람 몫으로 미리 접어 둔 값. 두 사람을 여러 번 비교할 때 원국을 다시 훑지 않는다 */
export interface CompatSajuSide {
  readonly pillars: FourPillars;
  readonly strength: StrengthChart;
  readonly vector: ElementVector;
}

export function makeSajuSide(pillars: FourPillars, strength: StrengthChart): CompatSajuSide {
  return { pillars, strength, vector: compatElementVector(pillars) };
}

// ── S1 일간 합충 (20) ─────────────────────────────────────────────────────
export function scoreS1(a: Stem, b: Stem): CompatSajuItem {
  const kind = stemPairKind(a, b);
  const score = S1_LOOKUP[kind]!;
  return { id: 'S1', label: LABEL.S1, cap: S1.cap, score, reasons: [kind] };
}

// ── S2 일지 합충 (20) ─────────────────────────────────────────────────────
/**
 * base ± 가감, clamp[0,20]. 성립하는 관계를 **전부** 더한다 (C00 §3-H2).
 *
 * ⚠ C08 §3.3 이 실은 12×12 표는 이 규칙과 10쌍에서 어긋난다(예: 未戌 이 형−5 만 받고 파−2 를
 *   빠뜨렸고, 子丑 이 육합+방합 21→clamp 20 이 아니라 18 이며, 그 표의 최댓값은 19 다).
 *   같은 문서 §3.8 의 **시뮬 실측**은 max 20 / mean 10.16 / sd 5.24 이고 C18 §8.1 재실행도
 *   10.19 / 5.21 / max 20 이라, 규칙 쪽이 정본이고 그 표가 산출물 오류다. 이 구현은 규칙을 따르며
 *   `saju.table.test.ts` 가 두 표를 모두 대조해 그 사실을 못박는다.
 */
export function scoreS2(a: string, b: string): CompatSajuItem {
  const kinds = branchPairKinds(a as never, b as never);
  const raw = kinds.reduce((sum, k) => sum + (S2_DELTA[k] ?? 0), S2.base);
  return {
    id: 'S2',
    label: LABEL.S2,
    cap: S2.cap,
    score: clamp(raw, S2.clamp[0]!, S2.clamp[1]!),
    reasons: kinds,
  };
}

// ── S3 오행 상보성 (20) ───────────────────────────────────────────────────
export interface S3Detail {
  readonly item: CompatSajuItem;
  readonly complemented: readonly Element[];
}

/** `clamp(base + improve×improveCoef + fill×fillCoef, 0, cap)` (C08 §3.4) */
export function scoreS3(wa: ElementVector, wb: ElementVector): S3Detail {
  const improve = (coefficientOfVariation(wa) + coefficientOfVariation(wb)) / 2
    - coefficientOfVariation(addVectors(wa, wb));

  const complemented = ELEMENTS.filter(
    (e) =>
      (wa[e] < S3_EXT.deficitThreshold && wb[e] >= S3_EXT.surplusThreshold) ||
      (wb[e] < S3_EXT.deficitThreshold && wa[e] >= S3_EXT.surplusThreshold),
  );

  const raw = S3.base + improve * S3.improveCoef + complemented.length * S3.fillCoef;
  const reasons: string[] = [];
  if (improve > 0) reasons.push('합치면 균형이 좋아짐');
  if (complemented.length > 0) reasons.push(`결핍 보완 ${complemented.join('·')}`);

  return {
    item: { id: 'S3', label: LABEL.S3, cap: S3.cap, score: clamp(raw, 0, S3.cap), reasons },
    complemented,
  };
}

// ── S4 용신 충족도 (15) ───────────────────────────────────────────────────
/**
 * `clamp((oneWay(A,B) + oneWay(B,A)) × scaleCoef, 0, 15)` (C08 §3.5).
 *
 * 억부·조후는 **C05-STD 엔진이 이미 낸 값**을 읽는다 (C00 §S8-1 a-2 / §3-H4). C08 §3.5 가
 * 들고 있던 saju-engine 이식판(자리가중 신강신약 + 월지 계절 조후)은 폐기됐다.
 */
function oneWay(mine: StrengthChart, partnerVector: ElementVector): number {
  const total = vectorTotal(partnerVector);
  if (total <= 0) return 0;

  const ranks = S4.rankWeights;
  const favorable = mine.yongsin.favorable.slice(0, ranks.length);
  let sc = 0;
  for (let i = 0; i < favorable.length; i++) {
    sc += (partnerVector[favorable[i]!] / total) * ranks[i]!;
  }

  const johu = johuElementOf(mine, favorable);
  if (johu !== null) sc += (partnerVector[johu] / total) * S4.johuWeight;
  return sc;
}

/** `compat-params-ext.json > S4_yongsinFulfillment.johuPolicy` 가 정본 */
function johuElementOf(mine: StrengthChart, favorable: readonly Element[]): Element | null {
  if (S4_EXT.johuPolicy === 'NEVER') return null;
  const chars = mine.yongsin.tiaohouChars;
  if (chars.length === 0) return null;
  const element = elementOfStem(chars[0] as Stem);
  if (S4_EXT.johuPolicy === 'TIAOHOU_IF_NEW' && favorable.includes(element)) return null;
  return element;
}

export function scoreS4(a: CompatSajuSide, b: CompatSajuSide): CompatSajuItem {
  const raw = (oneWay(a.strength, b.vector) + oneWay(b.strength, a.vector)) * S4.scaleCoef;
  const reasons = [
    `${a.strength.yongsin.primary} 용신`,
    `${b.strength.yongsin.primary} 용신`,
  ];
  return { id: 'S4', label: LABEL.S4, cap: S4.cap, score: clamp(raw, 0, S4.cap), reasons };
}

// ── S5 십신 교차 (15) ─────────────────────────────────────────────────────
export interface S5Detail {
  readonly item: CompatSajuItem;
  readonly crossTenGods: readonly [TenGod, TenGod];
}

/** A 일간이 B 일간을 보는 십신 / 그 역. **두 값의 평균** (C08 §3.6) */
export function scoreS5(a: Stem, b: Stem): S5Detail {
  const ab = tenGod(a, b);
  const ba = tenGod(b, a);
  const score = (S5_LOOKUP[ab]! + S5_LOOKUP[ba]!) / 2;
  return {
    item: { id: 'S5', label: LABEL.S5, cap: S5.cap, score, reasons: [ab, ba] },
    crossTenGods: [ab, ba],
  };
}

// ── S6 띠(년지) 궁합 (10) ─────────────────────────────────────────────────
export function scoreS6(a: string, b: string): CompatSajuItem {
  const kinds = branchPairKinds(a as never, b as never).filter((k) => k in S6_DELTA);
  const raw = kinds.reduce((sum, k) => sum + S6_DELTA[k]!, S6.base);
  return {
    id: 'S6',
    label: LABEL.S6,
    cap: S6.cap,
    score: clamp(raw, S6.clamp[0]!, S6.clamp[1]!),
    reasons: kinds,
  };
}

// ── 합계 ──────────────────────────────────────────────────────────────────
export function scoreSaju(a: CompatSajuSide, b: CompatSajuSide): CompatSajuDetail {
  const s1 = scoreS1(a.pillars.day.stem, b.pillars.day.stem);
  const s2 = scoreS2(a.pillars.day.branch, b.pillars.day.branch);
  const s3 = scoreS3(a.vector, b.vector);
  const s4 = scoreS4(a, b);
  const s5 = scoreS5(a.pillars.day.stem, b.pillars.day.stem);
  const s6 = scoreS6(a.pillars.year.branch, b.pillars.year.branch);

  const items = [s1, s2, s3.item, s4, s5.item, s6];
  return {
    total: items.reduce((sum, it) => sum + it.score, 0),
    items,
    dayStems: [a.pillars.day.stem, b.pillars.day.stem],
    dayBranches: [a.pillars.day.branch, b.pillars.day.branch],
    yearBranches: [a.pillars.year.branch, b.pillars.year.branch],
    dayStemHeName: stemHeName(a.pillars.day.stem, b.pillars.day.stem),
    dayBranchHwa: branchPairHwa(a.pillars.day.branch, b.pillars.day.branch),
    crossTenGods: s5.crossTenGods,
    complementedElements: s3.complemented,
    yongsinPrimaries: [a.strength.yongsin.primary, b.strength.yongsin.primary],
  };
}
