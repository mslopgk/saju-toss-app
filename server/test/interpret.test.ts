/**
 * 오케스트레이션 — 조립 → 캐시 → 호출 → 검증 → 캐시 저장.
 */

import { describe, expect, it, vi } from 'vitest';

import { NarrativeCache } from '../src/cache';
import { Semaphore } from '../src/rateLimit';
import { NOOP_LOGGER } from '../src/log';
import { buildRequestFor, interpret, LLM_RETRIEVAL, type InterpretDeps } from '../src/interpret';
import type { Caller, UpstreamResult } from '../src/anthropic';
import { CARDS } from '../../app/src/shared/knowledge';
import type { Interpretation } from '../../app/src/shared/interpret';
import { makeInput, makeRequest, validRawResponse } from './fixtures';

function okUpstream(raw: unknown): UpstreamResult {
  return {
    ok: true,
    raw,
    model: 'claude-opus-5',
    usage: { inputTokens: 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
    fellBack: false,
  };
}

function makeDeps(call: Caller, overrides: Partial<InterpretDeps> = {}): InterpretDeps {
  return {
    knowledge: CARDS,
    call,
    cache: new NarrativeCache<Interpretation>({ maxEntries: 50, ttlMs: 60_000 }),
    logger: NOOP_LOGGER,
    semaphore: new Semaphore(4),
    maxAttempts: 1,
    retrieval: LLM_RETRIEVAL,
    ...overrides,
  };
}

/** 요청마다 그 요청에 맞는 유효 응답을 만들어 주는 호출기. */
const templateCaller: Caller = async (req) => okUpstream(validRawResponse(req));

describe('interpret — 정상 경로', () => {
  it('LLM 응답이 검증을 통과하면 ok 를 돌려주고 캐시에 넣는다', async () => {
    const call = vi.fn(templateCaller);
    const deps = makeDeps(call);
    const result = await interpret(makeInput(), deps);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.source).toBe('llm');
    expect(result.value.sections.length).toBeGreaterThan(0);
    expect(deps.cache.get(result.narrativeKey)).toBeDefined();
    expect(call).toHaveBeenCalledOnce();
  });

  it('두 번째 요청은 캐시에서 나온다(업스트림 호출 0)', async () => {
    const call = vi.fn(templateCaller);
    const deps = makeDeps(call);
    await interpret(makeInput(), deps);
    const second = await interpret(makeInput(), deps);

    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.source).toBe('cache');
    expect(call).toHaveBeenCalledOnce();
  });

  it('프로필이 다르면 다른 키다(캐시가 남의 서사를 주지 않는다)', async () => {
    const call = vi.fn(templateCaller);
    const deps = makeDeps(call);
    await interpret(makeInput(), deps);
    await interpret(makeInput({ profile: { gender: 'F', mbti: 'ENFP', blood: 'O' } }), deps);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('동시에 들어온 같은 차트는 한 번만 호출한다', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const call = vi.fn(async (req: Parameters<Caller>[0]) => {
      await gate;
      return okUpstream(validRawResponse(req));
    });
    const deps = makeDeps(call);

    const both = Promise.all([interpret(makeInput(), deps), interpret(makeInput(), deps)]);
    release();
    const [a, b] = await both;

    expect(call).toHaveBeenCalledOnce();
    expect(a.status).toBe('ok');
    expect(b.status).toBe('ok');
    expect(deps.cache.stats().coalesced).toBe(1);
  });
});

