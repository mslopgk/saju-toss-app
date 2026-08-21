import { Suspense, lazy, useState } from 'react'
import { Spacing } from '@toss/tds-mobile'
import type { Chart, PillarKey, TenGod } from '../shared/lib/saju'
import { DISCLAIMERS } from '../shared/interpret/ui'
import { branchUrl } from '../shared/assets'
import {
  BottomCTA,
  Hint,
  R,
  C,
  GUTTER,
  ReadingScreen,
  Screen,
  ScreenTitle,
  SectionLabel,
  T,
  card,
} from '../shared/design'
import { MOTION, stagger } from '../shared/motion'
import {
  NO_SELF_REPORT,
  ReportView,
  buildRuleBasedReport,
  hasReportContent,
  type ReportProfile,
} from '../features/report'
import { ENGINE_WARNING_COPY } from './engineWarningCopy'

/**
 * 깊이읽기 화면.
 *
 * 근거: C00 §S3(네 기둥) · §S4-1(십신) · §S6(대운) · §5.4(경고 코드) / docs/product.md 핵심 흐름 2단계.
 *
 * ⛔ 해석 레이어의 **서버 전용 코드는 여기로 들어오지 않는다.** 면책 문구는
 *    `shared/interpret/ui`(= `copy.ts` 재수출)에서만 가져온다. `shared/interpret`(배럴)을 import 하면
 *    시스템 프롬프트 전문과 Anthropic API 매퍼가 미니앱 번들에 실려 사용자 단말로 내려간다.
 *
 * 표시하지 않는 것: 십신 `groupWeights`. S5 이후로는 정식 배점(합 80.00)이라 인용해도 되는 값이지만,
 * 이 표에서는 십신 **이름**만 보여준다 — 같은 점수를 리포트의 신강신약 섹션이 오행 단위로 이미 말하고,
 * 한 화면에서 같은 수치를 두 체계로 두 번 보여주면 서로 다른 값처럼 읽힌다.
 *
 * 해석 문장은 이 파일이 쓰지 않는다. `features/report` 가 팩트팩 → 카드검색 → 규칙 렌더러를 통과시킨
 * 결과를 그대로 그린다(§H: 화면은 계산·서술 결과를 고치지 않는다).
 */
export interface DetailPageProps {
  chart: Chart
  /**
   * 자기신고 값(MBTI·혈액형). 선택 입력이라 없으면 해당 리포트 섹션이 빠진다.
   * 기본값이 "둘 다 모름"인 이유: 온보딩을 거치지 않는 호출부(테스트·미리보기)도 화면을 그릴 수 있어야 한다.
   *
   * 온보딩의 좁은 타입(`SelfReport`)이 아니라 리포트 쪽의 넓은 타입을 받는다 — 두 feature 를 잇는 것은
   * 이 조합 계층의 일이고, `SelfReport` 는 이 타입에 그대로 대입된다.
   */
  selfReport?: ReportProfile
  /**
   * 홈으로 돌아간다.
   *
   * 예전에는 이 자리가 온보딩으로 가는 "다시 입력하기"였다. 홈이 생긴 뒤로는 **한 칸씩** 물러난다 —
   * 깊이읽기를 닫았다고 사용자가 방금 채운 생년월일까지 잃을 이유가 없다.
   */
  onBack: () => void
}

/**
 * 궁합 화면 청크.
 *
 * `pages/CompatPage` 는 궁합 엔진(`shared/lib/compat`) · `compat-params.json`(34.9 kB) ·
 * `compat-calib.json` · 상대방 입력 폼을 끌고 온다. 결과 화면에 들어온 사람 전부가 궁합을
 * 보는 것은 아니므로 그 무게를 여기서 다시 한 번 미룬다 — 경계는 `App.tsx`(온보딩 → 결과)에
 * 이어 이 파일(결과 → 궁합)에 하나 더 있는 셈이다.
 *
 * ⚠ 지연되는 것은 **모듈 로딩뿐이다.** 받고 나면 `computeCompatibility()` 는 여전히 동기
 *   순수함수다(C00 §S8: 결정론).
 */
const CompatPage = lazy(async () => ({ default: (await import('./CompatPage')).CompatPage }))

