// S4-2 신살 · 십이운성 · 지지/천간 관계 — 근거: C00 §S4-3 ~ §S4-7, §3-D(D1~D23), C04 §5~§13, C16
//
// F6: 판정표는 **전부 tables.json** 에서 읽는다. 코드에 표를 다시 쓰지 않는다.
//     C16 이 규칙 재생성으로 126항목 / FAIL 0 검증해 둔 표다.
// 배점(SINSAL_SCORE · PILLAR_WEIGHT · 십이운성 에너지 · 관계 강도)은 `sinsal-params.json` 이 단일 출처다.
//
// 확정 유파(C00 §3-D). 코드가 조용히 바꿀 수 없도록 여기에 못 박아 둔다:
//   D1  십이운성 음간 **역행**  → `twelveStages` 를 읽는다(`twelveStagesYinForward` 는 부결값)
//   D2  기준 천간 **일간 거법** → 4주 지지 전부를 일간으로 본다. 봉법은 `unseongByPillarStem` 에 부기
//   D4  천을귀인 庚 = **丑未**(KR안)
//   D5  양인 **10칸**(음간 포함). 격국의 양인격만 양간 5칸을 쓴다(constants.YANGIN_BRANCH)
//   D6  괴강 = **庚辰 庚戌 壬辰 壬戌**
//   D7  백호·괴강 **dayPillarFirst 게이트** — 일주가 목록에 없으면 다른 기둥도 성립하지 않는다
//   D9  귀문관살 = 子酉 丑午 寅未 卯申 辰亥 巳戌
//   D10 원진 **대칭 6쌍**(방향성안 미채택)
//   D12 십이신살은 **연지·일지 둘 다** 산출
//   D13 공망 **일주 기준만**
//   D14 천간충 **4쌍**(戊甲·己乙 은 `천간극`)
//   D15 반합 生旺·旺墓만 1.0, 生墓 는 `공합` 0.4
//   D17 천간합의 `hwa` 는 **라벨**이다. 오행 점수는 化 하지 않은 상태로 낸다(S5 가 그렇게 계산한다)
//   D18 형 2자 성립(0.5) / D19 방합 3자 완성만

import params from '../../data/sinsal-params.json';
import tables from '../../data/tables.json';
import { STEMS } from './constants';
import { unseongOf } from './strength';
import type {
  Branch,
  BranchRelation,
  BranchRelationType,
  Element,
  FourPillars,
  Pillar,
  PillarKey,
  Sinsal12,
  SinsalChart,
  SinsalHit,
  Stem,
  StemRelation,
  Unseong,
} from './types';
import { EngineError } from './types';

const PILLAR_KEYS: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];
/** 기둥 표기. 관계의 `at` 문자열("연-월")을 만든다 */
const PILLAR_KO: Readonly<Record<PillarKey, string>> = {
  year: '연',
  month: '월',
  day: '일',
  hour: '시',
};

const SINSAL_SCORE = params.sinsalScore.data as Readonly<Record<string, number>>;
const PILLAR_WEIGHT = params.pillarWeight.data as Readonly<Record<PillarKey, number>>;
const SCORE_SHAPE = params.sinsalScoreShape.data;
const UNSEONG_ENERGY = params.unseongEnergy.data as Readonly<Record<string, number>>;
const GATES = params.gates.data as Readonly<Record<string, string>>;
/** 4주 전부가 아니라 특정 기둥에서만 판정하는 신살 (금신 = 일주·시주) */
const PILLAR_SCOPE = params.pillarScope.data as Readonly<Record<string, readonly PillarKey[]>>;
const REL_STRENGTH = params.relationStrength.data as Readonly<Record<string, number>>;

/** 관계 타입 → 지식카드 `daewoon:관계:*` 의 key. 해석 레이어가 태그를 만들 때 쓴다 */
export const RELATION_KNOWLEDGE_KEY = params.knowledgeKey.data as Readonly<Record<string, string>>;

