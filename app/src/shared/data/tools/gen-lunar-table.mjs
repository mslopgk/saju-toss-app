// 음력 테이블 추출기 — manseryeok(MIT) → src/shared/data/lunar-table.packed.ts
// 근거: C00 §4.1 자산 A7 (`lunar-table.bin`), §S0-2 (음→양 변환), §4.2 (저장 포맷)
//
// 실행: node src/shared/data/tools/gen-lunar-table.mjs   (앱 루트에서)
// 출력은 결정론적이다. 재실행해서 diff 가 나오면 manseryeok 버전이 바뀐 것이다.
//
// ## 왜 오프라인 추출인가 (C00 §F1)
// manseryeok `dist` 는 CJS 단일 빌드라 트리셰이킹이 전혀 되지 않는다 — `lunarToSolar` 하나만
// import 해도 절기 보정표 14 KB 가 딸려 온다(C12 §트리셰이킹). 우리가 필요한 것은 음력 대소월
// 비트필드뿐이므로 빌드타임에 뽑아 굽고, 런타임은 자체 테이블만 읽는다. 프로덕션 의존성 0.
//
// ## 왜 공개 API 로 프로빙하는가
// manseryeok 내부 `LUNAR_DATA` 배열을 그대로 슬라이스하는 편이 짧지만, 그러면 그 배열의
// 비트 규약(0x10000 = 윤달 대소 …)을 우리가 재해석하는 셈이라 오독이 조용히 통과한다.
// `lunarToSolar` 가 던지는 RangeError 로 경계를 재구성하면 검증 대상이 "우리 해석"이 아니라
// "그 라이브러리가 실제로 내놓는 값"이 된다.
//
// ## 테이블 범위가 1899 부터인 이유
// 음력 1900-01-01 = 양력 1900-01-31 이다. 그래서 양력 1900-01-01 ~ 01-30 은 음력 **1899-12월**에
// 속한다. C00 §S0-1 의 범위 가드는 "**양력 환산 후** 1900-01-01 이상"이므로 음력 1899-12-01
// (= 양력 1900-01-01) 은 정당한 입력이다. 1899 를 빼면 이 30일이 변환 불가 구멍이 된다.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../lunar-table.packed.ts');
// 앱 프로덕션 의존성으로 넣지 않는다. 리서치 프로토타입에 이미 설치된 것을 추출 때만 쓴다.
const PROTO = path.resolve(HERE, '../../../../../docs/research/calc/proto/');
const require = createRequire(path.join(PROTO, 'package.json'));
const ms = require('manseryeok');
const msPkg = require('manseryeok/package.json');

const BASE_YEAR = 1899;
const MAX_YEAR = 2100;
const YEAR_COUNT = MAX_YEAR - BASE_YEAR + 1;

if (ms.LUNAR_MIN_YEAR > BASE_YEAR || ms.LUNAR_MAX_YEAR < MAX_YEAR) {
  throw new Error(`manseryeok 범위 부족: ${ms.LUNAR_MIN_YEAR}~${ms.LUNAR_MAX_YEAR}`);
}

