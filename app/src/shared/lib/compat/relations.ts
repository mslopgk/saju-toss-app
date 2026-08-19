/**
 * 두 사람 사이의 간지 **쌍(pair)** 관계 판정.
 *
 * 근거: C00 §S8-1(a) / C08 §3.2·§3.3·§3.7 / C04 §5~§8 (합충형파해 원본 테이블).
 *
 * `lib/saju/sinsal.ts` 와 판정 대상이 다르다 — 저쪽은 **한 사람의 원국 안** 네 기둥끼리,
 * 여기는 **두 사람의 같은 자리끼리**다. 그래서 결과 타입도 `BranchRelation[]`(어느 기둥인지)이
 * 아니라 관계 이름 배열이다. 표는 둘 다 `tables.json` 한 벌을 읽는다(§F6).
 *
 * ⚠ 관계는 **동시에 여러 개 성립한다.** 巳申 은 육합이면서 형이고 파다(= 10+8−5−2 = 11).
 *   C00 §3-H2 가 원진·해의 독립 적용(子未 −10)을 확정했고, 나머지도 같은 규칙으로 전부 더한다.
 *   "가장 센 것 하나만" 으로 접으면 C08 §3.8 이 실측한 S2 분포(mean 10.16 / sd 5.24 / max 20)가
 *   재현되지 않는다.
 */

import tables from '../../data/tables.json';
import { BRANCHES, STEMS, STEM_META } from '../saju/constants';
import type { Branch, BranchIdx, Element, Stem, StemIdx } from '../saju/types';

const REL = tables.branchRelations.data;
const STEM_REL = tables.stemRelations.data;

const HE_MAP = REL.육합.map as Readonly<Record<string, string>>;
const CHUNG_MAP = REL.육충.map as Readonly<Record<string, string>>;
const HAE_MAP = REL.육해.map as Readonly<Record<string, string>>;
const PA_MAP = REL.육파.map as Readonly<Record<string, string>>;
const WONJIN_MAP = REL.원진.map as Readonly<Record<string, string>>;
const SAMHAP = REL.삼합 as readonly { branches: readonly string[]; hwa: string }[];
const BANGHAP = REL.방합 as readonly { branches: readonly string[]; hwa: string }[];
/** C08 §3.3 의 형 7쌍 = tables.json `상형`. 자형(辰午酉亥)은 **두 사람 사이 관계가 아니다** */
const SANGHYEONG = REL.상형 as readonly (readonly string[])[];

const GAN_HE = STEM_REL.천간합 as readonly { pair: readonly string[]; hwa: string; name: string }[];
const GAN_CHUNG = STEM_REL.천간충 as readonly (readonly string[])[];

/** 오행 상생 (木→火→土→金→水→木). tables.json 에 별도 표가 없어 천간 배열 순서에서 유도한다 */
const GEN: Readonly<Record<Element, Element>> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
/** 오행 상극 (木→土→水→火→金→木) */
const CTRL: Readonly<Record<Element, Element>> = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

export const elementOfStem = (s: Stem): Element => STEM_META.get(s)!.element;
const yinYangOfStem = (s: Stem): string => STEM_META.get(s)!.yinYang;

const linked = (map: Readonly<Record<string, string>>, a: string, b: string): boolean => map[a] === b;
const together = (
  groups: readonly { branches: readonly string[] }[],
  a: string,
  b: string,
): boolean => a !== b && groups.some((g) => g.branches.includes(a) && g.branches.includes(b));
const inPairs = (pairs: readonly (readonly string[])[], a: string, b: string): boolean =>
  pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

// ── 일간(천간) 쌍 ─────────────────────────────────────────────────────────
/** `compat-params.json > saju.S1_dayStem.lookup` 의 키와 **글자 단위로 같아야 한다** */
export type StemPairKind = '천간합' | '천간충' | '동오행음양상보' | '비화' | '상생' | '상극';

/**
 * C08 §3.2 의 분기 순서를 그대로 따른다. 순서가 의미를 갖는다 —
 * 甲己는 상극(木剋土)이면서 천간합이라, 합을 먼저 보지 않으면 8점이 된다.
 */
export function stemPairKind(a: Stem, b: Stem): StemPairKind {
  if (inPairs(GAN_HE.map((h) => h.pair), a, b)) return '천간합';
  if (inPairs(GAN_CHUNG, a, b)) return '천간충';
  const ea = elementOfStem(a);
  const eb = elementOfStem(b);
  if (ea === eb) return yinYangOfStem(a) === yinYangOfStem(b) ? '비화' : '동오행음양상보';
  if (GEN[ea] === eb || GEN[eb] === ea) return '상생';
  if (CTRL[ea] === eb || CTRL[eb] === ea) return '상극';
  // 오행 5개는 같음·상생·상극으로 전부 덮이므로 여기에 닿을 수 없다.
  return '비화';
}

/** 천간합의 원전 명칭("중정지합"). 문장 생성기가 인용한다. 합이 아니면 null */
export function stemHeName(a: Stem, b: Stem): string | null {
  const hit = GAN_HE.find(({ pair }) => inPairs([pair], a, b));
  return hit === undefined ? null : hit.name;
}

// ── 지지 쌍 ───────────────────────────────────────────────────────────────
/** `compat-params.json > saju.S2_dayBranch.delta` / `S6_yearBranch.delta` 의 키와 같다 */
export type BranchPairKind = '육합' | '삼합' | '방합' | '동일' | '충' | '원진' | '해' | '형' | '파';

/**
 * 성립하는 관계를 **전부** 낸다. 순서는 `compat-params.json` 의 delta 키 순서가 아니라
 * 가산 → 감산 순으로 고정한다(화면·문장이 이 순서를 그대로 읽는다).
 */
export function branchPairKinds(a: Branch, b: Branch): BranchPairKind[] {
  const kinds: BranchPairKind[] = [];
  if (linked(HE_MAP, a, b)) kinds.push('육합');
  if (together(SAMHAP, a, b)) kinds.push('삼합');
  if (together(BANGHAP, a, b)) kinds.push('방합');
  if (a === b) kinds.push('동일');
  if (linked(CHUNG_MAP, a, b)) kinds.push('충');
  if (linked(WONJIN_MAP, a, b)) kinds.push('원진');
  if (linked(HAE_MAP, a, b)) kinds.push('해');
  if (inPairs(SANGHYEONG, a, b)) kinds.push('형');
  if (linked(PA_MAP, a, b)) kinds.push('파');
  return kinds;
}

/** 육합/삼합/방합이 만드는 오행. 없으면 null — 문장 생성기가 "무슨 기운으로 합쳐지는가"에 쓴다 */
export function branchPairHwa(a: Branch, b: Branch): Element | null {
  if (linked(HE_MAP, a, b)) {
    const hwa = REL.육합.hwa as Readonly<Record<string, string>>;
    return (hwa[a + b] ?? hwa[b + a] ?? null) as Element | null;
  }
  const sam = SAMHAP.find((g) => a !== b && g.branches.includes(a) && g.branches.includes(b));
  if (sam !== undefined) return sam.hwa as Element;
  const bang = BANGHAP.find((g) => a !== b && g.branches.includes(a) && g.branches.includes(b));
  return bang === undefined ? null : (bang.hwa as Element);
}

export const stemAt = (idx: StemIdx): Stem => STEMS[idx]!;
export const branchAt = (idx: BranchIdx): Branch => BRANCHES[idx]!;
