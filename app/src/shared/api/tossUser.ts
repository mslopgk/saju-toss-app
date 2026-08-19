/**
 * 토스 동의 데이터 경계 — 온보딩 입력을 줄이기 위한 생년월일·성별 프리필.
 *
 * 근거: ARCHITECTURE.md「외부 API 응답은 `shared/api` 경계에서 타입 검증한 뒤 내부로 넘긴다」/
 *       docs/decisions/0004-toss-prefill-boundary.md.
 *
 * ## 이 파일이 지키는 네 가지
 *
 * 1. **예외를 밖으로 내보내지 않는다.** 전부 판별 유니온(`TossPrefillResult`)으로 흡수한다.
 *    미니앱 WebView 에서 렌더 경로로 예외가 새면 사용자가 보는 것은 오류 화면이 아니라 흰 화면이다.
 *    SDK 는 실제로 던진다 — `User.getConsentedData` 는 `withUnsupportedThrow` 래퍼라 미지원 환경에서
 *    `UNSUPPORTED_APP_VERSION` 을 던지고, `isSupported()` 조차 WebView 밖(노드·브라우저 프리뷰)에서는
 *    `getConstant()` 가 `window` 를 읽다가 `ReferenceError` 를 던진다(실측).
 *
 * 2. **반환값을 믿지 않는다.** SDK 타입은 `Partial<Record<ConsentedUserDataKey, string>>` 이다 —
 *    전 필드 옵셔널이고 전부 `string` 이라 "생일이 `YYYY-MM-DD` 로 온다"는 보장이 **타입에 없다**.
 *    그래서 zod 로 형태를 검증하고, 날짜·성별 문자열은 여러 표기를 관대하게 파싱한다.
 *    단, **파싱 실패는 조용히 넘기지 않는다** — 값이 왔는데 못 읽었다면 프리필 전체를 실패로 만든다.
 *    반쯤 읽은 값으로 채우면 사용자가 눈치채지 못한 채 남의 생일로 사주를 본다.
 *
 * 3. **개인정보를 최소로 만진다.** `USER_NAME`·`USER_PHONE`·`USER_EMAIL`·`USER_ADDRESS` 는
 *    요청하지도, 읽지도, 저장하지도, 로그로 남기지도 않는다. 아래 zod 스키마는 `z.object()`(strip)라
 *    설령 응답에 그 키들이 섞여 와도 **파싱 결과 객체에서 사라진다** — 이 모듈 밖으로 나갈 길이 없다.
 *    특히 `USER_ADDRESS` 는 **거주지**다. 출생지로 쓰면 진태양시 보정 경도가 틀려 사주가 조용히 어긋난다.
 *
 * 4. **동의 항목 키를 하드코딩하지 않는다.** 콘솔에서 발급받는 값이라 소스에 박으면 환경마다 다른
 *    빌드가 필요해진다. 아직 미발급이므로 기본값은 빈 문자열이고, 그 상태에서는 SDK 를 **부르지 않고**
 *    `NOT_CONFIGURED` 를 낸다(화면은 그때 버튼 자체를 감춘다).
 *
 * ⚠ 이 모듈은 `console.*` 를 쓰지 않는다. 동의 데이터는 로그에 남기지 않는다.
 */

import { User } from '@apps-in-toss/web-framework'
import { z } from 'zod'

/**
 * 콘솔(앱인토스 파트너센터)에서 발급받는 동의 항목 키.
 *
 * 빈 문자열 = 미발급. `import.meta.env.VITE_TOSS_CONSENT_KEY` 로 덮어쓴다.
 * 콘솔에 등록할 동의 항목의 **필드 구성은 `USER_BIRTHDAY` + `USER_GENDER` 둘뿐**이어야 한다
 * (docs/decisions/0004-toss-prefill-boundary.md).
 */
export const DEFAULT_CONSENT_KEY = ''

/**
 * 모듈 로드 시점이 아니라 호출 시점에 읽는다.
 * 상수로 굳히면 테스트에서 `vi.stubEnv` 가 먹지 않고, 무엇보다 "미설정"이라는 상태를
 * 런타임에 다시 확인할 수 없게 된다.
 */
