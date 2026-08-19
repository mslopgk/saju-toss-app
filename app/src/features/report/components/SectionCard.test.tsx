/**
 * 섹션 카드.
 *
 * 여기서 고정하는 것은 **접힌 카드가 비지 않는다**는 것이다. 미리보기가 빈 문자열이 되면
 * 화면에는 제목만 남고, 사용자는 무엇이 들었는지 몰라 아무것도 펼치지 않는다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import { SectionCard, firstSentence } from './SectionCard'

describe('firstSentence', () => {
  it('마침표까지 포함해 첫 문장만 남긴다', () => {
    expect(firstSentence('첫 문장입니다. 둘째 문장입니다.')).toBe('첫 문장입니다.')
  })

  it('문장이 하나뿐이면 그대로 돌려준다', () => {
    expect(firstSentence('한 문장뿐입니다.')).toBe('한 문장뿐입니다.')
  })

  /** 마침표가 없다고 미리보기를 비우면 카드가 제목만 남는다. */
  it('마침표가 없어도 비우지 않는다', () => {
    expect(firstSentence('물음으로 끝나면 어떻게 될까요?')).toBe('물음으로 끝나면 어떻게 될까요?')
  })

  it('빈 본문은 빈 문자열이다 — 없는 문장을 지어내지 않는다', () => {
    expect(firstSentence('')).toBe('')
  })
})

const render = (node: React.ReactElement): string =>
  renderToString(<TDSMobileAITProvider>{node}</TDSMobileAITProvider>)

describe('SectionCard', () => {
  const BODY = '첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.'

  it('접힌 상태에서 제목과 첫 문장을 보여 준다', () => {
    const html = render(<SectionCard title="타고난 결" body={BODY} />)
    expect(html).toContain('타고난 결')
    expect(html).toContain('첫 문장입니다.')
    expect(html).not.toContain('셋째 문장입니다.')
    expect(html).toContain('더 보기')
  })

  it('펼친 상태에서 본문 전체를 보여 준다', () => {
    const html = render(<SectionCard title="타고난 결" body={BODY} defaultOpen />)
    expect(html).toContain('셋째 문장입니다.')
    expect(html).toContain('접기')
  })

  /** 펼칠 것이 없는데 "더 보기"를 주면 눌러도 아무 일이 없는 버튼이 된다. */
  it('본문이 한 문장이면 펼치기 버튼을 주지 않는다', () => {
    const html = render(<SectionCard title="타고난 결" body="한 문장뿐입니다." />)
    expect(html).not.toContain('더 보기')
    expect(html).toContain('한 문장뿐입니다.')
  })
})
