/**
 * 온보딩 화면의 로컬 상태.
 *
 * 근거: C00 §1.2.2(입력 필드) / §S0-4(삼주 모드) / §S0-3(출생지 기본값 서울).
 *
 * 리듀서를 React 밖 순수 함수로 두는 이유는 테스트 때문이다.
 * 전역 상태 라이브러리는 쓰지 않는다 — 이 화면 밖으로 새는 상태가 없다.
 */

import type { BirthDate, BirthTime } from './calendar'
import { isValidBirthDate } from './calendar'
import { DEFAULT_CITY_ID, findCityOrDefault } from './cities'
import type { BirthInput, SelfReportInput } from './schema'
import { birthInputSchema, selfReportSchema } from './schema'
import { EMPTY_MBTI_AXES, mbtiOf, type MbtiAxes } from './mbtiAxes'
import type { BloodTypeInput, CalendarType, Gender, SelfReport } from './types'

/**
 * 처음 서 있을 달력. 압도적 다수가 양력이고, 음력은 사용자가 명시적으로 고른다.
 * 기본값을 음력으로 두면 아무것도 고르지 않은 사용자의 사주가 통째로 달라진다.
 */
export const DEFAULT_CALENDAR_TYPE: CalendarType = 'solar'

export interface OnboardingDraft {
  /** 양력 / 음력 / 음력 윤달. `date` 의 세 숫자가 무엇을 뜻하는지를 정한다 */
  readonly calendarType: CalendarType
  /** null = 아직 고르지 않음. 기본값을 미리 채우면 사용자가 확인 없이 지나친다. */
  readonly date: BirthDate | null
  readonly time: BirthTime | null
  readonly timeUnknown: boolean
  readonly gender: Gender | null
  readonly cityId: string
  /**
   * 자기신고 값. **필수 입력**이다 — `collectMissingFields()` 가 이 둘도 보므로 비어 있으면
   * CTA 가 잠긴다.
   *
   * MBTI 는 **네 축을 따로 담는다.** 4글자 문자열만으로는 "두 축만 고른 상태"를 표현할 수
   * 없기 때문이다. 유형 문자열은 `mbtiOf(draft.mbtiAxes)` 로 파생한다 — 두 곳에 저장하면
   * 언젠가 어긋난다.
   *
   * 리포트 계층(`buildFactPack`·`renderTemplateReport`)은 계속 `null` 을 다룰 수 있어야 한다 —
   * 궁합 엔진은 빈 항목의 배점을 재분배하는 경로를 갖고 있고 그 경로는 그대로 산다.
   * 달라진 것은 **이 화면이 빈 값을 통과시키지 않는다**는 것뿐이다.
   */
  readonly mbtiAxes: MbtiAxes
  readonly blood: BloodTypeInput | null
}

/**
 * 휠이 처음 열릴 때 서 있을 자리.
 * `Date.now()` 로 "올해"를 잡으면 같은 코드가 날마다 다른 화면을 만든다(§F7 정신).
 */
export const SEED_DATE: BirthDate = { year: 1995, month: 1, day: 1 }
export const SEED_TIME: BirthTime = { hour: 12, minute: 0 }

export const INITIAL_DRAFT: OnboardingDraft = {
  calendarType: DEFAULT_CALENDAR_TYPE,
  date: null,
  time: null,
  timeUnknown: false,
  gender: null,
  cityId: DEFAULT_CITY_ID,
  mbtiAxes: EMPTY_MBTI_AXES,
  blood: null,
}

export type OnboardingAction =
  /** 날짜와 달력 종류는 **함께** 바뀐다 — 같은 세 숫자가 달력에 따라 다른 날을 가리키기 때문이다. */
  | { readonly type: 'setDate'; readonly calendarType: CalendarType; readonly date: BirthDate }
  /**
   * 날짜는 그대로 두고 달력만 바꾼다. 토스 프리필된 날짜가 **음력이었다**고 사용자가 답했을 때 쓴다
   * (`features/onboarding/tossPrefill.ts`) — 그 사용자에게 그 세 숫자는 음력 날짜다.
   * 새 달력에서 실재하지 않는 날짜가 되면(예: 음력에 31일은 없다) 비운다. 남겨 두면 CTA 아래에
   * 사용자가 고르지도 않은 값에 대한 오류가 뜬다.
   */
  | { readonly type: 'setCalendarType'; readonly calendarType: CalendarType }
  | { readonly type: 'setTime'; readonly time: BirthTime }
  | { readonly type: 'setTimeUnknown' }
  | { readonly type: 'setGender'; readonly gender: Gender }
  | { readonly type: 'setCity'; readonly cityId: string }
  /** `null` = 모름. 되돌릴 수 있어야 하므로 해제도 같은 액션으로 받는다. */
  | { readonly type: 'setMbtiAxis'; readonly patch: Partial<MbtiAxes> }
  | { readonly type: 'setBlood'; readonly blood: BloodTypeInput | null }

