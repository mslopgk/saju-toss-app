/**
 * 프리필 상태 기계 테스트.
 *
 * 경계(`shared/api/tossUser`)는 형식만 본다. 달력에 없는 날짜·지원 범위 밖 연도를 걸러내는 것은
 * 이 계층의 몫이고, 그 판정이 빠지면 v1 엔진이 조용히 다른 사주를 낸다. 그래서 여기가 진짜 관문이다.
 */
import { describe, expect, it } from 'vitest'
import type { TossPrefillResult } from '../../shared/api/tossUser'
import {
  INITIAL_PREFILL_PHASE,
  applyTossPrefill,
  blocksSubmit,
  prefillNotice,
  shouldRequestAgreementAgain,
  showsPrefillButton,
  startsAutomatically,
  tossPrefillReducer,
} from './tossPrefill'
import type { TossPrefillPhase } from './tossPrefill'
import { INITIAL_DRAFT, buildBirthInput, collectMissingFields, onboardingReducer } from './formState'

const OK: TossPrefillResult = { ok: true, birthday: { y: 1995, m: 3, d: 5 }, gender: 'F' }

const ALL_PHASES: readonly TossPrefillPhase[] = [
  'idle',
  'loading',
  'confirmingSolar',
  'confirmed',
  'lunarConfirmed',
  'empty',
  'declined',
  'failed',
  'hidden',
]

describe('applyTossPrefill', () => {
  it.each([
    ['UNSUPPORTED', 'hidden'],
    ['NOT_CONFIGURED', 'hidden'],
    ['DECLINED', 'declined'],
    ['FAILED', 'failed'],
  ] as const)('실패 %s → 단계 %s, 채우는 값 없음', (reason, phase) => {
    expect(applyTossPrefill({ ok: false, reason })).toEqual({ phase, date: null, gender: null })
  })

  it('성공하면 날짜·성별을 채우고 양력 확인을 기다린다', () => {
    expect(applyTossPrefill(OK)).toEqual({
      phase: 'confirmingSolar',
      date: { year: 1995, month: 3, day: 5 },
      gender: 'F',
    })
  })

  it('성별만 오면 확인할 날짜가 없으므로 바로 확정된다', () => {
    expect(applyTossPrefill({ ok: true, gender: 'M' })).toEqual({
      phase: 'confirmed',
      date: null,
      gender: 'M',
    })
  })

  it('날짜만 와도 확인 단계는 붙는다', () => {
    expect(applyTossPrefill({ ok: true, birthday: { y: 2001, m: 2, d: 28 } })).toEqual({
      phase: 'confirmingSolar',
      date: { year: 2001, month: 2, day: 28 },
      gender: null,
    })
  })

  it('성공했지만 채울 값이 없으면 empty 다 (실패가 아니다)', () => {
    expect(applyTossPrefill({ ok: true })).toEqual({ phase: 'empty', date: null, gender: null })
  })

  it.each([
    [{ y: 2023, m: 2, d: 30 }, '달력에 없는 날'],
    [{ y: 1900, m: 2, d: 29 }, '평년 2월 29일'],
    [{ y: 1899, m: 12, d: 31 }, '지원 범위 이전(C00 §F9)'],
    [{ y: 2101, m: 1, d: 1 }, '지원 범위 이후'],
  ])('실재하지 않거나 계산할 수 없는 날짜 %j (%s) 는 부분 적용하지 않고 전부 실패시킨다', (birthday) => {
    expect(applyTossPrefill({ ok: true, birthday, gender: 'M' })).toEqual({
      phase: 'failed',
      date: null,
      gender: null,
    })
  })

  it('윤년 2월 29일은 통과한다', () => {
    expect(applyTossPrefill({ ok: true, birthday: { y: 2000, m: 2, d: 29 } }).phase).toBe('confirmingSolar')
  })
})

describe('tossPrefillReducer', () => {
  it('초기 단계는 idle 이다', () => {
    expect(INITIAL_PREFILL_PHASE).toBe('idle')
  })

  it('요청 → 응답 → 확인 순서로 흐른다', () => {
    const loading = tossPrefillReducer(INITIAL_PREFILL_PHASE, { type: 'start' })
    expect(loading).toBe('loading')

    const resolved = tossPrefillReducer(loading, { type: 'resolve', result: OK })
    expect(resolved).toBe('confirmingSolar')

    expect(tossPrefillReducer(resolved, { type: 'confirmSolar' })).toBe('confirmed')
    expect(tossPrefillReducer(resolved, { type: 'rejectSolar' })).toBe('lunarConfirmed')
  })

  it('확인 대기 중이 아닐 때 들어온 확인/거부는 무시한다', () => {
    for (const phase of ALL_PHASES.filter((p) => p !== 'confirmingSolar')) {
      expect(tossPrefillReducer(phase, { type: 'confirmSolar' })).toBe(phase)
      expect(tossPrefillReducer(phase, { type: 'rejectSolar' })).toBe(phase)
      expect(tossPrefillReducer(phase, { type: 'pickedManually' })).toBe(phase)
    }
  })

  it('시트에서 직접 고르면 확인 질문이 사라진다 (달력까지 사용자가 골랐으므로)', () => {
    expect(tossPrefillReducer('confirmingSolar', { type: 'pickedManually' })).toBe('confirmed')
  })
})

