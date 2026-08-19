import { describe, expect, it } from 'vitest';

import { buildFactPack, ganjiAllowList } from './factPack';
import { selectKnowledgeCards } from './retrieve';
import { buildInterpretationRequest, type InterpretationRequest } from './buildRequest';
import {
  verifyAuthoredText,
  verifyInterpretation,
  type AuthoredGuardContext,
  type RejectionCode,
} from './guard';
import {
  MockInterpretationClient,
  renderTemplateInterpretation,
  toRawShape,
} from './client';
import { SAMPLE_CARDS, SAMPLE_CHART, SAMPLE_PROFILE } from './fixtures';

function fusionRequest(): InterpretationRequest {
  const fact = buildFactPack(SAMPLE_CHART, SAMPLE_PROFILE, 'fusion');
  const cards = selectKnowledgeCards(fact, SAMPLE_CARDS);
  return buildInterpretationRequest(SAMPLE_CHART, SAMPLE_PROFILE, cards, 'fusion');
}

const req = fusionRequest();

/** 템플릿 응답을 만든 뒤 한 섹션의 본문만 바꿔 실패 경로를 만든다. */
function withBody(patch: string): unknown {
  const base = renderTemplateInterpretation(req);
  return toRawShape({
    ...base,
    sections: base.sections.map((s, i) => (i === 0 ? { ...s, body: patch } : s)),
  });
}

function codesOf(raw: unknown): readonly RejectionCode[] {
  const r = verifyInterpretation(raw, req);
  return r.ok ? [] : r.failures.map((f) => f.code);
}

describe('verifyInterpretation', () => {
  it('정상 응답을 통과시킨다', () => {
    const result = verifyInterpretation(toRawShape(renderTemplateInterpretation(req)), req);
    if (!result.ok) throw new Error(JSON.stringify(result.failures));
    expect(result.value.sections.map((s) => s.id)).toEqual(req.sections);
  });

  it('스키마를 벗어나면 거부한다', () => {
    expect(codesOf({ headline: 'x' })).toContain('SCHEMA');
    expect(codesOf(null)).toContain('SCHEMA');
    expect(codesOf('{"headline":"..."}')).toContain('SCHEMA');
  });

  it('섹션 구성이나 순서가 다르면 거부한다', () => {
    const base = renderTemplateInterpretation(req);
    const shuffled = toRawShape({ ...base, sections: [...base.sections].reverse() });
    expect(codesOf(shuffled)).toContain('SECTION_MISMATCH');
  });

  it('목록에 없는 카드 id 를 인용하면 거부한다', () => {
    const base = renderTemplateInterpretation(req);
    expect(codesOf(toRawShape({ ...base, usedCardIds: ['saju.dayStem.존재하지않음'] }))).toContain(
      'UNKNOWN_CARD',
    );
  });

  it('원국·대운에 없는 간지를 지어내면 거부한다', () => {
    const codes = codesOf(
      withBody(
        '당신의 사주에는 戊子 기둥이 있어 물의 기운이 매우 강합니다. ' +
          '이런 구성은 흐름을 잇는 쪽으로 읽히며 오래 이어집니다.',
      ),
    );
    expect(codes).toContain('FABRICATED_GANJI');
  });

  it('팩트팩에 없는 수치를 단위와 함께 쓰면 거부한다', () => {
    const codes = codesOf(
      '네 체계의 일치도는 78점으로 매우 높은 편입니다. ' +
        '이 정도면 겉과 속이 거의 같은 방향을 가리킨다고 볼 수 있습니다.',
    );
    expect(codes).toContain('SCHEMA'); // 문자열은 스키마부터 실패
    expect(
      codesOf(
        withBody(
          '네 체계의 일치도는 78점으로 높은 편입니다. 겉과 속이 같은 방향을 가리킨다고 볼 수 있습니다.',
        ),
      ),
    ).toContain('FABRICATED_NUMBER');
  });

  it('팩트팩에 있는 수치는 통과시킨다', () => {
    const codes = codesOf(
      withBody(
        '신강지수는 58.4점으로 중화신강에 해당합니다. ' +
          '힘이 조금 앞서 있으니 덜어 내는 방향이 편합니다. 서두르지 않아도 괜찮습니다.',
      ),
    );
    expect(codes).not.toContain('FABRICATED_NUMBER');
  });

  it.each([
    ['과학적으로 증명된 결과입니다. 이 해석은 오랜 기간에 걸쳐 다듬어졌고 잘 들어맞습니다.'],
    ['연구 결과에 따르면 이런 구성은 흔치 않습니다. 그래서 더 눈여겨볼 만한 자리입니다.'],
    ['올해는 반드시 좋은 일이 생깁니다. 기다리시면 자연스럽게 흐름이 열릴 것입니다.'],
    ['이 시기에 무리하면 건강에 문제가 생깁니다. 그러니 조금 천천히 움직이시는 편이 좋습니다.'],
    ['지금은 주식 비중을 늘릴 때입니다. 흐름이 받쳐 주는 구간이라 기회가 넓어 보입니다.'],
    ['이 사람은 당신과 잘 맞지 않는 사람입니다. 거리를 두시는 편이 마음이 편할 것입니다.'],
  ])('금지 표현을 거부한다: %s', (body) => {
    expect(codesOf(withBody(body))).toContain('BANNED_PHRASE');
  });

  it('완곡한 부정형은 단정 예언으로 오탐하지 않는다', () => {
    const codes = codesOf(
      withBody(
        '이 흐름이 반드시 좋은 결과로 이어지는 것은 아닙니다. ' +
          '다만 지금 택한 방향을 조금 더 밀어 볼 만한 구간이기는 합니다.',
      ),
    );
    expect(codes).not.toContain('BANNED_PHRASE');
  });
});