export function onboardingReducer(state: OnboardingDraft, action: OnboardingAction): OnboardingDraft {
  switch (action.type) {
    case 'setDate':
      return { ...state, calendarType: action.calendarType, date: action.date }
    case 'setCalendarType':
      return {
        ...state,
        calendarType: action.calendarType,
        date:
          state.date !== null && isValidBirthDate(action.calendarType, state.date) ? state.date : null,
      }
    case 'setTime':
      // 시각을 고르는 행위 자체가 "생시를 안다"는 선언이다.
      return { ...state, time: action.time, timeUnknown: false }
    case 'setTimeUnknown':
      return { ...state, time: null, timeUnknown: true }
    case 'setGender':
      return { ...state, gender: action.gender }
    case 'setCity':
      return { ...state, cityId: action.cityId }
    case 'setMbtiAxis':
      return { ...state, mbtiAxes: { ...state.mbtiAxes, ...action.patch } }
    case 'setBlood':
      return { ...state, blood: action.blood }
  }
}

/**
 * 화면 상태 → 자기신고 값. 최종 판정은 zod 스키마가 한다(화면 밖에서 들어온 값도 같은 문을 지난다).
 * 검증에 실패하면 "모름"으로 떨어뜨린다 — 이 값은 계산에 쓰이지 않으므로 리포트 섹션 하나가 빠질 뿐이다.
 */
export function buildSelfReport(draft: OnboardingDraft): SelfReport {
  const parsed = selfReportSchema.safeParse({ mbti: mbtiOf(draft.mbtiAxes), blood: draft.blood })
  const value: SelfReportInput = parsed.success ? parsed.data : { mbti: null, blood: null }
  return { mbti: value.mbti, blood: value.blood }
}

export type BuildBirthInputResult =
  | { readonly ok: true; readonly value: BirthInput }
  /** 아직 다 채우지 않았다 — CTA 를 잠근 채 두면 되고, 사용자에게 오류를 보일 필요는 없다. */
  | { readonly ok: false; readonly reason: 'incomplete'; readonly missing: readonly MissingField[] }
  /** 다 채웠는데 조합이 틀렸다 — 이건 사용자에게 알려야 한다. */
  | { readonly ok: false; readonly reason: 'invalid'; readonly messages: readonly string[] }

export type MissingField = 'date' | 'time' | 'gender' | 'mbti' | 'blood'

export function collectMissingFields(draft: OnboardingDraft): MissingField[] {
  const missing: MissingField[] = []
  if (draft.date === null) {
    missing.push('date')
  }
  if (!draft.timeUnknown && draft.time === null) {
    missing.push('time')
  }
  if (draft.gender === null) {
    missing.push('gender')
  }
  // MBTI·혈액형도 필수다. 계산에는 쓰이지 않지만 리포트의 항목 수를 좌우하므로,
  // 비운 채로 넘기면 사용자가 "왜 내 리포트는 짧지?" 를 알 길이 없다.
  // 네 축이 다 차야 유형이 된다. 두 축만 고른 상태는 "아직 안 고름" 과 같다.
  if (mbtiOf(draft.mbtiAxes) === null) {
    missing.push('mbti')
  }
  if (draft.blood === null) {
    missing.push('blood')
  }
  return missing
}

/** 화면 상태 → 엔진 입력. 최종 판정은 항상 zod 스키마가 한다. */
export function buildBirthInput(draft: OnboardingDraft): BuildBirthInputResult {
  const missing = collectMissingFields(draft)
  if (missing.length > 0) {
    return { ok: false, reason: 'incomplete', missing }
  }
  // collectMissingFields 가 비어 있으면 여기 두 값은 반드시 non-null 이지만,
  // 타입 시스템은 그 사실을 알 수 없다. 좁히기용 가드다.
  const date = draft.date
  const gender = draft.gender
  if (date === null || gender === null) {
    return { ok: false, reason: 'incomplete', missing: collectMissingFields(draft) }
  }

  const city = findCityOrDefault(draft.cityId)
  // 삼주 모드에서는 키 자체를 넣지 않는다. `hour: undefined` 로 넣으면 스키마는 통과하지만
  // 캐시 키·직렬화에서 "시각 없음"과 "시각 미정"이 구분되지 않는다.
  const timePart =
    draft.timeUnknown || draft.time === null ? {} : { hour: draft.time.hour, minute: draft.time.minute }

  const parsed = birthInputSchema.safeParse({
    calendarType: draft.calendarType,
    year: date.year,
    month: date.month,
    day: date.day,
    ...timePart,
    timeUnknown: draft.timeUnknown,
    gender,
    birthPlace: {
      latitude: city.latitude,
      longitude: city.longitude,
    },
  })

  if (parsed.success) {
    return { ok: true, value: parsed.data }
  }
  return { ok: false, reason: 'invalid', messages: parsed.error.issues.map((issue) => issue.message) }
}
