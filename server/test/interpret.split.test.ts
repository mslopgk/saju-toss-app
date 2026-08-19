/**
 * 분할 오케스트레이션 — 요약 1회 + 카드 N회.
 *
 * 전체 리포트(`interpret.test.ts`)와 같은 실행기(`runTask`)를 쓰므로 캐시·재시도·실패 처리를
 * 다시 검사하지 않는다. 여기서 고정하는 것은 **분할 때문에 새로 생긴 것**뿐이다:
 * 작업·섹션마다 캐시가 갈리는가, 요청한 섹션 id 가 결과에 붙는가, 한 장이 실패해도 다른 장이
 * 영향받지 않는가.
 */

import { describe, expect, it, vi } from 'vitest';

import { NarrativeCache } from '../src/cache';
import { Semaphore } from '../src/rateLimit';
import { NOOP_LOGGER } from '../src/log';
import { interpretCard, interpretSummary, LLM_RETRIEVAL, type InterpretDeps } from '../src/interpret';
import type { Caller, UpstreamResult } from '../src/anthropic';
import { CARDS } from '../../app/src/shared/knowledge';
import type { InterpretationRequest, SectionId } from '../../app/src/shared/interpret';
import { makeInput } from './fixtures';

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
    cache: new NarrativeCache<unknown>({ maxEntries: 50, ttlMs: 60_000 }),
    logger: NOOP_LOGGER,
    semaphore: new Semaphore(4),
    maxAttempts: 1,
    retrieval: LLM_RETRIEVAL,
    ...overrides,
  };
}

/**
 * 요청에 맞는 유효 응답을 만든다.
 *
 * 손으로 문장을 적지 않는다 — `guard` 의 규칙(지어낸 간지·수치·금지어)을 우연히 어기면
 * "구현은 맞는데 테스트만 빨간" 상황이 된다. 근거 카드는 요청이 실제로 실은 목록에서 고른다.
 */
function validFor(req: InterpretationRequest): unknown {
  const card = req.knowledgeCardIds[0] ?? '';
  if (req.narrativeKey.endsWith('|summary')) {
    return {
      word: '버티는 사람',
      sentence: '한번 정한 방향으로는 곧게 가되, 시작 전에 오래 재는 편입니다.',
      used_card_ids: [card],
    };
  }
  return {
    body: '한번 정한 방향으로는 곧게 가는 편입니다. 다만 시작하기 전에는 오래 재는 습관이 있습니다.',
    used_card_ids: [card],
  };
}

const splitCaller: Caller = async (req) => okUpstream(validFor(req));

describe('interpretSummary', () => {
  it('정상 응답을 ok 로 돌려준다', async () => {
    const result = await interpretSummary(makeInput(), makeDeps(splitCaller));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.word).toBe('버티는 사람');
      expect(result.source).toBe('llm');
    }
  });

  it('같은 입력을 다시 부르면 캐시에서 나온다', async () => {
    const call = vi.fn(splitCaller);
    const deps = makeDeps(call);
    await interpretSummary(makeInput(), deps);
    const second = await interpretSummary(makeInput(), deps);
    expect(second.status === 'ok' && second.source).toBe('cache');
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('interpretCard', () => {
  it('요청한 섹션 id 가 결과에 붙는다', async () => {
    const result = await interpretCard(makeInput(), 'zodiac', makeDeps(splitCaller));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.value.id).toBe('zodiac');
  });

  /**
   * 섹션마다 캐시 키가 갈려야 한다. 안 갈리면 첫 카드의 글이 모든 섹션에 나가고,
   * 그 증상은 에러가 아니라 **여섯 카드가 똑같은 글**로 나타나 알아채기 어렵다.
   */
  it('섹션이 다르면 각각 호출된다', async () => {
    const call = vi.fn(splitCaller);
    const deps = makeDeps(call);
    await interpretCard(makeInput(), 'saju', deps);
    await interpretCard(makeInput(), 'zodiac', deps);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('요약과 카드는 서로의 캐시를 건드리지 않는다', async () => {
    const call = vi.fn(splitCaller);
    const deps = makeDeps(call);
    await interpretSummary(makeInput(), deps);
    const card = await interpretCard(makeInput(), 'saju', deps);
    expect(card.status === 'ok' && card.source).toBe('llm');
    expect(call).toHaveBeenCalledTimes(2);
  });

  /** 폴백이 카드 단위로 일어나는 근거. 한 장이 거부돼도 나머지는 정상이어야 한다. */
  it('한 섹션이 거부돼도 다른 섹션은 통과한다', async () => {
    const call: Caller = async (req) =>
      req.narrativeKey.endsWith('|card:zodiac')
        ? okUpstream({ body: '짧다', used_card_ids: [] })
        : okUpstream(validFor(req));
    const deps = makeDeps(call);

    const [bad, good] = await Promise.all([
      interpretCard(makeInput(), 'zodiac', deps),
      interpretCard(makeInput(), 'saju', deps),
    ]);
    expect(bad.status).toBe('rejected');
    expect(good.status).toBe('ok');
  });

  it('여러 섹션을 병렬로 불러도 각자 결과를 받는다', async () => {
    const deps = makeDeps(splitCaller);
    const ids: readonly SectionId[] = ['saju', 'sipsin', 'jiji', 'zodiac'];
    const results = await Promise.all(ids.map((id) => interpretCard(makeInput(), id, deps)));
    expect(results.map((r) => (r.status === 'ok' ? r.value.id : null))).toEqual([...ids]);
  });
});
