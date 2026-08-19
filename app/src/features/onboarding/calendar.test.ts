import { describe, expect, it } from 'vitest'
import {
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  clampDay,
  daysInMonth,
  daysInSolarMonth,
  describeBirthDate,
  formatBirthDate,
  formatBirthTime,
  formatMonthOption,
  isGregorianLeapYear,
  isValidBirthDate,
  isValidSolarDate,
  monthIndexOf,
  monthsOf,
  rangeInclusive,
  toCalendarType,
} from './calendar'

describe('isGregorianLeapYear', () => {
  it('100의 배수는 윤년이 아니지만 400의 배수는 윤년이다', () => {
    expect(isGregorianLeapYear(1900)).toBe(false)
    expect(isGregorianLeapYear(2000)).toBe(true)
    expect(isGregorianLeapYear(2100)).toBe(false)
    expect(isGregorianLeapYear(2024)).toBe(true)
    expect(isGregorianLeapYear(2023)).toBe(false)
  })
})

describe('daysInSolarMonth', () => {
  it('2월은 윤년 여부로 갈린다', () => {
    expect(daysInSolarMonth(1900, 2)).toBe(28)
    expect(daysInSolarMonth(2000, 2)).toBe(29)
    expect(daysInSolarMonth(2024, 2)).toBe(29)
  })

  it('범위 밖 월은 0을 준다', () => {
    expect(daysInSolarMonth(2000, 0)).toBe(0)
    expect(daysInSolarMonth(2000, 13)).toBe(0)
  })
})

describe('daysInMonth', () => {
  it('음력 대소월을 표에서 그대로 읽는다 (C00 §S0-2 · 자산 A7)', () => {
    // 예전에는 화면이 대소월을 몰라 30일까지 열어 두고 엔진이 걸렀다. 이제는 같은 표를 본다.
    expect(daysInMonth('solar', 2024, 2)).toBe(29)
    expect(daysInMonth('lunar', 1990, 4)).toBe(29) // 소월
    expect(daysInMonth('lunar', 1990, 5)).toBe(30) // 대월
  })

  it('그 해에 없는 달은 0 이다', () => {
    expect(daysInMonth('lunar', 2024, 5, true)).toBe(0) // 2024년에는 윤달이 없다
    expect(daysInMonth('lunar', 2023, 2, true)).toBe(daysInMonth('lunar_leap', 2023, 2, true))
    expect(daysInMonth('lunar', 2101, 1)).toBe(0) // 표 밖
  })
})

describe('monthsOf', () => {
  it('양력은 언제나 12칸이고 윤달이 없다', () => {
    const months = monthsOf('solar', 2024)
    expect(months).toHaveLength(12)
    expect(months.every((m) => !m.leap)).toBe(true)
    expect(months[1]?.days).toBe(29)
  })

  it('음력 윤년은 13칸이고 윤달이 같은 번호의 평달 바로 뒤에 온다', () => {
    const months = monthsOf('lunar', 2023)
    expect(months).toHaveLength(13)
    expect(months.map(formatMonthOption)).toEqual([
      '1월',
      '2월',
      '윤2월',
      '3월',
      '4월',
      '5월',
      '6월',
      '7월',
      '8월',
      '9월',
      '10월',
      '11월',
      '12월',
    ])
  })

  it('음력 평년은 12칸이다', () => {
    expect(monthsOf('lunar', 2024)).toHaveLength(12)
    expect(monthsOf('lunar', 2024).some((m) => m.leap)).toBe(false)
  })

  it('표 밖 연도는 빈 목록이다 (없는 달을 보여 주는 것보다 낫다)', () => {
    expect(monthsOf('lunar', 2101)).toEqual([])
  })
})

describe('monthIndexOf', () => {
  it('평달·윤달을 각각 제자리에 놓는다 (2023: 1 2 윤2 3 …)', () => {
    expect(monthIndexOf('lunar', 2023, 2, false)).toBe(1)
    expect(monthIndexOf('lunar', 2023, 2, true)).toBe(2)
    // 윤2월 뒤의 평달은 한 칸씩 밀려 있다 — 여기가 어긋나면 월 휠이 다른 달에 선다.
    expect(monthIndexOf('lunar', 2023, 3, false)).toBe(3)
    expect(monthIndexOf('lunar', 2023, 12, false)).toBe(12)
  })

  it('양력은 언제나 월 번호 − 1 이다', () => {
    expect(monthIndexOf('solar', 2023, 1, false)).toBe(0)
    expect(monthIndexOf('solar', 2023, 12, false)).toBe(11)
  })

  it('그 해에 없는 윤달이면 같은 번호의 평달로 떨어뜨린다 (던지지 않는다)', () => {
    expect(monthIndexOf('lunar', 2024, 5, true)).toBe(4)
  })

  it('표 밖 연도면 0 이다 (월 목록이 비어 있다)', () => {
    expect(monthIndexOf('lunar', 2101, 5, false)).toBe(0)
  })

  it('monthsOf 와 왕복한다 — 1900~2100 전 음력 달', () => {
    // 인덱스↔(월, 윤달) 대응이 어긋나면 사용자가 고른 달과 계산된 달이 조용히 갈린다.
    let checked = 0
    for (let year = MIN_BIRTH_YEAR; year <= MAX_BIRTH_YEAR; year += 1) {
      const months = monthsOf('lunar', year)
      months.forEach((m, index) => {
        expect(monthIndexOf('lunar', year, m.month, m.leap)).toBe(index)
        checked += 1
      })
    }
    expect(checked).toBeGreaterThan(2_400)
  })
})

