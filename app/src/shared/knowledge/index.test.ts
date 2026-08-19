// 지식카드 회귀 테스트 — 카드 무결성 + retrieve 결정론
import { describe, expect, it } from 'vitest';
import { CARDS, getCard, getCards, KNOWLEDGE_KINDS, retrieve, retrieveScored, KnowledgeQueryError } from './index';

describe('cards 무결성', () => {
  it('id 는 kind:key 이고 전역 유일하다', () => {
    const ids = new Set<string>();
    for (const c of CARDS) {
      expect(c.id).toBe(`${c.kind}:${c.key}`);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
    expect(ids.size).toBe(CARDS.length);
  });

  it('모든 카드가 알려진 kind 와 근거·등급을 갖는다', () => {
    for (const c of CARDS) {
      expect(KNOWLEDGE_KINDS).toContain(c.kind);
      expect(c.source.doc.length).toBeGreaterThan(0);
      expect(c.source.section.length).toBeGreaterThan(0);
      expect(['A', 'B', 'C', 'D']).toContain(c.confidence);
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.summary.length).toBeGreaterThan(0);
      expect(c.detail.length).toBeGreaterThan(0);
      expect(c.keywords.length).toBeGreaterThan(0);
    }
  });

  it('계산 엔진이 내는 값 집합이 전부 카드로 덮인다', () => {
    const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    const TEN_GODS = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
    const UNSEONG = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양'];
    const SINSAL12 = ['겁살', '재살', '천살', '지살', '연살', '월살', '망신살', '장성살', '반안살', '역마살', '육해살', '화개살'];
    const MBTI = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];

    expect(getCards('ilgan', STEMS)).toHaveLength(10);
    expect(getCards('jiji', BRANCHES)).toHaveLength(12);
    expect(getCards('sipsin', TEN_GODS)).toHaveLength(10);
    expect(getCards('unseong', UNSEONG)).toHaveLength(12);
    expect(getCards('sinsal', SINSAL12)).toHaveLength(12);
    expect(getCards('mbti', MBTI)).toHaveLength(16);
    expect(getCards('blood', ['A', 'B', 'O', 'AB'])).toHaveLength(4);
    expect(getCards('zodiac', ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'])).toHaveLength(12);
  });
});

describe('retrieve', () => {
  it('정확 키가 항상 1위로 온다', () => {
    const [top] = retrieve({ kinds: ['sipsin'], keys: ['정관'] });
    expect(top?.key).toBe('정관');
  });

  it('kind 필터를 벗어난 카드는 나오지 않는다', () => {
    const out = retrieve({ kinds: ['zodiac'], terms: ['불'], limit: 30 });
    expect(out.every((c) => c.kind === 'zodiac')).toBe(true);
  });

  it('minConfidence 는 하위 등급을 잘라낸다', () => {
    const out = retrieve({ minConfidence: 'B', limit: 200 });
    expect(out.every((c) => c.confidence === 'A' || c.confidence === 'B')).toBe(true);
  });

  it('같은 질의는 같은 순서를 낸다(결정론)', () => {
    const q = { kinds: ['sinsal'], terms: ['이동', '변화'], limit: 5 } as const;
    expect(retrieve(q).map((c) => c.id)).toEqual(retrieve(q).map((c) => c.id));
  });

  it('매칭이 없으면 빈 배열', () => {
    expect(retrieve({ terms: ['zzzz존재하지않는검색어'] })).toEqual([]);
  });

  it('limit 을 지킨다', () => {
    expect(retrieve({ terms: ['운'], limit: 3 })).toHaveLength(3);
  });

  it('잘못된 질의는 KnowledgeQueryError', () => {
    // @ts-expect-error 런타임 경계 검증 확인용
    expect(() => retrieve({ kinds: ['없는kind'] })).toThrow(KnowledgeQueryError);
    expect(() => retrieve({ limit: 0 })).toThrow(KnowledgeQueryError);
  });

  it('matched 에 점수 기여 검색어가 담긴다', () => {
    const [hit] = retrieveScored({ kinds: ['ilgan'], keys: ['丙'] });
    expect(hit?.matched).toContain('丙');
    expect(hit?.score).toBeGreaterThanOrEqual(100);
  });

  it('getCard 는 없는 키에 undefined', () => {
    expect(getCard('sipsin', '없는십신')).toBeUndefined();
  });
});
