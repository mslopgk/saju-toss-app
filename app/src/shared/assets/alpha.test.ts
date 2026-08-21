/**
 * 오브젝트 에셋에 알파가 구워져 있는가.
 *
 * 생성 에셋은 **남색 배경 위에 밝은 물체**로 온다. 그 배경을 그대로 쓰면 화면에 네모난 얼룩이
 * 남아 스톡 이미지 티가 난다(그 상태로 한 판 나갔다). `optimize-assets` 가 밝기를 알파로
 * 굽는데, 누가 `KEYED_SETS` 에서 세트를 빼거나 임계값을 낮추면 **배경 상자가 조용히 돌아온다** —
 * 예외도 오류도 없고 화면만 지저분해진다. 눈으로 보기 전에는 알 수 없는 종류의 고장이다.
 *
 * 그래서 파일을 직접 디코드해 투명 비율을 본다. CSS 로 고치려던 시도가 두 번 실패한 뒤
 * (마스크는 원 안에 남색을 남기고, `mix-blend-mode: screen` 은 어두운 픽셀을 투명하게 만들지
 * 않는다) 이미지 쪽에서 해결하기로 정했으므로, 그 결정을 지키는 검사도 이미지 쪽에 둔다.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

/** `optimize-assets.mjs` 의 `KEYED_SETS` 와 같아야 한다. */
const KEYED_SETS = ['elements', 'loading'] as const;

const ROOT = 'src/assets/generated';

async function alphaProfile(file: string): Promise<{ clear: number; solid: number }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let clear = 0;
  let solid = 0;
  for (let i = 0; i < px; i += 1) {
    const a = data[i * 4 + 3]!;
    if (a === 0) clear += 1;
    else if (a >= 250) solid += 1;
  }
  return { clear: clear / px, solid: solid / px };
}

describe.each(KEYED_SETS)('%s 에셋의 알파', (set) => {
  const dir = path.join(ROOT, set);
  const files = readdirSync(dir).filter((f) => f.endsWith('.webp'));

  it('파일이 있다 — 없으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s 의 배경이 투명하다', async (file) => {
    const { clear, solid } = await alphaProfile(path.join(dir, file));
    // 배경이 남아 있으면 투명 비율이 0 에 가깝다. 40% 는 넉넉한 하한이다(실측 69~95%).
    expect(clear, '투명 영역이 너무 적다 — 배경 상자가 남아 있다').toBeGreaterThan(0.4);
    // 반대로 전부 투명하면 물체까지 지워진 것이다(임계값을 너무 올린 경우).
    expect(solid, '불투명 영역이 없다 — 물체까지 지워졌다').toBeGreaterThan(0.005);
  });
});