describe('toCalendarType', () => {
  it('(음력 여부, 윤달 여부) → 달력 종류', () => {
    expect(toCalendarType(false, false)).toBe('solar')
    expect(toCalendarType(false, true)).toBe('solar') // 양력에 윤달은 없다
    expect(toCalendarType(true, false)).toBe('lunar')
    expect(toCalendarType(true, true)).toBe('lunar_leap')
  })
})

describe('isValidBirthDate', () => {
  it('양력은 기존 규칙 그대로다', () => {
    expect(isValidBirthDate('solar', { year: 2023, month: 2, day: 29 })).toBe(false)
    expect(isValidBirthDate('solar', { year: 2024, month: 2, day: 29 })).toBe(true)
  })

  it('없는 윤달·소월 30일을 거부한다', () => {
    expect(isValidBirthDate('lunar_leap', { year: 2024, month: 5, day: 1 })).toBe(false)
    expect(isValidBirthDate('lunar_leap', { year: 2023, month: 2, day: 1 })).toBe(true)
    expect(isValidBirthDate('lunar', { year: 1990, month: 4, day: 30 })).toBe(false)
    expect(isValidBirthDate('lunar', { year: 1990, month: 5, day: 30 })).toBe(true)
  })
})

describe('isValidSolarDate', () => {
  it('C00 §S0-1 이 거부하라고 명시한 날짜들을 거부한다', () => {
    expect(isValidSolarDate(2023, 2, 29)).toBe(false)
    expect(isValidSolarDate(1900, 2, 29)).toBe(false)
    expect(isValidSolarDate(2024, 4, 31)).toBe(false)
  })

  it('지원 범위(1900~2100) 밖을 거부한다', () => {
    expect(isValidSolarDate(MIN_BIRTH_YEAR - 1, 1, 1)).toBe(false)
    expect(isValidSolarDate(MAX_BIRTH_YEAR + 1, 1, 1)).toBe(false)
    expect(isValidSolarDate(MIN_BIRTH_YEAR, 1, 1)).toBe(true)
    expect(isValidSolarDate(MAX_BIRTH_YEAR, 12, 31)).toBe(true)
  })

  it('정수가 아니면 거부한다', () => {
    expect(isValidSolarDate(2000, 1, 1.5)).toBe(false)
  })
})

describe('clampDay', () => {
  it('31일에서 2월로 옮기면 말일로 당긴다', () => {
    expect(clampDay('solar', 2023, 2, 31)).toBe(28)
    expect(clampDay('solar', 2024, 2, 31)).toBe(29)
    expect(clampDay('lunar', 1990, 4, 31)).toBe(29) // 소월
    expect(clampDay('lunar', 1990, 5, 31)).toBe(30) // 대월
  })

  it('유효한 날은 그대로 둔다', () => {
    expect(clampDay('solar', 2024, 5, 16)).toBe(16)
  })
})

describe('rangeInclusive', () => {
  it('양끝을 포함한다', () => {
    expect(rangeInclusive(1, 3)).toEqual([1, 2, 3])
    expect(rangeInclusive(1, 1)).toEqual([1])
    expect(rangeInclusive(2, 1)).toEqual([])
  })
})

describe('표시 포맷', () => {
  it('윤달을 표기한다', () => {
    expect(formatBirthDate('solar', { year: 1993, month: 5, day: 16 })).toBe('양력 1993년 5월 16일')
    expect(formatBirthDate('lunar', { year: 1993, month: 3, day: 25 })).toBe('음력 1993년 3월 25일')
    expect(formatBirthDate('lunar_leap', { year: 1993, month: 3, day: 25 })).toBe('음력 1993년 윤3월 25일')
  })

  it('24시간제로 적는다', () => {
    expect(formatBirthTime({ hour: 0, minute: 5 })).toBe('0시 5분')
    expect(formatBirthTime({ hour: 23, minute: 59 })).toBe('23시 59분')
  })

  it('음력은 환산된 양력 날짜를 함께 보인다 (윤달 오선택을 사용자가 잡을 유일한 단서)', () => {
    expect(describeBirthDate('lunar', { year: 1990, month: 4, day: 12 })).toBe(
      '음력 1990년 4월 12일 · 양력 1990년 5월 6일',
    )
    expect(describeBirthDate('lunar_leap', { year: 2023, month: 2, day: 1 })).toContain('양력 2023년')
  })

  it('양력에는 군더더기를 붙이지 않는다', () => {
    expect(describeBirthDate('solar', { year: 1993, month: 5, day: 16 })).toBe('양력 1993년 5월 16일')
  })

  it('실재하지 않는 음력 날짜는 그 사실을 적는다', () => {
    expect(describeBirthDate('lunar_leap', { year: 2024, month: 5, day: 1 })).toContain('없는 날짜')
  })
})
