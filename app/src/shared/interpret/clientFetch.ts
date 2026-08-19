/**
 * `ServerInterpretationClient` — 우리 서버의 `POST /api/interpret` 를 부르는 구현.
 *
 * ⛔ **이 파일은 값(runtime) import 가 하나도 없다.** 의도적이다.
 *
 *   화면 계층이 LLM 경로를 쓰려면 어떤 모듈이든 하나는 import 해야 하는데, 그 모듈이 프롬프트 조립기
 *   (`buildRequest.ts`)나 목 클라이언트(`client.ts`)에 값으로 닿는 순간 시스템 프롬프트 전문이
 *   미니앱 번들에 실려 사용자 단말로 내려간다. 그래서 이 파일은 **그래프의 잎**으로 못박는다 —
 *   타입만 가져오고(`verbatimModuleSyntax` 아래서 완전히 지워진다), 검증도 zod 없이 손으로 한다.
 *   회귀는 `clientFetch.test.ts` 가 소스의 import 목록을 훑어 고정하고, 빌드 후 dist grep 이 이중으로 막는다.
 *
 * 보내는 것은 **차트와 자기신고 값뿐**이다. 조립된 프롬프트가 클라이언트→서버로 흐르면 클라이언트가
 * 시스템 프롬프트를 바꿔 보낼 수 있다(프롬프트 주입). 프롬프트는 서버에서만 만든다.
 * (근거: docs/interpretation.md §1 「클라이언트 / 서버 경계」)
 */

import type {
  InterpretationClient,
  InterpretationErrorCode,
  InterpretationInput,
  InterpretationOutcome,
  InterpretOptions,
} from './client';
import type { Interpretation, SummaryValue } from './schema';

/** `fetch` 의 필요한 부분만. 테스트가 가짜를 끼울 수 있고, 전역 fetch 에 묶이지 않는다. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}>;

export interface ServerClientOptions {
  /** 예: `https://api.example.com`. 뒤의 `/api/interpret` 는 이 클라이언트가 붙인다. */
  readonly baseUrl: string;
  /**
   * 클라이언트측 대기 한도.
   *
   * 기본 60초. Opus 5 + effort high 는 1분 가까이 걸릴 수 있다. 그동안 화면이 비지 않는 이유는
   * 규칙 기반 리포트가 이미 그려져 있고 LLM 결과가 도착하면 갈아 끼우기 때문이다.
   * 시간이 넘어 폴백으로 남더라도 **서버는 계산을 끝내 캐시에 넣으므로**, 다음 진입에서 즉시 뜬다.
   */
  readonly timeoutMs?: number;
  readonly fetchImpl?: FetchLike;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** 서버가 이보다 큰 것을 보내면 우리 쪽 실수이거나 우리 서버가 아니다. 화면에 그리기 전에 막는다. */
