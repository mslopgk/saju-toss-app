import { describe, expect, it } from 'vitest'
import { CITIES, DEFAULT_CITY_ID, findCity, findCityOrDefault } from './cities'

describe('CITIES', () => {
  it('id 가 중복되지 않는다', () => {
    const ids = CITIES.map((city) => city.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('기본값 서울은 C00 §S0-3 이 명시한 좌표다', () => {
    const seoul = findCityOrDefault(DEFAULT_CITY_ID)
    expect(seoul.longitude).toBe(126.9784204)
    expect(seoul.latitude).toBe(37.5665)
  })

  it('좌표가 한반도 주변 범위 안에 있다', () => {
    for (const city of CITIES) {
      expect(city.latitude).toBeGreaterThan(33)
      expect(city.latitude).toBeLessThan(39)
      expect(city.longitude).toBeGreaterThan(124)
      expect(city.longitude).toBeLessThan(132)
    }
  })

  it('경도 폭이 C15 §7.2 가 말한 만큼 넓다 (백령도 ↔ 울릉)', () => {
    const longitudes = CITIES.map((city) => city.longitude)
    const spreadMinutes = 4 * (Math.max(...longitudes) - Math.min(...longitudes))
    // 4분/도 × 6.23도 ≈ 24.9분. 서울 고정으로 처리하면 시주가 갈릴 수 있는 폭이다.
    expect(spreadMinutes).toBeGreaterThan(20)
  })

  it('없는 id 는 서울로 떨어진다', () => {
    expect(findCity('atlantis')).toBeUndefined()
    expect(findCityOrDefault('atlantis').id).toBe(DEFAULT_CITY_ID)
  })
})
