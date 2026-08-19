/**
 * 프롬프트 조립 — 계산 결과 + 검색된 지식 카드 → `InterpretationRequest`.
 *
 * 근거: 문서10 §5.1(계산·부품선택·조립 레이어에서 LLM 금지) · 문서11 §6.2~§6.4(토큰 구성·모델 라우팅)
 *       C00 §7.3(캐시 키) · C00 §7.4(결정론)
 *
 * 이 함수는 **LLM 을 호출하지 않는다.** 순수함수이고, 같은 입력이면 문자 단위로 같은 요청을 만든다.
 * 이 경계가 있어야 프롬프트를 테스트할 수 있고, 캐시 키를 사전에 계산할 수 있다.
 */

import type {
  ChartLike,
  EngineWarning,
  KnowledgeCard,
  ReportKind,
  SectionId,
  UserProfile,
} from './contracts';
import { cardBody } from '../knowledge/types';
import { buildFactPack, compareCodepoint, type FactPack } from './factPack';
import { canonicalJson, fnv1a32 } from './canonical';
import {
  buildSystemBlocks,
  cardTail,
  expectedSections,
  PROMPT_VERSION,
  SECTION_TITLES,
  summaryTail,
  type PromptBlock,
} from './prompt';
import { CARD_JSON_SCHEMA, INTERPRETATION_JSON_SCHEMA, SUMMARY_JSON_SCHEMA } from './schema';

export type ModelId = 'claude-opus-5' | 'claude-sonnet-5' | 'claude-haiku-4-5';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelRouting {
  readonly model: ModelId;
  readonly maxTokens: number;
  /** Opus 5 는 thinking 이 기본 ON 이지만 의도를 고정하려고 명시한다. */
  readonly thinking: { readonly type: 'adaptive' } | null;
  /**
   * `output_config.effort`.
   * ⚠ Haiku 4.5 는 effort 파라미터 자체를 지원하지 않아 400 이 난다.
   *   문서11 §6.4 는 `daily`(Haiku) 에 effort 'low' 를 권했으나 그대로 보내면 실패한다 —
   *   Haiku 라우팅을 추가할 때는 effort 를 null 로 둔다.
   */
  readonly effort: Effort | null;
}

const ROUTING: Readonly<Record<ReportKind, ModelRouting>> = {
  // 4체계 교차 추론 = 다단 추론. 문서11 §6.4 는 품질이 전환율이라고 판단해 Opus 5 를 배정했다.
  fusion: { model: 'claude-opus-5', maxTokens: 8000, thinking: { type: 'adaptive' }, effort: 'high' },
  // 정형 해석이라 가성비 우선.
  basic_saju: {
    model: 'claude-sonnet-5',
    maxTokens: 6000,
    thinking: { type: 'adaptive' },
    effort: 'medium',
  },
};

/** 요약 라우팅 — 가장 먼저 도착해야 하므로 짧고 얕게. */
export const SUMMARY_ROUTING: ModelRouting = {
  model: 'claude-opus-5',
  maxTokens: 1500,
  thinking: { type: 'adaptive' },
  effort: 'low',
};

/** 카드 라우팅 — 본문 품질이 필요하지만 전체 리포트(high)보다는 얕게. 병렬로 도므로 총 지연이 짧다. */
export const CARD_ROUTING: ModelRouting = {
  model: 'claude-opus-5',
  maxTokens: 3000,
  thinking: { type: 'adaptive' },
  effort: 'medium',
};

export interface InterpretationRequest {
  readonly v: 1;
  readonly kind: ReportKind;
  readonly promptVersion: string;
  readonly engineVersion: string;
  readonly routing: ModelRouting;
  /** system 배열. `cacheable: true` 인 마지막 블록에 캐시 브레이크포인트를 건다. */
  readonly system: readonly PromptBlock[];
  /** user 턴 전문. `userPrefix + userTail` 과 같다(로그·테스트 편의). */
  readonly userText: string;
  /**
   * 작업들이 **공유하는** user 턴 접두 — 팩트팩과 지식카드.
   *
   * 여기에 캐시 브레이크포인트가 걸린다(`toMessagesApiParams`). 접두를 공유하도록 만들어 놓고
   * 캐시 표시를 안 걸면 아무 소용이 없다 — 실제로 그 상태로 재 봤더니 카드 6장이 각각
   * 5,846 토큰을 전액 과금으로 다시 보냈다(2026-08-19 실측, 총 565원).
   */
  readonly userPrefix: string;
  /** 작업별 꼬리. 캐시되지 않는 부분이므로 짧게 유지한다. */
  readonly userTail: string;
  /**
   * 구조화 출력 스키마. 작업에 따라 셋 중 하나다 — 전체 리포트·요약·카드.
   * 합집합으로 두는 이유: 세 요청이 같은 봉투(`InterpretationRequest`)를 쓰고 전송·캐시·검증
   * 경로를 공유하기 때문이다. 봉투를 셋으로 쪼개면 서버 오케스트레이션도 셋이 된다.
   */
  readonly outputJsonSchema:
    | typeof INTERPRETATION_JSON_SCHEMA
    | typeof SUMMARY_JSON_SCHEMA
    | typeof CARD_JSON_SCHEMA;
  readonly sections: readonly SectionId[];
  readonly knowledgeCardIds: readonly string[];
  readonly factPack: FactPack;
  /** L2 서사 캐시 키. */
  readonly narrativeKey: string;
}

