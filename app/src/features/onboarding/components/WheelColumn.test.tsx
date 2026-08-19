/**
 * 휠 칸의 **높이** 회귀.
 *
 * 이 파일이 따로 있는 이유: TDS `Wheel` 은 고유 높이가 없고(최상위 `height:100%`,
 * 선택칸 `16%`, 그라데이션 각 `42%`) 부모가 확정 높이를 주지 않으면 전부 0 으로 접힌다.
 * 그런데 항목이 `position:absolute` + `matrix3d` 라 **접혀도 예외가 나지 않는다** —
 * 연도 200개가 한 줄에 겹쳐 그려질 뿐이다. 실제로 그 상태로 한동안 배포돼 있었고,
 * `BirthDateSheet.test.tsx` 는 `BottomSheet` 본문을 SSR 에서 그리지 않아 이걸 볼 수 없었다.
 *
 * 그래서 여기서는 시트를 거치지 않고 휠 칸을 직접 렌더해 **래퍼에 확정 높이가 있는지**만 본다.
 * 픽셀을 재는 검사가 아니라 "높이를 주는 것을 잊지 않았는가" 를 고정하는 검사다.
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

  it('높이는 TDS WheelDateSheet 와 같은 240px 이다', () => {
    // 값을 바꾸려면 TDS 쪽 래퍼(`height:"240px"`)와 어긋나도 되는지 먼저 판단해야 한다.
    expect(WHEEL_VIEWPORT_HEIGHT).toBe(240)
  })

  it('perspective 를 넘기지 않아도 렌더된다', () => {
    expect(() => render()).not.toThrow()
    expect(() => render('left')).not.toThrow()
  })
})
