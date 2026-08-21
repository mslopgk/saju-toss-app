/**
 * 궁합 기능의 공개 표면.
 * 이 파일에 없는 것은 기능 내부 구현이다 — 바깥에서 직접 import 하지 않는다.
 */

export { buildCompatReport } from './buildCompatReport';
export type { CompatReport, CompatReportOptions, CompatReportSection } from './buildCompatReport';

export { COMPAT_DISCLAIMERS, COMPAT_SECTION_TITLES, compatMoodOf } from './copy';
export type { CompatMoodTag, CompatSectionId } from './copy';

export { PartnerForm } from './components/PartnerForm';
export type { PartnerFormProps } from './components/PartnerForm';

export { CompatReportView } from './components/CompatReportView';
export type { CompatReportViewProps } from './components/CompatReportView';

export {
  INITIAL_PARTNER_DRAFT,
  buildPartnerInput,
  isValidPartnerDate,
  missingPartnerFields,
  monthsOf,
  partnerReducer,
} from './partnerState';
export type { PartnerDraft, PartnerDate, PartnerTime } from './partnerState';