export type BuildErrorCode =
  | 'NO_KNOWLEDGE'
  | 'DUPLICATE_CARD_ID'
  | 'NO_SECTIONS'
  | 'UNSUPPORTED_KIND';

/** 파라미터 프로퍼티를 쓰지 않는다 — tsconfig 의 `erasableSyntaxOnly` 가 금지한다. */
export class InterpretationBuildError extends Error {
  readonly code: BuildErrorCode;

  constructor(code: BuildErrorCode, message: string) {
    super(message);
    this.name = 'InterpretationBuildError';
    this.code = code;
  }
}

/**
 * 카드 → 프롬프트 블록.
 * 본문은 `cardBody()`(= `detail`)만 쓴다. `summary` 는 팩트팩과 내용이 겹치는 템플릿 문장이라
 * 넣으면 토큰만 늘고 "카드가 사실의 출처"라는 오해를 만든다.
 */
function renderCards(cards: readonly KnowledgeCard[]): string {
  return cards
    .map(
      (c) =>
        `[${c.id}] (${c.kind} / 근거등급 ${c.confidence} / 출처 ${c.source.doc} ${c.source.section})\n` +
        `${c.title}\n${cardBody(c)}`,
    )
    .join('\n\n');
}

function renderSections(sections: readonly SectionId[]): string {
  return sections.map((id, i) => `${i + 1}. ${id} — ${SECTION_TITLES[id]}`).join('\n');
}

/**
 * 계산 결과와 검색된 카드로 프롬프트를 조립한다.
 *
 * @param chart     계산 엔진 출력(읽기 전용). 여기 없는 사실은 프롬프트에 등장하지 않는다.
 * @param profile   사용자 자기신고 값.
 * @param knowledge `selectKnowledgeCards()` 가 고른 카드. 비어 있으면 서술 근거가 없으므로 거부한다.
 */
/**
 * 세 요청이 **글자 단위로 공유하는** user 턴 접두.
 *
 * 여기까지가 프롬프트 캐시에 올라가는 부분이고, 뒤에 작업별 꼬리만 붙는다.
 * 이 함수를 고칠 때는 반드시 세 요청 모두에 같은 변화가 가야 한다 — 한쪽만 바뀌면 캐시가 갈린다.
 */
function commonUserPrefix(factPack: FactPack, knowledge: readonly KnowledgeCard[]): string {
  return [
    '# fact_pack',
    '계산 엔진이 확정한 사실이다. 값을 바꾸지 않는다.',
    canonicalJson(factPack),
    '',
    '# knowledge_cards',
    '아래 카드에 적힌 내용만 해석 근거로 쓴다.',
    renderCards(knowledge),
  ].join('\n');
}

/** 세 조립기가 공유하는 사전 검사와 팩트팩 생성. 검사 순서를 바꾸지 않는다(오류 코드가 달라진다). */
function prepare(
  chart: ChartLike,
  profile: UserProfile,
  knowledge: readonly KnowledgeCard[],
): { readonly factPack: FactPack; readonly ids: readonly string[] } {
  if (knowledge.length === 0) {
    throw new InterpretationBuildError('NO_KNOWLEDGE', '지식 카드가 하나도 없다');
  }
  const ids = knowledge.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    throw new InterpretationBuildError('DUPLICATE_CARD_ID', `카드 id 중복: ${ids.join(',')}`);
  }
  return { factPack: buildFactPack(chart, profile, 'fusion'), ids };
}

/**
 * 요약 요청 — 한 단어 + 한 문장.
 *
 * 홈 화면의 첫 결과다. `effort: low` + `maxTokens: 1500` 으로 **가장 먼저 도착하게** 만든다
 * (분할 전 단일 호출은 93.8초였다). 카드보다 먼저 끝나야 화면이 비지 않는다.
 */