const PILLAR_ORDER: readonly { key: PillarKey; label: string }[] = [
  { key: 'year', label: '연주' },
  { key: 'month', label: '월주' },
  { key: 'day', label: '일주' },
  { key: 'hour', label: '시주' },
]

function tenGodLabel(value: TenGod | '일간' | null): string {
  return value ?? '—'
}

/**
 * 근거 한 줄.
 *
 * TDS `ListRow` 를 쓰지 않는 이유는 폼과 같다 — 흰 바탕을 전제해서 어두운 하늘 위에 흰 띠가 생긴다.
 */
function FactLine({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 14,
        padding: '10px 0',
        borderBottom: last ? 'none' : `1px solid ${C.divider}`,
      }}
    >
      <span style={{ ...T.body, fontWeight: 600, color: C.text, flexShrink: 0 }}>{label}</span>
      <span style={{ ...T.label, color: C.textMuted, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export function DetailPage({ chart, selfReport = NO_SELF_REPORT, onBack }: DetailPageProps) {
  const { pillars, tenGods, luck, jie, warnings } = chart
  const daewoon = luck.daewoon.pillars.filter((p) => p.ganji !== null).slice(0, 8)
  // 순수함수이고 1ms 미만이라 메모이제이션 없이 렌더마다 계산한다(C00 §7.2: 계산이 캐시보다 싸다).
  const report = buildRuleBasedReport(chart, selfReport)
  const [showCompat, setShowCompat] = useState(false)

  if (showCompat) {
    // 궁합 청크를 받는 동안. 앱의 다른 대기 화면과 같은 연출을 쓴다 — 여기만 스피너면 튄다.
    return (
      <Suspense fallback={<ReadingScreen />}>
        {/* 자기신고 값은 온보딩의 좁은 타입이 그대로 대입되는 구조라 변환 없이 넘어간다. */}
        <CompatPage
          selfChart={chart}
          selfProfile={{ mbti: selfReport.mbti, blood: selfReport.blood }}
          onBack={() => setShowCompat(false)}
        />
      </Suspense>
    )
  }

  return (
    <Screen bottomInset={168}>
      <Spacing size={20} />

      <ScreenTitle
        index={0}
        title="깊이 읽기"
        subtitle={`${pillars.sajuYear}년 ${jie.prev.ko}(${jie.prev.hanja}) 이후 · ${pillars.gz8}`}
      />

      {warnings.length > 0 && (
        <>
          <Spacing size={16} />
          <div className={MOTION.rise} {...stagger(1)} style={{ margin: `0 ${GUTTER}px`, ...card() }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {warnings.map((code) => (
                <span
                  key={code}
                  style={{
                    padding: '4px 10px',
                    borderRadius: R.pill,
                    fontSize: 12,
                    fontWeight: 600,
                    // 경고와 안내를 색으로 가른다. 둘 다 같은 색이면 사용자가 심각도를 읽지 못한다.
                    background:
                      ENGINE_WARNING_COPY[code].severity === 'warn'
                        ? 'rgba(248,113,113,0.18)'
                        : 'rgba(56,189,248,0.16)',
                    color: ENGINE_WARNING_COPY[code].severity === 'warn' ? '#FCA5A5' : '#7DD3FC',
                  }}
                >
                  {ENGINE_WARNING_COPY[code].label}
                </span>
              ))}
            </div>
            <Spacing size={8} />
            {warnings.map((code) => (
              <p
                key={code}
                style={{ margin: '2px 0 0', ...T.caption, color: C.textMuted }}
              >
                {ENGINE_WARNING_COPY[code].detail}
              </p>
            ))}
          </div>
        </>
      )}

      {/*
        읽을 거리가 먼저다. 예전에는 여덟 글자 표가 화면 맨 위였다 — 읽으러 들어온 사람이
        가장 먼저 만나는 것이 만세력 표면 읽을 글이 표 아래 어딘가에 묻힌다.
        표는 근거이지 본문이 아니므로 아래로 내렸다.

        리포트가 비면(카드 미매칭) 이 블록 전체가 사라진다.
      */}
      {hasReportContent(report) && (
        <>
          <Spacing size={18} />
          <ReportView report={report} />
        </>
      )}

      <Spacing size={32} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel>사주 네 기둥</SectionLabel>
      </div>
      <Spacing size={12} />

      {/* 네 기둥. 삼주 모드면 시주 칸은 '—' 로 비운다 — 채워 넣지 않는다. */}
      <div style={{ padding: `0 ${GUTTER}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {PILLAR_ORDER.map(({ key, label }, i) => {
            const pillar = pillars[key]
            const gods = tenGods.byPillar[key]
            // 지지 그림. 없으면 글자만 남는다 — 에셋 한 장 없다고 칸이 무너지지 않는다.
            const art = pillar === null ? null : branchUrl(pillar.branch)
            return (
              <div
                key={key}
                className={MOTION.rise}
                {...stagger(i + 2)}
                style={{
                  padding: '12px 4px',
                  borderRadius: R.control,
                  textAlign: 'center',
                  background: C.surface,
                  border: `1px solid ${C.divider}`,
                }}
              >
                <span style={{ ...T.caption, color: C.textMuted }}>{label}</span>
                {art !== null && (
                  <div style={{ padding: '6px 0 2px' }}>
                    <img
                      src={art}
                      alt=""
                      aria-hidden
                      style={{ width: '68%', aspectRatio: '1 / 1', objectFit: 'contain', borderRadius: R.control }}
                    />
                  </div>
                )}
                <Spacing size={4} />
                <div style={{ fontSize: 19, fontWeight: 700, color: C.text }}>
                  {pillar === null ? '—' : pillar.ganji}
                </div>
                <div style={{ ...T.caption, color: C.textMuted }}>
                  {pillar === null ? '시각 모름' : pillar.ganjiKo}
                </div>
                <Spacing size={6} />
                <div style={{ fontSize: 12, color: C.textBody }}>{tenGodLabel(gods.stem)}</div>
                <div style={{ ...T.caption, color: C.textMuted }}>
                  {tenGodLabel(gods.branchMain)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Spacing size={10} />
      <Hint>
        칸의 아래 두 줄은 십신이에요. 위가 천간, 아래가 지지 정기 기준이고 일간 자리는 기준점이라
        &apos;일간&apos; 으로 표시해요.
      </Hint>

      <Spacing size={30} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel>계산 근거</SectionLabel>
      </div>
      <Spacing size={12} />

      <div style={{ margin: `0 ${GUTTER}px`, ...card() }}>
        <FactLine label="납음오행" value={`${pillars.day.naeum.ko} (${pillars.day.naeum.hanja})`} />
        <FactLine
          label="절기"
          value={`${jie.prev.ko} ~ ${jie.next.ko} 사이 · 월지 ${pillars.month.branch}`}
        />
        <FactLine
          label="대운"
          value={`${luck.daewoon.forward ? '순행' : '역행'} · 대운수 ${luck.daewoon.daewoonNumber}${
            luck.daewoon.approx ? ' (생시 모름 · 12시 가정)' : ''
          }`}
          last
        />
      </div>

      <Spacing size={26} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel>대운의 흐름</SectionLabel>
      </div>
      <Spacing size={12} />

      <div style={{ margin: `0 ${GUTTER}px`, ...card() }}>
        {daewoon.map((entry, i) => (
          <FactLine
            key={entry.index}
            label={entry.ganji ?? '—'}
            value={`만 ${entry.startAgeWestern}~${entry.endAgeWestern}세 · ${entry.startYear}~${entry.endYear}년`}
            last={i === daewoon.length - 1}
          />
        ))}
      </div>

      <Spacing size={30} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel>알아두실 점</SectionLabel>
      </div>
      <Spacing size={10} />
      {DISCLAIMERS.map((line) => (
        <Hint key={line}>· {line}</Hint>
      ))}
      <Spacing size={8} />
      <Hint>계산 엔진 {chart.engineVersion}</Hint>

      <BottomCTA
        onClick={() => setShowCompat(true)}
        secondary={{ label: '홈으로', onClick: onBack }}
        caption="상대방의 생년월일만 있으면 두 사람 궁합을 볼 수 있어요."
      >
        궁합 보기
      </BottomCTA>
    </Screen>
  )
}