// ── 룩업 (전부 tables.json) ───────────────────────────────────────────────
const TWELVE_SINSAL = tables.twelveSinsal.data as Record<string, Record<string, string>>;
const GONGMANG = tables.gongmang.data as Record<string, { xun: string; void: string[] }>;
const SAMJAE = tables.samjae.data as Record<string, string[]>;
const REL = tables.branchRelations.data;
const STEM_REL = tables.stemRelations.data;

/** 일간 기준 신살 (지지 목록) */
const BY_DAY_STEM: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  천을귀인: tables.cheoneulGwiin.data as Record<string, string[]>,
  문창귀인: toList(tables.munchangGwiin.data as Record<string, string>),
  학당귀인: Object.fromEntries(
    Object.entries(tables.hakdangGwiin.data as Record<string, { branch: string }>).map(([k, v]) => [
      k,
      [v.branch],
    ]),
  ),
  건록: toList(tables.geonrok.data as Record<string, string>),
  금여: toList(tables.geumyeo.data as Record<string, string>),
  암록: toList(tables.amrok.data as Record<string, string>),
  홍염살: toList(tables.hongyeom.data as Record<string, string>),
  양인살: toList(tables.yangin.data as Record<string, string>),
  비인살: toList(tables.biin.data as Record<string, string>),
};

/** 연지 기준 신살 (지지 1개) */
const BY_YEAR_BRANCH: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  고신: pick(tables.gosinGwasuk.data as Record<string, Record<string, string>>, '고신'),
  과숙: pick(tables.gosinGwasuk.data as Record<string, Record<string, string>>, '과숙'),
};

/** 월지 기준 신살. 값이 천간이면 4주 **천간**에서, 지지면 4주 **지지**에서 찾는다 (C04 §7-13 주석) */
const BY_MONTH_BRANCH: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  천덕귀인: tables.cheondeokGwiin.data as Record<string, string>,
  월덕귀인: tables.woldeokGwiin.data as Record<string, string>,
  월공귀인: tables.wolgongGwiin.data as Record<string, string>,
};

/** 60갑자 직접 매칭 신살 */
const BY_GANZHI: Readonly<Record<string, readonly string[]>> = {
  백호대살: tables.baekhoDaesal.data as string[],
  괴강: tables.goegang.data as string[],
  금신: tables.geumsin.data as string[],
};

function toList(row: Record<string, string>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, [v]]));
}
function pick(
  row: Record<string, Record<string, string>>,
  key: string,
): Record<string, string> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v[key]]));
}

const STEM_SET: ReadonlySet<string> = new Set<string>(STEMS);

// ── 단위 조회 ─────────────────────────────────────────────────────────────
/** 십이신살. `base` = 연지 또는 일지 (C00 §S4-4) */
export function sinsal12Of(base: Branch, target: Branch): Sinsal12 {
  const hit = TWELVE_SINSAL[base]?.[target];
  if (hit === undefined) {
    throw new EngineError('INVALID_INPUT', `십이신살 조회 실패: ${base}/${target}`);
  }
  return hit as Sinsal12;
}

/** 공망 — 일주 간지 기준 (C00 §3-D13) */
export function gongmangOf(dayGanji: string): { xun: string; voidBranches: [Branch, Branch] } {
  const hit = GONGMANG[dayGanji];
  if (hit === undefined) throw new EngineError('INVALID_INPUT', `공망 조회 실패: ${dayGanji}`);
  return { xun: hit.xun, voidBranches: [hit.void[0] as Branch, hit.void[1] as Branch] };
}

/** 삼재 3년 지지 — 연지 기준 */
export function samjaeOf(yearBranch: Branch): [Branch, Branch, Branch] {
  const hit = SAMJAE[yearBranch];
  if (hit === undefined) throw new EngineError('INVALID_INPUT', `삼재 조회 실패: ${yearBranch}`);
  return [hit[0] as Branch, hit[1] as Branch, hit[2] as Branch];
}

