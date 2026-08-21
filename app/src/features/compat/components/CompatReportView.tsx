import type { CompatResult } from '../../../shared/lib/compat'
import { C, GUTTER, Hint, S, SectionLabel, T, card } from '../../../shared/design'
import { MOTION, stagger, useCountUp } from '../../../shared/motion'
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
  index,
}: {
  label: string
  score: number
  cap: number
  index: number
}) {
  const ratio = cap === 0 ? 0 : Math.max(0, Math.min(1, score / cap))
  return (
    <div className={MOTION.rise} {...stagger(index)} style={{ padding: '7px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ ...T.label, color: C.textMuted }}>{label}</span>
        <span style={{ ...T.label, fontWeight: 700, color: C.text }}>
          {`${Number.isInteger(score) ? score : score.toFixed(1)} / ${cap}`}
        </span>
      </div>
      <div style={{ height: S.sm }} />
      <div
        style={{ height: 4, borderRadius: 2, background: C.track, overflow: 'hidden' }}
        role="img"
        aria-label={`${label} ${score} / ${cap}점`}
      >
        <div
          className={MOTION.bar}
          {...stagger(index)}
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            borderRadius: 2,
            // 무채색이다. 여섯 막대에 강조색을 넣으면 화면이 시끄러워지고, 이 화면의
            // 강조색은 등급 배지 한 군데로 정해 뒀다.
            background: 'rgba(255,255,255,0.32)',
          }}
        />
      </div>
    </div>
  )
}

export function CompatReportView({ result, report, accent }: CompatReportViewProps) {
  // 이 화면의 결론이 되는 숫자. 올라가는 것이 보여야 "계산했다"로 읽힌다.
  const scoreRef = useCountUp(result.score, { suffix: '점' })

  return (
    <section>
      <div style={{ padding: `0 ${GUTTER}px`, textAlign: 'center' }}>
        <div className={MOTION.rise} {...stagger(1)}>
          <span style={{ ...T.label, color: C.textMuted }}>두 사람의 궁합</span>
        </div>
        <div style={{ height: S.sm }} />
        <div className={MOTION.pop} {...stagger(2)}>
          <span
            ref={scoreRef}
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: C.text,
              // 자릿수가 바뀔 때 글자가 흔들리지 않게 고정폭 숫자를 쓴다 — 카운트업에서 특히 눈에 띈다.
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {`${result.score}점`}
          </span>
        </div>
        <div style={{ height: S.sm }} />
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
              color: C.text,
            }}
          >
            {`${result.band.tag} · ${result.band.name}`}
          </span>
        </div>
        <div style={{ height: S.lg }} />
        <div className={MOTION.rise} {...stagger(4)}>
          <p style={{ margin: 0, ...T.body, color: C.textBody }}>
            {report.summary}
          </p>
        </div>
      </div>

      {report.missingAxisNote !== null && (
        <>
          <div style={{ height: S.md }} />
          <Hint>{report.missingAxisNote}</Hint>
        </>
      )}

      <div style={{ height: S.xxl }} />

      {/* 사주 6항목. 점수는 전부 엔진 값 그대로다 */}
      <div className={MOTION.rise} {...stagger(5)} style={{ margin: `0 ${GUTTER}px`, ...card() }}>
        <span style={{ ...T.title, fontSize: 16, color: C.text }}>
          {`사주 궁합 ${Number(result.saju.total.toFixed(1))}점 / 100점`}
        </span>
        <div style={{ height: S.sm }} />
        {result.saju.items.map((item, i) => (
          <ItemBar
            key={item.id}
            label={item.label}
            score={item.score}
            cap={item.cap}
            index={i + 6}
          />
        ))}
      </div>

      {report.sections.map((section, i) => (
        <div key={section.id}>
          <div style={{ height: S.xl }} />
          <div className={MOTION.rise} {...stagger(i + 7)} style={{ padding: `0 ${GUTTER}px` }}>
            <SectionLabel>{COMPAT_SECTION_TITLES[section.id]}</SectionLabel>
            <div style={{ height: S.sm }} />
            <p style={{ margin: 0, ...T.body, color: C.textBody }}>
              {section.body}
            </p>
          </div>
        </div>
      ))}

      {/*
        근거 카드 목록은 그리지 않는다 — `ReportView` 와 같은 이유다.
        `report.usedCards` 는 그대로 만들어지고 QA 추적에 남는다.
      */}
      <div style={{ height: S.xxl }} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel>알아두실 점</SectionLabel>
      </div>
      <div style={{ height: S.md }} />
      {report.disclaimers.map((line) => (
        <Hint key={line}>· {line}</Hint>
      ))}
      <div style={{ height: S.sm }} />
      <Hint>궁합 엔진 {result.version}</Hint>
    </section>
  )
}
