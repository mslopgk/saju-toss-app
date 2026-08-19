/**
 * 지식 카드 검색 — 팩트팩 → 질의 태그 → 카드 선별.
 *
 * 근거: 문서10 §5.1 [2] 부품 선택 레이어(규칙·시드 결정론) · §4.2 조합 폭발 해결
 *
 * 이 단계는 **임베딩·벡터 검색이 아니라 태그 정확일치**다. 이유:
 *   ① 결정론이 필수다(같은 사주 → 같은 카드 → L2 캐시 히트). 임베딩은 모델 버전이 바뀌면 결과가 흔들린다.
 *   ② 검색 대상이 수천 건 수준이라 근사 최근접이 필요 없다.
 *   ③ 왜 이 카드가 뽑혔는지 사용자·QA 에게 설명할 수 있어야 한다.
 *
 * ⚠ **태그 규약은 양쪽이 글자 단위로 같아야 한다.**
 *   카드 쪽 생성기: `scripts/build-knowledge.mjs` 의 `tagsOf()`
 *   질의 쪽 생성기: 이 파일의 `queryTagsOf()`
 *   어긋나면 에러 없이 빈 배열이 나오고 리포트가 통째로 폴백된다 → `retrieve.test.ts` 가 두 축 집합을 대조해 막는다.
 */

import type { FactPack } from './factPack';
import { compareCodepoint } from './factPack';
import type { Confidence, KnowledgeCard, KnowledgeKind } from './contracts';

export interface RetrievalOptions {
  /** 총 카드 상한. 프롬프트 토큰과 직결된다. */
  readonly maxCards?: number;
  /** 한 체계가 프롬프트를 독점하지 못하게 하는 체계별 상한. */
  readonly maxPerSystem?: number;
  /**
   * 한 **분류**가 체계 예산을 독점하지 못하게 하는 분류별 상한. 생략하면 체계 상한과 같다(=무제한).
   *
   * 왜 필요해졌나: 사주 체계 하나에 7개 kind 가 들어 있는데, 십신 카드는 10장이고 그중 여럿이
   * 두 태그(`sipsin:편재` + `tenGod:재성`)로 2히트를 받는다. 상한이 체계 단위뿐이면 십신만으로
   * 예산이 차고 일간·십이운성·격국 카드가 한 장도 못 들어온다.
   */
  readonly maxPerKind?: number;
}

/**
 * 프롬프트 경로의 기본 예산.
 *
 * `maxPerSystem` 이 4 였던 것은 사주 체계가 kind 3종(일간·지지·십신)이던 시절의 값이다.
 * S5 가 붙어 십이운성·용신·대운방향까지 7종이 됐으므로 kind 수에 맞춰 7로 올린다.
 * (규칙 기반 리포트 경로는 토큰을 쓰지 않으므로 `features/report` 가 훨씬 넓은 값을 넘긴다.)
 */
const DEFAULT_MAX_CARDS = 16;
const DEFAULT_MAX_PER_SYSTEM = 7;
const DEFAULT_MAX_PER_KIND = 2;

/** 근거 등급 → 정렬 우선순위(작을수록 우선). 지식베이스의 `Confidence` 4단계를 그대로 쓴다. */
const CONFIDENCE_RANK: Readonly<Record<Confidence, number>> = { A: 0, B: 1, C: 2, D: 3 };

/** 분류 정렬 순서. 리포트 IA(문서10 §8) 의 카드 순서와 맞춘다. */
const KIND_RANK: Readonly<Record<KnowledgeKind, number>> = {
  ilgan: 0,
  jiji: 1,
  sipsin: 2,
  unseong: 3,
  sinsal: 4,
  yongsin: 5,
  daewoon: 6,
  zodiac: 7,
  mbti: 8,
  blood: 9,
  fusion: 10,
};

/** 리포트 체계. 사주 계열 7개 kind 가 한 체계로 묶여야 체계별 상한이 의미를 갖는다. */
export type CardSystem = 'saju' | 'zodiac' | 'mbti' | 'blood' | 'fusion';

const SYSTEM_OF_KIND: Readonly<Record<KnowledgeKind, CardSystem>> = {
  ilgan: 'saju',
  jiji: 'saju',
  sipsin: 'saju',
  unseong: 'saju',
  sinsal: 'saju',
  yongsin: 'saju',
  daewoon: 'saju',
  zodiac: 'zodiac',
  mbti: 'mbti',
  blood: 'blood',
  fusion: 'fusion',
};