export function resolveConsentKey(): string {
  const parsed = z.string().safeParse(readConsentKeyOverride())
  const raw = parsed.success ? parsed.data : DEFAULT_CONSENT_KEY
  return raw.trim()
}

function readConsentKeyOverride(): unknown {
  try {
    // 리터럴 접근이라 빌드 시 정적 치환된다. vitest 는 치환하지 않으므로 `vi.stubEnv` 가 통한다.
    return import.meta.env.VITE_TOSS_CONSENT_KEY
  } catch {
    // 번들러 밖(순수 노드 등)에서 `import.meta.env` 가 없는 경우.
    return undefined
  }
}

export interface TossBirthday {
  readonly y: number
  readonly m: number
  readonly d: number
}

/** C00 §1.2.2 `RawBirthInput.gender` 와 같은 도메인이다(대운 방향 판정에 쓰인다). */
export type TossGender = 'M' | 'F'

/**
 * 프리필이 안 된 이유.
 *
 * | 값 | 뜻 | 화면 처리 |
 * |---|---|---|
 * | `UNSUPPORTED` | 토스 앱 버전이 낮거나 WebView 밖 | 버튼을 **숨긴다** |
 * | `NOT_CONFIGURED` | 동의 항목 키 미발급·미설정 | 버튼을 **숨긴다** |
 * | `DECLINED` | 사용자가 동의를 거부/취소 | 버튼은 두고 수동 입력으로 안내 |
 * | `FAILED` | 그 외(형식 파손·브릿지 오류) | 버튼은 두고 수동 입력으로 안내 |
 */
export type TossPrefillFailure = 'UNSUPPORTED' | 'DECLINED' | 'NOT_CONFIGURED' | 'FAILED'

/**
 * `ok: true` 인데 두 필드가 다 없을 수 있다 — 호출은 성공했지만 동의 항목에 쓸 값이 없는 경우다.
 * "성공"과 "채울 값이 있음"은 다른 사실이라 합치지 않는다.
 */
export type TossPrefillResult =
  | { readonly ok: true; readonly birthday?: TossBirthday; readonly gender?: TossGender }
  | { readonly ok: false; readonly reason: TossPrefillFailure }

/**
 * 응답 형태 검증.
 *
 * `z.object()` 는 모르는 키를 **버린다**(strip). 그래서 이름·전화·이메일·주소가 섞여 와도
 * 파싱 결과에는 남지 않는다 — 최소수집을 주석이 아니라 타입·런타임 양쪽에서 강제한다.
 */
const consentedUserDataSchema = z.object({
  USER_BIRTHDAY: z.string().optional(),
  USER_GENDER: z.string().optional(),
})

/** 날짜 문자열의 값 범위. 실재 날짜(2월 30일 등)·지원 연도 판정은 도메인 계층이 한다(아래 주석). */
const birthdayPartsSchema = z.object({
  y: z.number().int().min(1000).max(9999),
  m: z.number().int().min(1).max(12),
  d: z.number().int().min(1).max(31),
})

/** `19950305` — 구분자 없는 8자리. 자릿수를 고정해야 `1995305` 같은 값을 조용히 삼키지 않는다. */
const COMPACT_BIRTHDAY = /^(\d{4})(\d{2})(\d{2})$/
/** `1995-03-05` · `1995.3.5` · `1995/03/05` */
const SEPARATED_BIRTHDAY = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/

