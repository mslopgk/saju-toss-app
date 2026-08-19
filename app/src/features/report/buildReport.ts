/**
 * 규칙 기반 리포트 조립 — 계산 결과 + 자기신고 값 → 화면에 그릴 리포트.
 *
 * 근거: docs/interpretation.md §1(데이터 흐름) · §9(규칙 기반 리포트) / 문서10 §5.1 [2]~[3]
 *
 * 이 파일이 하는 일은 세 단계를 순서대로 부르는 것뿐이다.
 *   ① `buildFactPack()`      — 차트에서 서술에 필요한 사실만 투영
 *   ② `selectKnowledgeCards()` — 태그 정확일치로 근거 카드 선별
 *   ③ `renderTemplateReport()` — 카드 본문을 문장으로 조립
 *
 * ⛔ **해석 레이어 배럴(`shared/interpret`)을 import 하지 않는다.** 배럴에는 시스템 프롬프트 전문과
 *    Anthropic API 매퍼가 딸려 오고, 화면이 그걸 가져가면 사용자 단말로 내려간다.
 *    화면 계층은 `shared/interpret/ui` 만 쓴다(회귀: `shared/interpret/ui.test.ts` + 빌드 후 dist grep).
 *
 * LLM 이 붙는 날 바뀌는 것은 ③ 한 줄이다 — 출력 타입(`Interpretation`)이 같기 때문이다.
 */

import { CARDS } from '../../shared/knowledge'
import {
  buildFactPack,
  renderTemplateReport,
  selectKnowledgeCards,
  type BloodType,
  type ChartLike,
  type Gender,
  type Interpretation,
  type KnowledgeCard,
  type ReportKind,
  type RetrievalOptions,
  type UserProfile,
} from '../../shared/interpret/ui'

/**
 * 카드 상한.
 *
 * 기본값은 **프롬프트 토큰 예산**을 위한 값이다. 규칙 기반 리포트는 토큰을 쓰지 않는다 —
 * 여기서 상한이 하는 일은 예산 절약이 아니라 "터무니없이 많이 담지 않기"뿐이라 훨씬 넓게 잡는다.
 *
 * 사주 체계 하나가 요구하는 장수: 일간 1 + 지지 2 + 십신 2 + 십이운성 1 + 격국 1 + 용신경로 2 +
 * 억부 1 + 대운방향 1 = 11장. 여기에 검색만 되고 쓰이지 않는 카드(같은 그룹의 다른 십신 등)가 붙는다.
 * 상한이 그보다 좁으면 섹션이 **에러 없이** 사라지므로 여유를 둔다(그 상태는 `buildReport.test.ts` 가 잡는다).
 *
 * `maxCards` 를 40 → 64 로 올린 이유: 융합 축이 열리면서 매칭 카드가 또 늘었다.
 * 한 사람이 실제로 끌어오는 최대치는 대략 이렇다 —
 *   사주 계열: 일간 1 + 지지 2 + 십신 ≤10 + 십이운성 1 + 신살 ≤14 + 용신 5 + 대운 3
 *   그 밖:     별자리 2 + MBTI 9(16유형 1 + 축 4 + 인지기능 4) + 혈액형 2 + 융합 9
 * 합이 60 을 넘길 수 있다. 상한이 그보다 좁으면 **정렬 뒤쪽 카드가 조용히 잘리고**, 잘린 자리가
 * 어떤 섹션의 유일한 근거였다면 그 섹션이 에러 없이 사라진다(그 상태는 `buildReport.test.ts` 가 잡는다).
 * 규칙 기반 경로는 토큰을 쓰지 않으므로 넉넉히 잡는 쪽이 안전하다.
 */
const REPORT_RETRIEVAL: RetrievalOptions = { maxCards: 64, maxPerSystem: 40, maxPerKind: 14 }

/**
 * 이 리포트가 차트에서 읽는 필드의 전부. 엔진 `Chart` 가 이 모양의 상위집합이라 그대로 대입된다.
 * `input.gender` 를 포함하는 이유는 아래 `buildRuleBasedReport()` 주석에 있다.
 */
export type ReportChart = ChartLike & { readonly input: { readonly gender: Gender } }

/**
 * 이 리포트가 받는 자기신고 값.
 *
 * `features/onboarding` 의 `SelfReport` 를 import 하지 않고 **구조적으로 같은 타입**을 따로 둔다 —
 * ARCHITECTURE.md 의 "features 끼리 직접 import 하지 않는다" 규칙 때문이다. 두 feature 를 잇는 것은
 * 조합 계층(`pages/DetailPage`)의 일이고, 그쪽에서 `SelfReport` 를 그대로 넘기면 대입이 성립한다.
 */
export interface ReportProfile {
  readonly mbti: string | null
  readonly blood: BloodType | null
}

