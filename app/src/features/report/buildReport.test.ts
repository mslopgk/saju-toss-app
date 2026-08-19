/**
 * 리포트 조립 배선 검증.
 *
 * `template.test.ts` 가 렌더러 자체를 보고, 여기서는 **화면이 실제로 부르는 경로**를 본다:
 * 상한이 넓혀져 사주 섹션 셋이 다 살아 있는지, 근거 카드 목록이 문장과 맞는지, 빈 리포트를 알아채는지.
 */

import { describe, expect, it } from 'vitest'

import { computeChart, type RawBirthInput } from '../../shared/lib/saju'
import { CARDS } from '../../shared/knowledge'
import {
  NO_SELF_REPORT,
  buildRuleBasedReport,
  hasReportContent,
  type ReportProfile,
} from './buildReport'

const SEOUL = { latitude: 37.5665, longitude: 126.9784204 }

const RAW: RawBirthInput = {
  calendarType: 'solar',
  year: 1990,
  month: 5,
  day: 15,
  hour: 14,
  minute: 30,
  timeUnknown: false,
  gender: 'M',
  birthPlace: SEOUL,
}

const SELF: ReportProfile = { mbti: 'ENFP', blood: 'O' }

describe('buildRuleBasedReport', () => {
  it('성별을 차트에서 읽어 온다(호출부가 두 번 넘기지 않는다)', () => {
    const report = buildRuleBasedReport(computeChart({ ...RAW, gender: 'F' }), NO_SELF_REPORT)
    // 성별은 대운 방향 판정에 이미 쓰였다. 리포트는 그 차트를 그대로 받는다.
    expect(report.interpretation.sections.length).toBeGreaterThan(0)
  })

  it('상한을 넓혀 계산만으로 서는 섹션이 모두 살아 있다', () => {
    // 상한이 좁으면 정렬 뒤쪽 카드가 잘리고, 잘린 자리가 유일한 근거였던 섹션이 조용히 사라진다.
    const report = buildRuleBasedReport(computeChart(RAW), NO_SELF_REPORT)
    const ids = report.interpretation.sections.map((s) => s.id)
    for (const id of ['saju', 'sipsin', 'jiji', 'sinsal', 'strength', 'luck', 'zodiac']) {
      expect(ids, id).toContain(id)
    }
  })

  it('자기신고 값이 있으면 네 체계를 가로지르는 섹션까지 선다', () => {
    const report = buildRuleBasedReport(computeChart(RAW), SELF)
    const ids = report.interpretation.sections.map((s) => s.id)
    expect(ids).toContain('mbti')
    expect(ids).toContain('blood')
    // 교집합·충돌 중 최소 하나 — 견줄 축이 있으면 일치했거나 갈렸거나 둘 중 하나다.
    expect(ids.includes('intersection') || ids.includes('conflict')).toBe(true)
  })

  it('신살·별자리 카드가 실제 근거 목록에 들어온다', () => {
    const chart = computeChart(RAW)
    const report = buildRuleBasedReport(chart, SELF)
    const ids = report.usedCards.map((c) => c.id)
    expect(ids).toContain(`zodiac:${chart.astro.sun.signId}`)
    expect(ids).toContain(`zodiac:원소:${chart.astro.sun.element}`)
    const engineSinsal = new Set(chart.sinsal.sinsal.map((s) => s.name))
    const citedSinsal = ids.filter((id) => id.startsWith('sinsal:'))
    expect(citedSinsal.length).toBeGreaterThan(0)
    // 엔진이 판정하지 않은 신살은 근거가 될 수 없다.
    for (const id of citedSinsal) expect(engineSinsal.has(id.slice('sinsal:'.length)), id).toBe(true)
  })

  it('S5 근거 카드가 실제로 근거 목록에 들어온다', () => {
    const chart = computeChart(RAW)
    const report = buildRuleBasedReport(chart, SELF)
    const ids = report.usedCards.map((c) => c.id)
    expect(ids).toContain(`unseong:${chart.strength.strength.deuk.unseongIlji}`)
    expect(ids).toContain(`yongsin:격국:${chart.strength.geokguk.name}`)
    // 십이운성·격국·용신 카드는 예전에 조회 축이 없어 한 장도 도달하지 못하던 것들이다
    expect(report.usedCards.some((c) => c.kind === 'unseong')).toBe(true)
    expect(report.usedCards.some((c) => c.kind === 'yongsin')).toBe(true)
  })

  it('usedCards 가 usedCardIds 와 정확히 맞물린다', () => {
    const report = buildRuleBasedReport(computeChart(RAW), SELF)
    expect(report.usedCards.map((c) => c.id).sort()).toEqual(
      [...report.interpretation.usedCardIds].sort(),
    )
    // 근거 표시에 필요한 필드가 다 있다
    for (const card of report.usedCards) {
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.source.doc.length).toBeGreaterThan(0)
      expect(card.confidence).toMatch(/^[ABCD]$/)
    }
  })

  it('검색됐지만 쓰이지 않은 카드 수를 보고한다', () => {
    const report = buildRuleBasedReport(computeChart(RAW), SELF)
    // 그룹 태그로 뽑힌 다른 십신·MBTI 축 카드 등은 서술 슬롯이 없어 남는다. 음수가 되면 계산이 틀린 것이다.
    expect(report.unusedCardCount).toBeGreaterThanOrEqual(0)
  })

  it('지식베이스가 비면 계산값만으로 서는 두 섹션이 남고, 그때도 리포트는 "있다"고 본다', () => {
    const report = buildRuleBasedReport(computeChart(RAW), SELF, [])
    expect(report.interpretation.sections.map((s) => s.id)).toEqual(['strength', 'luck'])
    expect(report.usedCards).toEqual([])
    expect(hasReportContent(report)).toBe(true)
  })

  it('결정론 — 같은 입력이면 문자 단위로 같다', () => {
    const a = buildRuleBasedReport(computeChart(RAW), SELF)
    const b = buildRuleBasedReport(computeChart(RAW), SELF)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('자기신고 값이 리포트를 늘린다(모름 → 8섹션, 입력 → 10섹션)', () => {
    const bare = buildRuleBasedReport(computeChart(RAW), NO_SELF_REPORT)
    const full = buildRuleBasedReport(computeChart(RAW), SELF)
    /*
     * 자기신고가 없어도 8 섹션이 선다 — 계산만으로 서는 7 에 `conflict` 하나가 더 붙는다.
     * 이 사주(庚金 일간 · 巳火 월지)는 **사주 안쪽만으로** 견줄 축이 하나 성립하고 그 축이 갈리기
     * 때문이다(문서10 §3.3 「사주 내부 상충」). 가로지르는 섹션이 MBTI 전용이 아니라는 뜻이다.
     * 자기신고를 주면 mbti·blood 두 장이 더 붙어 10 이 된다.
     */
    expect(bare.interpretation.sections).toHaveLength(8)
    expect(full.interpretation.sections).toHaveLength(10)
    // 늘어난 섹션은 자기신고에 매인 것들뿐이다 — 계산 섹션의 내용은 그대로다.
    const bareIds = bare.interpretation.sections.map((s) => s.id)
    for (const id of bareIds) expect(full.interpretation.sections.map((s) => s.id)).toContain(id)
  })

  it('기본 지식베이스는 실제 카드 198장이다(주입 인자는 테스트용 구멍일 뿐)', () => {
    expect(CARDS.length).toBe(198)
    const injected = buildRuleBasedReport(computeChart(RAW), SELF, CARDS)
    const defaulted = buildRuleBasedReport(computeChart(RAW), SELF)
    expect(JSON.stringify(injected)).toBe(JSON.stringify(defaulted))
  })
})
