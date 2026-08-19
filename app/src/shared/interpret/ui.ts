/**
 * 해석 레이어의 **UI 전용 진입점**.
 *
 * 화면(`pages/`·`features/`)은 `./index` 가 아니라 이 파일에서 import 한다.
 * `./index` 는 서버 전용 코드(시스템 프롬프트 전문·모델 라우팅·Anthropic Messages API 매퍼)를
 * 함께 내보내므로, 화면이 거기서 한 글자라도 가져오면 프롬프트가 미니앱 번들에 실려 사용자 단말로 내려간다.
 *
 * 그래서 이 파일은 **프롬프트에 닿지 않는 것만** 재수출한다:
 *   고정 문구(`./copy`) · 팩트팩 투영(`./factPack`) · 카드 검색(`./retrieve`) · 규칙 렌더러(`./template`).
 * 네 모듈의 값(runtime) import 그래프에는 `prompt.ts`·`buildRequest.ts`·`client.ts` 가 없다 —
 * `ui.test.ts` 가 그 그래프를 **전이적으로** 훑어 고정하고, 빌드 후 `dist` grep 이 이중으로 막는다.
 */

export { DISCLAIMERS, SECTION_TITLES } from './copy';

export { buildFactPack } from './factPack';
export type { FactPack, FactPackTenGodPlacement } from './factPack';

export { selectKnowledgeCards } from './retrieve';
export type { RetrievalOptions } from './retrieve';

export { renderTemplateReport, renderTemplateSummary } from './template';

export type {
  BloodType,
  ChartLike,
  Element,
  EngineWarning,
  Gender,
  KnowledgeCard,
  PillarKey,
  ReportKind,
  SectionId,
  TenGod,
  UserProfile,
} from './contracts';

export type { Interpretation, InterpretationSection, SummaryValue } from './schema';