/** 그레고리력 JDN (Fliegel–Van Flandern). 1899+ 만 쓰므로 율리우스력 분기가 필요 없다 */
function jdnFromYmd(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

const jdnOfLunar = (y, m, d, leap) => {
  const s = ms.lunarToSolar(y, m, d, leap);
  return jdnFromYmd(s.year, s.month, s.day);
};

/** 그 해에 윤달이 있으면 그 월 번호(1~12), 없으면 0. RangeError 가 경계의 진실이다 */
function probeLeapMonth(year) {
  let found = 0;
  for (let m = 1; m <= 12; m++) {
    try {
      ms.lunarToSolar(year, m, 1, true);
    } catch {
      continue;
    }
    if (found !== 0) throw new Error(`${year}년에 윤달이 둘: ${found}, ${m}`);
    found = m;
  }
  return found;
}

/** 그 달이 대월(30일)인지. day=30 이 통과하면 대월이다 */
function probeIsLong(year, month, leap) {
  try {
    ms.lunarToSolar(year, month, 30, leap);
    return true;
  } catch {
    return false;
  }
}

// ── 1) 프로빙 ────────────────────────────────────────────────────────────
/** years[i] = (leap << 13) | mask. mask 의 비트 j = 그 해 j 번째 달(0-base, 윤달 포함)이 대월 */
const years = new Array(YEAR_COUNT);
/** 검증용 — 연도별 월 시퀀스 [{month, leap, days}] */
const sequences = new Array(YEAR_COUNT);

for (let y = BASE_YEAR; y <= MAX_YEAR; y++) {
  const leap = probeLeapMonth(y);
  const seq = [];
  for (let m = 1; m <= 12; m++) {
    seq.push({ month: m, leap: false, days: probeIsLong(y, m, false) ? 30 : 29 });
    if (leap === m) {
      seq.push({ month: m, leap: true, days: probeIsLong(y, m, true) ? 30 : 29 });
    }
  }
  if (seq.length !== (leap === 0 ? 12 : 13)) throw new Error(`${y}년 월 수 이상: ${seq.length}`);

  let mask = 0;
  for (let i = 0; i < seq.length; i++) if (seq[i].days === 30) mask |= 1 << i;

  const idx = y - BASE_YEAR;
  years[idx] = (leap << 13) | mask;
  sequences[idx] = seq;
}

// ── 2) 산술 무결성 게이트 ────────────────────────────────────────────────
// 삭망월 평균 29.530589일. 음력 1년은 353~385일(평년 353~355, 윤년 383~385) 밖일 수 없다.
for (let i = 0; i < YEAR_COUNT; i++) {
  const total = sequences[i].reduce((a, s) => a + s.days, 0);
  const leap = years[i] >>> 13;
  const [lo, hi] = leap === 0 ? [353, 355] : [383, 385];
  if (total < lo || total > hi) {
    throw new Error(`${BASE_YEAR + i}년 총일수 ${total} 이 [${lo},${hi}] 밖 (leap=${leap})`);
  }
}

// 각 연도의 시작 JDN 이 누적합과 일치해야 한다 — 여기서 어긋나면 대소월 하나가 틀린 것이다.
const BASE_JDN = jdnOfLunar(BASE_YEAR, 1, 1, false);
{
  let acc = BASE_JDN;
  for (let i = 0; i < YEAR_COUNT; i++) {
    const y = BASE_YEAR + i;
    const actual = jdnOfLunar(y, 1, 1, false);
    if (actual !== acc) throw new Error(`${y}년 정월 초하루 어긋남: 누적 ${acc} vs 실제 ${actual}`);
    acc += sequences[i].reduce((a, s) => a + s.days, 0);
  }
}

// ── 3) 비트 패킹 (17비트 × 202년) ────────────────────────────────────────
const BITS_PER_YEAR = 17;
const bytes = new Uint8Array(Math.ceil((YEAR_COUNT * BITS_PER_YEAR) / 8));
{
  let bit = 0;
  for (const v of years) {
    if (v < 0 || v >= 1 << BITS_PER_YEAR) throw new Error(`17비트 초과: ${v}`);
    for (let b = BITS_PER_YEAR - 1; b >= 0; b--) {
      if ((v >>> b) & 1) bytes[bit >>> 3] |= 0x80 >>> (bit & 7);
      bit++;
    }
  }
}
const b64 = Buffer.from(bytes).toString('base64');

// 패킹 왕복 — 여기서 실패하면 파일을 쓰지 않는다
{
  const back = new Array(YEAR_COUNT);
  let bit = 0;
  for (let i = 0; i < YEAR_COUNT; i++) {
    let v = 0;
    for (let b = 0; b < BITS_PER_YEAR; b++) {
      v = (v << 1) | ((bytes[bit >>> 3] >>> (7 - (bit & 7))) & 1);
      bit++;
    }
    back[i] = v;
  }
  for (let i = 0; i < YEAR_COUNT; i++) {
    if (back[i] !== years[i]) throw new Error(`패킹 왕복 불일치 ${BASE_YEAR + i}`);
  }
}

// ── 4) manseryeok 대조 (전수) ────────────────────────────────────────────
// 우리 테이블의 순수 산술 변환이 manseryeok 의 값과 전 건 일치해야 한다.
const yearStart = new Int32Array(YEAR_COUNT + 1);
yearStart[0] = BASE_JDN;
for (let i = 0; i < YEAR_COUNT; i++) {
  yearStart[i + 1] = yearStart[i] + sequences[i].reduce((a, s) => a + s.days, 0);
}
function ourJdn(y, m, d, leap) {
  const i = y - BASE_YEAR;
  let jdn = yearStart[i];
  for (const s of sequences[i]) {
    if (s.month === m && s.leap === leap) return jdn + d - 1;
    jdn += s.days;
  }
  return null;
}

let checkedL2S = 0;
for (let y = BASE_YEAR; y <= MAX_YEAR; y++) {
  for (const s of sequences[y - BASE_YEAR]) {
    for (let d = 1; d <= s.days; d++) {
      const mine = ourJdn(y, s.month, d, s.leap);
      const theirs = jdnOfLunar(y, s.month, d, s.leap);
      if (mine !== theirs) {
        throw new Error(`음→양 불일치 ${y}-${s.leap ? '윤' : ''}${s.month}-${d}: ${mine} vs ${theirs}`);
      }
      checkedL2S++;
    }
  }
  // 존재하지 않는 날(29일 달의 30일)을 우리가 만들어 내지 않는지
  for (const s of sequences[y - BASE_YEAR]) {
    if (s.days === 29 && probeIsLong(y, s.month, s.leap)) throw new Error(`대소월 오판 ${y}-${s.month}`);
  }
}

// 양→음: 양력 1900-01-01 ~ 2100-12-31 전 일자
let checkedS2L = 0;
{
  const from = jdnFromYmd(1900, 1, 1);
  const to = jdnFromYmd(2100, 12, 31);
  // 우리 테이블이 그 JDN 을 덮는지부터 확인한다(테이블 밖이면 구멍이다)
  if (BASE_JDN > from || yearStart[YEAR_COUNT] <= to) {
    throw new Error(`테이블이 양력 지원범위를 덮지 못한다: ${BASE_JDN}..${yearStart[YEAR_COUNT] - 1}`);
  }
  for (let jdn = from; jdn <= to; jdn++) {
    // 우리 테이블로 역변환
    let i = 0;
    while (yearStart[i + 1] <= jdn) i++;
    let rest = jdn - yearStart[i];
    let hit = null;
    for (const s of sequences[i]) {
      if (rest < s.days) {
        hit = { year: BASE_YEAR + i, month: s.month, day: rest + 1, leap: s.leap };
        break;
      }
      rest -= s.days;
    }
    if (hit === null) throw new Error(`역변환 실패 jdn=${jdn}`);
    // manseryeok 대조
    const g = ((n) => {
      let a = n + 32044;
      const b = Math.floor((4 * a + 3) / 146097);
      const c = a - Math.floor((146097 * b) / 4);
      const dd = Math.floor((4 * c + 3) / 1461);
      const e = c - Math.floor((1461 * dd) / 4);
      const mm = Math.floor((5 * e + 2) / 153);
      return {
        year: 100 * b + dd - 4800 + Math.floor(mm / 10),
        month: mm + 3 - 12 * Math.floor(mm / 10),
        day: e - Math.floor((153 * mm + 2) / 5) + 1,
      };
    })(jdn);
    const theirs = ms.solarToLunar(g.year, g.month, g.day);
    if (
      theirs.year !== hit.year ||
      theirs.month !== hit.month ||
      theirs.day !== hit.day ||
      theirs.isLeapMonth !== hit.leap
    ) {
      throw new Error(
        `양→음 불일치 ${g.year}-${g.month}-${g.day}: ` +
          `우리 ${JSON.stringify(hit)} vs manseryeok ${JSON.stringify(theirs)}`,
      );
    }
    checkedS2L++;
  }
}

// ── 5) 출력 ──────────────────────────────────────────────────────────────
const leapYears = years.filter((v) => v >>> 13).length;
const body = `// AUTO-GENERATED — 수정 금지. 재생성: node src/shared/data/tools/gen-lunar-table.mjs
// 출처: npm manseryeok@${msPkg.version} (MIT) — 1391~2049 KASI 음양력 API / 2050~2100 천문계산
// 근거: C00 §4.1 자산 A7, §S0-2. 런타임은 이 표만 읽는다(manseryeok 프로덕션 의존 없음).
//
// 포맷: 연도당 17비트를 MSB-first 로 이어 붙인 뒤 base64.
//   상위 4비트 = 윤달 위치(0 = 없음, 1~12)
//   하위 13비트 = 그 해 월 시퀀스(윤달 포함, 0-base)의 대월(30일) 비트. 0 이면 소월(29일).
// 각 연도의 정월 초하루 JDN 은 저장하지 않는다 — LUNAR_BASE_JDN 에서 누적하면 나온다.
//
// 검증(생성 시점, 전부 통과):
//   음→양 ${checkedL2S.toLocaleString('en-US')}건 · 양→음 ${checkedS2L.toLocaleString('en-US')}건 manseryeok 전수 일치
//   연 총일수 게이트(평년 353~355 / 윤년 383~385) ${YEAR_COUNT}년 통과
//   정월 초하루 누적합 = 실제값 ${YEAR_COUNT}년 일치

/** 표 첫 해. 양력 1900-01-01 이 음력 1899-12-01 이라 1899 부터 담는다 */
export const LUNAR_BASE_YEAR = ${BASE_YEAR};
/** 표 마지막 해 (manseryeok LUNAR_MAX_YEAR) */
export const LUNAR_MAX_YEAR = ${MAX_YEAR};
/** 수록 연수 */
export const LUNAR_YEAR_COUNT = ${YEAR_COUNT};
/** 연도당 비트 수 (윤달 4 + 대소월 13) */
export const LUNAR_BITS_PER_YEAR = ${BITS_PER_YEAR};
/** 음력 ${BASE_YEAR}-01-01 의 그레고리력 JDN (= 양력 ${(() => {
  const s = ms.lunarToSolar(BASE_YEAR, 1, 1, false);
  return `${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`;
})()}) */
export const LUNAR_BASE_JDN = ${BASE_JDN};
/** 윤달이 있는 해의 수 */
export const LUNAR_LEAP_YEAR_COUNT = ${leapYears};
/** 17비트 × ${YEAR_COUNT}년 비트스트림 base64 (raw ${bytes.length} B / base64 ${b64.length} B) */
export const LUNAR_TABLE_PACKED =
  '${b64}';
`;

fs.writeFileSync(OUT, body, 'utf8');
console.log(
  `wrote ${OUT}\n  years=${YEAR_COUNT} leapYears=${leapYears} rawBytes=${bytes.length} base64=${b64.length}` +
    `\n  baseJdn=${BASE_JDN} 음→양 ${checkedL2S}건 · 양→음 ${checkedS2L}건 대조 통과`,
);