/**
 * 생일 문자열 → 연·월·일.
 *
 * ⚠ **날짜+시각 문자열(`1995-03-05T00:00:00Z`)은 일부러 거부한다.** 앞 10자를 잘라 쓰면
 * UTC 자정으로 직렬화된 KST 생일이 하루 앞당겨진 채 통과한다. 그건 계산이 조용히 틀리는 경로다 —
 * 못 읽는 편이 낫다(호출자는 `FAILED` 를 받아 수동 입력으로 되돌린다).
 *
 * 실재하지 않는 날짜(2023-02-30)와 지원 연도(1900~2100) 판정은 **여기서 하지 않는다**.
 * 그 규칙은 `features/onboarding/calendar.ts` 의 `isValidSolarDate` 한 곳에 있고,
 * `shared` 는 기능 도메인을 import 할 수 없다(ARCHITECTURE.md 의존 방향). 같은 달력 규칙을
 * 두 벌 두면 언젠가 어긋나므로, 이 경계는 **형식**만 판정하고 도메인 판정은 도메인에 맡긴다.
 */
export function parseTossBirthday(raw: string): TossBirthday | null {
  const text = raw.trim()
  const matched = COMPACT_BIRTHDAY.exec(text) ?? SEPARATED_BIRTHDAY.exec(text)
  if (matched === null) {
    return null
  }
  const parsed = birthdayPartsSchema.safeParse({
    y: Number(matched[1]),
    m: Number(matched[2]),
    d: Number(matched[3]),
  })
  return parsed.success ? parsed.data : null
}

/**
 * 성별 문자열 → `M` | `F`.
 *
 * 프로토타입 오염을 피하려고 `Map` 을 쓴다(객체 리터럴은 `constructor` 같은 키가 값처럼 보인다).
 * 숫자 코드(`1`/`2`, 주민번호 성별코드)는 **받지 않는다** — 체계마다 뜻이 달라 추측하면 반반 확률로 틀린다.
 */
const GENDER_BY_TOKEN = new Map<string, TossGender>([
  ['M', 'M'],
  ['MALE', 'M'],
  ['MAN', 'M'],
  ['남', 'M'],
  ['남성', 'M'],
  ['남자', 'M'],
  ['F', 'F'],
  ['FEMALE', 'F'],
  ['WOMAN', 'F'],
  ['여', 'F'],
  ['여성', 'F'],
  ['여자', 'F'],
])

export function parseTossGender(raw: string): TossGender | null {
  return GENDER_BY_TOKEN.get(raw.trim().toUpperCase()) ?? null
}

/**
 * `User.getConsentedData.isSupported()` 위임.
 *
 * WebView 밖에서는 이 호출 자체가 `ReferenceError: window is not defined` 를 던진다(실측).
 * 그래서 위임이지만 try/catch 가 필요하다 — 렌더 중에 부르는 함수라 여기서 새면 화면이 비어 버린다.
 */
export function isPrefillSupported(): boolean {
  try {
    return User.getConsentedData.isSupported() === true
  } catch {
    return false
  }
}

/** 동의 항목 키가 발급·주입되었는지. 미설정이면 SDK 를 부를 이유가 없다. */
export function isPrefillConfigured(): boolean {
  return resolveConsentKey() !== ''
}

/**
 * 화면이 "토스 정보로 채우기" 버튼을 **그릴지 말지** 판정하는 단 하나의 조건.
 * 눌러 봐야 실패할 버튼은 애초에 보이지 않아야 한다(에러 토스트로 알리지 않는다).
 */
export function isPrefillAvailable(): boolean {
  return isPrefillConfigured() && isPrefillSupported()
}

export interface FetchTossProfileOptions {
  /**
   * 이전에 거부한 사용자에게 약관 웹뷰를 다시 띄울지. 기본은 `false` 다.
   * 첫 시도에서 자동으로 다시 띄우면 거부 의사를 무시하는 꼴이라, 사용자가 버튼을 **다시 눌렀을 때만** 켠다.
   */
  readonly requestAgreementAgain?: boolean
}

/**
 * 토스 동의 데이터로 생년월일·성별을 받아온다. **절대 throw 하지 않는다.**
 */