const LIMITS = {
  headline: 200,
  body: 4_000,
  action: 400,
  sections: 32,
  cards: 128,
  word: 40,
  sentence: 400,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

/**
 * 서버 응답의 `value` → `Interpretation`.
 *
 * 모양과 길이만 본다. **의미 검증(섹션 id 가 실재하는가·근거 카드가 무엇인가)은 서버가 이미
 * `verifyInterpretation()` 으로 끝냈고**, 화면 쪽 마지막 확인은 `features/report` 가 섹션 제목표와
 * 대조하며 한다. 여기서 그 표를 다시 들고 오면 그래프가 넓어진다.
 */
export function parseInterpretation(value: unknown): Interpretation | null {
  if (!isRecord(value)) return null;
  const headline = boundedString(value['headline'], LIMITS.headline);
  const actionToday = boundedString(value['actionToday'], LIMITS.action);
  if (headline === null || actionToday === null) return null;

  const rawSections = value['sections'];
  if (!Array.isArray(rawSections) || rawSections.length === 0 || rawSections.length > LIMITS.sections) {
    return null;
  }
  const sections: { id: string; body: string }[] = [];
  for (const item of rawSections) {
    if (!isRecord(item)) return null;
    const id = boundedString(item['id'], 40);
    const body = boundedString(item['body'], LIMITS.body);
    if (id === null || body === null) return null;
    sections.push({ id, body });
  }

  const rawCards = value['usedCardIds'];
  if (!Array.isArray(rawCards) || rawCards.length > LIMITS.cards) return null;
  const usedCardIds: string[] = [];
  for (const id of rawCards) {
    const parsed = boundedString(id, 120);
    if (parsed === null) return null;
    usedCardIds.push(parsed);
  }

  // `id` 는 문자열로만 좁혀 두고 `SectionId` 로의 확정은 호출부(섹션 제목표를 가진 쪽)에 맡긴다.
  return { headline, sections, actionToday, usedCardIds } as Interpretation;
}

/**
 * 서버 응답의 `value` → `SummaryValue`.
 *
 * 홈의 한 단어·한 문장이다. 길이 상한만 본다 — 어휘 규율(단어 2~10자, 문장 20~80자)은
 * 서버가 `verifySummary()` 로 이미 끝냈고, 여기서 그 상수를 다시 들고 오면 그래프가 넓어진다.
 * 여기 한도는 "우리 서버가 맞는가"를 보는 방어선이지 품질 검사가 아니다.
 */
export function parseSummary(value: unknown): SummaryValue | null {
  if (!isRecord(value)) return null;
  const word = boundedString(value['word'], LIMITS.word);
  const sentence = boundedString(value['sentence'], LIMITS.sentence);
  if (word === null || sentence === null) return null;

  const rawCards = value['usedCardIds'];
  if (!Array.isArray(rawCards) || rawCards.length === 0 || rawCards.length > LIMITS.cards) return null;
  const usedCardIds: string[] = [];
  for (const id of rawCards) {
    const parsed = boundedString(id, 120);
    if (parsed === null) return null;
    usedCardIds.push(parsed);
  }

  return { word, sentence, usedCardIds };
}

export type SummaryOutcome =
  | {
      readonly status: 'ok';
      readonly source: 'llm' | 'cache';
      readonly narrativeKey: string;
      readonly value: SummaryValue;
    }
  | { readonly status: 'rejected'; readonly narrativeKey: string }
  | { readonly status: 'error'; readonly code: InterpretationErrorCode; readonly message: string };

function errorOutcome(code: InterpretationErrorCode, message: string): InterpretationOutcome {
  return { status: 'error', code, message };
}

/** HTTP 상태 → 우리 에러 코드. 어떤 코드든 호출부의 처리는 "규칙 기반으로 폴백"으로 같다. */
export function codeForStatus(status: number): InterpretationErrorCode {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 504 || status === 408) return 'TIMEOUT';
  if (status === 400 || status === 413) return 'BUILD';
  return 'UPSTREAM';
}

/** `post()` 가 돌려주는 것. 전송·시간초과·JSON 파싱까지만 책임지고, 의미 해석은 호출부가 한다. */
type PostResult =
  | {
      readonly kind: 'payload';
      readonly ok: boolean;
      readonly status: number;
      readonly payload: Record<string, unknown>;
    }
  | { readonly kind: 'error'; readonly code: InterpretationErrorCode; readonly message: string };

