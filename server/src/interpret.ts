/**
 * 해석 오케스트레이션 — 요청 하나가 지나가는 전 구간.
 *
 *   차트 + 프로필
 *      → buildFactPack()          (앱 코드 · 순수함수)
 *      → selectKnowledgeCards()   (앱 코드 · 결정론 검색)
 *      → buildInterpretationRequest()  (앱 코드 · 프롬프트 조립)
 *      → [캐시 조회]              (여기)
 *      → Anthropic Messages API   (anthropic.ts)
 *      → verifyInterpretation()   (앱 코드 · 응답 검증)
 *      → [캐시 저장]
 *
 * **한 줄도 복붙하지 않았다.** 프롬프트·검색·검증은 전부 `app/src/shared/interpret` 를 그대로 부른다.
 * 두 벌이 되는 순간 한쪽만 고쳐지고, 그 결과는 "에러 없이 다른 문장이 나가는 것"이라 아무도 못 잡는다.
 *
 * 캐시는 `narrativeKey` 로 건다. 서버가 키를 새로 만들지 않는 이유는 cache.ts 주석에 있다.
 */

import {
  buildCardRequest,
  buildFactPack,
  buildInterpretationRequest,
  buildSummaryRequest,
  InterpretationBuildError,
  selectKnowledgeCards,
  verifyCard,
  verifyInterpretation,
  verifySummary,
  type ChartLike,
  type Interpretation,
  type InterpretationRequest,
  type KnowledgeCard,
  type ReportKind,
  type RetrievalOptions,
  type CardValue,
  type SectionId,
  type SummaryValue,
  type UserProfile,
  type VerificationFailure,
} from '../../app/src/shared/interpret';

import type { NarrativeCache } from './cache';
import type { Caller, UpstreamErrorCode } from './anthropic';
import type { Logger } from './log';
import type { Semaphore } from './rateLimit';

/**
 * LLM 경로의 카드 예산.
 *
 * 규칙 기반 리포트(`features/report`)는 64/40/14 로 넓게 잡는다 — 토큰을 쓰지 않기 때문이다.
 * 여기는 반대다. 카드 한 장이 대략 250자이고 그대로 user 턴에 실리므로 **장수 = 원가**다.
 * docs/interpretation.md §4.2 의 원가 추정이 12장 안팎을 가정하므로 그 언저리로 잡는다.
 * (`selectKnowledgeCards` 의 기본값 16/7/2 를 그대로 쓰지 않고 명시하는 이유: 이 숫자가 바뀌면
 *  README 의 원가표가 같이 틀려지므로, 두 값이 한 곳에서 보이게 둔다.)
 */
export const LLM_RETRIEVAL: RetrievalOptions = { maxCards: 14, maxPerSystem: 7, maxPerKind: 2 };

export type InterpretStatus = 'ok' | 'rejected' | 'error';

export type InterpretErrorCode = UpstreamErrorCode | 'BUILD';

/**
 * 전체 리포트 결과.
 *
 * `TaskResult<Interpretation>` 의 별칭이다 — 요약·카드와 **같은 봉투**를 쓴다. 결과 모양이
 * 셋 다 같아야 화면이 "도착했는가 / 거부됐는가 / 실패했는가"를 한 가지 방식으로 다룰 수 있다.
 */
export type InterpretResult = TaskResult<Interpretation>;

export interface InterpretDeps {
  readonly knowledge: readonly KnowledgeCard[];
  readonly call: Caller;
  /**
   * 서사 캐시. 값 타입이 `unknown` 인 이유: 전체 리포트·요약·카드가 **같은 캐시**를 쓴다.
   * 키가 `narrativeKey` 로 이미 갈려 있어(`|summary`, `|card:<id>` 접미) 타입이 섞일 수 없고,
   * 작업마다 캐시를 따로 두면 TTL·용량 정책이 세 벌이 된다.
   */
  readonly cache: NarrativeCache<unknown>;
  readonly logger: Logger;
  readonly semaphore: Semaphore;
  /** 검증 실패 시 최대 시도 횟수(1 = 재시도 없음). 원가와 정확히 비례한다. */
  readonly maxAttempts: number;
  readonly retrieval?: RetrievalOptions;
}

export interface InterpretInput {
  readonly kind: ReportKind;
  readonly chart: ChartLike;
  readonly profile: UserProfile;
}

/**
 * 프롬프트를 조립한다. 실패(카드 0장·섹션 0개)는 요청이 잘못된 것이 아니라
 * **지식베이스/차트 조합이 서술 근거를 못 만든 것**이므로 error 로 보고하고 클라이언트가 폴백한다.
 */
