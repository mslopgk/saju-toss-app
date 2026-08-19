import { describe, expect, it } from 'vitest';
import type { SignIdx } from '../saju/types';
import { MBTI_TYPE_ORDER, ZODIAC_SIGN_ORDER } from './params';
import { scoreBlood, scoreMbti, scoreZodiac } from './subsystems';
import type { CompatBloodType } from './types';

const signOf = (ko: string): SignIdx => ZODIAC_SIGN_ORDER.indexOf(ko) as SignIdx;

describe('별자리 (C18 §4 / C00 §3-H13)', () => {
  it('각거리 7값만 낸다 — C18 §4.3 채택표 {k0:88 k1:33 k2:79 k3:32 k4:91 k5:31 k6:88}', () => {
    const byK = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        const r = scoreZodiac(i as SignIdx, j as SignIdx);
        byK.set(r.angularDistance, r.score);
      }
    }
    expect([...byK.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 88],
      [1, 33],
      [2, 79],
      [3, 32],
      [4, 91],
      [5, 31],
      [6, 88],
    ]);
  });

  it('C18 X1 검증 — 같은 별자리(k=0)와 오포지션(k=6)이 둘 다 88 이다', () => {
    // M-A(C08 원안)였다면 k0=79 / k6=79 였다. 양태(M) 항 부호 정정의 지문이다.
    expect(scoreZodiac(4 as SignIdx, 4 as SignIdx).score).toBe(88);
    expect(scoreZodiac(0 as SignIdx, 6 as SignIdx).score).toBe(88);
  });

  it('격자에 맞는 어스펙트 이름을 붙이고, 45°/135° 는 태양궁 격자에 없다', () => {
    expect(scoreZodiac(0 as SignIdx, 0 as SignIdx).aspect).toContain('합');
    expect(scoreZodiac(0 as SignIdx, 4 as SignIdx).aspect).toContain('트라인');
    expect(scoreZodiac(0 as SignIdx, 3 as SignIdx).aspect).toContain('스퀘어');
    expect(scoreZodiac(0 as SignIdx, 6 as SignIdx).aspect).toContain('오포지션');
    // 30° 배수만 존재하므로 세미스퀘어(45°)·세스퀴쿼드레이트(135°)는 조회되지 않는다.
    const names = new Set<string | null>();
    for (let k = 0; k <= 6; k++) names.add(scoreZodiac(0 as SignIdx, k as SignIdx).aspect);
    expect(names.has('세미스퀘어')).toBe(false);
  });

  it('TV-01~TV-06 의 별자리 쌍 (M-B 값)', () => {
    expect(scoreZodiac(signOf('물병자리'), signOf('천칭자리')).score).toBe(91); // k=4
    expect(scoreZodiac(signOf('게자리'), signOf('염소자리')).score).toBe(88); // k=6
    expect(scoreZodiac(signOf('사자자리'), signOf('사자자리')).score).toBe(88); // k=0
    expect(scoreZodiac(signOf('양자리'), signOf('천칭자리')).score).toBe(88); // k=6
    expect(scoreZodiac(signOf('황소자리'), signOf('처녀자리')).score).toBe(91); // k=4
    expect(scoreZodiac(signOf('양자리'), signOf('게자리')).score).toBe(32); // k=3 스퀘어, 최저
  });
});

