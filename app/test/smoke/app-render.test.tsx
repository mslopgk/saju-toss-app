/**
 * 화면 스모크 테스트.
 *
 * 지금까지의 회귀는 전부 계산·데이터 계층이었다. "빌드가 통과한다"와 "화면이 실제로 그려진다"는
 * 다른 문제이고, 통합 검토가 지적했듯 배선이 빠져도 빌드는 통과한다.
 *
 * 브라우저 없이 확인하기 위해 `react-dom/server` 로 정적 렌더한다. jsdom 의존성을 추가하지 않는
 * 대신, 이벤트·레이아웃이 아니라 **트리가 예외 없이 그려지는가**와 **핵심 문구가 나오는가**만 본다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import App from '../../src/App'
import { DetailPage } from '../../src/pages/DetailPage'
import { buildRuleBasedReport } from '../../src/features/report'
import type { SelfReport } from '../../src/features/onboarding'
import { computeChart } from '../../src/shared/lib/saju'
import { formatSourceLabel } from '../../src/shared/knowledge'
import { SECTION_TITLES } from '../../src/shared/interpret/ui'
import type { SectionId } from '../../src/shared/interpret/ui'
import { SECTION_IDS } from '../../src/shared/interpret/schema'

function render(node: React.ReactElement): string {
  return renderToString(<TDSMobileAITProvider>{node}</TDSMobileAITProvider>)
}

describe('화면 스모크', () => {
  it('온보딩 화면이 예외 없이 렌더된다', () => {
    const html = render(<App />)
    expect(html.length).toBeGreaterThan(0)
  })

  it('결과 화면이 실제 계산 결과로 렌더되고 4기둥이 화면에 나온다', () => {
    // 1990-05-15 14:30 서울 남 — 엔진 회귀에서 검증된 입력
    const chart = computeChart({
      calendarType: 'solar',
      year: 1990,
      month: 5,
      day: 15,
      hour: 14,
      minute: 30,
      gender: 'M',
      timeUnknown: false,
      birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
    })

    const html = render(<DetailPage chart={chart} onBack={() => {}} />)

    // 계산 결과가 실제로 DOM 문자열에 박혀 있어야 한다.
    // (배선이 끊기면 빈 셸만 렌더되고 이 단언이 깨진다.)
    const ganji = [
      chart.pillars.year,
      chart.pillars.month,
      chart.pillars.day,
      chart.pillars.hour,
    ]
    for (const pillar of ganji) {
      if (pillar == null) continue
      expect(html).toContain(pillar.stem)
      expect(html).toContain(pillar.branch)
    }
  })

  it('결과 화면에 면책 고지가 노출된다', () => {
    const chart = computeChart({
      calendarType: 'solar',
      year: 2000,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      gender: 'F',
      timeUnknown: false,
      birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
    })

    const html = render(<DetailPage chart={chart} onBack={() => {}} />)

    // 법률 검토(연구문서 09)가 요구한 고지. 화면에서 사라지면 안 된다.
    expect(html).toMatch(/과학적|참고|재미/)
  })
})

/**
 * 규칙 기반 리포트 배선.
 *
 * "렌더러가 문장을 만든다"와 "그 문장이 화면에 있다"는 다른 문제다. 배선이 끊기면 렌더러 단위
 * 테스트는 전부 초록인 채로 결과 화면만 비어 있게 된다 — 그 상태를 여기서 실패로 고정한다.
 */
