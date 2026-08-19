import { OnboardingForm } from '../features/onboarding'
import type { BirthInput, SelfReport } from '../features/onboarding'

/**
 * 입력 온보딩 화면.
 *
 * docs/product.md 핵심 흐름 1단계. 완성된 입력을 위로 넘기기만 하고, 계산과 화면 전환은
 * 조합 계층(App.tsx)이 한다. 엔진이 입력을 거절하면 그 문구가 `engineError` 로 되돌아온다.
 */
export interface OnboardingPageProps {
  /**
   * 검증을 통과한 출생 입력과 자기신고 값(MBTI·혈액형). 다음 화면으로 넘길 책임은 호출자에게 있다.
   * 자기신고 값은 계산에 쓰이지 않으므로 출생 입력과 합치지 않고 따로 넘긴다.
   */
  onComplete: (input: BirthInput, selfReport: SelfReport) => void
  /** 계산 엔진이 거절한 이유(사용자 문구). 없으면 null. */
  engineError?: string | null
}

export function OnboardingPage({ onComplete, engineError = null }: OnboardingPageProps) {
  return <OnboardingForm onSubmit={onComplete} engineError={engineError} />
}
