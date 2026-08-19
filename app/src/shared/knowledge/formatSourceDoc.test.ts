/**
 * 출처 표기 회귀.
 *
 * `source` 는 저장소 내부 좌표라 그대로 화면에 찍으면 소비자 앱에 파일 경로가 노출된다.
 * 실제로 결과 화면 "이 리포트가 참고한 자료"에 이렇게 보이고 있었다:
 *   `C04-십신-십이운성-신살-판정-룩업테이블.md §7-12 §12-1 (+ tables.json gosinGwasuk)`
 *
 * 새는 곳이 **두 군데**라 한쪽만 막으면 절반만 고쳐진다 — `doc`(파일명)과
 * `section` 뒤의 `(+ …)` 상호참조. 여기서 그 둘을 각각, 그리고 합쳐서 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { CARDS } from './index';
import { formatSourceDoc, formatSourceLabel, formatSourceSection } from './types';

describe('formatSourceDoc', () => {
  it.each([
    ['C04-십신-십이운성-신살-판정-룩업테이블.md', 'C04 십신 십이운성 신살 판정 룩업테이블'],
    ['06-혈액형-성격론과-서양점성술-별자리-데이터.md', '06 혈액형 성격론과 서양점성술 별자리 데이터'],
    ['calc/personality-data.json', 'personality data'],
  ])('%s → %s', (input, expected) => {
    expect(formatSourceDoc(input)).toBe(expected);
  });

  it('문서 번호는 지우지 않는다 — 같은 주제 문서를 구분하는 유일한 표식이다', () => {
    expect(formatSourceDoc('C05-신강신약-오행점수-용신도출-정량알고리즘.md')).toMatch(/^C05 /);
  });
});

describe('formatSourceSection', () => {
  it.each([
    ['§7-12 §12-1 (+ tables.json gosinGwasuk)', '§7-12 §12-1'],
    ['§1-2 (+ calc/personality-data.json mbti.types)', '§1-2'],
    ['§A-2 (+ calc/personality-data.json bloodTypes, 10 §2.5)', '§A-2'],
    ['disclaimer', 'disclaimer'],
    ['§2.5 §3.1', '§2.5 §3.1'],
  ])('%s → %s', (input, expected) => {
    expect(formatSourceSection(input)).toBe(expected);
  });
});

describe('formatSourceLabel — 지식베이스 전량', () => {
  it('파일 확장자·디렉터리·상호참조가 하나도 남지 않는다', () => {
    expect(CARDS.length).toBeGreaterThan(0);
    for (const card of CARDS) {
      const shown = formatSourceLabel(card.source);
      expect(shown, card.id).not.toMatch(/\.(md|json|ya?ml|txt)\b/i);
      expect(shown, card.id).not.toContain('/');
      expect(shown, card.id).not.toContain('(');
      expect(shown.length, card.id).toBeGreaterThan(0);
    }
  });

  it('원본 doc 문자열이 그대로 남는 카드는 하나도 없다', () => {
    for (const card of CARDS) {
      expect(formatSourceLabel(card.source), card.id).not.toContain(card.source.doc);
    }
  });
});
