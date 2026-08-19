import { useState } from 'react'
import { Button, FixedBottomCTA, Spacing, Top } from '@toss/tds-mobile'
import { EngineError, computeChart, type Chart, type RawBirthInput } from '../shared/lib/saju'
import {
  computeCompatibility,
  type CompatProfile,
  type CompatResult,
} from '../shared/lib/compat'
import { CompatReportView, PartnerForm, buildCompatReport } from '../features/compat'
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

  return (
    <main>
      <Top
        title={report.headline}
        subtitleBottom={`${selfChart.pillars.day.ganji}(나) × ${screen.partnerChart.pillars.day.ganji}(상대분) · 일주로 본 두 사람`}
      />
      <Spacing size={8} />
      <CompatReportView result={screen.result} report={report} />
      <Spacing size={24} />
      <FixedBottomCTA.Double
        leftButton={
          <Button
            display="block"
            size="large"
            color="dark"
            variant="weak"
            onClick={() => setScreen({ name: 'input' })}
          >
            다른 사람과 보기
          </Button>
        }
        rightButton={
          <Button display="block" size="large" color="primary" variant="fill" onClick={onBack}>
            내 결과로
          </Button>
        }
      />
    </main>
  )
}
