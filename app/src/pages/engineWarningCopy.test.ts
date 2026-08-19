// 결과 화면이 엔진 경고를 하나도 삼키지 않는지 고정한다.
// 경고는 "이 명식은 경계 상황이라 입력이 조금만 달랐으면 달라졌을 수 있다"는 정보라, 빠지면 사용자가 속는다.
import { describe, expect, it } from 'vitest'

import { computeChart } from '../shared/lib/saju'
import { DISCLAIMERS } from '../shared/interpret/ui'
import { ALL_ENGINE_WARNINGS, ENGINE_WARNING_COPY } from './engineWarningCopy'

describe('엔진 경고 문구', () => {
  it('엔진이 낼 수 있는 경고 코드를 빠짐없이 덮는다', () => {
    expect(Object.keys(ENGINE_WARNING_COPY).sort()).toEqual([...ALL_ENGINE_WARNINGS].sort())
  })

  it('모든 문구에 라벨·설명·심각도가 있다', () => {
    for (const code of ALL_ENGINE_WARNINGS) {
      const copy = ENGINE_WARNING_COPY[code]
      expect(copy.label.length).toBeGreaterThan(0)
      expect(copy.detail.length).toBeGreaterThan(10)
      expect(['info', 'warn']).toContain(copy.severity)
    }
  })

  it('실제 차트가 내는 경고가 전부 문구를 갖는다', () => {
    // 삼주 모드(생시 모름) — THREE_PILLAR_MODE 가 반드시 뜬다.
    const three = computeChart({
      calendarType: 'solar',
      year: 1988,
      month: 5,
      day: 10,
      timeUnknown: true,
      gender: 'F',
      birthPlace: { latitude: 37.5665, longitude: 126.9784204 },
    })
    expect(three.warnings).toContain('THREE_PILLAR_MODE')
    for (const w of three.warnings) expect(ENGINE_WARNING_COPY[w]).toBeDefined()

    // 서머타임 시행기(1987~1988 여름) — 표준시/서머타임 계열 경고가 붙는다.
    const dst = computeChart({
      calendarType: 'solar',
      year: 1988,
      month: 7,
      day: 15,
      hour: 14,
      minute: 30,
      timeUnknown: false,
      gender: 'M',
      birthPlace: { latitude: 37.5665, longitude: 126.9784204 },
    })
    for (const w of dst.warnings) expect(ENGINE_WARNING_COPY[w]).toBeDefined()
  })
})

describe('면책 문구', () => {
  it('결과 화면이 쓰는 UI 진입점에서 나온다', () => {
    expect(DISCLAIMERS.length).toBeGreaterThan(0)
  })

  it('혈액형에 과학적 근거가 없다는 고지를 포함한다', () => {
    expect(DISCLAIMERS.some((d) => d.includes('혈액형') && d.includes('과학적 근거'))).toBe(true)
  })

  it('MBTI 가 자기신고이고 검사가 아니라는 고지를 포함한다', () => {
    expect(DISCLAIMERS.some((d) => d.includes('MBTI') && d.includes('성격 검사'))).toBe(true)
  })
})
