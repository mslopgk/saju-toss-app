/**
 * 입력 온보딩 기능의 공개 표면.
 * 이 파일에 없는 것은 기능 내부 구현이다 — 바깥에서 직접 import 하지 않는다.
 */

export { OnboardingForm } from './components/OnboardingForm'
export type { OnboardingFormProps } from './components/OnboardingForm'

export { DEFAULT_CALENDAR_TYPE, buildSelfReport } from './formState'

export { birthInputSchema, birthPlaceSchema, parseBirthInput, selfReportSchema } from './schema'
export type { BirthInput, BirthInputParseResult, BirthPlaceInput, SelfReportInput } from './schema'

export { EMPTY_SELF_REPORT, MBTI_TYPES } from './types'
export type { BloodTypeInput, CalendarType, Gender, MbtiType, SelfReport } from './types'
export type { BirthDate, BirthMonth, BirthTime } from './calendar'
export {
  MAX_BIRTH_YEAR,
  MIN_BIRTH_YEAR,
  describeBirthDate,
  formatBirthDate,
  formatBirthTime,
  isValidBirthDate,
  monthsOf,
} from './calendar'

export { CITIES, DEFAULT_CITY_ID, findCity, findCityOrDefault } from './cities'
export type { City } from './cities'