describe('MockInterpretationClient', () => {
  const client = new MockInterpretationClient({ knowledgeBase: SAMPLE_CARDS });

  it('조립 → 응답 → 검증 전체 경로를 통과한다', async () => {
    const outcome = await client.interpret({
      kind: 'fusion',
      chart: SAMPLE_CHART,
      profile: SAMPLE_PROFILE,
    });
    if (outcome.status !== 'ok') throw new Error(JSON.stringify(outcome));
    expect(outcome.source).toBe('mock');
    expect(outcome.value.sections).toHaveLength(6);
    expect(outcome.narrativeKey).toContain('chartkey-0001');
  });

  it('같은 입력에 항상 같은 결과를 낸다(오프라인 폴백 결정론)', async () => {
    const input = { kind: 'fusion' as const, chart: SAMPLE_CHART, profile: SAMPLE_PROFILE };
    const a = await client.interpret(input);
    const b = await client.interpret(input);
    expect(a).toEqual(b);
  });

  it('basic_saju 도 통과한다', async () => {
    const outcome = await client.interpret({
      kind: 'basic_saju',
      chart: SAMPLE_CHART,
      profile: SAMPLE_PROFILE,
    });
    expect(outcome.status).toBe('ok');
  });

  it('지식베이스가 비면 BUILD 에러를 낸다', async () => {
    const empty = new MockInterpretationClient({ knowledgeBase: [] });
    const outcome = await empty.interpret({
      kind: 'fusion',
      chart: SAMPLE_CHART,
      profile: SAMPLE_PROFILE,
    });
    expect(outcome).toMatchObject({ status: 'error', code: 'BUILD' });
  });

  it('불량 응답은 rejected 로 돌려준다', async () => {
    const bad = new MockInterpretationClient({
      knowledgeBase: SAMPLE_CARDS,
      responder: () => ({ headline: 'x', sections: [], action_today: '', used_card_ids: [] }),
    });
    const outcome = await bad.interpret({
      kind: 'fusion',
      chart: SAMPLE_CHART,
      profile: SAMPLE_PROFILE,
    });
    expect(outcome.status).toBe('rejected');
  });

  it('취소된 요청은 ABORTED 를 돌려준다', async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await client.interpret(
      { kind: 'fusion', chart: SAMPLE_CHART, profile: SAMPLE_PROFILE },
      { signal: controller.signal },
    );
    expect(outcome).toMatchObject({ status: 'error', code: 'ABORTED' });
  });
});

/**
 * 서술 텍스트 공통 검사.
 *
 * `verifyInterpretation` 이 하던 네 가지 중 **출력 모양과 무관한 것**만 뽑아낸 함수다.
 * 요약(한 단어+한 문장)·카드(섹션 하나)도 같은 규율을 받아야 하는데, 그것들은 섹션 배열이 없어
 * 기존 검증기를 그대로 쓸 수 없다. 여기서 고정하는 것은 **뽑아낸 뒤에도 판정이 같다**는 것이다.
 */
describe('verifyAuthoredText', () => {
  const ctx: AuthoredGuardContext = {
    factPack: req.factPack,
    knowledgeCardIds: req.knowledgeCardIds,
  };
  const allowedCard = req.knowledgeCardIds[0] ?? '';

  it('깨끗한 텍스트는 실패가 없다', () => {
    expect(verifyAuthoredText('방향을 정하면 끝까지 가는 편입니다.', [allowedCard], ctx)).toEqual([]);
  });

  it('목록 밖 카드를 인용하면 UNKNOWN_CARD', () => {
    const failures = verifyAuthoredText('문장입니다.', ['ilgan:없는카드'], ctx);
    expect(failures.map((f) => f.code)).toContain('UNKNOWN_CARD');
  });

  it('원국·대운에 없는 간지를 쓰면 FABRICATED_GANJI', () => {
    // 픽스처 차트에 없는 간지를 고른다(전체 60갑자 중 원국 4 + 대운 10 밖).
    const absent = ['甲子', '乙丑', '丙寅'].find(
      (g) => !ganjiAllowList(req.factPack).has(g),
    );
    expect(absent, '픽스처가 60갑자를 전부 쓰지는 않는다').toBeDefined();
    const failures = verifyAuthoredText(`당신은 ${absent ?? ''} 일주입니다.`, [], ctx);
    expect(failures.map((f) => f.code)).toContain('FABRICATED_GANJI');
  });

  it('팩트팩에 없는 수치를 쓰면 FABRICATED_NUMBER', () => {
    const failures = verifyAuthoredText('신강지수는 9999점입니다.', [], ctx);
    expect(failures.map((f) => f.code)).toContain('FABRICATED_NUMBER');
  });

  it('같은 위반이 여러 번 나와도 한 번만 보고한다', () => {
    const absent = ['甲子', '乙丑', '丙寅'].find((g) => !ganjiAllowList(req.factPack).has(g)) ?? '';
    const failures = verifyAuthoredText(`${absent} 그리고 또 ${absent}`, [], ctx);
    expect(failures.filter((f) => f.code === 'FABRICATED_GANJI')).toHaveLength(1);
  });
});
