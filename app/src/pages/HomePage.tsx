import { Button, FixedBottomCTA, Paragraph, Spacing } from '@toss/tds-mobile'
import type { Chart } from '../shared/lib/saju'
import type { SelfReport } from '../features/onboarding'
import { buildFactPack, renderTemplateSummary, selectKnowledgeCards } from '../shared/interpret/ui'
import { CARDS } from '../shared/knowledge'
import { defaultSummaryClient, useHomeSummary, type SummaryClient } from '../features/report'
import { elementBackdropUrl, elementObjectUrl } from '../shared/assets'
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
 * `summary` 가 주어지지 않으면 규칙 기반 요약을 그린다. 서버가 없거나 죽어도 첫 화면이 빈 적이
 * 없어야 한다 — 그게 이 앱이 LLM 을 **덧칠로만** 쓰는 이유다.
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

/** 막대 하나. 길이는 엔진 점수를 그대로 쓴다 — 합이 80 인 것은 엔진이 보장한다(§5.2 게이트). */
function ElementBar({
  element,
  score,
  percent,
  emphasized,
}: {
  element: Element
  score: number
  percent: number
  emphasized: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
      <Paragraph
        typography="st12"
        fontWeight={emphasized ? 'bold' : 'regular'}
        color={emphasized ? undefined : 'var(--adaptiveGrey700)'}
      >
        {ELEMENT_LABEL[element]}
      </Paragraph>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 4,
          background: 'var(--adaptiveGrey200)',
          overflow: 'hidden',
        }}
        role="img"
        aria-label={`${ELEMENT_LABEL[element]} ${score}점`}
      >
        <div
          style={{
            // 분모는 고정 80 이다. 실제 합으로 나누면 불변식이 깨진 상태가 숫자에 묻힌다.
            width: `${Math.max(0, Math.min(100, (score / 80) * 100))}%`,
            height: '100%',
            borderRadius: 4,
            background: emphasized ? 'var(--adaptiveBlue500)' : 'var(--adaptiveGrey400)',
          }}
        />
      </div>
      <Paragraph typography="st13" color="var(--adaptiveGrey700)">
        {/* 한 덩어리로 넘긴다 — `{percent}%` 는 SSR 에서 `14<!-- -->%` 로 쪼개져 문자열 검사를 통과하지 못한다. */}
        {`${percent}%`}
      </Paragraph>
    </div>
  )
}

/** 오행 한자 → 화면 표기. 한글을 앞에 둔다 — 첫 화면에서 한자가 벽이 되지 않게 한다. */
const ELEMENT_LABEL: Readonly<Record<Element, string>> = {
  木: '나무',
  火: '불',
  土: '흙',
  金: '쇠',
  水: '물',
}

const ELEMENT_ORDER: readonly Element[] = ['木', '火', '土', '金', '水']

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
  const backdropUrl = elementBackdropUrl(dayElement)

  return (
    <main
      style={{
        minHeight: '100vh',
        // 배경 이미지가 없으면 색만 깐다 — 에셋 한 장 없다고 화면이 무너지지 않는다.
        background: backdropUrl === null ? '#101736' : `#101736 url(${backdropUrl}) center/cover no-repeat`,
        // 하단 CTA(FixedBottomCTA)는 `position: fixed` 라 문서 흐름에서 빠져 있다. 그 높이만큼
        // 아래를 비워 두지 않으면 마지막 내용이 아무리 스크롤해도 드러나지 않는다.
        // 96 은 CTA(56) + 여백보다 크다 — `ui-smoke` 가 가장 작은 화면에서 이 관계를 잰다.
        paddingBottom: 96,
      }}
    >
      <Spacing size={24} />

      {objectUrl !== null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
          <img
            src={objectUrl}
            alt={`${ELEMENT_LABEL[dayElement]} 기운을 나타내는 오브젝트`}
            style={{
              width: '72%',
              maxWidth: 320,
              aspectRatio: '1 / 1',
              objectFit: 'contain',
              // 생성 에셋은 제 배경을 달고 온다. 모서리를 깎지 않으면 backdrop 위에 네모가
              // 얹힌 티가 난다 — 두 파란색이 미묘하게 달라서 더 그렇다.
              borderRadius: 28,
            }}
          />
        </div>
      )}

      <div style={{ padding: '0 24px', textAlign: 'center' }}>
        <Paragraph typography="st12" color="rgba(255,255,255,0.62)">
          한 단어로 말하면
        </Paragraph>
        <Spacing size={6} />
        <Paragraph typography="t2" fontWeight="bold" color="#ffffff">
          {shown.word}
        </Paragraph>
        <Spacing size={10} />
        <Paragraph typography="st11" color="rgba(255,255,255,0.86)">
          {shown.sentence}
        </Paragraph>

        {summaryPending && (
          <>
            <Spacing size={8} />
            <Paragraph typography="st13" color="rgba(255,255,255,0.5)">
              조금 더 다듬는 중이에요
            </Paragraph>
          </>
        )}
      </div>

      <Spacing size={28} />

      {strength !== null && (
        <div
          style={{
            margin: '0 20px',
            padding: '16px 18px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.92)',
          }}
        >
          <Paragraph typography="st12" fontWeight="bold">
            타고난 기운의 분포
          </Paragraph>
          <Spacing size={8} />
          {ELEMENT_ORDER.map((element) => (
            <ElementBar
              key={element}
              element={element}
              score={strength.elementScores[element]}
              percent={strength.elementPercent[element]}
              emphasized={element === dayElement}
            />
          ))}
          <Spacing size={6} />
          <Paragraph typography="st13" color="var(--adaptiveGrey700)">
            {ELEMENT_LABEL[dayElement]} 기운이 당신의 중심이에요. 다섯을 합치면 80점이 됩니다.
          </Paragraph>
        </div>
      )}

      <Spacing size={20} />

      <div style={{ padding: '0 24px' }}>
        <Button display="block" size="large" color="dark" variant="weak" onClick={onRestart}>
          다시 입력하기
        </Button>
      </div>

      <FixedBottomCTA onClick={onOpenDetail}>자세히 보기</FixedBottomCTA>
    </main>
  )
}
