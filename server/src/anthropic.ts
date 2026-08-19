/**
 * Anthropic Messages API 호출 경계.
 *
 * 요청 본문은 여기서 만들지 않는다 — 앱의 `toMessagesApiParams(req)` 가 만든다(순수함수라 테스트
 * 가능하고, 프롬프트 조립과 호출이 한 파일에 섞이지 않는다). 이 파일이 더하는 것은 세 가지다.
 *   ① SDK 클라이언트 수명·타임아웃·재시도
 *   ② Opus 5 서버측 거부 폴백(`fallbacks: "default"`) 부착과, 베타가 안 열려 있을 때의 자동 후퇴
 *   ③ 응답을 `raw JSON` 으로 되돌리기 전의 사고 처리(refusal · max_tokens 절단 · JSON 파싱 실패)
 *
 * ⚠ 보내면 안 되는 것(전부 400): `temperature`/`top_p`/`top_k`, `thinking.budget_tokens`,
 *   마지막 assistant 턴(prefill). `toMessagesApiParams` 가 애초에 만들지 않는다.
 *
 * ⚠ SDK 0.75 의 타입은 API 보다 뒤에 있다 — `Model` 유니온에 `claude-opus-5` 가 없고(문자열 확장은 허용),
 *   `fallbacks`·`stop_details` 는 타입이 아예 없다. 그래서 **요청 본문만** 캐스팅으로 넘기고,
 *   응답은 손으로 좁힌다. 캐스팅을 한 곳(`callCreate`)에 몰아 둔 이유가 이것이다.
 */

import Anthropic, {
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';

import type { InterpretationRequest } from '../../app/src/shared/interpret';
import { toMessagesApiParams } from '../../app/src/shared/interpret';
import type { Logger } from './log';

/** `claude-opus-5` 는 안전 분류기가 요청을 거절할 수 있다. 그때 Opus 4.8 로 서버측에서 넘긴다. */
export const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FALLBACK_CAPABLE_MODELS: ReadonlySet<string> = new Set(['claude-opus-5', 'claude-fable-5']);

export type UpstreamErrorCode =
  | 'AUTH'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'UPSTREAM'
  | 'REFUSAL'
  | 'TRUNCATED'
  | 'BAD_JSON'
  | 'ABORTED';

export interface UpstreamUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export type UpstreamResult =
  | {
      readonly ok: true;
      /** 모델이 낸 JSON(구조화 출력)을 파싱한 값. 검증은 `verifyInterpretation` 이 한다. */
      readonly raw: unknown;
      readonly model: string;
      readonly usage: UpstreamUsage;
      /** 서버측 폴백이 실제로 실행됐는가(다른 모델이 답했는가). */
      readonly fellBack: boolean;
    }
  | {
      readonly ok: false;
      readonly code: UpstreamErrorCode;
      readonly message: string;
      /** 잠시 뒤 같은 요청을 다시 보내면 성공할 수 있는가. */
      readonly retryable: boolean;
      readonly status?: number;
    };

export interface Caller {
  (req: InterpretationRequest, signal?: AbortSignal): Promise<UpstreamResult>;
}

export interface CallerOptions {
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly serverSideFallback: boolean;
  readonly logger: Logger;
  /** 테스트에서 SDK 대신 끼워 넣는 최소 호출기. */
  readonly transport?: RawTransport;
}

/** SDK 를 감싼 최소 표면. 테스트는 이것만 갈아 끼운다(HTTP 를 흉내 내지 않는다). */
export interface RawTransport {
  create(
    body: Record<string, unknown>,
    options: { readonly signal?: AbortSignal | undefined },
  ): Promise<unknown>;
}

/* ─────────────────────────── 응답 좁히기 ─────────────────────────── */

interface MessageShape {
  readonly model?: unknown;
  readonly stop_reason?: unknown;
  readonly stop_details?: unknown;
  readonly content?: unknown;
  readonly usage?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readNumber(source: Record<string, unknown> | null, key: string): number {
  const v = source?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function usageOf(message: unknown): UpstreamUsage {
  const usage = asRecord(asRecord(message)?.['usage']);
  return {
    inputTokens: readNumber(usage, 'input_tokens'),
    outputTokens: readNumber(usage, 'output_tokens'),
    cacheReadTokens: readNumber(usage, 'cache_read_input_tokens'),
    cacheWriteTokens: readNumber(usage, 'cache_creation_input_tokens'),
  };
}

/** `content` 의 text 블록만 이어 붙인다. thinking 블록은 본문이 아니다(그리고 비어 있다). */
export function textOf(message: unknown): string {
  const content = asRecord(message)?.['content'];
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const block of content) {
    const b = asRecord(block);
    if (b?.['type'] === 'text' && typeof b['text'] === 'string') out += b['text'];
  }
  return out;
}

/** 서버측 폴백이 실행됐는지 — `fallback` 콘텐츠 블록이 전환 지점을 표시한다. */
export function detectFallback(message: unknown): boolean {
  const content = asRecord(message)?.['content'];
  if (!Array.isArray(content)) return false;
  return content.some((block) => asRecord(block)?.['type'] === 'fallback');
}

/**
 * 메시지 → 결과.
 *
 * `stop_reason` 을 **`content` 보다 먼저** 본다. 거절(`refusal`)이면 `content` 가 비어 있거나
 * 잘려 있어서, 먼저 읽으면 "빈 JSON" 으로 오해하고 엉뚱한 코드로 실패한다.
 */
export function interpretMessage(message: unknown): UpstreamResult {
  const m = (asRecord(message) ?? {}) as MessageShape;
  const model = typeof m.model === 'string' ? m.model : 'unknown';
  const usage = usageOf(message);

  if (m.stop_reason === 'refusal') {
    const details = asRecord(m.stop_details);
    const category = typeof details?.['category'] === 'string' ? details['category'] : 'unknown';
    return {
      ok: false,
      code: 'REFUSAL',
      message: `모델이 요청을 거절했다 (category=${category})`,
      retryable: false,
    };
  }
  if (m.stop_reason === 'max_tokens') {
    // 사고(thinking)와 본문이 같은 max_tokens 예산을 나눠 쓴다. 잘린 JSON 은 파싱해 봐야 실패한다.
    return {
      ok: false,
      code: 'TRUNCATED',
      message: 'max_tokens 에서 잘렸다 — 라우팅의 maxTokens 를 올리거나 effort 를 낮춰야 한다',
      retryable: false,
    };
  }

  const text = textOf(message);
  if (text.trim() === '') {
    return { ok: false, code: 'BAD_JSON', message: '본문 text 블록이 비어 있다', retryable: true };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      code: 'BAD_JSON',
      message: '구조화 출력이 JSON 으로 파싱되지 않았다',
      retryable: true,
    };
  }
  return { ok: true, raw, model, usage, fellBack: detectFallback(message) };
}

/* ─────────────────────────── 에러 매핑 ─────────────────────────── */

export function mapError(error: unknown): UpstreamResult {
  if (error instanceof APIUserAbortError) {
    return { ok: false, code: 'ABORTED', message: '요청이 취소되었다', retryable: false };
  }
  if (error instanceof APIConnectionTimeoutError) {
    return { ok: false, code: 'TIMEOUT', message: '업스트림 응답이 시간 안에 오지 않았다', retryable: true };
  }
  if (error instanceof RateLimitError) {
    return { ok: false, code: 'RATE_LIMITED', message: '업스트림 레이트리밋', retryable: true, status: 429 };
  }
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    // 키 문제는 재시도해도 그대로다. 메시지에 키를 넣지 않는다.
    return {
      ok: false,
      code: 'AUTH',
      message: 'API 키가 거부됐다 — ANTHROPIC_API_KEY 를 확인한다',
      retryable: false,
      status: error.status,
    };
  }
  if (error instanceof BadRequestError) {
    return { ok: false, code: 'BAD_REQUEST', message: error.message, retryable: false, status: 400 };
  }
  if (error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : 0;
    return {
      ok: false,
      code: 'UPSTREAM',
      message: `업스트림 오류 ${status}`,
      retryable: status === 0 || status >= 500,
      status,
    };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { ok: false, code: 'ABORTED', message: '요청이 취소되었다', retryable: false };
  }
  return { ok: false, code: 'NETWORK', message: '업스트림에 도달하지 못했다', retryable: true };
}

