/**
 * 폴백 고지 렌더 스모크.
 *
 * jsdom 없이 `react-dom/server` 로 정적 렌더한다(`BirthDateSheet.test.tsx` 와 같은 이유).
 * 그래서 `useEffect` 는 돌지 않고, 여기서 볼 수 있는 것은 **초기 상태의 화면**이다:
 *   - 서버를 쓰지 않는 배포(`client={null}`) → 고지가 없다(폴백이 아니라 정상이다)
 *   - 서버를 쓰는 배포 → 첫 프레임은 "다듬는 중" 고지
 * 응답이 온 뒤의 분기(`fallback`/`done`)는 `useInterpretation.test.ts` 가 순수 함수로 본다.
 */

import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'

import { computeChart } from '../../../shared/lib/saju'
import { buildRuleBasedReport } from '../buildReport'
import { ReportView } from './ReportView'
import type { InterpretationClient } from '../useInterpretation'

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

/** 절대 완료되지 않는 클라이언트 — 첫 프레임만 보기 위해서다. */
const pendingClient: InterpretationClient = {
  interpret: () => new Promise(() => undefined),
}

function render(client: InterpretationClient | null): string {
  return renderToString(
    <TDSMobileAITProvider>
      <ReportView report={report} client={client} />
    </TDSMobileAITProvider>,
  )
}

describe('ReportView — 폴백 고지', () => {
  it('서버를 쓰지 않으면 고지가 없다', () => {
    const html = render(null)
    expect(html).not.toContain('기본 해석으로')
    expect(html).not.toContain('다듬는 중')
  })

  it('규칙 기반 문장은 언제나 먼저 그려진다', () => {
    for (const client of [null, pendingClient]) {
      const html = render(client)
      expect(html).toContain(report.interpretation.headline)
      expect(html).toContain('오늘 해볼 만한 한 가지')
    }
  })

  it('서버를 쓰는 배포의 첫 프레임은 "다듬는 중" 고지다', () => {
    expect(render(pendingClient)).toContain('다듬는 중')
  })

  it('어느 경우에도 시스템 프롬프트가 화면에 나오지 않는다', () => {
    for (const client of [null, pendingClient]) {
      const html = render(client)
      for (const needle of ['사실 규율', '출력 계약', 'knowledge_cards', 'fact_pack']) {
        expect(html).not.toContain(needle)
      }
    }
  })
})
