import type { ChangeEvent } from 'react'
import { BottomSheet } from '@toss/tds-mobile'
import { CITIES } from '../cities'

/**
 * 출생지 선택 시트.
 *
 * 출생지를 묻는 유일한 이유는 진태양시 보정용 경도다(C00 §S0-3).
 * 국내 경도 폭이 28.77분이라(백령도 ↔ 독도) 시주 경계가 실제로 갈린다.
 */
export interface BirthPlaceSheetProps {
  open: boolean
  selectedCityId: string
  onClose: () => void
  onSelect: (cityId: string) => void
}

const OPTIONS = CITIES.map((city) => ({ name: city.name, value: city.id }))

export function BirthPlaceSheet({ open, selectedCityId, onClose, onSelect }: BirthPlaceSheetProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSelect(event.target.value)
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDimmerClick={onClose}
      maxHeight="72vh"
      header={<BottomSheet.Header>어디에서 태어났나요?</BottomSheet.Header>}
      headerDescription={
        <BottomSheet.HeaderDescription>
          태어난 곳의 경도로 진태양시를 보정해요. 가장 가까운 지역을 골라 주세요.
        </BottomSheet.HeaderDescription>
      }
    >
      <BottomSheet.Select options={OPTIONS} value={selectedCityId} onChange={handleChange} />
    </BottomSheet>
  )
}