describe('MBTI (C18 §3 / C00 §3-H5)', () => {
  it('C18 TV-C18-10 — v3 의 최고·최저 쌍', () => {
    expect(scoreMbti('INFP', 'INFJ')!.score).toBe(95);
    expect(scoreMbti('ENFP', 'ENFJ')!.score).toBe(95);
    expect(scoreMbti('INFP', 'ISTP')!.score).toBe(25);
    expect(scoreMbti('ENFP', 'ESTP')!.score).toBe(25);
    // C08 §1.3 이 "최고쌍" 으로 든 INTJ×ENFP 는 v1 값이다. v3 에서는 90 으로 내려간다.
    expect(scoreMbti('INTJ', 'ENFP')!.score).toBe(90);
  });

  it('교환대칭이고 [25,95] 안이다 (256칸 전수)', () => {
    for (const a of MBTI_TYPE_ORDER) {
      for (const b of MBTI_TYPE_ORDER) {
        const v = scoreMbti(a, b)!.score;
        expect(v).toBe(scoreMbti(b, a)!.score);
        expect(v).toBeGreaterThanOrEqual(25);
        expect(v).toBeLessThanOrEqual(95);
      }
    }
  });

  it('대소문자를 가리지 않고, 모르는 값이면 null 이다 (축이 빠진다)', () => {
    expect(scoreMbti('infp', 'infj')!.score).toBe(95);
    expect(scoreMbti(null, 'ENFP')).toBeNull();
    expect(scoreMbti('ENFP', null)).toBeNull();
    expect(scoreMbti('XXXX', 'ENFP')).toBeNull();
  });

  it('같은 글자 수를 센다', () => {
    expect(scoreMbti('INTJ', 'INTJ')!.sharedLetters).toBe(4);
    expect(scoreMbti('INTJ', 'ESFP')!.sharedLetters).toBe(0);
    expect(scoreMbti('INTJ', 'ENFP')!.sharedLetters).toBe(1); // N 만 같다
    expect(scoreMbti('INTJ', 'INTP')!.sharedLetters).toBe(3);
  });
});

describe('혈액형 (C18 §5 / C00 §3-H7·H11)', () => {
  it('TV-01~TV-06 의 혈액형 쌍 — 성별 보정 포함', () => {
    expect(scoreBlood('O', 'A', 'M', 'F')!.score).toBe(93); // TV-01 남O × 여A = 85+8
    expect(scoreBlood('B', 'A', 'M', 'F')!.score).toBe(41); // TV-02 남B × 여A = 45−4
    expect(scoreBlood('AB', 'AB', 'M', 'F')!.score).toBe(76); // TV-03 보정 없음
    expect(scoreBlood('A', 'B', 'M', 'F')!.score).toBe(47); // TV-04 남A × 여B = 45+2
    expect(scoreBlood('A', 'O', 'M', 'F')!.score).toBe(87); // TV-05 남A × 여O = 85+2
  });

  it('보정은 남/여 역할을 따라간다 — 인자 순서를 바꿔도 같은 값이다', () => {
    expect(scoreBlood('A', 'O', 'F', 'M')!.score).toBe(93); // 여A · 남O
    expect(scoreBlood('O', 'A', 'F', 'M')!.score).toBe(87); // 여O · 남A
  });

  it('동성 쌍은 대칭표만 쓴다 (C00 §3-H11)', () => {
    expect(scoreBlood('O', 'A', 'M', 'M')!.score).toBe(85);
    expect(scoreBlood('O', 'A', 'F', 'F')!.score).toBe(85);
    expect(scoreBlood('O', 'A', 'M', 'M')!.genderModApplied).toBe(false);
    expect(scoreBlood('O', 'A', 'M', 'F')!.genderModApplied).toBe(true);
  });

  it('C08 §7.3 이 실측한 범위(41~93) 안에 있다', () => {
    const types: CompatBloodType[] = ['A', 'B', 'O', 'AB'];
    let min = Infinity;
    let max = -Infinity;
    for (const a of types) {
      for (const b of types) {
        for (const [ga, gb] of [
          ['M', 'F'],
          ['F', 'M'],
          ['M', 'M'],
          ['F', 'F'],
        ] as const) {
          const v = scoreBlood(a, b, ga, gb)!.score;
          expect(scoreBlood(b, a, gb, ga)!.score).toBe(v); // 교환대칭
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }
    expect(min).toBe(41);
    expect(max).toBe(93);
  });

  it('모르면 null 이다 (축이 빠진다)', () => {
    expect(scoreBlood(null, 'A', 'M', 'F')).toBeNull();
    expect(scoreBlood('A', null, 'M', 'F')).toBeNull();
  });
});
