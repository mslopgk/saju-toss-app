/**
 * **복붙 금지** 회귀.
 *
 * 프롬프트·지식카드·검증 규칙은 `app/src/shared/interpret` 한 벌뿐이어야 한다. 두 벌이 되면
 * 한쪽만 고쳐지고, 그 결과는 에러가 아니라 **다른 문장이 조용히 나가는 것**이라 아무도 못 잡는다.
 *
 * 그래서 두 방향을 동시에 고정한다.
 *   ① 서버 소스에는 프롬프트 문구가 **없다** (= 옮겨 적지 않았다)
 *   ② 서버 소스는 앱 해석 레이어를 **실제로 import 한다** (= 참조가 살아 있다)
 *   ③ 그 결과 서버 번들에는 프롬프트가 **있다** (= 참조가 빌드까지 이어진다)
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildSystemBlocks, PROMPT_VERSION } from '../../app/src/shared/interpret';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');

/** 시스템 프롬프트에만 나오는 문구. 하나라도 서버 소스에 있으면 복붙이다. */
const PROMPT_NEEDLES = [
  '사실 규율',
  '출력 계약',
  '너는 사주',
  '4체계가 어긋날 때',
  '안전·표현 규율',
  '혈액형 → 말투',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('서버는 앱 해석 레이어를 재사용한다', () => {
  const files = sourceFiles(SRC);

  it('서버 소스에 시스템 프롬프트 문구가 한 조각도 없다', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const needle of PROMPT_NEEDLES) {
        if (text.includes(needle)) offenders.push(`${file}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('앱 해석 레이어를 실제로 import 한다', () => {
    const importers = files.filter((f) =>
      /from '\.\.\/\.\.\/app\/src\/shared\/(interpret|knowledge|lib)/.test(readFileSync(f, 'utf8')),
    );
    // 최소한 조립(interpret.ts)·호출(anthropic.ts)·검증 스키마(requestSchema.ts)가 앱을 참조해야 한다.
    expect(importers.length).toBeGreaterThanOrEqual(3);
  });

  it('앱 프롬프트를 런타임에 실제로 읽어 온다', () => {
    const blocks = buildSystemBlocks();
    expect(blocks.length).toBe(7);
    expect(blocks.map((b) => b.id)).toEqual([
      'role',
      'fact-discipline',
      'conflict',
      'safety',
      'style',
      'tone-by-blood',
      'output-contract',
    ]);
    expect(blocks.some((b) => b.text.includes('사실 규율'))).toBe(true);
    expect(PROMPT_VERSION).toMatch(/^SAJU-PROMPT-/);
  });

  it('빌드된 서버 번들에는 프롬프트가 들어 있다(빌드했다면)', () => {
    const bundle = join(HERE, '..', 'dist', 'server.mjs');
    if (!existsSync(bundle)) return; // `npm run build` 전이면 건너뛴다.
    const text = readFileSync(bundle, 'utf8');
    expect(text).toContain('사실 규율');
    // 클라이언트 번들과 정반대다 — 앱 dist 에는 이 문구가 0 이어야 한다.
  });
});
