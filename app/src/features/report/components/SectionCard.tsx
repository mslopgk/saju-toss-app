import { useState } from 'react'
import { Paragraph, Spacing } from '@toss/tds-mobile'
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
 */
export interface SectionCardProps {
  readonly title: string
  readonly body: string
  /** 처음부터 펼쳐 둘지. 첫 장만 열어 두면 사용자가 펼치는 동작을 배운다. */
  readonly defaultOpen?: boolean
}

export function SectionCard({ title, body, defaultOpen = false }: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const preview = firstSentence(body)
  // 첫 문장이 곧 본문 전체면 펼칠 것이 없다. 열리지 않는 버튼을 주지 않는다.
  const collapsible = preview !== body.trim()

  return (
    <div style={{ padding: '0 20px' }}>
      <div
        style={{
          padding: '16px 18px',
          borderRadius: 16,
          background: 'var(--adaptiveGrey50)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!collapsible}
          aria-expanded={open}
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
          <Paragraph typography="st11" fontWeight="bold">
            {title}
          </Paragraph>
          {collapsible && (
            <Paragraph typography="st13" color="var(--adaptiveGrey600)">
              {open ? '접기' : '더 보기'}
            </Paragraph>
          )}
        </button>

        <Spacing size={6} />
        <Paragraph typography="st12" color={open ? undefined : 'var(--adaptiveGrey700)'}>
          {open || !collapsible ? body : preview}
        </Paragraph>
      </div>
      <Spacing size={10} />
    </div>
  )
}
