import { describe, expect, it } from 'vitest';

import { NarrativeCache } from '../src/cache';

function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('NarrativeCache — TTL', () => {
  it('TTL 안에서는 히트, 지나면 미스', () => {
    const clock = fakeClock();
    const cache = new NarrativeCache<string>({ maxEntries: 10, ttlMs: 1_000, now: clock.now });
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
    clock.advance(999);
    expect(cache.get('k')).toBe('v');
    clock.advance(2);
    expect(cache.get('k')).toBeUndefined();
    expect(cache.stats().size).toBe(0);
  });
});

describe('NarrativeCache — LRU', () => {
  it('상한을 넘으면 가장 오래 안 쓴 것부터 버린다', () => {
    const cache = new NarrativeCache<number>({ maxEntries: 2, ttlMs: 10_000 });
    cache.set('a', 1);
    cache.set('b', 2);
    // a 를 읽어 최근 사용으로 만든다 → 다음 축출 대상은 b.
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.stats().evictions).toBe(1);
  });

  it('같은 키 재기록은 항목 수를 늘리지 않는다', () => {
    const cache = new NarrativeCache<number>({ maxEntries: 2, ttlMs: 10_000 });
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.stats().size).toBe(1);
    expect(cache.get('a')).toBe(2);
  });
});

describe('NarrativeCache — single flight', () => {
  it('같은 키 동시 호출은 실행을 한 번만 한다(원가 방어)', async () => {
    const cache = new NarrativeCache<string>({ maxEntries: 10, ttlMs: 10_000 });
    let runs = 0;
    let release: (v: string) => void = () => undefined;
    const gate = new Promise<string>((resolve) => { release = resolve; });

    const run = async () => {
      runs += 1;
      return await gate;
    };

    const a = cache.singleFlight('same', run);
    const b = cache.singleFlight('same', run);
    const c = cache.singleFlight('other', async () => { runs += 1; return 'other'; });

    release('value');
    expect(await a).toBe('value');
    expect(await b).toBe('value');
    expect(await c).toBe('other');
    expect(runs).toBe(2); // same 1회 + other 1회
    expect(cache.stats().coalesced).toBe(1);
  });

  it('실패한 비행은 남기지 않는다(다음 요청이 다시 시도할 수 있다)', async () => {
    const cache = new NarrativeCache<string>({ maxEntries: 10, ttlMs: 10_000 });
    await expect(
      cache.singleFlight('k', async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    await expect(cache.singleFlight('k', async () => 'ok')).resolves.toBe('ok');
  });
});
