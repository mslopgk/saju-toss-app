import type { ReactNode } from 'react'
import { MOTION } from '../motion'
import { C, ELEMENT_ACCENT } from './theme'
import type { Element } from '../lib/saju/types'

/**
 * 모든 화면의 바탕.
 *
 * ## 배경 이미지를 깔지 않는다
 * 앞 판은 오행 backdrop 에셋을 화면 전체에 `opacity: .55` 로 깔았다. 보라·주황 구름이
 * **글자 뒤에서 얼룩**을 만들어 대비를 깎았고, 스크롤할 때마다 문단 배경이 달라져 화면이
 * 지저분해 보였다. 지금은 거의 검정 한 판에 **화면 맨 위 한 군데만** 오행 색을 아주 옅게
 * 번지게 둔다 — 어느 오행인지 알려주는 데 그 정도로 충분하다.
 *
 * ## 진입 애니메이션이 여기 있는 이유
 * 화면 전환은 `App` 이 상태를 바꿔 컴포넌트를 갈아 끼우는 방식이다. 나가는 화면을 붙잡아
 * 두려면(exit) 상태 기계가 훨씬 복잡해지는데, **들어오는 쪽만** 떠올려도 끊긴 느낌은 거의
 * 사라진다.
 *
 * ⛔ `m-screen` 은 불투명도만 건드린다. transform 을 넣으면 `position: fixed` 인 하단 CTA 가
 *    이 요소 기준으로 배치돼 화면 밖으로 밀린다(`motion.css` 주석 참고).
 */
export interface ScreenProps {
  /** 화면 위쪽에 아주 옅게 번질 색을 정하는 오행. 없으면 색 없는 검정이다. */
  readonly element?: Element
  /**
   * 하단 고정 CTA 아래로 내용이 깔리지 않도록 비우는 높이.
   * `position: fixed` 는 문서 흐름에서 빠져 있어 패딩으로만 피할 수 있다.
   */
  readonly bottomInset?: number
  readonly children: ReactNode
}

export function Screen({ element, bottomInset = 0, children }: ScreenProps) {
  const accent = element === undefined ? null : ELEMENT_ACCENT[element]

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
      {/*
        오행 기운. 화면 맨 위에서만, 아주 옅게.
        `fixed` 라 스크롤해도 따라오지 않는다 — 스크롤되는 하늘은 배경이 아니라 벽지다.
      */}
      {accent !== null && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 320,
            background: `radial-gradient(110% 100% at 50% 0%, ${accent}1F 0%, transparent 72%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {children}
    </main>
  )
}
