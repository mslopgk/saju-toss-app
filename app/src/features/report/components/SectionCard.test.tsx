/**
 * 섹션 카드.
 *
 * 여기서 고정하는 것은 **접힘 상태가 표시에 실제로 반영되는가**다. 높이 애니메이션을
 * grid(`0fr → 1fr`)로 하기 때문에 본문은 접혀 있어도 DOM 에 남는다 — 그래서 "본문 글자가
 * 없다"로는 접힘을 검증할 수 없고, `data-open` 과 `aria-expanded` 를 봐야 한다.
 */
import { renderToString } from 'react-dom/server'
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait'
import { describe, expect, it } from 'vitest'
import { SectionCard } from './SectionCard'
import { firstSentence } from './sectionPreview'

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
    expect(html).toContain('data-open="false"')
    expect(html).toContain('aria-expanded="false"')
  })

  /**
   * 접힌 미리보기는 본문 첫 문장과 같은 글이라 접근성 트리에서 뺐다.
   * 빠지지 않으면 스크린리더가 같은 문장을 두 번 읽는다.
   */
  it('접힌 미리보기는 스크린리더에 두 번 읽히지 않는다', () => {
    expect(render(<SectionCard title="타고난 결" body={BODY} />)).toContain('aria-hidden="true"')
  })

  it('펼친 상태로 시작하면 열린 채 그려진다', () => {
    const html = render(<SectionCard title="타고난 결" body={BODY} defaultOpen />)
    expect(html).toContain('셋째 문장입니다.')
    expect(html).toContain('data-open="true"')
    expect(html).toContain('aria-expanded="true"')
  })

  /** 펼칠 것이 없는데 토글을 주면 눌러도 아무 일이 없는 버튼이 된다. */
  it('본문이 한 문장이면 펼치기 토글을 주지 않는다', () => {
    const html = render(<SectionCard title="타고난 결" body="한 문장뿐입니다." />)
    expect(html).toContain('한 문장뿐입니다.')
    expect(html).toContain('disabled=""')
    // 접을 것이 없으므로 언제나 열린 상태로 둔다.
    expect(html).toContain('data-open="true"')
  })
})
