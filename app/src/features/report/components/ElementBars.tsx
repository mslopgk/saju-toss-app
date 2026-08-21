import { buildFactPack } from '../../../shared/interpret/ui'
import { C, ELEMENT_LABEL, ELEMENT_ORDER, GUTTER, R, S, T, card } from '../../../shared/design'
import { MOTION, stagger, useCountUp } from '../../../shared/motion'
import type { ReportChart, ReportProfile } from '../buildReport'
import type { Element } from '../../../shared/lib/saju/types'

/**
 * 오행 분포 막대.
 *
 * ## 홈에서 여기로 옮긴 이유
 * 앞 판은 이걸 홈에 뒀다. 그 결과 홈의 정보가 열두 덩어리가 되어 **처음 만나는 화면이
 * 대시보드처럼 보였다.** 방향으로 받은 Jamo 앱은 홈에 데이터 시각화를 두지 않는다 —
 * 간지 칩, 오브젝트, 문장 한 줄이 전부다.
 *
 * 없앤 것이 아니라 **읽을 준비가 된 사람**에게 보여 준다. 깊이읽기에 들어온 사용자는
 * 숫자를 볼 마음이 있다.
 *
 * ## 이 컴포넌트는 계산하지 않는다
 * 점수는 엔진이 확정한 값이다(C00 §H). **분모는 고정 80 이다** — 실제 합으로 나누면
 * 불변식이 깨진 상태가 숫자에 묻힌다(합 80 은 엔진이 보장한다, §5.2 게이트).
 */
export interface ElementBarsProps {
  readonly chart: ReportChart
  readonly selfReport: ReportProfile
}

function Bar({
  element,
  score,
  percent,
  emphasized,
  index,
}: {
  element: Element
  score: number
  percent: number
  emphasized: boolean
  index: number
}) {
  const ratio = Math.max(0, Math.min(100, (score / 80) * 100))
  // 막대는 CSS 가 채우고 숫자는 rAF 가 올린다. 둘이 같은 지연을 쓰므로 함께 움직인다.
  const percentRef = useCountUp(percent, { suffix: '%', delayMs: 120 + index * 55 })

  return (
    <div
      className={MOTION.rise}
      {...stagger(index)}
      style={{ display: 'flex', alignItems: 'center', gap: S.md, padding: `${S.sm}px 0` }}
    >
      <span
        style={{
          width: 28,
          flexShrink: 0,
          ...T.label,
          fontWeight: emphasized ? 600 : 400,
          color: emphasized ? C.text : C.textMuted,
        }}
      >
        {ELEMENT_LABEL[element]}
      </span>
      <div
        role="img"
        aria-label={`${ELEMENT_LABEL[element]} ${score}점`}
        style={{ flex: 1, height: 3, borderRadius: R.bar, background: C.track, overflow: 'hidden' }}
      >
        <div
          className={MOTION.bar}
          {...stagger(index)}
          style={{
            width: `${ratio}%`,
            height: '100%',
            borderRadius: R.bar,
            // 강조되지 않은 넷은 아주 흐리게. 이 블록이 말하려는 것은 주 오행 하나다.
            background: emphasized ? C.seal : 'rgba(247,244,238,0.22)',
          }}
        />
      </div>
      <span
        ref={percentRef}
        style={{
          width: 34,
          textAlign: 'right',
          ...T.label,
          fontVariantNumeric: 'tabular-nums',
          color: emphasized ? C.text : C.textMuted,
        }}
      >
        {/* 한 덩어리로 넘긴다 — `{percent}%` 는 SSR 이 `14<!-- -->%` 로 쪼갠다. */}
        {`${percent}%`}
      </span>
    </div>
  )
}

export function ElementBars({ chart, selfReport }: ElementBarsProps) {
  const fact = buildFactPack(
    chart,
    { gender: chart.input.gender, mbti: selfReport.mbti, blood: selfReport.blood },
    'fusion',
  )
  const strength = fact.saju.strength
  if (strength === null) {
    return null
  }
  const dayElement = fact.saju.dayElement

  return (
    <>
      <div style={{ margin: `0 ${GUTTER}px`, ...card() }}>
        {ELEMENT_ORDER.map((element, i) => (
          <Bar
            key={element}
            element={element}
            score={strength.elementScores[element]}
            percent={strength.elementPercent[element]}
            emphasized={element === dayElement}
            index={i}
          />
        ))}
      </div>
      <div style={{ height: S.md }} />
      <p
        style={{ margin: 0, padding: `0 ${GUTTER}px`, ...T.caption, color: C.textMuted }}
      >
        {`${ELEMENT_LABEL[dayElement]} 기운이 중심이에요. 다섯을 합치면 80점이 됩니다.`}
      </p>
    </>
  )
}