// ── 지지 관계 ─────────────────────────────────────────────────────────────
const YUKHAP = REL.육합.map as Record<string, string>;
const YUKHAP_HWA = REL.육합.hwa as Record<string, string>;
const YUKCHUNG = REL.육충.map as Record<string, string>;
const YUKHAE = REL.육해.map as Record<string, string>;
const YUKPA = REL.육파.map as Record<string, string>;
const WONJIN = REL.원진.map as Record<string, string>;
const GWIMUN = REL.귀문.map as Record<string, string>;
const SAMHAP = REL.삼합 as readonly { branches: string[]; hwa: string }[];
const BANGHAP = REL.방합 as readonly { branches: string[]; hwa: string }[];
const SAMHYEONG = REL.삼형 as readonly { branches: string[]; name: string }[];
const SANGHYEONG = REL.상형 as readonly string[][];
const JAHYEONG = REL.자형 as readonly string[];

/** 육합 조합키 정규화 — hwa 표의 키가 "子丑" 처럼 한 방향으로만 있다 */
function hapHwaOf(a: string, b: string): string | undefined {
  return YUKHAP_HWA[a + b] ?? YUKHAP_HWA[b + a];
}

interface Slot {
  key: PillarKey;
  stem: Stem;
  branch: Branch;
  ganji: string;
}

const pairAt = (a: Slot, b: Slot): string => `${PILLAR_KO[a.key]}-${PILLAR_KO[b.key]}`;
const listAt = (slots: readonly Slot[]): string => slots.map((s) => PILLAR_KO[s.key]).join('-');

/** 쌍 관계 6종 + 귀문. 대칭 표라 i<j 만 훑는다 */
function pairRelations(slots: readonly Slot[]): BranchRelation[] {
  const out: BranchRelation[] = [];
  const push = (type: BranchRelationType, a: Slot, b: Slot, hwa?: string): void => {
    out.push({
      type,
      pair: [a.branch, b.branch],
      at: pairAt(a, b),
      ...(hwa === undefined ? {} : { hwa: hwa as Element }),
      strength: REL_STRENGTH[type],
    });
  };
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i];
      const b = slots[j];
      if (YUKHAP[a.branch] === b.branch) push('육합', a, b, hapHwaOf(a.branch, b.branch));
      if (YUKCHUNG[a.branch] === b.branch) push('육충', a, b);
      if (YUKHAE[a.branch] === b.branch) push('육해', a, b);
      if (YUKPA[a.branch] === b.branch) push('육파', a, b);
      if (WONJIN[a.branch] === b.branch) push('원진', a, b);
      if (GWIMUN[a.branch] === b.branch) push('귀문', a, b);
    }
  }
  return out;
}

/**
 * 삼합 / 반합 / 공합.
 * C00 §3-D15 — 3자 완성은 `삼합`(1.0), 2자는 生旺·旺墓만 `반합`(1.0), 生墓 는 `공합`(0.4).
 * 旺地 = 삼합 3자 중 가운데(子午卯酉).
 */
function samhapRelations(slots: readonly Slot[]): BranchRelation[] {
  const out: BranchRelation[] = [];
  for (const set of SAMHAP) {
    const [sheng, wang, mu] = set.branches;
    const have = set.branches.map((b) => slots.filter((s) => s.branch === b));
    if (have.every((g) => g.length > 0)) {
      const members = [have[0][0], have[1][0], have[2][0]];
      out.push({
        type: '삼합',
        branches: set.branches as Branch[],
        at: listAt(members),
        hwa: set.hwa as Element,
        strength: REL_STRENGTH['삼합'],
      });
      continue;
    }
    const pairs: [string, string, BranchRelationType][] = [
      [sheng, wang, '반합'],
      [wang, mu, '반합'],
      [sheng, mu, '공합'],
    ];
    for (const [x, y, type] of pairs) {
      const gx = slots.filter((s) => s.branch === x);
      const gy = slots.filter((s) => s.branch === y);
      if (gx.length === 0 || gy.length === 0) continue;
      out.push({
        type,
        branches: [x as Branch, y as Branch],
        at: listAt([gx[0], gy[0]]),
        hwa: set.hwa as Element,
        strength: REL_STRENGTH[type],
      });
    }
  }
  return out;
}

