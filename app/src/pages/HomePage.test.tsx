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
import { buildFactPack, type SummaryValue } from '../shared/interpret/ui'
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

const render = (chart: Chart, summary?: SummaryValue): string =>
  renderToString(
    <TDSMobileAITProvider>
      <HomePage
        chart={chart}
        {...(summary === undefined ? {} : { summary })}
        onOpenDetail={() => {}}
        onRestart={() => {}}
      />
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

  it('AI 요약이 오면 그 값이 규칙 기반 값을 덮는다', () => {
    const summary: SummaryValue = {
      word: '고요한 불',
      sentence: '스스로를 먼저 태워 주변을 밝히고, 다 타기 전에 한 번 멈추는 사람입니다.',
      usedCardIds: ['X'],
    }
    const html = render(CHARTS[0]!, summary)
    expect(html).toContain('고요한 불')
    expect(html).toContain('다 타기 전에 한 번 멈추는')
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
   * TDS `FixedBottomCTA` 는 포털이라 SSR 에 본문이 실리지 않는다(`CompatPage.test.tsx` 에 같은 note).
   * 그래서 여기서 볼 수 있는 것은 정적으로 그려지는 "다시 입력하기" 뿐이고,
   * 깊이읽기 CTA 가 실제로 눌리는지는 실브라우저 `ui-smoke` 가 본다.
   */
  it('다시 입력 갈래가 정적으로 그려진다', () => {
    expect(render(CHARTS[0]!)).toContain('다시 입력하기')
  })
})
