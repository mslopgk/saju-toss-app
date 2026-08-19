/**
 * 해석 생성 레이어 공개 API.
 *
 * 흐름: Chart ──buildFactPack──▶ FactPack ──selectKnowledgeCards──▶ KnowledgeCard[]
 *       ──buildInterpretationRequest──▶ InterpretationRequest ──(서버)──▶ LLM
 *       ──verifyInterpretation──▶ Interpretation
 *
 * ⛔ **화면은 이 파일을 import 하지 않는다.** 여기에는 시스템 프롬프트 전문(`prompt.ts`)과
 *    Anthropic Messages API 매퍼(`client.ts`)가 딸려 온다 — 미니앱 번들에 실리면 사용자 단말로 내려간다.
 *    화면은 `./ui` 에서 면책 문구·섹션 제목·타입만 가져간다.
 *
 * 자세한 설계는 `app/docs/interpretation.md`.
 */

export type {
  BloodType,
  ChartLike,
  Confidence,
  Element,
  EngineWarning,
  Gender,
  KnowledgeCard,
  KnowledgeKind,
  PillarLike,
  PlacementLike,
  ReportKind,
  SectionId,
  SignIdx,
  StrengthGrade,
  TenGodGroup,
  UserProfile,
  YongsinRoute,
  ZodiacElement,
} from './contracts';

export {
  buildFactPack,
  compareCodepoint,
  ganjiAllowList,
  numberAllowList,
  quantizeScore,
  zodiacElementOf,
  zodiacSignIdOf,
  ZODIAC_SIGN_IDS,
  type FactPack,
  type FactPackAstro,
  type FactPackSaju,
  type FactPackStrength,
  type FactSection,
} from './factPack';

export {
  queryTagsOf,
  QUERY_TAG_AXES,
  selectKnowledgeCards,
  systemOfKind,
  type CardSystem,
  type RetrievalOptions,
  type ScoredCard,
} from './retrieve';

export {
  buildSystemBlocks,
  cardTail,
  summaryTail,
  DISCLAIMERS,
  expectedSections,
  PROMPT_VERSION,
  SECTION_TITLES,
  staticPrefixLength,
  type PromptBlock,
} from './prompt';

export {
  buildCardRequest,
  buildInterpretationRequest,
  buildSummaryRequest,
  CARD_ROUTING,
  SUMMARY_ROUTING,
  chartIdentityKey,
  InterpretationBuildError,
  narrativeKeyOf,
  requestCharCounts,
  type BuildErrorCode,
  type Effort,
  type InterpretationRequest,
  type ModelId,
  type ModelRouting,
} from './buildRequest';

export {
  CARD_JSON_SCHEMA,
  INTERPRETATION_JSON_SCHEMA,
  SECTION_IDS,
  INTERPRETATION_SCHEMA_NAME,
  SENTENCE_MAX,
  SENTENCE_MIN,
  SUMMARY_JSON_SCHEMA,
  WORD_MAX,
  WORD_MIN,
  rawCardSchema,
  rawInterpretationSchema,
  rawSummarySchema,
  toInterpretation,
  toSummary,
  type CardValue,
  type Interpretation,
  type InterpretationSection,
  type RawCard,
  type RawInterpretation,
  type RawSummary,
  type SummaryValue,
} from './schema';

export {
  verifyAuthoredText,
  verifyCard,
  verifyInterpretation,
  verifySummary,
  type AuthoredGuardContext,
  type CardVerifyResult,
  type RejectionCode,
  type SummaryVerifyResult,
  type VerificationFailure,
  type VerifyResult,
} from './guard';

export {
  MockInterpretationClient,
  renderTemplateInterpretation,
  toMessagesApiParams,
  toRawShape,
  type InterpretationClient,
  type InterpretationErrorCode,
  type InterpretationInput,
  type InterpretationOutcome,
  type InterpretationSource,
  type InterpretOptions,
  type MockClientOptions,
} from './client';

export { canonicalJson, fnv1a32 } from './canonical';
