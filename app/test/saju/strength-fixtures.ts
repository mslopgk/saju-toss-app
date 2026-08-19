// S5 테스트 공용 유틸 — 간지 문자열/격자에서 `FourPillars` 를 만든다.
//
// S5 는 4주 간지만 입력으로 받는 순수함수이므로(C05 §0) 시각·절기 파이프라인을 통과시키지 않고
// 간지를 직접 조립해 검증한다. 정합성(오호둔·오서둔)은 `gridPillars()` 가 보장한다.

import {
  BRANCHES,
  BRANCH_INDEX,
  OHODUN,
  OSEODUN,
  STEMS,
  STEM_INDEX,
  mod,
} from '../../src/shared/lib/saju/constants';
import { makePillar } from '../../src/shared/lib/saju/pillars';
import type { Branch, FourPillars, Stem } from '../../src/shared/lib/saju/types';

/** "癸巳 甲子 丁酉 甲辰" → FourPillars. jie/시각 필드는 S5 가 읽지 않으므로 형식만 채운다 */
export function pillarsOf(gz8: string): FourPillars {
  const parts = gz8.trim().split(/\s+/);
  if (parts.length !== 4 && parts.length !== 3) {
    throw new Error(`간지 4항(또는 삼주 3항)이 아니다: ${gz8}`);
  }
  const mk = (s: string) =>
    makePillar(STEM_INDEX.get(s[0] as Stem)!, BRANCH_INDEX.get(s[1] as Branch)!);
  return {
    year: mk(parts[0]),
    month: mk(parts[1]),
    day: mk(parts[2]),
    hour: parts.length === 4 ? mk(parts[3]) : null,
    threePillarMode: parts.length === 3,
    sajuYear: 2000,
    monthOrder: 0,
    dayJdn: 2451545,
    calendarUsedForJdn: 'gregorian',
    jasiRule: 'yajasi',
    isYajasi: false,
    gz8: parts.join(' '),
    jie: { ko: '입춘', hanja: '立春', enteredUtcMs: 0 },
    boundaryWarning: false,
  };
}

/**
 * 정합 사주 전수 격자 = 년주 60 × 월지 12 × 일주 60 × 시지 12 = **518,400**.
 * 월간은 오호둔, 시간은 오서둔으로 결정되므로 자유도는 이 4축뿐이다(C05 §4.2).
 */
export function* gridPillars(): Generator<FourPillars> {
  for (let yi = 0; yi < 60; yi++) {
    const ys = yi % 10;
    const yb = yi % 12;
    for (let mb = 0; mb < 12; mb++) {
      // 寅월 기준 순번 → 오호둔으로 월간 결정
      const ms = mod(OHODUN[ys]! + mod(mb - 2, 12), 10);
      for (let di = 0; di < 60; di++) {
        const ds = di % 10;
        const db = di % 12;
        for (let hb = 0; hb < 12; hb++) {
          const hs = mod(OSEODUN[ds]! + hb, 10);
          yield {
            year: makePillar(ys, yb),
            month: makePillar(ms, mb),
            day: makePillar(ds, db),
            hour: makePillar(hs, hb),
            threePillarMode: false,
            sajuYear: 2000,
            monthOrder: 0,
            dayJdn: 2451545,
            calendarUsedForJdn: 'gregorian',
            jasiRule: 'yajasi',
            isYajasi: false,
            gz8: `${STEMS[ys]}${BRANCHES[yb]} ${STEMS[ms]}${BRANCHES[mb]} ${STEMS[ds]}${BRANCHES[db]} ${STEMS[hs]}${BRANCHES[hb]}`,
            jie: { ko: '입춘', hanja: '立春', enteredUtcMs: 0 },
            boundaryWarning: false,
          };
        }
      }
    }
  }
}

export const GRID_SIZE = 60 * 12 * 60 * 12;
