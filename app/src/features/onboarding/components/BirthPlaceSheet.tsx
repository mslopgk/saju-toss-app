import { Sheet, SheetSelect } from '../../../shared/design'
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
  return (
    <Sheet open={open} onClose={onClose} title="어디에서 태어났나요?">
      <SheetSelect
        name="출생지"
        options={OPTIONS.map((o) => ({ value: o.value, label: o.name }))}
        value={selectedCityId}
        onSelect={onSelect}
      />
    </Sheet>
  )
}
