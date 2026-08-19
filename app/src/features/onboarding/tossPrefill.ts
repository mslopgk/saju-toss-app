/**
 * 토스 프리필 흐름의 상태 기계.
 *
 * 근거: docs/product.md「핵심 흐름 — 원터치 경로」/ docs/decisions/0004-toss-prefill-boundary.md.
 *
 * `shared/api/tossUser` 가 **경계**(예외 흡수·형식 검증)라면, 이 파일은 **도메인 판정**이다.
 * 둘을 나누는 선은 하나뿐이다: 달력 규칙(`isValidSolarDate` · 지원 연도)은 이 계층에만 있다.
 * `shared` 는 기능 도메인을 import 할 수 없으므로(ARCHITECTURE.md 의존 방향), 경계가 달력 규칙을
 * 자기 몫으로 베껴 가면 규칙이 두 벌이 된다.
 *
 * React 를 import 하지 않는다 — 화면 없이 전 분기를 테스트할 수 있어야 한다.
 *
 * ## 왜 프리필된 날짜에 "양력 확인"이 붙나
 *
 * 한국에서는 **음력 생일을 그대로 등록해 둔 사용자가 드물지 않다**. 토스가 주는 것은 등록된
 * 생년월일 문자열뿐이고, 그게 양력인지 음력인지 알려주는 필드는 **없다**. 엔진이 음력을 지원해도
 * 이 문제는 그대로다 — 음력 날짜 대부분은 실재하는 양력 날짜이기도 해서 어느 쪽으로 읽어도
 * 거절되지 않고 **조용히 다른 사주를 낸다**. 달력 종류를 아는 것은 사용자뿐이므로 사용자에게 묻는다.
 * 사용자가 직접 고른 날짜에는 이 위험이 없다 — 입력 시트에서 달력을 직접 고르고 그 값을 본다.
 * 위험은 오직 "사용자가 고르지 않았는데 채워진 날짜"에만 있으므로, 확인도 거기에만 붙인다.
 *
 * "아니요, 음력이에요"의 뜻은 **그 세 숫자가 음력 날짜**라는 것이다(등록할 때 음력을 적었다는 말이므로).
 * 그래서 날짜를 버리지 않고 달력만 바꿔 준다 — 버리면 사용자가 같은 숫자를 다시 입력하게 된다.
 * 윤달 여부는 토스 데이터로 알 수 없어 평달로 두고, 화면이 확인을 요청한다.
 */

import type { BirthDate } from './calendar'
import { isValidSolarDate } from './calendar'
import type { Gender } from './types'
import type { TossPrefillResult } from '../../shared/api/tossUser'

/**
 * | 단계 | 뜻 |
 * |---|---|
 * | `idle` | 아직 안 눌렀다 |
 * | `loading` | 동의 데이터 요청 중 |
 * | `confirmingSolar` | 날짜를 채웠고 **양력 확인 대기** — 이 상태에서는 제출을 막는다 |
 * | `confirmed` | 양력이 맞다고 답했다 |
 * | `lunarConfirmed` | 음력이라고 답했다 → 같은 날짜를 음력으로 읽는다(윤달 확인은 화면이 안내) |
 * | `empty` | 호출은 성공했지만 채울 값이 없었다 |
 * | `declined` | 사용자가 동의를 거부/취소했다 |
 * | `failed` | 형식 파손·브릿지 오류 |
 * | `hidden` | 미지원·미설정 → 버튼 자체를 그리지 않는다 |
 */
export type TossPrefillPhase =
  | 'idle'
  | 'loading'
  | 'confirmingSolar'
  | 'confirmed'
  | 'lunarConfirmed'
  | 'empty'
  | 'declined'
  | 'failed'
  | 'hidden'

export const INITIAL_PREFILL_PHASE: TossPrefillPhase = 'idle'

export type TossPrefillAction =
  | { readonly type: 'start' }
  | { readonly type: 'resolve'; readonly result: TossPrefillResult }
  | { readonly type: 'confirmSolar' }
  | { readonly type: 'rejectSolar' }
  /**
   * 사용자가 시트에서 날짜를 **직접 골랐다**. 그 시트에서 달력 종류까지 고르므로 물을 것이 없어진다.
   * `confirmSolar` 로 대신하지 않는 이유: 직접 고른 값이 음력일 수도 있어서 이름이 사실과 어긋난다.
   */
  | { readonly type: 'pickedManually' }

/** 프리필 결과를 화면 상태로 옮긴 것. `date`/`gender` 는 그대로 드래프트에 넣을 수 있는 값이다. */
export interface TossPrefillApplication {
  readonly phase: TossPrefillPhase
  readonly date: BirthDate | null
  readonly gender: Gender | null
}

const NOTHING: Omit<TossPrefillApplication, 'phase'> = { date: null, gender: null }

/**
 * 경계 결과 → (화면 단계, 채울 값).
 *
 * 값이 왔는데 달력에 없는 날짜(2023-02-30)이거나 지원 범위(1900~2100) 밖이면 **부분 적용하지 않는다.**
 * 성별만 채우고 날짜를 비워 두면 사용자는 "반쯤 채워진 폼"을 보고 무엇이 토스 값이고 무엇이 자기 값인지
 * 구분하지 못한다. 전부 실패로 떨어뜨리고 수동 입력으로 되돌리는 편이 설명 가능하다.
 */
