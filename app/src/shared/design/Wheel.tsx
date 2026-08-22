import { useEffect, useRef, useState } from 'react'
import { createDraggable, createSpring, utils } from 'animejs'
import { C, R, T } from './theme'

/**
 * 값 하나를 고르는 휠.
 *
 * ## TDS `Wheel` 을 대체한 이유
 * "생년월일·출생시간 고르는 게 너무 딱딱하게 움직인다" 는 지적을 받았다. 그 감각은 TDS
 * 컴포넌트 **내부**에 있어서 바깥에서 바꿀 수 없다 — CSS 로도, 프롭으로도 손이 닿지 않는다.
 * 감을 바꾸려면 굴리는 쪽을 우리가 가져야 한다.
 *
 * ## anime.js 가 여기서 무게값을 한다
 * 앞서 숫자 카운트업에는 anime.js 를 재고 **쓰지 않았다**(gzip +13.4kB 인데 rAF 15줄이 같은
 * 일을 했다). 여기는 다르다. `createDraggable` 이 포인터 드래그·관성·경계·스냅을 다 갖고
 * 있고, `createSpring` 이 놓았을 때의 탄성을 준다. 이걸 손으로 다시 쓰면 수백 줄이고
 * 그중 관성과 경계 처리는 틀리기 쉬운 자리다.
 *
 * ## 굴림의 구성
 * - 드래그는 세로 한 축(`y`)만. 가로는 잠근다.
 * - `snapY` 가 항목 높이라 손을 떼면 반드시 한 칸에 선다.
 * - `releaseEase` 는 스프링이라 살짝 지나쳤다가 돌아온다 — 이게 "딱딱하지 않다" 의 핵심이다.
 * - 가운데에서 멀수록 작아지고 흐려진다(원통 착시). `rotateX` 를 쓰지 않는 이유는 WebView 에서
 *   3D 변환이 텍스트를 흐리게 만들기 때문이다.
 *
 * ## 값은 바깥이 소유한다
 * TDS 것은 비제어라 되돌리려면 `key` 재마운트가 필요했다. 이건 제어 컴포넌트다 —
 * `value` 가 바뀌면 그 자리로 굴러간다.
 */
export interface WheelProps {
  /** 스크린리더용. 예: '년도 선택' */
  readonly label: string
  readonly options: readonly number[]
  readonly value: number
  readonly format: (value: number) => string
  readonly onChange: (value: number) => void
}

/** 항목 한 칸 높이. 화면에 다섯 칸이 보이도록 뷰포트를 이 값의 5배로 잡는다. */
const ITEM = 40
const VISIBLE = 5
export const WHEEL_HEIGHT = ITEM * VISIBLE

export function Wheel({ label, options, value, format, onChange }: WheelProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  // 화면에 그릴 강조 위치. 드래그 중에도 즉시 반응해야 해서 상태로 둔다.
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.indexOf(value)))
  // 최신 콜백을 이펙트 밖에서 읽는다 — 의존성에 넣으면 드래그가 매 렌더 재생성된다.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const valueRef = useRef(value)
  valueRef.current = value
  const draggableRef = useRef<ReturnType<typeof createDraggable> | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const track = trackRef.current
    if (track === null) return

    /** y 이동량 → 항목 번호. 위로 끌면 뒤 항목이 온다. */
    const indexOfY = (y: number) => utils.clamp(Math.round(-y / ITEM), 0, optionsRef.current.length - 1)

    const draggable = createDraggable(track, {
      x: false,
      // 첫 항목이 가운데 오는 위치가 0, 마지막 항목이 가운데 오는 위치가 -(n-1)*ITEM.
      y: { snap: ITEM },
      container: [0, 0, -(optionsRef.current.length - 1) * ITEM, 0],
      // 경계 밖으로 끌었을 때 저항. 1 이면 벽에 붙어 버려 고무줄 느낌이 사라진다.
      containerFriction: 0.82,
      // 놓았을 때의 탄성. 살짝 지나쳤다가 돌아오는 이 구간이 "딱딱하지 않다" 의 전부다.
      releaseEase: createSpring({ stiffness: 120, damping: 18 }),
      onUpdate: (self) => {
        setActiveIndex(indexOfY(self.y))
      },
      onSettle: (self) => {
        const next = optionsRef.current[indexOfY(self.y)]
        if (next !== undefined) onChangeRef.current(next)
      },
    })
    draggableRef.current = draggable

    /*
      초기 위치를 **draggable 을 만든 뒤에** 잡는다.

      처음에는 별도 이펙트에서 `utils.set` 으로 잡았는데, 생성 이펙트가 나중에 돌면서
      트랙을 0 으로 되돌렸다. 그러면 `activeIndex` 는 90(1990년)인데 트랙은 1900년 자리에
      서 있게 되고, 가운데 칸의 항목은 `activeIndex` 에서 90칸 떨어져 **불투명도가 0** 이 된다.
      화면에는 "연도 휠만 텅 빈" 상태로 나타났다 — 예외도 경고도 없다.
    */
    const initial = optionsRef.current.indexOf(valueRef.current)
    if (initial >= 0) {
      utils.set(track, { y: -initial * ITEM })
      setActiveIndex(initial)
    }

    return () => {
      draggableRef.current = null
      draggable.revert()
    }
    // 항목 목록이 바뀌면(음력 월 개수 변화 등) 경계가 달라지므로 다시 만든다.
  }, [options.length])

  // 바깥에서 값이 바뀌면 그 자리로 굴러간다(프리필·달력 전환).
  useEffect(() => {
    const track = trackRef.current
    // draggable 이 아직 없으면 위 이펙트가 초기 위치를 잡는다 — 여기서 먼저 건드리면 덮인다.
    if (track === null || draggableRef.current === null) return
    const index = options.indexOf(value)
    if (index < 0) return
    setActiveIndex(index)
    utils.set(track, { y: -index * ITEM })
  }, [value, options])

  return (
    <div
      ref={viewportRef}
      role="listbox"
      aria-label={label}
      style={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        height: WHEEL_HEIGHT,
        overflow: 'hidden',
        // 드래그 중 브라우저가 세로 스크롤을 가로채지 않게 한다.
        touchAction: 'none',
      }}
    >
      {/* 선택칸. 값 뒤에 아주 옅은 면 하나면 어디가 선택인지 알 수 있다. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: (WHEEL_HEIGHT - ITEM) / 2,
          height: ITEM,
          borderRadius: R.control,
          background: C.surface,
          pointerEvents: 'none',
        }}
      />
      <div
        ref={trackRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: (WHEEL_HEIGHT - ITEM) / 2,
          willChange: 'transform',
        }}
      >
        {options.map((option, i) => {
          const distance = Math.abs(i - activeIndex)
          return (
            <div
              key={option}
              role="option"
              aria-selected={i === activeIndex}
              style={{
                height: ITEM,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...T.body,
                fontSize: 17,
                fontWeight: distance === 0 ? 700 : 400,
                fontVariantNumeric: 'tabular-nums',
                color: distance === 0 ? C.text : C.textMuted,
                // 가운데에서 멀수록 작고 흐리게. 원통처럼 보이되 글자는 또렷하게 남는다.
                opacity: Math.max(0, 1 - distance * 0.28),
                transform: `scale(${Math.max(0.8, 1 - distance * 0.06)})`,
                transition: 'color 120ms linear, font-weight 120ms linear',
              }}
            >
              {format(option)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
