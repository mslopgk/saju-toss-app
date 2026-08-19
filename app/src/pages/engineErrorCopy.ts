import type { EngineError } from '../shared/lib/saju'

/**
 * `EngineError.code` → 사용자 문구.
 *
 * 화면 검증(zod)을 통과하고도 엔진이 막는 경우가 남아 있어서 필요하다. `INVALID_LUNAR_DATE` 가
 * 대표 사례다 — 음력 대소월·윤달 실재 여부는 엔진 음력 표만 알기 때문이다(C00 §S0-2).
 *
 * 코드 유니온이 늘었을 때 조용히 빠지지 않도록 전부 적어 둔다(누락 시 컴파일 에러).
 *
 * ⚠ `App.tsx` 안에 **글자 단위로 같은 표**가 하나 더 있다. 온보딩 경로와 궁합 경로가 같은 엔진
 *   오류를 서로 다른 문구로 말하면 안 되므로, `App.tsx` 를 손대는 다음 사람이 이 모듈을
 *   import 하도록 합쳐 주기 바란다(이 작업 영역은 `pages/` 까지라 여기서는 옮기지 않았다).
 */
export const ENGINE_ERROR_MESSAGE: Readonly<Record<EngineError['code'], string>> = {
  OUT_OF_RANGE: '1900년부터 2100년 사이만 계산할 수 있어요. 태어난 해를 다시 확인해 주세요.',
  INVALID_DATE: '달력에 없는 날짜예요. 태어난 날을 다시 골라 주세요.',
  INVALID_INPUT: '입력을 확인하지 못했어요. 태어난 날과 시각을 다시 골라 주세요.',
  INVALID_LUNAR_DATE: '그 해에는 없는 음력 날짜예요. 윤달 여부와 날짜를 다시 골라 주세요.',
  UNSUPPORTED_CALENDAR: '이 달력 종류는 아직 계산할 수 없어요.',
  MISSING_PLACE: '태어난 곳을 다시 골라 주세요.',
  MISSING_TZ: '해외에서 태어난 경우에는 표준시 정보가 더 필요해요.',
}

export const GENERIC_ERROR = '계산 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
