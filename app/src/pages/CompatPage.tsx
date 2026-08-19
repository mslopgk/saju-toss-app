import { useState } from 'react'
import { Spacing } from '@toss/tds-mobile'
import { EngineError, computeChart, type Chart, type RawBirthInput } from '../shared/lib/saju'
import {
  computeCompatibility,
  type CompatProfile,
  type CompatResult,
} from '../shared/lib/compat'
import {
  COMPAT_MOOD_ACCENT,
  CompatReportView,
  PartnerForm,
  buildCompatReport,
  compatMoodOf,
} from '../features/compat'
import { compatUrl } from '../shared/assets'
import { BottomCTA, NIGHT, Screen } from '../shared/design'
import { MOTION, stagger } from '../shared/motion'
import { ENGINE_ERROR_MESSAGE, GENERIC_ERROR } from './engineErrorCopy'

/**
 * 궁합 화면 — 상대방 입력 → 결과.
 *
 * 근거: C00 §S8 / docs/product.md(궁합 흐름).
 *
 * **첫 사람은 다시 입력받지 않는다** — 온보딩에서 이미 계산된 `Chart` 와 자기신고 값을 그대로
 * 받는다. 두 번째 사람만 이 화면에서 받고, 계산은 동기 순수함수 두 번(`computeChart` →
 * `computeCompatibility`)으로 끝난다.
 *
 * 이 파일은 `pages/` 에 있으므로 `features/compat` 와 `shared/lib/saju` 를 이어도 된다 —
 * 조합은 조합 계층의 일이다(ARCHITECTURE.md). `features/compat` 는 온보딩 feature 를 모른다.
 */
export interface CompatPageProps {
  /** 온보딩에서 계산해 둔 사용자 본인의 차트 */
  selfChart: Chart
  /** 사용자 본인의 자기신고 값 */
  selfProfile: CompatProfile
  /** 내 결과 화면으로 되돌아간다 */
  onBack: () => void
}

type Screen =
  | { readonly name: 'input' }
  | {
      readonly name: 'result'
      readonly result: CompatResult
      readonly partnerChart: Chart
    }

export function CompatPage({ selfChart, selfProfile, onBack }: CompatPageProps) {
  const [screen, setScreen] = useState<Screen>({ name: 'input' })
  const [engineError, setEngineError] = useState<string | null>(null)

  const handleSubmit = (input: RawBirthInput, partnerProfile: CompatProfile) => {
    try {
      const partnerChart = computeChart(input)
      const result = computeCompatibility(selfChart, partnerChart, selfProfile, partnerProfile)
      setEngineError(null)
      setScreen({ name: 'result', result, partnerChart })
    } catch (error) {
      // 엔진이 거절하면 입력 화면에 머무르고 이유를 인라인으로 알린다.
      setEngineError(error instanceof EngineError ? ENGINE_ERROR_MESSAGE[error.code] : GENERIC_ERROR)
    }
  }

  if (screen.name === 'input') {
    return <PartnerForm onSubmit={handleSubmit} engineError={engineError} onBack={onBack} />
  }

  const sameGender = selfChart.input.gender === screen.partnerChart.input.gender
  const report = buildCompatReport(screen.result, { sameGender })

  // 등급 → 분위기는 **표시용 매핑**이다. 점수도 등급도 엔진이 이미 확정했다.
  const mood = compatMoodOf(screen.result.band.tag)
  const accent = COMPAT_MOOD_ACCENT[mood]
  const art = compatUrl(mood)

  return (
    <Screen bottomInset={132}>
      <Spacing size={24} />

      {art !== null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
          <img
            src={art}
            alt=""
            aria-hidden
            className={MOTION.pop}
            style={{ width: '52%', maxWidth: 210, aspectRatio: '1 / 1', objectFit: 'contain', borderRadius: 24 }}
          />
        </div>
      )}

      <Spacing size={18} />

      {/*
        `report.headline` 은 `${result.score}점 · ${band.name}` 그대로라(buildCompatReport:271)
        아래 큰 점수·등급 배지와 **같은 말을 두 번** 하게 된다. 큰 숫자가 이 화면의 주인공이므로
        제목 자리는 두 사람이 누구인지에 내준다. 리포트 값을 고친 것이 아니라 안 그릴 뿐이다.
      */}
      <div className={MOTION.rise} {...stagger(0)} style={{ padding: '0 24px', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.5, color: NIGHT.textSub }}>
          {`${selfChart.pillars.day.ganji}(나) × ${screen.partnerChart.pillars.day.ganji}(상대분)`}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: NIGHT.textDim }}>일주로 본 두 사람</p>
      </div>

      <Spacing size={24} />

      <CompatReportView result={screen.result} report={report} accent={accent} />

      <BottomCTA
        accent={accent}
        onClick={onBack}
        secondary={{ label: '다른 사람', onClick: () => setScreen({ name: 'input' }) }}
      >
        내 결과로
      </BottomCTA>
    </Screen>
  )
}
