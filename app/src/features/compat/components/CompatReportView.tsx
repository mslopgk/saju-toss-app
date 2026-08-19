import { Badge, List, ListRow, Paragraph, Spacing } from '@toss/tds-mobile'
import { formatSourceLabel } from '../../../shared/knowledge'
import type { CompatResult } from '../../../shared/lib/compat'
import { COMPAT_SECTION_TITLES } from '../copy'
import type { CompatReport } from '../buildCompatReport'

/**
 * 궁합 결과 표시.
 *
 * 이 컴포넌트는 **문장도 숫자도 만들지 않는다.** 문장은 `buildCompatReport()` 가, 점수는
 * `computeCompatibility()` 가 이미 만들었고 여기서는 제목을 붙여 순서대로 그릴 뿐이다
 * (C00 §S8-4 · §H: 화면은 계산·서술 결과를 고치지 않는다).
 */
export interface CompatReportViewProps {
  result: CompatResult
  report: CompatReport
}

/** 배점 막대 하나. 항목별 `score / cap` 을 그대로 그린다 */
function ItemBar({ label, score, cap }: { label: string; score: number; cap: number }) {
  const ratio = cap === 0 ? 0 : Math.max(0, Math.min(1, score / cap))
  return (
    <div style={{ padding: '6px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <Paragraph typography="st13" color="var(--adaptiveGrey700)">
          {label}
        </Paragraph>
        <Paragraph typography="st13" fontWeight="bold">
          {Number.isInteger(score) ? score : score.toFixed(1)} / {cap}
        </Paragraph>
      </div>
      <Spacing size={4} />
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--adaptiveGrey200)',
          overflow: 'hidden',
        }}
        role="img"
        aria-label={`${label} ${score} / ${cap}점`}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            borderRadius: 3,
            background: 'var(--adaptiveBlue500)',
          }}
        />
      </div>
    </div>
  )
}

export function CompatReportView({ result, report }: CompatReportViewProps) {
  return (
    <section>
      <div style={{ padding: '0 24px', textAlign: 'center' }}>
        <Paragraph typography="st12" color="var(--adaptiveGrey700)">
          두 사람의 궁합
        </Paragraph>
        <Spacing size={6} />
        <Paragraph typography="t2" fontWeight="bold">
          {result.score}점
        </Paragraph>
        <Spacing size={6} />
        <Badge size="medium" variant="weak" color="blue">
          {result.band.tag} · {result.band.name}
        </Badge>
        <Spacing size={10} />
        <Paragraph typography="st12">{report.summary}</Paragraph>
      </div>

      {report.missingAxisNote !== null && (
        <>
          <Spacing size={12} />
          <div style={{ padding: '0 24px' }}>
            <Paragraph typography="st13" color="var(--adaptiveGrey700)">
              {report.missingAxisNote}
            </Paragraph>
          </div>
        </>
      )}

      <Spacing size={24} />

      {/* 사주 6항목. 점수는 전부 엔진 값 그대로다 */}
      <div style={{ padding: '0 24px' }}>
        <Paragraph typography="st11" fontWeight="bold">
          사주 궁합 {Number(result.saju.total.toFixed(1))}점 / 100점
        </Paragraph>
        <Spacing size={6} />
        {result.saju.items.map((item) => (
          <ItemBar key={item.id} label={item.label} score={item.score} cap={item.cap} />
        ))}
      </div>

      {report.sections.map((section) => (
        <div key={section.id}>
          <Spacing size={20} />
          <div style={{ padding: '0 24px' }}>
            <Paragraph typography="st11" fontWeight="bold">
              {COMPAT_SECTION_TITLES[section.id]}
            </Paragraph>
            <Spacing size={6} />
            <Paragraph typography="st12">{section.body}</Paragraph>
          </div>
        </div>
      ))}

      {report.usedCards.length > 0 && (
        <>
          <Spacing size={24} />
          <div style={{ padding: '0 24px' }}>
            <Paragraph typography="st12" fontWeight="bold">
              이 리포트가 참고한 자료
            </Paragraph>
          </div>
          <List>
            {report.usedCards.map((card) => (
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

      <Spacing size={24} />

      <div style={{ padding: '0 24px' }}>
        <Paragraph typography="st12" fontWeight="bold">
          알아두실 점
        </Paragraph>
        <Spacing size={8} />
        {report.disclaimers.map((line) => (
          <Paragraph key={line} typography="st13" color="var(--adaptiveGrey700)">
            · {line}
          </Paragraph>
        ))}
        <Spacing size={8} />
        <Paragraph typography="st13" color="var(--adaptiveGrey700)">
          궁합 엔진 {result.version}
        </Paragraph>
      </div>
    </section>
  )
}
