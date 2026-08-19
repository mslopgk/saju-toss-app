/**
 * LLM 호출 경계.
 *
 * ⛔ **클라이언트(WebView)에 API 키를 두지 않는다.** 미니앱 번들은 사용자 단말에 내려가므로
 *    키를 넣는 순간 유출이다. 실제 구현(`ServerInterpretationClient`)은 우리 서버의
 *    `POST /api/interpret` 을 호출하고, 서버가 `buildInterpretationRequest()` 로 프롬프트를
 *    **직접 조립한 뒤** Anthropic Messages API 를 부른다.
 *
 * 이 인터페이스가 받는 것이 `InterpretationRequest`(조립된 프롬프트)가 아니라
 * `InterpretationInput`(차트 + 프로필)인 이유: 조립된 프롬프트가 클라이언트→서버 방향으로 흐르면
 * 클라이언트가 시스템 프롬프트를 바꿔 보낼 수 있다(프롬프트 주입). 프롬프트는 서버에서만 만든다.
 *
 * v1 에서 구현하는 것은 `MockInterpretationClient` 뿐이다. 이 목은 동시에
 * **오프라인 폴백 렌더러**로도 쓸 수 있다 — 문서10 §5.1 [3] 문장 조립 레이어(템플릿)에 해당한다.
 */

import type { ChartLike, KnowledgeCard, ReportKind, UserProfile } from './contracts';
import {
  buildInterpretationRequest,
  InterpretationBuildError,
  type InterpretationRequest,
} from './buildRequest';
import { selectKnowledgeCards, type RetrievalOptions } from './retrieve';
import { verifyInterpretation, type VerificationFailure } from './guard';
import { USED_CARDS_MAX, type Interpretation } from './schema';
import { buildFactPack, type FactPack } from './factPack';

export interface InterpretationInput {
  readonly kind: ReportKind;
  readonly chart: ChartLike;
  readonly profile: UserProfile;
}

export type InterpretationSource = 'llm' | 'cache' | 'mock';

export type InterpretationErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'UPSTREAM'
  | 'BUILD'
  | 'ABORTED';

export type InterpretationOutcome =
  | {
      readonly status: 'ok';
      readonly source: InterpretationSource;
      readonly narrativeKey: string;
      readonly value: Interpretation;
    }
  | {
      readonly status: 'rejected';
      readonly narrativeKey: string;
      readonly failures: readonly VerificationFailure[];
    }
  | {
      readonly status: 'error';
      readonly code: InterpretationErrorCode;
      readonly message: string;
    };

export interface InterpretOptions {
  readonly signal?: AbortSignal;
}

export interface InterpretationClient {
  interpret(input: InterpretationInput, options?: InterpretOptions): Promise<InterpretationOutcome>;
}

/* ─────────────────────────── 서버측 매퍼 (참고 구현) ─────────────────────────── */

/**
 * `InterpretationRequest` → Anthropic Messages API 파라미터.
 * **서버에서만 쓴다.** 순수함수라 서버 코드 없이도 테스트할 수 있어 여기 둔다.
 *
 * 주의(문서11 §6.4 실측 근거):
 *   - `temperature` / `top_p` / `top_k` 는 Opus 5·Sonnet 5 에서 400.
 *   - assistant prefill(마지막 assistant 턴)도 400 → 구조화 출력으로 대체한다.
 *   - `max_tokens` 가 16,000 을 넘으면 스트리밍이 필요하다(현재 라우팅은 8,000 이하).
 *   - 캐시 브레이크포인트는 `cacheable` 인 **마지막** system 블록에만 건다(프리픽스 일치 방식이므로
 *     그 지점까지가 통째로 캐시된다).
 */
export function toMessagesApiParams(req: InterpretationRequest): Record<string, unknown> {
  const lastCacheableIdx = req.system.reduce(
    (acc, b, i) => (b.cacheable ? i : acc),
    -1,
  );
  const system = req.system.map((b, i) =>
    i === lastCacheableIdx
      ? { type: 'text', text: b.text, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: b.text },
  );

  // `format` 이 받는 필드는 `type` 과 `schema` 뿐이다. 스키마 이름을 같이 보내면
  // `output_config.format.name: Extra inputs are not permitted` 로 400 이 난다(실측).
  const outputConfig: Record<string, unknown> = {
    format: {
      type: 'json_schema',
      schema: req.outputJsonSchema,
    },
  };
  if (req.routing.effort !== null) outputConfig['effort'] = req.routing.effort;

  const params: Record<string, unknown> = {
    model: req.routing.model,
    max_tokens: req.routing.maxTokens,
    system,
    // user 턴을 두 블록으로 나눠 **접두에도** 캐시 브레이크포인트를 건다.
    //
    // system 에만 걸면 캐시되는 것은 시스템 프롬프트(약 3,048 토큰)뿐이고, 입력의 대부분인
    // 팩트팩·지식카드(약 5,846 토큰)가 호출마다 전액 과금된다. 분할 호출에서 그 차이가
    // 그대로 배수가 된다 — 실측으로 총 565원이 나왔고, 그 절반이 이 누락 때문이었다.
    //
    // 브레이크포인트는 요청당 4개까지 쓸 수 있다. 지금 쓰는 것은 둘(system 마지막, user 접두).
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: req.userPrefix, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: req.userTail },
        ],
      },
    ],
    output_config: outputConfig,
  };
  if (req.routing.thinking !== null) params['thinking'] = req.routing.thinking;
  return params;
}

