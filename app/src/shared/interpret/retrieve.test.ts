import { describe, expect, it } from 'vitest';

import { CARDS } from '../knowledge';
import { buildFactPack, daewoonDirectionKeyOf } from './factPack';
import { QUERY_TAG_AXES, queryTagsOf, selectKnowledgeCards, systemOfKind } from './retrieve';
import { ENGINE_V1_CHART, SAMPLE_CARDS, SAMPLE_CHART, SAMPLE_PROFILE } from './fixtures';
import type { KnowledgeCard } from './contracts';

const fact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion');

const axisOf = (tag: string): string => tag.slice(0, tag.indexOf(':'));

/**
 * 카드에는 있지만 질의하지 않는 축. **의도된 공백**이며 사유가 축마다 다르다.
 * 여기 없는 축이 카드 쪽에 새로 생기면 이 테스트가 깨진다 → 태그 규약이 조용히 어긋나는 걸 막는다.
 */
const CARD_ONLY_AXES = [
  // 대운 간지 관계: 대운 간지 × 원국의 합·충 이벤트 판정(C06 §7.3)이 필요한데 엔진이 내지 않는다.
  // 판정이 생겨도 카드 본문은 운 점수 가중표(`+6`·`-10`)뿐이라 그대로는 서술 재료가 아니다.
  'ganjiRelation',
  // 일치도 라벨: 0~100 Coherence 점수(문서10 §3.2)가 있어야 구간을 고를 수 있는데
  // 그 지표는 C00 에 정의가 없다. 렌더러가 만들면 `factPack.ts` 의 규율을 정면으로 어긴다.
  'fusionShape',
  // MBTI 인지기능: 이 축으로 질의하지 않는다. 인지기능 카드가 `mbti:{코드}` 태그를 **함께** 달고 있어
  // 이미 있는 16유형 축으로 도달한다(스택 출처는 personality-data.json 한 곳이다).
  'mbtiFunction',
  // 병약(病藥) 용신: 엔진 `YongsinRoute` 유니온에 없는 5번째 관문이라 조회할 값이 없다.
  'yongsinMethod',
];

/** 질의는 하지만 아직 카드가 없는 축. 별자리 S7 이 붙어도 달·상승궁 카드는 별도 저작이 필요하다. */
const QUERY_ONLY_AXES = ['ascSign', 'moonSign'];

/**
 * **어떤 사주로도 검색되지 않는 카드 전량.** 도달률의 정본이다.
 *
 * 축 단위 대조(`CARD_ONLY_AXES`)는 "축이 어긋났다"까지만 잡는다. 축은 맞는데 값 표기가 어긋나
 * 카드가 통째로 놀고 있는 상태는 잡지 못한다. 그래서 카드 id 를 낱장으로 못박는다 —
 * 이 목록이 줄면(= 도달률이 오르면) 테스트가 깨지고, 그때 이 주석을 갱신하게 된다.
 *
 * 20장 모두 사유가 다르지 않다. 위 `CARD_ONLY_AXES` 의 세 축이 그대로 이 목록이다:
 *   대운 간지관계 15 · 일치도 라벨 4 · 병약 용신 1
 *
 * 카피 저작규칙 2장(`fusion:카피:*`)은 **이 목록에서 빠졌다.** 저작 규칙이라도 사용자가 화면에서
 * 겪는 선택(읽는 순서 §6.2 · 무엇을 말하지 않는지 §6.3)을 정하는 규칙은 `daewoonNote:*` 와 같은
 * 자격으로 인용한다 — `retrieve.ts` 의 `ALWAYS_TAGS` 주석에 그 경계가 적혀 있다.
 */
