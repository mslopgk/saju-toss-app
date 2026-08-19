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
  onSelect: (mbti: MbtiType | null) => void
}

/** "모름"도 하나의 선택지로 둔다. 빈 값을 쓰면 라디오가 아무것도 선택되지 않은 상태로 보인다. */
export const MBTI_UNKNOWN = '__unknown__'

const OPTIONS = [
  { name: '모르겠어요', value: MBTI_UNKNOWN },
  ...MBTI_TYPES.map((type) => ({ name: type, value: type })),
]

export function MbtiSheet({ open, selected, onClose, onSelect }: MbtiSheetProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    onSelect(value === MBTI_UNKNOWN ? null : (value as MbtiType))
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDimmerClick={onClose}
      maxHeight="72vh"
      header={<BottomSheet.Header>MBTI 유형을 알고 있나요?</BottomSheet.Header>}
      headerDescription={
        <BottomSheet.HeaderDescription>
          이미 아는 유형을 골라 주세요. 이 앱은 성격 검사를 제공하지 않고, 사주 계산에도 쓰지 않아요.
        </BottomSheet.HeaderDescription>
      }
    >
      <BottomSheet.Select
        options={OPTIONS}
        value={selected ?? MBTI_UNKNOWN}
        onChange={handleChange}
      />
    </BottomSheet>
  )
}
