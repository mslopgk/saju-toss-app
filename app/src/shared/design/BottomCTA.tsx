import type { ReactNode } from 'react'
import { MOTION, cx } from '../motion'
import { C, GUTTER, S, T } from './theme'

/**
 * 하단 고정 버튼.
 *
 * ## 주 버튼은 흰색이다
 * 앞 판은 오행 강조색을 큰 CTA 에 썼다. 火 사용자에게는 화면 아래에 **주황색 큰 버튼**이
 * 생겼고, 그건 확인 버튼이 아니라 경고처럼 읽힌다. 거의 검정 위에서 가장 조용하고 가장
 * 분명한 것은 흰색 면이다. 강조색은 화면당 한 군데(가장 강한 오행 막대)에만 남긴다.
 *
 * TDS `FixedBottomCTA` 를 쓰지 않는 이유: **흰 바탕을 전제로 흰 그라디언트 스크림**을 깐다.
 * 어두운 화면 아래에 흰 안개가 끼고, 스크림 색은 바깥에서 바꿀 수 있는 값이 아니다.
 * 덤으로 이건 포털이 아니라 제자리에 그려지므로 정적 렌더 테스트가 버튼 문구를 본다.
 *
 * 안전영역은 `env(safe-area-inset-bottom)` 으로 직접 확보한다 — 홈 인디케이터가 있는 기기에서
 * 버튼이 그 아래로 깔리면 눌리지 않는다.
 */
export interface BottomCTAProps {
  readonly children: ReactNode
  readonly onClick: () => void
  /** 버튼 위 한 줄. 없으면 그리지 않는다. */
  readonly caption?: string
  /** 보조 버튼. 있으면 주 버튼 왼쪽에 좁게 붙는다. */
  readonly secondary?: { readonly label: string; readonly onClick: () => void }
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
        // 바 자체는 **완전 불투명**이다. 페이드는 바 위에 얹는 별도 띠가 담당한다(아래).
        background: C.bg,
        padding: `${S.md}px ${GUTTER}px calc(${S.lg}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {/*
        본문이 바에 닿기 전에 사라지게 하는 페이드.

        예전에는 바 배경 자체를 그라디언트로 줬는데, **캡션 줄 수에 따라 바 높이가 바뀌어**
        캡션이 반투명 구간에 앉는 일이 온보딩(한 줄)과 깊이읽기(두 줄)에서 각각 재발했다.
        불투명 바 + 그 위 고정 높이 띠로 나누면 캡션이 몇 줄이든 관계가 깨지지 않는다.
      */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: '100%',
          height: S.xxl,
          background: `linear-gradient(to top, ${C.bg} 0%, transparent 100%)`,
          pointerEvents: 'none',
        }}
      />
      {caption !== undefined && (
        <p
          style={{
            margin: `0 0 ${S.md}px`,
            textAlign: 'center',
            ...T.caption,
            color: C.textMuted,
          }}
        >
          {caption}
        </p>
      )}
      <div style={{ display: 'flex', gap: S.sm }}>
        {secondary !== undefined && (
          <button
            type="button"
            onClick={secondary.onClick}
            className={MOTION.press}
            style={{
              flex: '0 0 34%',
              height: 52,
              borderRadius: 14,
              border: 'none',
              background: C.surface,
              color: C.textBody,
              fontSize: 15,
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
            height: 52,
            borderRadius: 14,
            border: 'none',
            background: disabled ? C.surface : C.text,
            color: disabled ? C.textMuted : C.bg,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          {children}
        </button>
      </div>
    </div>
  )
}