export function buildRequestFor(
  input: InterpretInput,
  knowledge: readonly KnowledgeCard[],
  retrieval: RetrievalOptions,
): { readonly ok: true; readonly request: InterpretationRequest } | { readonly ok: false; readonly message: string } {
  try {
    const fact = buildFactPack(input.chart, input.profile, input.kind);
    const cards = selectKnowledgeCards(fact, knowledge, retrieval);
    return { ok: true, request: buildInterpretationRequest(input.chart, input.profile, cards, input.kind) };
  } catch (error) {
    const message =
      error instanceof InterpretationBuildError ? `${error.code}: ${error.message}` : String(error);
    return { ok: false, message };
  }
}

/* --------------------------- 작업 일반화 --------------------------- */

/**
 * 한 번의 LLM 왕복이 필요한 작업.
 *
 * 전체 리포트·요약·카드는 **조립기와 검증기만 다르고** 캐시·single-flight·재시도·로깅은 같다.
 * 그 공통부를 `runTask` 가 갖고 다른 부분만 이 인터페이스로 받는다 — 세 벌로 두면
 * 캐시 정책을 고칠 때 한 곳만 고치고 두 곳을 잊는다.
 */
interface LlmTask<T> {
  /** 요청 조립. 실패는 던진다(`InterpretationBuildError`). */
  readonly build: () => InterpretationRequest;
  /** 응답 검증. 성공하면 캐시에 넣을 값을 돌려준다. */
  readonly verify: (
    raw: unknown,
    req: InterpretationRequest,
  ) =>
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly failures: readonly VerificationFailure[] };
  /** 로그에 남길 작업 이름. 개인정보를 담지 않는다. */
  readonly label: string;
}

export type TaskResult<T> =
  | {
      readonly status: 'ok';
      readonly source: 'llm' | 'cache';
      readonly narrativeKey: string;
      readonly value: T;
    }
  | {
      readonly status: 'rejected';
      readonly narrativeKey: string;
      readonly failures: readonly VerificationFailure[];
    }
  | {
      readonly status: 'error';
      readonly code: InterpretErrorCode;
      readonly message: string;
      readonly retryable: boolean;
    };

async function runTask<T>(
  task: LlmTask<T>,
  deps: InterpretDeps,
  signal: AbortSignal | undefined,
): Promise<TaskResult<T>> {
  let req: InterpretationRequest;
  try {
    req = task.build();
  } catch (error) {
    const message =
      error instanceof InterpretationBuildError ? `${error.code}: ${error.message}` : String(error);
    deps.logger.warn('프롬프트 조립 실패', { task: task.label, reason: message });
    return { status: 'error', code: 'BUILD', message, retryable: false };
  }

  const cached = deps.cache.get(req.narrativeKey);
  if (cached !== undefined) {
    deps.logger.info('cache hit', { narrativeKey: req.narrativeKey, task: task.label });
    return { status: 'ok', source: 'cache', narrativeKey: req.narrativeKey, value: cached as T };
  }

  return await deps.cache.singleFlight<TaskResult<T>>(req.narrativeKey, async () => {
    const again = deps.cache.get(req.narrativeKey);
    if (again !== undefined) {
      return { status: 'ok', source: 'cache', narrativeKey: req.narrativeKey, value: again as T };
    }

    let lastRejection: readonly VerificationFailure[] = [];
    for (let attempt = 1; attempt <= Math.max(1, deps.maxAttempts); attempt += 1) {
      const release = await deps.semaphore.acquire();
      let upstream;
      try {
        upstream = await deps.call(req, signal);
      } finally {
        release();
      }

      if (!upstream.ok) {
        deps.logger.warn('업스트림 실패', {
          narrativeKey: req.narrativeKey,
          task: task.label,
          code: upstream.code,
          status: upstream.status,
          attempt,
        });
        return {
          status: 'error',
          code: upstream.code,
          message: upstream.message,
          retryable: upstream.retryable,
        };
      }

      const verified = task.verify(upstream.raw, req);
      if (verified.ok) {
        deps.cache.set(req.narrativeKey, verified.value);
        deps.logger.info('llm ok', {
          narrativeKey: req.narrativeKey,
          task: task.label,
          model: upstream.model,
          fellBack: upstream.fellBack,
          attempt,
          inputTokens: upstream.usage.inputTokens,
          outputTokens: upstream.usage.outputTokens,
          cacheReadTokens: upstream.usage.cacheReadTokens,
          cacheWriteTokens: upstream.usage.cacheWriteTokens,
        });
        return {
          status: 'ok',
          source: 'llm',
          narrativeKey: req.narrativeKey,
          value: verified.value,
        };
      }

      lastRejection = verified.failures;
      deps.logger.warn('응답 검증 거부', {
        narrativeKey: req.narrativeKey,
        task: task.label,
        attempt,
        failures: verified.failures.map((f) => `${f.code}:${f.detail}`).slice(0, 8),
      });
    }

    // 거부는 캐시하지 않는다 — 모델 출력은 결정론이 아니라 다음 시도는 통과할 수 있고,
    // 캐시에 넣으면 그 차트는 키 수명 내내 폴백만 받는다.
    return { status: 'rejected', narrativeKey: req.narrativeKey, failures: lastRejection };
  });
}

