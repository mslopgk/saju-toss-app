/**
 * 날짜 시트 렌더 스모크.
 *
 * jsdom 없이 `react-dom/server` 로 정적 렌더한다(OnboardingForm.prefill.test.tsx 와 같은 이유).
 * TDS `BottomSheet` 는 SSR 에서 본문을 그리지 않으므로 **여기서 볼 수 있는 것은 "던지지 않는다"뿐**이다.
 * 월 목록·초기 위치 같은 판정은 순수 함수로 내려 `calendar.test.ts` 가 본다
 * (`monthsOf` / `monthIndexOf` / `describeBirthDate`).
 *
 * 그래도 이 파일이 필요한 이유: 렌더 중 예외는 오류 화면이 아니라 **흰 화면**으로 나타난다.
 * 표 밖 연도(월 목록이 빈 배열)와 없는 윤달이 그 예외를 만들기 가장 쉬운 입력이다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import { BirthDateSheet } from './BirthDateSheet'
import type { CalendarType } from '../types'
import type { BirthDate } from '../calendar'

function render(calendarType: CalendarType, initialDate: BirthDate, open = true): string {
  return renderToString(
    <TDSMobileAITProvider>
      <BirthDateSheet
        open={open}
        calendarType={calendarType}
        initialDate={initialDate}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </TDSMobileAITProvider>,
  )
}

describe('BirthDateSheet 렌더', () => {
  it.each([
    ['양력', 'solar', { year: 1995, month: 1, day: 1 }],
    ['음력 평년', 'lunar', { year: 2024, month: 5, day: 1 }],
    ['음력 윤년', 'lunar', { year: 2023, month: 5, day: 1 }],
    ['음력 윤달', 'lunar_leap', { year: 2023, month: 2, day: 1 }],
    // 아래 둘은 딥링크·저장값이 어긋났을 때만 생기는 입력이다. 여기서 던지면 흰 화면이다.
    ['그 해에 없는 윤달', 'lunar_leap', { year: 2024, month: 5, day: 1 }],
    ['음력 표 밖 연도(월 목록이 빈 배열)', 'lunar', { year: 2101, month: 1, day: 1 }],
  ] as const)('%s 로 열어도 던지지 않는다', (_name, calendarType, date) => {
    expect(() => render(calendarType, date)).not.toThrow()
  })

  it('닫힌 상태에서도 던지지 않는다', () => {
    expect(() => render('lunar', { year: 2023, month: 2, day: 1 }, false)).not.toThrow()
  })
})
