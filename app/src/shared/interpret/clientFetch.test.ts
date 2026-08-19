/**
 * `clientFetch.ts` 는 **그래프의 잎**이어야 한다.
 *
 * 화면이 LLM 경로를 쓰려면 이 파일을 import 하는데, 여기가 값으로 프롬프트 조립기·목 클라이언트에
 * 닿으면 시스템 프롬프트가 미니앱 번들로 내려간다. `ui.test.ts` 는 `ui.ts` 에서 출발한 폐쇄만
 * 고정하므로(이 파일은 그 폐쇄에 없다) 여기서 따로 못박는다.
 */

import { describe, expect, it, vi } from 'vitest';

import { codeForStatus, parseInterpretation, ServerInterpretationClient, type FetchLike } from './clientFetch';
import type { InterpretationInput } from './client';
import { ENGINE_V1_CHART, SAMPLE_PROFILE } from './fixtures';

const SOURCE = (
  import.meta.glob('./clientFetch.ts', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
)['./clientFetch.ts'];

/** `import ... from 'x'` 중 값 import 만. (`ui.test.ts` 와 같은 규칙) */
function valueImports(text: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+([\s\S]*?)\s*from\s*'([^']+)'/gm;
  for (const m of text.matchAll(re)) {
    if (/^type\b/.test((m[1] ?? '').trim())) continue;
    out.push(m[2] ?? '');
  }
  return out;
}

describe('clientFetch — 서버 코드 격리', () => {
  it('소스를 읽었다(테스트가 헛돌지 않는지)', () => {
    expect(SOURCE).toBeTypeOf('string');
    expect((SOURCE ?? '').length).toBeGreaterThan(0);
  });

  it('값(runtime) import 가 하나도 없다', () => {
    expect(valueImports(SOURCE ?? '')).toEqual([]);
  });

  it('시스템 프롬프트 조각이 없다', () => {
    for (const needle of ['사실 규율', '출력 계약', '너는 사주', 'knowledge_cards', 'fact_pack']) {
      expect(SOURCE ?? '').not.toContain(needle);
    }
  });
});

const INPUT: InterpretationInput = { kind: 'fusion', chart: ENGINE_V1_CHART, profile: SAMPLE_PROFILE };

function fakeFetch(
  status: number,
  payload: unknown,
  options: { ok?: boolean; throws?: Error } = {},
): { impl: FetchLike; calls: { url: string; body: string }[] } {
  const calls: { url: string; body: string }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, body: init.body });
    if (options.throws !== undefined) throw options.throws;
    return {
      ok: options.ok ?? (status >= 200 && status < 300),
      status,
      json: async () => payload,
    };
  };
  return { impl, calls };
}

const VALID_VALUE = {
  headline: '병화 일간 · 여덟 글자의 두 겹',
  sections: [{ id: 'saju', body: '본문입니다.' }],
  actionToday: '오늘은 30분만 미리 정해 보세요.',
  usedCardIds: ['ilgan:丙'],
};

describe('ServerInterpretationClient — 보내는 것', () => {
  it('차트와 자기신고 값만 보낸다(프롬프트는 보내지 않는다)', async () => {
    const { impl, calls } = fakeFetch(200, { status: 'ok', source: 'llm', narrativeKey: 'k', value: VALID_VALUE });
    const client = new ServerInterpretationClient({ baseUrl: 'https://api.example.com/', fetchImpl: impl });
    await client.interpret(INPUT);

    expect(calls[0]?.url).toBe('https://api.example.com/api/interpret');
    const body = JSON.parse(calls[0]?.body ?? '{}') as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['chart', 'kind', 'profile']);
    expect(calls[0]?.body).not.toContain('사실 규율');
    expect(calls[0]?.body).not.toContain('system');
  });
});

