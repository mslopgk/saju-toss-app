/**
 * 궁합 화면 렌더 스모크.
 *
 * jsdom 없이 `react-dom/server` 로 정적 렌더한다(`BirthDateSheet.test.tsx` 와 같은 이유).
 * 여기서 볼 수 있는 것은 **"던지지 않는다" 와 "화면에 실제로 나온 글자"** 두 가지다.
 * 판정 로직은 전부 순수 함수로 내려가 있고(`shared/lib/compat` · `buildCompatReport`),
 * 그쪽 테스트가 값을 본다.
 *
 * 이 파일이 필요한 이유: 렌더 중 예외는 오류 화면이 아니라 **흰 화면**으로 나타난다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import { computeChart, type Chart, type Gender } from '../shared/lib/saju'
import { computeCompatibility } from '../shared/lib/compat'
import { CompatReportView, buildCompatReport } from '../features/compat'
import { CompatPage } from './CompatPage'
import { ResultPage } from './ResultPage'

const chartOf = (
  year: number,
  month: number,
  day: number,
  gender: Gender,
  timeUnknown = false,
): Chart =>
  computeChart({
    calendarType: 'solar',
    year,
    month,
    day,
    ...(timeUnknown ? {} : { hour: 10, minute: 30 }),
    timeUnknown,
    gender,
    birthPlace: { region: 'KR' },
  })

const SELF = chartOf(1990, 5, 15, 'M')
const PARTNER = chartOf(1992, 11, 3, 'F')

const render = (node: Parameters<typeof renderToString>[0]): string =>
  renderToString(<TDSMobileAITProvider>{node}</TDSMobileAITProvider>)

describe('CompatPage — 상대방 입력 화면', () => {
  it('던지지 않고, 첫 사람을 다시 묻지 않는다', () => {
    let html = ''
    expect(() => {
      html = render(
        <CompatPage selfChart={SELF} selfProfile={{ mbti: 'ENFP', blood: 'O' }} onBack={() => {}} />,
      )
    }).not.toThrow()
    expect(html).toContain('상대방은 언제 태어났나요?')
    expect(html).toContain('내 정보는 이미 받았으니 다시 묻지 않아요')
  })

  it('토스 프리필 버튼을 두지 않는다 — 그 경로는 사용자 **본인**의 생년월일을 채운다', () => {
    const html = render(
      <CompatPage selfChart={SELF} selfProfile={{ mbti: null, blood: null }} onBack={() => {}} />,
    )
    expect(html).not.toContain('토스')
  })

  it('혈액형 근거 없음을 입력 단계에서도 미리 밝힌다', () => {
    const html = render(
      <CompatPage selfChart={SELF} selfProfile={{ mbti: null, blood: null }} onBack={() => {}} />,
    )
    expect(html).toContain('혈액형 궁합은 과학적 근거가 없어요')
  })
})

describe('CompatReportView — 결과 표시', () => {
  const cases = [
    ['전 축 입력', { mbti: 'ENFP', blood: 'O' }, { mbti: 'INFJ', blood: 'A' }],
    ['자기신고 없음', { mbti: null, blood: null }, { mbti: null, blood: null }],
    ['한쪽만 입력', { mbti: 'INTJ', blood: null }, { mbti: null, blood: 'B' }],
  ] as const

  it.each(cases)('%s 이어도 던지지 않는다', (_name, pa, pb) => {
    const result = computeCompatibility(SELF, PARTNER, pa, pb)
    const report = buildCompatReport(result)
    expect(() => render(<CompatReportView result={result} report={report} />)).not.toThrow()
  })

  it('점수·등급·면책이 화면에 실제로 나온다', () => {
    const result = computeCompatibility(SELF, PARTNER, { mbti: 'ENFP', blood: 'O' }, { mbti: 'INFJ', blood: 'A' })
    const html = render(<CompatReportView result={result} report={buildCompatReport(result)} />)
    expect(html).toContain(`${result.score}점`)
    expect(html).toContain(result.band.name)
    expect(html).toContain('혈액형 궁합은 과학적 근거가 없습니다')
    expect(html).toContain(result.version)
  })

  it('삼주(생시 모름) 상대와도 던지지 않는다', () => {
    const noTime = chartOf(1988, 2, 29, 'F', true)
    const result = computeCompatibility(SELF, noTime, { mbti: null, blood: 'A' }, { mbti: 'ISTJ', blood: 'O' })
    expect(() => render(<CompatReportView result={result} report={buildCompatReport(result)} />)).not.toThrow()
  })
})

describe('ResultPage — 궁합 진입점', () => {
  /**
   * TDS `FixedBottomCTA` 는 SSR 에서 본문을 그리지 않는다(포털). 그래서 CTA **문구**는
   * 여기서 확인할 수 없고, 확인할 수 있는 것은 두 가지다:
   *   ① 궁합 CTA 를 붙인 뒤에도 결과 화면이 여전히 던지지 않는다
   *   ② 궁합 화면이 **지연 경계 뒤에 있다** — 결과 화면 첫 렌더에 상대방 입력 폼이 섞이지 않는다
   */
  it('궁합 CTA 를 붙여도 결과 화면이 던지지 않는다', () => {
    let html = ''
    expect(() => {
      html = render(<ResultPage chart={SELF} onRestart={() => {}} />)
    }).not.toThrow()
    expect(html).toContain('당신의 사주 네 기둥')
    expect(html).toContain('계산 근거')
  })

  it('궁합 화면은 지연 경계 뒤에 있다 — 첫 렌더에 상대방 입력이 섞이지 않는다', () => {
    const html = render(<ResultPage chart={SELF} onRestart={() => {}} />)
    expect(html).not.toContain('상대방은 언제 태어났나요?')
  })
})
