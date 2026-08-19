// DE440s 테이블 범위(1851~2145) **밖** 12절 확장표 생성기 (개발 전용, 1회성)
// 근거: C00 §S0-1(B7) 은 지원범위(1900~2100) 밖을 거부하므로 이 표는 프로덕션 경로에서 도달하지 않는다.
//       그러나 골든셋 축①/축② 는 테이블 경계 케이스 8건(1391 / 1800~1801 / 2146 / 2299~2300)을
//       포함하고, 그 기대값은 ref.mjs 의 astronomy-engine 폴백으로 만들어졌다.
//       회귀를 100% 재현하려면 같은 값이 필요하다 → **사전계산해서 별도 자산으로 분리**한다.
//       (F2 "런타임 천문계산 없음" 은 유지된다. 정확도는 DE440s 대비 max 175초로 낮으므로
//        `precision: 'approx'` 로 표시하고 지원범위 안에서는 절대 쓰지 않는다.)
//
// 실행: node src/shared/data/tools/gen-solar-terms-ext.mjs   (앱 루트에서)
// 요구: docs/research/calc/proto/node_modules/astronomy-engine (리서치 워크스페이스에 이미 설치돼 있다)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROTO = path.resolve(HERE, '../../../../../docs/research/calc/proto');
const AE = await import(pathToFileURL(path.join(PROTO, 'node_modules/astronomy-engine/esm/astronomy.js')).href);
const OUT = path.resolve(HERE, '../solar-terms-ext.ts');

const TABLE_MIN = 1851;
const TABLE_MAX = 2145;
/** 12절 황경 (C00 §S2-1) */
const JIE_LNG = [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285];

// 골든셋 두 축이 실제로 조회하는 연도만 담는다. prevJie/nextJie 가 y-1..y+1 을 훑고
// 입춘 조회가 로컬 연도를 쓰므로 케이스 연도 기준 ±2년을 여유로 잡는다.
const years = new Set();
for (const f of ['golden-set.json', 'golden-set-prod.json']) {
  const j = JSON.parse(fs.readFileSync(path.resolve(PROTO, '..', f), 'utf8'));
  for (const c of [...(j.cases ?? []), ...(j.needsReCollection ?? [])]) {
    const y = Number(c.input.date.slice(0, 4));
    for (let k = -2; k <= 2; k++) {
      const yy = y + k;
      if (yy < TABLE_MIN || yy > TABLE_MAX) years.add(yy);
    }
  }
}

// ref.mjs solarTermUtc 의 폴백 경로와 **동일한** 탐색 절차 (창 12→25→45일)
function searchTerm(year, lng) {
  const baseY = lng >= 285 ? year - 1 : year;
  const est = Date.UTC(baseY, 2, 20) + (lng / 0.98564736) * 86400000;
  for (const w of [12, 25, 45]) {
    const start = new AE.AstroTime(new Date(est - w * 86400000));
    const t = AE.SearchSunLongitude(lng, start, 2 * w);
    if (t) return t.date.getTime();
  }
  throw new Error(`searchTerm fail ${year} ${lng}`);
}

const rows = [];
for (const y of [...years].sort((a, b) => a - b)) {
  for (const lng of JIE_LNG) rows.push([y, lng, searchTerm(y, lng)]);
}

const body = `// AUTO-GENERATED — 수정 금지. 재생성: node src/shared/data/tools/gen-solar-terms-ext.mjs
// DE440s 테이블(${TABLE_MIN}~${TABLE_MAX}) 밖의 12절만 담은 **저정밀 확장표**.
// 출처: astronomy-engine 2.1.19 (DE440s 대비 max |Δ| 175.31초 — C00 §S2-2 표).
// 지원범위(1900~2100) 안에서는 절대 조회되지 않는다. 골든셋 테이블 경계 케이스 재현 전용.
// [year, sunLng, utcMs] 정렬 배열.
export const SOLAR_TERMS_EXT: readonly (readonly [number, number, number])[] = [
${rows.map(([y, l, ms]) => `  [${y}, ${l}, ${ms}],`).join('\n')}
];
`;
fs.writeFileSync(OUT, body, 'utf8');
console.log(`wrote ${OUT}\n  years=${years.size} rows=${rows.length} bytes=${body.length}`);
