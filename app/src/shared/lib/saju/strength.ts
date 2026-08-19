// S5 신강신약 · 격국 · 용신 — 근거: C00 §S5-1 ~ §S5-5, §3-E1~E24, C05 §7(C05-STD v1), C17
//
// ## 이 파일이 지키는 규칙
//
// ① **수치 리터럴을 두지 않는다.** 위치가중·지장간 비율·SI 앵커·등급표·조후 계분표·조후 제1용신표·
//    억부표·통관표·특수격 문턱·병약 문턱은 전부 `strength-params.json` 에서 읽는다
//    (§S5 서두 + 그 파일의 `runtimeContract`). 표(지장간·십신·십이운성·건록·양인)는 `tables.json`.
//
// ② **오행 생극(生剋)조차 손으로 쓰지 않는다.** `tables.json > tenGods` 100칸에서 역으로 뽑는다
//    (식신·상관 = 我生, 편재·정재 = 我剋). 표를 두 번 적으면 언젠가 어긋난다(F6).
//    `strength.test.ts` 가 뽑아낸 순환이 木→火→土→金→水 인지 고정한다.
//
// ③ **결정론**. `Date.now()`·`Math.random()`·`Intl`·로컬 타임존 의존 없음. 객체 키 순서도 고정한다
//    (`Chart` 를 JSON.stringify 해서 캐시 키를 만들기 때문 — C00 §7.3).
//
// ## 배점 체계는 하나다
//
// `StrengthResult.scores`(오행 5개) → `groupScores`(십신 5그룹) 은 같은 총점을 접은 것이고,
// `TenGodChart.groupWeights` 는 `groupScores` 를 그대로 받는다. v1 의 「임시 정의(합 7.0)」는 폐기했다.

import {
  HIDDEN_STEM_RATIO,
  STEMS,
  STEM_META,
  TEN_GODS_TABLE,
  TWELVE_STAGES,
  YANGIN_BRANCH,
  GEONROK_BRANCH,
} from './constants';
import { GROUP_OF, hiddenStemsOf, mainHiddenStem, tenGod } from './ten-gods';
import type {
  Branch,
  Element,
  FourPillars,
  GeokgukResult,
  Pillar,
  PillarKey,
  StrengthChart,
  StrengthGrade,
  StrengthResult,
  TenGod,
  TenGodGroup,
  Unseong,
  WangSang,
  YongsinResult,
  YongsinRoute,
} from './types';
import { EngineError } from './types';
import params from '../../data/strength-params.json';

/* ────────────────────────── 계수 (strength-params.json) ────────────────────────── */

const STEM_W = params.scoreModel.stemPositionWeight.value as Readonly<Record<PillarKey, number>>;
const BRANCH_W = params.scoreModel.branchPositionWeight.value as Readonly<Record<PillarKey, number>>;
/** 천간/지지 1자리의 기준 점수. `unit: "×10점"` 이 곧 이 값이다 */
const UNIT = 10;
const TOTAL_FULL = params.scoreModel.totalScore.value;
const SI_ANCHORS = params.threshold.anchors_R_to_SI as readonly (readonly number[])[];
const GRADES = params.threshold.grades as readonly { max: number; label: string }[];
const IS_STRONG_CUT = params.threshold.isStrongCut_SI.value;
const NEUTRAL_BAND = params.threshold.neutralBand_SI.value as readonly number[];
const CLIMATE_STEM = params.climate.stemScore as Readonly<Record<string, number>>;
const CLIMATE_BRANCH = params.climate.branchScore as Readonly<Record<string, number>>;
const CLIMATE_TRIGGER = params.climate.triggerThreshold.value;
const CLIMATE_REQUIRED_CUT = params.climate.requiredElementScoreCut.value;
const TIAOHOU = params.tiaohouPrimary.table as Readonly<Record<string, readonly string[]>>;
/** 조후표 열 순서. `tiaohouPrimary._note` 가 못박은 寅…丑 */
const TIAOHOU_COLUMNS: readonly Branch[] = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const EOKBU = params.eokbuTable;
const TONGGWAN_TABLE = params.tonggwan.table as Readonly<Record<string, string>>;
const TONGGWAN_EACH_MIN = params.tonggwan.triggerCondition.eachShareMin;
const TONGGWAN_GAP_MAX = params.tonggwan.triggerCondition.gapShareMax;
const JEONWANG_SI_MIN = params.specialPattern.jeonwang.si_min;
const JONG_SI_MAX = params.specialPattern.jong.si_max;
const BYEONGYAK_CUT_RATIO = params.byeongyak.gisinScoreCutRatio.value;
const EXCLUDE_DAY_STEM_FROM_EXPOSURE = params.geokguk.excludeDayStemFromExposure.value;

