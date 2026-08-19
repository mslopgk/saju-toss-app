/**
 * 리포트 기능의 공개 표면.
 * 이 파일에 없는 것은 기능 내부 구현이다 — 바깥에서 직접 import 하지 않는다.
 */

export { NO_SELF_REPORT, buildRuleBasedReport, hasReportContent, resolveCards } from './buildReport'
export type { ReportChart, ReportProfile, ReportSource, RuleBasedReport } from './buildReport'

export { defaultInterpretationClient, defaultSummaryClient, resolveApiBase } from './interpretationClient'
export { useInterpretation } from './useInterpretation'
export type {
  InterpretationClient,
  InterpretationOrigin,
  InterpretationState,
  InterpretationView,
} from './useInterpretation'

export { adoptSummary, useHomeSummary } from './useHomeSummary'
export type { HomeSummaryView, SummaryClient, SummaryOrigin, SummaryState } from './useHomeSummary'

export { ReportView } from './components/ReportView'
export type { ReportViewProps } from './components/ReportView'
