// 근거: C00 §F6 (모든 표는 tables.json 에서만 읽는다 — 코드에 표를 다시 쓰지 않는다)
//       인덱스 규약은 tables.json > _meta.index_convention 이 원본이다.
//
// 왜 JSON 을 직접 import 하는가: F6 는 "표의 단일 출처"를 요구한다. 표를 TS 로 옮겨 적으면
// tables.json 과의 드리프트가 조용히 생긴다. 대신 형(型)은 이 파일에서 한 번만 좁힌다.

import tables from '../../data/tables.json';
import strengthParams from '../../data/strength-params.json';
import type { Branch, BranchIdx, Element, GanjiIdx, Stem, StemIdx, TenGod, YinYang } from './types';

const conv = tables._meta.index_convention;

/** 천간 0=甲 … 9=癸 */
export const STEMS = conv.GAN as readonly Stem[];
/** 지지 0=子 … 11=亥 */
export const BRANCHES = conv.ZHI as readonly Branch[];
export const STEMS_KO = conv.GAN_KO as readonly string[];
export const BRANCHES_KO = conv.ZHI_KO as readonly string[];

export const STEM_INDEX: ReadonlyMap<Stem, StemIdx> = new Map(
  STEMS.map((s, i) => [s, i as StemIdx]),
);
export const BRANCH_INDEX: ReadonlyMap<Branch, BranchIdx> = new Map(
  BRANCHES.map((b, i) => [b, i as BranchIdx]),
);

interface StemMeta { element: Element; yinYang: YinYang }
const ganMeta = tables.ganElementYinYang.data as Record<string, { element: string; yinYang: string }>;
export const STEM_META: ReadonlyMap<Stem, StemMeta> = new Map(
  STEMS.map((s) => [s, { element: ganMeta[s].element as Element, yinYang: ganMeta[s].yinYang as YinYang }]),
);

const zhiMeta = tables.zhiElementYinYang.data as Record<string, { element: string; yinYang: string }>;
export const BRANCH_META: ReadonlyMap<Branch, StemMeta> = new Map(
  BRANCHES.map((b) => [b, { element: zhiMeta[b].element as Element, yinYang: zhiMeta[b].yinYang as YinYang }]),
);

/** 십신표 (일간 × 상대천간). tables.json > tenGods */
export const TEN_GODS_TABLE = tables.tenGods.data as Record<string, Record<string, TenGod>>;

/** 지장간. 정기는 항상 존재하고 여기/중기는 null 일 수 있다 */
export const HIDDEN_STEMS = tables.hiddenStems.data as Record<
  string,
  { 여기: string | null; 중기: string | null; 정기: string }
>;

/**
 * 십이운성 (일간 × 지지). C00 §S4-3 확정 = **음간 역행**이므로 `twelveStages` 를 읽는다.
 * `twelveStagesYinForward` 는 부결된 현대 유파값이므로 읽지 않는다.
 */
export const TWELVE_STAGES = tables.twelveStages.data as Record<string, Record<string, string>>;

/** 건록지 (일간 → 지지). C00 §S5-3 격국 1단계 */
export const GEONROK_BRANCH = tables.geonrok.data as Record<string, string>;

/**
 * 양인지 (일간 → 지지) — **양간 5개만**.
 * C05 §6.1 / C00 §3-D5: 격국의 양인격은 양간에만 성립한다(淵海子平 §377 「五陰無刃」).
 * `tables.json > yangin.data` 는 祿±1 규칙으로 음간까지 재생성한 10칸이므로 여기서 양간만 남긴다
 * (그 파일의 `_alternatives.陽干만(...)` 과 5칸 일치한다).
 */
export const YANGIN_BRANCH: Record<string, string> = Object.fromEntries(
  STEMS.filter((s) => STEM_META.get(s)!.yinYang === '陽').map((s) => [
    s,
    (tables.yangin.data as Record<string, string>)[s]!,
  ]),
);

/** 납음오행 (60갑자 → 해중금 …) */
export const NAEUM = tables.naeum.data as Record<string, { hanja: string; ko: string; element: string }>;

/** 60갑자 문자열 → 인덱스 */
export const GANJI_INDEX = tables.jiaziIndex.data as Record<string, number>;

/** 오호둔: 연간 → 寅월 천간 인덱스 (C00 §S3-2). `(2g+지지idx)%10` 식은 금지 */
export const OHODUN: readonly number[] = STEMS.map(
  (s) => (tables.ohodun.data as Record<string, { index: number }>)[s].index,
);
/** 오서둔: 일간 → 子시 천간 인덱스 (C00 §S3-4) */
export const OSEODUN: readonly number[] = STEMS.map(
  (s) => (tables.oseodun.data as Record<string, { index: number }>)[s].index,
);

/**
 * 지장간 배분비 [본기, 중기, 여기].
 * C00 §S4-2 / §3-C12: 유일한 출처는 strength-params.json > scoreModel.hiddenStemRatio 다.
 * tables.json > tenGodsByBranchAll._weight 는 부결된 baziEval 계열 값이므로 읽지 않는다.
 */
export const HIDDEN_STEM_RATIO = strengthParams.scoreModel.hiddenStemRatio.value as Record<
  string,
  readonly number[]
>;

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** 60갑자 인덱스 → "甲子" */
export function ganjiOf(idx: GanjiIdx): string {
  const n = mod(idx, 60);
  return STEMS[n % 10] + BRANCHES[n % 12];
}
/** 60갑자 인덱스 → "갑자" */
export function ganjiKoOf(idx: GanjiIdx): string {
  const n = mod(idx, 60);
  return STEMS_KO[n % 10] + BRANCHES_KO[n % 12];
}
/** 천간·지지 인덱스 → 60갑자 인덱스. (6g − 5z) mod 60 */
export function ganjiIdxOf(stemIdx: number, branchIdx: number): GanjiIdx {
  return mod(6 * stemIdx - 5 * branchIdx, 60);
}