export function buildSummaryRequest(
  chart: ChartLike,
  profile: UserProfile,
  knowledge: readonly KnowledgeCard[],
): InterpretationRequest {
  const { factPack, ids } = prepare(chart, profile, knowledge);
  return {
    v: 1,
    kind: 'fusion',
    promptVersion: PROMPT_VERSION,
    engineVersion: chart.engineVersion,
    routing: SUMMARY_ROUTING,
    system: buildSystemBlocks(),
    userText: commonUserPrefix(factPack, knowledge) + summaryTail(),
    userPrefix: commonUserPrefix(factPack, knowledge),
    userTail: summaryTail(),
    outputJsonSchema: SUMMARY_JSON_SCHEMA,
    sections: [],
    knowledgeCardIds: ids,
    factPack,
    narrativeKey: `${narrativeKeyOf(chart, profile, 'fusion', ids)}|summary`,
  };
}

/**
 * 카드 한 장 요청.
 *
 * 캐시 키에 섹션 id 를 붙인다 — 안 붙이면 모든 섹션이 첫 카드의 글을 받는다.
 */
export function buildCardRequest(
  chart: ChartLike,
  profile: UserProfile,
  knowledge: readonly KnowledgeCard[],
  sectionId: SectionId,
): InterpretationRequest {
  const { factPack, ids } = prepare(chart, profile, knowledge);
  return {
    v: 1,
    kind: 'fusion',
    promptVersion: PROMPT_VERSION,
    engineVersion: chart.engineVersion,
    routing: CARD_ROUTING,
    system: buildSystemBlocks(),
    userText: commonUserPrefix(factPack, knowledge) + cardTail(sectionId),
    userPrefix: commonUserPrefix(factPack, knowledge),
    userTail: cardTail(sectionId),
    outputJsonSchema: CARD_JSON_SCHEMA,
    sections: [sectionId],
    knowledgeCardIds: ids,
    factPack,
    narrativeKey: `${narrativeKeyOf(chart, profile, 'fusion', ids)}|card:${sectionId}`,
  };
}

export function buildInterpretationRequest(
  chart: ChartLike,
  profile: UserProfile,
  knowledge: readonly KnowledgeCard[],
  kind: ReportKind = 'fusion',
): InterpretationRequest {
  const routing = ROUTING[kind] as ModelRouting | undefined;
  if (routing === undefined) {
    throw new InterpretationBuildError('UNSUPPORTED_KIND', `지원하지 않는 리포트 종류: ${kind}`);
  }
  if (knowledge.length === 0) {
    // 카드가 없으면 "카드 밖 내용 금지" 규칙과 "섹션을 채워라" 요구가 정면 충돌한다 → 모델이 지어낸다.
    throw new InterpretationBuildError('NO_KNOWLEDGE', '지식 카드가 하나도 없다');
  }
  const ids = knowledge.map((c) => c.id);
  if (new Set(ids).size !== ids.length) {
    throw new InterpretationBuildError('DUPLICATE_CARD_ID', `카드 id 중복: ${ids.join(',')}`);
  }

  const sections = expectedSections(kind, profile);
  if (sections.length === 0) {
    throw new InterpretationBuildError('NO_SECTIONS', `섹션이 비었다: ${kind}`);
  }

  const factPack = buildFactPack(chart, profile, kind);
  const system = buildSystemBlocks();

  // 접두는 요약·카드와 **글자 단위로 같아야** 한다 — 세 작업이 같은 캐시 항목을 쓴다.
  const userPrefix = commonUserPrefix(factPack, knowledge);
  const userTail = [
    '',
    '# 이번 리포트',
    `종류: ${kind}`,
    `말투: 혈액형 ${profile.blood ?? 'A(기본값)'} 열`,
    '섹션(이 순서대로, 이것만):',
    renderSections(sections),
  ].join('\n');
  const userText = userPrefix + userTail;

  return {
    v: 1,
    kind,
    promptVersion: PROMPT_VERSION,
    engineVersion: chart.engineVersion,
    routing,
    system,
    userText,
    userPrefix,
    userTail,
    outputJsonSchema: INTERPRETATION_JSON_SCHEMA,
    sections,
    knowledgeCardIds: ids,
    factPack,
    narrativeKey: narrativeKeyOf(chart, profile, kind, ids),
  };
}

