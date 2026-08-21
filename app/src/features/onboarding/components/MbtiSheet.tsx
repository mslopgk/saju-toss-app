import type { ChangeEvent } from 'react'
import { BottomSheet } from '@toss/tds-mobile'
import { MBTI_TYPES } from '../types'
import type { MbtiType } from '../types'

/**
 * MBTI 유형 선택 시트.
 *
 * **검사를 제공하지 않는다.** 사용자가 이미 아는 유형을 고르는 것뿐이고, 모르면 "모르겠어요"를 고른다
 * (문서05 §상표권 — 공인 검사를 흉내 내면 리스크가 생긴다). 고르지 않으면 리포트에서 MBTI 섹션이 빠진다.
 *
 * `BottomSheet.Select` 를 쓰는 이유는 출생지 시트와 같다 — 17개 선택지를 라디오 목록으로 보여주는
 * TDS 표준 컨트롤이고, 16개를 그리드로 배치하면 터치 타겟이 작아진다.
 */
export interface MbtiSheetProps {
  open: boolean
  /** null = 모름 */
  selected: MbtiType | null
  onClose: () => void
  onSelect: (mbti: MbtiType) => void
}

/**
 * 아직 고르지 않은 상태를 나타내는 센티널.
 *
 * **선택지가 아니다.** MBTI 가 필수가 된 뒤로 "모르겠어요" 항목은 없앴다 — 남겨 두면
 * 필수인데 빠져나갈 문이 있는 셈이 되고, 그 문을 통과한 값은 다시 CTA 를 잠근다.
 * 이 값은 라디오가 "아무것도 선택되지 않음"으로 보이게 하는 데만 쓴다(빈 문자열은
 * `BottomSheet.Select` 에서 첫 항목이 선택된 것처럼 보인다).
 */
export const MBTI_UNSELECTED = '__unselected__'

const OPTIONS = MBTI_TYPES.map((type) => ({ name: type, value: type }))

export function MbtiSheet({ open, selected, onClose, onSelect }: MbtiSheetProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(event.target.value as MbtiType)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDimmerClick={onClose}
      maxHeight="72vh"
      header={<BottomSheet.Header>MBTI 유형을 골라 주세요</BottomSheet.Header>}
      headerDescription={
        <BottomSheet.HeaderDescription>
          이미 아는 유형을 골라 주세요. 이 앱은 성격 검사를 제공하지 않고, 사주 계산에도 쓰지 않아요.
        </BottomSheet.HeaderDescription>
      }
    >
      <BottomSheet.Select
        options={OPTIONS}
        value={selected ?? MBTI_UNSELECTED}
        onChange={handleChange}
      />
    </BottomSheet>
  )
}