export const ELEMENTS: readonly Element[] = ['木', '火', '土', '金', '水'];
const PILLAR_KEYS: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];
/** 십신 그룹 고정 순서 — 직렬화 결정론 */
const GROUP_KEYS: readonly TenGodGroup[] = ['비겁', '식상', '재성', '관성', '인성'];
/** 득지 판정에 쓰는 십이운성 (C00 §S5-2 a: 長生·冠帶·建祿·帝旺) */
const DEUKJI_STAGES: ReadonlySet<Unseong> = new Set<Unseong>(['장생', '관대', '건록', '제왕']);

/* ────────────────────────── 오행 생극 (tables.json 역산) ────────────────────────── */

function deriveElementCycles(): { sheng: Map<Element, Element>; ke: Map<Element, Element> } {
  const sheng = new Map<Element, Element>();
  const ke = new Map<Element, Element>();
  for (const ds of STEMS) {
    const de = STEM_META.get(ds)!.element;
    for (const other of STEMS) {
      const te = STEM_META.get(other)!.element;
      const god = TEN_GODS_TABLE[ds]?.[other];
      if (god === '식신' || god === '상관') sheng.set(de, te);
      else if (god === '편재' || god === '정재') ke.set(de, te);
    }
  }
  if (sheng.size !== 5 || ke.size !== 5) {
    throw new EngineError('INVALID_INPUT', '오행 생극 역산 실패 — tables.json > tenGods 손상');
  }
  return { sheng, ke };
}
const { sheng: SHENG, ke: KE } = deriveElementCycles();
const invert = (m: ReadonlyMap<Element, Element>): Map<Element, Element> =>
  new Map([...m].map(([a, b]) => [b, a]));
/** 生我 (인성 오행) */
const INV_SHENG = invert(SHENG);
/** 剋我 (관성 오행) */
const INV_KE = invert(KE);

const shengOf = (e: Element): Element => SHENG.get(e)!;
const keOf = (e: Element): Element => KE.get(e)!;
const invShengOf = (e: Element): Element => INV_SHENG.get(e)!;
const invKeOf = (e: Element): Element => INV_KE.get(e)!;

/** 일간 오행에서 본 5축 오행 */
export interface ElementAxes {
  bi: Element;
  ins: Element;
  sik: Element;
  jae: Element;
  gwan: Element;
}
export function elementAxesOf(dayElement: Element): ElementAxes {
  return {
    bi: dayElement,
    ins: invShengOf(dayElement),
    sik: shengOf(dayElement),
    jae: keOf(dayElement),
    gwan: invKeOf(dayElement),
  };
}
const AXIS_OF_GROUP: Readonly<Record<TenGodGroup, keyof ElementAxes>> = {
  비겁: 'bi',
  인성: 'ins',
  식상: 'sik',
  재성: 'jae',
  관성: 'gwan',
};
const elementOfGroup = (axes: ElementAxes, group: TenGodGroup): Element => axes[AXIS_OF_GROUP[group]];
function groupOfElement(axes: ElementAxes, element: Element): TenGodGroup {
  for (const g of GROUP_KEYS) if (elementOfGroup(axes, g) === element) return g;
  throw new EngineError('INVALID_INPUT', `오행 그룹 매핑 실패: ${element}`);
}

const elementOfStem = (stem: string): Element => STEM_META.get(stem as never)!.element;

/* ────────────────────────── 1. 오행 점수 (총점 80.00 / 62.00) ────────────────────────── */

export interface ElementScoreResult {
  scores: Record<Element, number>;
  total: number;
}

/**
 * C00 §S5-1. 천간은 위치가중(일간 0), 지지는 위치가중 × 지장간 배분비.
 * 삼주 모드(시주 없음)면 시간·시지가 빠져 총점이 62.00 이 된다.
 */
