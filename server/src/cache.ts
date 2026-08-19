/**
 * 서사 캐시 — **원가와 직결**된다.
 *
 * 키는 `InterpretationRequest.narrativeKey` 다. 이 키는 순수함수가 만들고
 * `PROMPT_VERSION | engineVersion | kind | 차트정체성 | 성별 | MBTI | 혈액형 | 카드집합해시` 로 구성되므로
 *   ① 같은 차트·같은 프로필·같은 지식베이스면 반드시 같고,
 *   ② 프롬프트나 엔진이나 카드가 바뀌면 자동으로 달라진다(= 수동 무효화가 필요 없다).
 * 서버가 키를 새로 발명하지 않는 이유가 이것이다. (근거: docs/interpretation.md §5)
 *
 * ⚠ 키에는 PII 가 없다(이름·닉네임·기기 식별자를 프로필에 두지 않았다). 그래서 로그에 남겨도 된다.
 *
 * 단일 비행(single-flight)을 함께 둔다. 같은 차트로 두 요청이 동시에 들어오면 캐시는 아직 비어 있어
 * **둘 다 Opus 5 를 호출한다** — 건당 134원짜리 중복이다. 진행 중인 프로미스를 공유해 한 번만 부른다.
 */

export interface CacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly coalesced: number;
}

export interface NarrativeCacheOptions {
  readonly maxEntries: number;
  readonly ttlMs: number;
  /** 결정론 테스트용 시계. 기본은 `Date.now`. 계산 경로가 아니라 캐시 만료 판정에만 쓴다. */
  readonly now?: () => number;
}

interface Entry<V> {
  readonly value: V;
  readonly expiresAt: number;
}

/**
 * TTL + LRU. `Map` 은 삽입 순서를 보존하므로 "가장 오래 안 쓴 것"은 첫 항목이다 —
 * 읽을 때 delete → set 으로 뒤로 보내면 그것만으로 LRU 가 된다(별도 링크드리스트 불필요).
 */
export class NarrativeCache<V = unknown> {
  private readonly entries = new Map<string, Entry<V>>();
  /**
   * 진행 중인 비행. 값 타입이 `V` 가 아니라 `unknown` 인 이유: 합치고 싶은 것은 "캐시에 들어갈 값"이
   * 아니라 **호출 한 번 전체**(성공·거부·오류를 모두 담은 결과 객체)다. 성공만 합치면 동시에 들어온
   * 두 요청 중 하나가 다시 Opus 5 를 부른다.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private coalesced = 0;

  constructor(options: NarrativeCacheOptions) {
    this.maxEntries = options.maxEntries;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? (() => Date.now());
  }

  get(key: string): V | undefined {
    const hit = this.entries.get(key);
    if (hit === undefined) {
      this.misses += 1;
      return undefined;
    }
    if (hit.expiresAt <= this.now()) {
      this.entries.delete(key);
      this.misses += 1;
      return undefined;
    }
    // 최근 사용으로 표시(맵 끝으로 이동).
    this.entries.delete(key);
    this.entries.set(key, hit);
    this.hits += 1;
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
      this.evictions += 1;
    }
  }

  /**
   * 같은 키의 동시 요청을 한 번의 실행으로 합친다.
   * 실패한 프로미스는 캐시하지 않는다 — 일시적 오류가 키 수명 내내 재생되면 안 된다.
   */
  async singleFlight<R>(key: string, run: () => Promise<R>): Promise<R> {
    const running = this.inFlight.get(key);
    if (running !== undefined) {
      this.coalesced += 1;
      return (await running) as R;
    }
    const promise = (async () => await run())();
    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  stats(): CacheStats {
    return {
      size: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      coalesced: this.coalesced,
    };
  }

  clear(): void {
    this.entries.clear();
  }
}
