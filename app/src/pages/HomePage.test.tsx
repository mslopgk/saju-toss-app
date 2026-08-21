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
    // 규칙 기반 요약의 어휘(ELEMENT_WORD × GRADE_NOUN)가 실제로 문서에 실렸는지 본다.
    expect(html).toMatch(/뻗는|밝히는|품는|벼리는|스미는/)
    // 오행 분포는 깊이읽기로 옮겼다 — 홈에는 없어야 한다.
    expect(html).not.toContain('다섯을 합치면 80점이 됩니다')
  })

  /**
   * 홈은 **네 덩어리**다: 간지 칩 · 오브젝트 · 한 단어 · 한 문장.
   *
   * 앞 판은 여기에 오행 분포 막대 다섯과 퍼센트 다섯, 캡션까지 있어 정보가 열두 덩어리였고
   * 처음 만나는 화면이 대시보드처럼 보였다. 방향으로 받은 Jamo 앱은 홈에 데이터 시각화를
   * 두지 않는다. 이 검사가 그 결정을 고정한다 — 되돌아오면 여기서 먼저 걸린다.
   */
  it('오행 분포를 홈에 그리지 않는다', () => {
    // **보이는 글자만 본다.** HTML 전체에 `/\d+%/` 를 걸면 emotion 이 심은 CSS 의 `50%` 에
    // 걸린다 — `ReadingScreen.test.tsx` 에서 같은 함정에 한 번 빠졌다.
    const visible = render(CHARTS[0]!)
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, '')
    expect(visible).not.toMatch(/\d+%/)
    expect(visible).not.toContain('나무')
    expect(visible).not.toContain('다섯을 합치면')
  })

  it('일주 간지를 작은 칩으로 보여 준다', () => {
    const chart = CHARTS[0]!
    expect(render(chart)).toContain(chart.pillars.day.ganji)
  })

  it('깊이읽기와 다시 입력 두 갈래를 모두 준다', () => {
    const html = render(CHARTS[0]!)
    expect(html).toContain('자세히 보기')
    expect(html).toContain('다시 입력')
  })
})