/** 방합 — 3자 완성만 (C00 §3-D19) */
function banghapRelations(slots: readonly Slot[]): BranchRelation[] {
  const out: BranchRelation[] = [];
  for (const set of BANGHAP) {
    const have = set.branches.map((b) => slots.filter((s) => s.branch === b));
    if (!have.every((g) => g.length > 0)) continue;
    out.push({
      type: '방합',
      branches: set.branches as Branch[],
      at: listAt([have[0][0], have[1][0], have[2][0]]),
      hwa: set.hwa as Element,
      strength: REL_STRENGTH['방합'],
    });
  }
  return out;
}

/** 형 — 삼형(3자 1.0) / 상형(2자 0.5) / 자형(같은 지지 2개) (C00 §3-D18) */
function hyeongRelations(slots: readonly Slot[]): BranchRelation[] {
  const out: BranchRelation[] = [];
  const complete = new Set<string>();
  for (const set of SAMHYEONG) {
    const have = set.branches.map((b) => slots.filter((s) => s.branch === b));
    if (!have.every((g) => g.length > 0)) continue;
    complete.add(set.branches.join(''));
    out.push({
      type: '삼형',
      branches: set.branches as Branch[],
      at: listAt([have[0][0], have[1][0], have[2][0]]),
      name: set.name,
      strength: REL_STRENGTH['삼형'],
    });
  }
  for (const [x, y] of SANGHYEONG) {
    // 이미 삼형으로 완성된 조합의 부분쌍은 중복 계상하지 않는다
    const inComplete = [...complete].some((c) => c.includes(x) && c.includes(y));
    if (inComplete) continue;
    const gx = slots.filter((s) => s.branch === x);
    const gy = slots.filter((s) => s.branch === y);
    if (gx.length === 0 || gy.length === 0) continue;
    out.push({
      type: '형',
      pair: [x as Branch, y as Branch],
      at: pairAt(gx[0], gy[0]),
      strength: REL_STRENGTH['형'],
    });
  }
  for (const b of JAHYEONG) {
    const g = slots.filter((s) => s.branch === b);
    if (g.length < 2) continue;
    out.push({
      type: '자형',
      pair: [b as Branch, b as Branch],
      at: pairAt(g[0], g[1]),
      strength: REL_STRENGTH['자형'],
    });
  }
  return out;
}

/** 천간합·충·극 (C00 §3-D14, §3-D17) */
function stemRelationsOf(slots: readonly Slot[]): StemRelation[] {
  const out: StemRelation[] = [];
  const hap = STEM_REL.천간합 as readonly { pair: string[]; hwa: string; name: string }[];
  const chung = STEM_REL.천간충 as readonly string[][];
  const geuk = STEM_REL.천간극_비충 as readonly string[][];
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i];
      const b = slots[j];
      const two = [a.stem, b.stem];
      const match = (set: readonly string[]): boolean =>
        (set[0] === two[0] && set[1] === two[1]) || (set[0] === two[1] && set[1] === two[0]);
      const h = hap.find((x) => match(x.pair));
      if (h !== undefined) {
        out.push({
          type: '천간합',
          pair: [a.stem, b.stem],
          at: pairAt(a, b),
          hwa: h.hwa as Element,
          name: h.name,
        });
      }
      if (chung.some(match)) out.push({ type: '천간충', pair: [a.stem, b.stem], at: pairAt(a, b) });
      if (geuk.some(match)) out.push({ type: '천간극', pair: [a.stem, b.stem], at: pairAt(a, b) });
    }
  }
  return out;
}

// ── 신살 판정 ─────────────────────────────────────────────────────────────
function scoreOf(name: string): number {
  return SINSAL_SCORE[name] ?? 0;
}

/**
 * 관계로 나오는 신살 2종 → 신살 히트.
 *
 * 원진·귀문관살은 두 지지의 **관계**이므로 `branchRelations` 가 정본이지만, C04 §12-1 배점표가
 * 둘을 −3 으로 채점하고 지식카드도 `sinsal:원진`·`sinsal:귀문관살` 로 존재한다. 관계로만 내보내면
 * 그 두 장이 영원히 도달 불가가 되므로 히트 목록에도 같이 싣는다(같은 판정을 두 모양으로 내는 것이지
 * 두 번 판정하는 것이 아니다). 기둥은 이름별로 중복을 제거한다 — 한 기둥이 두 쌍에 동시에 들어가도
 * 배점은 한 번만 먹어야 하기 때문이다.
 */
