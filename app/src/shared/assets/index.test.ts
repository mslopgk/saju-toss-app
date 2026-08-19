/**
 * 에셋 매핑 회귀.
 *
 * 여기서 고정하는 것은 **엔진 값과 파일명이 짝을 유지하는가**다. 에셋이 하나 빠지거나 이름이
 * 바뀌면 화면은 에러 없이 그림만 사라진다 — 알아채기 어려운 종류의 고장이라 테스트로 잡는다.
 *
 * 단, "모든 에셋이 존재한다"를 요구하지는 않는다. 에셋 생성은 외부 서비스에 달려 있고 세트가
 * 단계적으로 채워지므로, 그걸 강제하면 생성이 끝나기 전에는 테스트가 계속 빨갛다.
 * 대신 **있는 것은 올바른 키로 조회되고, 없는 것은 null 이다**를 고정한다.
 */
import { describe, expect, it } from 'vitest';
import {
  availableAssetKeys,
  branchUrl,
  compatUrl,
  elementBackdropUrl,
  elementObjectUrl,
  loadingUrl,
  tenGodUrl,
  zodiacUrl,
} from './index';
import { ELEMENTS } from '../lib/saju/strength';
import { BRANCHES } from '../lib/saju/constants';
import { ZODIAC_SIGN_IDS } from '../interpret/factPack';

const keys = availableAssetKeys();
const has = (set: string, name: string): boolean => keys.includes(`${set}/${name}`);

describe('오행', () => {
  it('다섯 오행 전부 조회를 시도할 수 있다 — 없으면 null, 던지지 않는다', () => {
    for (const element of ELEMENTS) {
      expect(() => elementObjectUrl(element)).not.toThrow();
      expect(() => elementBackdropUrl(element)).not.toThrow();
    }
  });

  it('파일이 있는 오행은 URL 을 돌려준다', () => {
    const slugs = { 木: 'wood', 火: 'fire', 土: 'earth', 金: 'metal', 水: 'water' } as const;
    for (const element of ELEMENTS) {
      const slug = slugs[element];
      if (has('elements', slug)) {
        expect(elementObjectUrl(element), element).toBeTruthy();
      } else {
        expect(elementObjectUrl(element), element).toBeNull();
      }
    }
  });
});

describe('별자리', () => {
  /** 사인 id 는 엔진(`zodiacSignIdOf`)·지식카드 key·에셋 파일명이 공유하는 어휘다. */
  it('12궁 id 로 조회하며 없는 것은 null 이다', () => {
    for (const id of ZODIAC_SIGN_IDS) {
      const url = zodiacUrl(id);
      if (has('zodiac', id)) expect(url, id).toBeTruthy();
      else expect(url, id).toBeNull();
    }
  });

  it('모르는 사인 id 는 null 이다', () => {
    expect(zodiacUrl('ophiuchus')).toBeNull();
  });
});

describe('십이지', () => {
  it('12지지 한자를 전부 받는다', () => {
    for (const branch of BRANCHES) {
      expect(() => branchUrl(branch)).not.toThrow();
    }
  });

  it('지지가 아닌 글자는 null 이다', () => {
    expect(branchUrl('甲')).toBeNull();
    expect(branchUrl('')).toBeNull();
  });
});

describe('십신 · 궁합 · 연출', () => {
  it('다섯 그룹을 받는다', () => {
    for (const group of ['비겁', '식상', '재성', '관성', '인성']) {
      expect(() => tenGodUrl(group)).not.toThrow();
    }
  });

  it('모르는 그룹은 null 이다', () => {
    expect(tenGodUrl('정관')).toBeNull();
  });

  it('궁합 네 상태를 받는다', () => {
    for (const mood of ['harmony', 'tension', 'complement', 'independent'] as const) {
      expect(() => compatUrl(mood)).not.toThrow();
    }
  });

  it('연출은 1~3 단계다', () => {
    for (const step of [1, 2, 3] as const) {
      expect(() => loadingUrl(step)).not.toThrow();
    }
  });
});

describe('번들에 실린 에셋', () => {
  /**
   * 키가 `세트/이름` 모양이어야 한다. glob 경로가 그대로 남으면 이 파일이 옮겨질 때
   * 조회가 **전부 조용히 실패**한다 — 그 상태를 여기서 잡는다.
   */
  it('키가 세트/이름 모양이다', () => {
    for (const key of keys) {
      expect(key, key).toMatch(/^[a-z]+\/[a-z0-9-]+$/);
    }
  });

  it('중복 키가 없다', () => {
    expect(new Set(keys).size).toBe(keys.length);
  });
});