/** 자기신고를 받지 않은 상태. 둘 다 "모름"이면 MBTI·혈액형 섹션이 빠진다. */
export const NO_SELF_REPORT: ReportProfile = { mbti: null, blood: null }

/**
 * 이 리포트를 만들어 낸 입력. LLM 해석 서버(`POST /api/interpret`)에 그대로 보내는 값이기도 하다.
 *
 * 리포트 객체가 자기 입력을 들고 다니는 이유: 화면(`ReportView`)이 서버 해석을 요청하려면 차트와
 * 프로필이 필요한데, 그걸 프롭으로 따로 받으면 **규칙 기반 결과와 서버에 보낸 입력이 어긋날 수 있다**
 * (호출부가 둘 중 하나만 갱신하는 순간). 한 객체에 묶어 두면 그 어긋남이 구조적으로 불가능하다.
 *
 * `shared/interpret` 의 `InterpretationInput` 과 **구조적으로 같은 타입**을 여기 따로 둔다 —
 * 그 타입은 목 클라이언트(`client.ts`)가 사는 모듈에 있고, 화면 계층이 그 모듈 이름을 알 이유가 없다.
 */
export interface ReportSource {
  readonly kind: ReportKind
  readonly chart: ChartLike
  readonly profile: UserProfile
}

export interface RuleBasedReport {
  readonly interpretation: Interpretation
  /** 실제로 근거로 쓴 카드. 화면 하단 "근거" 표시와 QA 추적에 쓴다. */
  readonly usedCards: readonly KnowledgeCard[]
  /** 검색은 됐지만 문장에 쓰이지 않은 카드 수. 0 이 아니면 서술 슬롯이 부족하다는 신호다. */
  readonly unusedCardCount: number
  /** 서버 해석 요청에 그대로 넘기는 입력. */
  readonly source: ReportSource
  /** 이 리포트가 검색해 온 카드 전량. LLM 이 인용한 id 를 되짚을 때 쓴다. */
  readonly retrievedCards: readonly KnowledgeCard[]
}

/**
 * 차트 + 자기신고 값 → 리포트. 순수함수이며 같은 입력이면 같은 문장이 나온다.
 *
 * 성별은 자기신고가 아니라 **계산 입력**이므로 차트에서 읽는다(대운 방향 판정에 이미 쓰였다).
 * 그래서 호출부가 성별을 두 번 넘기지 않는다.
 */
export function buildRuleBasedReport(
  chart: ReportChart,
  selfReport: ReportProfile,
  knowledgeBase: readonly KnowledgeCard[] = CARDS,
): RuleBasedReport {
  const profile: UserProfile = {
    gender: chart.input.gender,
    mbti: selfReport.mbti,
    blood: selfReport.blood,
  }

  const fact = buildFactPack(chart, profile, 'fusion')
  const cards = selectKnowledgeCards(fact, knowledgeBase, REPORT_RETRIEVAL)
  const interpretation = renderTemplateReport(fact, cards)

  const usedIds = new Set(interpretation.usedCardIds)
  const usedCards = cards.filter((c) => usedIds.has(c.id))

  return {
    interpretation,
    usedCards,
    unusedCardCount: cards.length - usedCards.length,
    source: { kind: 'fusion', chart, profile },
    retrievedCards: cards,
  }
}

/** 리포트에 보여줄 내용이 있는가. 카드가 하나도 매칭되지 않으면 화면은 리포트 영역을 아예 숨긴다. */
export function hasReportContent(report: RuleBasedReport): boolean {
  return report.interpretation.sections.length > 0
}

/**
 * 인용된 카드 id → 카드.
 *
 * 서버 해석이 오면 근거 카드가 규칙 기반과 달라진다(서버는 토큰 예산 때문에 더 적게 검색한다).
 * 그래서 화면의 "참고한 자료" 목록을 id 로 다시 맞춘다. 조회 범위는 이 리포트가 이미 검색해 온 카드를
 * 먼저 보고, 없으면 지식베이스 전량에서 찾는다 — 서버와 클라이언트가 **같은 `cards.json`** 을 쓰므로
 * id 는 항상 맞아떨어진다. 못 찾은 id 는 조용히 버린다(없는 근거를 화면에 만들지 않는다).
 */
export function resolveCards(
  ids: readonly string[],
  pool: readonly KnowledgeCard[],
  knowledgeBase: readonly KnowledgeCard[] = CARDS,
): readonly KnowledgeCard[] {
  const byId = new Map<string, KnowledgeCard>()
  for (const card of knowledgeBase) byId.set(card.id, card)
  for (const card of pool) byId.set(card.id, card)

  const out: KnowledgeCard[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const card = byId.get(id)
    if (card !== undefined) out.push(card)
  }
  return out
}
