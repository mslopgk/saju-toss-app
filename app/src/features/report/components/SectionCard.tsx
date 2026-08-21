import { useState } from 'react'
import { C, GUTTER, R, S, T } from '../../../shared/design'
import { MOTION, cx, stagger } from '../../../shared/motion'
import { firstSentence } from './sectionPreview'

/**
 * 깊이읽기의 섹션 한 장.
 *
 * 근거: docs/superpowers/specs/2026-08-19-report-redesign-design.md §3.
 *
 * 예전 결과 화면은 섹션 본문을 전부 펼친 채 세로로 쌓았다. 문단 열한 개가 이어지면 사용자는
 * **어디까지 읽었는지 잃어버리고 첫 두 문단만 읽고 나간다.** 접어 두면 목록이 한눈에 들어오고,
 * 궁금한 것만 펼치게 된다.
 *
 * 접힌 상태에도 **첫 문장은 남긴다.** 제목만 남기면 무엇이 들었는지 몰라 아무것도 열지 않는다.
 *
 * ## 높이 애니메이션
 * `height: auto` 는 전이되지 않는다. 자바스크립트로 `scrollHeight` 를 재는 흔한 우회 대신
 * grid 행을 `0fr → 1fr` 로 미는 `m-collapse` 를 쓴다 — 내용이 바뀌어도 다시 재지 않고,
 * 모션을 끈 사용자에게는 전이만 사라지고 펼침은 그대로 동작한다.
 */
export interface SectionCardProps {
  readonly title: string
  readonly body: string
  /** 처음부터 펼쳐 둘지. 첫 장만 열어 두면 사용자가 펼치는 동작을 배운다. */
  readonly defaultOpen?: boolean
  readonly index?: number
}

export function SectionCard({ title, body, defaultOpen = false, index = 0 }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const preview = firstSentence(body)
  // 첫 문장이 곧 본문 전체면 펼칠 것이 없다. 열리지 않는 버튼을 주지 않는다.
  const collapsible = preview !== body.trim()

  return (
    <div className={MOTION.rise} {...stagger(index)} style={{ padding: `0 ${GUTTER}px ${S.md}px` }}>
      <div
        style={{
          padding: '16px 18px',
          borderRadius: R.card,
          background: C.surface,
          border: `1px solid ${C.divider}`,
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!collapsible}
          aria-expanded={open}
          className={cx(collapsible && MOTION.press)}
          style={{
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: 0,
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            cursor: collapsible ? 'pointer' : 'default',
          }}
        >
          <span style={{ ...T.title, fontSize: 16, color: C.text }}>{title}</span>
          {collapsible && (
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke={C.textMuted}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                flexShrink: 0,
                // 화살표가 돈다. 문구("더 보기"/"접기")보다 조용하고, 열림/닫힘을 방향으로 말한다.
                // 글자(`⌄`)로 그리지 않는 이유: 글꼴에 따라 자형이 없거나 기준선이 어긋난다.
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--dur-base) var(--ease-out)',
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </button>

        {/*
          접힌 상태의 미리보기.

          `aria-hidden` 인 이유: 높이 애니메이션 때문에 **본문이 접혀 있어도 DOM 에 남는다.**
          미리보기는 그 본문의 첫 문장과 같은 글이라, 그대로 두면 스크린리더가 같은 문장을
          두 번 읽는다. 눈으로 보는 사람에게만 필요한 요약이므로 접근성 트리에서 뺀다.
        */}
        {collapsible && !open && (
          <p
            aria-hidden
            style={{
              margin: '8px 0 0',
              fontSize: 14,
              lineHeight: 1.65,
              color: C.textMuted,
            }}
          >
            {preview}
          </p>
        )}

        <div className={MOTION.collapse} data-open={open || !collapsible ? 'true' : 'false'}>
          <div>
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 14,
                lineHeight: 1.7,
                color: C.textBody,
              }}
            >
              {body}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