export function computeElementScores(pillars: FourPillars): ElementScoreResult {
  const scores = {} as Record<Element, number>;
  for (const e of ELEMENTS) scores[e] = 0;
  let total = 0;

  for (const key of PILLAR_KEYS) {
    const p: Pillar | null = pillars[key];
    if (p === null) continue;

    const stemWeight = UNIT * STEM_W[key];
    if (stemWeight !== 0) {
      scores[elementOfStem(p.stem)] += stemWeight;
      total += stemWeight;
    }

    const base = UNIT * BRANCH_W[key];
    const hidden = hiddenStemsOf(p.branch);
    const ratios = HIDDEN_STEM_RATIO[String(hidden.length)];
    if (ratios === undefined) {
      throw new EngineError('INVALID_INPUT', `지장간 배분비 없음: ${hidden.length}자`);
    }
    hidden.forEach((h, i) => {
      const w = base * (ratios[i] ?? 0);
      scores[elementOfStem(h.stem)] += w;
      total += w;
    });
  }

  // 부동소수 잔차 제거. 모든 계수가 소수 2자리 이내라 1e-6 반올림은 무손실이다.
  for (const e of ELEMENTS) scores[e] = round6(scores[e]);
  return { scores, total: round6(total) };
}

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;
/** SI 표기 정밀도 — C05/C17 테스트 벡터가 소수 1자리다. 등급도 이 값으로 매긴다(표시와 등급 불일치 방지) */
const round1 = (x: number): number => Math.round(x * 10) / 10;

/* ────────────────────────── 2. SI · 등급 ────────────────────────── */

/** 전수 518,400 R 분포 CDF 를 23점 앵커로 선형보간 (C00 §S5-1, E2) */
export function strengthIndexOf(R: number): number {
  const first = SI_ANCHORS[0]!;
  const last = SI_ANCHORS[SI_ANCHORS.length - 1]!;
  if (R <= first[0]!) return first[1]!;
  if (R >= last[0]!) return last[1]!;
  for (let i = 1; i < SI_ANCHORS.length; i++) {
    const [r1, s1] = SI_ANCHORS[i]! as [number, number];
    const [r0, s0] = SI_ANCHORS[i - 1]! as [number, number];
    if (R <= r1) {
      const span = r1 - r0;
      return span === 0 ? s1 : s0 + ((R - r0) * (s1 - s0)) / span;
    }
  }
  return last[1]!;
}

export function gradeOf(SI: number): StrengthGrade {
  for (const g of GRADES) if (SI < g.max) return g.label as StrengthGrade;
  return GRADES[GRADES.length - 1]!.label as StrengthGrade;
}

/* ────────────────────────── 旺相休囚死 · 십이운성 ────────────────────────── */

/**
 * C00 §S5-2 (c). 当令者旺 / 我生者相 / 生我者休 / 克我者囚 / 我克者死.
 * 「我」 = 당령 = **월지의 지지 오행**(辰戌丑未 = 土旺). 계절 기준 유파를 쓰지 않는다(E11).
 */
export function wangSangOf(monthElement: Element, target: Element): WangSang {
  if (target === monthElement) return '旺';
  if (shengOf(monthElement) === target) return '相';
  if (shengOf(target) === monthElement) return '休';
  if (keOf(target) === monthElement) return '囚';
  return '死';
}

/** 십이운성 (일간 거법, 음간 역행 — C00 §S4-3) */
export function unseongOf(dayStem: string, branch: Branch): Unseong {
  const hit = TWELVE_STAGES[dayStem]?.[branch];
  if (hit === undefined) throw new EngineError('INVALID_INPUT', `십이운성 조회 실패: ${dayStem}/${branch}`);
  return hit as Unseong;
}

/* ────────────────────────── 3. 신강신약 ────────────────────────── */

/** 일간 제외 7자(천간3 + 지지4 본기). 삼주 모드면 5자 */
function sevenLetters(pillars: FourPillars): { element: Element; label: string }[] {
  const out: { element: Element; label: string }[] = [];
  for (const key of PILLAR_KEYS) {
    const p = pillars[key];
    if (p === null) continue;
    if (key !== 'day') out.push({ element: elementOfStem(p.stem), label: `${key}Stem:${p.stem}` });
    out.push({ element: elementOfStem(mainHiddenStem(p.branch)), label: `${key}Branch:${p.branch}` });
  }
  return out;
}

