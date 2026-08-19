import { describe, expect, it } from 'vitest';

import { clientIpOf, FixedWindowRateLimiter, Semaphore } from '../src/rateLimit';
import { decideCors, corsHeaders } from '../src/cors';

describe('FixedWindowRateLimiter', () => {
  it('창 안에서 max 까지 허용하고 그 뒤엔 막는다', () => {
    let t = 0;
    const limiter = new FixedWindowRateLimiter({ windowMs: 1_000, max: 2, now: () => t });
    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(true);
    const blocked = limiter.check('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('창이 지나면 다시 열린다', () => {
    let t = 0;
    const limiter = new FixedWindowRateLimiter({ windowMs: 1_000, max: 1, now: () => t });
    expect(limiter.check('ip').allowed).toBe(true);
    expect(limiter.check('ip').allowed).toBe(false);
    t = 1_001;
    expect(limiter.check('ip').allowed).toBe(true);
  });

  it('IP 별로 따로 센다', () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 1_000, max: 1 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('추적 키가 무한히 늘지 않는다', () => {
    let t = 0;
    const limiter = new FixedWindowRateLimiter({ windowMs: 10, max: 1, maxKeys: 5, now: () => t });
    for (let i = 0; i < 50; i += 1) {
      t += 20;
      limiter.check(`ip-${i}`);
    }
    expect(limiter.size()).toBeLessThanOrEqual(6);
  });
});

describe('Semaphore', () => {
  it('동시 실행 수를 제한하고 순서대로 풀어 준다', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const task = async () => {
      const release = await sem.acquire();
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      release();
    };
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(peak).toBe(2);
    expect(sem.free).toBe(2);
    expect(sem.queued).toBe(0);
  });
});

describe('clientIpOf', () => {
  it('trustProxy 가 꺼져 있으면 x-forwarded-for 를 무시한다', () => {
    // 이걸 신뢰하면 헤더만 바꿔 가며 레이트리밋을 무한 우회할 수 있다.
    expect(clientIpOf('1.2.3.4', '10.0.0.1', false)).toBe('10.0.0.1');
  });

  it('trustProxy 가 켜져 있으면 첫 항목을 쓴다', () => {
    expect(clientIpOf('1.2.3.4, 10.0.0.9', '10.0.0.1', true)).toBe('1.2.3.4');
    expect(clientIpOf(undefined, '10.0.0.1', true)).toBe('10.0.0.1');
  });
});

describe('decideCors', () => {
  const allowed = ['https://sajuapp.web.tossmini.com'];

  it('허용 오리진은 에코한다', () => {
    const d = decideCors('https://sajuapp.web.tossmini.com', allowed);
    expect(d.kind).toBe('allowed');
    expect(corsHeaders(d)['Access-Control-Allow-Origin']).toBe('https://sajuapp.web.tossmini.com');
  });

  it('다른 오리진은 거부하고 헤더를 붙이지 않는다', () => {
    const d = decideCors('https://evil.example', allowed);
    expect(d.kind).toBe('denied');
    expect(corsHeaders(d)['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('오리진이 없으면(서버간 호출) 통과시키되 CORS 헤더는 없다', () => {
    const d = decideCors(undefined, allowed);
    expect(d.kind).toBe('no-origin');
    expect(corsHeaders(d)['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('언제나 Vary: Origin 을 붙인다', () => {
    for (const origin of [undefined, 'https://sajuapp.web.tossmini.com', 'https://evil.example']) {
      expect(corsHeaders(decideCors(origin, allowed))['Vary']).toBe('Origin');
    }
  });
});
