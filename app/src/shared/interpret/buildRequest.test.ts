import { describe, expect, it } from 'vitest';

import { buildFactPack, numberAllowList } from './factPack';
import { selectKnowledgeCards } from './retrieve';
import {
  buildInterpretationRequest,
  InterpretationBuildError,
  narrativeKeyOf,
  requestCharCounts,
} from './buildRequest';
import { staticPrefixLength } from './prompt';
import { INTERPRETATION_JSON_SCHEMA, rawInterpretationSchema } from './schema';
import { toMessagesApiParams } from './client';
import { ENGINE_V1_CHART, SAMPLE_CARDS, SAMPLE_CHART, SAMPLE_PROFILE } from './fixtures';
import type { UserProfile } from './contracts';

function buildFusion(profile: UserProfile = SAMPLE_PROFILE) {
  const fact = buildFactPack(SAMPLE_CHART, profile, 'fusion');
  const cards = selectKnowledgeCards(fact, SAMPLE_CARDS);
  return buildInterpretationRequest(SAMPLE_CHART, profile, cards, 'fusion');
}

describe('buildFactPack', () => {
  it('차트 필드를 투영하고 C00 §7.4 양자화를 적용한다', () => {
    const fact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion');
    expect(fact.saju.dayStem).toBe('丙');
    expect(fact.saju.strength?.strengthIndex).toBe(58.4);
    expect(fact.saju.strength?.elementScores['火']).toBe(24.25);
    // 대운 index 0(간지 null)은 제외된다
    expect(fact.saju.daewoon.map((d) => d.ganji)).toEqual(['壬午', '癸未']);
    // 신살은 중복 제거 + 코드포인트 정렬
    expect(fact.saju.sinsalNames).toEqual(['역마살', '천을귀인']);
    // 십신 최댓값 그룹
    expect(fact.saju.dominantTenGod).toBe('재성');
    // 황소자리(idx 1) → earth, 카드 key 와 같은 id
    expect(fact.astro?.sunElement).toBe('earth');
    expect(fact.astro?.sunSignId).toBe('taurus');
    // 경고는 엔진 문자열 유니온 그대로
    expect(fact.warnings).toEqual(['JIE_BOUNDARY']);
    expect(fact.missingSections).toEqual([]);
  });

  it('엔진 v1 차트는 없는 섹션을 null 로 두고 무엇이 빠졌는지 남긴다', () => {
    const fact = buildFactPack(ENGINE_V1_CHART, SAMPLE_PROFILE, 'fusion');
    expect(fact.missingSections).toEqual(['sinsal', 'strength', 'astro']);
    expect(fact.saju.strength).toBeNull();
    expect(fact.saju.sinsalNames).toBeNull();
    expect(fact.astro).toBeNull();
    // 엔진이 실제로 내는 것은 그대로 살아 있다
    expect(fact.saju.gz8).toBe('庚午 辛巳 丙申 甲午');
    expect(fact.saju.dominantTenGod).toBe('재성');
  });

  it('동점인 십신 그룹은 고정 순서로 타이브레이크한다', () => {
    const flat = {
      ...SAMPLE_CHART,
      tenGods: {
        byPillar: SAMPLE_CHART.tenGods.byPillar,
        groupWeights: { 비겁: 10, 식상: 10, 재성: 10, 관성: 10, 인성: 10 },
      },
    };
    expect(buildFactPack(flat, SAMPLE_PROFILE, 'fusion').saju.dominantTenGod).toBe('비겁');
  });

  it('groupWeights 도 인용 허용 수치다 — S5 의 정식 배점(합 80.00)으로 대체됐다', () => {
    const fact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion');
    const allowed = numberAllowList(fact);
    // 엔진이 "임시 정의(합 7.0)"라 밝히던 값이 아니라 오행 점수를 십신 그룹으로 접은 값이다
    expect(fact.saju.tenGodWeights['재성']).toBe(22.25);
    expect(Object.values(fact.saju.tenGodWeights).reduce((a, b) => a + b, 0)).toBe(80);
    expect(allowed.has('22.25')).toBe(true);
    expect(allowed.has('18.5')).toBe(true);
    // 신강지수·오행점수·대운 나이는 그대로 인용 가능하다
    expect(allowed.has('58.4')).toBe(true);
    expect(allowed.has('24.25')).toBe(true);
    expect(allowed.has('3')).toBe(true);
  });
});

