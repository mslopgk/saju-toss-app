import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALENDAR_TYPE,
  INITIAL_DRAFT,
  buildBirthInput,
  collectMissingFields,
  onboardingReducer,
} from './formState'
import type { OnboardingDraft } from './formState'
import { DEFAULT_CITY_ID, findCityOrDefault } from './cities'
import { lunarToSolar } from '../../shared/lib/saju/lunar'

function filled(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    ...INITIAL_DRAFT,
    date: { year: 1993, month: 5, day: 16 },
    time: { hour: 12, minute: 0 },
    gender: 'M',
    ...overrides,
  }
}

describe('달력 정책', () => {
  it('기본값은 양력이다 (고르지 않은 사용자의 사주가 달라지면 안 된다)', () => {
    expect(DEFAULT_CALENDAR_TYPE).toBe('solar')
    expect(INITIAL_DRAFT.calendarType).toBe('solar')
  })

  it('드래프트 필드 목록을 고정한다', () => {
    // 목록을 정확히 고정한다 — 상태가 슬그머니 늘면 캐시 키·직렬화에 새어 들어간다.
    // (`mbti`/`blood` 는 계산에 쓰이지 않는 선택 입력이며 CTA 를 막지 않는다.)
    expect(Object.keys(INITIAL_DRAFT).sort()).toEqual(
      ['blood', 'calendarType', 'cityId', 'date', 'gender', 'mbti', 'time', 'timeUnknown'].sort(),
    )
  })

  it('달력과 날짜는 한 액션으로 함께 바뀐다', () => {
    // 따로 두면 "양력을 골라 둔 채 음력 날짜"가 잠깐 존재하고, 그 사이 렌더가 다른 사주를 보여 준다.
    const next = onboardingReducer(INITIAL_DRAFT, {
      type: 'setDate',
      calendarType: 'lunar_leap',
      date: { year: 2023, month: 2, day: 15 },
    })
    expect(next.calendarType).toBe('lunar_leap')
    expect(next.date).toEqual({ year: 2023, month: 2, day: 15 })
  })

  it('달력만 바꿀 때 새 달력에서 실재하지 않는 날짜는 비운다', () => {
    // 2024년에는 윤달이 없다.
    const solar = onboardingReducer(INITIAL_DRAFT, {
      type: 'setDate',
      calendarType: 'solar',
      date: { year: 2024, month: 5, day: 20 },
    })
    expect(onboardingReducer(solar, { type: 'setCalendarType', calendarType: 'lunar' }).date).toEqual({
      year: 2024,
      month: 5,
      day: 20,
    })
    expect(
      onboardingReducer(solar, { type: 'setCalendarType', calendarType: 'lunar_leap' }).date,
    ).toBeNull()
  })
})

describe('onboardingReducer', () => {
  it('시각을 고르면 삼주 모드가 풀린다', () => {
    const unknown = onboardingReducer(INITIAL_DRAFT, { type: 'setTimeUnknown' })
    expect(unknown.timeUnknown).toBe(true)
    expect(unknown.time).toBeNull()

    const known = onboardingReducer(unknown, { type: 'setTime', time: { hour: 5, minute: 30 } })
    expect(known.timeUnknown).toBe(false)
    expect(known.time).toEqual({ hour: 5, minute: 30 })
  })

  it('삼주 모드로 들어가면 골라둔 시각을 버린다', () => {
    const unknown = onboardingReducer(filled(), { type: 'setTimeUnknown' })
    expect(unknown.time).toBeNull()
  })

})

describe('collectMissingFields', () => {
  it('초기 상태에서는 날짜·시각·성별이 비어 있다', () => {
    expect(collectMissingFields(INITIAL_DRAFT)).toEqual(['date', 'time', 'gender'])
  })

  it('삼주 모드면 시각은 빈 항목이 아니다', () => {
    const draft = onboardingReducer(INITIAL_DRAFT, { type: 'setTimeUnknown' })
    expect(collectMissingFields(draft)).toEqual(['date', 'gender'])
  })

  it('출생지는 서울 기본값이 있으므로 빈 항목이 될 수 없다 (C00 §S0-3)', () => {
    expect(collectMissingFields(filled())).toEqual([])
    expect(INITIAL_DRAFT.cityId).toBe(DEFAULT_CITY_ID)
  })
})

describe('buildBirthInput', () => {
  it('덜 채운 상태는 incomplete 로 알린다', () => {
    const result = buildBirthInput(INITIAL_DRAFT)
    expect(result).toEqual({ ok: false, reason: 'incomplete', missing: ['date', 'time', 'gender'] })
  })

  it('다 채우면 C00 §1.2.2 필드명 그대로 만든다', () => {
    const result = buildBirthInput(filled())
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value).toEqual({
      calendarType: 'solar',
      year: 1993,
      month: 5,
      day: 16,
      hour: 12,
      minute: 0,
      timeUnknown: false,
      gender: 'M',
      birthPlace: { latitude: 37.5665, longitude: 126.9784204 },
    })
  })

  it('삼주 모드에서는 hour/minute 를 아예 넣지 않는다', () => {
    const result = buildBirthInput(filled({ timeUnknown: true, time: null }))
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect('hour' in result.value).toBe(false)
    expect('minute' in result.value).toBe(false)
    expect(result.value.timeUnknown).toBe(true)
  })

  it('선택한 도시의 좌표를 그대로 싣는다', () => {
    const mokpo = findCityOrDefault('mokpo')
    const result = buildBirthInput(filled({ cityId: 'mokpo' }))
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.birthPlace.longitude).toBe(mokpo.longitude)
  })

  it('엔진 룩업표와 코드 체계가 어긋날 수 있으므로 regionCode 는 넣지 않는다', () => {
    const result = buildBirthInput(filled())
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.birthPlace.regionCode).toBeUndefined()
  })

  it('화면에서 만들 수 있는 잘못된 날짜는 invalid 로 잡는다', () => {
    const result = buildBirthInput(filled({ date: { year: 2023, month: 2, day: 30 } }))
    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'invalid') {
      throw new Error('invalid 를 기대했다')
    }
    expect(result.messages.length).toBeGreaterThan(0)
  })

  it('음력 드래프트는 calendarType 을 그대로 실어 보낸다 (환산은 엔진 S0 의 몫)', () => {
    // 화면이 미리 양력으로 바꿔서 넘기면 `lunarSource` 가 사라져 결과에서 원본을 되짚을 수 없다.
    const result = buildBirthInput(filled({ calendarType: 'lunar', date: { year: 1990, month: 4, day: 12 } }))
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.value.calendarType).toBe('lunar')
    expect(result.value).toMatchObject({ year: 1990, month: 4, day: 12 })
    // 그 음력 날짜가 실재한다는 것만 화면이 보장한다.
    expect(lunarToSolar(1990, 4, 12, false)).not.toBeNull()
  })

  it('그 해에 없는 윤달은 invalid 로 잡는다', () => {
    const result = buildBirthInput(
      filled({ calendarType: 'lunar_leap', date: { year: 2024, month: 5, day: 1 } }),
    )
    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== 'invalid') {
      throw new Error('invalid 를 기대했다')
    }
    expect(result.messages.join(' ')).toContain('음력')
  })

  it('소월(29일)의 30일은 invalid 로 잡는다', () => {
    // 음력 1990년 4월은 29일까지다(소월).
    expect(lunarToSolar(1990, 4, 30, false)).toBeNull()
    const result = buildBirthInput(filled({ calendarType: 'lunar', date: { year: 1990, month: 4, day: 30 } }))
    expect(result.ok).toBe(false)
  })
})