export async function fetchTossProfile(
  consentedUserDataKey: string = resolveConsentKey(),
  options: FetchTossProfileOptions = {},
): Promise<TossPrefillResult> {
  const key = consentedUserDataKey.trim()
  // 키가 없으면 SDK 를 건드리지 않는다. 빈 키로 부르면 약관 웹뷰가 뜨거나 INVALID_REQUEST 가 나는데,
  // 둘 다 사용자에게는 "눌렀더니 이상한 게 떴다"로만 보인다.
  if (key === '') {
    return { ok: false, reason: 'NOT_CONFIGURED' }
  }
  if (!isPrefillSupported()) {
    return { ok: false, reason: 'UNSUPPORTED' }
  }

  let raw: unknown
  try {
    raw = await User.getConsentedData({
      consentedUserDataKey: key,
      shouldRequestAgreementWhenUserDeclined: options.requestAgreementAgain === true,
    })
  } catch (error) {
    return { ok: false, reason: reasonOfError(error) }
  }

  // SDK 계약: 미지원 토스 앱 버전에서는 `undefined`.
  if (raw === undefined || raw === null) {
    return { ok: false, reason: 'UNSUPPORTED' }
  }

  const parsed = consentedUserDataSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, reason: 'FAILED' }
  }

  const { USER_BIRTHDAY, USER_GENDER } = parsed.data

  let birthday: TossBirthday | undefined
  if (USER_BIRTHDAY !== undefined && USER_BIRTHDAY.trim() !== '') {
    const value = parseTossBirthday(USER_BIRTHDAY)
    if (value === null) {
      // 값은 왔는데 못 읽었다 → 조용히 넘어가지 않는다.
      return { ok: false, reason: 'FAILED' }
    }
    birthday = value
  }

  let gender: TossGender | undefined
  if (USER_GENDER !== undefined && USER_GENDER.trim() !== '') {
    const value = parseTossGender(USER_GENDER)
    if (value === null) {
      return { ok: false, reason: 'FAILED' }
    }
    gender = value
  }

  // 값이 하나도 없어도 호출은 성공이다. "채울 게 없다"는 판단은 화면이 한다.
  return { ok: true, ...(birthday === undefined ? {} : { birthday }), ...(gender === undefined ? {} : { gender }) }
}

/**
 * SDK 오류 → 실패 사유.
 *
 * 브릿지 오류는 `Error` 에 `code`(없으면 `name`)로 실려 온다(SDK `createUnknownError` ·
 * `createUnsupportedAppVersionError` 가 둘 다 채운다). 문자열을 그대로 던지는 경로도 있을 수 있어
 * 방어적으로 읽는다. 모르는 코드는 전부 `FAILED` 다 — 새 코드가 생겼을 때 조용히 "성공"이 되면 안 된다.
 */
const REASON_BY_ERROR_CODE = new Map<string, TossPrefillFailure>([
  // GetConsentedUserDataErrorCode
  ['USER_DECLINED', 'DECLINED'],
  ['CANCELED', 'DECLINED'],
  ['UNAVAILABLE', 'UNSUPPORTED'],
  ['TERMS_NOT_SET', 'NOT_CONFIGURED'],
  // 잘못된 키·파라미터는 사용자가 고칠 수 없다. 재시도를 권하지 말고 버튼을 감춘다.
  ['INVALID_REQUEST', 'NOT_CONFIGURED'],
  ['CONSENTED_USER_DATA_AGREEMENT_FAILED', 'FAILED'],
  ['CONSENTED_USER_DATA_INVALID_DATA', 'FAILED'],
  // withUnsupportedThrow 래퍼가 던지는 코드
  ['UNSUPPORTED_APP_VERSION', 'UNSUPPORTED'],
  ['UNSUPPORTED_OS_VERSION', 'UNSUPPORTED'],
])

function reasonOfError(error: unknown): TossPrefillFailure {
  return REASON_BY_ERROR_CODE.get(errorCodeOf(error)) ?? 'FAILED'
}

function errorCodeOf(error: unknown): string {
  if (typeof error === 'string') {
    return error.trim()
  }
  if (error !== null && typeof error === 'object') {
    const bag = error as { readonly code?: unknown; readonly name?: unknown }
    if (typeof bag.code === 'string' && bag.code !== '') {
      return bag.code
    }
    if (typeof bag.name === 'string') {
      return bag.name
    }
  }
  return ''
}
