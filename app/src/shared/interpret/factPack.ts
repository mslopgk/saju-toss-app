/**
 * 팩트팩 — 차트에서 **서술에 필요한 사실만 투영**한 결정론적 구조체.
 *
 * 근거: C00 §H(점수·간지는 계산이 확정하고 LLM 은 문장만 쓴다) · C00 §7.4(출력 실수 양자화)
 *       문서10 §5.1 [1]~[2] 계층(계산·부품선택 레이어에서 LLM 금지)
 *
 * 설계 원칙 — **여기서 새 수치를 만들지 않는다.**
 *   차트 필드를 고르고, 이름을 바꾸고, C00 §7.4 가 요구하는 양자화만 한다.
 *   임계값 판정(예: "부족 오행 < 0.5")·가중합·일치도 점수는 전부 계산 엔진의 몫이며,
 *   C00 에 정의가 없는 지표는 여기서 만들지 않고 docs/interpretation.md 의 미해결 항목에 남긴다.
 *
 * 두 번째 원칙 — **없는 걸 있는 척하지 않는다.**
 *   지금 엔진은 신살(S4-2)·신강신약(S5)·별자리(S7)를 **모두 채운다.** 그래도 세 섹션은 계속
 *   옵셔널로 다룬다 — 저장된 구버전 결과·픽스처·삼주 이전 차트가 들어와도 리포트가 깨지면 안 되고,
 *   그때 무엇이 빠졌는지는 `missingSections` 가 이름으로 남긴다.
 *   (실제 `computeChart()` 출력에서는 `missingSections` 가 항상 빈 배열이다 — `e2e.test.ts` 가 고정한다.)
 */

import tables from '../data/tables.json';
import type {
  BloodType,
  ChartLike,
  Element,
  EngineWarning,
  Gender,
  PillarKey,
  ReportKind,
  SignIdx,
  StrengthGrade,
  TenGod,
  TenGodGroup,
  Unseong,
  UserProfile,
  YongsinRoute,
  ZodiacElement,
} from './contracts';

/**
 * 천간 → 오행. **표를 손으로 옮겨 적지 않는다** — 엔진과 같은 `tables.json` 을 읽는다(C00 §F6).
 * `lib/saju/constants.ts` 를 대신 import 하지 않는 이유는 UI 진입점의 값 그래프를 좁게 유지하기 위해서다
 * (`ui.test.ts` 가 그 그래프를 고정한다). JSON 은 코드를 끌고 오지 않는다.
 */
const STEM_ELEMENT = tables.ganElementYinYang.data as Readonly<
  Record<string, { readonly element: string }>
>;

/**
 * 지지 → 오행(體 음양 기준). 같은 `tables.json` 에서 읽는다.
 * 쓰임: 융합 섹션의 "일간 오행 vs 월지 오행" 비교 한 자리뿐이다(문서10 §3.3 「사주 내부 상충」).
 * 판정이 아니라 룩업이다 — 어느 쪽이 세다/약하다를 여기서 정하지 않는다.
 */
const BRANCH_ELEMENT = tables.zhiElementYinYang.data as Readonly<
  Record<string, { readonly element: string }>
>;

/** 대운 방향 카드(`daewoonDirection:*`)의 키 표기. 카드 key 와 글자 단위로 같아야 한다. */
const DAEWOON_DIRECTION: Readonly<Record<`${Gender}${'F' | 'B'}`, string>> = {
  // 순행(forward) = 陽男 · 陰女 / 역행 = 陰男 · 陽女 (C06 §3)
  MF: '양남(陽男)',
  MB: '음남(陰男)',
  FF: '음녀(陰女)',
  FB: '양녀(陽女)',
};

/** 12궁 → 4원소. Aries 부터 4주기 반복(불·흙·공기·물)이라는 표준 배정. 문서10 §2.4 */
const ZODIAC_ELEMENTS: readonly ZodiacElement[] = ['fire', 'earth', 'air', 'water'];

/**
 * SignIdx → 사인 id. C07 의 0=Aries 순서를 그대로 따른다.
 * 지식카드 `zodiac` 의 key 가 이 id 이므로(예: `leo`), 검색 태그도 한글명이 아니라 이 값을 쓴다.
 */
export const ZODIAC_SIGN_IDS: readonly string[] = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
];

