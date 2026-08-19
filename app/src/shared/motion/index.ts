/**
 * 모션 레이어의 공개 표면.
 *
 * 규칙과 키프레임은 `motion.css` 가 갖고, 여기서는 화면이 클래스 이름을 문자열로 흩뿌리지
 * 않도록 이름을 모아 준다. 오타가 나면 애니메이션이 **조용히 사라질 뿐** 오류가 나지 않으므로
 * (그 종류의 고장은 눈으로만 잡힌다) 상수로 묶는다.
 */

import './motion.css'

export const MOTION = {
  /** 아래에서 떠오르며 나타난다. 목록·문단의 기본. */
  rise: 'm-rise',
  /** 제자리에서 밝아진다. 위치가 바뀌면 안 되는 것(배경·이미지). */
  fade: 'm-fade',
  /** 살짝 커지며 나타난다. 숫자·배지처럼 눈에 띄어야 하는 것. */
  pop: 'm-pop',
  /** 화면 하나가 통째로. `App` 의 화면 전환에서만 쓴다. */
  screen: 'm-screen',
  /** 계속 떠 있다. 오행 오브젝트. */
  float: 'm-float',
  /** 뒤에서 숨 쉬는 후광. */
  halo: 'm-halo',
  /** 값이 아직 없다. */
  shimmer: 'm-shimmer',
  /** 0 에서 제 길이까지 찬다. 막대. */
  bar: 'm-bar',
  /** 높이가 접히고 펼쳐진다. `data-open` 으로 상태를 준다. */
  collapse: 'm-collapse',
  /** 누르면 들어간다. */
  press: 'm-press',
} as const

/**
 * 순차 등장 순번.
 *
 * `<div {...stagger(2)}>` 로 세 번째 순서에 뜬다. CSS 변수로 넘기므로 리렌더와 무관하고,
 * 자바스크립트 타이머가 없어 화면이 뒤로 갔다 와도 어긋나지 않는다.
 *
 * 타입 단언이 필요한 이유: React 의 `CSSProperties` 는 사용자 정의 속성(`--i`)을 모른다.
 */
export function stagger(index: number): { style: React.CSSProperties } {
  return { style: { '--i': index } as React.CSSProperties }
}

/**
 * 여러 클래스를 잇는다. 거짓값은 버린다.
 *
 * 이 하나 때문에 clsx 를 받지 않는다 — 미니앱 번들에 의존성을 하나라도 덜 싣는다.
 */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