/** 베타 헤더/파라미터를 몰라서 난 400 인가. 그렇다면 한 번은 베타 없이 다시 시도해 볼 값이 있다. */
export function isFallbackBetaRejection(result: UpstreamResult): boolean {
  if (result.ok || result.code !== 'BAD_REQUEST') return false;
  return /fallback|beta/i.test(result.message);
}

/* ─────────────────────────── 호출기 ─────────────────────────── */

export function createSdkTransport(options: {
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}): RawTransport {
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: options.timeoutMs,
    maxRetries: options.maxRetries,
  });

  return {
    async create(body, opts) {
      // `betas` 가 있으면 베타 엔드포인트로 보낸다(SDK 가 anthropic-beta 헤더를 붙인다).
      // 캐스팅은 여기 두 줄이 전부다 — SDK 타입이 `fallbacks` 를 아직 모른다(파일 상단 주석).
      const useBeta = Array.isArray(body['betas']) && body['betas'].length > 0;
      return useBeta
        ? await client.beta.messages.create(body as never, { signal: opts.signal })
        : await client.messages.create(body as never, { signal: opts.signal });
    },
  };
}

export function createCaller(options: CallerOptions): Caller {
  const transport =
    options.transport ??
    createSdkTransport({
      apiKey: options.apiKey,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
    });

  // 베타가 조직에 열려 있지 않아 400 이 나면 프로세스 수명 동안 다시 시도하지 않는다.
  let fallbackEnabled = options.serverSideFallback;

  return async function call(req, signal) {
    const base = toMessagesApiParams(req);
    const wantsFallback = fallbackEnabled && FALLBACK_CAPABLE_MODELS.has(req.routing.model);

    const body: Record<string, unknown> = wantsFallback
      ? { ...base, betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default' }
      : base;

    let result = await once(transport, body, signal);

    if (wantsFallback && isFallbackBetaRejection(result)) {
      options.logger.warn('server-side fallback 베타가 거부됐다 — 이번 프로세스에서는 끈다', {
        beta: SERVER_SIDE_FALLBACK_BETA,
      });
      fallbackEnabled = false;
      result = await once(transport, base, signal);
    }

    return result;
  };
}

async function once(
  transport: RawTransport,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<UpstreamResult> {
  try {
    const message = await transport.create(body, { signal });
    return interpretMessage(message);
  } catch (error) {
    return mapError(error);
  }
}
