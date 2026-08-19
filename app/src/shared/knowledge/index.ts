// 지식카드 검색 — 근거: docs/research/calc/C00 §4.1 A12, §7.4(결정론 보장 규칙)
//
// 임베딩·외부 API 를 쓰지 않는다. 이 도메인은 조회 축이 유한한 이산 집합(10천간 · 10십신 ·
// 12운성 · 30신살 · 12사인 · 16MBTI …)이라, 벡터 유사도보다 키 매칭 + 키워드 스코어링이
// 더 정확하고 더 싸다. 부작용·난수·시각 의존이 없어 같은 질의는 항상 같은 결과를 낸다.

import { z } from 'zod';
import cardsJson from './cards.json';
import type { Confidence, KnowledgeCard, KnowledgeKind, RetrieveQuery, ScoredCard } from './types';

export type { Confidence, KnowledgeCard, KnowledgeKind, KnowledgeSource, RetrieveQuery, ScoredCard } from './types';
export { cardBody, formatSourceDoc, formatSourceLabel, formatSourceSection } from './types';

/**
 * 지식카드 전량. `scripts/build-knowledge.mjs` 가 굽는다.
 *
 * JSON 을 직접 import 한다 — 엔진 `lib/saju/constants.ts` 가 `tables.json` 에 쓰는 것과 같은 방식이며
 * (`moduleResolution: bundler` 에서 `resolveJsonModule` 기본 ON), 같은 데이터를 `.generated.ts` 로도
 * 굽던 두 벌 구조를 없앴다. 형(型)은 여기서 한 번만 좁힌다.
 */
export const CARDS = cardsJson as readonly KnowledgeCard[];

export const KNOWLEDGE_KINDS = [
  'ilgan',
  'jiji',
  'sipsin',
  'unseong',
  'sinsal',
  'yongsin',
  'daewoon',
  'zodiac',
  'mbti',
  'blood',
  'fusion',
] as const satisfies readonly KnowledgeKind[];

const CONFIDENCE_RANK: Record<Confidence, number> = { A: 3, B: 2, C: 1, D: 0 };

const kindSchema = z.enum(KNOWLEDGE_KINDS);
const confidenceSchema = z.enum(['A', 'B', 'C', 'D']);

/** 경계 검증 — 질의는 다른 레이어(UI/서술 생성기)에서 들어오므로 여기서 한 번 막는다. */
export const retrieveQuerySchema = z.object({
  kinds: z.array(kindSchema).min(1).optional(),
  keys: z.array(z.string().min(1)).optional(),
  terms: z.array(z.string()).optional(),
  minConfidence: confidenceSchema.optional(),
  limit: z.int().min(1).max(200).optional(),
});

export class KnowledgeQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeQueryError';
  }
}

const DEFAULT_LIMIT = 12;

/** 검색어 정규화. 한글은 lowercase 가 무해하고, MBTI 코드·사인 id 같은 라틴 문자만 접힌다. */
function norm(s: string): string {
  return s.normalize('NFC').trim().toLowerCase();
}

interface IndexedCard {
  readonly card: KnowledgeCard;
  readonly normKey: string;
  readonly normKeywords: readonly string[];
  readonly normTitle: string;
  readonly normSummary: string;
  readonly normDetail: string;
}

const INDEX: readonly IndexedCard[] = CARDS.map((card) => ({
  card,
  normKey: norm(card.key),
  normKeywords: card.keywords.map(norm),
  normTitle: norm(card.title),
  normSummary: norm(card.summary),
  normDetail: norm(card.detail),
}));

const BY_ID = new Map<string, KnowledgeCard>(CARDS.map((c) => [c.id, c]));

/** kind+key 로 카드 하나를 정확히 집는다. 계산 엔진 출력을 바로 문장 재료로 바꿀 때 쓴다. */
export function getCard(kind: KnowledgeKind, key: string): KnowledgeCard | undefined {
  return BY_ID.get(`${kind}:${key}`);
}

