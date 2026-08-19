// 절기 테이블 패커 — docs/research/calc/proto/solarterms-de440s.json → solar-terms.packed.ts
// 근거: C00 §4.2 (저장 포맷 결정), §S2-2 (DE440s 사전계산)
//
// 실행: node src/shared/data/tools/pack-solar-terms.mjs   (앱 루트에서)
// 출력은 결정론적이다. 재실행해서 diff 가 나오면 원본 JSON 이 바뀐 것이다.
//
// 왜 이 포맷인가 (실측, 7,080 레코드):
//   원본 JSON            raw 592,360 / gzip 92,443 / brotli 57,975
//   1차차분 varint(ms)   raw  35,400 / b64 47,200 / gzip(b64) 31,565
//   2차차분 zigzag varint raw 27,807 / b64 37,076 / gzip(b64) 27,486  ← 채택
//   초 양자화 + ms 별도   raw  31,743 / b64 42,324 / gzip(b64) 29,232
// C00 §4.2 는 「초 양자화」를 허용하지만 우리는 **ms 원값을 유지한다**:
//   교운 절대순간이 Δ분 × 480 이라 절기 시각의 0.5초 오차가 교운에서 240초로 증폭돼
//   §5.2 의 교운 ±60초 게이트(golden-set-prod 321건)를 통과하지 못한다.
//   ms 유지 비용은 gzip 기준 약 +1.7 KB 뿐이다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../../../../../docs/research/calc/proto/solarterms-de440s.json');
const OUT = path.resolve(HERE, '../solar-terms.packed.ts');

/** 1850-01-01T00:00:00Z — 패킹 기준 epoch (음수 varint 회피용) */
const EPOCH_MS = Date.UTC(1850, 0, 1);

/** 황경 → 「입춘 기준 태양년 블록」 안의 순번. 285(소한)=0 … 270(동지)=23 */
const slotOf = (sunLng) => ((((sunLng - 285) % 360) + 360) % 360) / 15;

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const baseYear = Math.min(...raw.map((r) => r.year));
const maxYear = Math.max(...raw.map((r) => r.year));
const slots = (maxYear - baseYear + 1) * 24;

const times = new Array(slots).fill(null);
for (const r of raw) {
  const i = (r.year - baseYear) * 24 + slotOf(r.sunLng);
  if (times[i] !== null) throw new Error(`중복 슬롯: ${r.year} ${r.sunLng}`);
  times[i] = Date.parse(r.utc);
}
if (times.some((t) => t === null)) throw new Error('빈 슬롯이 있다 — 원본 테이블이 불완전하다');

// 무결성 게이트 (C00 §4.2): 인접 절기 간격 [21180, 22665]분
for (let i = 1; i < times.length; i++) {
  const gapMin = (times[i] - times[i - 1]) / 60000;
  if (!(gapMin >= 21180 && gapMin <= 22665)) {
    throw new Error(`간격 게이트 위반 idx=${i} ${gapMin}분`);
  }
}

const bytes = [];
const varint = (v) => {
  if (v < 0 || !Number.isInteger(v)) throw new Error('varint 범위 오류: ' + v);
  while (v >= 0x80) {
    bytes.push((v % 128) + 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v);
};
const zigzag = (v) => (v < 0 ? -2 * v - 1 : 2 * v);

varint(times[0] - EPOCH_MS); // 첫 절기
varint(times[1] - times[0]); // 첫 1차차분
for (let i = 2; i < times.length; i++) {
  const d2 = times[i] - times[i - 1] - (times[i - 1] - times[i - 2]);
  varint(zigzag(d2));
}

const b64 = Buffer.from(Uint8Array.from(bytes)).toString('base64');

// 왕복 검증 — 여기서 실패하면 파일을 쓰지 않는다
{
  let p = 0;
  const readVarint = () => {
    let v = 0;
    let mul = 1;
    for (;;) {
      const b = bytes[p++];
      v += (b & 0x7f) * mul;
      if ((b & 0x80) === 0) return v;
      mul *= 128;
    }
  };
  const unzig = (v) => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);
  const back = new Array(times.length);
  back[0] = EPOCH_MS + readVarint();
  let d = readVarint();
  back[1] = back[0] + d;
  for (let i = 2; i < times.length; i++) {
    d += unzig(readVarint());
    back[i] = back[i - 1] + d;
  }
  if (p !== bytes.length) throw new Error('디코더가 바이트를 다 읽지 않았다');
  for (let i = 0; i < times.length; i++) if (back[i] !== times[i]) throw new Error('왕복 불일치 idx=' + i);
}

const header = `// AUTO-GENERATED — 수정 금지. 재생성: node src/shared/data/tools/pack-solar-terms.mjs
// 출처: docs/research/calc/proto/solarterms-de440s.json (Skyfield + JPL DE440s, C00 §S2-2 / 자산 V3)
// 포맷: 2차차분 zigzag varint → base64 (C00 §4.2). ms 원값 무손실.
// 슬롯: (year - ${baseYear}) * 24 + ((sunLng - 285 mod 360) / 15). 태양년 블록은 소한(285)에서 시작한다.
`;

const body = `${header}
/** 패킹 기준 epoch (1850-01-01T00:00:00Z) */
export const SOLAR_TERMS_EPOCH_MS = ${EPOCH_MS};
/** 테이블 첫 해 (이 해의 소한부터 수록) */
export const SOLAR_TERMS_BASE_YEAR = ${baseYear};
/** 테이블 마지막 해 (이 해의 동지까지 수록) */
export const SOLAR_TERMS_MAX_YEAR = ${maxYear};
/** 레코드 수 (${maxYear - baseYear + 1}년 × 24절기) */
export const SOLAR_TERMS_COUNT = ${times.length};
/** 2차차분 zigzag varint base64 (raw ${bytes.length} B / base64 ${b64.length} B) */
export const SOLAR_TERMS_PACKED =
  '${b64}';
`;

fs.writeFileSync(OUT, body, 'utf8');
console.log(`wrote ${OUT}\n  records=${times.length} rawBytes=${bytes.length} base64=${b64.length}`);
