/**
 * 온보딩 입력의 원시 타입.
 *
 * 근거: C00 §1.2.2 `RawBirthInput`. 필드명·값 도메인을 **그대로** 따른다.
 * 계산 엔진(`shared/lib/engine`)이 붙으면 이 파일의 타입은 엔진 `types.ts` 재수출로 바뀐다.
 *
 * `BirthInput` 자체는 zod 스키마에서 파생한다(`./schema`). 스키마와 타입이 두 벌이면
 * 언젠가 어긋나므로, 검증 규칙이 있는 쪽을 진실로 둔다.
 */

/** C00 §1.2.2 — 윤달은 별도 플래그가 아니라 달력 종류로 표현한다. */
export type CalendarType = 'solar' | 'lunar' | 'lunar_leap'

/** C00 §1.2.2 — 명리상 성별. 대운 방향(순행/역행) 판정에 필수라 미입력을 허용하지 않는다. */
export type Gender = 'M' | 'F'

/** C00 §1.2.2 `RawBirthInput.blood`. 해석 레이어 `BloodType` 과 같은 유니온이라 그대로 대입된다. */
export type BloodTypeInput = 'A' | 'B' | 'O' | 'AB'

/**
 * MBTI 16유형.
 *
 * **검사를 제공하지 않는다** — 사용자가 이미 아는 유형을 고를 뿐이다(문서05 상표권 리스크 대응).
 * 배열 순서는 화면 배치 순서이고, 코드가 이 순서에 의존하지 않는다.
 */
export const MBTI_TYPES = [
  'ISTJ',
  'ISFJ',
  'INFJ',
  'INTJ',
  'ISTP',
  'ISFP',
  'INFP',
  'INTP',
  'ESTP',
  'ESFP',
  'ENFP',
  'ENTP',
  'ESTJ',
  'ESFJ',
  'ENFJ',
  'ENTJ',
] as const

export type MbtiType = (typeof MBTI_TYPES)[number]

/**
 * 사용자 자기신고 값. **계산에 쓰이지 않는다** — 해석 문장에만 쓴다.
 *
 * 둘 다 `null`("모름")이 정상 상태다. 없으면 리포트에서 해당 섹션을 건너뛴다.
 * 이름·닉네임은 의도적으로 없다(C00 §7.3-6 캐시키 PII 금지와 같은 이유).
 */
export interface SelfReport {
  readonly mbti: MbtiType | null
  readonly blood: BloodTypeInput | null
}

export const EMPTY_SELF_REPORT: SelfReport = { mbti: null, blood: null }