/** 여러 키를 한 번에. 없는 키는 조용히 건너뛴다(엔진이 내는 신살은 사주마다 다르다). */
export function getCards(kind: KnowledgeKind, keys: readonly string[]): KnowledgeCard[] {
  const out: KnowledgeCard[] = [];
  for (const k of keys) {
    const c = getCard(kind, k);
    if (c !== undefined) out.push(c);
  }
  return out;
}

/**
 * 점수 규칙 (합산):
 *   keys 정확 일치        +100
 *   keys 가 키워드에 존재   +40
 *   term 이 key 와 일치     +60
 *   term 이 키워드와 일치   +24
 *   term 이 키워드에 부분포함 +12
 *   term 이 제목/요약/본문에 +8 / +5 / +2
 *   등급 보너스 A+3 B+2 C+1 D+0
 * keys·terms 를 하나도 주지 않으면 필터만 적용하고 등급·id 순으로 반환한다.
 */
function scoreCard(entry: IndexedCard, keys: readonly string[], terms: readonly string[]): ScoredCard | undefined {
  const matched: string[] = [];
  let score = 0;

  for (const k of keys) {
    if (entry.normKey === k) {
      score += 100;
      matched.push(k);
    } else if (entry.normKeywords.includes(k)) {
      score += 40;
      matched.push(k);
    }
  }

  for (const t of terms) {
    let gained = 0;
    if (entry.normKey === t) gained = 60;
    else if (entry.normKeywords.includes(t)) gained = 24;
    // 부분 포함은 양쪽 모두 2자 이상일 때만 인정한다. 한국어는 1자 키워드('해','화')가
    // '해외'·'변화' 같은 무관한 검색어에 걸려 오탐을 대량 생산한다.
    else if (t.length >= 2 && entry.normKeywords.some((kw) => kw.length >= 2 && (kw.includes(t) || t.includes(kw)))) gained = 12;
    else {
      // 구획별 가중: 제목이 가장 강하고 본문이 가장 약하다.
      if (entry.normTitle.includes(t)) gained = 8;
      else if (entry.normSummary.includes(t)) gained = 5;
      else if (entry.normDetail.includes(t)) gained = 2;
    }
    if (gained > 0) {
      score += gained;
      matched.push(t);
    }
  }

  if (score === 0) return undefined;
  return {
    card: entry.card,
    score: score + CONFIDENCE_RANK[entry.card.confidence],
    matched: [...new Set(matched)],
  };
}

/** 점수·근거까지 필요한 호출부용. `retrieve` 는 이 결과에서 카드만 뽑는다. */
export function retrieveScored(query: RetrieveQuery): ScoredCard[] {
  const parsed = retrieveQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new KnowledgeQueryError(`invalid RetrieveQuery: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  const q = parsed.data;

  const kindSet = q.kinds ? new Set<string>(q.kinds) : undefined;
  const floor = q.minConfidence ? CONFIDENCE_RANK[q.minConfidence] : undefined;
  const keys = (q.keys ?? []).map(norm).filter((s) => s.length > 0);
  const terms = (q.terms ?? []).map(norm).filter((s) => s.length > 0);
  const limit = q.limit ?? DEFAULT_LIMIT;

  const pool = INDEX.filter(
    (e) =>
      (kindSet === undefined || kindSet.has(e.card.kind)) &&
      (floor === undefined || CONFIDENCE_RANK[e.card.confidence] >= floor),
  );

  const hits: ScoredCard[] =
    keys.length === 0 && terms.length === 0
      ? pool.map((e) => ({ card: e.card, score: CONFIDENCE_RANK[e.card.confidence], matched: [] }))
      : pool.map((e) => scoreCard(e, keys, terms)).filter((x): x is ScoredCard => x !== undefined);

  // 동점은 id 사전순으로 깬다 — 정렬이 결정론적이어야 캐시 키와 회귀 테스트가 성립한다.
  hits.sort((a, b) => (b.score - a.score) || (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0));
  return hits.slice(0, limit);
}

/** 지식카드 검색. 결정론적·오프라인. 같은 질의는 언제나 같은 배열을 돌려준다. */
export function retrieve(query: RetrieveQuery): KnowledgeCard[] {
  return retrieveScored(query).map((h) => h.card);
}
