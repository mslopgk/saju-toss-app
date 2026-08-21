import type { Chart } from '../shared/lib/saju'
import type { SelfReport } from '../features/onboarding'
import { buildFactPack, renderTemplateSummary, selectKnowledgeCards } from '../shared/interpret/ui'
import { CARDS } from '../shared/knowledge'
import { defaultSummaryClient, useHomeSummary, type SummaryClient } from '../features/report'
import { elementObjectUrl } from '../shared/assets'
import { BottomCTA, C, ELEMENT_LABEL, GUTTER, R, S, Screen, T } from '../shared/design'
import { MOTION, cx, stagger } from '../shared/motion'

/**
 * 홈 — 결과를 처음 만나는 화면.
 *
 * 근거: docs/superpowers/specs/2026-08-19-report-redesign-design.md §4,
 *       그리고 대표님이 방향으로 준 Jamo 앱의 실제 화면(2026-08-21 확인).
 *
 * ## 자모를 보고 줄인 것
 * 자모 홈에 있는 것은 **세 덩어리**다: 상단의 작은 간지 칩, 화면의 절반을 차지하는 오브젝트,
 * 문장 한 줄. 화면 제목도 없고 데이터 시각화도 없다.
 *
 * 앞 판의 홈은 정보가 열두 덩어리였다(표제·문장·막대 5개·퍼센트 5개·캡션). 계산이 맞다는
 * 것을 홈에서 증명하려 한 화면이었고, 그래서 **처음 만나는 화면이 대시보드처럼 보였다.**
 * 오행 분포는 깊이읽기로 옮겼다 — 없앤 것이 아니라 읽을 준비가 된 사람에게 보여 준다.
 *
 * 지금 홈에 남은 것: 간지 칩 · 오브젝트 · 한 단어 · 한 문장. 넷이다.
 *
 * ## 한 단어는 남긴다
 * 자모에는 큰 표제가 없지만 이 앱의 결론은 "한 단어"다(스펙 §4). 그것까지 빼면 홈이
 * 그림 한 장이 된다. 대신 눈금 아래 인주색 밑줄 하나로 끝낸다.
 *
 * ## 이 화면은 계산하지 않는다
 * 어느 오행이 강한지는 **엔진이 이미 확정했다**(C00 §H). 여기서는 그 값으로 그림을 고를 뿐이다.
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

  const dayElement = fact.saju.dayElement
  const objectUrl = elementObjectUrl(dayElement)

  return (
    <Screen bottomInset={128}>
      <div style={{ height: S.xl }} />

      {/*
        간지 칩. 자모가 상단에 두는 것과 같은 자리다. 사용자의 일주라서 내용이고,
        읽어야 하는 값은 아니므로 크게 만들지 않는다 — 앞 판의 30px 세로 기둥은 장식이었다.
      */}
      <div
        className={MOTION.rise}
        style={{ display: 'flex', justifyContent: 'center', padding: `0 ${GUTTER}px` }}
      >
        <span
          style={{
            padding: `${S.xs}px ${S.md}px`,
            borderRadius: R.pill,
            background: C.surface,
            ...T.caption,
            letterSpacing: '0.04em',
            color: C.textMuted,
          }}
        >
          {chart.pillars.day.ganji}
        </span>
      </div>

      {objectUrl !== null && (
        <>
          <div style={{ height: S.lg }} />
          <div style={{ display: 'flex', justifyContent: 'center', padding: `0 ${GUTTER}px` }}>
            {/*
              오브젝트가 화면을 지배한다. 자모는 이걸 화면의 절반 넘게 쓴다 — 앞 판은
              4분의 1이라 "삽화" 로 보였다. 이 화면에서 **끝없이 움직이는 것은 이것 하나**다.

              배경 상자는 이미지 쪽에서 없앴다(`optimize-assets` 가 밝기를 알파로 굽는다).
            */}
            <div
              className={MOTION.float}
              style={{ width: '86%', maxWidth: 320, aspectRatio: '1 / 1' }}
            >
              <img
                src={objectUrl}
                alt={`${ELEMENT_LABEL[dayElement]} 기운을 나타내는 오브젝트`}
                className={MOTION.fade}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
          </div>
        </>
      )}

      <div style={{ height: S.xl }} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <div className={MOTION.rise} {...stagger(1)}>
          <h1 style={{ margin: 0, ...T.display, color: C.text, display: 'inline-block' }}>
            {shown.word}
          </h1>
          {/* 인주색 밑줄. 이 화면에서 색이 들어가는 유일한 자리다. */}
          <div
            aria-hidden
            className={MOTION.bar}
            {...stagger(2)}
            style={{ height: 3, width: '34%', minWidth: 64, background: C.seal, marginTop: S.sm }}
          />
        </div>
        <div style={{ height: S.lg }} />
        <div className={MOTION.rise} {...stagger(3)}>
          <p style={{ margin: 0, ...T.body, color: C.textBody, maxWidth: '32ch' }}>
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

      <BottomCTA onClick={onOpenDetail} secondary={{ label: '다시 입력', onClick: onRestart }}>
        자세히 보기
      </BottomCTA>
    </Screen>
  )
}
