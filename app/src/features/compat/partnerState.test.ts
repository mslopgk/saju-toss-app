import { describe, expect, it } from 'vitest';
import { computeChart } from '../../shared/lib/saju';
import {
  INITIAL_PARTNER_DRAFT,
  MAX_YEAR,
  MIN_YEAR,
  buildPartnerInput,
  describePartnerDate,
  describePartnerTime,
  isValidPartnerDate,
  missingPartnerFields,
  monthIndexOf,
  monthsOf,
  partnerReducer,
  type PartnerDraft,
} from './partnerState';
import { EMPTY_MBTI_AXES } from '../../shared/lib/mbti';

const full: PartnerDraft = {
  calendarType: 'solar',
  date: { year: 1992, month: 11, day: 3 },
  time: { hour: 22, minute: 10 },
  timeUnknown: false,
  gender: 'F',
  mbtiAxes: { ei: 'I', sn: 'N', tf: 'F', jp: 'J' },
  blood: 'A',
};

describe('상대방 입력 상태', () => {
  it('처음에는 아무것도 채워지지 않았고 CTA 를 잠근다', () => {
    expect(missingPartnerFields(INITIAL_PARTNER_DRAFT)).toEqual([
      'date',
      'time',
      'gender',
      'mbti',
      'blood',
    ]);
    expect(buildPartnerInput(INITIAL_PARTNER_DRAFT).ok).toBe(false);
  });

  /**
   * MBTI·혈액형은 **필수**가 됐다. 온보딩(나)만 필수로 바꾸고 여기를 빠뜨린 판이 한 번
   * 있었는데, 그때는 문구가 "필수" 인데 검증이 통과시켜 상대방 정보가 비어도 제출됐다.
   */
  it('MBTI·혈액형이 비면 CTA 를 막는다', () => {
    const draft = { ...full, mbtiAxes: EMPTY_MBTI_AXES, blood: null };
    expect(missingPartnerFields(draft)).toEqual(['mbti', 'blood']);
    expect(buildPartnerInput(draft).ok).toBe(false);
  });

  /** 네 축 중 하나라도 비면 유형이 아니다 — 두 축만 고른 상태는 "아직 안 고름" 과 같다. */
  it('MBTI 축이 하나라도 비면 막는다', () => {
    const draft = { ...full, mbtiAxes: { ...full.mbtiAxes, tf: null } };
    expect(missingPartnerFields(draft)).toEqual(['mbti']);
  });

  it('다 채우면 프로필에 유형 문자열이 실린다', () => {
    const built = buildPartnerInput(full);
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.profile).toEqual({ mbti: 'INFJ', blood: 'A' });
  });

  it('시각을 고르면 "모름"이 풀린다 — 두 값이 동시에 참일 수 없다', () => {
    const unknown = partnerReducer(full, { type: 'setTimeUnknown' });
    expect(unknown.timeUnknown).toBe(true);
    expect(unknown.time).toBeNull();
    const picked = partnerReducer(unknown, { type: 'setTime', time: { hour: 1, minute: 2 } });
    expect(picked.timeUnknown).toBe(false);
    expect(picked.time).toEqual({ hour: 1, minute: 2 });
  });

  it('삼주 모드는 hour 키 자체를 넣지 않는다 (C00 §S0-4)', () => {
    const built = buildPartnerInput({ ...full, time: null, timeUnknown: true });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect('hour' in built.input).toBe(false);
      expect(built.input.timeUnknown).toBe(true);
    }
  });

  it('출생지는 비워 보내고 엔진이 서울을 채운다 (C00 §S0-3)', () => {
    const built = buildPartnerInput(full);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.input.birthPlace).toEqual({});
    const chart = computeChart(built.input);
    expect(chart.input.place.region).toBe('KR');
    expect(chart.input.place.longitude).not.toBeNull();
  });

  it('같은 혈액형을 다시 누르면 해제된다', () => {
    const set = partnerReducer(INITIAL_PARTNER_DRAFT, { type: 'setBlood', blood: 'A' });
    expect(set.blood).toBe('A');
    expect(partnerReducer(set, { type: 'setBlood', blood: null }).blood).toBeNull();
  });
});

describe('달력', () => {
  it('양력은 12달, 윤년 2월만 29일이다', () => {
    expect(monthsOf('solar', 2023)).toHaveLength(12);
    expect(monthsOf('solar', 2023)[1]!.days).toBe(28);
    expect(monthsOf('solar', 2024)[1]!.days).toBe(29);
    expect(monthsOf('solar', 1900)[1]!.days).toBe(28); // 100의 배수는 윤년이 아니다
    expect(monthsOf('solar', 2000)[1]!.days).toBe(29); // 400의 배수는 윤년이다
  });

  it('음력은 윤달이 있는 해에 13달이고, 그 해에 있는 달만 낸다', () => {
    const leapYear = monthsOf('lunar', 2023); // 윤2월
    expect(leapYear).toHaveLength(13);
    expect(leapYear.filter((m) => m.leap)).toHaveLength(1);
    expect(monthsOf('lunar', 2024)).toHaveLength(12);
    // 음력 표 밖 연도는 빈 배열 — 화면이 CTA 를 잠그고, 던지지 않는다.
    expect(monthsOf('lunar', 2101)).toEqual([]);
  });

  it('없는 음력 날짜를 걸러낸다', () => {
    expect(isValidPartnerDate('lunar', { year: 2023, month: 2, day: 1 })).toBe(true);
    expect(isValidPartnerDate('lunar', { year: 2024, month: 1, day: 31 })).toBe(false);
    expect(isValidPartnerDate('lunar_leap', { year: 2024, month: 2, day: 1 })).toBe(false);
    expect(isValidPartnerDate('solar', { year: 2023, month: 2, day: 29 })).toBe(false);
    expect(isValidPartnerDate('solar', { year: MIN_YEAR - 1, month: 1, day: 1 })).toBe(false);
    expect(isValidPartnerDate('solar', { year: MAX_YEAR + 1, month: 1, day: 1 })).toBe(false);
  });

  it('연도를 바꿔도 같은 달 번호를 다시 찾는다 (윤달 자리가 해마다 다르다)', () => {
    expect(monthIndexOf('solar', 2023, 5, false)).toBe(4);
    // 2023 윤2월은 시퀀스 2번(1월·2월·윤2월)
    expect(monthIndexOf('lunar_leap', 2023, 2, true)).toBe(2);
    // 2024 에는 윤2월이 없으므로 평2월로 떨어진다
    expect(monthIndexOf('lunar_leap', 2024, 2, true)).toBe(1);
    // 표 밖 연도는 0
    expect(monthIndexOf('lunar', 2101, 5, false)).toBe(0);
  });

  it('표시 문구는 달력 종류를 밝힌다', () => {
    expect(describePartnerDate('solar', { year: 1992, month: 11, day: 3 })).toBe('양력 1992년 11월 3일');
    expect(describePartnerDate('lunar', { year: 1992, month: 11, day: 3 })).toBe('음력 1992년 11월 3일');
    expect(describePartnerDate('lunar_leap', { year: 2023, month: 2, day: 1 })).toBe('음력 윤달 2023년 2월 1일');
    expect(describePartnerTime(full)).toBe('22시 10분');
    expect(describePartnerTime({ ...full, time: null, timeUnknown: true })).toContain('모름');
    expect(describePartnerTime({ ...full, time: null, timeUnknown: false })).toBe('선택해 주세요');
  });
});
