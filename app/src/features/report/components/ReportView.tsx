import { List, ListRow, Paragraph, Spacing } from '@toss/tds-mobile'
import { formatSourceLabel } from '../../../shared/knowledge'
import { SECTION_TITLES } from '../../../shared/interpret/ui'
import type { RuleBasedReport } from '../buildReport'
import { SectionCard } from './SectionCard'
import { defaultInterpretationClient } from '../interpretationClient'
import { useInterpretation, type InterpretationClient } from '../useInterpretation'

/**
 * 리포트 표시.
 *
 * 근거: 문서10 §8(리포트 IA) — 헤드라인 → 섹션 → 오늘의 한 가지 → 근거.
 *
 * 이 컴포넌트는 **문장을 만들지 않는다.** 문장은 규칙 렌더러(`renderTemplateReport()`)가 만들었거나
 * 해석 서버가 만들었고, 여기서 하는 일은 제목을 붙이고 순서대로 그리는 것뿐이다
 * (§H: 계산과 서술이 만든 값을 화면이 고치지 않는다).
 *
 * 서버 해석은 **덧칠**이다. 규칙 기반 리포트가 먼저 그려지고, 서버 문장이 도착하면 갈아 끼운다.
 * 서버가 없거나(주소 미설정) 느리거나 실패하면 규칙 기반 그대로 남는다 — 사용자는 빈 화면을 보지 않는다.
 */
export interface ReportViewProps {
  report: RuleBasedReport
  /**
   * 해석 서버 클라이언트. 생략하면 빌드 설정(`VITE_INTERPRET_API_BASE`)을 보고 정한다.
   * `null` 을 명시하면 서버를 쓰지 않는다(테스트·미리보기).
   */
  client?: InterpretationClient | null
}

export function ReportView({ report, client }: ReportViewProps) {
  const resolvedClient = client === undefined ? defaultInterpretationClient() : client
  const view = useInterpretation(report, { client: resolvedClient })
  const { interpretation, usedCards } = view

  return (
    <section>
      <div style={{ padding: '0 24px' }}>
        <Paragraph typography="t5" fontWeight="bold">
          {interpretation.headline}
        </Paragraph>
      </div>

      <Spacing size={16} />

      {/*
        섹션 하나 = 카드 하나. 첫 장만 펼쳐 둔다 — 전부 접으면 화면이 제목 목록처럼 보여
        읽을 것이 없어 보이고, 전부 펼치면 예전의 문단 더미로 돌아간다.

        섹션별 근거 카드는 여기 없다. `InterpretationSection` 은 `id` 와 `body` 뿐이고
        인용 카드는 리포트 단위(`usedCardIds`)로만 온다. 아래 "참고한 자료" 가 그 자리다.
      */}
      {interpretation.sections.map((section, index) => (
        <SectionCard
          key={section.id}
          title={SECTION_TITLES[section.id]}
          body={section.body}
          defaultOpen={index === 0}
        />
      ))}

      <Spacing size={24} />

      <div style={{ padding: '0 24px' }}>
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--adaptiveGrey50)' }}>
          <Paragraph typography="st13" color="var(--adaptiveGrey700)">
            오늘 해볼 만한 한 가지
          </Paragraph>
          <Spacing size={4} />
          <Paragraph typography="st12" fontWeight="bold">
            {interpretation.actionToday}
          </Paragraph>
        </div>
      </div>

      {/*
        폴백 고지. 조용히 한 줄만 둔다 — 사용자가 알아야 할 것은 "지금 보고 있는 글이 어느 판인가"뿐이고,
        경고 배지로 키우면 실패하지도 않은 상황에서 불안을 만든다.
        서버를 아예 쓰지 않는 배포(`state === 'off'`)에서는 아무 말도 하지 않는다 — 폴백이 아니라 정상이다.
      */}
      {(view.state === 'loading' || view.state === 'fallback') && (
        <>
          <Spacing size={12} />
          <div style={{ padding: '0 24px' }}>
            <Paragraph typography="st13" color="var(--adaptiveGrey700)">
              {view.state === 'loading'
                ? '해석을 조금 더 다듬는 중이에요. 지금 글도 그대로 보셔도 좋아요.'
                : '지금은 기본 해석으로 보여 드리고 있어요.'}
            </Paragraph>
          </div>
        </>
      )}

      {/* 근거 표시. 어떤 카드에서 나온 문장인지 사용자·QA 가 되짚을 수 있어야 한다(문서10 §5.1 설명가능성). */}
      {usedCards.length > 0 && (
        <>
          <Spacing size={24} />
          <div style={{ padding: '0 24px' }}>
            <Paragraph typography="st12" fontWeight="bold">
              이 리포트가 참고한 자료
            </Paragraph>
          </div>
          <List>
            {usedCards.map((card) => (
              <ListRow
                key={card.id}
                verticalPadding="small"
                contents={
                  <ListRow.Texts
                    type="2RowTypeA"
                    top={card.title}
                    bottom={`${formatSourceLabel(card.source)} · 근거등급 ${card.confidence}`}
                  />
                }
              />
            ))}
          </List>
        </>
      )}
    </section>
  )
}
