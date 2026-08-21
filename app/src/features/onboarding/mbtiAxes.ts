import { composeMbti, type MbtiAxes } from '../../shared/lib/mbti'
import { MBTI_TYPES, type MbtiType } from './types'

/**
 * 네 축 → 이 feature 의 `MbtiType`.
 *
 * 규칙 자체는 `shared/lib/mbti` 가 갖는다(궁합 화면도 같은 규칙으로 물어야 한다).
 * 여기서 하는 일은 **결과를 16유형 목록과 대조해 타입을 좁히는 것**뿐이다.
 *
 * 네 축이 유효하면 반드시 목록에 있으므로 이 대조는 통과하는 것이 정상이다 —
 * 걸린다면 `composeMbti` 의 자리 순서 규칙이 깨졌다는 뜻이고, 그게 이 검사의 목적이다.
 */
const VALID = new Set<string>(MBTI_TYPES)

export function mbtiOf(axes: MbtiAxes): MbtiType | null {
  const composed = composeMbti(axes)
  if (composed === null) return null
  return VALID.has(composed) ? (composed as MbtiType) : null
}

export { EMPTY_MBTI_AXES, MBTI_AXIS_SPECS, axesOfMbti as axesOf } from '../../shared/lib/mbti'
export type { MbtiAxes, MbtiAxisSpec } from '../../shared/lib/mbti'