export class ServerInterpretationClient implements InterpretationClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: ServerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /**
   * 두 라우트가 공유하는 전송 경로.
   *
   * 시간초과·외부 취소·네트워크 오류를 라우트마다 다르게 다룰 이유가 없다. 한 벌만 두면
   * "요약 경로만 취소를 잘못 다룬다" 같은 어긋남이 생길 자리가 없다.
   */
  private async post(
    path: string,
    input: InterpretationInput,
    options: InterpretOptions,
  ): Promise<PostResult> {
    if (options.signal?.aborted === true) {
      return { kind: 'error', code: 'ABORTED', message: '요청이 취소되었습니다' };
    }

    // `AbortSignal.any` 를 쓰지 않는다 — WebView 지원 범위가 넓지 않다. 손으로 잇는다.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    // 취소 사유를 **직접 기록**한다. `signal.aborted` 를 나중에 다시 읽으면 타입 좁히기가
    // "이미 false 로 확인했다"고 판단해 버리고, 무엇보다 시간 초과와 외부 취소를 구분할 수 없다.
    let abortedByCaller = false;
    const onOuterAbort = () => {
      abortedByCaller = true;
      controller.abort();
    };
    options.signal?.addEventListener('abort', onOuterAbort);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: input.kind, chart: input.chart, profile: input.profile }),
        signal: controller.signal,
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { kind: 'error', code: 'UPSTREAM', message: '서버 응답을 읽지 못했습니다' };
      }

      if (!isRecord(payload)) {
        return { kind: 'error', code: 'UPSTREAM', message: '서버 응답 형식이 올바르지 않습니다' };
      }
      return { kind: 'payload', ok: response.ok, status: response.status, payload };
    } catch (error) {
      if (abortedByCaller) return { kind: 'error', code: 'ABORTED', message: '요청이 취소되었습니다' };
      // 타임아웃도 abort 로 나타난다 — 바깥에서 취소한 게 아니라면 시간 초과다.
      if (error instanceof Error && error.name === 'AbortError') {
        return { kind: 'error', code: 'TIMEOUT', message: '해석 서버가 제때 응답하지 않았습니다' };
      }
      return { kind: 'error', code: 'NETWORK', message: '해석 서버에 연결하지 못했습니다' };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  async interpret(
    input: InterpretationInput,
    options: InterpretOptions = {},
  ): Promise<InterpretationOutcome> {
    const result = await this.post('/api/interpret', input, options);
    if (result.kind === 'error') return errorOutcome(result.code, result.message);
    const { ok, status, payload } = result;

    if (ok && payload['status'] === 'ok') {
      const value = parseInterpretation(payload['value']);
      if (value === null) return errorOutcome('UPSTREAM', '서버 응답 형식이 올바르지 않습니다');
      const source = payload['source'] === 'cache' ? 'cache' : 'llm';
      const narrativeKey = boundedString(payload['narrativeKey'], 256) ?? '';
      return { status: 'ok', source, narrativeKey, value };
    }

    if (payload['status'] === 'rejected') {
      // 서버가 모델 응답을 폐기했다. 화면은 규칙 기반 문장을 그대로 둔다.
      return {
        status: 'rejected',
        narrativeKey: boundedString(payload['narrativeKey'], 256) ?? '',
        failures: [],
      };
    }

    return errorOutcome(codeForStatus(status), '해석 서버가 응답하지 못했습니다');
  }

  /**
   * 홈의 한 단어·한 문장(`POST /api/interpret/summary`).
   *
   * 전체 리포트와 **따로 부른다.** 홈만 보고 나가는 사용자에게 섹션 여섯 개를 만들게 하지 않는다.
   * 실패하면 화면은 규칙 기반 요약을 그대로 둔다 — 요약은 AI 가 없어도 이미 채워져 있다.
   */
  async summary(input: InterpretationInput, options: InterpretOptions = {}): Promise<SummaryOutcome> {
    const result = await this.post('/api/interpret/summary', input, options);
    if (result.kind === 'error') {
      return { status: 'error', code: result.code, message: result.message };
    }
    const { ok, status, payload } = result;

    if (ok && payload['status'] === 'ok') {
      const value = parseSummary(payload['value']);
      if (value === null) {
        return { status: 'error', code: 'UPSTREAM', message: '서버 응답 형식이 올바르지 않습니다' };
      }
      const source = payload['source'] === 'cache' ? 'cache' : 'llm';
      return {
        status: 'ok',
        source,
        narrativeKey: boundedString(payload['narrativeKey'], 256) ?? '',
        value,
      };
    }

    if (payload['status'] === 'rejected') {
      return { status: 'rejected', narrativeKey: boundedString(payload['narrativeKey'], 256) ?? '' };
    }

    return { status: 'error', code: codeForStatus(status), message: '해석 서버가 응답하지 못했습니다' };
  }
}