/** C00 §7.4: 점수·서브점수는 round(x*1000)/1000 로 양자화한 뒤 직렬화/해시한다. */
export function quantizeScore(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * 천간 한 글자 → 오행. 표에 없는 글자는 들어올 수 없지만(엔진이 60갑자만 낸다),
 * `noUncheckedIndexedAccess` 아래서 단언 대신 木 으로 떨어뜨린다 — 예외를 던져 리포트를 죽이지 않는다.
 */
export function elementOfStem(stem: string): Element {
  return (STEM_ELEMENT[stem]?.element ?? '木') as Element;
}

/** 지지 한 글자 → 오행. `elementOfStem` 과 같은 이유로 예외 대신 木 폴백이다. */
export function elementOfBranch(branch: string): Element {
  return (BRANCH_ELEMENT[branch]?.element ?? '木') as Element;
}

/** 성별 × 순행여부 → 대운 방향 표기. 판정이 아니라 두 값의 조합 표기다. */
export function daewoonDirectionKeyOf(gender: Gender, forward: boolean): string {
  return DAEWOON_DIRECTION[`${gender}${forward ? 'F' : 'B'}`];
}

export function zodiacElementOf(sign: SignIdx): ZodiacElement {
  // 인덱스 나머지 연산이므로 배열 접근이 항상 성립하지만, noUncheckedIndexedAccess 대비로 단언 대신 폴백을 둔다.
  return ZODIAC_ELEMENTS[sign % 4] ?? 'fire';
}

export function zodiacSignIdOf(sign: SignIdx): string {
  return ZODIAC_SIGN_IDS[sign] ?? 'aries';
}

/** 차트에 없어서 건너뛴 섹션 이름. 팩트팩·프롬프트·화면이 같은 어휘를 쓴다. */
export type FactSection = 'sinsal' | 'strength' | 'astro';

/**
 * 신살 한 건. **판정 결과만** 옮긴다 — 점수·기둥 가중은 읽지 않는다(C00 §H).
 * `name` 은 지식카드 `sinsal:*` 의 key 이고, 길흉 분류는 그 카드 제목이 들고 있다.
 */
export interface FactPackSinsalHit {
  readonly name: string;
  /** 히트한 기둥. 엔진이 주지 않으면 빈 배열(= "어디인지 말하지 않는다"). */
  readonly pillars: readonly PillarKey[];
}

export interface FactPackStrength {
  readonly elementScores: Readonly<Record<Element, number>>;
  /**
   * 오행 점수의 백분율. **엔진 값에서 유도한 것이지 새 지표가 아니다** — 합이 정확히 80 이라
   * (§5.2 S5 게이트) 나눗셈이 잘 정의된다.
   *
   * 왜 굳이 미리 주는가: 모델이 분포를 설명할 때 퍼센트를 쓰려는 성향이 강하다. 금지 문구를
   * 두 번 강화해도 계속 새로 만들어 냈고(실측 2026-08-19: `15%` → 막으니 `20%`), 그때마다
   * 가드가 카드를 거부해 폴백이 났다. 금지하는 대신 **올바른 값을 주는** 것이 이 프로젝트의
   * 원칙("숫자는 엔진이 확정한다")에 맞고, 모델이 스스로 나누지 않으니 반올림도 어긋나지 않는다.
   *
   * 반올림 때문에 합이 99 나 101 이 될 수 있다. 분포를 말하는 데는 무해하고, 합을 주장하는
   * 문장은 원래 금지 대상이다.
   */
  readonly elementPercent: Readonly<Record<Element, number>>;
  readonly strengthIndex: number;
  readonly strengthGrade: StrengthGrade;
  readonly isStrong: boolean;
  /** 일지 십이운성(거법·일간 기준). 지식카드 `unseong:*` 의 조회 키다. */
  readonly unseongIlji: Unseong;
  readonly geokguk: string;
  readonly yongsin: {
    readonly primary: Element;
    readonly favorable: readonly Element[];
    readonly avoid: readonly Element[];
    readonly route: YongsinRoute;
  };
}

/**
 * 한 기둥의 십신 룩업 결과. C00 §S4-1 이 확정한 **이름**이며 여기서 판정하지 않는다.
 * `stem === '일간'` 은 일주 천간(기준점 자신), `null` 은 삼주 모드의 시주(칸이 아예 없다).
 */
export interface FactPackTenGodPlacement {
  readonly pillar: PillarKey;
  readonly stem: TenGod | '일간' | null;
  readonly branchMain: TenGod | null;
}

export interface FactPackSaju {
  readonly gz8: string;
  readonly threePillarMode: boolean;
  readonly yearGanji: string;
  readonly monthGanji: string;
  readonly dayGanji: string;
  readonly hourGanji: string | null;
  readonly dayStem: string;
  /**
   * 일간의 오행. `tables.json > ganElementYinYang` 룩업이며 판정이 아니다.
   * 억부 지식카드(`yongsinBufu:木:신강` 10장)의 조회 축이자, 용신 오행을 십신 자리로 옮겨 읽는 기준이다.
   */
  readonly dayElement: Element;
  readonly dayBranch: string;
  readonly monthBranch: string;
  /**
   * 월지의 오행. `tables.json > zhiElementYinYang` 룩업이며 판정이 아니다.
   * 융합 섹션이 "타고난 결(일간)과 태어난 계절(월지)이 같은 쪽을 가리키는가"를 볼 때만 쓴다.
   */
  readonly monthElement: Element;
  readonly tenGodWeights: Readonly<Record<TenGodGroup, number>>;
  /** 가중치 최댓값 그룹. 동점이면 고정 순서(비겁→식상→재성→관성→인성)로 앞선 쪽. */
  readonly dominantTenGod: TenGodGroup;
  /** 기둥별 십신 이름. 연→월→일→시 고정 순서. */
  readonly tenGodPlacements: readonly FactPackTenGodPlacement[];
  /**
   * 원국에 **실제로 등장하는** 십신 이름(중복 제거·코드포인트 정렬). `일간` 은 제외한다.
   *
   * 왜 필요한가: `tenGod:재성` 태그로 검색하면 재성 그룹 카드(정재·편재)가 **둘 다** 뽑히는데,
   * 그 중 원국에 없는 십신도 섞인다. 그 카드로 문장을 쓰면 없는 사실을 말하게 되므로
   * 서술 레이어가 이 목록으로 카드를 한 번 더 걸러야 한다.
   */
  readonly tenGodNames: readonly TenGod[];
  /** S5 미구현이면 null. */
  readonly strength: FactPackStrength | null;
  /** 차트에 신살이 없으면 null(빈 배열이 아니다 — "신살이 없다"와 "아직 계산하지 않는다"는 다르다). */
  readonly sinsalNames: readonly string[] | null;
  /**
   * 신살 판정 결과 전량. `sinsalNames` 는 **검색 태그용 이름 집합**(중복 제거·정렬)이고,
   * 이쪽은 **서술용**이라 어느 기둥에 붙었는지까지 들고 있다. 순서는 엔진 배열 순서 그대로다
   * (엔진이 결정론적으로 내므로 여기서 다시 정렬해 순서를 만들지 않는다).
   */
  readonly sinsalHits: readonly FactPackSinsalHit[] | null;
  /** 대운 순행 여부(C06 §3). `daewoonDirectionKey` 를 만드는 두 재료 중 하나다. */
  readonly daewoonForward: boolean;
  /** `양남(陽男)` 같은 대운 방향 표기. 지식카드 `daewoonDirection:*` 의 조회 키다. */
  readonly daewoonDirectionKey: string;
  readonly daewoon: readonly {
    readonly index: number;
    readonly ganji: string;
    readonly startAgeWestern: number;
    readonly endAgeWestern: number;
  }[];
}

export interface FactPackAstro {
  readonly sunSignKo: string;
  readonly sunSign: SignIdx;
  /** 카드 key 와 같은 사인 id(`leo`). 검색 태그는 이 값을 쓴다. */
  readonly sunSignId: string;
  readonly sunElement: ZodiacElement;
  /** 생시를 몰라 경계에 걸릴 때 함께 적어야 하는 다른 궁(C00 §3-G15b). 없으면 null. */
  readonly sunAlsoSignKo: string | null;
  readonly moonSignKo: string | null;
  readonly moonSignId: string | null;
  readonly moonAlsoSignKo: string | null;
  /** 생시를 몰라 12:00 을 가정했는가. 달은 하루에 한 궁 가까이 움직여 이 사실을 밝혀야 한다. */
  readonly moonAssumedNoon: boolean;
  readonly ascSignKo: string | null;
  readonly ascSignId: string | null;
}

export interface FactPack {
  readonly v: 1;
  readonly kind: ReportKind;
  readonly engineVersion: string;
  readonly gender: Gender;
  readonly mbti: string | null;
  readonly blood: BloodType | null;
  readonly saju: FactPackSaju;
  /** S7 미구현이면 null. */
  readonly astro: FactPackAstro | null;
  /** 차트에 없어서 건너뛴 섹션. 코드포인트 정렬. */
  readonly missingSections: readonly FactSection[];
  /** 엔진 경고 문자열 유니온 그대로. 코드포인트 정렬 + 중복 제거. */
  readonly warnings: readonly EngineWarning[];
}

const TEN_GOD_ORDER: readonly TenGodGroup[] = ['비겁', '식상', '재성', '관성', '인성'];
const ELEMENT_ORDER: readonly Element[] = ['木', '火', '土', '金', '水'];
/** 기둥 순서. 연→월→일→시. 화면·문장이 모두 이 순서를 따른다. */
const PILLAR_ORDER: readonly PillarKey[] = ['year', 'month', 'day', 'hour'];

function dominantTenGodOf(weights: Readonly<Record<TenGodGroup, number>>): TenGodGroup {
  let best: TenGodGroup = '비겁';
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const group of TEN_GOD_ORDER) {
    const value = weights[group];
    // 엄격한 `>` 라서 동점이면 TEN_GOD_ORDER 상 앞선 그룹이 유지된다(결정론적 타이브레이크).
    if (value > bestValue) {
      best = group;
      bestValue = value;
    }
  }
  return best;
}