describe('화면 규칙', () => {
  it('양력 확인이 끝나기 전에는 제출을 막는다', () => {
    expect(blocksSubmit('confirmingSolar')).toBe(true)
    expect(blocksSubmit('loading')).toBe(true)
    for (const phase of ALL_PHASES.filter((p) => p !== 'confirmingSolar' && p !== 'loading')) {
      expect(blocksSubmit(phase)).toBe(false)
    }
  })

  it('미지원·미설정이면 버튼을 그리지 않는다', () => {
    expect(showsPrefillButton('hidden')).toBe(false)
  })

  it('거부·실패에서는 다시 시도할 수 있게 버튼을 남긴다', () => {
    expect(showsPrefillButton('declined')).toBe(true)
    expect(showsPrefillButton('failed')).toBe(true)
  })

  it('이미 채웠거나 받을 게 없으면 버튼을 감춘다', () => {
    expect(showsPrefillButton('confirmed')).toBe(false)
    expect(showsPrefillButton('lunarConfirmed')).toBe(false)
    expect(showsPrefillButton('empty')).toBe(false)
  })

  it('약관 재요청은 사용자가 거부한 뒤 다시 눌렀을 때뿐이다', () => {
    for (const phase of ALL_PHASES) {
      expect(shouldRequestAgreementAgain(phase)).toBe(phase === 'declined')
    }
  })

  it('실패를 알리는 문구가 있고, 음력 답변에는 윤달 확인을 요청한다', () => {
    expect(prefillNotice('declined')).toContain('취소')
    expect(prefillNotice('failed')).toContain('불러오지 못했어요')
    expect(prefillNotice('empty')).toContain('직접 입력')
    expect(prefillNotice('lunarConfirmed')).toContain('음력')
    // 윤달은 토스 데이터로 알 수 없다 — 그 사실을 안내하지 않으면 윤달 출생자가 조용히 틀린다.
    expect(prefillNotice('lunarConfirmed')).toContain('윤달')
    expect(prefillNotice('confirmed')).toContain('고칠 수 있어요')
    expect(prefillNotice('idle')).toBeNull()
    expect(prefillNotice('loading')).toBeNull()
    expect(prefillNotice('confirmingSolar')).toBeNull()
    expect(prefillNotice('hidden')).toBeNull()
  })
})

