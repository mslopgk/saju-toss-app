import type { ReactNode } from 'react'
import { MOTION, cx, stagger } from '../motion'
import { NIGHT } from './theme'

/**
 * 입력 한 줄.
 *
 * TDS `ListRow` 를 쓰지 않는 이유는 `BottomCTA` 와 같다 — 흰 바탕을 전제한 컴포넌트라
 * 심야 하늘 위에 얹으면 흰 띠가 생긴다. 목록 전체를 유리판 하나로 묶고 그 안에 줄을 넣는다.
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
        gap: 12,
        padding: '14px 16px',
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        color: NIGHT.text,
      }}
    >
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: NIGHT.textDim }}>{label}</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: muted ? NIGHT.textDim : NIGHT.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </span>
      </span>
      <span aria-hidden style={{ color: NIGHT.textDim, fontSize: 18, flexShrink: 0 }}>
        ›
      </span>
    </button>
  )
}

/** 줄들을 감싸는 유리판. 줄 사이에 실선 하나. */
export function FieldGroup({ children, index = 0 }: { children: ReactNode; index?: number }) {
  return (
    <div
      className={MOTION.rise}
      {...stagger(index)}
      style={{
        margin: '0 20px',
        borderRadius: 18,
        background: NIGHT.glass,
        border: `1px solid ${NIGHT.glassBorder}`,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

/**
 * 하나만 고르는 칩 묶음. 성별·혈액형처럼 선택지가 적고 전부 보여도 되는 값에 쓴다.
 *
 * `aria-pressed` 로 선택 상태를 말한다. 색만으로 표시하면 스크린리더 사용자와
 * 색각 이상 사용자가 무엇이 골라졌는지 알 수 없다.
 */
export interface ChipGroupProps<T extends string> {
  readonly options: readonly T[]
  readonly value: T | null
  readonly onChange: (value: T) => void
  readonly accent?: string
  readonly label?: (value: T) => string
  readonly index?: number
}

export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  accent = '#3182F6',
  label,
  index = 0,
}: ChipGroupProps<T>) {
  return (
    <div className={MOTION.rise} {...stagger(index)} style={{ display: 'flex', gap: 8 }}>
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
              height: 48,
              borderRadius: 14,
              // 선택은 테두리로도 말한다 — 배경색만으로는 대비가 낮은 화면에서 묻힌다.
              border: `1px solid ${selected ? accent : NIGHT.glassBorder}`,
              background: selected ? `${accent}26` : NIGHT.glass,
              color: selected ? NIGHT.text : NIGHT.textSub,
              fontSize: 15,
              fontWeight: selected ? 700 : 500,
              cursor: 'pointer',
              transition: 'background 180ms ease, border-color 180ms ease',
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
    <div className={MOTION.rise} {...stagger(index)} style={{ padding: '0 24px' }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, lineHeight: 1.34, color: NIGHT.text }}>
        {title}
      </h1>
      {subtitle !== undefined && (
        <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: NIGHT.textDim }}>
          {subtitle}
        </p>
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
      style={{ margin: 0, fontSize: 15, fontWeight: 700, color: NIGHT.text }}
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
        padding: '0 24px',
        fontSize: 13,
        lineHeight: 1.55,
        color: tone === 'warn' ? '#FCA5A5' : NIGHT.textDim,
      }}
    >
      {children}
    </p>
  )
}
