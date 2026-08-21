import type { Chart } from '../shared/lib/saju'
import type { SelfReport } from '../features/onboarding'
import { buildFactPack, renderTemplateSummary, selectKnowledgeCards } from '../shared/interpret/ui'
import { CARDS } from '../shared/knowledge'
import { defaultSummaryClient, useHomeSummary, type SummaryClient } from '../features/report'
import { elementObjectUrl } from '../shared/assets'
import {
  BottomCTA,
  C,
  ELEMENT_LABEL,
  ELEMENT_ORDER,
  GUTTER,
  R,
  S,
  Screen,
  T,
  card,
} from '../shared/design'
import { MOTION, cx, stagger, useCountUp } from '../shared/motion'
import type { Element } from '../shared/lib/saju/types'

/**
 * 홈 — 결과를 처음 만나는 화면.
 *
 * 근거: docs/superpowers/specs/2026-08-19-report-redesign-design.md §4.
 *
 * ## 구성
 * 왼쪽에 일주 두 글자를 세로 기둥으로 세우고, 오른쪽에 오행 오브젝트를 띄운다. 그 아래
 * 한 단어를 **좌정렬**로 크게 놓고 인주색 밑줄을 하나 긋는다. 마지막이 오행 분포다.
 *
 * ## 가운데 정렬을 버렸다
 * 2판은 전부 가운데 정렬이었다. 가장 예측 가능한 배치이고, 화면이 "기본값"으로 읽히는 큰
 * 이유였다(근거: `design-taste-frontend` §4.3 anti-center bias, DESIGN_VARIANCE 7).
 * 좌정렬 + 오른쪽 오브젝트 + 왼쪽 기둥으로 비대칭을 만든다.
 *
 * ## 색은 인주 하나
 * 1·2판은 사용자의 오행에 따라 강조색이 바뀌었다. 火 사용자에게는 주황 강조가 생기고
 * 그것이 경고처럼 읽혔다. 지금 색이 들어가는 곳은 **한 단어 밑줄과 주 오행 막대** 둘이고
 * 둘 다 같은 인주색이다. 오행 정체성은 오브젝트 그림과 이름표가 말한다.
 *
 * ## 이 화면은 계산하지 않는다
 * 어느 오행이 강한지도 신강신약도 **엔진이 이미 확정했다**(C00 §H). 여기서는 그 값으로
 * 그림을 고르고 막대 길이를 정할 뿐이다.
 *
 * ## AI 가 없어도 채워진다
 * `useHomeSummary` 가 규칙 기반 값을 먼저 그리고 서버 값이 오면 갈아 끼운다.
 */
export interface HomePageProps {
  readonly chart: Chart
  readonly selfReport?: SelfReport
  /**
   * 요약 서버 클라이언트. 생략하면 빌드 설정(`VITE_INTERPRET_API_BASE`)을 보고 정한다.
   * `null` 을 명시하면 서버를 쓰지 않는다(테스트·미리보기).
   */
  readonly client?: SummaryClient | null
  readonly onOpenDetail: () => void
  readonly onRestart: () => void
}

/**
 * 막대 하나.
 *
 * 길이는 엔진 점수를 그대로 쓴다. **분모는 고정 80 이다** — 실제 합으로 나누면 불변식이
 * 깨진 상태가 숫자에 묻힌다(합 80 은 엔진이 보장한다, §5.2 게이트).
 *
 * 강조되지 않은 넷은 아주 흐리게 둔다. 1판은 다섯이 거의 같은 무게로 그려져 회색 막대
 * 네 개가 그대로 노이즈였다 — 이 화면이 말하려는 것은 주 오행 하나다.
 */
