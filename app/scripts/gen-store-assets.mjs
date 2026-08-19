/**
 * 앱인토스 콘솔 등록용 이미지 자산을 굽는다.
 *
 * ## 왜 스크립트인가
 * 콘솔은 **리사이즈·크롭·포맷 변환을 해 주지 않는다.** 해상도가 1px 이라도 다르면 거부되므로
 * (앱 로고 600x600, 다크모드 로고 600x600, 가로 썸네일 1932x828) 규격 해상도를 손으로 맞추는 대신
 * SVG 원본에서 정확히 그 크기로 굽는다. 산출물은 `docs/store/` 에 커밋돼 있고, 이 스크립트는
 * 색·문구를 고칠 때만 다시 돌리면 된다.
 *
 * 스크린샷(세로 636x1048)은 여기서 만들지 않는다 — 실제 앱 화면이어야 하므로
 * `npm run ui-smoke -- --shots docs/store` 가 실제 브라우저에서 캡처한다.
 *
 * `sharp` 는 dev 전용 의존이다. 앱 번들에 들어가지 않는다.
 *
 * 사용: npm run gen-store-assets
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const OUT = 'docs/store';
mkdirSync(OUT, { recursive: true });

/** 브랜드 색 — `apps-in-toss.config.ts` 의 `brand.primaryColor` 와 같은 토스 블루. */
const BLUE = '#3182F6';

/**
 * 오빗 마크: 네 체계(사주·MBTI·혈액형·별자리)가 한 원을 이룬다.
 * 로고와 썸네일이 같은 마크를 써야 하므로 크기를 인자로 받는 함수로 둔다.
 */
const orbitMark = (cx, cy, r, stroke) => `
  <circle cx="${cx}" cy="${cy}" r="${r * 1.24}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".12"/>
  <g fill="none" stroke-width="${stroke}" stroke-linecap="round">
    <path d="M${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="#FF9F1C"/>
    <path d="M${cx + r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy + r}" stroke="${BLUE}"/>
    <path d="M${cx} ${cy + r} A${r} ${r} 0 0 1 ${cx - r} ${cy}" stroke="#F0455B"/>
    <path d="M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx} ${cy - r}" stroke="#8B5CF6"/>
  </g>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.49}" fill="#0C1230"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.49}" fill="none" stroke="#fff" stroke-width="2" opacity=".18"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 0.11}" fill="#fff"/>
  <circle cx="${cx}" cy="${cy - r}" r="${r * 0.085}" fill="#fff"/>
  <circle cx="${cx + r}" cy="${cy}" r="${r * 0.085}" fill="#fff"/>
  <circle cx="${cx}" cy="${cy + r}" r="${r * 0.085}" fill="#fff"/>
  <circle cx="${cx - r}" cy="${cy}" r="${r * 0.085}" fill="#fff"/>`;

const icon = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#101736"/>
      <stop offset="100%" stop-color="#233066"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  ${orbitMark(300, 300, 152, 40)}
</svg>`;

const iconDark = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="#0A0F26"/>
  ${orbitMark(300, 300, 152, 40)}
</svg>`;

const KO_FONT = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif";

const thumbnail = `
<svg xmlns="http://www.w3.org/2000/svg" width="1932" height="828" viewBox="0 0 1932 828">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#101736"/>
      <stop offset="55%" stop-color="#1B2550"/>
      <stop offset="100%" stop-color="#243268"/>
    </linearGradient>
  </defs>
  <rect width="1932" height="828" fill="url(#bg)"/>
  <circle cx="1600" cy="120" r="4"   fill="#fff" opacity=".7"/>
  <circle cx="1700" cy="200" r="3"   fill="#fff" opacity=".45"/>
  <circle cx="1520" cy="240" r="2.5" fill="#fff" opacity=".4"/>
  <circle cx="250"  cy="700" r="3"   fill="#fff" opacity=".35"/>
  ${orbitMark(1520, 414, 210, 54)}
  <text x="150" y="330" fill="#ffffff" font-family="${KO_FONT}" font-size="112" font-weight="700">사주믹스</text>
  <text x="150" y="440" fill="#B9C6E8" font-family="${KO_FONT}" font-size="52" font-weight="500">사주 · MBTI · 혈액형 · 별자리</text>
  <text x="150" y="520" fill="#8FA3D4" font-family="${KO_FONT}" font-size="44" font-weight="400">네 가지를 한 번에 겹쳐 읽어요</text>
  <rect x="150" y="580" width="470" height="82" rx="41" fill="${BLUE}"/>
  <text x="385" y="634" fill="#ffffff" text-anchor="middle" font-family="${KO_FONT}" font-size="42" font-weight="700">생년월일만 넣으면 끝</text>
</svg>`;

/** [파일명, SVG, 가로, 세로] — 크기는 콘솔이 요구하는 값이며 임의로 바꾸면 업로드가 거부된다. */
const ASSETS = [
  ['icon-orbit', icon, 600, 600],
  ['icon-orbit-dark', iconDark, 600, 600],
  ['thumbnail-1932x828', thumbnail, 1932, 828],
];

for (const [name, svg, w, h] of ASSETS) {
  const svgPath = path.join(OUT, `${name}.svg`);
  const pngPath = path.join(OUT, `${name}.png`);
  writeFileSync(svgPath, svg, 'utf8');
  // `fit: 'fill'` 로 정확히 규격 크기를 강제한다 — 비율 유지로 1px 어긋나면 콘솔이 거부한다.
  await sharp(Buffer.from(svg)).resize(w, h, { fit: 'fill' }).png().toFile(pngPath);
  const meta = await sharp(pngPath).metadata();
  if (meta.width !== w || meta.height !== h) {
    throw new Error(`${name}: ${meta.width}x${meta.height} — 규격 ${w}x${h} 와 다르다`);
  }
  process.stdout.write(`${pngPath}  ${meta.width}x${meta.height}\n`);
}
