import { SECTION_TITLES } from '../../../shared/interpret/ui'
import { C, GUTTER, S, T, card } from '../../../shared/design'
import { MOTION, cx, stagger } from '../../../shared/motion'
import type { RuleBasedReport } from '../buildReport'
import { defaultInterpretationClient } from '../interpretationClient'
import { SectionCard } from './SectionCard'
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
  const { interpretation } = view

  return (
    <section>
      <div className={MOTION.rise} {...stagger(1)} style={{ padding: `0 ${GUTTER}px` }}>
        <h2 style={{ margin: 0, ...T.title, color: C.text }}>
          {interpretation.headline}
        </h2>
      </div>

      <div style={{ height: S.lg }} />

      {/*
        섹션 하나 = 카드 하나. 첫 장만 펼쳐 둔다 — 전부 접으면 화면이 제목 목록처럼 보여
        읽을 것이 없어 보이고, 전부 펼치면 예전의 문단 더미로 돌아간다.

        섹션별 근거 카드는 여기 없다. `InterpretationSection` 은 `id` 와 `body` 뿐이고
        인용 카드는 리포트 단위(`usedCardIds`)로만 온다. 아래 "참고한 자료" 가 그 자리다.
      */}
      {interpretation.sections.map((section, index) => (
        <SectionCard
          key={section.id}
          index={index + 2}
          title={SECTION_TITLES[section.id]}
          body={section.body}
          defaultOpen={index === 0}
        />
      ))}

      <div style={{ height: S.lg }} />

      <div
        className={MOTION.rise}
        {...stagger(3)}
        style={{ margin: `0 ${GUTTER}px`, ...card(true) }}
      >
        <span style={{ ...T.caption, color: C.textMuted }}>오늘 해볼 만한 한 가지</span>
        <p style={{ margin: '6px 0 0', ...T.body, fontWeight: 600, color: C.text }}>
          {interpretation.actionToday}
        </p>
      </div>

      {/*
        폴백 고지. 조용히 한 줄만 둔다 — 사용자가 알아야 할 것은 "지금 보고 있는 글이 어느 판인가"뿐이고,
        경고 배지로 키우면 실패하지도 않은 상황에서 불안을 만든다.
        서버를 아예 쓰지 않는 배포(`state === 'off'`)에서는 아무 말도 하지 않는다 — 폴백이 아니라 정상이다.
      */}
      {(view.state === 'loading' || view.state === 'fallback') && (
        <div style={{ padding: `${S.md}px ${GUTTER}px 0` }}>
          <span
            className={cx(view.state === 'loading' && MOTION.shimmer)}
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              fontSize: 12,
              color: C.textMuted,
            }}
          >
            {view.state === 'loading'
              ? '해석을 조금 더 다듬는 중이에요'
              : '지금은 기본 해석으로 보여 드리고 있어요'}
          </span>
        </div>
      )}

      {/*
        근거 카드 목록을 화면에 그리지 않는다.

        예전에는 "이 리포트가 참고한 자료" 로 인용 카드를 나열했다(문서10 §5.1 설명가능성).
        빼기로 한 이유는 대표님 판단이고, 추적 자체가 사라지는 것은 아니다 —
        `interpretation.usedCardIds` 는 그대로 오고 서버의 `verifyAuthoredText` 가 인용을
        검증한다. **화면에 안 보일 뿐 검증은 그대로다.**

        `usedCards` 는 `useInterpretation` 이 여전히 계산한다(여기서 안 쓸 뿐이다) — 그 값은
        서버 응답을 채택할지 판단하는 데도 쓰이므로 지우면 안 된다.
      */}
    </section>
  )
}