describe('buildInterpretationRequest', () => {
  it('같은 입력이면 문자 단위로 동일한 요청을 만든다(결정론)', () => {
    expect(JSON.stringify(buildFusion())).toBe(JSON.stringify(buildFusion()));
  });

  it('fusion 은 Opus 5 + effort high 로 라우팅한다', () => {
    const req = buildFusion();
    expect(req.routing.model).toBe('claude-opus-5');
    expect(req.routing.effort).toBe('high');
    expect(req.routing.thinking).toEqual({ type: 'adaptive' });
    expect(req.routing.maxTokens).toBeLessThanOrEqual(16000); // 초과 시 스트리밍 필수
  });

  it('basic_saju 는 Sonnet 5 로 라우팅하고 섹션 구성이 다르다', () => {
    const fact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'basic_saju');
    const cards = selectKnowledgeCards(fact, SAMPLE_CARDS);
    const req = buildInterpretationRequest(SAMPLE_CHART, SAMPLE_PROFILE, cards, 'basic_saju');
    expect(req.routing.model).toBe('claude-sonnet-5');
    expect(req.sections).toEqual(['saju', 'strength', 'luck']);
  });

  it('MBTI·혈액형 미입력이면 해당 섹션을 뺀다', () => {
    const req = buildFusion({ gender: 'M', mbti: null, blood: null });
    expect(req.sections).toEqual(['saju', 'zodiac', 'intersection', 'conflict']);
  });

  it('프롬프트에는 차트에 있는 사실만 들어간다', () => {
    const req = buildFusion();
    expect(req.userText).toContain('庚午 辛巳 丙申 甲午');
    expect(req.userText).toContain('[ilgan:丙]');
    // 검색에서 탈락한 카드는 프롬프트에 없다
    expect(req.userText).not.toContain('zodiac:pisces');
  });

  it('카드 본문은 detail 만 넣는다(summary 는 팩트팩과 겹쳐 넣지 않는다)', () => {
    const req = buildFusion();
    expect(req.userText).toContain('병화는 드러나는 불이다. 시작이 빠르고');
    expect(req.userText).not.toContain('summary');
  });

  it('시스템 프리픽스는 사용자 정보에 의존하지 않는다(캐시 프리픽스 보존)', () => {
    const a = buildFusion();
    const b = buildFusion({ gender: 'M', mbti: 'ISTJ', blood: 'A' });
    expect(a.system).toEqual(b.system);
  });

  it('시스템 프리픽스가 최소 캐시 길이(Opus 5 = 512토큰)를 넉넉히 넘는다', () => {
    // 한국어 약 0.86 tok/char 가정(문서11 §6.2, 실측 필요). 보수적으로 0.5 tok/char 로 잡아도 512 이상이어야 한다.
    expect(staticPrefixLength()).toBeGreaterThan(1024);
  });

  it('지식 카드가 없으면 조립을 거부한다', () => {
    expect(() => buildInterpretationRequest(SAMPLE_CHART, SAMPLE_PROFILE, [], 'fusion')).toThrow(
      InterpretationBuildError,
    );
  });

  it('카드 id 가 중복되면 거부한다', () => {
    const card = SAMPLE_CARDS[0];
    if (card === undefined) throw new Error('fixture');
    expect(() =>
      buildInterpretationRequest(SAMPLE_CHART, SAMPLE_PROFILE, [card, card], 'fusion'),
    ).toThrow(/DUPLICATE_CARD_ID|카드 id 중복/);
  });

  it('엔진 v1 차트(cacheKey 없음)도 결정론적 대체 키를 만든다', () => {
    const a = narrativeKeyOf(ENGINE_V1_CHART, SAMPLE_PROFILE, 'fusion', ['a']);
    expect(a).toBe(narrativeKeyOf(ENGINE_V1_CHART, SAMPLE_PROFILE, 'fusion', ['a']));
    expect(a).toContain('|x:');
    // 대운이 다르면 키도 다르다
    const moved = {
      ...ENGINE_V1_CHART,
      luck: {
        daewoon: {
          forward: ENGINE_V1_CHART.luck.daewoon.forward,
          pillars: [{ index: 1, ganji: '甲子', startAgeWestern: 4, endAgeWestern: 13 }],
        },
      },
    };
    expect(narrativeKeyOf(moved, SAMPLE_PROFILE, 'fusion', ['a'])).not.toBe(a);
  });

  it('narrativeKey 는 차트 정체성과 프로필 축을 모두 포함한다', () => {
    const base = buildFusion().narrativeKey;
    expect(base).toContain('chartkey-0001');

    const otherChart = { ...SAMPLE_CHART, cacheKey: 'chartkey-0002' };
    expect(narrativeKeyOf(otherChart, SAMPLE_PROFILE, 'fusion', ['a'])).not.toBe(base);
    expect(
      narrativeKeyOf(SAMPLE_CHART, { ...SAMPLE_PROFILE, blood: 'A' }, 'fusion', ['a']),
    ).not.toBe(narrativeKeyOf(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion', ['a']));
    // 카드 집합이 바뀌면 키도 바뀐다(지식베이스 개정 시 자동 무효화)
    expect(narrativeKeyOf(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion', ['a'])).not.toBe(
      narrativeKeyOf(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion', ['a', 'b']),
    );
  });

  it('프롬프트에 이름·타임스탬프 같은 캐시 파괴 요소가 없다', () => {
    const req = buildFusion();
    const all = req.system.map((b) => b.text).join('\n');
    expect(all).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(all).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('문자 수 계측이 실제 블록 길이와 맞는다', () => {
    const req = buildFusion();
    const counts = requestCharCounts(req);
    expect(counts.systemCacheable).toBe(staticPrefixLength());
    expect(counts.user).toBe(req.userText.length);
  });
});

describe('toMessagesApiParams', () => {
  it('Messages API 파라미터로 매핑하고 금지 파라미터를 넣지 않는다', () => {
    const params = toMessagesApiParams(buildFusion());
    expect(params['model']).toBe('claude-opus-5');
    expect(params['thinking']).toEqual({ type: 'adaptive' });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');
    expect(params).not.toHaveProperty('top_k');

    const outputConfig = params['output_config'] as Record<string, unknown>;
    expect(outputConfig['effort']).toBe('high');
    const format = outputConfig['format'] as Record<string, unknown>;
    expect(format['type']).toBe('json_schema');
    // `format` 이 받는 키는 이 둘뿐이다. 스키마 이름을 얹으면
    // `output_config.format.name: Extra inputs are not permitted` 로 400 이 난다(실측).
    expect(Object.keys(format).sort()).toEqual(['schema', 'type']);

    // messages 의 마지막 턴은 user 여야 한다(assistant prefill 은 400)
    const messages = params['messages'] as { role: string }[];
    expect(messages[messages.length - 1]?.role).toBe('user');
  });

  it('캐시 브레이크포인트를 마지막 캐시 가능 블록에만 건다', () => {
    const params = toMessagesApiParams(buildFusion());
    const system = params['system'] as { cache_control?: unknown }[];
    const marked = system.filter((b) => b.cache_control !== undefined);
    expect(marked).toHaveLength(1);
    expect(system[system.length - 1]).toHaveProperty('cache_control');
  });
});

describe('출력 스키마', () => {
  it('JSON Schema 와 zod 스키마의 최상위 필드가 일치한다', () => {
    const jsonKeys = Object.keys(INTERPRETATION_JSON_SCHEMA.properties).sort();
    const zodKeys = Object.keys(rawInterpretationSchema.shape).sort();
    expect(jsonKeys).toEqual(zodKeys);
    expect([...INTERPRETATION_JSON_SCHEMA.required].sort()).toEqual(zodKeys);
  });

  it('구조화 출력이 지원하지 않는 키워드를 쓰지 않는다', () => {
    const serialized = JSON.stringify(INTERPRETATION_JSON_SCHEMA);
    for (const banned of ['minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum']) {
      expect(serialized).not.toContain(banned);
    }
    expect(serialized).toContain('"additionalProperties":false');
  });
});
