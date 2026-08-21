/**
 * 서버 전용 코드가 UI 진입점으로 새는 것을 **소스 수준에서** 막는다.
 *
 * 번들 grep(`dist/assets/*.js` 에 시스템 프롬프트가 없는지)은 빌드해야 알 수 있고, 빌드는 매번 돌지 않는다.
 * 여기서는 import 그래프를 정적으로 훑어 회귀를 즉시 잡는다.
 *
 * 소스를 `node:fs` 가 아니라 `import.meta.glob(?raw)` 로 읽는 이유: tsconfig.app.json 의
 * `types` 가 `["vite/client"]` 뿐이라 앱 타입체크에 노드 타입이 들어오지 않는다(들이면 앱 코드에서
 * `process`·`Buffer` 를 실수로 쓸 수 있게 된다).
 */

import { describe, expect, it } from 'vitest';

const INTERPRET_SOURCES = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * 해석 레이어 밖의 모듈. UI 그래프가 닿아도 되는 것만 여기 있다.
 *
 * `../data/tables.json` 이 들어 있는 이유: `factPack.ts` 가 천간→오행 표를 **엔진과 같은 단일 출처**에서
 * 읽는다(C00 §F6 — 표를 코드로 옮겨 적지 않는다). JSON 은 import 를 갖지 않아 그래프를 넓히지 않고,
 * 그래도 아래 "프롬프트 조각 없음" 검사는 이 파일에도 그대로 적용된다.
 */
const OUTSIDE_SOURCES = {
  ...(import.meta.glob('../knowledge/types.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob('../data/tables.json', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
};

const SCREEN_SOURCES = {
  ...(import.meta.glob('../../pages/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob('../../features/**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob('../../App.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
};

function source(path: string): string {
  const found = INTERPRET_SOURCES[path];
  if (found === undefined) throw new Error(`소스를 찾지 못했다: ${path}`);
  return found;
}

/** 서버 전용 코드가 들어 있어 UI 그래프에 있으면 안 되는 파일. */
const SERVER_ONLY = ['./prompt.ts', './buildRequest.ts', './client.ts', './index.ts', './guard.ts'];

/**
 * `./ui.ts` 에서 시작해 **값 import 만** 따라가며 닿는 파일 전부.
 * 상대 경로만 해석하고, 해석 레이어 밖 모듈은 `OUTSIDE_SOURCES` 에 있는 것만 통과시킨다
 * (모르는 외부 모듈이 그래프에 들어오면 테스트가 실패한다 — 조용히 늘어나는 걸 막는다).
 */
function valueImportClosure(entry: string): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    const text = INTERPRET_SOURCES[current] ?? OUTSIDE_SOURCES[current];
    if (text === undefined) throw new Error(`그래프 밖 모듈이 값으로 import 됐다: ${current}`);
    // JSON 은 그래프의 잎이다(import 구문을 가질 수 없다). 아래 정규식은 JSON 본문에도 걸리지 않는다.
    if (current.endsWith('.json')) continue;
    // 확장자 없는 상대 경로를 glob 키(`./x.ts` · `../knowledge/types.ts`)로 되돌린다.
    // 확장자가 이미 있는 지정자(`../data/tables.json`)는 그대로 둔다.
    for (const spec of valueImports(text)) queue.push(/\.\w+$/.test(spec) ? spec : `${spec}.ts`);
  }
  return seen;
}

/** `import ... from 'x'` 중 **값 import**(= `import type` 이 아닌 것)의 소스만 뽑는다. */
function valueImports(text: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+([\s\S]*?)\s*from\s*'([^']+)'/gm;
  for (const m of text.matchAll(re)) {
    const clause = m[1] ?? '';
    const from = m[2] ?? '';
    // `import type { .. }` / `export type { .. }` 는 verbatimModuleSyntax 아래서 완전히 지워진다.
    if (/^type\b/.test(clause.trim())) continue;
    out.push(from);
  }
  return out;
}

describe('shared/interpret/ui — 서버 코드 격리', () => {
  it('값(runtime) import 그래프에 서버 전용 모듈이 없다(전이적)', () => {
    const closure = valueImportClosure('./ui.ts');
    /*
      목록을 **정확히** 고정한다. 새 모듈이 그래프에 들어오면 이 검사가 먼저 깨지므로,
      들어온 것이 무엇인지 사람이 한 번 보게 된다 — 프롬프트가 새는 경로는 대개
      "무해해 보이는 헬퍼 하나"에서 시작한다.

      `./dash.ts` 는 import 가 0 개인 문자열 헬퍼다(엠대시 → 콜론). 그래프를 넓히지 않고,
      아래 "프롬프트 조각 없음" 검사도 이 파일에 그대로 적용된다.
    */
    expect([...closure].sort()).toEqual([
      '../data/tables.json',
      '../knowledge/types.ts',
      './copy.ts',
      './dash.ts',
      './factPack.ts',
      './retrieve.ts',
      './template.ts',
      './ui.ts',
    ]);
    for (const forbidden of SERVER_ONLY) expect(closure.has(forbidden)).toBe(false);
  });

  it('UI 그래프의 어느 파일에도 시스템 프롬프트 조각이 없다', () => {
    for (const path of valueImportClosure('./ui.ts')) {
      const text = INTERPRET_SOURCES[path] ?? OUTSIDE_SOURCES[path] ?? '';
      for (const needle of ['사실 규율', '출력 계약', '너는 사주', 'knowledge_cards', 'fact_pack']) {
        expect(`${path}: ${text}`).not.toContain(needle);
      }
    }
  });

  it('copy.ts 는 값 import 가 전혀 없다(그래프의 끝)', () => {
    expect(valueImports(source('./copy.ts'))).toEqual([]);
  });

  it('copy.ts 에 시스템 프롬프트 조각이 없다', () => {
    const copy = source('./copy.ts');
    for (const needle of ['사실 규율', '출력 계약', 'used_card_ids', 'knowledge_cards', 'fact_pack', '너는 사주']) {
      expect(copy).not.toContain(needle);
    }
  });

  it('prompt.ts 가 copy.ts 를 가져오지, 그 반대가 아니다', () => {
    expect(valueImports(source('./prompt.ts'))).toContain('./copy');
  });

  it('화면 계층은 해석 레이어 배럴을 import 하지 않는다', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(SCREEN_SOURCES)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      for (const spec of valueImports(text)) {
        // `.../shared/interpret` · `.../shared/interpret/index` 만 금지. `/ui` 는 허용.
        if (/(?:^|\/)shared\/interpret(?:\/index)?$/.test(spec)) offenders.push(`${file} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('화면이 실제로 UI 진입점을 쓰고 있다(테스트가 헛돌지 않는지)', () => {
    const usesUi = Object.values(SCREEN_SOURCES).some((text) =>
      valueImports(text).some((spec) => spec.endsWith('shared/interpret/ui')),
    );
    expect(usesUi).toBe(true);
  });
});