export function applyTossPrefill(result: TossPrefillResult): TossPrefillApplication {
  if (!result.ok) {
    switch (result.reason) {
      case 'UNSUPPORTED':
      case 'NOT_CONFIGURED':
        return { phase: 'hidden', ...NOTHING }
      case 'DECLINED':
        return { phase: 'declined', ...NOTHING }
      case 'FAILED':
        return { phase: 'failed', ...NOTHING }
    }
  }

  let date: BirthDate | null = null
  if (result.birthday !== undefined) {
    const { y, m, d } = result.birthday
    if (!isValidSolarDate(y, m, d)) {
      return { phase: 'failed', ...NOTHING }
    }
    date = { year: y, month: m, day: d }
  }

  const gender: Gender | null = result.gender ?? null

  if (date === null && gender === null) {
    return { phase: 'empty', ...NOTHING }
  }
  // 확인할 날짜가 없으면 확인 단계도 없다(성별만 왔을 때).
  return { phase: date === null ? 'confirmed' : 'confirmingSolar', date, gender }
}

export function tossPrefillReducer(phase: TossPrefillPhase, action: TossPrefillAction): TossPrefillPhase {
  switch (action.type) {
    case 'start':
      return 'loading'
    case 'resolve':
      return applyTossPrefill(action.result).phase
    case 'confirmSolar':
      // 확인 대기 중이 아닐 때 들어온 확인은 무시한다(늦게 도착한 클릭 등).
      return phase === 'confirmingSolar' ? 'confirmed' : phase
    case 'rejectSolar':
      return phase === 'confirmingSolar' ? 'lunarConfirmed' : phase
    case 'pickedManually':
      return phase === 'confirmingSolar' ? 'confirmed' : phase
  }
}

/**
 * 제출(결과 보기)을 막아야 하는 단계.
 *
 * `confirmingSolar` 를 막는 것이 이 기능의 안전장치 전부다. 여기서 막지 않으면
 * "확인해 주세요"라는 문구만 있고 아무도 확인하지 않은 채 음력 생일이 엔진으로 넘어간다.
 */
export function blocksSubmit(phase: TossPrefillPhase): boolean {
  return phase === 'loading' || phase === 'confirmingSolar'
}

/**
 * 버튼을 그릴 단계.
 *
 * 성공(`confirmed`)·`empty`·`lunarConfirmed` 에서는 감춘다 — 이미 답을 받았거나 받을 게 없다.
 * `declined`·`failed` 에서는 남긴다(사용자가 다시 시도할 수 있어야 한다).
 */
export function showsPrefillButton(phase: TossPrefillPhase): boolean {
  return phase === 'idle' || phase === 'loading' || phase === 'declined' || phase === 'failed'
}

/**
 * 화면이 뜨자마자 **스스로** 불러올지.
 *
 * 버튼을 누르게 하지 않고 자동으로 부르는 이유: 입력을 줄이는 것이 이 기능의 존재 이유인데,
 * "채우기 버튼을 누른다"는 단계가 남아 있으면 결국 손이 한 번 더 간다.
 *
 * ## 매번 조르지 않는다
 * 자동 호출은 `requestAgreementAgain: false` 로 나간다(`shouldRequestAgreementAgain('idle') === false`).
 * 그래서 **이전에 거부한 사용자에게는 동의 화면이 다시 뜨지 않고** 곧바로 `DECLINED` 로 돌아온다 —
 * 거부 의사는 토스 쪽에 남아 있고 우리가 따로 저장하지 않는다. 다시 시도하려면 사용자가 버튼을
 * 직접 눌러야 하고, 그때만 `shouldRequestAgreementAgain('declined') === true` 가 된다.
 *
 * ## 실패해도 화면이 비지 않는다
 * 수동 입력 폼은 프리필 결과와 무관하게 **항상** 그려진다. 자동 호출이 거부·실패로 끝나면
 * 안내 문구 한 줄이 붙고 사용자는 그대로 직접 입력하면 된다(`prefillNotice`).
 */
export function startsAutomatically(phase: TossPrefillPhase, available: boolean): boolean {
  return available && phase === 'idle'
}

/** 거부한 뒤 다시 눌렀을 때만 약관 웹뷰를 다시 띄운다. 자동 재요청은 거부 의사를 무시하는 것이다. */
export function shouldRequestAgreementAgain(phase: TossPrefillPhase): boolean {
  return phase === 'declined'
}

export const PREFILL_BUTTON_LABEL = '토스 정보로 채우기'
export const PREFILL_RETRY_LABEL = '다시 시도'

export const SOLAR_CONFIRM_QUESTION = '이 날짜가 양력(태양력)이 맞나요?'
export const SOLAR_CONFIRM_DESCRIPTION =
  '음력으로 등록해 두신 경우가 있어요. 어느 쪽으로 읽느냐에 따라 사주가 통째로 달라져요.'
export const SOLAR_CONFIRM_YES = '네, 양력이에요'
export const SOLAR_CONFIRM_NO = '아니요, 음력이에요'

/** 단계별 안내 문구. 실패를 토스트로 띄우지 않고 폼 안에서 조용히 알린다. */
export function prefillNotice(phase: TossPrefillPhase): string | null {
  switch (phase) {
    case 'confirmed':
      return '토스에 등록된 생년월일과 성별을 채웠어요. 다르면 눌러서 고칠 수 있어요.'
    case 'lunarConfirmed':
      // 윤달은 토스 데이터로 알 수 없다. 평달로 두되 사용자가 고칠 수 있다는 사실을 반드시 알린다.
      return '같은 날짜를 음력으로 읽을게요. 윤달에 태어났다면 태어난 날을 눌러 윤달을 골라 주세요.'
    case 'empty':
      return '토스에서 가져올 생년월일·성별이 없었어요. 직접 입력해 주세요.'
    case 'declined':
      return '토스 정보 가져오기를 취소했어요. 직접 입력하거나 다시 시도할 수 있어요.'
    case 'failed':
      return '토스 정보를 불러오지 못했어요. 직접 입력해 주세요.'
    case 'idle':
    case 'loading':
    case 'confirmingSolar':
    case 'hidden':
      return null
  }
}
