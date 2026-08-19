import { formatSourceLabel } from '../../../shared/knowledge'
import type { CompatResult } from '../../../shared/lib/compat'
import { Hint, NIGHT, SectionLabel, glassCard } from '../../../shared/design'
import { MOTION, stagger } from '../../../shared/motion'
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
  /** 세계관 강조색. 화면(`CompatPage`)이 등급에서 골라 넘긴다. */
  accent: string
}

/** 배점 막대 하나. 항목별 `score / cap` 을 그대로 그린다 */
function ItemBar({
  label,
  score,
  cap,
  accent,
  index,
}: {
  label: string
  score: number
  cap: number
  accent: string
  index: number
}) {
  const ratio = cap === 0 ? 0 : Math.max(0, Math.min(1, score / cap))
  return (
    <div className={MOTION.rise} {...stagger(index)} style={{ padding: '7px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, color: NIGHT.textDim }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: NIGHT.text }}>
          {`${Number.isInteger(score) ? score : score.toFixed(1)} / ${cap}`}
        </span>
      </div>
      <div style={{ height: 6 }} />
      <div
        style={{ height: 6, borderRadius: 3, background: NIGHT.track, overflow: 'hidden' }}
        role="img"
        aria-label={`${label} ${score} / ${cap}점`}
      >
        <div
          className={MOTION.bar}
          {...stagger(index)}
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            borderRadius: 3,
            background: accent,
          }}
        />
      </div>
    </div>
  )
}

export function CompatReportView({ result, report, accent }: CompatReportViewProps) {
  return (
    <section>
      <div style={{ padding: '0 24px', textAlign: 'center' }}>
        <div className={MOTION.rise} {...stagger(1)}>
          <span style={{ fontSize: 13, color: NIGHT.textDim }}>두 사람의 궁합</span>
        </div>
        <div style={{ height: 6 }} />
        <div className={MOTION.pop} {...stagger(2)}>
          <span
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: NIGHT.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {`${result.score}점`}
          </span>
        </div>
        <div style={{ height: 8 }} />
        <div className={MOTION.rise} {...stagger(3)}>
          <span
            style={{
              display: 'inline-block',
              padding: '5px 14px',
              borderRadius: 999,
              background: `${accent}26`,
              border: `1px solid ${accent}`,
              fontSize: 13,
              fontWeight: 700,
              color: NIGHT.text,
            }}
          >
            {`${result.band.tag} · ${result.band.name}`}
          </span>
        </div>
        <div style={{ height: 14 }} />
        <div className={MOTION.rise} {...stagger(4)}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: NIGHT.textSub }}>
            {report.summary}
          </p>
        </div>
      </div>

      {report.missingAxisNote !== null && (
        <>
          <div style={{ height: 12 }} />
          <Hint>{report.missingAxisNote}</Hint>
        </>
      )}

      <div style={{ height: 28 }} />

      {/* 사주 6항목. 점수는 전부 엔진 값 그대로다 */}
      <div className={MOTION.rise} {...stagger(5)} style={{ margin: '0 20px', ...glassCard() }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: NIGHT.text }}>
          {`사주 궁합 ${Number(result.saju.total.toFixed(1))}점 / 100점`}
        </span>
        <div style={{ height: 6 }} />
        {result.saju.items.map((item, i) => (
          <ItemBar
            key={item.id}
            label={item.label}
            score={item.score}
            cap={item.cap}
            accent={accent}
            index={i + 6}
          />
        ))}
      </div>

      {report.sections.map((section, i) => (
        <div key={section.id}>
          <div style={{ height: 22 }} />
          <div className={MOTION.rise} {...stagger(i + 7)} style={{ padding: '0 24px' }}>
            <SectionLabel>{COMPAT_SECTION_TITLES[section.id]}</SectionLabel>
            <div style={{ height: 8 }} />
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: NIGHT.textSub }}>
              {section.body}
            </p>
          </div>
        </div>
      ))}

      {report.usedCards.length > 0 && (
        <>
          <div style={{ height: 28 }} />
          <div style={{ padding: '0 24px' }}>
            <SectionLabel>이 리포트가 참고한 자료</SectionLabel>
          </div>
          <div style={{ height: 12 }} />
          <div style={{ margin: '0 20px', ...glassCard() }}>
            {report.usedCards.map((card, i) => (
              <div
                key={card.id}
                style={{
                  padding: '10px 0',
                  borderBottom:
                    i === report.usedCards.length - 1 ? 'none' : `1px solid ${NIGHT.glassBorder}`,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: NIGHT.text }}>{card.title}</div>
                <div style={{ fontSize: 12, color: NIGHT.textDim, marginTop: 2 }}>
                  {`${formatSourceLabel(card.source)} · 근거등급 ${card.confidence}`}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ height: 28 }} />

      <div style={{ padding: '0 24px' }}>
        <SectionLabel>알아두실 점</SectionLabel>
      </div>
      <div style={{ height: 10 }} />
      {report.disclaimers.map((line) => (
        <Hint key={line}>· {line}</Hint>
      ))}
      <div style={{ height: 8 }} />
      <Hint>궁합 엔진 {result.version}</Hint>
    </section>
  )
}
