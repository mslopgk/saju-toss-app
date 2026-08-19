/**
 * 업스트림 호출 경계 테스트. **실제 Anthropic 호출은 한 건도 하지 않는다** — `RawTransport` 를 갈아 끼운다.
 * 키가 없으므로 실호출 검증은 불가능하고, 그 사실은 README 에 명시했다. 여기서 고정하는 것은
 * "무엇을 보내는가"와 "무엇을 받았을 때 어떻게 판단하는가"뿐이다.
 */

import { describe, expect, it, vi } from 'vitest';
import { BadRequestError, RateLimitError } from '@anthropic-ai/sdk';

import {
  createCaller,
  detectFallback,
  interpretMessage,
  isFallbackBetaRejection,
  mapError,
  SERVER_SIDE_FALLBACK_BETA,
  textOf,
  usageOf,
  type RawTransport,
} from '../src/anthropic';
import { NOOP_LOGGER } from '../src/log';
import { makeInput, makeRequest, messageWith, validRawResponse } from './fixtures';

function transportReturning(value: unknown | ((body: Record<string, unknown>) => unknown)): {
  transport: RawTransport;
  bodies: Record<string, unknown>[];
} {
  const bodies: Record<string, unknown>[] = [];
  const transport: RawTransport = {
    async create(body) {
      bodies.push(body);
      return typeof value === 'function' ? (value as (b: Record<string, unknown>) => unknown)(body) : value;
    },
  };
  return { transport, bodies };
}

describe('요청 본문 — 400 을 부르는 파라미터가 없다', () => {
  it('temperature / top_p / top_k / budget_tokens / assistant prefill 이 없다', async () => {
    const req = makeRequest();
    const { transport, bodies } = transportReturning(messageWith(validRawResponse(req)));
    const call = createCaller({
      apiKey: 'sk-ant-test',
      timeoutMs: 1_000,
      maxRetries: 0,
      serverSideFallback: false,
      logger: NOOP_LOGGER,
      transport,
    });
    await call(req);

    const body = bodies[0]!;
    for (const forbidden of ['temperature', 'top_p', 'top_k']) {
      expect(Object.keys(body)).not.toContain(forbidden);
    }
    expect(JSON.stringify(body['thinking'])).not.toContain('budget_tokens');
    const messages = body['messages'] as { role: string }[];
    expect(messages.at(-1)?.role).toBe('user');
  });

  it('구조화 출력과 프롬프트 캐시 브레이크포인트가 붙어 있다', async () => {
    const req = makeRequest();
    const { transport, bodies } = transportReturning(messageWith(validRawResponse(req)));
    const call = createCaller({
      apiKey: 'sk-ant-test',
      timeoutMs: 1_000,
      maxRetries: 0,
      serverSideFallback: false,
      logger: NOOP_LOGGER,
      transport,
    });
    await call(req);

    const body = bodies[0]!;
    const outputConfig = body['output_config'] as Record<string, unknown>;
    expect((outputConfig['format'] as Record<string, unknown>)['type']).toBe('json_schema');
    expect(outputConfig['effort']).toBe('high');
    expect(body['model']).toBe('claude-opus-5');

    // 캐시는 접두사 일치라 마지막 정적 블록 하나에만 브레이크포인트를 건다.
    const system = body['system'] as Record<string, unknown>[];
    const withCache = system.filter((b) => b['cache_control'] !== undefined);
    expect(withCache).toHaveLength(1);
    expect(system.at(-1)).toBe(withCache[0]);
  });
});