export function systemOfKind(kind: KnowledgeKind): CardSystem {
  return SYSTEM_OF_KIND[kind];
}

/**
 * `queryTagsOf` 가 만들 수 있는 태그 축의 전부.
 * 카드 쪽 축 집합과의 대조는 `retrieve.test.ts` 가 고정한다(한쪽만 이름이 바뀌면 테스트가 깨진다).
 */
export const QUERY_TAG_AXES = [
  'ascSign',
  'blood',
  'bloodDisclaimer',
  'daewoonDirection',
  'daewoonNote',
  'dayBranch',
  'dayStem',
  'fusionConflict',
  'fusionCopy',
  'fusionElement',
  'fusionNote',
  'geokguk',
  'mbti',
  'mbtiAxis',
  'monthBranch',
  'moonSign',
  'sinsal',
  'sipsin',
  'strengthGrade',
  'tenGod',
  'unseong',
  'yongsinBufu',
  'yongsinRoute',
  'zodiac',
  'zodiacElement',
] as const;

/**
 * 조건 없이 항상 발행하는 태그.
 *
 * "질의 축"이라기보다 **리포트가 늘 밟는 자리**의 근거 카드다. 카드 쪽 값이 리서치 문서의 표 셀에서
 * 오므로 문자열을 여기 박아 두고, `scripts/build-knowledge.mjs` 의 `REQUIRED_TAGS` 가 같은 문자열의
 * 카드가 실제로 구워졌는지 빌드 시점에 확인한다(둘 중 하나만 바뀌면 빌드가 죽는다).
 *
 *   bloodDisclaimer:all  혈액형·MBTI·별자리 면책의 출처 카드. 세 체계를 함께 말하는 자리에서 인용한다.
 *   fusionNote:교집합    문서10 §3.4 교집합 규칙. `intersection` 섹션의 근거다.
 *   fusionNote:가중치    문서10 §3.1 — 혈액형 기여 0(톤만). 왜 혈액형이 비교에서 빠지는지의 근거다.
 *   fusionConflict:사주 내부 상충
 *                        일간 오행 vs 월지 오행 비교는 자기신고 값이 없어도 항상 가능하다.
 *   fusionCopy:4단구조   문서10 §6.2 — 관찰→양가→재해석→행동. 리포트의 **읽는 순서** 자체다.
 *   fusionCopy:금지어    문서10 §6.3 — 단정 예언·의료 유사 표현 금지. 리포트가 무엇을 말하지 **않는지**의 근거다.
 *
 * 뒤 두 장이 여기 들어온 이유는 `daewoonNote:*`(만나이 표기·5년 분할 금지) 와 같다. 저작 규칙이라도
 * **사용자가 화면에서 겪는 선택**을 정하는 규칙이면 그 선택을 말할 때 출처를 밝힌다. 두 카드가 정하는
 * 선택은 각각 "각 항목을 어떤 순서로 읽게 되는가"(§6.2)와 "무엇을 말하지 않는가"(§6.3)이고,
 * 둘 다 `template.ts` 가 실제로 한 문장씩 밝힌다. 밝히지 않는 저작 규칙(일치도 라벨 등)은 여기 없다.
 */
const ALWAYS_TAGS: readonly string[] = [
  'bloodDisclaimer:all',
  'fusionNote:교집합',
  'fusionNote:가중치',
  'fusionConflict:사주 내부 상충',
  'fusionCopy:4단구조',
  'fusionCopy:금지어',
];