/**
 * 오행 점수 → 백분율. 분모는 **고정 80** 이다(§5.2 게이트가 합을 80.00 으로 보장한다).
 * 실제 합으로 나누지 않는 이유: 합이 80 이 아닌 상태는 불변식 위반이고, 그때 조용히
 * 다른 분모로 나누면 위반이 숫자에 묻혀 드러나지 않는다.
 */
const ELEMENT_SCORE_TOTAL = 80;

function percentRecord(
  source: Readonly<Record<Element, number>>,
): Readonly<Record<Element, number>> {
  const out = {} as Record<Element, number>;
  for (const key of ELEMENT_ORDER) {
    out[key] = Math.round((source[key] / ELEMENT_SCORE_TOTAL) * 100);
  }
  return out;
}

function quantizeRecord<K extends string>(
  source: Readonly<Record<K, number>>,
  keys: readonly K[],
): Readonly<Record<K, number>> {
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = quantizeScore(source[key]);
  return out;
}

/**
 * 차트 + 프로필 → 팩트팩. 순수함수.
 * 같은 입력이면 항상 비트 단위로 같은 결과를 낸다(정렬·양자화 모두 고정).
 */
export function buildFactPack(
  chart: ChartLike,
  profile: UserProfile,
  kind: ReportKind,
): FactPack {
  const { pillars, strength, sinsal, luck, astro, tenGods } = chart;

  const missing: FactSection[] = [];
  if (sinsal === undefined) missing.push('sinsal');
  if (strength === undefined) missing.push('strength');
  if (astro === undefined) missing.push('astro');

  const placements: FactPackTenGodPlacement[] = PILLAR_ORDER.map((pillar) => {
    const cell = tenGods.byPillar[pillar];
    return { pillar, stem: cell.stem, branchMain: cell.branchMain };
  });
  const names = new Set<TenGod>();
  for (const p of placements) {
    if (p.stem !== null && p.stem !== '일간') names.add(p.stem);
    if (p.branchMain !== null) names.add(p.branchMain);
  }

  return {
    v: 1,
    kind,
    engineVersion: chart.engineVersion,
    gender: profile.gender,
    mbti: profile.mbti,
    blood: profile.blood,
    saju: {
      gz8: pillars.gz8,
      threePillarMode: pillars.threePillarMode,
      yearGanji: pillars.year.ganji,
      monthGanji: pillars.month.ganji,
      dayGanji: pillars.day.ganji,
      hourGanji: pillars.hour === null ? null : pillars.hour.ganji,
      dayStem: pillars.day.stem,
      dayElement: elementOfStem(pillars.day.stem),
      dayBranch: pillars.day.branch,
      monthBranch: pillars.month.branch,
      monthElement: elementOfBranch(pillars.month.branch),
      tenGodWeights: quantizeRecord(tenGods.groupWeights, TEN_GOD_ORDER),
      dominantTenGod: dominantTenGodOf(tenGods.groupWeights),
      tenGodPlacements: placements,
      tenGodNames: [...names].sort(compareCodepoint),
      strength:
        strength === undefined
          ? null
          : {
              elementScores: quantizeRecord(strength.strength.scores, ELEMENT_ORDER),
              elementPercent: percentRecord(strength.strength.scores),
              strengthIndex: quantizeScore(strength.strength.SI),
              strengthGrade: strength.strength.grade,
              isStrong: strength.strength.isStrong,
              unseongIlji: strength.strength.deuk.unseongIlji,
              geokguk: strength.geokguk.name,
              yongsin: {
                primary: strength.yongsin.primary,
                favorable: [...strength.yongsin.favorable],
                avoid: [...strength.yongsin.avoid],
                route: strength.yongsin.route,
              },
            },
      // 신살 이름은 중복 제거 후 코드포인트 정렬 — localeCompare 는 결정론을 깨므로 쓰지 않는다.
      sinsalNames:
        sinsal === undefined ? null : [...new Set(sinsal.sinsal.map((s) => s.name))].sort(compareCodepoint),
      sinsalHits:
        sinsal === undefined
          ? null
          : sinsal.sinsal.map((s) => ({ name: s.name, pillars: [...(s.pillars ?? [])] })),
      daewoonForward: luck.daewoon.forward,
      daewoonDirectionKey: daewoonDirectionKeyOf(profile.gender, luck.daewoon.forward),
      daewoon: luck.daewoon.pillars
        .filter((p): p is typeof p & { ganji: string } => p.ganji !== null)
        .map((p) => ({
          index: p.index,
          ganji: p.ganji,
          startAgeWestern: p.startAgeWestern,
          endAgeWestern: p.endAgeWestern,
        })),
    },
    astro:
      astro === undefined
        ? null
        : {
            sunSignKo: astro.sun.signKo,
            sunSign: astro.sun.sign,
            sunSignId: zodiacSignIdOf(astro.sun.sign),
            sunElement: zodiacElementOf(astro.sun.sign),
            sunAlsoSignKo: astro.sun.alsoSignKo ?? null,
            moonSignKo: astro.moon === null ? null : astro.moon.signKo,
            moonSignId: astro.moon === null ? null : zodiacSignIdOf(astro.moon.sign),
            moonAlsoSignKo: astro.moon?.alsoSignKo ?? null,
            moonAssumedNoon: astro.moon?.assumedNoon ?? false,
            ascSignKo: astro.asc === null ? null : astro.asc.signKo,
            ascSignId: astro.asc === null ? null : zodiacSignIdOf(astro.asc.sign),
          },
    missingSections: missing,
    warnings: [...new Set(chart.warnings)].sort(compareCodepoint),
  };
}