describe('서버측 거부 폴백', () => {
  it('Opus 5 요청에는 fallbacks + 베타를 붙인다', async () => {
    const req = makeRequest();
    const { transport, bodies } = transportReturning(messageWith(validRawResponse(req)));
    const call = createCaller({
      apiKey: 'sk-ant-test',
      timeoutMs: 1_000,
      maxRetries: 0,
      serverSideFallback: true,
      logger: NOOP_LOGGER,
      transport,
    });
    await call(req);
    expect(bodies[0]!['fallbacks']).toBe('default');
    expect(bodies[0]!['betas']).toEqual([SERVER_SIDE_FALLBACK_BETA]);
  });

  it('Sonnet 라우팅(basic_saju)에는 붙이지 않는다', async () => {
    const req = makeRequest(makeInput({ kind: 'basic_saju' }));
    expect(req.routing.model).toBe('claude-sonnet-5');
    const { transport, bodies } = transportReturning(messageWith(validRawResponse(req)));
    const call = createCaller({
      apiKey: 'sk-ant-test',
      timeoutMs: 1_000,
      maxRetries: 0,
      serverSideFallback: true,
      logger: NOOP_LOGGER,
      transport,
    });
    await call(req);
    expect(bodies[0]!['fallbacks']).toBeUndefined();
    expect(bodies[0]!['betas']).toBeUndefined();
  });

  it('베타가 400 이면 한 번 후퇴하고, 그 뒤로는 아예 붙이지 않는다', async () => {
    const req = makeRequest();
    let seen = 0;
    const transport: RawTransport = {
      async create(body) {
        seen += 1;
        if (body['fallbacks'] !== undefined) {
          throw new BadRequestError(
            400,
            { type: 'error', error: { type: 'invalid_request_error', message: 'unknown field: fallbacks' } },
            'unknown field: fallbacks',
            new Headers(),
          );
        }
        return messageWith(validRawResponse(req));
      },
    };
    const warn = vi.fn();
    const call = createCaller({
      apiKey: 'sk-ant-test',
      timeoutMs: 1_000,
      maxRetries: 0,
      serverSideFallback: true,
      logger: { ...NOOP_LOGGER, warn },
      transport,
    });

    const first = await call(req);
    expect(first.ok).toBe(true);
    expect(seen).toBe(2); // 베타로 1회 + 후퇴 1회
    expect(warn).toHaveBeenCalledOnce();

    const second = await call(req);
    expect(second.ok).toBe(true);
    expect(seen).toBe(3); // 두 번째 요청은 처음부터 베타 없이
  });

  it('폴백 판정은 400 메시지 내용으로 한다', () => {
    expect(
      isFallbackBetaRejection({ ok: false, code: 'BAD_REQUEST', message: 'unknown beta', retryable: false }),
    ).toBe(true);
    expect(
      isFallbackBetaRejection({ ok: false, code: 'BAD_REQUEST', message: 'max_tokens too large', retryable: false }),
    ).toBe(false);
    expect(
      isFallbackBetaRejection({ ok: false, code: 'RATE_LIMITED', message: 'beta', retryable: true }),
    ).toBe(false);
  });
});

describe('interpretMessage — stop_reason 을 content 보다 먼저 본다', () => {
  it('정상 응답은 JSON 을 파싱해 돌려준다', () => {
    const req = makeRequest();
    const raw = validRawResponse(req);
    const result = interpretMessage(messageWith(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw).toEqual(raw);
    expect(result.usage.cacheReadTokens).toBe(2350);
    expect(result.fellBack).toBe(false);
  });

  it('refusal 은 content 를 읽지 않고 거절로 판단한다', () => {
    const result = interpretMessage({
      model: 'claude-opus-5',
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber' },
      content: [],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('REFUSAL');
    expect(result.message).toContain('cyber');
    expect(result.retryable).toBe(false);
  });

  it('max_tokens 절단은 BAD_JSON 이 아니라 TRUNCATED 로 구분한다', () => {
    const result = interpretMessage({
      model: 'claude-opus-5',
      stop_reason: 'max_tokens',
      content: [{ type: 'text', text: '{"headline":"잘' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TRUNCATED');
  });

  it('JSON 이 아니면 BAD_JSON(재시도 가치 있음)', () => {
    const result = interpretMessage({
      model: 'claude-opus-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '설명을 곁들인 답변입니다' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('BAD_JSON');
    expect(result.retryable).toBe(true);
  });

  it('빈 본문도 BAD_JSON', () => {
    const result = interpretMessage({ stop_reason: 'end_turn', content: [] });
    expect(result.ok && 'x').toBe(false);
  });

  it('thinking 블록은 본문에서 제외한다', () => {
    expect(
      textOf({
        content: [
          { type: 'thinking', thinking: '' },
          { type: 'text', text: '{"a":1}' },
        ],
      }),
    ).toBe('{"a":1}');
  });

  it('fallback 콘텐츠 블록이 있으면 다른 모델이 답한 것으로 본다', () => {
    expect(detectFallback({ content: [{ type: 'fallback', from: {}, to: {} }, { type: 'text', text: '{}' }] })).toBe(true);
    expect(detectFallback({ content: [{ type: 'text', text: '{}' }] })).toBe(false);
  });

  it('usage 가 없어도 0 으로 읽는다', () => {
    expect(usageOf({})).toEqual({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

describe('mapError', () => {
  const headers = new Headers();

  it('429 는 재시도 가능', () => {
    const r = mapError(new RateLimitError(429, { type: 'error' }, 'slow down', headers));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('RATE_LIMITED');
    expect(r.retryable).toBe(true);
  });

  it('400 은 재시도 불가', () => {
    const r = mapError(new BadRequestError(400, { type: 'error' }, 'bad', headers));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('BAD_REQUEST');
    expect(r.retryable).toBe(false);
  });

  it('알 수 없는 오류는 네트워크로 본다(재시도 가능)', () => {
    const r = mapError(new Error('socket hang up'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NETWORK');
    expect(r.retryable).toBe(true);
  });

  it('에러 메시지에 키가 섞이지 않는다', () => {
    const r = mapError(new Error('auth failed for sk-ant-api03-REALKEY'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).not.toContain('sk-ant');
  });
});
