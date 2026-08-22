import { WHEEL_HEIGHT, Wheel } from '../../../shared/design'

/**
 * 휠 한 칸.
 *
 * TDS `Wheel` 을 자체 구현으로 갈아 끼웠다(`shared/design/Wheel`). 이유는 감각이다 —
 * "생년월일·출생시간 고르는 게 너무 딱딱하다" 는 지적을 받았는데, TDS 것의 굴림은 컴포넌트
 * 내부에 있어 프롭으로도 CSS 로도 손이 닿지 않았다.
 *
 * 새 휠은 **제어 컴포넌트**다. 예전에는 비제어라(`initialIndex` 만 읽었다) 값을 되돌리려면
 * 부모가 `key` 로 재마운트해야 했고, 시트들이 그 규칙을 기억하고 있어야 했다.
 * 이제 `value` 를 주면 그 자리로 굴러가므로 재마운트 규칙이 필요 없다 —
 * 다만 시트 쪽 `key` 는 남겨 둔다(초기값 외에 시트 자체 상태도 함께 되돌리기 때문).
 *
 * 높이는 새 휠이 스스로 갖는다. 예전 TDS `Wheel` 은 고유 높이가 없어 부모가 240px 을 주지
 * 않으면 **에러 없이 한 줄로 뭉쳤다** — 그 함정이 사라졌다.
 */
export const WHEEL_VIEWPORT_HEIGHT = WHEEL_HEIGHT

export interface WheelColumnProps {
  /** 스크린리더용. 예: '년도 선택' */
  label: string
  options: number[]
  /** 지금 선택된 값 */
  value: number
  format: (value: number) => string
  onChange: (value: number) => void
  /**
   * 예전 TDS 휠의 원근 방향. 새 휠은 3D 변환을 쓰지 않으므로(WebView 에서 글자가 흐려진다)
   * 받기만 하고 쓰지 않는다. 호출부를 한꺼번에 고치지 않기 위해 남겨 둔 자리다.
   */
  perspective?: 'left' | 'center' | 'right'
}

export function WheelColumn({ label, options, value, format, onChange }: WheelColumnProps) {
  return <Wheel label={label} options={options} value={value} format={format} onChange={onChange} />
}
