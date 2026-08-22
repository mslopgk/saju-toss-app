import { useEffect, useRef, type ReactNode } from 'react'
import { animate, createSpring } from 'animejs'
import { C, GUTTER, R, S, T } from './theme'

/**
 * 아래에서 올라오는 시트.
 *
 * ## TDS `BottomSheet` 를 대체한 이유
 * 두 가지가 겹쳤다.
 *
 * 1. **흰 표면.** 앱의 모든 화면이 먹색인데 시트만 흰색이었다. 자체 휠을 넣자 흰 바탕에
 *    흰 글자가 되어 **휠이 통째로 보이지 않았다** — 그때야 이 불일치가 눈에 들어왔다.
 *    (`design-taste-frontend` §4.11 Page Theme Lock: 한 화면 안에서 테마가 뒤집히면 안 된다.)
 * 2. **감각.** "생년월일 고르는 게 딱딱하다" 는 지적의 절반은 휠이고 절반은 이 그릇이다.
 *    올라오는 방식이 남의 컴포넌트 안에 있으면 고칠 수 없다.
 *
 * ## 스프링으로 올라온다
 * `createSpring` 이라 끝에서 아주 살짝 지나쳤다가 안착한다. 선형 이징이면 "미끄러져 멈춘다"
 * 로 읽히고, 그게 딱딱함의 정체다. 배경 어둠은 같은 시간 동안 그냥 밝아진다 — 둘 다
 * 튀면 화면이 어지럽다.
 *
 * ## 닫기
 * 배경을 누르거나 `Esc` 로 닫는다. 닫는 애니메이션은 두지 않는다 — 사용자가 이미 다음
 * 화면을 보려는 참이라 기다리게 만들 이유가 없다.
 */
export interface SheetProps {
  readonly open: boolean
  readonly title: string
  /** 제목 아래 한 줄. 없으면 그리지 않는다. */
  readonly description?: string
  readonly onClose: () => void
  /** 바닥에 고정되는 확인 버튼. 없으면 시트에 확인 버튼이 없다. */
  readonly cta?: { readonly label: string; readonly onClick: () => void }
  readonly children: ReactNode
}

export function Sheet({ open, title, description, onClose, cta, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const dim = dimRef.current
    if (panel === null || dim === null) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    animate(dim, { opacity: [0, 1], duration: 220, ease: 'linear' })
    animate(panel, {
      // 화면 높이 대신 패널 높이를 쓴다 — 짧은 시트가 화면 끝에서부터 올라오면 느려 보인다.
      y: [panel.offsetHeight, 0],
      duration: 520,
      ease: createSpring({ stiffness: 140, damping: 20 }),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <div
        ref={dimRef}
        onClick={onClose}
        aria-hidden
        style={{ position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, 0.62)' }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          // 먹색 위에 한 층. 시트도 같은 세계다.
          background: '#161412',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: `${S.md}px 0 calc(${S.lg}px + env(safe-area-inset-bottom, 0px))`,
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 손잡이. 이게 있어야 "끌어내릴 수 있다" 가 눌러 보지 않아도 읽힌다. */}
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            borderRadius: R.pill,
            background: 'rgba(247,244,238,0.18)',
            margin: '0 auto',
          }}
        />

        <div style={{ padding: `${S.lg}px ${GUTTER}px ${S.md}px` }}>
          <h2 style={{ margin: 0, ...T.title, color: C.text }}>{title}</h2>
          {description !== undefined && (
            <p style={{ margin: `${S.sm}px 0 0`, ...T.caption, color: C.textMuted }}>
              {description}
            </p>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>

        {cta !== undefined && (
          <div style={{ padding: `${S.md}px ${GUTTER}px 0` }}>
            <button
              type="button"
              onClick={cta.onClick}
              style={{
                width: '100%',
                height: 52,
                borderRadius: R.control,
                border: 'none',
                background: C.text,
                color: C.bg,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                cursor: 'pointer',
              }}
            >
              {cta.label}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 시트 안의 라디오 목록. 출생지처럼 항목이 많고 값 하나를 고르는 자리에 쓴다.
 *
 * TDS `BottomSheet.Select` 를 대신한다 — 그것도 흰 바탕을 전제한다.
 */
export interface SheetSelectProps<T extends string> {
  readonly name: string
  readonly options: readonly { readonly value: T; readonly label: string; readonly hint?: string }[]
  readonly value: T | null
  readonly onSelect: (value: T) => void
}

export function SheetSelect<T extends string>({
  name,
  options,
  value,
  onSelect,
}: SheetSelectProps<T>) {
  return (
    <div role="radiogroup" aria-label={name} style={{ padding: `0 ${GUTTER}px` }}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(option.value)}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: S.md,
              padding: `${S.md}px 0`,
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span
                style={{
                  ...T.body,
                  fontSize: 16,
                  fontWeight: selected ? 700 : 400,
                  color: selected ? C.text : C.textBody,
                }}
              >
                {option.label}
              </span>
              {option.hint !== undefined && (
                <span style={{ ...T.caption, color: C.textMuted }}>{option.hint}</span>
              )}
            </span>
            {selected && (
              // 선택 표시는 인주색 점 하나. 체크 아이콘보다 조용하고 이 앱의 색을 쓴다.
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: R.pill,
                  background: C.seal,
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
