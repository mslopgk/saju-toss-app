import { Paragraph, Spacing } from '@toss/tds-mobile'
import type { Chart } from '../shared/lib/saju'
import type { SelfReport } from '../features/onboarding'
import { buildFactPack, renderTemplateSummary, selectKnowledgeCards } from '../shared/interpret/ui'
import { CARDS } from '../shared/knowledge'
import { defaultSummaryClient, useHomeSummary, type SummaryClient } from '../features/report'
import { elementBackdropUrl, elementObjectUrl } from '../shared/assets'
import {
  BottomCTA,
  ELEMENT_ACCENT,
  ELEMENT_LABEL,
  ELEMENT_ORDER,
  NIGHT,
  Screen,
  glassCard,
} from '../shared/design'
import { MOTION, cx, stagger } from '../shared/motion'
import type { Element } from '../shared/lib/saju/types'

/**
 * 홈 — 결과를 처음 만나는 화면.
 *
 * 근거: docs/superpowers/specs/2026-08-19-report-redesign-design.md §4.
 *
 * 이전 결과 화면은 사주 여덟 글자 표로 시작해 문단 열한 개가 세로로 쌓였다. 계산은 정확한데
 * **만세력 도구처럼 보였다.** 여기서는 위에서부터 세 덩어리만 둔다:
 *   ① 가장 강한 오행의 오브젝트  ② 한 단어와 한 문장  ③ 오행 분포
 * 나머지는 전부 깊이읽기로 넘긴다.
 *
 * ## 이 화면은 계산하지 않는다
 * 어느 오행이 강한지, 신강인지 신약인지는 **엔진이 이미 확정했다**(C00 §H). 여기서는 그 값으로
 * 그림을 고르고 막대 길이를 정할 뿐이다. 정렬·임계값 판정·가중합을 하지 않는다.
 *
 * ## AI 가 없어도 채워진다
 * `useHomeSummary` 가 규칙 기반 값을 먼저 그리고 서버 값이 오면 갈아 끼운다. 서버가 없거나
 * 죽어도 첫 화면이 빈 적이 없어야 한다 — 그게 이 앱이 LLM 을 **덧칠로만** 쓰는 이유다.
 */
