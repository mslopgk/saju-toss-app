import { useLayoutEffect, useRef } from 'react'

/**
 * 숫자가 0 에서 제 값까지 올라간다.
 *
 * ## 왜 여기만 자바스크립트인가
 * 이 앱의 모션은 전부 CSS 다(`motion.css`) — 컴포지터에서 돌고 바이트가 들지 않는다.
 * 딱 하나 CSS 로 안 되는 것이 **글자로 쓰인 숫자**다. `width` 는 전이되지만 `55점` 의 55 는
 * 전이되지 않는다. 궁합 점수와 오행 퍼센트는 그 화면의 결론이라 값이 올라가는 것이 보이면
 * "계산했다"는 감각이 생기고, 툭 나타나면 그냥 인쇄된 숫자로 읽힌다.
 *
 * ## anime.js 를 쓰지 않는 이유 (실측)
 * 처음에는 anime.js v4 로 만들었다. 동작은 같았고 **초기 청크가 gzip 462.6 → 475.9 kB 로
 * 13.4 kB 늘었다.** 그런데 쓰던 것은 `animate()` 를 평범한 객체 하나에 걸어 값을 보간하는
 * 것뿐이었다 — 타임라인·스프링·드래그·스크롤 옵저버를 하나도 쓰지 않았다.
 * 그 라이브러리가 무게를 하는 곳은 그런 기능이 필요한 자리이고, 여기서는 아래 rAF 루프가
 * 같은 결과를 0 바이트로 낸다. WebView 미니앱에서 13.4 kB 는 3% 에 가까운 몫이다.
 *
 * ## 리렌더로 만들지 않는다
 * 프레임마다 `setState` 하면 60fps 로 React 트리를 다시 그린다. 여기서는 ref 로 잡은
 * DOM 노드의 `textContent` 만 직접 쓴다 — 애니메이션이 트리와 무관해진다.
 *
 * ## 서버 렌더는 **완성된 값**이다
 * 초기 마크업에 최종 숫자를 그대로 담는다. 그래야 자바스크립트가 죽거나 늦어도 숫자가 보이고,
 * 정적 렌더 테스트(`\d+점`)와 스모크가 실제 값을 볼 수 있다. 0 으로 되돌리는 것은
 * `useLayoutEffect` 안에서 — **페인트 전에** 일어나므로 최종값이 한 프레임 번쩍이지 않는다.
 */
export interface CountUpOptions {
  /** 소수 자릿수. 궁합 항목 점수처럼 46.4 가 나오는 자리에 쓴다. */
  readonly decimals?: number
  /** 숫자 뒤에 붙는 것("점", "%"). 접두는 쓰지 않는다 — 필요한 곳이 없다. */
  readonly suffix?: string
  readonly durationMs?: number
  readonly delayMs?: number
}

/** 3차 감속. anime 의 `out(3)` 과 같은 곡선이다 — 끝에서 천천히 안착해야 "센다"로 읽힌다. */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function useCountUp(
  value: number,
  { decimals = 0, suffix = '', durationMs = 900, delayMs = 120 }: CountUpOptions = {},
): React.RefObject<HTMLSpanElement> {
  // React 18 타입에서 `ref` 프롭은 null 을 포함하지 않는 RefObject 를 원한다.
  const ref = useRef<HTMLSpanElement>(null) as React.RefObject<HTMLSpanElement>

  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return

    const write = (n: number) => {
      node.textContent = `${n.toFixed(decimals)}${suffix}`
    }
    const settle = () => {
      write(value)
    }

    // 모션을 끈 사용자에게는 아무것도 하지 않는다 — 마크업의 최종값이 그대로 남는다.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let start = 0
    write(0)

    const step = (now: number) => {
      if (start === 0) start = now
      const elapsed = now - start - delayMs
      if (elapsed < 0) {
        frame = requestAnimationFrame(step)
        return
      }
      const t = Math.min(1, elapsed / durationMs)
      write(value * easeOutCubic(t))
      if (t < 1) {
        frame = requestAnimationFrame(step)
        return
      }
      // 마지막 프레임의 반올림 오차가 남지 않게 값을 못박는다.
      settle()
    }
    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
      // 중간에 언마운트·값 변경으로 끊기면 숫자가 어중간한 값으로 남는다. 되돌려 둔다.
      settle()
    }
  }, [value, decimals, suffix, durationMs, delayMs])

  return ref
}
