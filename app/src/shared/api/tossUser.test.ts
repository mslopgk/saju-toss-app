/**
 * 토스 동의 데이터 경계 단위 테스트.
 *
 * SDK 는 WebView 브릿지라 노드에서 실행할 수 없다(실제로 `isSupported()` 만 불러도
 * `ReferenceError: window is not defined` 가 난다). 그래서 모듈째 모킹하고 **경계 로직만** 검증한다:
 * 실패 사유 매핑 · 문자열 파싱 변형 · `undefined` 반환 · 개인정보 미수집.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const isSupported = vi.fn<() => boolean>(() => true)
  const getConsentedData = Object.assign(vi.fn<(options: unknown) => Promise<unknown>>(), {
    isSupported,
    MIN_TOSS_APP_VERSION: { android: '5.264.0', ios: '5.264.0' },
  })
  return { getConsentedData, isSupported }
})

vi.mock('@apps-in-toss/web-framework', () => ({
  User: { getConsentedData: mocks.getConsentedData },
}))

import {
  DEFAULT_CONSENT_KEY,
  fetchTossProfile,
  isPrefillAvailable,
  isPrefillConfigured,
  isPrefillSupported,
  parseTossBirthday,
  parseTossGender,
  resolveConsentKey,
} from './tossUser'

const KEY = 'cud_sajumix_birth'

beforeEach(() => {
  // 로컬 `.env` 유무에 결과가 달라지지 않도록 "미설정"을 명시적으로 만든다.
  vi.stubEnv('VITE_TOSS_CONSENT_KEY', '')
  mocks.isSupported.mockReset()
  mocks.isSupported.mockReturnValue(true)
  mocks.getConsentedData.mockReset()
  mocks.getConsentedData.mockResolvedValue({})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('동의 항목 키', () => {
  it('기본값은 미발급(빈 문자열)이다 — 소스에 키를 박지 않는다', () => {
    expect(DEFAULT_CONSENT_KEY).toBe('')
    expect(resolveConsentKey()).toBe('')
    expect(isPrefillConfigured()).toBe(false)
  })

  it('import.meta.env 로 덮어쓸 수 있고 공백은 다듬는다', () => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', `  ${KEY}  `)
    expect(resolveConsentKey()).toBe(KEY)
    expect(isPrefillConfigured()).toBe(true)
  })

  it('미설정이면 SDK 를 부르지 않고 NOT_CONFIGURED 를 낸다', async () => {
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'NOT_CONFIGURED' })
    expect(mocks.getConsentedData).not.toHaveBeenCalled()
  })

  it('빈 키를 명시적으로 넘겨도 마찬가지다', async () => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
    await expect(fetchTossProfile('   ')).resolves.toEqual({ ok: false, reason: 'NOT_CONFIGURED' })
    expect(mocks.getConsentedData).not.toHaveBeenCalled()
  })
})

describe('isPrefillSupported', () => {
  it('SDK 판정을 그대로 위임한다', () => {
    mocks.isSupported.mockReturnValue(true)
    expect(isPrefillSupported()).toBe(true)
    mocks.isSupported.mockReturnValue(false)
    expect(isPrefillSupported()).toBe(false)
  })

  it('WebView 밖에서 SDK 가 던져도 false 로 흡수한다 (실측: ReferenceError: window is not defined)', () => {
    mocks.isSupported.mockImplementation(() => {
      throw new ReferenceError('window is not defined')
    })
    expect(isPrefillSupported()).toBe(false)
  })

  it('isPrefillAvailable 은 지원 + 설정을 모두 요구한다', () => {
    mocks.isSupported.mockReturnValue(true)
    expect(isPrefillAvailable()).toBe(false) // 키 미설정

    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
    expect(isPrefillAvailable()).toBe(true)

    mocks.isSupported.mockReturnValue(false)
    expect(isPrefillAvailable()).toBe(false)
  })
})

describe('fetchTossProfile — 실패 사유', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
  })

  it('미지원 버전이면 SDK 를 부르지 않고 UNSUPPORTED', async () => {
    mocks.isSupported.mockReturnValue(false)
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'UNSUPPORTED' })
    expect(mocks.getConsentedData).not.toHaveBeenCalled()
  })

  it('SDK 가 undefined 를 반환하면 UNSUPPORTED (미지원 토스 앱 버전 계약)', async () => {
    mocks.getConsentedData.mockResolvedValue(undefined)
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'UNSUPPORTED' })
  })

  it.each([
    ['USER_DECLINED', 'DECLINED'],
    ['CANCELED', 'DECLINED'],
    ['UNAVAILABLE', 'UNSUPPORTED'],
    ['TERMS_NOT_SET', 'NOT_CONFIGURED'],
    ['INVALID_REQUEST', 'NOT_CONFIGURED'],
    ['CONSENTED_USER_DATA_AGREEMENT_FAILED', 'FAILED'],
    ['CONSENTED_USER_DATA_INVALID_DATA', 'FAILED'],
    ['UNSUPPORTED_APP_VERSION', 'UNSUPPORTED'],
  ])('error.code=%s → %s', async (code, reason) => {
    const error = Object.assign(new Error('bridge'), { code })
    mocks.getConsentedData.mockRejectedValue(error)
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason })
  })

  it('code 가 없으면 name 으로 판정한다', async () => {
    const error = new Error('too old')
    error.name = 'UNSUPPORTED_APP_VERSION'
    mocks.getConsentedData.mockRejectedValue(error)
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'UNSUPPORTED' })
  })

  it('문자열을 그대로 던져도 읽는다', async () => {
    mocks.getConsentedData.mockRejectedValue('USER_DECLINED')
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'DECLINED' })
  })

  it.each([
    ['모르는 코드', Object.assign(new Error('?'), { code: 'SOMETHING_NEW' })],
    ['null', null],
    ['undefined', undefined],
    ['숫자', 42],
    ['평범한 Error', new Error('boom')],
  ])('%s 를 던져도 throw 하지 않고 FAILED 로 흡수한다', async (_label, thrown) => {
    mocks.getConsentedData.mockRejectedValue(thrown)
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'FAILED' })
  })

  it.each([
    ['문자열 응답', 'ok'],
    ['배열 응답', []],
    ['숫자 응답', 1],
    ['필드 타입이 string 이 아닌 응답', { USER_BIRTHDAY: 19950305 }],
  ])('%s 는 zod 가 막고 FAILED', async (_label, payload) => {
    mocks.getConsentedData.mockResolvedValue(payload)
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'FAILED' })
  })
})

describe('fetchTossProfile — 값 파싱', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
  })

  it.each([
    ['1995-03-05', { y: 1995, m: 3, d: 5 }],
    ['19950305', { y: 1995, m: 3, d: 5 }],
    ['1995.03.05', { y: 1995, m: 3, d: 5 }],
    ['1995/3/5', { y: 1995, m: 3, d: 5 }],
    ['  1995-3-5  ', { y: 1995, m: 3, d: 5 }],
    ['2000-12-31', { y: 2000, m: 12, d: 31 }],
  ])('생일 %s 를 읽는다', async (raw, expected) => {
    mocks.getConsentedData.mockResolvedValue({ USER_BIRTHDAY: raw })
    await expect(fetchTossProfile()).resolves.toEqual({ ok: true, birthday: expected })
  })

  it.each([
    ['1995-3', '자릿수 부족'],
    ['950305', '두 자리 연도'],
    ['1995305', '구분자 없이 7자리'],
    ['1995-13-05', '13월'],
    ['1995-00-05', '0월'],
    ['1995-03-32', '32일'],
    ['생일없음', '아무 문자열'],
    ['1995년 3월 5일', '한글 표기'],
  ])('깨진 생일 %s (%s) 는 조용히 넘기지 않고 FAILED', async (raw) => {
    mocks.getConsentedData.mockResolvedValue({ USER_BIRTHDAY: raw })
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'FAILED' })
  })

  it('날짜+시각 문자열은 일부러 거부한다 (UTC 자정 직렬화가 하루를 당긴다)', async () => {
    mocks.getConsentedData.mockResolvedValue({ USER_BIRTHDAY: '1995-03-05T00:00:00Z' })
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'FAILED' })
    expect(parseTossBirthday('1995-03-05T00:00:00Z')).toBeNull()
  })

  it.each([
    ['M', 'M'],
    ['MALE', 'M'],
    ['male', 'M'],
    ['남', 'M'],
    ['남성', 'M'],
    ['F', 'F'],
    ['female', 'F'],
    ['여', 'F'],
    ['여자', 'F'],
    [' f ', 'F'],
  ])('성별 %s 를 %s 로 읽는다', async (raw, expected) => {
    mocks.getConsentedData.mockResolvedValue({ USER_GENDER: raw })
    await expect(fetchTossProfile()).resolves.toEqual({ ok: true, gender: expected })
  })

  it.each(['1', '2', 'X', 'OTHER', '남녀'])('추측할 수 없는 성별 %s 는 FAILED', async (raw) => {
    mocks.getConsentedData.mockResolvedValue({ USER_GENDER: raw })
    await expect(fetchTossProfile()).resolves.toEqual({ ok: false, reason: 'FAILED' })
    expect(parseTossGender(raw)).toBeNull()
  })

  it('둘 다 오면 둘 다 채운다', async () => {
    mocks.getConsentedData.mockResolvedValue({ USER_BIRTHDAY: '19901231', USER_GENDER: 'FEMALE' })
    await expect(fetchTossProfile()).resolves.toEqual({
      ok: true,
      birthday: { y: 1990, m: 12, d: 31 },
      gender: 'F',
    })
  })

  it('빈 응답은 실패가 아니다 — 성공했지만 채울 값이 없는 상태', async () => {
    mocks.getConsentedData.mockResolvedValue({})
    await expect(fetchTossProfile()).resolves.toEqual({ ok: true })
  })

  it('빈 문자열 필드는 "값 없음"으로 본다 (파손이 아니다)', async () => {
    mocks.getConsentedData.mockResolvedValue({ USER_BIRTHDAY: '', USER_GENDER: '   ' })
    await expect(fetchTossProfile()).resolves.toEqual({ ok: true })
  })
})

describe('개인정보 최소수집', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
  })

  it('이름·전화·이메일·주소가 섞여 와도 경계 밖으로 내보내지 않는다', async () => {
    mocks.getConsentedData.mockResolvedValue({
      USER_BIRTHDAY: '1995-03-05',
      USER_GENDER: 'M',
      USER_NAME: '홍길동',
      USER_PHONE: '01012345678',
      USER_EMAIL: 'a@b.c',
      USER_ADDRESS: '서울시 어딘가',
      USER_NATIONALITY: 'KR',
      USER_CONSUMPTION_HISTORY: '{}',
    })
    const result = await fetchTossProfile()
    expect(result).toEqual({ ok: true, birthday: { y: 1995, m: 3, d: 5 }, gender: 'M' })
    // 직렬화해도 흔적이 없어야 한다(로그·캐시로 새는 경로를 함께 막는다).
    expect(JSON.stringify(result)).not.toMatch(/홍길동|01012345678|a@b\.c|서울시/)
  })

  it('동의 데이터를 콘솔에 남기지 않는다', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.getConsentedData.mockResolvedValue({ USER_BIRTHDAY: '1995-03-05', USER_NAME: '홍길동' })
    await fetchTossProfile()
    mocks.getConsentedData.mockRejectedValue(Object.assign(new Error('x'), { code: 'USER_DECLINED' }))
    await fetchTossProfile()
    expect(log).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('요청 옵션', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TOSS_CONSENT_KEY', KEY)
  })

  it('기본은 거부한 사용자에게 약관을 다시 띄우지 않는다', async () => {
    await fetchTossProfile()
    expect(mocks.getConsentedData).toHaveBeenCalledWith({
      consentedUserDataKey: KEY,
      shouldRequestAgreementWhenUserDeclined: false,
    })
  })

  it('사용자가 다시 눌렀을 때만 약관을 다시 띄운다', async () => {
    await fetchTossProfile(undefined, { requestAgreementAgain: true })
    expect(mocks.getConsentedData).toHaveBeenCalledWith({
      consentedUserDataKey: KEY,
      shouldRequestAgreementWhenUserDeclined: true,
    })
  })

  it('요청에 개인정보 키를 싣지 않는다', async () => {
    await fetchTossProfile()
    const [options] = mocks.getConsentedData.mock.calls[0] ?? []
    expect(Object.keys(options as object).sort()).toEqual(
      ['consentedUserDataKey', 'shouldRequestAgreementWhenUserDeclined'].sort(),
    )
  })
})