export function computeStrength(pillars: FourPillars): StrengthResult {
  const { scores, total } = computeElementScores(pillars);
  const dayStem = pillars.day.stem;
  const dayElement = elementOfStem(dayStem);
  const axes = elementAxesOf(dayElement);

  const groupScores = {} as Record<TenGodGroup, number>;
  for (const g of GROUP_KEYS) groupScores[g] = scores[elementOfGroup(axes, g)];

  const ally = round6(groupScores['비겁'] + groupScores['인성']);
  const foe = round6(total - ally);
  const R = total === 0 ? 0 : ally / total;
  const SI = round1(strengthIndexOf(R));
  const grade = gradeOf(SI);

  // ── 득령 · 득지 · 득세 (판정에는 쓰지 않는다 — 해설 근거 전용, §S5-2 a-2)
  const monthElement = elementOfStem(mainHiddenStem(pillars.month.branch));
  const wangsang = wangSangOf(monthElement, dayElement);
  const deukryeong = wangsang === '旺' || wangsang === '相';

  const unseongIlji = unseongOf(dayStem, pillars.day.branch);
  const dayBranchElement = elementOfStem(mainHiddenStem(pillars.day.branch));
  const deukji =
    dayBranchElement === axes.bi || dayBranchElement === axes.ins || DEUKJI_STAGES.has(unseongIlji);

  let allyCount = 0;
  for (const l of sevenLetters(pillars)) {
    if (l.element === axes.bi || l.element === axes.ins) allyCount++;
  }
  const deukse = allyCount >= 3;
  const condCount = ((deukryeong ? 1 : 0) + (deukji ? 1 : 0) + (deukse ? 1 : 0)) as 0 | 1 | 2 | 3;

  // ── 통근 (C05 §3.3). 지지 본기 동기 = 강근(+2), 중·여기 동기 = 약근(+1)
  let rootScore = 0;
  let strongRoot = false;
  const roots: string[] = [];
  for (const key of PILLAR_KEYS) {
    const p = pillars[key];
    if (p === null) continue;
    const hidden = hiddenStemsOf(p.branch);
    hidden.forEach((h, i) => {
      if (elementOfStem(h.stem) !== dayElement) return;
      const main = i === 0;
      if (main) strongRoot = true;
      rootScore += main ? 2 : 1;
      roots.push(`${key}:${p.branch}:${h.role}`);
    });
  }

  return {
    scores,
    total,
    groupScores,
    ally,
    foe,
    R: round6(R),
    SI,
    grade,
    isStrong: SI >= IS_STRONG_CUT,
    isNeutralBand: SI >= (NEUTRAL_BAND[0] ?? 45) && SI < (NEUTRAL_BAND[1] ?? 55),
    deuk: { deukryeong, wangsang, deukji, unseongIlji, deukse, allyCount, condCount },
    root: { hasRoot: rootScore > 0, strongRoot, rootScore, roots },
  };
}

/* ────────────────────────── 4. 격국 ────────────────────────── */

/** 십신 → 격 이름. 지식카드 `geokguk:` 태그 10종과 같은 표기 (칠살격 ≠ 편관격) */
const GEOKGUK_NAME: Readonly<Record<TenGod, string>> = {
  비견: '건록격',
  겁재: '양인격',
  식신: '식신격',
  상관: '상관격',
  편재: '편재격',
  정재: '정재격',
  편관: '칠살격',
  정관: '정관격',
  편인: '편인격',
  정인: '정인격',
};

/** 투출 후보 정렬 우선순위의 기둥 순위: 월간 0 > 시간 1 > 년간 2 (E19) */
const EXPOSURE_RANK: readonly { key: PillarKey; rank: number }[] = [
  { key: 'month', rank: 0 },
  { key: 'hour', rank: 1 },
  { key: 'year', rank: 2 },
];

/** 이당(식상·재성·관성) 오행이 **명투**(천간3 + 지지4 본기)로 드러난 그룹 집합 */
function foeCategoriesExposed(pillars: FourPillars, axes: ElementAxes): Set<TenGodGroup> {
  const out = new Set<TenGodGroup>();
  for (const l of sevenLetters(pillars)) {
    const g = groupOfElement(axes, l.element);
    if (g === '식상' || g === '재성' || g === '관성') out.add(g);
  }
  return out;
}

const JONG_SUBTYPE: Readonly<Record<string, string>> = {
  식상: '종아격',
  재성: '종재격',
  관성: '종살격',
};

