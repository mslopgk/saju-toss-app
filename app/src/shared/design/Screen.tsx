import type { ReactNode } from 'react'
import { MOTION, cx } from '../motion'
import { ELEMENT_GROUND, NIGHT } from './theme'
import type { Element } from '../lib/saju/types'

/**
 * 모든 화면의 바탕.
 *
 * 네 화면이 각자 배경을 칠하던 것을 여기로 모은다. 예전에는 홈만 심야 하늘이고 나머지는
 * 흰 바탕이라 화면을 넘길 때마다 세계가 끊겼다 — 그 경계를 한 컴포넌트가 갖고 있으면
 * 새 화면이 생겨도 자동으로 같은 세계에 들어온다.
 *
 * ## 진입 애니메이션이 여기 있는 이유
 * 화면 전환은 `App` 이 상태를 바꿔 컴포넌트를 통째로 갈아 끼우는 방식이다. 나가는 화면을
 * 붙잡아 두려면(exit 애니메이션) 상태 기계가 훨씬 복잡해지는데, 들어오는 쪽만 떠올려도
 * 끊긴 느낌은 거의 사라진다. **들어오는 것만 움직인다** — 그 대신 공짜다.
 */
export interface ScreenProps {
  /** 바탕색을 정하는 오행. 없으면 오행 없는 밤(온보딩·로딩)이다. */
  readonly element?: Element
  /** 배경 이미지(backdrop 에셋). 없으면 그라디언트만으로 선다. */
  readonly backdropUrl?: string | null
  /**
   * 하단 고정 CTA 아래로 내용이 깔리지 않도록 비우는 높이.
   * `FixedBottomCTA` 는 `position: fixed` 라 문서 흐름에서 빠져 있어 패딩으로만 피한다.
   */
  readonly bottomInset?: number
  readonly children: ReactNode
}

export function Screen({ element, backdropUrl, bottomInset = 0, children }: ScreenProps) {
  const ground = element === undefined ? `radial-gradient(120% 80% at 50% 0%, #141A38 0%, ${NIGHT.ground} 62%)` : ELEMENT_GROUND[element]

  return (
    <main
      className={cx(MOTION.screen)}
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: NIGHT.ground,
        color: NIGHT.text,
        paddingBottom: bottomInset,
        // 바탕이 스크롤을 따라 늘어나지 않도록 이 요소가 색을 갖는다.
        isolation: 'isolate',
      }}
    >
      {/*
        바탕 두 겹. 아래는 오행 그라디언트, 위는 backdrop 이미지.
        `fixed` 라 스크롤해도 하늘이 따라오지 않는다 — 스크롤되는 하늘은 배경이 아니라 벽지다.
      */}
      <div
        aria-hidden
        style={{ position: 'fixed', inset: 0, background: ground, zIndex: -2 }}
      />
      {backdropUrl != null && (
        <div
          aria-hidden
          className={MOTION.fade}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundImage: `url(${backdropUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            // 이미지를 그대로 깔면 글자 대비가 무너진다. 그라디언트가 주고 이미지는 결만 얹는다.
            opacity: 0.55,
            zIndex: -1,
          }}
        />
      )}
      {children}
    </main>
  )
}
