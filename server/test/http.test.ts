/**
 * HTTP 통합 테스트 — 진짜 `node:http` 서버를 임의 포트에 띄우고 `fetch` 로 때린다.
 * 업스트림만 가짜다. 헤더·상태코드·본문 크기 상한처럼 "핸들러를 직접 부르면 안 보이는 것"을 잡기 위해서다.
 */

import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from '../src/server';
import { PROMPT_VERSION } from '../../app/src/shared/interpret';
import type { Caller } from '../src/anthropic';
import { makeConfig, makeThreePillarChart, SAMPLE_BODY, validRawResponse } from './fixtures';

const ORIGIN = 'https://sajuapp.web.tossmini.com';

const templateCaller: Caller = async (req) => ({
  ok: true,
  raw: validRawResponse(req),
  model: 'claude-opus-5',
  usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
  fellBack: false,
});

interface Harness {
  readonly base: string;
  readonly server: Server;
  close(): Promise<void>;
}

async function start(options: Parameters<typeof buildServer>[0]): Promise<Harness> {
  const built = buildServer(options);
  const server = createServer(built.handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('주소를 얻지 못했다');
  return {
    base: `http://127.0.0.1:${address.port}`,
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let harness: Harness | undefined;

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return await fetch(`${harness!.base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe('라우팅과 CORS', () => {
  beforeEach(async () => {
    harness = await start({ config: makeConfig(), caller: templateCaller });
  });

  it('GET /health 는 비밀값 없이 상태를 준다', async () => {
    const res = await fetch(`${harness!.base}/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json['status']).toBe('ok');
    // 버전 문자열을 베끼지 않는다 — 올릴 때마다 이 테스트가 깨질 이유가 없다.
    expect(json['promptVersion']).toBe(PROMPT_VERSION);
    expect(JSON.stringify(json)).not.toContain('sk-ant');
  });

  it('프리플라이트는 204 와 허용 헤더를 준다', async () => {
    const res = await fetch(`${harness!.base}/api/interpret`, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('허용되지 않은 오리진은 403 이고 CORS 헤더가 없다', async () => {
    const res = await post('/api/interpret', SAMPLE_BODY(), { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('없는 경로는 404, 잘못된 메서드는 405', async () => {
    expect((await fetch(`${harness!.base}/nope`, { headers: { origin: ORIGIN } })).status).toBe(404);
    const res = await fetch(`${harness!.base}/api/interpret`, { headers: { origin: ORIGIN } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('POST');
  });

  it('응답은 캐시 금지·스니핑 금지 헤더를 단다', async () => {
    const res = await post('/api/interpret', SAMPLE_BODY());
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('POST /api/interpret', () => {
  it('정상 요청은 200 + 해석을, 두 번째는 캐시를 준다', async () => {
    const call = vi.fn(templateCaller);
    harness = await start({ config: makeConfig(), caller: call });

    const first = (await (await post('/api/interpret', SAMPLE_BODY())).json()) as Record<string, unknown>;
    expect(first['status']).toBe('ok');
    expect(first['source']).toBe('llm');
    expect((first['value'] as Record<string, unknown>)['headline']).toBeTypeOf('string');

    const second = (await (await post('/api/interpret', SAMPLE_BODY())).json()) as Record<string, unknown>;
    expect(second['source']).toBe('cache');
    expect(call).toHaveBeenCalledOnce();
  });

  it('응답 본문에 시스템 프롬프트가 새지 않는다', async () => {
    harness = await start({ config: makeConfig(), caller: templateCaller });
    const text = await (await post('/api/interpret', SAMPLE_BODY())).text();
    for (const needle of ['사실 규율', '출력 계약', '너는 사주', 'knowledge_cards', 'fact_pack']) {
      expect(text).not.toContain(needle);
    }
  });

  it('JSON 이 아니면 400', async () => {
    harness = await start({ config: makeConfig(), caller: templateCaller });
    const res = await post('/api/interpret', '{oops');
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>)['code']).toBe('BAD_JSON');
  });

  it('형식이 어긋나면 400 + 경로 목록', async () => {
    harness = await start({ config: makeConfig(), caller: templateCaller });
    const res = await post('/api/interpret', { kind: 'fusion', chart: {}, profile: {} });
    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json['code']).toBe('BAD_REQUEST');
    expect(Array.isArray(json['issues'])).toBe(true);
  });

  it('본문이 상한을 넘으면 413 이고 업스트림을 부르지 않는다', async () => {
    const call = vi.fn(templateCaller);
    harness = await start({ config: makeConfig({ maxBodyBytes: 2_048 }), caller: call });
    const body = { ...SAMPLE_BODY(), padding: 'x'.repeat(8_000) };
    const res = await post('/api/interpret', body);
    expect(res.status).toBe(413);
    expect(call).not.toHaveBeenCalled();
  });

  it('레이트리밋에 걸리면 429 + Retry-After', async () => {
    const call = vi.fn(templateCaller);
    harness = await start({
      config: makeConfig({ rateLimit: { windowMs: 60_000, max: 1 } }),
      caller: call,
    });
    expect((await post('/api/interpret', SAMPLE_BODY())).status).toBe(200);
    const blocked = await post('/api/interpret', SAMPLE_BODY());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('검증에 걸린 응답은 422 다(클라이언트가 폴백한다)', async () => {
    const broken: Caller = async (req) => {
      const raw = validRawResponse(req) as { sections: unknown[] };
      return {
        ok: true,
        raw: { ...raw, sections: [] },
        model: 'claude-opus-5',
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        fellBack: false,
      };
    };
    harness = await start({ config: makeConfig(), caller: broken });
    const res = await post('/api/interpret', SAMPLE_BODY());
    expect(res.status).toBe(422);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json['status']).toBe('rejected');
    expect(Array.isArray(json['failures'])).toBe(true);
  });

  it('업스트림 오류는 상태코드로 구분된다', async () => {
    const failing: Caller = async () => ({
      ok: false,
      code: 'TIMEOUT',
      message: '시간 초과',
      retryable: true,
    });
    harness = await start({ config: makeConfig(), caller: failing });
    const res = await post('/api/interpret', SAMPLE_BODY());
    expect(res.status).toBe(504);
    expect(((await res.json()) as Record<string, unknown>)['code']).toBe('TIMEOUT');
  });

  it('키가 거부되면 502 이고 키 값이 응답에 없다', async () => {
    const failing: Caller = async () => ({
      ok: false,
      code: 'AUTH',
      message: 'API 키가 거부됐다 — ANTHROPIC_API_KEY 를 확인한다',
      retryable: false,
      status: 401,
    });
    harness = await start({ config: makeConfig(), caller: failing });
    const res = await post('/api/interpret', SAMPLE_BODY());
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('sk-ant');
  });

  it('삼주 차트도 끝까지 통과한다', async () => {
    harness = await start({ config: makeConfig(), caller: templateCaller });
    const res = await post('/api/interpret', {
      kind: 'basic_saju',
      chart: makeThreePillarChart(),
      profile: { gender: 'F', mbti: null, blood: null },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json['status']).toBe('ok');
  });
});