/**
 * L2(서사) 캐시 키.
 *
 * ⚠ 설계 주의: 문서10 §5.2 는 `{일간}|{MBTI}|{혈액형}|{별자리원소}` 4축(2,560엔트리)을 제안하지만,
 *   그 축만으로 캐시하면 **간지·대운·신살이 다른 사람에게 같은 문단이 나간다**.
 *   현재 프롬프트는 팩트팩 전체(gz8·대운 10기·신살)를 주입하므로, 캐시 키도 차트 전체를 식별해야 한다.
 *   → 엔진이 `chart.cacheKey`(C00 §7.3 L1 키)를 주면 그대로 축으로 쓴다.
 *   4축 축약형으로 넘어가려면 팩트팩에서 개인 고유 사실을 먼저 빼야 한다(docs/interpretation.md 미해결 항목).
 *
 * ⚠ 엔진 v1 은 `cacheKey` 를 만들지 않는다. 없으면 차트에서 **정체성에 해당하는 필드만** 골라
 *   결정론적 대체 키를 만든다(gz8 + 삼주 여부 + 대운 전체 + 경고). 엔진이 캐시키를 내기 시작하면
 *   `x:` 접두가 사라지므로 그 시점에 캐시가 한 번 무효화되는 것도 의도한 동작이다.
 *
 * sha256 대신 평문 조합 + FNV 보조 해시를 쓴다. WebView 의 `crypto.subtle` 은 비동기라
 * 순수함수 안에서 쓸 수 없고, 이 키에는 PII 가 없어 가릴 이유도 없다(디버깅에는 오히려 유리).
 */
export function chartIdentityKey(chart: ChartLike): string {
  if (chart.cacheKey !== undefined) return chart.cacheKey;
  return `x:${fnv1a32(
    canonicalJson({
      gz8: chart.pillars.gz8,
      three: chart.pillars.threePillarMode,
      dw: chart.luck.daewoon.pillars.map(
        (p) => `${p.index}/${p.ganji ?? '-'}/${p.startAgeWestern}-${p.endAgeWestern}`,
      ),
      w: chart.warnings.filter(isIdentityWarning).sort(compareCodepoint),
    }),
  )}`;
}

/**
 * 캐시 키에 넣지 않는 경고 — **입력 출처**만 말할 뿐 차트를 식별하지 않는 것들.
 *
 * `LUNAR_CONVERTED` 가 여기 있는 이유는 C00 §7.3 규칙 1 / §S0-2(b) 다: 같은 양력일을 양력으로 넣은
 * 사람과 음력으로 넣은 사람은 **같은 사주**이므로 같은 서사를 받아야 하고, 따라서 캐시 키가 같아야 한다.
 * 이 경고를 키에 그대로 넣으면 같은 차트가 두 키로 갈려 그 규칙을 코드가 직접 위반한다.
 * (그렇다고 경고 자체를 없애지는 않는다 — C00 §5.4 가 `LUNAR_CONVERTED` 배지를 요구하고,
 *  음력 입력의 대표 실패 모드가 "달력을 잘못 읽었는데 아무도 모르는 것"이기 때문이다.)
 *
 * 나머지 경고는 남긴다. 절기 경계·서머타임·삼주 모드는 같은 명식이라도 해설이 달라져야 한다.
 */
const NON_IDENTITY_WARNINGS: ReadonlySet<string> = new Set<EngineWarning>(['LUNAR_CONVERTED']);

const isIdentityWarning = (w: EngineWarning): boolean => !NON_IDENTITY_WARNINGS.has(w);

export function narrativeKeyOf(
  chart: ChartLike,
  profile: UserProfile,
  kind: ReportKind,
  cardIds: readonly string[],
): string {
  return [
    PROMPT_VERSION,
    chart.engineVersion,
    kind,
    chartIdentityKey(chart),
    `g=${profile.gender}`,
    `mb=${profile.mbti ?? '-'}`,
    `bl=${profile.blood ?? '-'}`,
    `k=${fnv1a32(cardIds.join(','))}`,
  ].join('|');
}

/** 프롬프트 크기 감시용(문자 수). 토큰은 `POST /v1/messages/count_tokens` 로 실측해야 한다. */
export function requestCharCounts(req: InterpretationRequest): {
  readonly systemCacheable: number;
  readonly systemTotal: number;
  readonly user: number;
} {
  let cacheable = 0;
  let total = 0;
  for (const b of req.system) {
    total += b.text.length;
    if (b.cacheable) cacheable += b.text.length;
  }
  return { systemCacheable: cacheable, systemTotal: total, user: req.userText.length };
}
