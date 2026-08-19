/**
 * 코드 스플리팅 경계 회귀 가드.
 *
 * 이 경계는 **조용히 무너진다.** 누군가 `App.tsx` 에 `import { computeChart } from './shared/lib/saju'`
 * 한 줄을 되돌려 놓으면 rolldown 이 엔진·절기 팩·`tables.json`·`cards.json` 을 전부 초기 청크로
 * 다시 끌어오는데, 타입체크도 테스트도 전부 초록이다. 번들을 굽기 전에는 아무도 모른다.
 *
 * 그래서 `shared/interpret/ui` 격리(`shared/interpret/ui.test.ts`)와 같은 방식으로
 * 소스의 **정적 import 목록**을 여기서 고정한다.
 *
 * 소스를 `node:fs` 가 아니라 `import.meta.glob(?raw)` 로 읽는 이유는 ui.test.ts 와 같다 —
 * tsconfig.app.json 의 `types` 가 `["vite/client"]` 뿐이라 앱 타입체크에 노드 타입이 없다.
 */

import { describe, expect, it } from 'vitest';

const APP_SOURCE = (
  import.meta.glob('./App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
)['./App.tsx'];

/** `import ... from '<spec>'` 중 **값 import**(= `import type` 이 아닌 것)의 소스만 뽑는다. */
function staticValueImports(text: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+([\s\S]*?)\s*from\s*'([^']+)'/gm;
  for (const m of text.matchAll(re)) {
    if (/^type\b/.test((m[1] ?? '').trim())) continue;
    out.push(m[2] ?? '');
  }
  return out;
}

/** 초기 청크에 들어오면 안 되는 모듈(= 결과 화면에서만 필요한 것). */
const LAZY_ONLY = [
  './shared/lib/saju',
  './pages/ResultPage',
  './features/report',
  './shared/interpret/ui',
  './shared/knowledge',
];

describe('App.tsx — 초기 청크 경계', () => {
  it('소스를 읽었다(테스트가 헛돌지 않는지)', () => {
    expect(APP_SOURCE).toBeTypeOf('string');
    expect(APP_SOURCE?.length ?? 0).toBeGreaterThan(0);
  });

  it('계산 엔진·결과 화면을 정적으로 import 하지 않는다', () => {
    const specs = staticValueImports(APP_SOURCE ?? '');
    for (const forbidden of LAZY_ONLY) {
      expect({ forbidden, specs }).toMatchObject({ specs: expect.not.arrayContaining([forbidden]) });
    }
  });

  it('동적 경계가 실제로 걸려 있다', () => {
    // 문자열 검사인 이유: 정적 import 가 없다는 것만으로는 "지연됐다"가 아니라 "빠졌다"일 수도 있다.
    expect(APP_SOURCE).toContain("import('./shared/lib/saju')");
    expect(APP_SOURCE).toContain("import('./pages/ResultPage')");
  });
});

describe('지연 로딩이 엔진의 동기성을 바꾸지 않는다', () => {
  it('모듈이 로드된 뒤 computeChart() 는 프로미스가 아니라 Chart 를 즉시 반환한다', async () => {
    const engine = await import('./shared/lib/saju');
    const chart = engine.computeChart({
      calendarType: 'solar',
      year: 1990,
      month: 5,
      day: 15,
      hour: 14,
      minute: 30,
      gender: 'M',
      timeUnknown: false,
      birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
    });
    expect(chart).not.toBeInstanceOf(Promise);
    expect(chart.pillars.gz8).toBeTypeOf('string');
  });

  it('EngineError 가 같은 모듈 인스턴스에서 나와 instanceof 가 성립한다', async () => {
    // App.tsx 가 프로미스를 캐시하는 이유가 이것이다 — 두 벌이 되면 이 단언이 깨진다.
    const [a, b] = await Promise.all([import('./shared/lib/saju'), import('./shared/lib/saju')]);
    expect(a.EngineError).toBe(b.EngineError);

    let caught: unknown;
    try {
      a.computeChart({
        calendarType: 'solar',
        year: 1800, // 지원 범위 밖(C00 §F9)
        month: 1,
        day: 1,
        timeUnknown: true,
        gender: 'F',
        birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(b.EngineError);
    expect((caught as InstanceType<typeof b.EngineError>).code).toBe('OUT_OF_RANGE');
  });
});