export interface HomePageProps {
  readonly chart: Chart
  readonly selfReport?: SelfReport
  /**
   * 요약 서버 클라이언트. 생략하면 빌드 설정(`VITE_INTERPRET_API_BASE`)을 보고 정한다.
   * `null` 을 명시하면 서버를 쓰지 않는다(테스트·미리보기) — `ReportView` 의 `client` 와 같은 규칙이다.
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
 * 채워지는 애니메이션(`m-bar`)은 시작점만 0 으로 잡고 끝은 이 `width` 다.
 * 애니메이션이 꺼져도 막대는 제 길이로 그려진다.
 */
function ElementBar({
  element,
  score,
  percent,
  accent,
  emphasized,
  index,
}: {
  element: Element
  score: number
  percent: number
  accent: string
  emphasized: boolean
  index: number
}) {
  const ratio = Math.max(0, Math.min(100, (score / 80) * 100))
  return (
    <div
      className={MOTION.rise}
      {...stagger(index)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}
    >
      <span
        style={{
          width: 30,
          flexShrink: 0,
          fontSize: 13,
          fontWeight: emphasized ? 700 : 400,
          color: emphasized ? NIGHT.text : NIGHT.textDim,
        }}
      >
        {ELEMENT_LABEL[element]}
      </span>
      <div
        role="img"
        aria-label={`${ELEMENT_LABEL[element]} ${score}점`}
        style={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          background: NIGHT.track,
          overflow: 'hidden',
        }}
      >
        <div
          className={MOTION.bar}
          {...stagger(index)}
          style={{
            width: `${ratio}%`,
            height: '100%',
            borderRadius: 4,
            background: emphasized ? accent : 'rgba(255,255,255,0.34)',
            boxShadow: emphasized ? `0 0 12px ${accent}66` : undefined,
          }}
        />
      </div>
      <span
        style={{
          width: 38,
          textAlign: 'right',
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
          color: emphasized ? NIGHT.text : NIGHT.textDim,
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
  const accent = ELEMENT_ACCENT[dayElement]
  const objectUrl = elementObjectUrl(dayElement)

  return (
    <Screen element={dayElement} backdropUrl={elementBackdropUrl(dayElement)} bottomInset={132}>
      <Spacing size={28} />

      {objectUrl !== null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
          <div className={MOTION.float} style={{ position: 'relative', width: '70%', maxWidth: 300 }}>
            {/* 후광. 오브젝트 뒤에서 숨 쉰다 — 네모 이미지의 경계를 눌러 주는 역할도 한다. */}
            <div
              aria-hidden
              className={MOTION.halo}
              style={{
                position: 'absolute',
                inset: '-14%',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${accent}4D 0%, transparent 68%)`,
                filter: 'blur(14px)',
              }}
            />
            <img
              src={objectUrl}
              alt={`${ELEMENT_LABEL[dayElement]} 기운을 나타내는 오브젝트`}
              className={MOTION.pop}
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1 / 1',
                objectFit: 'contain',
                // 생성 에셋은 제 배경을 달고 온다. 모서리를 깎지 않으면 하늘 위에 네모가 얹힌 티가 난다.
                borderRadius: 28,
              }}
            />
          </div>
        </div>
      )}

      <Spacing size={20} />

      <div style={{ padding: '0 24px', textAlign: 'center' }}>
        <div className={MOTION.rise} {...stagger(1)}>
          <Paragraph typography="st12" color={NIGHT.textDim}>
            한 단어로 말하면
          </Paragraph>
        </div>
        <Spacing size={6} />
        <div className={MOTION.rise} {...stagger(2)}>
          <Paragraph typography="t2" fontWeight="bold" color={NIGHT.text}>
            {shown.word}
          </Paragraph>
        </div>
        <Spacing size={10} />
        <div className={MOTION.rise} {...stagger(3)}>
          <Paragraph typography="st11" color={NIGHT.textSub}>
            {shown.sentence}
          </Paragraph>
        </div>

        {/*
          AI 가 아직 오는 중. 글을 가리지 않고 아래에 한 줄만 둔다 — 스피너로 화면을 막으면
          이미 완성된 규칙 기반 글이 "아직 준비 안 된 것"처럼 보인다.
        */}
        {summaryPending && (
          <>
            <Spacing size={10} />
            <span
              className={cx(MOTION.fade, MOTION.shimmer)}
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                fontSize: 12,
                color: NIGHT.textDim,
              }}
            >
              조금 더 다듬는 중이에요
            </span>
          </>
        )}
      </div>

      <Spacing size={32} />

      {strength !== null && (
        <div className={MOTION.rise} {...stagger(4)} style={{ margin: '0 20px', ...glassCard() }}>
          <Paragraph typography="st12" fontWeight="bold" color={NIGHT.text}>
            타고난 기운의 분포
          </Paragraph>
          <Spacing size={10} />
          {ELEMENT_ORDER.map((element, i) => (
            <ElementBar
              key={element}
              element={element}
              score={strength.elementScores[element]}
              percent={strength.elementPercent[element]}
              accent={accent}
              emphasized={element === dayElement}
              index={i + 5}
            />
          ))}
          <Spacing size={8} />
          <Paragraph typography="st13" color={NIGHT.textDim}>
            {ELEMENT_LABEL[dayElement]} 기운이 당신의 중심이에요. 다섯을 합치면 80점이 됩니다.
          </Paragraph>
        </div>
      )}

      {/*
        "다시 입력하기"를 본문 맨 아래가 아니라 CTA 옆에 붙인다. 본문에 두면 스크롤을 끝까지
        내려야 보이고, 그 자리는 오행 분포를 읽고 난 사람이 가장 덜 원하는 동작이다.
      */}
      <BottomCTA
        accent={accent}
        onClick={onOpenDetail}
        secondary={{ label: '다시 입력', onClick: onRestart }}
      >
        자세히 보기
      </BottomCTA>
    </Screen>
  )
}
