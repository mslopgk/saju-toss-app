/**
 * LLM 응답 스키마.
 *
 * 근거: 문서11 §6.4(구조화 출력 사용, assistant prefill 은 400) · 문서10 §8(리포트 IA)
 *
 * 두 벌을 유지한다.
 *   ① zod 스키마 — 응답을 **경계에서 검증**한다. 길이 제약을 포함한다.
 *   ② JSON Schema — API 의 구조화 출력(`output_config.format`)에 보낸다.
 *      Claude 구조화 출력은 `minLength`/`maxLength`/배열 길이 제약을 지원하지 않으므로
 *      zod → JSON Schema 자동 변환을 쓰지 않고 손으로 적었다(변환기가 미지원 키워드를 그대로 내보내면 400).
 *      두 벌의 필드 구성이 어긋나지 않는지는 schema.test.ts 가 확인한다.
 */

import { z } from 'zod';
import type { SectionId } from './contracts';

export const SECTION_IDS = [
  'saju',
  'sipsin',
  'jiji',
  'sinsal',
  'zodiac',
  'mbti',
  'blood',
  'intersection',
  'conflict',
  'strength',
  'luck',
] as const satisfies readonly SectionId[];

export const HEADLINE_MIN = 4;
export const HEADLINE_MAX = 60;
export const BODY_MIN = 40;
export const BODY_MAX = 1200;
export const ACTION_MIN = 10;
export const ACTION_MAX = 120;
/**
 * 인용 가능한 근거 카드 수의 상한.
 *
 * 32 였던 것을 64 로 올린다 — 규칙 기반 리포트가 열한 섹션(신살·별자리·융합 포함)을 만들면서
 * 실제 인용 카드가 40장 안팎이 됐다. 상한은 "LLM 이 카드 목록을 통째로 베껴 붙이는 것"을 막는
 * 장치이지 서술 폭을 좁히는 장치가 아니므로, 검색 상한(`features/report` 의 `maxCards`)과 같은
 * 값으로 맞춘다. 이 값보다 많이 인용하는 응답은 카드를 고르지 않았다는 뜻이라 여전히 거부된다.
 */
export const USED_CARDS_MAX = 64;

/**
 * 홈 히어로의 한 단어.
 *
 * 상한이 10자인 이유: 화면 폭 전체를 쓰는 대제목이라 이보다 길면 두 줄로 깨진다.
 * 하한이 2자인 이유: 한 글자짜리 요약("금", "물")은 오행 이름과 구별되지 않아 정보가 되지 않는다.
 */
export const WORD_MIN = 2;
export const WORD_MAX = 10;

/**
 * 한 문장 요약.
 *
 * 카드 본문(40~1200자)보다 **훨씬 좁게** 강제해야 요약이 된다. 상한을 넉넉히 주면 모델이
 * 문단을 써 보내고, 그러면 홈 화면이 다시 벽이 된다 — 이 프로젝트가 고치려던 바로 그것이다.
 */
export const SENTENCE_MIN = 20;
export const SENTENCE_MAX = 80;

/** 요약 응답의 원형(snake_case). */
export const rawSummarySchema = z.object({
  word: z.string().min(WORD_MIN).max(WORD_MAX),
  sentence: z.string().min(SENTENCE_MIN).max(SENTENCE_MAX),
  used_card_ids: z.array(z.string().min(1)).min(1).max(USED_CARDS_MAX),
});

export type RawSummary = z.infer<typeof rawSummarySchema>;

export interface SummaryValue {
  readonly word: string;
  readonly sentence: string;
  readonly usedCardIds: readonly string[];
}

export function toSummary(raw: RawSummary): SummaryValue {
  return { word: raw.word, sentence: raw.sentence, usedCardIds: raw.used_card_ids };
}

/** 카드 한 장의 원형. 섹션 id 는 **응답에 넣지 않는다** — 아래 `CARD_JSON_SCHEMA` 주석 참고. */
export const rawCardSchema = z.object({
  body: z.string().min(BODY_MIN).max(BODY_MAX),
  used_card_ids: z.array(z.string().min(1)).min(1).max(USED_CARDS_MAX),
});