/** 요청 하나에서 팩트팩·카드를 뽑는다. 세 작업이 같은 검색 결과를 써야 캐시 접두가 같아진다. */
function cardsFor(input: InterpretInput, deps: InterpretDeps) {
  const fact = buildFactPack(input.chart, input.profile, input.kind);
  return selectKnowledgeCards(fact, deps.knowledge, deps.retrieval ?? LLM_RETRIEVAL);
}

/**
 * 요약 — 한 단어 + 한 문장. **가장 먼저 도착해야 하는 호출**이다.
 *
 * 홈 화면이 이 값으로 채워지므로, 카드들이 아직 오는 중이어도 사용자는 이미 결과를 본다.
 */
export async function interpretSummary(
  input: InterpretInput,
  deps: InterpretDeps,
  signal?: AbortSignal,
): Promise<TaskResult<SummaryValue>> {
  return await runTask<SummaryValue>(
    {
      label: 'summary',
      build: () => buildSummaryRequest(input.chart, input.profile, cardsFor(input, deps)),
      verify: (raw, req) =>
        verifySummary(raw, { factPack: req.factPack, knowledgeCardIds: req.knowledgeCardIds }),
    },
    deps,
    signal,
  );
}

/**
 * 카드 한 장. 화면은 이걸 섹션 수만큼 **병렬로** 부른다.
 *
 * 카드마다 캐시 키가 다르므로(`|card:<id>`) 한 장이 거부돼도 다른 장은 영향받지 않는다 —
 * 폴백이 카드 단위로 일어나는 근거다.
 */
export async function interpretCard(
  input: InterpretInput,
  sectionId: SectionId,
  deps: InterpretDeps,
  signal?: AbortSignal,
): Promise<TaskResult<CardValue>> {
  return await runTask<CardValue>(
    {
      label: `card:${sectionId}`,
      build: () => buildCardRequest(input.chart, input.profile, cardsFor(input, deps), sectionId),
      verify: (raw, req) =>
        verifyCard(raw, sectionId, {
          factPack: req.factPack,
          knowledgeCardIds: req.knowledgeCardIds,
        }),
    },
    deps,
    signal,
  );
}

/**
 * 카드 여러 장을 받아 온다. **첫 장을 먼저 보내 캐시를 데운 뒤 나머지를 병렬로** 보낸다.
 *
 * 왜 전부 병렬로 쏘지 않는가 — 실측 때문이다(2026-08-19).
 * 팩트팩·지식카드 접두(약 5,721 토큰)는 사람마다 다르므로 그 사용자에게는 **항상 콜드**다.
 * 여섯 장을 동시에 쏘면 여섯 번 모두 캐시를 *쓰고*(입력가의 1.25배) 아무도 못 읽는다 —
 * 그 상태의 실측이 633원이었고, 한 장이 먼저 써 둔 뒤 나머지가 읽으면 303원이었다.
 *
 * 지연 손해는 카드 한 장분(약 20~27초)이다. 화면은 그 사이 요약으로 이미 채워져 있으므로
 * 사용자가 빈 화면을 보는 시간은 늘지 않는다.
 *
 * ⚠ 요약(`interpretSummary`)은 이 캐시를 데워 주지 못한다. 출력 스키마가 달라 프리픽스가
 *   갈리기 때문이다(캐시읽기 8,978 vs 8,769 로 실측). 그래서 워밍은 카드끼리만 성립한다.
 */
export async function interpretCards(
  input: InterpretInput,
  sectionIds: readonly SectionId[],
  deps: InterpretDeps,
  signal?: AbortSignal,
): Promise<readonly TaskResult<CardValue>[]> {
  if (sectionIds.length === 0) return [];

  const [first, ...rest] = sectionIds;
  if (first === undefined) return [];

  const head = await interpretCard(input, first, deps, signal);
  if (rest.length === 0) return [head];

  const tail = await Promise.all(rest.map((id) => interpretCard(input, id, deps, signal)));
  return [head, ...tail];
}

export async function interpret(
  input: InterpretInput,
  deps: InterpretDeps,
  signal?: AbortSignal,
): Promise<InterpretResult> {
  return await runTask<Interpretation>(
    {
      label: input.kind,
      build: () =>
        buildInterpretationRequest(
          input.chart,
          input.profile,
          cardsFor(input, deps),
          input.kind,
        ),
      verify: (raw, req) => verifyInterpretation(raw, req),
    },
    deps,
    signal,
  );
}
