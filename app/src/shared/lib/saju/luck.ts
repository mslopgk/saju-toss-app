// S6 대운 — 근거: C00 §S6-1 ~ §S6-3, §3-F
// 이식 원본: docs/research/calc/proto/ref.mjs (daewoon)
//
// Δ 는 **UTC 절대순간** 기준이다(F3). 진태양시·야자시 옵션은 Δ 를 오염시키지 않는다.
// 교운 절대순간은 정수 산술로 직접 정의한다 — 달력 덧셈(출생일시 + {y,m,d,h})은 금지다(§S6-2 a-2:
// 달력월/30일 해석 차이가 3,672건 중 68.1%에서 1일 초과, 최대 7일 어긋난다).

import { ganjiOf, mod } from './constants';
import { nextJie, prevJie } from './solar-terms';
import type { DaewoonEntry, DaewoonResult, FourPillars, Gender } from './types';

/** 대운 전개 칸 수 (index 1..10). index 0 은 교운 전 */
const DAEWOON_SPAN = 10;
/** 3일 = 1년 환산의 역수. Δ분 × 480 = 교운까지의 분 */
const MINUTES_PER_DELTA_MINUTE = 480;

export interface DaewoonOptions {
  /** 생시 모름(12:00 가정) → approx 표기 */
  approx?: boolean;
  /** 대운 칸 수. 기본 10 */
  span?: number;
}

/**
 * 순행 여부 = (연간 陽 && 남) || (연간 陰 && 여).
 * 연간은 **입춘으로 확정된 사주년**의 연간이다(달력 연도 아님).
 */
export function isForward(yearStemIdx: number, gender: Gender): boolean {
  return (gender === 'M') === (yearStemIdx % 2 === 0);
}

export function computeDaewoon(
  instantUtcMs: number,
  pillars: FourPillars,
  gender: Gender,
  birthYear: number,
  options: DaewoonOptions = {},
): DaewoonResult {
  const forward = isForward(pillars.year.stemIdx, gender);
  const deltaMs = forward
    ? nextJie(instantUtcMs).utcMs - instantUtcMs
    : instantUtcMs - prevJie(instantUtcMs).utcMs;
  const deltaMinutes = deltaMs / 60000;
  const deltaDays = deltaMs / 86400000;

  // 한국식 대운수. floor 선적용 + max(1,·) 클램프가 규범이다 —
  // 클램프를 빼면 골든셋 275건 중 216건만 통과한다(§S6-2 b).
  const daewoonNumber = Math.max(1, Math.round(Math.floor(deltaDays) / 3));
  const changeoverUtcMs = instantUtcMs + Math.round(deltaMinutes * MINUTES_PER_DELTA_MINUTE) * 60000;

  // 표시 전용 분해 (§S6-2 A식). 교운 순간을 만드는 데 쓰지 않는다.
  let rest = deltaMinutes;
  const years = Math.floor(rest / 4320);
  rest -= years * 4320;
  const months = Math.floor(rest / 360);
  rest -= months * 360;
  const days = Math.floor(rest / 12);
  rest -= days * 12;
  const hours = rest * 2;

  const span = options.span ?? DAEWOON_SPAN;
  const entries: DaewoonEntry[] = [
    {
      index: 0,
      ganji: null,
      ganjiIdx: null,
      startYear: birthYear,
      endYear: birthYear + daewoonNumber,
      startAgeWestern: 0,
      endAgeWestern: daewoonNumber,
      startAgeKorean: 1,
      endAgeKorean: daewoonNumber + 1,
    },
  ];
  for (let i = 1; i <= span; i++) {
    const ganjiIdx = mod(pillars.month.ganjiIdx + (forward ? i : -i), 60);
    const startAgeWestern = daewoonNumber + (i - 1) * 10;
    const startYear = birthYear + startAgeWestern;
    entries.push({
      index: i,
      ganji: ganjiOf(ganjiIdx),
      ganjiIdx,
      startYear,
      endYear: startYear + 10,
      startAgeWestern,
      endAgeWestern: startAgeWestern + 10,
      startAgeKorean: startAgeWestern + 1,
      endAgeKorean: startAgeWestern + 11,
    });
  }

  return {
    forward,
    daewoonNumber,
    exact: { years, months, days, hours },
    changeoverUtcMs,
    deltaMinutes,
    approx: options.approx ?? false,
    pillars: entries,
  };
}
