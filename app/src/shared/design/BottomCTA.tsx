import type { ReactNode } from 'react'
import { MOTION, cx } from '../motion'
import { NIGHT } from './theme'

/**
 * 어두운 세계의 하단 고정 버튼.
 *
 * TDS `FixedBottomCTA` 를 쓰지 않는 이유: 그 컴포넌트는 **흰 바탕을 전제로 흰 그라디언트
 * 스크림**을 깐다. 심야 하늘 위에 얹으면 화면 아래에 흰 안개가 끼고, 네 화면 전부에서
 * 같은 충돌이 난다. 스크림 색은 바깥에서 바꿀 수 있는 값이 아니라 갈아 끼우는 편이 낫다.
 *
 * 덤으로 얻는 것: TDS 쪽은 포털이라 서버 렌더에 본문이 실리지 않아 문구를 테스트에서 볼 수
 * 없었다. 이건 제자리에 그려지므로 정적 렌더 테스트가 버튼 문구를 본다.
 *
 * 안전영역은 `env(safe-area-inset-bottom)` 으로 직접 확보한다 — 홈 인디케이터가 있는 기기에서
 * 버튼이 그 아래로 깔리면 눌리지 않는다.
 */
export interface BottomCTAProps {
  readonly children: ReactNode
  readonly onClick: () => void
  /** 버튼 위에 한 줄. 없으면 그리지 않는다. */
  readonly caption?: string
  /** 보조 버튼. 있으면 주 버튼 왼쪽에 좁게 붙는다. */
  readonly secondary?: { readonly label: string; readonly onClick: () => void }
  readonly accent?: string
  /**
   * 아직 누를 수 없다. **`onClick` 을 빈 함수로 바꾸는 것으로 대신하지 않는다** —
   * 눌리는 것처럼 보이는데 아무 일도 안 나는 버튼이 되고, 스크린리더도 상태를 말하지 못한다.
   */
  readonly disabled?: boolean
}

export function BottomCTA({
  children,
  onClick,
  caption,
  secondary,
  accent,
  disabled = false,
}: BottomCTAProps) {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        padding: '0 20px calc(16px + env(safe-area-inset-bottom, 0px))',
        /*
          스크림. 버튼 위로 지나가는 본문이 CTA 에 닿기 전에 사라지게 한다.

          **캡션이 놓이는 높이까지는 완전 불투명이어야 한다.** 처음에는 58% 지점부터
          반투명으로 뒀는데, 그 구간에 캡션이 앉아 본문 글자가 캡션을 뚫고 비쳤다.
          그래서 불투명 구간을 캡션 위까지 올리고 페이드는 맨 위에서만 준다.
        */
        background: `linear-gradient(to top, ${NIGHT.ground} 0%, ${NIGHT.ground} 72%, transparent 100%)`,
        paddingTop: 40,
      }}
    >
      {caption !== undefined && (
        <p
          style={{
            margin: '0 0 10px',
            textAlign: 'center',
            fontSize: 13,
            color: NIGHT.textDim,
          }}
        >
          {caption}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {secondary !== undefined && (
          <button
            type="button"
            onClick={secondary.onClick}
            className={cx(MOTION.press)}
            style={{
              flex: '0 0 38%',
              height: 54,
              borderRadius: 14,
              border: `1px solid ${NIGHT.glassBorder}`,
              background: NIGHT.glass,
              color: NIGHT.textSub,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {secondary.label}
          </button>
        )}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={cx(!disabled && MOTION.press)}
          style={{
            flex: 1,
            height: 54,
            borderRadius: 14,
            border: 'none',
            background: disabled ? 'rgba(255,255,255,0.12)' : (accent ?? '#3182F6'),
            // 강조색이 밝은 오행(金)일 때 흰 글자는 읽히지 않는다. 밝기로 글자색을 정한다.
            color: disabled
              ? NIGHT.textDim
              : accent !== undefined && isLight(accent)
                ? '#101736'
                : '#FFFFFF',
            fontSize: 17,
            fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          {children}
        </button>
      </div>
    </div>
  )
}

/**
 * 배경이 밝은가. 밝으면 글자를 어둡게 해야 읽힌다.
 *
 * 상대 휘도의 근사식(ITU-R BT.601)이다. 정확한 WCAG 대비비를 계산하지 않는 이유는 여기서
 * 필요한 판단이 "흰 글자냐 검은 글자냐" 하나뿐이고, 후보 색이 오행 다섯 개로 고정이기 때문이다.
 */
function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (m === null) return false
  const n = Number.parseInt(m[1]!, 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (r * 299 + g * 587 + b * 114) / 1000 > 165
}