/** UTF-16 코드유닛 비교. `Intl`/`localeCompare` 는 C00 §7.4 에서 금지. */
export function compareCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 차트에 실제로 등장하는 간지의 집합.
 * `guard.ts` 가 "LLM 이 없는 간지를 지어냈는지" 판정할 때 쓰는 허용 목록이다.
 */
export function ganjiAllowList(fact: FactPack): ReadonlySet<string> {
  const set = new Set<string>();
  for (const g of [
    fact.saju.yearGanji,
    fact.saju.monthGanji,
    fact.saju.dayGanji,
    fact.saju.hourGanji,
  ]) {
    if (g !== null) set.add(g);
  }
  for (const d of fact.saju.daewoon) set.add(d.ganji);
  return set;
}

/**
 * 리포트에서 인용해도 되는 수치의 문자열 집합(`N점` / `N%` 검사용).
 * 팩트팩에 없는 숫자를 "78점" 처럼 쓰면 지어낸 것이므로 거부한다.
 *
 * `tenGodWeights`(엔진 `groupWeights`)는 **S5 구현과 함께 허용 목록에 들어왔다.** 예전에는 엔진이
 * "임시 정의(합 7.0)"라고 밝힌 값이라 제외했지만, 지금은 S5 의 정식 오행 배점(합 80.00 / 삼주 62.00)을
 * 십신 그룹으로 접은 것이고 `elementScores` 와 같은 체계다 — 같은 숫자를 한쪽만 막을 이유가 없다.
 * (C00 §S5-1 · `docs/interpretation.md` §7.4)
 */
export function numberAllowList(fact: FactPack): ReadonlySet<string> {
  const set = new Set<string>();
  const add = (n: number): void => {
    set.add(String(n));
    set.add(String(Math.round(n)));
  };
  for (const g of TEN_GOD_ORDER) add(fact.saju.tenGodWeights[g]);
  const strength = fact.saju.strength;
  if (strength !== null) {
    add(strength.strengthIndex);
    for (const e of ELEMENT_ORDER) {
      add(strength.elementScores[e]);
      // 팩트팩에 담아 보내는 값이므로 허용목록에도 함께 올린다. 한쪽만 하면
      // 모델이 우리가 준 숫자를 그대로 썼는데 가드가 거부하는 모순이 생긴다.
      add(strength.elementPercent[e]);
    }
  }
  for (const d of fact.saju.daewoon) {
    add(d.startAgeWestern);
    add(d.endAgeWestern);
  }
  return set;
}
