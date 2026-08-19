/**
 * 계산 대기 화면.
 *
 * 이 화면은 **눈으로만 확인되는 종류**라 스모크가 지나가는 순간을 잡기 어렵다(계산이 빨라
 * 대개 한 프레임이다). 그래서 최소한 "던지지 않고, 문구가 실려 있고, 접근성 역할이 붙는다"를
 * 여기서 고정한다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import { ReadingScreen } from './ReadingScreen'

const render = (): string =>
  renderToString(
    <TDSMobileAITProvider>
      <ReadingScreen />
    </TDSMobileAITProvider>,
  )

describe('ReadingScreen', () => {
  it('던지지 않고 첫 문구를 보여 준다', () => {
    const html = render()
    expect(html).toContain('태어난 순간의 하늘을 펼치는 중이에요')
  })

  /**
   * 화면이 바뀌는 것을 스크린리더가 알아야 한다. `role="status"` + `aria-live` 가 없으면
   * 시각장애 사용자에게는 **아무 일도 일어나지 않는 정적 화면**이다.
   */
  it('상태 변화를 스크린리더에 알린다', () => {
    const html = render()
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
  })

  /**
   * 가짜 진행률을 만들지 않는다 — 남은 시간은 네트워크가 정하지 우리가 모른다.
   *
   * **보이는 글자만 본다.** 처음에는 HTML 전체에 `/\d+%/` 를 걸었는데 emotion 이 심은
   * CSS 의 `50%` 에 걸렸다 — 화면 글자가 아니라 스타일을 검사하고 있었다.
   */
  it('숫자로 진행률을 말하지 않는다', () => {
    const visible = render()
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, '')
    expect(visible).not.toMatch(/\d/)
    expect(visible).toContain('태어난 순간의 하늘')
  })
})