describe('프리필 → 온보딩 드래프트 (원터치 경로)', () => {
  /**
   * 프리필이 채워 주는 것은 **생년월일과 성별뿐**이다(토스 동의 항목이 그 둘이다).
   *
   * MBTI·혈액형이 필수가 된 뒤로는 원터치 뒤에도 세 항목이 남는다 — 시각·MBTI·혈액형.
   * 이 테스트가 그 사실을 고정한다: 프리필이 "다 끝났다"가 아니라 "두 칸 채워 줬다" 임을
   * 화면 문구와 기대치가 같이 알고 있어야 한다.
   */
  it('프리필 뒤에도 시각·MBTI·혈액형이 남는다 (출생지는 서울 기본값)', () => {
    const applied = applyTossPrefill(OK)
    let draft = INITIAL_DRAFT
    if (applied.date !== null) {
      // 프리필 값은 양력 전제다(토스에 달력 종류 필드가 없다).
      draft = onboardingReducer(draft, { type: 'setDate', calendarType: 'solar', date: applied.date })
    }
    if (applied.gender !== null) {
      draft = onboardingReducer(draft, { type: 'setGender', gender: applied.gender })
    }
    expect(collectMissingFields(draft)).toEqual(['time', 'mbti', 'blood'])

    const unknownTime = onboardingReducer(draft, { type: 'setTimeUnknown' })
    const withSelfReport = onboardingReducer(
      onboardingReducer(unknownTime, { type: 'setMbti', mbti: 'INFP' }),
      { type: 'setBlood', blood: 'A' },
    )
    expect(collectMissingFields(withSelfReport)).toEqual([])
    const built = buildBirthInput(withSelfReport)
    expect(built.ok).toBe(true)
    if (!built.ok) {
      return
    }
    expect(built.value).toEqual({
      calendarType: 'solar',
      year: 1995,
      month: 3,
      day: 5,
      timeUnknown: true,
      gender: 'F',
      birthPlace: { latitude: 37.5665, longitude: 126.9784204 },
    })
  })

  it('음력이라고 답하면 같은 날짜를 음력으로 읽는다 (버리지 않는다)', () => {
    const applied = applyTossPrefill(OK) // 1995-03-05
    const filled = onboardingReducer(INITIAL_DRAFT, {
      type: 'setDate',
      calendarType: 'solar',
      date: applied.date!,
    })
    const lunar = onboardingReducer(filled, { type: 'setCalendarType', calendarType: 'lunar' })

    expect(lunar.calendarType).toBe('lunar')
    expect(lunar.date).toEqual({ year: 1995, month: 3, day: 5 })
    expect(collectMissingFields(lunar)).not.toContain('date')

    // 엔진이 보는 값도 음력이다 — 여기서 'solar' 가 새면 조용히 다른 사주가 나간다.
    const ready = onboardingReducer(
      onboardingReducer(
        onboardingReducer(
          onboardingReducer(lunar, { type: 'setGender', gender: 'F' }),
          { type: 'setTimeUnknown' },
        ),
        { type: 'setMbti', mbti: 'INFP' },
      ),
      { type: 'setBlood', blood: 'A' },
    )
    const built = buildBirthInput(ready)
    expect(built.ok).toBe(true)
    if (built.ok) {
      expect(built.value.calendarType).toBe('lunar')
    }
  })

  it('음력에 없는 날짜(31일)면 달력만 바꾸고 날짜는 비운다', () => {
    // 음력에는 31일이 없다. 남겨 두면 사용자가 고르지도 않은 값에 오류가 붙는다.
    const filled = onboardingReducer(INITIAL_DRAFT, {
      type: 'setDate',
      calendarType: 'solar',
      date: { year: 1995, month: 3, day: 31 },
    })
    const lunar = onboardingReducer(filled, { type: 'setCalendarType', calendarType: 'lunar' })
    expect(lunar.calendarType).toBe('lunar')
    expect(lunar.date).toBeNull()
    expect(collectMissingFields(lunar)).toContain('date')
  })

  it('프리필된 값도 사용자가 고칠 수 있다 (잠그지 않는다)', () => {
    const applied = applyTossPrefill(OK)
    const filled = onboardingReducer(INITIAL_DRAFT, {
      type: 'setDate',
      calendarType: 'solar',
      date: applied.date!,
    })
    const edited = onboardingReducer(filled, {
      type: 'setDate',
      calendarType: 'solar',
      date: { year: 1988, month: 8, day: 8 },
    })
    expect(edited.date).toEqual({ year: 1988, month: 8, day: 8 })

    const regendered = onboardingReducer(edited, { type: 'setGender', gender: 'M' })
    expect(regendered.gender).toBe('M')
  })
})

describe('startsAutomatically — 버튼 없이 스스로 부를지', () => {
  it('가능하고 아직 시도 전이면 자동으로 부른다', () => {
    expect(startsAutomatically('idle', true)).toBe(true)
  })

  it('미지원·미설정이면 부르지 않는다 — 부를 수단 자체가 없다', () => {
    expect(startsAutomatically('idle', false)).toBe(false)
  })

  /**
   * 이미 한 번 흐름이 시작된 뒤에는 자동으로 다시 부르지 않는다.
   * 특히 `declined` 에서 자동 재호출하면 **거부한 사용자에게 매번 동의 화면을 다시 띄우는 꼴**이 된다.
   * 재시도는 사용자가 버튼을 눌렀을 때만 일어나야 한다(shouldRequestAgreementAgain 과 짝을 이룬다).
   */
  it.each([
    'loading',
    'confirmingSolar',
    'confirmed',
    'lunarConfirmed',
    'empty',
    'declined',
    'failed',
    'hidden',
  ] as const)('%s 단계에서는 자동으로 부르지 않는다', (phase) => {
    expect(startsAutomatically(phase, true)).toBe(false)
  })

  it('자동 호출은 동의 화면을 다시 띄우지 않는다 — 거부 의사를 존중한다', () => {
    // 자동 호출 시점의 단계는 항상 idle 이고, idle 에서는 재요청 플래그가 꺼져 있다.
    expect(startsAutomatically('idle', true)).toBe(true)
    expect(shouldRequestAgreementAgain('idle')).toBe(false)
    // 반대로 사용자가 직접 다시 눌렀을 때(declined)만 켜진다.
    expect(shouldRequestAgreementAgain('declined')).toBe(true)
  })
})
