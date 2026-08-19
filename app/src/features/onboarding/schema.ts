/**
 * 온보딩 입력의 검증 경계.
 *
 * 근거: C00 §1.2.2 `RawBirthInput` / §S0-1(범위 가드) / §S0-3(출생지) / §S0-4(삼주 모드).
 *
 * 여기서 막는 것은 **화면이 만들어 낼 수 있는 잘못된 조합**뿐이다.
 * 절기 테이블·해외 표준시 이력처럼 데이터가 필요한 판정은 엔진 S0 이 하고
 * `EngineError`(`OUT_OF_RANGE` / `MISSING_TZ` …)로 알린다.
 * 같은 판정을 화면에서 흉내 내면 두 벌이 되어 언젠가 어긋난다.
 *
 * 음력(`lunar` / `lunar_leap`)도 받는다. 실재 여부 판정은 화면과 엔진이 **같은 표**를 본다
 * (`shared/lib/saju/lunar`, C00 §4.1 A7) — 두 벌이 아니므로 화면이 먼저 걸러도 어긋나지 않는다.
 * 다만 **양력 환산 후 지원 범위**(§S0-1)는 여기서 보지 않는다. 그건 엔진의 판정이고, 그 규칙을
 * 여기 복제하면 두 벌이 된다.
 */

import { z } from 'zod'
import { MAX_BIRTH_YEAR, MIN_BIRTH_YEAR, isValidBirthDate } from './calendar'
import { MBTI_TYPES } from './types'

export const calendarTypeSchema = z.enum(['solar', 'lunar', 'lunar_leap'])
export const genderSchema = z.enum(['M', 'F'])

/**
 * 자기신고 값의 검증 경계.
 *
 * `null` 이 정상값이다("모름"). 화면은 선택을 강제하지 않고, 리포트가 없는 섹션을 건너뛴다.
 * MBTI 는 16유형 화이트리스트로 좁힌다 — 자유 입력을 허용하면 카드 조회(`mbti:{코드}`)가
 * 조용히 빈 결과를 낸다.
 */
export const selfReportSchema = z.object({
  mbti: z.enum(MBTI_TYPES).nullable(),
  blood: z.enum(['A', 'B', 'O', 'AB']).nullable(),
})

/**
 * C00 §1.2.2 `RawBirthInput.birthPlace`.
 *
 * `regionCode` 는 선택 항목이다 — 엔진 쪽 시/군/구 코드표가 확정되기 전까지 이 화면은
 * 좌표만 넘긴다(`cities.ts` 주석 참고). 좌표를 넘기지 않는 경로를 열어두면
 * 엔진이 `MISSING_PLACE` 를 던질 수 있으므로 좌표는 필수로 둔다.
 */
export const birthPlaceSchema = z.object({
  regionCode: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** 표시·감사용 라벨. 오프셋의 진실값은 아래 두 필드다(C00 §1.2.2). */
  ianaTz: z.string().min(1).optional(),
  /** 해외 출생 필수. v1 국내 도시 목록에서는 쓰지 않는다. */
  stdOffsetMinutes: z.number().int().min(-720).max(840).optional(),
  /** 해외 출생 필수. 0 | 60 만 허용(C00 §1.2.2). */
  dstMinutes: z.union([z.literal(0), z.literal(60)]).optional(),
})

const birthInputShape = z.object({
  calendarType: calendarTypeSchema,
  year: z.number().int().min(MIN_BIRTH_YEAR).max(MAX_BIRTH_YEAR),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  timeUnknown: z.boolean(),
  gender: genderSchema,
  birthPlace: birthPlaceSchema,
})

export const birthInputSchema = birthInputShape.superRefine((value, ctx) => {
  // 삼주 모드(§S0-4)에서 hour/minute 가 남아 있으면 엔진이 12:00 가정을 덮어쓸지
  // 사용자 입력을 쓸지 알 수 없다. 둘 중 하나만 참이어야 한다.
  if (value.timeUnknown) {
    if (value.hour !== undefined || value.minute !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['timeUnknown'],
        message: '생시를 모른다고 했는데 시각이 함께 들어왔어요.',
      })
    }
  } else if (value.hour === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['hour'],
      message: '태어난 시각을 골라 주세요. 모르면 "시간을 모르겠어요"를 눌러 주세요.',
    })
  }

  // C00 §1.2.2: "minute 은 hour 있으면 필수(없으면 0)". 화면이 0 을 명시해 넘긴다.
  if (value.hour !== undefined && value.minute === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['minute'],
      message: '분이 비어 있어요.',
    })
  }

  // 2023-02-29(양력) · 2024년 윤5월(없는 윤달) · 소월의 30일 같은 비실재 날짜 거부(§S0-1 / §S0-2).
  if (!isValidBirthDate(value.calendarType, value)) {
    ctx.addIssue({
      code: 'custom',
      path: ['day'],
      message:
        value.calendarType === 'solar'
          ? '달력에 없는 날짜예요.'
          : '그 해에는 없는 음력 날짜예요. 윤달 여부와 날짜를 다시 확인해 주세요.',
    })
  }
})

/**
 * 계산 엔진에 넘길 출생 입력.
 *
 * C00 §1.2.2 `RawBirthInput` 에서 `mbti` / `blood` 를 뺀 형태다.
 * 두 값은 다음 화면(MBTI·혈액형 입력)이 채우며, `RawBirthInput` 에서 optional 이므로
 * 이 타입은 그대로 `RawBirthInput` 에 대입 가능하다.
 */
export type BirthInput = z.output<typeof birthInputSchema>
export type BirthPlaceInput = z.output<typeof birthPlaceSchema>
export type SelfReportInput = z.output<typeof selfReportSchema>

export type BirthInputParseResult =
  | { readonly ok: true; readonly value: BirthInput }
  | { readonly ok: false; readonly messages: readonly string[] }

/** 화면 밖(로컬스토리지·딥링크 등)에서 들어온 값도 이 함수를 통과해야 한다. */
export function parseBirthInput(input: unknown): BirthInputParseResult {
  const parsed = birthInputSchema.safeParse(input)
  if (parsed.success) {
    return { ok: true, value: parsed.data }
  }
  return { ok: false, messages: parsed.error.issues.map((issue) => issue.message) }
}
