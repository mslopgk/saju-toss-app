/**
 * 휠 칸의 **높이** 회귀.
 *
 * 이 파일이 생긴 이유: TDS `Wheel` 은 고유 높이가 없어서 부모가 확정 높이를 주지 않으면
 * 전부 0 으로 접혔다. 항목이 `position:absolute` 라 **접혀도 예외가 나지 않아** 연도 200개가
 * 한 줄에 겹쳐 그려졌고, 그 상태로 한동안 배포돼 있었다.
 *
 * 지금은 자체 휠(`shared/design/Wheel`)이라 높이를 스스로 갖는다 — 그 함정 자체가 사라졌다.
 * 그래도 검사는 남긴다: 높이가 사라지면 같은 종류의 조용한 고장이 다시 난다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import { WHEEL_VIEWPORT_HEIGHT, WheelColumn } from './WheelColumn'

function render(perspective?: 'left' | 'center' | 'right'): string {
  return renderToString(
    <TDSMobileAITProvider>
      <WheelColumn
        label="년도 선택"
        options={[1990, 1991, 1992]}
        value={1991}
        format={(v) => `${v}년`}
        onChange={() => {}}
        {...(perspective === undefined ? {} : { perspective })}
      />
    </TDSMobileAITProvider>,
  )
}

describe('WheelColumn', () => {
  it('래퍼에 확정 높이를 준다 — 없으면 휠이 조용히 0 으로 접힌다', () => {
    expect(render()).toContain(`height:${WHEEL_VIEWPORT_HEIGHT}px`)
  })

  it('다섯 칸이 보이는 높이다', () => {
    // 40px × 5칸. 세 칸이면 앞뒤 맥락이 없어 어디쯤인지 알 수 없고, 일곱 칸이면 시트가 길어진다.
    expect(WHEEL_VIEWPORT_HEIGHT).toBe(200)
  })

  it('perspective 를 넘기지 않아도 렌더된다', () => {
    expect(() => render()).not.toThrow()
    expect(() => render('left')).not.toThrow()
  })
})
