/**
 * 테스트 픽스처. **실제 계산 엔진 출력**을 쓴다.
 *
 * 손으로 적은 차트를 쓰면 `requestSchema.ts` 가 엔진과 어긋나도 테스트가 초록으로 남는다
 * (그 어긋남의 결과는 "프로덕션에서 전부 400" 이다). `computeChart()` 를 그대로 부르면
 * 스키마가 엔진 출력의 실제 모양을 따라가는지 매 실행마다 확인된다.
 */

import { computeChart, type Chart } from '../../app/src/shared/lib/saju';
import { CARDS } from '../../app/src/shared/knowledge';
import {
  renderTemplateInterpretation,
  toRawShape,
  type InterpretationRequest,
} from '../../app/src/shared/interpret';
import type { ServerConfig } from '../src/config';
import { buildRequestFor, LLM_RETRIEVAL, type InterpretInput } from '../src/interpret';

export function makeChart(overrides: Partial<Parameters<typeof computeChart>[0]> = {}): Chart {
  return computeChart({
    calendarType: 'solar',
    year: 1990,
    month: 5,
    day: 15,
    hour: 14,
    minute: 30,
    gender: 'M',
    timeUnknown: false,
    birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
    ...overrides,
  });
}

/** 삼주(생시 모름) 차트 — 시주가 null 이고 gz8 이 세 토막이다. */
export function makeThreePillarChart(): Chart {
  return computeChart({
    calendarType: 'solar',
    year: 1987,
    month: 11,
    day: 3,
    gender: 'F',
    timeUnknown: true,
    birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
  });
}

export const SAMPLE_BODY = (chart: Chart = makeChart()) => ({
  kind: 'fusion' as const,
  chart,
  profile: { gender: 'M' as const, mbti: 'INTJ', blood: 'A' as const },
});

export function makeInput(overrides: Partial<InterpretInput> = {}): InterpretInput {
  return {
    kind: 'fusion',
    chart: makeChart(),
    profile: { gender: 'M', mbti: 'INTJ', blood: 'A' },
    ...overrides,
  };
}

/** 실제 조립기를 통과한 요청. 프롬프트·카드·narrativeKey 가 프로덕션과 같다. */
export function makeRequest(input: InterpretInput = makeInput()): InterpretationRequest {
  const built = buildRequestFor(input, CARDS, LLM_RETRIEVAL);
  if (!built.ok) throw new Error(`요청 조립 실패: ${built.message}`);
  return built.request;
}

/**
 * 검증을 통과하는 모델 응답(snake_case).
 * 앱의 규칙 렌더러가 만든 문장을 그대로 쓴다 — 손으로 적으면 `guard.ts` 규칙(간지·수치·금지어)을
 * 우연히 어겨서 "테스트만 빨간" 상황이 생긴다.
 */
export function validRawResponse(req: InterpretationRequest): unknown {
  return toRawShape(renderTemplateInterpretation(req));
}

/** 업스트림이 돌려주는 메시지 모양(구조화 출력은 text 블록 하나에 JSON 이 담겨 온다). */
export function messageWith(raw: unknown, extra: Record<string, unknown> = {}): unknown {
  return {
    id: 'msg_test',
    model: 'claude-opus-5',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(raw) }],
    usage: { input_tokens: 6500, output_tokens: 2800, cache_read_input_tokens: 2350, cache_creation_input_tokens: 0 },
    ...extra,
  };
}

export function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    apiKey: 'sk-ant-test-key-not-real',
    allowedOrigins: ['https://sajuapp.web.tossmini.com'],
    maxBodyBytes: 128 * 1024,
    rateLimit: { windowMs: 60_000, max: 100 },
    maxInFlight: 4,
    cache: { maxEntries: 100, ttlMs: 60_000 },
    upstreamTimeoutMs: 5_000,
    upstreamMaxRetries: 0,
    maxAttempts: 1,
    serverSideFallback: true,
    trustProxy: false,
    logLevel: 'silent',
    ...overrides,
  };
}
