/**
 * 접힌 섹션 카드의 미리보기 문구.
 *
 * 컴포넌트 파일에서 떼어 둔다 — 컴포넌트와 함수를 한 파일에서 내보내면 Fast Refresh 가 꺼진다.
 */

/**
 * 본문의 첫 문장.
 *
 * 마침표까지 포함해 자른다 — 자른 티가 나는 말줄임표보다 온전한 한 문장이 읽기 좋고,
 * 규칙 렌더러도 LLM 도 문장 단위로 글을 쓴다.
 *
 * 마침표가 없으면(한 문장짜리 본문이거나 물음표로 끝나는 경우) 본문 전체를 돌려준다.
 * 자르기 실패를 빈 문자열로 만들지 않는다 — 미리보기가 비면 카드가 제목만 남는다.
 */
export function firstSentence(body: string): string {
  const end = body.indexOf('. ')
  if (end === -1) return body.trim()
  return body.slice(0, end + 1).trim()
}