/**
 * 팩트팩에서 질의 태그를 만든다. 카드의 `tags` 와 정확일치로 매칭된다.
 * 태그 형식은 `축:값` 으로 고정한다 — 카드 저작자가 지켜야 할 유일한 규약이다.
 *
 * 값 표기는 **계산 엔진 출력이 정본**이다:
 *   - 별자리는 한글명(`사자자리`)이 아니라 사인 id(`leo`) — 카드 key 가 id 이기 때문이다.
 *   - 용신 도출 경로는 엔진 유니온(`抑扶+格局`) — 카드 표기(`억부(抑扶)`)를 태그로 쓰지 않는다.
 *   - 십신은 **두 축을 함께** 낸다. 그룹 축(`tenGod:재성`)은 우세 그룹의 카드를 넓게 끌어오고,
 *     10신 축(`sipsin:편재`)은 원국에 **실제로 앉은** 십신만 집는다. 카드는 두 태그를 다 달고 있어
 *     (`sipsin:편재` + `tenGod:재성`) 실재하는 십신이 자연히 2히트로 앞선다 — 없는 십신으로 문장을
 *     쓰는 사고를 검색 단계에서 한 번 더 눌러 준다.
 *
 * 차트에 없는 섹션(신강신약·신살·별자리)은 태그를 만들지 않는다 — 없는 걸 있는 척하지 않는다.
 *
 * 융합 축(`fusion*`)의 규칙: **"그 비교를 할 수 있는가"** 로만 발행하고 **"어긋났는가"** 는 보지 않는다.
 * 어긋남 여부는 카드가 들고 있는 대응표(오행↔MBTI 축, 별자리 원소↔융 4기능)를 읽어야 알 수 있는데,
 * 검색 단계는 카드 본문을 볼 수 없다. 판정을 여기로 끌어오면 대응표가 두 벌이 된다 —
 * 검색은 "재료를 모으는 층", 서술(`template.ts`)이 "결과를 읽는 층"으로 자른다(문서10 §5.1 [2]/[3]).
 */
export function queryTagsOf(fact: FactPack): readonly string[] {
  const tags: string[] = [
    ...ALWAYS_TAGS,
    `dayStem:${fact.saju.dayStem}`,
    `dayBranch:${fact.saju.dayBranch}`,
    `monthBranch:${fact.saju.monthBranch}`,
    `tenGod:${fact.saju.dominantTenGod}`,
    // 대운 방향은 S6 가 이미 확정한 값이다(연간 음양 × 성별). 조회 축이 없어 4장이 놀고 있었다.
    `daewoonDirection:${fact.saju.daewoonDirectionKey}`,
    // 오행↔MBTI 축 대응표. 일간(타고난 결)과 월지(태어난 계절) 두 자리를 비교하므로 두 장을 부른다.
    `fusionElement:${fact.saju.dayElement}`,
    `fusionElement:${fact.saju.monthElement}`,
  ];

  // 대운 서술 지침 2장 — 만나이 표기·5년 분할 금지. 대운 구간이 실제로 있을 때만 근거가 된다.
  if (fact.saju.daewoon.length > 0) {
    tags.push('daewoonNote:나이기준', 'daewoonNote:5년분할');
  }

  for (const name of fact.saju.tenGodNames) tags.push(`sipsin:${name}`);

  const strength = fact.saju.strength;
  if (strength !== null) {
    tags.push(`strengthGrade:${strength.strengthGrade}`);
    tags.push(`geokguk:${strength.geokguk}`);
    tags.push(`yongsinRoute:${strength.yongsin.route}`);
    // 십이운성 12장은 S5 의 일지 운성이 유일한 조회 축이다(거법·일간 기준, C04 §5-5).
    tags.push(`unseong:${strength.unseongIlji}`);
    // 억부 카드 10장 = 일간오행 × 신강/신약. 카드 key 가 `억부:木:신약` 이라 값도 2단이다.
    tags.push(`yongsinBufu:${fact.saju.dayElement}:${strength.isStrong ? '신강' : '신약'}`);
  }

  for (const name of fact.saju.sinsalNames ?? []) tags.push(`sinsal:${name}`);

  const astro = fact.astro;
  if (astro !== null) {
    tags.push(`zodiac:${astro.sunSignId}`);
    tags.push(`zodiacElement:${astro.sunElement}`);
    if (astro.moonSignId !== null) tags.push(`moonSign:${astro.moonSignId}`);
    if (astro.ascSignId !== null) tags.push(`ascSign:${astro.ascSignId}`);
    // 별자리는 월지를 약 15일 시프트한 같은 12분할이다(문서10 §2.6). 별자리를 말하는 자리에서
    // 그 중복을 함께 밝히지 않으면 "새 정보"로 읽힌다.
    tags.push('fusionNote:별자리중복');
  }

  if (fact.mbti !== null) {
    tags.push(`mbti:${fact.mbti}`);
    // 16유형 카드가 없어도 축 카드로 폴백되게 4축을 개별 태그로도 낸다.
    for (let i = 0; i < fact.mbti.length; i += 1) {
      tags.push(`mbtiAxis:${i}${fact.mbti[i] ?? ''}`);
    }
    // 자기신고 유형이 있어야 성립하는 두 비교(문서10 §3.3).
    tags.push('fusionConflict:사주 vs MBTI 상충');
    if (astro !== null) tags.push('fusionConflict:별자리 원소 vs MBTI');
  }
  if (fact.blood !== null) {
    tags.push(`blood:${fact.blood}`);
    // 혈액형 통념과 결과가 갈리는 경우의 처리 지침("언급하지 않음"). 지침 자체가 근거다.
    tags.push('fusionConflict:혈액형 통념 vs 결과');
  }
  return [...new Set(tags)].sort(compareCodepoint);
}

