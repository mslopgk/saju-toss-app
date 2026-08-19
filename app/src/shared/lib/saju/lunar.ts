// S0-2 음력 ↔ 양력 변환 — 근거: C00 §S0-2, §4.1 자산 A7, §1.2.2 `lunarSource`
//
// F1(의존성 0): 런타임에 만세력 라이브러리를 부르지 않는다. 빌드타임에 manseryeok(MIT)에서 뽑아
//   구운 17비트/년 비트필드(`shared/data/lunar-table.packed.ts`)만 읽는다. 추출·전수대조 스크립트는
//   `shared/data/tools/gen-lunar-table.mjs`.
// F7(결정론): `Date`·`Intl`·타임존을 쓰지 않는다. 전부 JDN 정수 산술이다.
//
// ## 표가 담고 있는 것 / 담고 있지 않은 것
// 담는 것은 **월의 길이(29/30)와 윤달 위치**뿐이다. 각 해 정월 초하루의 양력 날짜는 담지 않는다 —
// `LUNAR_BASE_JDN` 에서 월 길이를 누적하면 나오기 때문이다. 그래서 202년치가 430 B 에 들어간다.
// 반대로 말하면 **월 길이 하나가 틀리면 그 뒤 전부가 하루씩 밀린다.** 생성기가 연 총일수 게이트와
// 정월 초하루 누적합 대조를 거는 이유가 이것이고, `test/saju/lunar.test.ts` 가 왕복 전수를 다시 건다.

import {
  LUNAR_BASE_JDN,
  LUNAR_BASE_YEAR,
  LUNAR_BITS_PER_YEAR,
  LUNAR_MAX_YEAR,
  LUNAR_TABLE_PACKED,
  LUNAR_YEAR_COUNT,
} from '../../data/lunar-table.packed';

export { LUNAR_BASE_YEAR, LUNAR_MAX_YEAR, LUNAR_YEAR_COUNT };

export interface LunarDate {
  year: number;
  month: number;
  day: number;
  /** 그 달이 윤달인가. 입력 `calendarType: 'lunar_leap'` 과 같은 뜻이다 */
  leap: boolean;
}

export interface SolarDate {
  year: number;
  month: number;
  day: number;
}

interface LunarTable {
  /** 연도별 17비트 값. `(윤달위치 << 13) | 대월비트마스크` */
  readonly years: Uint32Array;
  /** [i] = 그 해 정월 초하루 JDN. 마지막 칸은 표 밖 첫 날(exclusive end) */
  readonly starts: Int32Array;
}

let cached: LunarTable | null = null;

/** 그 해 월 수(윤달 포함) */
const monthCountOf = (packed: number): number => (packed >>> 13 === 0 ? 12 : 13);

/**
 * 월 시퀀스 인덱스 → 그 달의 일수. 시퀀스는 1월 … (윤N월) … 12월 순서다.
 * 비트가 서면 대월(30일), 서지 않으면 소월(29일).
 */
const daysAtSeq = (packed: number, seq: number): number => 29 + ((packed >>> seq) & 1);

/** 그 해 총 일수. 평년 353~355 / 윤년 383~385 */
function yearDays(packed: number): number {
  const n = monthCountOf(packed);
  let total = 0;
  for (let seq = 0; seq < n; seq++) total += daysAtSeq(packed, seq);
  return total;
}

/** 17비트 비트스트림 base64 → 연도 배열 + 정월 초하루 누적 JDN. 첫 호출에서만 디코드한다 */
function table(): LunarTable {
  if (cached !== null) return cached;
  const bin = atob(LUNAR_TABLE_PACKED);
  const years = new Uint32Array(LUNAR_YEAR_COUNT);
  let bit = 0;
  for (let i = 0; i < LUNAR_YEAR_COUNT; i++) {
    let v = 0;
    for (let b = 0; b < LUNAR_BITS_PER_YEAR; b++) {
      v = (v << 1) | ((bin.charCodeAt(bit >>> 3) >>> (7 - (bit & 7))) & 1);
      bit++;
    }
    years[i] = v;
  }
  const starts = new Int32Array(LUNAR_YEAR_COUNT + 1);
  starts[0] = LUNAR_BASE_JDN;
  for (let i = 0; i < LUNAR_YEAR_COUNT; i++) starts[i + 1] = starts[i] + yearDays(years[i]);
  cached = { years, starts };
  return cached;
}

/**
 * (월, 윤달여부) → 시퀀스 인덱스. 그 해에 없는 달이면 −1.
 *
 * 윤N월은 평달 N월 **뒤에** 온다(C00 §S0-2). 그래서 N 보다 큰 평달은 한 칸씩 밀린다.
 */
function seqIndexOf(packed: number, month: number, leap: boolean): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return -1;
  const leapMonth = packed >>> 13;
  if (leap) return leapMonth === month ? month : -1;
  return month - 1 + (leapMonth !== 0 && leapMonth < month ? 1 : 0);
}

function packedOf(year: number): number | null {
  if (!Number.isInteger(year) || year < LUNAR_BASE_YEAR || year > LUNAR_MAX_YEAR) return null;
  return table().years[year - LUNAR_BASE_YEAR];
}

/** 그 해의 윤달 위치(1~12). 윤달이 없으면 0. 표 밖이면 null */
export function lunarLeapMonthOf(year: number): number | null {
  const packed = packedOf(year);
  return packed === null ? null : packed >>> 13;
}

export interface LunarMonth {
  readonly month: number;
  readonly leap: boolean;
  /** 29(소월) 또는 30(대월) */
  readonly days: number;
}

