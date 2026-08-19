/**
 * 홈 화면 렌더 스모크.
 *
 * `CompatPage.test.tsx` 와 같은 이유로 jsdom 없이 `react-dom/server` 로 정적 렌더한다.
 * 렌더 중 예외는 오류 화면이 아니라 **흰 화면**으로 나타나므로, 그걸 잡는 것이 이 파일의 최소 임무다.
 *
 * 그 위에 홈 고유의 두 가지를 더 고정한다:
 *   ① **AI 가 없어도 화면이 찬다.** 서버는 덧칠이지 전제가 아니다.
 *   ② **화면이 계산하지 않는다.** 막대에 찍힌 퍼센트는 팩트팩 값 그대로여야 한다(C00 §H).
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import { computeChart, type Chart } from '../shared/lib/saju'
import { buildFactPack } from '../shared/interpret/ui'
import { HomePage } from './HomePage'

const chartOf = (day: number): Chart =>
  computeChart({
    calendarType: 'solar',
    year: 1990,
    month: 5,
    day,
    hour: 10,
    minute: 30,
    timeUnknown: false,
    gender: 'M',
    birthPlace: { region: 'KR' },
  })

/**
 * `client={null}` 로 서버를 끈다. 정적 렌더에서는 `useEffect` 가 돌지 않아 어차피 요청이
 * 나가지 않지만, 명시해 두면 이 테스트가 보는 것이 **AI 없는 경로**임이 분명해진다.
 * 서버 값이 도착했을 때의 판단은 `useHomeSummary.test.ts` 가 순수함수로 본다.
 */
const render = (chart: Chart): string =>
  renderToString(
    <TDSMobileAITProvider>
      <HomePage chart={chart} client={null} onOpenDetail={() => {}} onRestart={() => {}} />
    </TDSMobileAITProvider>,
  )

/** 일간은 열흘 주기라 이틀씩 띄우면 오행 다섯이 모두 나온다. */
const CHARTS = [1, 3, 5, 7, 9].map(chartOf)

describe('HomePage', () => {
  it('다섯 오행 전부에서 던지지 않는다', () => {
    const elements = new Set(CHARTS.map((c) => buildFactPack(c, { gender: 'M', mbti: null, blood: null }, 'fusion').saju.dayElement))
    expect(elements.size, '픽스처가 오행 다섯을 덮지 못한다').toBe(5)
    for (const chart of CHARTS) {
      expect(() => render(chart)).not.toThrow()
    }
  })

  /** AI 응답이 없는 경로. 여기가 비면 서버가 죽는 날 사용자는 빈 화면을 본다. */
  it('AI 요약 없이도 한 단어와 한 문장이 나온다', () => {
    const html = render(CHARTS[0]!)
    expect(html).toContain('한 단어로 말하면')
    // 규칙 기반 요약의 어휘(ELEMENT_WORD × GRADE_NOUN)가 실제로 문서에 실렸는지 본다.
    expect(html).toMatch(/뻗는|밝히는|품는|벼리는|스미는/)
    expect(html).toContain('타고난 기운의 분포')
  })

  /**
   * **화면이 계산하지 않는다.** 퍼센트를 화면에서 다시 구하면 팩트팩과 어긋나고,
   * 그 어긋남은 AI 가 인용하는 수치와 사용자가 보는 수치를 갈라놓는다.
   */
  it('막대의 퍼센트가 팩트팩 값 그대로다', () => {
    const chart = CHARTS[0]!
    const strength = buildFactPack(chart, { gender: 'M', mbti: null, blood: null }, 'fusion').saju.strength
    expect(strength, '픽스처에 신강신약이 없다').not.toBeNull()
    const html = render(chart)
    for (const [element, percent] of Object.entries(strength!.elementPercent)) {
      expect(html, `${element} ${percent}%`).toContain(`${percent}%`)
    }
  })

  it('오행 다섯 개의 막대가 모두 그려진다', () => {
    const html = render(CHARTS[0]!)
    for (const label of ['나무', '불', '흙', '쇠', '물']) {
      expect(html, label).toContain(label)
    }
  })

  /**
   * 자체 `BottomCTA` 로 갈아 끼운 뒤로는 **두 갈래 모두** 정적 렌더에 실린다.
   * TDS `FixedBottomCTA` 는 포털이라 SSR 에 본문이 없어 이 검사가 불가능했다.
   * 실제로 눌리는지·화면 안에 있는지는 여전히 실브라우저 `ui-smoke` 몫이다.
   */
  it('깊이읽기와 다시 입력 두 갈래를 모두 준다', () => {
    const html = render(CHARTS[0]!)
    expect(html).toContain('자세히 보기')
    expect(html).toContain('다시 입력')
  })
})