function relationSinsal(relations: readonly BranchRelation[], slots: readonly Slot[]): SinsalHit[] {
  const NAME_OF: Readonly<Record<string, string>> = { 원진: '원진', 귀문: '귀문관살' };
  const byName = new Map<string, Set<PillarKey>>();
  for (const r of relations) {
    const name = NAME_OF[r.type];
    if (name === undefined || r.pair === undefined) continue;
    const set = byName.get(name) ?? new Set<PillarKey>();
    for (const s of slots) {
      if (s.branch === r.pair[0] || s.branch === r.pair[1]) set.add(s.key);
    }
    byName.set(name, set);
  }
  const out: SinsalHit[] = [];
  for (const [name, set] of byName) {
    out.push({
      name,
      pillars: PILLAR_KEYS.filter((k) => set.has(k)),
      basis: '지지쌍',
      score: scoreOf(name),
    });
  }
  return out;
}

function collectSinsal(slots: readonly Slot[], pillars: FourPillars): SinsalHit[] {
  const out: SinsalHit[] = [];
  const dayStem = pillars.day.stem;
  const yearBranch = pillars.year.branch;
  const monthBranch = pillars.month.branch;

  // 1) 일간 기준
  for (const [name, table] of Object.entries(BY_DAY_STEM)) {
    const want = table[dayStem];
    if (want === undefined) continue;
    const hits = slots.filter((s) => want.includes(s.branch)).map((s) => s.key);
    if (hits.length > 0) out.push({ name, pillars: hits, basis: '일간', score: scoreOf(name) });
  }

  // 2) 연지 기준
  for (const [name, table] of Object.entries(BY_YEAR_BRANCH)) {
    const want = table[yearBranch];
    const hits = slots.filter((s) => s.branch === want).map((s) => s.key);
    if (hits.length > 0) out.push({ name, pillars: hits, basis: '연지', score: scoreOf(name) });
  }

  // 3) 월지 기준 — 값이 천간이면 천간칸에서, 지지면 지지칸에서 찾는다
  for (const [name, table] of Object.entries(BY_MONTH_BRANCH)) {
    const want = table[monthBranch];
    const onStem = STEM_SET.has(want);
    const hits = slots.filter((s) => (onStem ? s.stem === want : s.branch === want)).map((s) => s.key);
    if (hits.length > 0) out.push({ name, pillars: hits, basis: '월지', score: scoreOf(name) });
  }

  // 4) 60갑자 직접 매칭 + dayPillarFirst 게이트 (C00 §3-D7) + 기둥 범위(금신)
  for (const [name, list] of Object.entries(BY_GANZHI)) {
    if (GATES[name] === 'dayPillarFirst' && !list.includes(pillars.day.ganji)) continue;
    const scope = PILLAR_SCOPE[name];
    const hits = slots
      .filter((s) => list.includes(s.ganji) && (scope === undefined || scope.includes(s.key)))
      .map((s) => s.key);
    if (hits.length > 0) out.push({ name, pillars: hits, basis: '간지', score: scoreOf(name) });
  }

  // 5) 공망 — 일주 기준, **일주 자신은 제외**한다 (C04 §8-7)
  const km = gongmangOf(pillars.day.ganji);
  const kongHits = slots.filter((s) => s.key !== 'day' && km.voidBranches.includes(s.branch)).map((s) => s.key);
  if (kongHits.length > 0) {
    out.push({
      name: '공망',
      pillars: kongHits,
      basis: '일주',
      detail: [...km.voidBranches],
      score: scoreOf('공망'),
    });
  }

  // 6) 십이신살 — **연지 기준**만 `sinsal` 목록에 넣는다.
  //    D12 는 두 기준을 다 "산출" 하라는 것이고(`sinsal12` 가 그 자리다), 점수는 한 번만 세야 한다.
  //    두 기준을 다 넣으면 같은 기둥이 이름만 다른 신살 두 개를 갖고 sinsalScore 가 두 배로 흔들린다.
  const byName = new Map<string, PillarKey[]>();
  for (const s of slots) {
    const n = sinsal12Of(yearBranch, s.branch);
    const arr = byName.get(n);
    if (arr === undefined) byName.set(n, [s.key]);
    else arr.push(s.key);
  }
  for (const [name, hits] of byName) {
    out.push({ name, pillars: hits, basis: '연지', score: scoreOf(name) });
  }

  // 일지 기준 십이신살은 `sinsal12[*].byDay` 로만 나간다 (점수 이중계상 방지)

  // 결정론적 순서: 이름 코드포인트 → 기둥 순서
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

// ── 점수 ──────────────────────────────────────────────────────────────────
/** C00 §S4-7 — clamp(0,100, 50 + Σ(score × pillarWeight) × 2) */
export function sinsalScoreOf(hits: readonly SinsalHit[]): number {
  let raw = 0;
  for (const h of hits) {
    for (const p of h.pillars) raw += h.score * PILLAR_WEIGHT[p];
  }
  return Math.min(SCORE_SHAPE.max, Math.max(SCORE_SHAPE.min, SCORE_SHAPE.base + raw * SCORE_SHAPE.gain));
}

/**
 * C00 §S4-7 — Σ(E[unseong] × w) / Σw.
 * 삼주 모드는 시주가 없으므로 **존재하는 기둥의 w 합**으로 나눈다(0..100 스케일 유지).
 */
export function unseongEnergyOf(unseong: Readonly<Record<PillarKey, Unseong | null>>): number {
  let sum = 0;
  let wsum = 0;
  for (const key of PILLAR_KEYS) {
    const u = unseong[key];
    if (u === null) continue;
    sum += UNSEONG_ENERGY[u] * PILLAR_WEIGHT[key];
    wsum += PILLAR_WEIGHT[key];
  }
  return wsum === 0 ? 0 : sum / wsum;
}

// ── 조립 ──────────────────────────────────────────────────────────────────
export function computeSinsalChart(pillars: FourPillars): SinsalChart {
  const slots: Slot[] = [];
  for (const key of PILLAR_KEYS) {
    const p: Pillar | null = pillars[key];
    if (p === null) continue;
    slots.push({ key, stem: p.stem, branch: p.branch, ganji: p.ganji });
  }

  const dayStem = pillars.day.stem;
  const yearBranch = pillars.year.branch;
  const dayBranch = pillars.day.branch;

  const unseong = {} as Record<PillarKey, Unseong | null>;
  const unseongByPillarStem = {} as Record<PillarKey, Unseong | null>;
  const sinsal12 = {} as Record<PillarKey, { byYear: Sinsal12; byDay: Sinsal12 } | null>;
  for (const key of PILLAR_KEYS) {
    const p = pillars[key];
    if (p === null) {
      unseong[key] = null;
      unseongByPillarStem[key] = null;
      sinsal12[key] = null;
      continue;
    }
    unseong[key] = unseongOf(dayStem, p.branch);
    unseongByPillarStem[key] = unseongOf(p.stem, p.branch);
    sinsal12[key] = {
      byYear: sinsal12Of(yearBranch, p.branch),
      byDay: sinsal12Of(dayBranch, p.branch),
    };
  }

  const branchRelations = [
    ...pairRelations(slots),
    ...samhapRelations(slots),
    ...banghapRelations(slots),
    ...hyeongRelations(slots),
  ];

  const sinsal = [...collectSinsal(slots, pillars), ...relationSinsal(branchRelations, slots)].sort(
    (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const km = gongmangOf(pillars.day.ganji);
  const gongmangHit = sinsal.find((h) => h.name === '공망');

  return {
    unseong,
    unseongByPillarStem,
    sinsal12,
    sinsal,
    gongmang: {
      basis: pillars.day.ganji,
      voidBranches: km.voidBranches,
      hits: gongmangHit === undefined ? [] : gongmangHit.pillars,
    },
    samjae: samjaeOf(yearBranch),
    branchRelations,
    stemRelations: stemRelationsOf(slots),
    sinsalScore: sinsalScoreOf(sinsal),
    unseongEnergy: unseongEnergyOf(unseong),
  };
}