const UNREACHABLE_CARD_IDS = [
  'daewoon:관계:반합',
  'daewoon:관계:방합국',
  'daewoon:관계:삼합국',
  'daewoon:관계:삼형',
  'daewoon:관계:상형',
  'daewoon:관계:원진',
  'daewoon:관계:자형',
  'daewoon:관계:지지육합',
  'daewoon:관계:지지충',
  'daewoon:관계:천간극',
  'daewoon:관계:천간충',
  'daewoon:관계:천간합',
  'daewoon:관계:파',
  'daewoon:관계:해',
  'daewoon:관계:형',
  'fusion:일치도:다면체형',
  'fusion:일치도:이중구조형',
  'fusion:일치도:주도형+보조',
  'fusion:일치도:한 방향형',
  'yongsin:용신5법:병약(病藥)',
];

describe('태그 규약 (카드 ↔ 질의)', () => {
  const cardAxes = new Set(CARDS.flatMap((c) => c.tags.map(axisOf)));
  const queryAxes = new Set<string>(QUERY_TAG_AXES);

  it('카드 태그는 전부 `축:값` 형식이다', () => {
    for (const c of CARDS) {
      expect(c.tags.length).toBeGreaterThan(0);
      for (const t of c.tags) expect(t).toMatch(/^[A-Za-z]+:.+$/);
    }
  });

  it('queryTagsOf 는 선언된 축만 낸다', () => {
    const full = queryTagsOf(fact);
    const bare = queryTagsOf(buildFactPack(ENGINE_V1_CHART, SAMPLE_PROFILE, 'fusion'));
    for (const t of [...full, ...bare]) expect(queryAxes.has(axisOf(t))).toBe(true);
  });

  it('두 축 집합이 정확히 맞물린다 — 어긋난 축은 전부 선언돼 있어야 한다', () => {
    const cardOnly = [...cardAxes].filter((a) => !queryAxes.has(a)).sort();
    const queryOnly = [...queryAxes].filter((a) => !cardAxes.has(a)).sort();
    expect(cardOnly).toEqual([...CARD_ONLY_AXES].sort());
    expect(queryOnly).toEqual([...QUERY_ONLY_AXES].sort());
  });

  /**
   * 도달률 잠금. 질의 축 하나가 조용히 빠져도 에러는 나지 않고 그 카드들이 영영 안 뽑힐 뿐이라,
   * "닿지 않는 카드"를 낱장으로 고정한다. 실제 사주로 뽑히는지는 `e2e.test.ts` 의 스윕이 확인한다.
   */
  it('어떤 사주로도 닿지 않는 카드는 선언된 20장뿐이다', () => {
    const unreachable = CARDS.filter((c) => !c.tags.some((t) => queryAxes.has(axisOf(t))));
    expect(unreachable.map((c) => c.id).sort()).toEqual([...UNREACHABLE_CARD_IDS].sort());
    // 198장 중 178장 = 89.9%. 이 수가 줄면 축이 끊긴 것이다.
    expect(CARDS.length - unreachable.length).toBe(178);
  });

  /**
   * 저작 규칙 카드를 **말없이 근거 목록에만 올리지 않는다.** 화면의 "이 리포트가 참고한 자료"에
   * 제목만 뜨고 대응 문장이 없으면 사용자는 그 카드가 무엇을 했는지 알 수 없다. 그래서 두 카드는
   * 조회되는 것으로 끝나지 않고 `template.ts` 가 각각 한 문장을 밝히며 인용한다(`template.test.ts`).
   */
  it('조건 없이 조회하는 저작 규칙 2장은 실제로 카드가 존재한다', () => {
    const tags = new Set(queryTagsOf(fact));
    for (const id of ['fusion:카피:4단구조', 'fusion:카피:금지어']) {
      const card = CARDS.find((c) => c.id === id);
      expect(card, id).toBeDefined();
      expect(card?.tags.some((t) => tags.has(t)), id).toBe(true);
    }
  });

  it('인지기능 카드 8장은 16유형 축으로 닿는다(스택은 카드가 들고 있다)', () => {
    const functions = CARDS.filter((c) => c.kind === 'mbti' && c.key.startsWith('인지기능:'));
    expect(functions).toHaveLength(8);
    for (const card of functions) {
      const codes = card.tags.filter((t) => t.startsWith('mbti:')).map((t) => t.slice('mbti:'.length));
      // 16유형 × 4슬롯 / 기능 8종 = 기능마다 정확히 8유형.
      expect(codes, card.id).toHaveLength(8);
      for (const code of codes) expect(code).toMatch(/^[EI][SN][TF][JP]$/);
    }
    // 실제 질의로 닿는다 — ENFP 의 스택(Ne/Fi/Te/Si) 카드가 전부 검색된다.
    const tags = new Set(queryTagsOf(fact)); // SAMPLE_PROFILE 은 ENFP
    for (const fn of ['Ne', 'Fi', 'Te', 'Si']) {
      const card = CARDS.find((c) => c.id === `mbti:인지기능:${fn}`);
      expect(card?.tags.some((t) => tags.has(t)), fn).toBe(true);
    }
  });

  it('융합 축의 값 표기가 카드와 글자 단위로 같다', () => {
    const tags = new Set(queryTagsOf(fact));
    const cardTags = new Set(CARDS.flatMap((c) => c.tags));
    // 오행은 카드 key 표기(`목(木)`)가 아니라 **엔진 표기**(`木`)로 태그를 만든다.
    for (const t of [...tags].filter((x) => x.startsWith('fusionElement:'))) {
      expect(t).toMatch(/^fusionElement:[木火土金水]$/);
      expect(cardTags.has(t), t).toBe(true);
    }
    // 충돌·통합 축은 문서10 표의 라벨을 그대로 쓴다. 한 글자만 어긋나도 영구 미도달이 된다.
    for (const t of [...tags].filter((x) => /^(fusionConflict|fusionNote|bloodDisclaimer|daewoonNote):/.test(x))) {
      expect(cardTags.has(t), t).toBe(true);
    }
    expect(tags.has('fusionConflict:사주 내부 상충')).toBe(true);
    expect(tags.has('bloodDisclaimer:all')).toBe(true);
  });

  it('예전에 어긋나 있던 두 축이 실제 카드와 맞는다', () => {
    // 별자리: 팩트팩의 한글명(`사자자리`)이 아니라 카드 key 와 같은 사인 id 를 쓴다.
    expect(queryTagsOf(fact)).toContain('zodiac:taurus');
    expect(CARDS.some((c) => c.tags.includes('zodiac:taurus'))).toBe(true);
    expect(queryTagsOf(fact).some((t) => t.startsWith('zodiac:') && /[가-힣]/.test(t))).toBe(false);

    // 용신 도출 경로: 카드 표기(`용신5법:억부(抑扶)`)가 아니라 엔진 유니온을 쓴다.
    expect(queryTagsOf(fact)).toContain('yongsinRoute:抑扶+格局');
    const route = CARDS.filter((c) => c.tags.includes('yongsinRoute:抑扶+格局'));
    expect(route.map((c) => c.key).sort()).toEqual(['용신5법:격국(格局)', '용신5법:억부(抑扶)']);
  });
});

