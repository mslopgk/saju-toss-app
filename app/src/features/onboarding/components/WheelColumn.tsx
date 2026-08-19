import { Wheel } from '@toss/tds-mobile'

/**
 * 휠 한 칸.
 *
 * TDS `Wheel` 은 **비제어** 컴포넌트다(`initialIndex` 만 읽고 `value` 가 없다).
 * 따라서 바깥에서 값을 되돌리려면 `key` 로 재마운트해야 한다 — 그 판단은 부모가 한다.
 *
 * ## 높이를 여기서 주는 이유 (지우면 화면이 조용히 깨진다)
 * TDS `Wheel` 은 **고유 높이가 없다.** 최상위 div 가 `height: 100%` 이고, 그 안에서
 * 선택칸이 `16%`, 위아래 그라데이션이 각 `42%` 다(합 100%). 즉 부모에 확정 높이가 없으면
 * 전부 0 으로 접히고, 항목들은 `position: absolute` + `matrix3d` 라 **한 줄에 겹쳐 쌓인다.**
 * 에러도 경고도 없이 "연도 200개가 한 줄에 뭉친 화면"이 나오므로 알아채기 어렵다.
 *
 * 240px 은 TDS 자체 `WheelDateSheet` 가 휠 3칸을 감쌀 때 쓰는 값과 같다
 * (`node_modules/@toss/tds-mobile/dist/esm/index.js` 의 `height:"240px"` 래퍼).
 * 부모 행이 아니라 이 컴포넌트가 높이를 들고 있는 이유는, 휠을 쓰는 시트가 늘어날 때마다
 * 행에 높이를 붙이는 것을 기억해야 하는 구조를 만들지 않기 위해서다.
 */
export const WHEEL_VIEWPORT_HEIGHT = 240

export interface WheelColumnProps {
  /** 스크린리더용. 예: '년도 선택' */
  label: string
  options: number[]
  /** 처음 서 있을 값 */
  value: number
  format: (value: number) => string
  onChange: (value: number) => void
  /**
   * 원근 방향. 여러 칸을 나란히 둘 때 바깥 칸을 안쪽으로 기울여 하나의 원통처럼 보이게 한다.
   * TDS `WheelDateSheet` 도 년=right / 월=center / 일=left 로 준다.
   */
  perspective?: 'left' | 'center' | 'right'
}

export function WheelColumn({
  label,
  options,
  value,
  format,
  onChange,
  perspective = 'center',
}: WheelColumnProps) {
  const index = options.indexOf(value)

  return (
    <div style={{ flex: 1, minWidth: 0, height: WHEEL_VIEWPORT_HEIGHT }}>
      <Wheel
        aria-label={label}
        options={options}
        initialIndex={index < 0 ? 0 : index}
        formatValue={format}
        onChange={onChange}
        perspective={perspective}
        width="100%"
      />
    </div>
  )
}