/* ─────────────────────────── Mock / 오프라인 폴백 ─────────────────────────── */

const ZODIAC_ELEMENT_KO: Readonly<Record<string, string>> = {
  fire: '불',
  earth: '흙',
  air: '공기',
  water: '물',
};

/** 규칙 기반 문장 조립. 결정론적이며 `verifyInterpretation` 을 통과하도록 작성했다. */
export function renderTemplateInterpretation(req: InterpretationRequest): Interpretation {
  const f: FactPack = req.factPack;
  const s = f.saju;
  // 엔진 v1 은 신강신약(S5)·별자리(S7)를 내지 않는다. 없는 섹션은 "아직 계산하지 않는다"고
  // 밝히고 넘어간다 — 빈 문장을 채우려고 없는 값을 지어내지 않는다.
  const st = s.strength;
  const astro = f.astro;
  const bodies: Record<string, string> = {
    saju:
      `당신의 일간은 ${s.dayStem}이고, 사주 여덟 글자는 ${s.gz8} 입니다. ` +
      (st === null
        ? `기운이 가장 두터운 자리는 ${s.dominantTenGod} 쪽입니다. `
        : `오행 점수는 목 ${st.elementScores['木']}, 화 ${st.elementScores['火']}, 토 ${st.elementScores['土']}, ` +
          `금 ${st.elementScores['金']}, 수 ${st.elementScores['水']} 이며 ` +
          `신강지수는 ${st.strengthIndex}점으로 ${st.strengthGrade}에 해당합니다. `) +
      `한번 정한 방향으로는 곧게 가는 편이지만, 때로는 스스로도 놀랄 만큼 오래 망설이기도 합니다. ` +
      `그 망설임은 결정을 미루는 습관이 아니라 방향을 한 번 더 확인하는 절차에 가깝습니다.`,
    zodiac:
      astro === null
        ? `별자리는 이번 판에서 아직 계산하지 않습니다. 태양 별자리와 원소는 다음 업데이트에서 더해집니다. ` +
          `그 전까지는 사주 쪽 재료만으로 읽어 드립니다.`
        : `태양 별자리는 ${astro.sunSignKo}, 원소는 ${ZODIAC_ELEMENT_KO[astro.sunElement] ?? '불'}입니다. ` +
          `사람들 앞에서 드러나는 결은 대체로 이 자리에서 나옵니다. ` +
          `밖에서 보이는 모습과 혼자 있을 때의 속도가 다르더라도 어느 한쪽이 가짜인 것은 아닙니다.`,
    mbti:
      `스스로 알려주신 유형은 ${f.mbti ?? '-'} 입니다. 이 값은 검사 결과가 아니라 자기 인식이며, ` +
      `그래서 오히려 지금의 당신이 어떤 방식으로 살고 있는지를 잘 보여 줍니다. ` +
      `타고난 기운과 이 유형이 다르게 읽힌다면, 그 차이는 당신이 스스로 만든 부분입니다.`,
    blood:
      `${f.blood ?? '-'}형이라고 알려주셨습니다. 이 리포트에서 혈액형은 성격을 판정하지 않고 ` +
      `문장의 말투만 정합니다. 혈액형과 성격의 관계는 확인된 근거가 없기 때문입니다. ` +
      `그래서 이 항목은 결론이 아니라 이 글의 목소리라고 보시면 됩니다.`,
    intersection:
      `네 체계가 함께 가리키는 지점은 ${s.dominantTenGod} 쪽으로 기운 흐름입니다. ` +
      (st === null ? '' : `용신은 ${st.yongsin.primary} 입니다. `) +
      `서로 다른 전통에서 나온 네 가지가 같은 방향을 가리킬 때, 그 부분은 상황이 바뀌어도 잘 변하지 않습니다. ` +
      `당신이 스스로 당연하게 여겨 온 습관이 대체로 여기에 있습니다.`,
    conflict:
      `한편 어긋나는 지점도 있습니다. 타고난 기운은 ${st === null ? s.dominantTenGod : st.strengthGrade} 쪽인데, ` +
      `지금 당신이 사는 방식은 그보다 훨씬 앞으로 나가 있습니다. 이것은 모순이 아니라 층입니다. ` +
      `평소에는 타고난 결로 움직이고, 중요한 순간에는 만들어 온 쪽이 나섭니다. ` +
      `두 층을 같은 저울에 올리지 않아도 괜찮습니다.`,
    strength:
      st === null
        ? `신강신약과 용신은 이번 판에서 아직 계산하지 않습니다. 지금 확인할 수 있는 것은 ` +
          `기운이 ${s.dominantTenGod} 쪽으로 모여 있다는 점까지입니다. ` +
          `힘이 몰린 곳을 늘리기보다 비어 있는 쪽을 조금 채울 때 흐름이 편해집니다.`
        : `신강지수는 ${st.strengthIndex}점, 판정은 ${st.strengthGrade}이고 격국은 ${st.geokguk} 입니다. ` +
          `용신은 ${st.yongsin.primary}이며 도출 경로는 ${st.yongsin.route} 입니다. ` +
          `힘이 몰린 곳을 늘리기보다 비어 있는 쪽을 조금 채울 때 흐름이 편해집니다.`,
    luck: renderLuck(f),
  };

  const sections = req.sections.map((id) => ({
    id,
    body: bodies[id] ?? '준비 중인 항목입니다. 곧 더 자세한 해석을 더하겠습니다. 조금만 기다려 주세요.',
  }));

  return {
    headline: astro === null ? `${s.dayStem} 일간 · ${s.gz8}의 두 겹` : `${s.dayStem} 일간 · ${astro.sunSignKo}의 두 겹`,
    sections,
    actionToday: '오늘은 하루를 시작하는 30분보다 끝내는 30분을 먼저 정해 보세요.',
    usedCardIds: req.knowledgeCardIds.slice(0, USED_CARDS_MAX),
  };
}

