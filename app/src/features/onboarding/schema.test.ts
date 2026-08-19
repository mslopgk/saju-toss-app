import { describe, expect, it } from 'vitest'
import { parseBirthInput } from './schema'

const SEOUL = { latitude: 37.5665, longitude: 126.9784204 }

function base() {
  return {
    calendarType: 'solar',
    year: 1993,
    month: 5,
    day: 16,
    hour: 12,
    minute: 0,
    timeUnknown: false,
    gender: 'M',
    birthPlace: SEOUL,
  }
}

describe('parseBirthInput', () => {
  it('정상 입력을 통과시킨다', () => {
    const result = parseBirthInput(base())
    expect(result.ok).toBe(true)
  })

  it('삼주 모드는 hour/minute 없이 통과한다 (C00 §S0-4)', () => {
    const result = parseBirthInput({
      ...base(),
      hour: undefined,
      minute: undefined,
      timeUnknown: true,
    })
    expect(result.ok).toBe(true)
  })

  it('삼주 모드인데 시각이 함께 오면 거부한다', () => {
    const result = parseBirthInput({ ...base(), timeUnknown: true })
    expect(result.ok).toBe(false)
  })

  it('생시를 안다고 했는데 hour 가 없으면 거부한다', () => {
    const result = parseBirthInput({ ...base(), hour: undefined, minute: undefined })
    expect(result.ok).toBe(false)
  })

  it('hour 만 있고 minute 이 없으면 거부한다 (C00 §1.2.2)', () => {
    const result = parseBirthInput({ ...base(), minute: undefined })
    expect(result.ok).toBe(false)
  })

  it('달력에 없는 양력 날짜를 거부한다', () => {
    expect(parseBirthInput({ ...base(), year: 2023, month: 2, day: 29 }).ok).toBe(false)
    expect(parseBirthInput({ ...base(), year: 1900, month: 2, day: 29 }).ok).toBe(false)
    expect(parseBirthInput({ ...base(), year: 2024, month: 4, day: 31 }).ok).toBe(false)
  })

  it('양력·음력·음력 윤달 셋 다 받는다 (C00 §1.2.2)', () => {
    // 음력 1993년 5월 16일은 실재한다(= 양력 1993-07-05).
    expect(parseBirthInput({ ...base(), calendarType: 'lunar' }).ok).toBe(true)
    // 1993년 윤달은 3월이라 윤5월은 없다 — 실재하지 않는 조합은 그대로 거부한다.
    expect(parseBirthInput({ ...base(), calendarType: 'lunar_leap' }).ok).toBe(false)
    expect(
      parseBirthInput({ ...base(), calendarType: 'lunar_leap', month: 3, day: 1 }).ok,
    ).toBe(true)
  })

  it('그 달에 없는 음력 일자를 거부한다 (소월 30일 / 없는 윤달)', () => {
    // 음력 1990년 4월은 29일까지다.
    expect(parseBirthInput({ ...base(), calendarType: 'lunar', year: 1990, month: 4, day: 30 }).ok).toBe(
      false,
    )
    // 2024년에는 윤달이 없다.
    expect(parseBirthInput({ ...base(), calendarType: 'lunar_leap', year: 2024 }).ok).toBe(false)
  })

  it('알 수 없는 달력 종류를 거부한다', () => {
    expect(parseBirthInput({ ...base(), calendarType: 'julian' }).ok).toBe(false)
  })

  it('지원 범위(1900~2100) 밖 연도를 거부한다 (C00 §F9)', () => {
    expect(parseBirthInput({ ...base(), year: 1899 }).ok).toBe(false)
    expect(parseBirthInput({ ...base(), year: 2101 }).ok).toBe(false)
  })

  it('성별 미입력을 거부한다 (대운 방향 판정에 필수)', () => {
    expect(parseBirthInput({ ...base(), gender: undefined }).ok).toBe(false)
    expect(parseBirthInput({ ...base(), gender: 'X' }).ok).toBe(false)
  })

  it('좌표 없는 출생지를 거부한다', () => {
    expect(parseBirthInput({ ...base(), birthPlace: {} }).ok).toBe(false)
    expect(parseBirthInput({ ...base(), birthPlace: { latitude: 37.5, longitude: 999 } }).ok).toBe(false)
  })

  it('해외 출생용 오프셋 필드를 허용한다', () => {
    const result = parseBirthInput({
      ...base(),
      birthPlace: {
        latitude: 40.7128,
        longitude: -74.006,
        ianaTz: 'America/New_York',
        stdOffsetMinutes: -300,
        dstMinutes: 60,
      },
    })
    expect(result.ok).toBe(true)
  })

  it('dstMinutes 는 0 또는 60 만 받는다 (C00 §1.2.2)', () => {
    const result = parseBirthInput({
      ...base(),
      birthPlace: { ...SEOUL, stdOffsetMinutes: 540, dstMinutes: 30 },
    })
    expect(result.ok).toBe(false)
  })

  it('입력이 객체가 아니어도 던지지 않고 실패를 돌려준다', () => {
    expect(parseBirthInput(null).ok).toBe(false)
    expect(parseBirthInput('1993-05-16').ok).toBe(false)
  })
})
