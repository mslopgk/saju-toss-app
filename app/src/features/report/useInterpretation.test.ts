/**
 * 서버 해석 배선의 **판단부** 테스트.
 *
 * 이 프로젝트의 컴포넌트 테스트는 `react-dom/server` 정적 렌더라 `useEffect` 가 돌지 않는다.
 * 그래서 판단을 순수 함수(`adoptOutcome`·`reportRequestKey`·`resolveCards`)로 내려 두고 여기서 본다.
 * 훅이 하는 나머지 일은 그 결과를 상태에 넣는 것뿐이다.
 */

import { describe, expect, it } from 'vitest'

import { computeChart } from '../../shared/lib/saju'
import { CARDS } from '../../shared/knowledge'
import { buildRuleBasedReport, resolveCards, type ReportSource } from './buildReport'
import { adoptInterpretation, adoptOutcome, reportRequestKey } from './useInterpretation'
import { resolveApiBase } from './interpretationClient'
import type { Interpretation } from '../../shared/interpret/ui'

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

const report = buildRuleBasedReport(chart, { mbti: 'INTJ', blood: 'A' })

const SERVER_VALUE: Interpretation = {
  headline: '서버가 쓴 헤드라인',
  sections: [
    { id: 'saju', body: '서버 본문입니다.' },
    { id: 'strength', body: '서버 본문 2 입니다.' },
  ],
  actionToday: '오늘은 30분만 미리 정해 보세요.',
  usedCardIds: [report.retrievedCards[0]?.id ?? 'ilgan:丙'],
}

describe('리포트가 자기 입력을 들고 다닌다', () => {
  it('source 가 서버에 보낼 모양 그대로다', () => {
    expect(report.source.kind).toBe('fusion')
    expect(report.source.chart.pillars.gz8).toBe(chart.pillars.gz8)
    expect(report.source.profile).toEqual({ gender: 'M', mbti: 'INTJ', blood: 'A' })
  })

  it('검색해 온 카드 전량을 남긴다(LLM 인용 id 를 되짚기 위해)', () => {
    expect(report.retrievedCards.length).toBeGreaterThanOrEqual(report.usedCards.length)
  })
})

describe('reportRequestKey', () => {
  it('같은 입력이면 같은 키다(렌더마다 재요청하지 않는다)', () => {
    const again = buildRuleBasedReport(chart, { mbti: 'INTJ', blood: 'A' })
    expect(reportRequestKey(again.source)).toBe(reportRequestKey(report.source))
  })

  it('자기신고가 바뀌면 키가 바뀐다', () => {
    const other = buildRuleBasedReport(chart, { mbti: 'ENFP', blood: 'A' })
    expect(reportRequestKey(other.source)).not.toBe(reportRequestKey(report.source))
  })

  it('차트가 바뀌면 키가 바뀐다', () => {
    const otherChart = computeChart({
      calendarType: 'solar',
      year: 1991,
      month: 7,
      day: 2,
      hour: 9,
      minute: 0,
      gender: 'F',
      timeUnknown: false,
      birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
    })
    const other = buildRuleBasedReport(otherChart, { mbti: 'INTJ', blood: 'A' })
    expect(reportRequestKey(other.source)).not.toBe(reportRequestKey(report.source))
  })

  it('키에 이름·기기 식별자가 들어가지 않는다', () => {
    const key = reportRequestKey(report.source)
    expect(key).not.toContain('undefined')
    expect(key.split('|').length).toBeGreaterThan(5)
  })
})

describe('adoptOutcome — 실패는 전부 폴백 하나로 모인다', () => {
  it('정상 응답은 채택한다', () => {
    const result = adoptOutcome({ status: 'ok', source: 'llm', value: SERVER_VALUE })
    expect(result.kind).toBe('adopt')
    if (result.kind !== 'adopt') return
    expect(result.origin).toBe('llm')
    expect(result.value.headline).toBe('서버가 쓴 헤드라인')
  })

  it('캐시 응답은 origin 이 cache 다', () => {
    const result = adoptOutcome({ status: 'ok', source: 'cache', value: SERVER_VALUE })
    expect(result.kind === 'adopt' && result.origin).toBe('cache')
  })

  it('거부·오류는 폴백', () => {
    expect(adoptOutcome({ status: 'rejected' }).kind).toBe('fallback')
    expect(adoptOutcome({ status: 'error', code: 'NETWORK' }).kind).toBe('fallback')
    expect(adoptOutcome({ status: 'error', code: 'TIMEOUT' }).kind).toBe('fallback')
    expect(adoptOutcome({ status: 'error', code: 'RATE_LIMITED' }).kind).toBe('fallback')
  })

  it('제목표에 없는 섹션 id 는 버린다', () => {
    const mixed: Interpretation = {
      ...SERVER_VALUE,
      sections: [
        { id: 'saju', body: '남는다' },
        { id: 'unknown_section' as never, body: '버려진다' },
      ],
    }
    const adopted = adoptInterpretation(mixed)
    expect(adopted?.sections.map((s) => s.id)).toEqual(['saju'])
  })

  it('쓸 섹션이 하나도 안 남으면 폴백', () => {
    const useless: Interpretation = {
      ...SERVER_VALUE,
      sections: [{ id: 'nope' as never, body: '제목이 없다' }],
    }
    expect(adoptInterpretation(useless)).toBeNull()
    expect(adoptOutcome({ status: 'ok', source: 'llm', value: useless }).kind).toBe('fallback')
  })
})

describe('resolveCards', () => {
  it('인용된 id 를 카드로 되돌린다', () => {
    const first = CARDS[0]
    if (first === undefined) throw new Error('지식베이스가 비었다')
    expect(resolveCards([first.id], [])).toEqual([first])
  })

  it('없는 id 는 조용히 버린다(없는 근거를 만들지 않는다)', () => {
    expect(resolveCards(['그런:카드는:없다'], [])).toEqual([])
  })

  it('중복 id 는 한 번만 넣는다', () => {
    const first = CARDS[0]
    if (first === undefined) throw new Error('지식베이스가 비었다')
    expect(resolveCards([first.id, first.id], [])).toHaveLength(1)
  })

  it('순서는 인용 순서를 따른다', () => {
    const [a, b] = CARDS
    if (a === undefined || b === undefined) throw new Error('지식베이스가 비었다')
    expect(resolveCards([b.id, a.id], []).map((c) => c.id)).toEqual([b.id, a.id])
  })
})

describe('resolveApiBase — 기본은 서버를 쓰지 않는다', () => {
  it('비어 있으면 null(네트워크 시도조차 하지 않는다)', () => {
    expect(resolveApiBase(undefined)).toBeNull()
    expect(resolveApiBase('')).toBeNull()
    expect(resolveApiBase('   ')).toBeNull()
    expect(resolveApiBase(123)).toBeNull()
  })

  it('http/https 주소만 받는다', () => {
    expect(resolveApiBase('https://api.example.com')).toBe('https://api.example.com')
    expect(resolveApiBase('http://localhost:8787/')).toBe('http://localhost:8787')
    expect(resolveApiBase('api.example.com')).toBeNull()
    expect(resolveApiBase('javascript:alert(1)')).toBeNull()
  })
})

describe('ReportSource 는 서버 요청 본문과 같은 모양이다', () => {
  it('kind·chart·profile 세 키뿐이다', () => {
    const source: ReportSource = report.source
    expect(Object.keys(source).sort()).toEqual(['chart', 'kind', 'profile'])
  })
})