function renderLuck(f: FactPack): string {
  const first = f.saju.daewoon[0];
  if (first === undefined) {
    return '대운 정보가 아직 준비되지 않았습니다. 생시를 함께 입력하시면 흐름을 더 자세히 볼 수 있습니다.';
  }
  return (
    `첫 대운은 ${first.ganji}이고 만 ${first.startAgeWestern}세부터 ${first.endAgeWestern}세까지 이어집니다. ` +
    `대운은 방향이 바뀌는 구간이지 좋고 나쁨이 정해진 구간이 아닙니다. ` +
    `구간이 바뀔 때 익숙한 방식이 잘 통하지 않는다면, 그것은 실패가 아니라 결이 바뀐 신호에 가깝습니다.`
  );
}

export interface MockClientOptions {
  readonly knowledgeBase: readonly KnowledgeCard[];
  readonly retrieval?: RetrievalOptions;
  /** 응답을 직접 지정해 검증 실패 경로를 테스트할 때 쓴다. */
  readonly responder?: (req: InterpretationRequest) => unknown;
}

/**
 * 목 클라이언트. 네트워크를 타지 않고, 실제 파이프라인(조립 → 응답 → 검증)을 그대로 통과시킨다.
 * 그래서 "검증기가 정상 응답을 거부하지 않는지"를 이 목만으로 회귀 테스트할 수 있다.
 */
export class MockInterpretationClient implements InterpretationClient {
  private readonly options: MockClientOptions;

  constructor(options: MockClientOptions) {
    this.options = options;
  }

  interpret(
    input: InterpretationInput,
    options: InterpretOptions = {},
  ): Promise<InterpretationOutcome> {
    if (options.signal?.aborted === true) {
      return Promise.resolve({ status: 'error', code: 'ABORTED', message: '요청이 취소되었습니다' });
    }

    let req: InterpretationRequest;
    try {
      // 카드 검색에는 팩트팩이 필요하고 요청 조립기도 팩트팩을 만든다. 순수함수라 두 번 만들어도
      // 결과가 같으므로, 조립기 시그니처를 오염시키는 대신 여기서 한 번 더 만든다.
      const fact: FactPack = buildFactPack(input.chart, input.profile, input.kind);
      const cards = selectKnowledgeCards(fact, this.options.knowledgeBase, this.options.retrieval);
      req = buildInterpretationRequest(input.chart, input.profile, cards, input.kind);
    } catch (e) {
      const message = e instanceof InterpretationBuildError ? `${e.code}: ${e.message}` : String(e);
      return Promise.resolve({ status: 'error', code: 'BUILD', message });
    }

    const raw = this.options.responder?.(req) ?? toRawShape(renderTemplateInterpretation(req));
    const verified = verifyInterpretation(raw, req);
    if (!verified.ok) {
      return Promise.resolve({
        status: 'rejected',
        narrativeKey: req.narrativeKey,
        failures: verified.failures,
      });
    }
    return Promise.resolve({
      status: 'ok',
      source: 'mock',
      narrativeKey: req.narrativeKey,
      value: verified.value,
    });
  }
}

/** 검증기는 모델의 snake_case 응답을 받으므로, 템플릿 결과를 그 모양으로 되돌린다. */
export function toRawShape(value: Interpretation): unknown {
  return {
    headline: value.headline,
    sections: value.sections.map((s) => ({ id: s.id, body: s.body })),
    action_today: value.actionToday,
    used_card_ids: [...value.usedCardIds],
  };
}