/**
 * 그 해에 실제로 있는 달을 순서대로. 윤달이 있으면 13칸, 없으면 12칸. 표 밖이면 null.
 *
 * 화면의 월 휠이 이 목록을 그대로 쓴다 — "윤달 체크박스"를 따로 두면 그 해에 없는 윤달을
 * 고를 수 있게 되고, 사용자는 다 입력한 뒤에야 `INVALID_LUNAR_DATE` 를 본다.
 */
export function lunarMonthsOf(year: number): readonly LunarMonth[] | null {
  const packed = packedOf(year);
  if (packed === null) return null;
  const leapMonth = packed >>> 13;
  const out: LunarMonth[] = [];
  for (let month = 1; month <= 12; month++) {
    out.push({ month, leap: false, days: daysAtSeq(packed, seqIndexOf(packed, month, false)) });
    if (leapMonth === month) {
      out.push({ month, leap: true, days: daysAtSeq(packed, month) });
    }
  }
  return out;
}

/** 그 음력 달의 일수(29 또는 30). 존재하지 않는 달이면 null */
export function lunarMonthDays(year: number, month: number, leap: boolean): number | null {
  const packed = packedOf(year);
  if (packed === null) return null;
  const seq = seqIndexOf(packed, month, leap);
  return seq < 0 ? null : daysAtSeq(packed, seq);
}

/** 그 음력 날짜가 실재하는가. 표 밖·없는 윤달·소월의 30일은 전부 false */
export function isValidLunarDate(year: number, month: number, day: number, leap: boolean): boolean {
  const max = lunarMonthDays(year, month, leap);
  return max !== null && Number.isInteger(day) && day >= 1 && day <= max;
}

/** 음력 날짜의 JDN. 실재하지 않으면 null */
export function lunarJdn(year: number, month: number, day: number, leap: boolean): number | null {
  const packed = packedOf(year);
  if (packed === null) return null;
  const seq = seqIndexOf(packed, month, leap);
  if (seq < 0) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysAtSeq(packed, seq)) return null;
  let jdn = table().starts[year - LUNAR_BASE_YEAR];
  for (let i = 0; i < seq; i++) jdn += daysAtSeq(packed, i);
  return jdn + day - 1;
}

/**
 * 그레고리력 → JDN (Fliegel–Van Flandern).
 *
 * `pillars.jdnFromYmd` 와 **같은 값을 내지만 율리우스력 분기가 없다.** 일부러 그 파일을 import 하지
 * 않는다 — 이 모듈은 온보딩 화면(초기 청크)이 음력 월 목록을 그리는 데 쓰므로, 여기서 `pillars` 를
 * 끌어오면 간지·납음 상수까지 초기 청크에 실릴 위험이 생긴다. 표가 1899년부터라 율리우스력 구간이
 * 나올 수 없어 분기가 필요 없고, 두 구현이 어긋나지 않는 것은 `test/saju/lunar.test.ts` 가
 * 1900-01-01 ~ 2100-12-31 전 일자 대조로 고정한다.
 */
export function solarJdn(year: number, month: number, day: number): number {
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

/** JDN → 그레고리력 (위 `solarJdn` 의 역함수). 표를 1582년 이전으로 넓히면 여기부터 고쳐야 한다 */
function gregorianFromJdn(jdn: number): SolarDate {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    year: 100 * b + d - 4800 + Math.floor(m / 10),
    month: m + 3 - 12 * Math.floor(m / 10),
    day: e - Math.floor((153 * m + 2) / 5) + 1,
  };
}

/** 음력 → 양력. 실재하지 않는 음력 날짜(없는 윤달·소월 30일·표 밖)면 null */
export function lunarToSolar(
  year: number,
  month: number,
  day: number,
  leap: boolean,
): SolarDate | null {
  const jdn = lunarJdn(year, month, day, leap);
  return jdn === null ? null : gregorianFromJdn(jdn);
}

/** 양력 → 음력. 표가 덮지 않는 날짜면 null */
export function solarToLunar(year: number, month: number, day: number): LunarDate | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const { years, starts } = table();
  const jdn = solarJdn(year, month, day);
  if (jdn < starts[0] || jdn >= starts[LUNAR_YEAR_COUNT]) return null;

  // 연도 이분탐색 — starts 는 단조증가한다
  let lo = 0;
  let hi = LUNAR_YEAR_COUNT - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= jdn) lo = mid;
    else hi = mid - 1;
  }
  const packed = years[lo];
  const leapMonth = packed >>> 13;
  const n = monthCountOf(packed);
  let rest = jdn - starts[lo];
  for (let seq = 0; seq < n; seq++) {
    const days = daysAtSeq(packed, seq);
    if (rest < days) {
      // 시퀀스 인덱스 → (월, 윤달여부). 윤N월은 시퀀스의 N 번 칸이고, 그 뒤 평달은 한 칸씩 밀려 있다.
      const leap = leapMonth !== 0 && seq === leapMonth;
      const month0 = leap ? leapMonth : seq + 1 - (leapMonth !== 0 && seq > leapMonth ? 1 : 0);
      return { year: LUNAR_BASE_YEAR + lo, month: month0, day: rest + 1, leap };
    }
    rest -= days;
  }
  // yearDays 와 daysAtSeq 가 같은 표를 보므로 도달 불가. 도달하면 표가 깨진 것이다.
  return null;
}

/** 표가 덮는 양력 구간 [첫날 JDN, 마지막날 JDN] — 범위 진단·테스트용 */
export function lunarTableSolarJdnRange(): readonly [number, number] {
  const { starts } = table();
  return [starts[0], starts[LUNAR_YEAR_COUNT] - 1];
}