describe('ServerInterpretationClient — 받는 것', () => {
  it('정상 응답을 Interpretation 으로 돌려준다', async () => {
    const { impl } = fakeFetch(200, { status: 'ok', source: 'cache', narrativeKey: 'k1', value: VALID_VALUE });
    const client = new ServerInterpretationClient({ baseUrl: 'https://api.example.com', fetchImpl: impl });
    const outcome = await client.interpret(INPUT);

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.source).toBe('cache');
    expect(outcome.narrativeKey).toBe('k1');
    expect(outcome.value.headline).toBe(VALID_VALUE.headline);
  });

  it('422(검증 거부)는 rejected 로 옮긴다', async () => {
    const { impl } = fakeFetch(422, { status: 'rejected', narrativeKey: 'k2', failures: [] });
    const client = new ServerInterpretationClient({ baseUrl: 'https://api.example.com', fetchImpl: impl });
    const outcome = await client.interpret(INPUT);
    expect(outcome.status).toBe('rejected');
  });

  it('상태코드를 에러 코드로 옮긴다', async () => {
    expect(codeForStatus(429)).toBe('RATE_LIMITED');
    expect(codeForStatus(504)).toBe('TIMEOUT');
    expect(codeForStatus(400)).toBe('BUILD');
    expect(codeForStatus(502)).toBe('UPSTREAM');
  });

  it('네트워크 오류는 NETWORK', async () => {
    const { impl } = fakeFetch(0, null, { throws: new TypeError('failed to fetch') });
    const client = new ServerInterpretationClient({ baseUrl: 'https://api.example.com', fetchImpl: impl });
    const outcome = await client.interpret(INPUT);
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.code).toBe('NETWORK');
  });

  it('시간이 넘으면 TIMEOUT', async () => {
    vi.useFakeTimers();
    try {
      const impl: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      const client = new ServerInterpretationClient({
        baseUrl: 'https://api.example.com',
        fetchImpl: impl,
        timeoutMs: 1_000,
      });
      const promise = client.interpret(INPUT);
      await vi.advanceTimersByTimeAsync(1_100);
      const outcome = await promise;
      expect(outcome.status).toBe('error');
      if (outcome.status !== 'error') return;
      expect(outcome.code).toBe('TIMEOUT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('바깥에서 취소하면 ABORTED', async () => {
    const controller = new AbortController();
    const impl: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    const client = new ServerInterpretationClient({ baseUrl: 'https://api.example.com', fetchImpl: impl });
    const promise = client.interpret(INPUT, { signal: controller.signal });
    controller.abort();
    const outcome = await promise;
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.code).toBe('ABORTED');
  });

  it('이미 취소된 신호면 호출하지 않는다', async () => {
    const { impl, calls } = fakeFetch(200, { status: 'ok', value: VALID_VALUE });
    const controller = new AbortController();
    controller.abort();
    const client = new ServerInterpretationClient({ baseUrl: 'https://api.example.com', fetchImpl: impl });
    const outcome = await client.interpret(INPUT, { signal: controller.signal });
    expect(calls).toHaveLength(0);
    expect(outcome.status).toBe('error');
  });
});

describe('parseInterpretation — 우리 서버가 아닌 응답을 화면에 그리지 않는다', () => {
  it('정상 모양은 통과', () => {
    expect(parseInterpretation(VALID_VALUE)).not.toBeNull();
  });

  it('필드가 빠지면 거부', () => {
    expect(parseInterpretation({ ...VALID_VALUE, headline: undefined })).toBeNull();
    expect(parseInterpretation({ ...VALID_VALUE, sections: [] })).toBeNull();
    expect(parseInterpretation({ ...VALID_VALUE, actionToday: '' })).toBeNull();
    expect(parseInterpretation({ ...VALID_VALUE, usedCardIds: 'nope' })).toBeNull();
    expect(parseInterpretation(null)).toBeNull();
    expect(parseInterpretation([VALID_VALUE])).toBeNull();
  });

  it('길이 상한을 넘기면 거부', () => {
    expect(parseInterpretation({ ...VALID_VALUE, headline: 'x'.repeat(201) })).toBeNull();
    expect(
      parseInterpretation({ ...VALID_VALUE, sections: [{ id: 'saju', body: 'x'.repeat(4_001) }] }),
    ).toBeNull();
    expect(
      parseInterpretation({
        ...VALID_VALUE,
        sections: Array.from({ length: 33 }, () => ({ id: 'saju', body: 'ok' })),
      }),
    ).toBeNull();
  });

  it('섹션 항목이 문자열이 아니면 거부', () => {
    expect(parseInterpretation({ ...VALID_VALUE, sections: [{ id: 1, body: 'ok' }] })).toBeNull();
    expect(parseInterpretation({ ...VALID_VALUE, sections: ['saju'] })).toBeNull();
  });
});