export function deriveGyeokguk(
  pillars: FourPillars,
  strength: StrengthResult,
  axes: ElementAxes,
): GeokgukResult {
  const dayStem = pillars.day.stem;
  const monthBranch = pillars.month.branch;

  // ── 0단계 특수격 선검사 (C00 §S5-3 a / E21·E22)
  const foeExposed = foeCategoriesExposed(pillars, axes);
  if (strength.SI >= JEONWANG_SI_MIN && foeExposed.size === 0) {
    return {
      name: '전왕격',
      special: true,
      basis: `SI ${strength.SI} ≥ ${JEONWANG_SI_MIN} & 이당 명투 0개`,
      tenGod: null,
    };
  }
  if (strength.SI <= JONG_SI_MAX && !strength.root.hasRoot) {
    const only = foeExposed.size === 1 ? [...foeExposed][0]! : null;
    return {
      name: only === null ? '종세격' : (JONG_SUBTYPE[only] ?? '종세격'),
      special: true,
      basis: `SI ${strength.SI} ≤ ${JONG_SI_MAX} & 일간 통근 전무 (이당 카테고리 ${foeExposed.size}종)`,
      tenGod: null,
    };
  }

  // ── 1단계 록/인 위치 고정격
  if (GEONROK_BRANCH[dayStem] === monthBranch) {
    return { name: '건록격', special: false, basis: `월지=일간 祿位(${monthBranch})`, tenGod: '비견' };
  }
  if (YANGIN_BRANCH[dayStem] === monthBranch) {
    return { name: '양인격', special: false, basis: `월지=일간 刃位(${monthBranch})`, tenGod: '겁재' };
  }

  // ── 2단계 월지 지장간 투출 검사 (일간 제외 — E20)
  // EXPOSURE_RANK 에 'day' 가 없는 것 자체가 E20 의 구현이다. 파라미터가 뒤집히면 일간의 정렬 순위부터
  // 새로 정의해야 하므로(C05 §6.1 은 월>시>년 3칸만 준다) 조용히 무시하지 않고 막는다.
  if (!EXCLUDE_DAY_STEM_FROM_EXPOSURE) {
    throw new EngineError(
      'INVALID_INPUT',
      'geokguk.excludeDayStemFromExposure=false 는 v1 미구현이다 (E20 확정값은 true)',
    );
  }
  const hidden = hiddenStemsOf(monthBranch);
  const exposedStems = EXPOSURE_RANK.map((e) => ({ rank: e.rank, stem: pillars[e.key]?.stem ?? null }))
    .filter((e): e is { rank: number; stem: NonNullable<typeof e.stem> } => e.stem !== null);

  const candidates: { layer: number; count: number; rank: number; god: TenGod; stem: string }[] = [];
  hidden.forEach((h, layer) => {
    const god = tenGod(dayStem, h.stem);
    if (GROUP_OF[god] === '비겁') return; // 비겁은 격이 되지 않는다
    const hits = exposedStems.filter((e) => e.stem === h.stem);
    if (hits.length === 0) return;
    candidates.push({
      layer,
      count: hits.length,
      rank: Math.min(...hits.map((e) => e.rank)),
      god,
      stem: h.stem,
    });
  });

  // ── 3단계 정렬: 본기>중기>여기 → 투출 횟수 多 → 월간>시간>년간 (E19)
  candidates.sort((a, b) => a.layer - b.layer || b.count - a.count || a.rank - b.rank);
  const best = candidates[0];
  if (best !== undefined) {
    return {
      name: GEOKGUK_NAME[best.god],
      special: false,
      basis: `월지${monthBranch} 지장간 ${best.stem} 투출(${hidden[best.layer]!.role}, ${best.count}회)`,
      tenGod: best.god,
    };
  }

  // ── 4단계 투출 없음 → 월지 본기 십신
  const mainGod = tenGod(dayStem, hidden[0]!.stem);
  return {
    name: GEOKGUK_NAME[mainGod],
    special: false,
    basis: `월지${monthBranch} 본기 ${hidden[0]!.stem} (투출 없음)`,
    tenGod: mainGod,
  };
}

/* ────────────────────────── 5. 용신 五道关 ────────────────────────── */

/** 조후지수 ci = Σ temps[8글자], **월지 ×2** (E17). 삼주 모드면 시간·시지가 빠진다 */
export function climateIndexOf(pillars: FourPillars): number {
  let ci = 0;
  for (const key of PILLAR_KEYS) {
    const p = pillars[key];
    if (p === null) continue;
    ci += CLIMATE_STEM[p.stem] ?? 0;
    ci += (CLIMATE_BRANCH[p.branch] ?? 0) * (key === 'month' ? 2 : 1);
  }
  return ci;
}