function ElementBar({
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

export function HomePage({ chart, selfReport, client, onOpenDetail, onRestart }: HomePageProps) {
  // 성별은 자기신고가 아니라 **계산 입력**이라 차트에서 읽는다 — `buildRuleBasedReport` 와 같은 규칙이다.
  const profile = {
    gender: chart.input.gender,
    mbti: selfReport?.mbti ?? null,
    blood: selfReport?.blood ?? null,
  }
  const fact = buildFactPack(chart, profile, 'fusion')
  const cardIds = selectKnowledgeCards(fact, CARDS).map((c) => c.id)

  // 규칙 기반 값을 먼저 만들어 두고 서버 값이 오면 갈아 끼운다. 화면 구조는 어느 쪽이든 같다.
  const fallback = renderTemplateSummary(fact, cardIds)
  const view = useHomeSummary(fallback, { kind: 'fusion', chart, profile }, {
    client: client === undefined ? defaultSummaryClient() : client,
  })
  const shown = view.summary
  const summaryPending = view.state === 'loading'

  const strength = fact.saju.strength
  const dayElement = fact.saju.dayElement
  const objectUrl = elementObjectUrl(dayElement)
  // 일주 두 글자. 사용자의 차트에서 나온 값이라 장식이 아니라 내용이다.
  const iljuChars = [...chart.pillars.day.ganji]

  return (
    <Screen bottomInset={128}>
      <div style={{ height: S.xxl }} />

      {/*
        일주 기둥과 오브젝트.

        세로로 쌓은 한자는 **회전시킨 라틴 문자가 아니라** CJK 의 본래 세로쓰기다(§9.F 의
        "vertical rotated text" 금지는 회전한 영문 라벨을 가리킨다). 사용자의 일주라서
        내용이기도 하다 — 읽어야 하는 값은 아니므로 스크린리더에서는 뺀다.
      */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: S.lg,
          padding: `0 ${GUTTER}px`,
        }}
      >
        <div
          aria-hidden
          className={MOTION.rise}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S.xs,
            fontSize: 30,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            color: 'rgba(247,244,238,0.16)',
            flexShrink: 0,
          }}
        >
          {iljuChars.map((ch, i) => (
            <span key={`${ch}-${i}`}>{ch}</span>
          ))}
        </div>

        {objectUrl !== null && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            {/*
              배경 상자는 **이미지 쪽에서 없앴다** — `optimize-assets` 가 밝기를 알파로 구워
              어두운 배경이 투명하다. CSS 로 지우려 세 번 실패했다(마스크는 원 안에 남색을
              남기고, `screen` 블렌드는 어두운 픽셀을 투명하게 만들지 않으며, sharp 의
              `dest-in` 은 알파 채널을 요구한다).

              이 화면에서 **끝없이 움직이는 것은 이것 하나**다.
            */}
            <div
              className={MOTION.float}
              style={{ width: '76%', maxWidth: 210, aspectRatio: '1 / 1' }}
            >
              <img
                src={objectUrl}
                alt={`${ELEMENT_LABEL[dayElement]} 기운을 나타내는 오브젝트`}
                className={MOTION.fade}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ height: S.xl }} />

      {/* 한 단어. 좌정렬 + 인주색 밑줄. 이 화면에서 색이 들어가는 두 곳 중 하나다. */}
      <div style={{ padding: `0 ${GUTTER}px` }}>
        <div className={MOTION.rise} {...stagger(1)}>
          <p style={{ margin: 0, ...T.caption, color: C.textMuted }}>한 단어로 말하면</p>
        </div>
        <div style={{ height: S.sm }} />
        <div className={MOTION.rise} {...stagger(2)}>
          <h1 style={{ margin: 0, ...T.display, color: C.text, display: 'inline-block' }}>
            {shown.word}
          </h1>
          <div
            aria-hidden
            className={MOTION.bar}
            {...stagger(3)}
            style={{ height: 3, width: '38%', minWidth: 68, background: C.seal, marginTop: S.sm }}
          />
        </div>
        <div style={{ height: S.lg }} />
        <div className={MOTION.rise} {...stagger(4)}>
          <p style={{ margin: 0, ...T.body, color: C.textBody, maxWidth: '34ch' }}>
            {shown.sentence}
          </p>
        </div>

        {/*
          AI 가 아직 오는 중. 글을 가리지 않고 아래에 한 줄만 둔다 — 스피너로 화면을 막으면
          이미 완성된 규칙 기반 글이 "아직 준비 안 된 것"처럼 보인다.
        */}
        {summaryPending && (
          <>
            <div style={{ height: S.md }} />
            <span
              className={cx(MOTION.fade, MOTION.shimmer)}
              style={{
                display: 'inline-block',
                padding: `${S.xs}px ${S.md}px`,
                borderRadius: R.pill,
                background: C.surface,
                ...T.caption,
                color: C.textMuted,
              }}
            >
              조금 더 다듬는 중이에요
            </span>
          </>
        )}
      </div>

      <div style={{ height: S.xxxl }} />

      {strength !== null && (
        <div className={MOTION.rise} {...stagger(5)} style={{ margin: `0 ${GUTTER}px`, ...card() }}>
          {ELEMENT_ORDER.map((element, i) => (
            <ElementBar
              key={element}
              element={element}
              score={strength.elementScores[element]}
              percent={strength.elementPercent[element]}
              emphasized={element === dayElement}
              index={i + 6}
            />
          ))}
        </div>
      )}

      <div style={{ height: S.md }} />

      <p
        className={MOTION.rise}
        {...stagger(11)}
        style={{ margin: 0, padding: `0 ${GUTTER}px`, ...T.caption, color: C.textMuted }}
      >
        {`${ELEMENT_LABEL[dayElement]} 기운이 중심이에요. 다섯을 합치면 80점이 됩니다.`}
      </p>

      <BottomCTA onClick={onOpenDetail} secondary={{ label: '다시 입력', onClick: onRestart }}>
        자세히 보기
      </BottomCTA>
    </Screen>
  )
}