describe('queryTagsOf', () => {
  it('축:값 형태의 태그를 결정론적으로 만든다', () => {
    const tags = queryTagsOf(fact);
    expect(tags).toContain('dayStem:丙');
    expect(tags).toContain('zodiacElement:earth');
    expect(tags).toContain('mbti:ENFP');
    expect(tags).toContain('blood:O');
    expect(tags).toContain('sinsal:역마살');
    expect(tags).toContain('tenGod:재성');
    // 정렬·중복제거가 적용되어 있다
    expect([...tags]).toEqual([...new Set(tags)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('MBTI 4축을 개별 태그로도 낸다(16유형 카드가 없을 때의 폴백)', () => {
    expect(queryTagsOf(fact)).toContain('mbtiAxis:0E');
  });

  it('차트에 없는 섹션의 태그는 만들지 않는다', () => {
    const bare = queryTagsOf(buildFactPack(ENGINE_V1_CHART, SAMPLE_PROFILE, 'fusion'));
    for (const axis of [
      'strengthGrade',
      'geokguk',
      'yongsinRoute',
      'unseong',
      'yongsinBufu',
      'sinsal',
      'zodiac',
      'zodiacElement',
    ]) {
      expect(bare.some((t) => t.startsWith(`${axis}:`))).toBe(false);
    }
    // 사주 기본 축·대운 방향·자기신고 축은 S5 없이도 그대로 남는다
    expect(bare).toContain('dayStem:丙');
    expect(bare).toContain('tenGod:재성');
    expect(bare).toContain('sipsin:편재');
    expect(bare).toContain('daewoonDirection:양녀(陽女)');
    expect(bare).toContain('mbti:ENFP');
  });

  /**
   * S5·S6 가 연 축들. 카드 쪽 값 표기(`억부:木:신약` → `yongsinBufu:木:신약`)와
   * 질의 쪽 표기가 한 글자라도 어긋나면 카드가 영구 미도달이 된다 — 여기서 실카드로 대조한다.
   */
  it('새로 연 축은 실제 카드와 값까지 맞물린다', () => {
    const tags = new Set(queryTagsOf(fact));
    const cardTags = new Set(CARDS.flatMap((c) => c.tags));
    // 丙(火) 일간 · isStrong=true → 억부 카드 `yongsin:억부:火:신강`
    expect(tags).toContain('yongsinBufu:火:신강');
    // 일지 십이운성 병(丙×申) → `unseong:병`
    expect(tags).toContain('unseong:병');
    // 연간 庚(陽) · 여성 → 역행 → `daewoon:방향:양녀(陽女)`
    expect(tags).toContain('daewoonDirection:양녀(陽女)');
    for (const t of [
      'yongsinBufu:火:신강',
      'unseong:병',
      'daewoonDirection:양녀(陽女)',
      'sipsin:편재',
    ]) {
      expect(cardTags.has(t), t).toBe(true);
    }
  });

  it('억부 축은 일간 오행 × 신강/신약 두 값만 만든다(카드 10장과 1:1)', () => {
    const bufuCards = CARDS.filter((c) => c.tags.some((t) => t.startsWith('yongsinBufu:')));
    expect(bufuCards).toHaveLength(10);
    const cardValues = new Set(
      bufuCards.flatMap((c) => c.tags.filter((t) => t.startsWith('yongsinBufu:'))),
    );
    // 질의가 만들 수 있는 전체 조합이 카드 집합과 정확히 같다
    const possible = new Set<string>();
    for (const e of ['木', '火', '土', '金', '水']) {
      for (const strong of ['신강', '신약']) possible.add(`yongsinBufu:${e}:${strong}`);
    }
    expect([...possible].sort()).toEqual([...cardValues].sort());
  });

  it('십이운성 12장·대운 방향 4장이 모두 조회 가능한 값이다', () => {
    const unseong = CARDS.filter((c) => c.kind === 'unseong');
    expect(unseong).toHaveLength(12);
    // 질의는 `unseong:${engine Unseong}` 을 낸다 — 엔진 유니온 12개가 카드 key 12개와 같아야 한다
    const engineStages = [
      '장생', '목욕', '관대', '건록', '제왕', '쇠',
      '병', '사', '묘', '절', '태', '양',
    ];
    expect(unseong.map((c) => c.key).sort()).toEqual([...engineStages].sort());

    const directions = CARDS.filter((c) => c.tags.some((t) => t.startsWith('daewoonDirection:')));
    expect(directions).toHaveLength(4);
    const possible = new Set<string>();
    for (const gender of ['M', 'F'] as const) {
      for (const forward of [true, false]) {
        possible.add(`daewoonDirection:${daewoonDirectionKeyOf(gender, forward)}`);
      }
    }
    expect([...possible].sort()).toEqual(
      [...new Set(directions.flatMap((c) => c.tags))].sort(),
    );
  });
});

/**
 * 이번 통합의 **핵심 검수**: 실제 지식베이스(198장)로 카드가 실제로 뽑히는가.
 * 태그 네임스페이스가 어긋나면 예외 없이 빈 배열이 나오므로, 이 블록이 그 상태를 실패로 고정한다.
 */
describe('selectKnowledgeCards — 실제 지식베이스', () => {
  it('엔진 v1 차트(옵셔널 섹션 전무)로도 카드를 뽑는다', () => {
    const bare = buildFactPack(ENGINE_V1_CHART, SAMPLE_PROFILE, 'fusion');
    const picked = selectKnowledgeCards(bare, CARDS);
    expect(picked.length).toBeGreaterThan(0);
    // 일간·일지·월지·십신그룹·MBTI·혈액형 축이 전부 살아 있다
    const kinds = new Set(picked.map((c) => c.kind));
    expect(kinds.has('ilgan')).toBe(true);
    expect(kinds.has('jiji')).toBe(true);
    expect(kinds.has('sipsin')).toBe(true);
    expect(kinds.has('mbti')).toBe(true);
    expect(kinds.has('blood')).toBe(true);
    const ids = picked.map((c) => c.id);
    expect(ids).toContain('ilgan:丙');
    expect(ids).toContain('jiji:申');
    expect(ids).toContain('jiji:巳');
    // 십신은 팩트팩이 그룹(재성)을 주고 카드가 10신(정재/편재)에서 그룹 태그를 단다
    expect(ids.some((id) => id === 'sipsin:정재' || id === 'sipsin:편재')).toBe(true);
  });

  it('미래형 차트(신살·신강신약·별자리 포함)는 더 많은 축을 덮는다', () => {
    // 상한을 풀어 "무엇이 매칭 가능한가"를 본다(기본 상한에서는 근거등급 높은 카드가 먼저 차지한다).
    const picked = selectKnowledgeCards(fact, CARDS, {
      maxCards: 64,
      maxPerSystem: 32,
      maxPerKind: 32,
    });
    const systems = new Set(picked.map((c) => systemOfKind(c.kind)));
    expect(systems.has('saju')).toBe(true);
    expect(systems.has('zodiac')).toBe(true);
    expect(systems.has('mbti')).toBe(true);
    expect(systems.has('blood')).toBe(true);
    const ids = picked.map((c) => c.id);
    expect(ids).toContain('sinsal:역마살');
    expect(ids).toContain('sinsal:천을귀인');
    expect(ids).toContain('zodiac:taurus');
    expect(ids).toContain('yongsin:신강지수:중화신강');
    expect(ids).toContain('yongsin:격국:편재격');
    expect(ids).toContain('yongsin:용신5법:억부(抑扶)');
  });

  it('기본 상한에서는 한 체계도 한 분류도 프롬프트를 독점하지 못한다', () => {
    const picked = selectKnowledgeCards(fact, CARDS);
    const perSystem = new Map<string, number>();
    const perKind = new Map<string, number>();
    for (const c of picked) {
      const s = systemOfKind(c.kind);
      perSystem.set(s, (perSystem.get(s) ?? 0) + 1);
      perKind.set(c.kind, (perKind.get(c.kind) ?? 0) + 1);
    }
    expect(picked.length).toBeLessThanOrEqual(16);
    for (const n of perSystem.values()) expect(n).toBeLessThanOrEqual(7);
    // 사주 7개 kind 가 한 체계로 묶이지 않으면 이 단언이 깨진다
    expect(perSystem.get('saju')).toBeLessThanOrEqual(7);
    // 십신 10장이 사주 예산을 통째로 먹던 상태를 분류별 상한이 막는다
    for (const n of perKind.values()) expect(n).toBeLessThanOrEqual(2);
  });

  /**
   * 폭 확보 패스가 실제로 일한다는 증거.
   * 기본 예산(16장)에서 사주 체계의 서로 다른 분류가 최소 다섯은 들어와야 한다 —
   * 하나라도 빠지면 그 분류에 의존하는 리포트 섹션이 조용히 사라진다.
   */
  it('기본 상한에서도 사주 분류가 골고루 들어온다(섹션이 조용히 사라지지 않는다)', () => {
    const kinds = new Set(
      selectKnowledgeCards(fact, CARDS)
        .filter((c) => systemOfKind(c.kind) === 'saju')
        .map((c) => c.kind),
    );
    for (const kind of ['ilgan', 'jiji', 'sipsin', 'unseong', 'yongsin']) {
      expect(kinds.has(kind as never), kind).toBe(true);
    }
  });

  it('MBTI·혈액형 미입력이면 그 값에 매인 카드가 뽑히지 않는다', () => {
    const bare = buildFactPack(SAMPLE_CHART, { gender: 'M', mbti: null, blood: null }, 'fusion');
    const ids = selectKnowledgeCards(bare, CARDS, { maxCards: 64, maxPerSystem: 40, maxPerKind: 14 }).map(
      (c) => c.id,
    );
    // 16유형·축·인지기능·혈액형 통념·문체 — 자기신고 값 없이는 어느 것도 근거가 될 수 없다.
    for (const id of ids) {
      expect(id.startsWith('mbti:'), id).toBe(false);
      expect(/^blood:(문체:)?(A|B|O|AB)$/.test(id), id).toBe(false);
    }
    // 면책 카드는 예외다. 혈액형 체계에 속하지만 **혈액형 입력과 무관한 고지**라 항상 근거가 된다.
    expect(ids).toContain('blood:면책');
  });

  it('같은 입력이면 배열 순서까지 동일하고, 기반 배열 순서에 흔들리지 않는다', () => {
    const a = selectKnowledgeCards(fact, CARDS).map((c) => c.id);
    const b = selectKnowledgeCards(fact, [...CARDS].reverse()).map((c) => c.id);
    expect(a).toEqual(b);
  });
});

describe('selectKnowledgeCards — 정렬·상한', () => {
  it('매칭되지 않는 카드는 제외한다', () => {
    const ids = selectKnowledgeCards(fact, SAMPLE_CARDS).map((c) => c.id);
    expect(ids).not.toContain('zodiac:pisces');
    expect(ids).toContain('ilgan:丙');
  });

  it('일치 태그 수 → 근거 등급 순으로 정렬한다', () => {
    const base: readonly KnowledgeCard[] = [
      {
        id: 'ilgan:z-one-hit',
        kind: 'ilgan',
        key: 'z-one-hit',
        title: 'a',
        summary: 'a',
        keywords: ['a'],
        detail: 'a',
        tags: ['dayStem:丙'],
        source: { doc: 'd', section: 's' },
        confidence: 'A',
      },
      {
        id: 'ilgan:a-two-hits',
        kind: 'ilgan',
        key: 'a-two-hits',
        title: 'b',
        summary: 'b',
        keywords: ['b'],
        detail: 'b',
        tags: ['dayStem:丙', 'strengthGrade:중화신강'],
        source: { doc: 'd', section: 's' },
        confidence: 'C',
      },
    ];
    // 일치 수가 우선하므로 근거등급 C 인 두 태그 카드가 앞선다
    expect(selectKnowledgeCards(fact, base).map((c) => c.id)).toEqual([
      'ilgan:a-two-hits',
      'ilgan:z-one-hit',
    ]);
  });

  it('체계별 상한과 총 상한을 지킨다', () => {
    const picked = selectKnowledgeCards(fact, SAMPLE_CARDS, { maxCards: 3, maxPerSystem: 1 });
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((c) => systemOfKind(c.kind))).size).toBe(3);
  });
});