/** 조후 제1용신 1글자 (strength-params > tiaohouPrimary, 3표 다수결) */
export function tiaohouPrimaryOf(dayStem: string, monthBranch: Branch): string {
  const col = TIAOHOU_COLUMNS.indexOf(monthBranch);
  const hit = col < 0 ? undefined : TIAOHOU[dayStem]?.[col];
  if (hit === undefined) {
    throw new EngineError('INVALID_INPUT', `조후표 조회 실패: ${dayStem}/${monthBranch}`);
  }
  return hit;
}

/** 서로 극하는 두 오행이 팽팽하게 맞선 상태(통관 조건)를 찾는다. v1 은 route 를 바꾸지 않고 기록만 한다 */
function detectTonggwan(scores: Record<Element, number>, total: number): string | null {
  for (const x of ELEMENTS) {
    const y = keOf(x);
    if (scores[x] < total * TONGGWAN_EACH_MIN || scores[y] < total * TONGGWAN_EACH_MIN) continue;
    if (Math.abs(scores[x] - scores[y]) / total >= TONGGWAN_GAP_MAX) continue;
    const relief = TONGGWAN_TABLE[`${x}${y}`] ?? TONGGWAN_TABLE[`${y}${x}`];
    if (relief !== undefined) return `${x}↔${y} 상전 → 통관 ${relief}`;
  }
  return null;
}

const uniq = (xs: readonly Element[]): Element[] => [...new Set(xs)];