describe('interpret — 실패 경로', () => {
  it('검증에 걸리면 rejected 를 돌려주고 캐시에 넣지 않는다', async () => {
    // 섹션을 하나 빼서 SECTION_MISMATCH 를 유도한다.
    const call: Caller = async (req) => {
      const raw = validRawResponse(req) as { sections: unknown[] };
      return okUpstream({ ...raw, sections: raw.sections.slice(1) });
    };
    const deps = makeDeps(call);
    const result = await interpret(makeInput(), deps);

    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.failures.map((f) => f.code)).toContain('SECTION_MISMATCH');
    expect(deps.cache.get(result.narrativeKey)).toBeUndefined();
  });

  it('지어낸 간지는 거부된다(가드가 실제로 물려 있다)', async () => {
    const call: Caller = async (req) => {
      const raw = validRawResponse(req) as { sections: { id: string; body: string }[] };
      const first = raw.sections[0]!;
      return okUpstream({
        ...raw,
        sections: [{ ...first, body: `${first.body} 여기에 없는 己巳 를 덧붙입니다.` }, ...raw.sections.slice(1)],
      });
    };
    const result = await interpret(makeInput(), makeDeps(call));
    expect(result.status).toBe('rejected');
    if (result.status !== 'rejected') return;
    expect(result.failures.some((f) => f.code === 'FABRICATED_GANJI')).toBe(true);
  });

  it('maxAttempts 를 올리면 재시도한다(원가 배수)', async () => {
    let n = 0;
    const call = vi.fn(async (req: Parameters<Caller>[0]) => {
      n += 1;
      const raw = validRawResponse(req) as { sections: unknown[] };
      return n === 1 ? okUpstream({ ...raw, sections: [] }) : okUpstream(raw);
    });
    const result = await interpret(makeInput(), makeDeps(call, { maxAttempts: 2 }));
    expect(call).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ok');
  });

  it('업스트림 오류는 그대로 전달한다(폴백 판단은 클라이언트 몫)', async () => {
    const call: Caller = async () => ({
      ok: false,
      code: 'RATE_LIMITED',
      message: '업스트림 레이트리밋',
      retryable: true,
      status: 429,
    });
    const result = await interpret(makeInput(), makeDeps(call));
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.retryable).toBe(true);
  });

  it('카드가 하나도 안 뽑히면 BUILD 오류다(호출하지 않는다)', async () => {
    const call = vi.fn(templateCaller);
    const result = await interpret(makeInput(), makeDeps(call, { knowledge: [] }));
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.code).toBe('BUILD');
    expect(call).not.toHaveBeenCalled();
  });

  it('동시성 상한을 넘겨 호출하지 않는다', async () => {
    let active = 0;
    let peak = 0;
    const call: Caller = async (req) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return okUpstream(validRawResponse(req));
    };
    const deps = makeDeps(call, { semaphore: new Semaphore(2) });
    await Promise.all(
      (['INTJ', 'ENFP', 'ISTP', 'ESFJ', 'INFP'] as const).map((mbti) =>
        interpret(makeInput({ profile: { gender: 'M', mbti, blood: 'A' } }), deps),
      ),
    );
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('프롬프트 조립 — 앱 코드를 그대로 쓴다', () => {
  it('LLM 경로의 카드 예산이 규칙 기반 경로보다 좁다(토큰=원가)', () => {
    expect(LLM_RETRIEVAL.maxCards).toBeLessThan(64);
    const req = makeRequest();
    expect(req.knowledgeCardIds.length).toBeLessThanOrEqual(LLM_RETRIEVAL.maxCards ?? Infinity);
    expect(req.knowledgeCardIds.length).toBeGreaterThan(0);
  });

  it('narrativeKey 는 프롬프트 버전·엔진 버전을 축으로 갖는다', () => {
    const req = makeRequest();
    expect(req.narrativeKey.startsWith(`${req.promptVersion}|${req.engineVersion}|fusion|`)).toBe(true);
    // PII 축(이름·기기)이 없다는 것이 로그에 남길 수 있는 근거다.
    expect(req.narrativeKey).not.toContain('undefined');
  });

  it('조립 실패는 예외가 아니라 결과로 나온다', () => {
    const built = buildRequestFor(makeInput(), [], LLM_RETRIEVAL);
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.message).toContain('NO_KNOWLEDGE');
  });
});
