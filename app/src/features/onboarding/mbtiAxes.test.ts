/**
 * MBTI 네 축 조합.
 *
 * 여기서 고정하는 것은 **자리 순서**다. 화면은 N/S·P/J 순으로 보여 주지만 코드의 자리는
 * 표준(E/I · S/N · T/F · J/P)이어야 한다 — 순서가 흔들리면 `INFP` 가 `IFNP` 가 되고
 * 지식카드 키가 조용히 어긋난다. 예외도 오류도 없이 리포트에서 MBTI 항목만 사라진다.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_MBTI_AXES, MBTI_AXIS_SPECS, axesOf, mbtiOf } from './mbtiAxes';
import { MBTI_TYPES } from './types';

describe('mbtiOf', () => {
  it('네 축을 표준 자리 순서로 잇는다', () => {
    expect(mbtiOf({ ei: 'I', sn: 'N', tf: 'F', jp: 'P' })).toBe('INFP');
    expect(mbtiOf({ ei: 'E', sn: 'S', tf: 'T', jp: 'J' })).toBe('ESTJ');
  });

  it.each(['ei', 'sn', 'tf', 'jp'] as const)('%s 축이 비면 null 이다', (axis) => {
    const full = { ei: 'I', sn: 'N', tf: 'F', jp: 'P' } as const;
    expect(mbtiOf({ ...full, [axis]: null })).toBeNull();
  });

  it('아무 축도 고르지 않으면 null 이다', () => {
    expect(mbtiOf(EMPTY_MBTI_AXES)).toBeNull();
  });

  /** 16유형 전부가 축 왕복을 견뎌야 한다 — 한 유형이라도 빠지면 그 사용자는 MBTI 항목을 잃는다. */
  it('16유형 전부 왕복한다', () => {
    for (const type of MBTI_TYPES) {
      expect(mbtiOf(axesOf(type)), type).toBe(type);
    }
  });
});

describe('axesOf', () => {
  it('null 은 빈 축이다', () => {
    expect(axesOf(null)).toEqual(EMPTY_MBTI_AXES);
  });

  it('유형 문자열을 자리대로 쪼갠다', () => {
    expect(axesOf('ENTJ')).toEqual({ ei: 'E', sn: 'N', tf: 'T', jp: 'J' });
  });
});

describe('MBTI_AXIS_SPECS', () => {
  it('네 축을 모두 덮고 중복이 없다', () => {
    expect(MBTI_AXIS_SPECS.map((a) => a.key)).toEqual(['ei', 'sn', 'tf', 'jp']);
  });

  /** 지정받은 표시 순서. 자리 순서(E/I · S/N · T/F · J/P)와 다르다는 것이 이 테스트의 요점이다. */
  it('화면 순서는 E/I · N/S · T/F · P/J 다', () => {
    expect(MBTI_AXIS_SPECS.map((a) => a.options.join('/'))).toEqual(['E/I', 'N/S', 'T/F', 'P/J']);
  });

  it('모든 선택지에 문구가 있다', () => {
    for (const axis of MBTI_AXIS_SPECS) {
      for (const option of axis.options) {
        expect(axis.label[option], `${axis.key}/${option}`).toBeTruthy();
      }
    }
  });
});