export function deriveYongsin(
  pillars: FourPillars,
  strength: StrengthResult,
  geokguk: GeokgukResult,
  axes: ElementAxes,
): YongsinResult {
  const { scores, total, SI } = strength;
  const ci = climateIndexOf(pillars);
  const tiaohouChars = tiaohouPrimaryOf(pillars.day.stem, pillars.month.branch);
  const steps: string[] = [];

  const finish = (
    order: readonly Element[],
    avoid: readonly Element[],
    route: YongsinRoute,
  ): YongsinResult => {
    const favorable = uniq(order);
    return {
      primary: favorable[0]!,
      favorable,
      avoid: uniq(avoid),
      route,
      climateIndex: ci,
      tiaohouChars,
      steps,
    };
  };

  // ── 1관 從/專旺 (최고 거부권)
  if (geokguk.special) {
    steps.push(`1관 從/專旺: ${geokguk.name} 성립 (${geokguk.basis}) → 이하 관문 전부 무효`);
    if (geokguk.name === '전왕격') {
      return finish([axes.bi, axes.ins, axes.sik], [axes.jae, axes.gwan], '從/專旺');
    }
    return finish([axes.sik, axes.jae, axes.gwan], [axes.bi, axes.ins], '從/專旺');
  }
  steps.push('1관 從/專旺: 미성립');

  // ── 2관 調候 (급증시만)
  const urgent: Element | null = ci <= -CLIMATE_TRIGGER ? '火' : ci >= CLIMATE_TRIGGER ? '水' : null;
  if (urgent !== null && scores[urgent] < CLIMATE_REQUIRED_CUT) {
    steps.push(`2관 調候: ci ${ci} 편고 + ${urgent} ${scores[urgent]} < ${CLIMATE_REQUIRED_CUT} → 발동`);
    return finish([urgent, invShengOf(urgent)], [invKeOf(urgent)], '調候');
  }
  steps.push(
    urgent === null
      ? `2관 調候: ci ${ci} — |ci| < ${CLIMATE_TRIGGER} 이라 미발동`
      : `2관 調候: ci ${ci} 편고이나 ${urgent} ${scores[urgent]} ≥ ${CLIMATE_REQUIRED_CUT} (이미 해소) → 미발동`,
  );

  // ── 3관 抑扶 (방향)
  const groupsToElements = (groups: readonly string[]): Element[] =>
    groups.map((g) => elementOfGroup(axes, g as TenGodGroup));
  let order: Element[];
  let avoid: Element[];
  if (SI >= IS_STRONG_CUT) {
    order = groupsToElements(EOKBU.strong.favorableOrder);
    avoid = groupsToElements(EOKBU.strong.avoid);
    steps.push(`3관 抑扶: SI ${SI} ≥ ${IS_STRONG_CUT} 신강 → ${EOKBU.strong.favorableOrder.join('>')}`);
  } else if (!strength.isNeutralBand) {
    order = groupsToElements(EOKBU.weak.favorableOrder);
    avoid = groupsToElements(EOKBU.weak.avoid);
    steps.push(`3관 抑扶: SI ${SI} < ${NEUTRAL_BAND[0]} 신약 → ${EOKBU.weak.favorableOrder.join('>')}`);
  } else {
    order = [elementOfStem(tiaohouChars)];
    avoid = [];
    steps.push(
      `3관 抑扶: SI ${SI} 중립밴드[${NEUTRAL_BAND[0]},${NEUTRAL_BAND[1]}) → 조후표 1순위 ${tiaohouChars}(${order[0]}) 채택`,
    );
  }

  // ── 4관 格局 (정밀화)
  const geokgukElement =
    geokguk.tenGod === null ? null : elementOfGroup(axes, GROUP_OF[geokguk.tenGod]);
  if (geokgukElement !== null && order.includes(geokgukElement)) {
    order = [geokgukElement, ...order.filter((x) => x !== geokgukElement)];
    steps.push(`4관 格局: ${geokguk.name}(${geokgukElement}) 이 억부 방향 안 → 1순위 승격`);
  } else {
    steps.push(
      `4관 格局: ${geokguk.name}${geokgukElement === null ? '' : `(${geokgukElement})`} 은 억부 방향 밖 → 순서 유지`,
    );
  }

  // ── 5관 病藥
  const gisin = invKeOf(order[0]!);
  const byeongyakCut = round6(total * BYEONGYAK_CUT_RATIO);
  if (scores[gisin] < byeongyakCut) {
    steps.push(`5관 病藥: 기신 ${gisin} ${scores[gisin]} < ${byeongyakCut} → 추가 없음`);
  } else {
    const medicine = invKeOf(gisin);
    if (avoid.includes(medicine)) {
      // C05 §7.4 의사코드는 무조건 push 하지만, 신강 사주에서는 藥 = 인성이 되어 3관 기신과 겹친다.
      // 같은 오행을 희신이자 기신으로 내보내면 리포트가 자기모순이 되므로 여기서 막는다.
      steps.push(
        `5관 病藥: 기신 ${gisin} ${scores[gisin]} ≥ ${byeongyakCut} 이나 藥 ${medicine} 이 3관 기신과 겹쳐 보류`,
      );
    } else {
      order = [...order, medicine];
      steps.push(`5관 病藥: 기신 ${gisin} ${scores[gisin]} ≥ ${byeongyakCut} → 藥 ${medicine} 희신 추가`);
    }
  }

  const tonggwan = detectTonggwan(scores, total);
  if (tonggwan !== null) steps.push(`(참고) ${tonggwan} — v1 五道关에 通關 관문이 없어 route 는 바꾸지 않는다`);

  return finish(order, avoid, '抑扶+格局');
}

/* ────────────────────────── 진입점 ────────────────────────── */

/** S5 전체. `computeChart()` 가 `Chart.strength` 로 채운다 */
export function computeStrengthChart(pillars: FourPillars): StrengthChart {
  const strength = computeStrength(pillars);
  const axes = elementAxesOf(elementOfStem(pillars.day.stem));
  const geokguk = deriveGyeokguk(pillars, strength, axes);
  const yongsin = deriveYongsin(pillars, strength, geokguk, axes);
  return { strength, geokguk, yongsin };
}

/** 테스트·검증용 노출 (계수를 다시 적지 않기 위해) */
export const STRENGTH_PARAM_VIEW = {
  totalFull: TOTAL_FULL,
  isStrongCut: IS_STRONG_CUT,
  neutralBand: NEUTRAL_BAND,
  grades: GRADES,
  jeonwangSiMin: JEONWANG_SI_MIN,
  jongSiMax: JONG_SI_MAX,
  byeongyakCutRatio: BYEONGYAK_CUT_RATIO,
  climateTrigger: CLIMATE_TRIGGER,
  climateRequiredCut: CLIMATE_REQUIRED_CUT,
  sheng: SHENG,
  ke: KE,
  geokgukNames: GEOKGUK_NAME,
  tiaohouColumns: TIAOHOU_COLUMNS,
} as const;
