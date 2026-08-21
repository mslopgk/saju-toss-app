import type { ReactNode } from 'react'
import { MOTION } from '../motion'
import { C } from './theme'

/**
 * 모든 화면의 바탕 — 먹과 종이.
 *
 * ## 배경 이미지를 깔지 않는다
 * 1판은 오행 backdrop 에셋을 화면 전체에 `opacity: .55` 로 깔았다. 보라·주황 구름이
 * **글자 뒤에서 얼룩**을 만들어 대비를 깎았고, 스크롤할 때마다 문단 배경이 달라져 지저분했다.
 *
 * ## 대신 종이 결을 얹는다
 * 2판은 그걸 걷어내고 완전히 평평한 단색으로 갔다. 깔끔했지만 "기본값" 그 자체였다.
 * 지금은 **아주 옅은 종이 결** 하나만 둔다. SVG 난류(feTurbulence)로 만들어 파일이 없고,
 * `fixed` + `pointer-events: none` 이라 스크롤 중 재도색이 없다(§6.E: 그레인은 고정 레이어에만).
 *
 * ⛔ `m-screen` 은 불투명도만 건드린다. transform 을 넣으면 `position: fixed` 인 하단 CTA 가
 *    이 요소 기준으로 배치돼 화면 밖으로 밀린다(`motion.css` 주석 참고).
 */
export interface ScreenProps {
  /**
   * 하단 고정 CTA 아래로 내용이 깔리지 않도록 비우는 높이.
   * `position: fixed` 는 문서 흐름에서 빠져 있어 패딩으로만 피할 수 있다.
   */
  readonly bottomInset?: number
  readonly children: ReactNode
}

/**
 * 종이 결. feTurbulence 한 겹.
 *
 * `baseFrequency` 를 높게 두어 알갱이를 잘게 만든다 — 낮으면 구름이 되고, 구름은 1판에서
 * 글자 뒤 얼룩을 만들었던 그것이다. 불투명도는 눈에 "보이지 않을 만큼"이 맞다.
 */
const PAPER_GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23g)' opacity='0.55'/%3E%3C/svg%3E\")"

export function Screen({ bottomInset = 0, children }: ScreenProps) {
  return (
    <main
      className={MOTION.screen}
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        paddingBottom: bottomInset,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1,
          backgroundImage: PAPER_GRAIN,
          // 곱하기로 얹으면 밝은 면(카드) 위에서만 결이 드러나고 먹 바탕은 그대로 검다.
          mixBlendMode: 'overlay',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      {children}
    </main>
  )
}
