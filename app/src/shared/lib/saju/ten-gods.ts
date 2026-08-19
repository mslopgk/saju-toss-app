// S4 십신 — 근거: C00 §S4-1, §S4-2, §3-C7~C12, C16
// 이식 원본: docs/research/calc/proto/ref.mjs (tenGod / tenGodsOf)
//
// 십신표 자체는 tables.json > tenGods 가 유일한 출처다(F6). 규칙식을 코드에 다시 쓰지 않는다.
// 지장간 배분비는 strength-params.json > scoreModel.hiddenStemRatio 만 읽는다(§S4-2).

import { HIDDEN_STEMS, HIDDEN_STEM_RATIO, TEN_GODS_TABLE } from './constants';
import type {
  Branch,
  FourPillars,
  HiddenStemEntry,
  PillarKey,
  Stem,
  TenGod,
  TenGodChart,
  TenGodGroup,
} from './types';
import { EngineError } from './types';

const HIDDEN_ROLES = ['정기', '중기', '여기'] as const;
export type HiddenStemRole = (typeof HIDDEN_ROLES)[number];

export const GROUP_OF: Readonly<Record<TenGod, TenGodGroup>> = {
  비견: '비겁',
  겁재: '비겁',
  식신: '식상',
  상관: '식상',
  편재: '재성',
  정재: '재성',
  편관: '관성',
  정관: '관성',
  편인: '인성',
  정인: '인성',
};

/** 일간에서 본 상대 천간의 십신 */
export function tenGod(dayStem: Stem, other: Stem): TenGod {
  const row = TEN_GODS_TABLE[dayStem];
  const hit = row === undefined ? undefined : row[other];
  if (hit === undefined) throw new EngineError('INVALID_INPUT', `십신 조회 실패: ${dayStem}/${other}`);
  return hit;
}

/** 지지의 지장간 목록 (정기 → 중기 → 여기 순) */
export function hiddenStemsOf(branch: Branch): { stem: Stem; role: HiddenStemRole }[] {
  const row = HIDDEN_STEMS[branch];
  if (row === undefined) throw new EngineError('INVALID_INPUT', `지장간 조회 실패: ${branch}`);
  const out: { stem: Stem; role: HiddenStemRole }[] = [];
  for (const role of HIDDEN_ROLES) {
    const stem = row[role];
    if (stem !== null && stem !== undefined) out.push({ stem: stem as Stem, role });
  }
  return out;
}

/** 지지 정기(본기) */
export function mainHiddenStem(branch: Branch): Stem {
  return HIDDEN_STEMS[branch].정기 as Stem;
}

/**
 * 골든셋 호환 십신 7항 (연/월/시 천간 + 4지지 정기).
 * 일간 자신(dayStem)은 십신이 아니므로 빠진다.
 */
export interface TenGodsFlat {
  yearStem: TenGod;
  monthStem: TenGod;
  hourStem: TenGod;
  yearBranch: TenGod;
  monthBranch: TenGod;
  dayBranch: TenGod;
  hourBranch: TenGod;
}

export interface GanjiQuad {
  yearPillar: string;
  monthPillar: string;
  dayPillar: string;
  hourPillar: string;
}

/** "甲子" 4개 문자열에서 바로 십신을 낸다 (회귀 하네스가 쓰는 형태) */
export function tenGodsOfGanji(q: GanjiQuad): TenGodsFlat {
  const ds = q.dayPillar[0] as Stem;
  const b = (p: string): TenGod => tenGod(ds, mainHiddenStem(p[1] as Branch));
  return {
    yearStem: tenGod(ds, q.yearPillar[0] as Stem),
    monthStem: tenGod(ds, q.monthPillar[0] as Stem),
    hourStem: tenGod(ds, q.hourPillar[0] as Stem),
    yearBranch: b(q.yearPillar),
    monthBranch: b(q.monthPillar),
    dayBranch: b(q.dayPillar),
    hourBranch: b(q.hourPillar),
  };
}

const PILLAR_KEYS: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];

/** 지장간 배분비. 개수별로 [본기, 중기, 여기] 순서로 매긴다 */
function ratiosFor(count: number): readonly number[] {
  const r = HIDDEN_STEM_RATIO[String(count)];
  if (r === undefined) throw new EngineError('INVALID_INPUT', `지장간 배분비 없음: ${count}자`);
  return r;
}

/**
 * 십신 배치표.
 *
 * `groupWeights` 는 **여기서 만들지 않고 S5 가 낸 `groupScores` 를 그대로 받는다**(C00 §S5-1).
 * v1 에는 자체 「임시 정의」 가중(천간 1.0 + 지장간 비율, 합 7.0)이 있었는데, S5 의 정식 배점(합 80.00)과
 * 공존하면 같은 개념에 두 숫자가 생겨 리포트가 갈린다. 그래서 계산 주체를 S5 하나로 모았다.
 */
export function computeTenGodChart(
  pillars: FourPillars,
  groupWeights: Record<TenGodGroup, number>,
): TenGodChart {
  const dayStem = pillars.day.stem;
  const byPillar = {} as TenGodChart['byPillar'];

  for (const key of PILLAR_KEYS) {
    const p = pillars[key];
    if (p === null) {
      byPillar[key] = { stem: null, branchMain: null, branchAll: [] };
      continue;
    }
    const hidden = hiddenStemsOf(p.branch);
    const ratios = ratiosFor(hidden.length);
    const branchAll: HiddenStemEntry[] = hidden.map((h, i) => ({
      stem: h.stem,
      role: h.role,
      ratio: ratios[i],
      tenGod: tenGod(dayStem, h.stem),
    }));
    const stemGod: TenGod | '일간' = key === 'day' ? '일간' : tenGod(dayStem, p.stem);
    byPillar[key] = {
      stem: stemGod,
      branchMain: tenGod(dayStem, mainHiddenStem(p.branch)),
      branchAll,
    };
  }

  return { byPillar, groupWeights };
}
