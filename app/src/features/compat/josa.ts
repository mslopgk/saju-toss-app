/**
 * 조사(助詞) 선택.
 *
 * `shared/interpret/template.ts` 에도 같은 이름의 내부 헬퍼가 있지만 **가져오지 않는다** —
 * 그쪽은 내보내지 않는 사적 함수이고, 무엇보다 판정 규칙이 다르다. 저쪽은 마지막 글자가 한자면
 * 받침 없음으로 두고 대신 "한자 뒤에 조사를 붙이지 않는다"는 규율(`template.test.ts`)로 피해 가지만,
 * 궁합 리포트는 `甲(갑)`·`寅(인)` 처럼 **한자 뒤에 한글 독음을 괄호로 단 표기**를 쓰기 때문에
 * 뒤에서부터 첫 한글 음절을 찾아야 맞는 조사가 나온다.
 */

/** 뒤에서부터 첫 한글 음절의 받침 유무. 한글이 하나도 없으면 null */
export function finalConsonant(word: string): boolean | null {
  for (let i = word.length - 1; i >= 0; i--) {
    const code = word.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  }
  return null;
}

/**
 * `withJong` / `withoutJong` 중 하나를 고른다.
 * 한글이 없어 판정 불가면 **아무것도 붙이지 않는다** — 틀린 조사를 붙이느니 비우는 편이 낫다.
 */
export function josa(word: string, withJong: string, withoutJong: string): string {
  const jong = finalConsonant(word);
  if (jong === null) return word;
  return `${word}${jong ? withJong : withoutJong}`;
}

export const iGa = (w: string): string => josa(w, '이', '가');
export const eunNeun = (w: string): string => josa(w, '은', '는');
export const yeyo = (w: string): string => josa(w, '이에요', '예요');
export const igo = (w: string): string => josa(w, '이고', '고');

/** `甲(갑)`, `己(기)` → `甲(갑) · 己(기)`. 조사가 갈리는 `와/과` 를 피해 가운뎃점으로 잇는다 */
export const dotJoin = (words: readonly string[]): string => words.join(' · ');
