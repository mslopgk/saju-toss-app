/**
 * 생성 에셋 최적화 — 원본 PNG → 화면 크기 WebP.
 *
 * ## 왜 필요한가
 * Higgsfield 가 내는 2048×2048 PNG 는 **장당 4.5~5 MB** 다. 46장이면 215 MB 로, 미니앱 번들에
 * 넣을 수 있는 크기가 아니다(현재 초기 청크가 1.3 MB 다). 원본은 `docs/store/` 에 보관하고
 * 앱에는 화면에서 실제로 쓰는 크기만 넣는다.
 *
 * ## 크기를 세트마다 다르게 두는 이유
 * 히어로는 화면 폭 전체를 쓰지만 카드 아이콘은 한 변 60px 남짓이다. 같은 크기로 굽는 것은
 * 아이콘 하나에 히어로만 한 용량을 쓰는 것과 같다.
 *
 * ## 원본을 지우지 않는다
 * `docs/store/` 의 PNG 는 커밋해 둔다. 크기 정책이 바뀌거나(고해상도 기기 대응) 다른 용도로
 * 다시 뽑아야 할 때 원본이 없으면 **Higgsfield 를 다시 돌려야 하고, 같은 그림이 나오지 않는다.**
 *
 * 사용: npm run optimize-assets
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const SRC_ROOT = 'docs/store';
const OUT_ROOT = 'src/assets/generated';

/**
 * 세트별 출력 폭(px).
 *
 * 기준: 미니앱이 도는 폰 중 넓은 축이 CSS 430px 안팎이고 dpr 은 대개 3 이다. 히어로를 화면 폭
 * 전체로 쓰면 1,290px 이 이론상 필요하지만, 이 그림들은 초점이 부드럽고 글자가 없어
 * 800px 에서 확대해도 눈에 띄게 무너지지 않는다 — 용량을 그 대가로 절반 이하로 줄인다.
 */
const WIDTH_BY_SET = {
  elements: 800, // 홈 히어로
  backdrop: 720, // 전체 화면 배경(9:16). 흐린 그라데이션이라 더 줄여도 된다
  loading: 640, // 연출
  zodiac: 320, // 카드 아이콘
  branch: 320,
  tengod: 320,
  compat: 400, // 두 오브젝트가 함께 있어 조금 크다
};

/** WebP 품질. 이 그림들은 그라데이션 위주라 78 에서 밴딩이 보이지 않는다(실측으로 조정할 것). */
const QUALITY = 78;

function human(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.round(bytes / 1024)}KB`;
}

async function main() {
  if (!existsSync(SRC_ROOT)) {
    process.stderr.write(`${SRC_ROOT} 이 없다.\n`);
    process.exitCode = 1;
    return;
  }

  let srcTotal = 0;
  let outTotal = 0;
  let count = 0;
  const rows = [];

  for (const [set, width] of Object.entries(WIDTH_BY_SET)) {
    const srcDir = path.join(SRC_ROOT, set);
    if (!existsSync(srcDir)) continue;

    const files = readdirSync(srcDir).filter((f) => f.endsWith('.png'));
    if (files.length === 0) continue;

    const outDir = path.join(OUT_ROOT, set);
    mkdirSync(outDir, { recursive: true });

    let setSrc = 0;
    let setOut = 0;
    for (const file of files) {
      const src = path.join(srcDir, file);
      const out = path.join(outDir, file.replace(/\.png$/, '.webp'));
      await sharp(src)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(out);
      setSrc += statSync(src).size;
      setOut += statSync(out).size;
      count += 1;
    }
    srcTotal += setSrc;
    outTotal += setOut;
    rows.push({ set, n: files.length, width, srcSize: setSrc, outSize: setOut });
  }

  if (count === 0) {
    process.stdout.write('최적화할 PNG 가 없다. 에셋 생성이 끝났는지 확인할 것.\n');
    return;
  }

  const head = `${'세트'.padEnd(12)}${'장'.padStart(4)}${'폭'.padStart(7)}${'원본'.padStart(9)}${'출력'.padStart(9)}${'비율'.padStart(7)}`;
  process.stdout.write(`${head}\n${'-'.repeat(head.length)}\n`);
  for (const r of rows) {
    process.stdout.write(
      r.set.padEnd(12) +
        String(r.n).padStart(4) +
        `${r.width}px`.padStart(7) +
        human(r.srcSize).padStart(9) +
        human(r.outSize).padStart(9) +
        `${Math.round((r.outSize / r.srcSize) * 100)}%`.padStart(7) +
        '\n',
    );
  }
  process.stdout.write(
    `\n합계 ${count}장  ${human(srcTotal)} → ${human(outTotal)} ` +
      `(${Math.round((outTotal / srcTotal) * 100)}%)\n`,
  );

  // 번들에 실릴 총량이 감당 가능한지 여기서 바로 말해 준다. 초기 청크가 이미 1.3MB 다.
  if (outTotal > 3 * 1024 * 1024) {
    process.stdout.write(
      `\n⚠ 출력 합계가 ${human(outTotal)} 다. 전부 번들에 넣으면 초기 로딩이 무거워진다 —\n` +
        `  화면에서 실제로 쓰는 것만 정적 import 하고 나머지는 동적 로드를 검토할 것.\n`,
    );
  }
}

await main();