export type RawCard = z.infer<typeof rawCardSchema>;

export interface CardValue {
  readonly id: SectionId;
  readonly body: string;
  readonly usedCardIds: readonly string[];
}


/** 모델이 실제로 내보내는 모양(snake_case). */
export const rawInterpretationSchema = z.object({
  headline: z.string().min(HEADLINE_MIN).max(HEADLINE_MAX),
  sections: z
    .array(
      z.object({
        id: z.enum(SECTION_IDS),
        body: z.string().min(BODY_MIN).max(BODY_MAX),
      }),
    )
    .min(1)
    .max(SECTION_IDS.length),
  action_today: z.string().min(ACTION_MIN).max(ACTION_MAX),
  used_card_ids: z.array(z.string().min(1)).min(1).max(USED_CARDS_MAX),
});

export type RawInterpretation = z.infer<typeof rawInterpretationSchema>;

export interface InterpretationSection {
  readonly id: SectionId;
  readonly body: string;
}

/** 앱이 다루는 모양(camelCase). 면책 문구는 여기 없다 — `prompt.ts` 의 DISCLAIMERS 를 UI 가 붙인다. */
export interface Interpretation {
  readonly headline: string;
  readonly sections: readonly InterpretationSection[];
  readonly actionToday: string;
  readonly usedCardIds: readonly string[];
}

export function toInterpretation(raw: RawInterpretation): Interpretation {
  return {
    headline: raw.headline,
    sections: raw.sections.map((s) => ({ id: s.id, body: s.body })),
    actionToday: raw.action_today,
    usedCardIds: [...raw.used_card_ids],
  };
}

export const INTERPRETATION_SCHEMA_NAME = 'interpretation_response_v1';

/**
 * 구조화 출력용 JSON Schema.
 * 지원되는 키워드만 쓴다: type / properties / required / enum / items / additionalProperties:false.
 */
/**
 * 요약 구조화 출력 스키마.
 *
 * ⚠ Claude 구조화 출력은 `minLength`/`maxLength` 를 지원하지 않는다(넣으면 400).
 *   길이는 `description` 으로 부탁하고 `rawSummarySchema` 가 사후에 강제한다.
 */
export const SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'sentence', 'used_card_ids'],
  properties: {
    word: {
      type: 'string',
      description: `이 사람을 한 단어로. 명사구. ${WORD_MIN}~${WORD_MAX}자. 수치·간지를 넣지 않는다.`,
    },
    sentence: {
      type: 'string',
      description: `한 문장 요약. ${SENTENCE_MIN}~${SENTENCE_MAX}자. 단정하되 과장하지 않는다.`,
    },
    used_card_ids: {
      type: 'array',
      items: { type: 'string' },
      description: '근거로 실제 사용한 지식 카드 id',
    },
  },
} as const;

/**
 * 카드 한 장 구조화 출력 스키마.
 *
 * **섹션 id 를 응답에 요구하지 않는다.** 어느 섹션을 요청했는지는 호출부가 이미 알고 있고,
 * 모델에게 되돌려 달라고 하면 틀린 값을 돌려줄 여지만 생긴다 — 검증할 대상이 하나 느는 것 외에
 * 얻는 것이 없다. 응답에 붙이는 id 는 `verifyCard` 가 요청값에서 채운다.
 */
export const CARD_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['body', 'used_card_ids'],
  properties: {
    body: {
      type: 'string',
      description: `이 섹션의 본문. ${BODY_MIN}~${BODY_MAX}자.`,
    },
    used_card_ids: {
      type: 'array',
      items: { type: 'string' },
      description: '근거로 실제 사용한 지식 카드 id',
    },
  },
} as const;

export const INTERPRETATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'sections', 'action_today', 'used_card_ids'],
  properties: {
    headline: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'body'],
        properties: {
          id: { type: 'string', enum: [...SECTION_IDS] },
          body: { type: 'string' },
        },
      },
    },
    action_today: { type: 'string' },
    used_card_ids: { type: 'array', items: { type: 'string' } },
  },
} as const;