describe('리포트 렌더', () => {
  const RAW = {
    calendarType: 'solar',
    year: 1990,
    month: 5,
    day: 15,
    hour: 14,
    minute: 30,
    gender: 'M',
    timeUnknown: false,
    birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
  } as const

  const SELF: SelfReport = { mbti: 'ENFP', blood: 'O' }

  it('리포트 문장이 실제 HTML 에 들어간다', () => {
    const chart = computeChart(RAW)
    const report = buildRuleBasedReport(chart, SELF)
    const html = render(<DetailPage chart={chart} selfReport={SELF} onBack={() => {}} />)

    expect(report.interpretation.sections.length).toBeGreaterThan(0)
    expect(html).toContain(escapeHtml(report.interpretation.headline))
    expect(html).toContain(escapeHtml(report.interpretation.actionToday))
    for (const section of report.interpretation.sections) {
      // 문장 전문이 그대로 들어 있어야 한다(잘리거나 다른 값으로 바뀌면 깨진다).
      expect(html).toContain(escapeHtml(section.body))
    }
  })

  it('자기신고 값이 없으면 MBTI·혈액형 문장이 화면에 없다', () => {
    const chart = computeChart(RAW)
    const withProfile = buildRuleBasedReport(chart, SELF).interpretation
    const html = render(<DetailPage chart={chart} onBack={() => {}} />)

    const mbtiBody = withProfile.sections.find((s) => s.id === 'mbti')?.body ?? ''
    const bloodBody = withProfile.sections.find((s) => s.id === 'blood')?.body ?? ''
    expect(mbtiBody).not.toBe('')
    expect(bloodBody).not.toBe('')
    expect(html).not.toContain(escapeHtml(mbtiBody))
    expect(html).not.toContain(escapeHtml(bloodBody))
    // 사주 쪽 섹션은 그대로 있다
    expect(html).toContain('십신 배치')
  })

  it('신강신약·용신 섹션이 실제 HTML 에 들어간다', () => {
    const chart = computeChart(RAW)
    const report = buildRuleBasedReport(chart, SELF)
    const html = render(<DetailPage chart={chart} selfReport={SELF} onBack={() => {}} />)

    // 제목이 붙어 있다
    expect(html).toContain('신강신약과 용신')

    // 본문 전문이 그대로 들어 있다
    const body = report.interpretation.sections.find((s) => s.id === 'strength')?.body ?? ''
    expect(body).not.toBe('')
    expect(html).toContain(escapeHtml(body))

    // 화면에 박힌 값이 엔진 값과 같다 — 렌더러도 화면도 숫자를 고치지 않는다(C00 §H).
    const s = chart.strength
    expect(html).toContain(escapeHtml(String(s.strength.SI)))
    expect(html).toContain(escapeHtml(s.strength.grade))
    expect(html).toContain(escapeHtml(s.geokguk.name))
    expect(html).toContain(escapeHtml(s.yongsin.primary))
    expect(html).toContain(escapeHtml(s.strength.deuk.unseongIlji))
  })

  /**
   * 신살·별자리·융합 섹션 배선.
   *
   * 이 네 섹션은 **조건부**다 — 근거 카드가 검색 상한에 밀리거나 견줄 축이 없으면 조용히 사라진다.
   * 렌더러 테스트는 그 상태를 "정상"으로 통과시키므로(빈 섹션을 만들지 않는 게 설계다),
   * 실제 화면 HTML 에 제목과 본문이 다 들어갔는지는 여기서만 확인할 수 있다.
   */
  it('신살·별자리·융합 섹션이 실제 HTML 에 들어간다', () => {
    const chart = computeChart(RAW)
    const report = buildRuleBasedReport(chart, SELF)
    const html = render(<DetailPage chart={chart} selfReport={SELF} onBack={() => {}} />)

    const ids = report.interpretation.sections.map((s) => s.id)
    // 1990-05-15 14:30 서울 남 · ENFP · O형 은 네 섹션이 모두 서는 입력이다.
    // (융합 두 섹션 중 conflict 가 서는 사주다 — 세 축이 다 갈린다.)
    for (const id of ['sinsal', 'zodiac', 'conflict'] as const) {
      expect(ids, id).toContain(id)
      const body = report.interpretation.sections.find((s) => s.id === id)?.body ?? ''
      expect(body.length, id).toBeGreaterThan(0)
      expect(html, id).toContain(escapeHtml(body))
    }
    for (const title of [
      '여덟 글자에 붙은 이름표(신살)',
      '별자리',
      '그런데 딱 하나, 어긋나는 지점',
    ]) {
      expect(html, title).toContain(escapeHtml(title))
    }

    // 신살은 엔진이 판정한 이름만 화면에 나온다(카드가 있는 것만 말하므로 부분집합이다).
    const shown = chart.sinsal.sinsal.filter((s) => html.includes(escapeHtml(s.name)))
    expect(shown.length).toBeGreaterThan(0)
    // 별자리는 엔진이 계산한 사인 이름이 그대로 박힌다.
    expect(html).toContain(escapeHtml(chart.astro.sun.signKo))
  })

  /**
   * **열한 섹션 전량 배선.** 위 테스트들은 섹션을 하나씩 이름으로 집는다 — 그래서 새 섹션이 늘어나면
   * 그 섹션만 아무도 보지 않는 상태가 된다(빈 섹션을 만들지 않는 게 설계라 렌더러 테스트도 통과한다).
   *
   * 여기서는 `SECTION_IDS` 를 정본으로 훑고 제목은 `SECTION_TITLES` 에서 가져온다 — 문구를 이 파일에
   * 베끼지 않으므로 카피가 바뀌어도 두 곳을 고칠 일이 없고, 반대로 **제목이 빠진 섹션**은 바로 걸린다.
   *
   * 가로지르는 두 섹션은 축이 일치했는지 갈렸는지에 따라 하나씩만 서므로 두 사주의 **합집합**으로 본다.
   */
  it('열한 섹션이 모두 제목과 본문으로 화면에 도달한다(두 사주 합집합)', () => {
    const INTERSECTION_RAW = {
      ...RAW,
      year: 1993,
      month: 5,
      day: 16,
      timeUnknown: true,
      hour: undefined,
      minute: undefined,
    } as const
    const cases: readonly { readonly raw: typeof RAW; readonly self: SelfReport }[] = [
      { raw: RAW, self: SELF },
      { raw: INTERSECTION_RAW, self: { mbti: 'INTJ', blood: 'A' } },
    ]

    const drawn = new Set<SectionId>()
    for (const { raw, self } of cases) {
      const chart = computeChart(raw)
      const report = buildRuleBasedReport(chart, self)
      const html = render(<DetailPage chart={chart} selfReport={self} onBack={() => {}} />)
      for (const section of report.interpretation.sections) {
        const title = SECTION_TITLES[section.id]
        if (html.includes(escapeHtml(title)) && html.includes(escapeHtml(section.body))) {
          drawn.add(section.id)
        }
      }
    }
    for (const id of SECTION_IDS) expect(drawn.has(id), id).toBe(true)
    expect(drawn.size).toBe(SECTION_IDS.length)
  })

  /**
   * 근거 표시는 제목만으로 부족하다 — 출처와 근거등급이 함께 나와야 "어떤 자료의 어느 절인지"를
   * 되짚을 수 있다(문서10 §5.1 설명가능성). 세 조각 중 하나만 빠져도 그 줄은 근거 구실을 못 한다.
   */
  /**
   * 근거 카드는 **화면에 그리지 않는다**(대표님 판단). 추적이 사라진 것은 아니다 —
   * `usedCards` 는 그대로 만들어지고 서버의 인용 검증도 그대로다.
   * 여기서는 화면에 안 나온다는 사실만 고정한다. 되살아나면 아래 유출 가드가 다시 필요해진다.
   */
  it('근거 카드 목록을 화면에 그리지 않는다', () => {
    const chart = computeChart(RAW)
    const report = buildRuleBasedReport(chart, SELF)
    const html = render(<DetailPage chart={chart} selfReport={SELF} onBack={() => {}} />)

    expect(report.usedCards.length).toBeGreaterThan(0)
    expect(html).not.toContain('이 리포트가 참고한 자료')
    expect(html).not.toContain('근거등급')
  })

  /**
   * 출처 표기에 **저장소 파일명이 들어가지 않는다.**
   *
   * 한동안 `C04-…-룩업테이블.md §7-12 §12-1 (+ tables.json gosinGwasuk)` 가 결과 화면에 그대로
   * 찍히고 있었다. 화면에 나오는 문자열이라 타입도 테스트도 막지 못했고, 스토어 스크린샷을 찍다가
   * 눈으로 발견했다. 파일명이 `doc` 과 `section` **양쪽**에 있어서 한쪽만 고쳤을 때도 통과했다.
   *
   * 근거 목록을 화면에서 뺀 뒤로 "HTML 에 없다" 는 단언은 **아무것도 지키지 않는다**(안 그리니
   * 언제나 참이다). 그래서 화면이 아니라 **표시 함수**를 지킨다 — 누군가 다시 출처를 그리는
   * 순간 이 가드가 그대로 유효하다.
   */
  it('출처 표기 함수가 파일 확장자·디렉터리를 흘리지 않는다', () => {
    const chart = computeChart(RAW)
    const report = buildRuleBasedReport(chart, SELF)

    expect(report.retrievedCards.length).toBeGreaterThan(0)
    for (const card of report.retrievedCards) {
      const label = formatSourceLabel(card.source)
      expect(label, `${card.id} 원본 파일명`).not.toContain(card.source.doc)
      expect(label, `${card.id} 확장자`).not.toMatch(/\.(md|json)\b/)
      expect(label, `${card.id} 경로`).not.toMatch(/[/\\]/)
    }
  })

  it('교집합 섹션도 화면까지 도달한다(그 섹션이 서는 사주에서)', () => {
    // 1993-05-16 시각 모름 · INTJ · A형 — 일간(壬水)과 월지(巳火)가 갈리고, 그중 한 축이 일치한다.
    const chart = computeChart({ ...RAW, year: 1993, month: 5, day: 16, timeUnknown: true, hour: undefined, minute: undefined })
    const self: SelfReport = { mbti: 'INTJ', blood: 'A' }
    const report = buildRuleBasedReport(chart, self)
    const html = render(<DetailPage chart={chart} selfReport={self} onBack={() => {}} />)

    const body = report.interpretation.sections.find((s) => s.id === 'intersection')?.body ?? ''
    expect(body).not.toBe('')
    expect(html).toContain(escapeHtml('네 체계가 공통으로 가리키는 당신'))
    expect(html).toContain(escapeHtml(body))
  })
})

/** `renderToString` 은 텍스트 노드의 `&`·`<`·`>`·따옴표를 이스케이프한다. 단언 문자열도 같은 변환을 거친다. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}