export interface ScoredCard {
  readonly card: KnowledgeCard;
  /** 일치한 태그 수. */
  readonly hits: number;
  readonly matchedTags: readonly string[];
}

/**
 * 카드 선별. 순수함수이며 입력이 같으면 배열 순서까지 동일하다.
 *
 * 정렬 우선순위: 일치 태그 수 ↓ → 근거 등급 ↑ → 분류 순서 ↑ → id 코드포인트 ↑
 * (마지막 id 정렬 덕분에 앞의 세 키가 전부 같아도 순서가 고정된다.)
 *
 * 담기는 **두 번에 나눠서** 한다.
 *   1차 — 아직 한 장도 없는 분류의 1등을 먼저 확보한다(폭 확보).
 *   2차 — 남은 자리를 점수 순으로 채운다(깊이).
 * 왜: 점수 한 줄로만 담으면 카드가 많은 분류(십신 10장)와 근거등급이 높은 분류(신강지수 A)가
 * 예산을 먼저 가져가고, 일간·십이운성처럼 **섹션 하나가 통째로 의존하는** 분류가 밀려난다.
 * 밀려나면 에러가 아니라 "그 섹션이 조용히 사라지는" 형태로 나타나서 알아채기 어렵다.
 * 두 패스 모두 같은 정렬 배열을 훑으므로 결정론과 분류 내부 순서는 그대로다.
 */
export function selectKnowledgeCards(
  fact: FactPack,
  base: readonly KnowledgeCard[],
  options: RetrievalOptions = {},
): readonly KnowledgeCard[] {
  const maxCards = options.maxCards ?? DEFAULT_MAX_CARDS;
  const maxPerSystem = options.maxPerSystem ?? DEFAULT_MAX_PER_SYSTEM;
  const maxPerKind = options.maxPerKind ?? DEFAULT_MAX_PER_KIND;
  const query = new Set(queryTagsOf(fact));

  const scored: ScoredCard[] = [];
  for (const card of base) {
    const matchedTags = card.tags.filter((t) => query.has(t));
    if (matchedTags.length === 0) continue;
    scored.push({ card, hits: matchedTags.length, matchedTags });
  }

  scored.sort((a, b) => {
    if (a.hits !== b.hits) return b.hits - a.hits;
    const ca = CONFIDENCE_RANK[a.card.confidence];
    const cb = CONFIDENCE_RANK[b.card.confidence];
    if (ca !== cb) return ca - cb;
    const ka = KIND_RANK[a.card.kind];
    const kb = KIND_RANK[b.card.kind];
    if (ka !== kb) return ka - kb;
    return compareCodepoint(a.card.id, b.card.id);
  });

  const perSystem = new Map<CardSystem, number>();
  const perKind = new Map<KnowledgeKind, number>();
  const pickedIds = new Set<string>();
  const picked: KnowledgeCard[] = [];

  /** 정렬 배열을 한 번 훑으며 상한을 지켜 담는다. `firstOfKindOnly` 가 1차/2차 패스를 가른다. */
  const sweep = (firstOfKindOnly: boolean): void => {
    for (const entry of scored) {
      if (picked.length >= maxCards) return;
      const { kind, id } = entry.card;
      if (pickedIds.has(id)) continue;
      if (firstOfKindOnly && perKind.has(kind)) continue;
      const system = systemOfKind(kind);
      const usedSystem = perSystem.get(system) ?? 0;
      const usedKind = perKind.get(kind) ?? 0;
      if (usedSystem >= maxPerSystem || usedKind >= maxPerKind) continue;
      perSystem.set(system, usedSystem + 1);
      perKind.set(kind, usedKind + 1);
      pickedIds.add(id);
      picked.push(entry.card);
    }
  };

  sweep(true);
  sweep(false);
  return picked;
}
