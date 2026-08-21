import type { ReactNode } from 'react'
import { MOTION, cx, stagger } from '../motion'
import { C, GUTTER, R, S, T } from './theme'

/**
 * 입력 한 줄.
 *
 * TDS `ListRow` 를 쓰지 않는 이유는 `BottomCTA` 와 같다 — 흰 바탕을 전제한 컴포넌트라
 * 어두운 화면에 흰 띠가 생긴다. 줄들을 면 하나로 묶고 그 안에 넣는다.
 *
 * 탭하면 시트가 열리는 줄이므로 `button` 이다. `div` + onClick 으로 만들면 키보드로 닿지
 * 않고 스크린리더가 "클릭 가능"임을 말하지 못한다.
 */
export interface FieldRowProps {
  readonly label: string
  readonly value: string
  /** 값이 아직 선택되지 않았다. 흐리게 그린다. */
  readonly muted?: boolean
  readonly onClick: () => void
  readonly index?: number
}

export function FieldRow({ label, value, muted = false, onClick, index = 0 }: FieldRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(MOTION.rise, MOTION.press)}
      {...stagger(index)}
      style={{
        display: 'flex',
        width: '100%',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: S.md,
        padding: `${S.lg}px ${S.lg}px`,
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        color: C.text,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ ...T.caption, color: C.textMuted }}>{label}</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: muted ? C.textMuted : C.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </span>
      </span>
      {/* 화살괄호를 SVG 로 그린다 — 글자(`›`)는 글꼴에 따라 기준선이 어긋난다. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke={C.textMuted}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
}

/**
 * 줄들을 감싸는 면.
 *
 * **테두리가 없다.** 어두운 바탕 위 반투명 테두리가 글래스모피즘의 서명이고, 면 밝기
 * 차이만으로도 층은 충분히 읽힌다. 줄 사이 구분선도 두지 않는다 — 라벨과 값이 이미
 * 두 줄로 묶여 있어 경계가 보인다.
 */
export function FieldGroup({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <div
      className={MOTION.rise}
      {...stagger(index)}
      style={{
        margin: `0 ${GUTTER}px`,
        borderRadius: R.card,
        background: C.surface,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

/**
 * 하나만 고르는 칩 묶음. 성별·혈액형·MBTI 축처럼 선택지가 적고 전부 보여도 되는 값에 쓴다.
 *
 * `aria-pressed` 로 선택 상태를 말한다. 색만으로 표시하면 스크린리더 사용자와
 * 색각 이상 사용자가 무엇이 골라졌는지 알 수 없다.
 *
 * 선택 표시는 **흰 면**이다. 강조색 테두리를 쓰면 화면에 강조색이 여러 군데 생기고,
 * 이 앱에서 강조색은 화면당 한 군데(가장 강한 오행 막대)로 정해 뒀다.
 */
export interface ChipGroupProps<T extends string> {
  readonly options: readonly T[]
  readonly value: T | null
  readonly onChange: (value: T) => void
  readonly label?: (value: T) => string
  readonly index?: number
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  index = 0,
}: ChipGroupProps<T>) {
  return (
    <div className={MOTION.rise} {...stagger(index)} style={{ display: 'flex', gap: S.sm }}>
      {options.map((option) => {
        const selected = option === value
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={MOTION.press}
            style={{
              flex: 1,
              minWidth: 0,
              height: 46,
              borderRadius: R.control,
              border: 'none',
              background: selected ? C.text : C.surface,
              color: selected ? C.bg : C.textBody,
              fontSize: 14,
              fontWeight: selected ? 700 : 500,
              cursor: 'pointer',
              transition: 'background 160ms ease, color 160ms ease',
            }}
          >
            {label === undefined ? option : label(option)}
          </button>
        )
      })}
    </div>
  )
}

/** 화면 맨 위 제목. TDS `Top` 이 흰 바탕을 전제해서 대신 쓴다. */
export function ScreenTitle({
  title,
  subtitle,
  index = 0,
}: {
  title: string
  subtitle?: string
  index?: number
}) {
  return (
    <div className={MOTION.rise} {...stagger(index)} style={{ padding: `0 ${GUTTER}px` }}>
      <h1 style={{ margin: 0, ...T.title, fontSize: 24, color: C.text }}>{title}</h1>
      {subtitle !== undefined && (
        <p style={{ margin: `${S.sm}px 0 0`, ...T.label, color: C.textMuted }}>{subtitle}</p>
      )}
    </div>
  )
}

/** 구획 제목. 폼 안의 작은 소제목. */
export function SectionLabel({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <h2
      className={MOTION.rise}
      {...stagger(index)}
      style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: C.text }}
    >
      {children}
    </h2>
  )
}

/** 작은 도움말 한 줄. 폼 곳곳에서 같은 크기·색이어야 화면이 조용해진다. */
export function Hint({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  return (
    <p
      style={{
        margin: 0,
        padding: `0 ${GUTTER}px`,
        ...T.caption,
        color: tone === 'warn' ? C.danger : C.textMuted,
      }}
    >
      {children}
    </p>
  )
}
