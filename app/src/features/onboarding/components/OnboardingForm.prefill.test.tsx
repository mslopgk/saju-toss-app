/**
 * 온보딩 폼 렌더 스모크 — 프리필 진입점.
 *
 * jsdom 없이 `react-dom/server` 로 정적 렌더한다(test/smoke/app-render.test.tsx 와 같은 이유).
 * 보는 것은 두 가지뿐이다: **예외 없이 그려지는가**, **버튼이 있어야 할 때만 있는가**.
 *
 * SDK 는 브라우저 전용이라 모듈째 모킹한다. 특히 `isSupported()` 는 WebView 밖에서 `window` 를 읽다가
 * 던지는데, 그게 렌더 중이면 사용자는 오류 화면이 아니라 **흰 화면**을 본다. 그 경로를 여기서 고정한다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const isSupported = vi.fn<() => boolean>(() => false)
  return { isSupported }
})

vi.mock('@apps-in-toss/web-framework', () => ({
  User: {
    getConsentedData: Object.assign(vi.fn(), { isSupported: mocks.isSupported }),
  },
}))

import { OnboardingForm } from './OnboardingForm'
import { PREFILL_BUTTON_LABEL, SOLAR_CONFIRM_QUESTION } from '../tossPrefill'

const KEY = 'cud_sajumix_birth'

function renderForm(): string {
  return renderToString(
    <TDSMobileAITProvider>
      <OnboardingForm onSubmit={() => {}} />
    </TDSMobileAITProvider>,
  )
}

beforeEach(() => {
  vi.stubEnv('VITE_TOSS_CONSENT_KEY', '')
  mocks.isSupported.mockReset()
  mocks.isSupported.mockReturnValue(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('프리필 진입점 렌더', () => {
  it('미지원 환경에서도 온보딩이 정상 렌더되고 버튼은 없다', () => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
    mocks.isSupported.mockReturnValue(false)

    const html = renderForm()
    expect(html).toContain('언제 태어났는지 알려주세요')
    expect(html).toContain('태어난 시각')
    expect(html).not.toContain(PREFILL_BUTTON_LABEL)
  })

  it('동의 항목 키가 없으면(현재 콘솔 상태) 버튼을 그리지 않는다', () => {
    mocks.isSupported.mockReturnValue(true)

    const html = renderForm()
    expect(html).toContain('언제 태어났는지 알려주세요')
    expect(html).not.toContain(PREFILL_BUTTON_LABEL)
  })

  it('SDK 가 렌더 중에 던져도 화면이 죽지 않는다 (WebView 밖: window is not defined)', () => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
    mocks.isSupported.mockImplementation(() => {
      throw new ReferenceError('window is not defined')
    })

    const html = renderForm()
    expect(html).toContain('언제 태어났는지 알려주세요')
    expect(html).not.toContain(PREFILL_BUTTON_LABEL)
  })

  it('지원 + 설정이 모두 되면 버튼이 나온다 (위 단언이 헛돌지 않는지)', () => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
    mocks.isSupported.mockReturnValue(true)

    const html = renderForm()
    expect(html).toContain(PREFILL_BUTTON_LABEL)
    // 최소수집을 화면에서도 밝힌다.
    expect(html).toContain('이름·연락처·주소는 가져오지 않아요')
  })

  it('양력 확인은 프리필된 날짜가 있을 때만 나온다 (초기 렌더에는 없다)', () => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
    mocks.isSupported.mockReturnValue(true)

    expect(renderForm()).not.toContain(SOLAR_CONFIRM_QUESTION)
  })
})
