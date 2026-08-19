/**
 * 레이트리밋 + 동시 호출 상한.
 *
 * 두 겹인 이유가 다르다.
 *   ① `FixedWindowRateLimiter` — **IP 당** 요청 수. 한 사람이 새로고침을 눌러 대는 것을 막는다.
 *   ② `Semaphore` — **프로세스 전체** 업스트림 동시 호출 수. IP 를 바꿔 가며 들어오는 트래픽에도
 *      Anthropic 호출이 무한히 늘어나지 않게 하는 마지막 선이다(건당 134원 · 조직 레이트리밋 공유).
 *
 * 시계는 주입한다. 그래야 테스트가 `sleep` 없이 창을 넘길 수 있다.
 */

export interface RateLimitVerdict {
  readonly allowed: boolean;
  /** 남은 허용량(허용된 경우). */
  readonly remaining: number;
  /** 창이 다시 열릴 때까지의 초. `Retry-After` 헤더 값. */
  readonly retryAfterSec: number;
}

export interface FixedWindowOptions {
  readonly windowMs: number;
  readonly max: number;
  readonly now?: () => number;
  /** 추적 키 수 상한. 넘으면 만료된 것부터 버린다(무한 증가 = 메모리 누수). */
  readonly maxKeys?: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly windowMs: number;
  private readonly max: number;
  private readonly maxKeys: number;
  private readonly now: () => number;

  constructor(options: FixedWindowOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.maxKeys = options.maxKeys ?? 10_000;
    this.now = options.now ?? (() => Date.now());
  }

  check(key: string): RateLimitVerdict {
    const t = this.now();
    let w = this.windows.get(key);
    if (w === undefined || w.resetAt <= t) {
      w = { count: 0, resetAt: t + this.windowMs };
      this.windows.set(key, w);
      this.sweep(t);
    }
    const retryAfterSec = Math.max(1, Math.ceil((w.resetAt - t) / 1000));
    if (w.count >= this.max) {
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    w.count += 1;
    return { allowed: true, remaining: this.max - w.count, retryAfterSec };
  }

  private sweep(t: number): void {
    if (this.windows.size <= this.maxKeys) return;
    for (const [k, w] of this.windows) {
      if (w.resetAt <= t) this.windows.delete(k);
      if (this.windows.size <= this.maxKeys) return;
    }
    // 만료된 것만 지워도 모자라면 오래된 순(삽입 순)으로 더 버린다.
    for (const k of this.windows.keys()) {
      this.windows.delete(k);
      if (this.windows.size <= this.maxKeys) return;
    }
  }

  size(): number {
    return this.windows.size;
  }
}

/** 동시 실행 수 제한. 초과분은 대기열에 선다(거부하지 않는다 — 캐시 미스는 결국 처리돼야 한다). */
export class Semaphore {
  private available: number;
  private readonly waiters: (() => void)[] = [];

  constructor(limit: number) {
    this.available = limit;
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return () => this.release();
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next === undefined) {
      this.available += 1;
      return;
    }
    // 대기자가 있으면 카운터를 되돌리지 않고 자리를 그대로 넘긴다.
    next();
  }

  get free(): number {
    return this.available;
  }

  get queued(): number {
    return this.waiters.length;
  }
}

/**
 * 클라이언트 IP.
 *
 * `trustProxy` 가 꺼져 있으면 소켓 주소만 믿는다 — `x-forwarded-for` 는 클라이언트가 마음대로 쓸 수 있어서
 * 프록시 뒤가 아닌데 신뢰하면 **레이트리밋이 무력화**된다. 켜져 있을 때만 첫 항목을 쓴다
 * (첫 항목이 원 클라이언트, 뒤는 경유 프록시들).
 */
export function clientIpOf(
  headerValue: string | string[] | undefined,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy && headerValue !== undefined) {
    const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const first = (raw ?? '').split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return socketAddress ?? 'unknown';
}
