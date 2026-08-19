/**
 * LLM 응답 검증 — 스키마를 벗어나거나 사실을 지어낸 응답을 **거부**한다.
 *
 * 근거: 문서10 §5.3(프롬프트 가드레일) §6.3(금지어) §9(법적/윤리 체크리스트) · C00 §H(점수는 계산이 확정)
 *
 * 프롬프트로 부탁하는 것과 출력을 검사하는 것은 다른 층이다. 프롬프트는 지켜지길 바라는 것이고,
 * 이 파일은 지켜지지 않았을 때 사용자에게 나가는 것을 막는다. 폴백(규칙 문장)이 있으므로 거부해도 화면은 빈다.
 */

import {
  rawCardSchema,
  rawInterpretationSchema,
  rawSummarySchema,
  toInterpretation,
  toSummary,
  type CardValue,
  type Interpretation,
  type SummaryValue,
} from './schema';
import type { SectionId } from './contracts';
import type { InterpretationRequest } from './buildRequest';
import { ganjiAllowList, numberAllowList, type FactPack } from './factPack';

export type RejectionCode =
  | 'SCHEMA'
  | 'SECTION_MISMATCH'
  | 'UNKNOWN_CARD'
  | 'BANNED_PHRASE'
  | 'FABRICATED_GANJI'
  | 'FABRICATED_NUMBER';

export interface VerificationFailure {
  readonly code: RejectionCode;
  readonly detail: string;
}

export type VerifyResult =
  | { readonly ok: true; readonly value: Interpretation }
  | { readonly ok: false; readonly failures: readonly VerificationFailure[] };

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const GANJI_RE = new RegExp(`[${STEMS}][${BRANCHES}]`, 'g');
const NUMERIC_CLAIM_RE = /(\d+(?:\.\d+)?)\s*(점|%|퍼센트)/g;

/**
 * 금지 표현. 문서10 §6.3(금지어) + §5.3(가드레일 2·3항)에서 유도했다.
 * 면책 문구는 앱이 붙이고 LLM 이 쓰지 않으므로, "과학적 근거" 류 표현이 본문에 나오면 그대로 거부해도 안전하다.
 */
interface BannedRule {
  readonly label: string;
  readonly pattern: RegExp;
  /** 매치 문자열이 이 패턴에도 걸리면 위반이 아니다(완곡·부정 표현 오탐 방지). */
  readonly except?: RegExp;
}

const BANNED: readonly BannedRule[] = [
  { label: '과학적 주장', pattern: /과학적으로\s*(증명|입증|검증)/ },
  { label: '과학적 주장', pattern: /연구\s*결과(에\s*따르면|로)?/ },
  { label: '과학적 주장', pattern: /통계적으로\s*(유의|입증)/ },
  // 문장 종결부(。.!?)를 넘지 않는 범위에서 "반드시 … -니다" 를 잡되,
  // "반드시 ~한 것은 아닙니다" 같은 완곡·부정형은 오히려 권장 표현이므로 제외한다.
  {
    label: '단정 예언',
    pattern: /반드시[^。.!?\n]{0,30}니다/,
    except: /(아닙니다|않습니다|없습니다|아니에요|않아요)/,
  },
  { label: '공포 마케팅', pattern: /하면\s*안\s*됩니다/ },
  { label: '의료 유사', pattern: /(질병|암|우울증)에\s*걸립니다/ },
  { label: '의료 유사', pattern: /(진단|처방|완치|치료)해\s*(드립|줍)니다/ },
  { label: '의료 유사', pattern: /건강에\s*문제가\s*생깁니다/ },
  { label: '재무 조언', pattern: /(수익률|원금\s*보장|매수|매도|투자하세요|주식|코인)/ },
  { label: '법적 결과 단정', pattern: /(소송|재판)에서\s*(이깁니다|집니다)/ },
  { label: '합격 단정', pattern: /(합격|불합격)(합니다|입니다|할\s*것입니다)/ },
  { label: '임신·출산 단정', pattern: /임신(합니다|하게\s*됩니다)/ },
  { label: '사망 언급', pattern: /사망(합니다|하게\s*됩니다)/ },
  { label: '관계 낙인', pattern: /(잘\s*맞지\s*않는\s*사람|안\s*맞는\s*사람)/ },
];

/**
 * LLM 이 작성한 자유 텍스트만 모은다.
 * (면책 문구·섹션 제목은 앱이 붙이므로 검사 대상이 아니다.)
 */
export function authoredText(value: Interpretation): string {
  return [value.headline, value.actionToday, ...value.sections.map((s) => s.body)].join('\n');
}

/**
 * 금지 표현 검사만 떼어낸 것.
 *
 * 규칙 기반 렌더러(`template.ts`)는 `InterpretationRequest` 를 만들지 않으므로
 * `verifyInterpretation()` 을 통째로 쓸 수 없다. 그렇다고 금지어 목록을 두 벌로 두면
 * 언젠가 한쪽만 갱신된다 — 목록은 이 파일 하나에만 두고 검사 함수를 공유한다.
 */
export function findBannedPhrases(text: string): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];
  for (const rule of BANNED) {
    const hit = rule.pattern.exec(text);
    if (hit !== null && rule.except?.test(hit[0]) !== true) {
      failures.push({ code: 'BANNED_PHRASE', detail: `${rule.label}: "${hit[0]}"` });
    }
  }
  return failures;
}

/**
 * 서술 텍스트 공통 검사에 필요한 것 — 요청 전체가 아니라 **이 둘뿐**이다.
 *
 * 좁게 받는 이유: 요약·카드 응답에는 섹션 배열이 없어 `InterpretationRequest` 를 그대로 요구하면
 * 호출부가 쓰지도 않을 필드를 지어내게 된다.
 */
export interface AuthoredGuardContext {
  readonly factPack: FactPack;
  readonly knowledgeCardIds: readonly string[];
}

/**
 * 서술 텍스트 공통 검사 — 전체 리포트·요약·카드가 나눠 쓴다.
 *
 * 여기 있는 네 가지는 **출력 모양과 무관**하다: 인용한 카드가 목록 안인가, 금지 표현이 있는가,
 * 지어낸 간지가 있는가, 지어낸 수치가 있는가. 출력 모양에 딸린 검사(섹션 구성 등)는 호출부가 한다.
 *
 * 같은 위반은 **한 번만** 보고한다 — 같은 간지를 열 번 쓴 응답이 실패 열 건으로 부풀면
 * 로그에서 진짜 원인이 묻힌다.
 */
export function verifyAuthoredText(
  text: string,
  usedCardIds: readonly string[],
  ctx: AuthoredGuardContext,
): readonly VerificationFailure[] {
  const failures: VerificationFailure[] = [];

  const allowedCards = new Set(ctx.knowledgeCardIds);
  for (const id of usedCardIds) {
    if (!allowedCards.has(id)) {
      failures.push({ code: 'UNKNOWN_CARD', detail: id });
    }
  }

  failures.push(...findBannedPhrases(text));

  const allowedGanji = ganjiAllowList(ctx.factPack);
  const seenGanji = new Set<string>();
  for (const m of text.matchAll(GANJI_RE)) {
    const g = m[0];
    if (!allowedGanji.has(g) && !seenGanji.has(g)) {
      seenGanji.add(g);
      failures.push({ code: 'FABRICATED_GANJI', detail: g });
    }
  }

  const allowedNumbers = numberAllowList(ctx.factPack);
  const seenNumbers = new Set<string>();
  for (const m of text.matchAll(NUMERIC_CLAIM_RE)) {
    const n = m[1] ?? '';
    if (!allowedNumbers.has(n) && !seenNumbers.has(n)) {
      seenNumbers.add(n);
      failures.push({ code: 'FABRICATED_NUMBER', detail: m[0] });
    }
  }

  return failures;
}

export function verifyInterpretation(raw: unknown, req: InterpretationRequest): VerifyResult {
  const parsed = rawInterpretationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      failures: parsed.error.issues.map((i) => ({
        code: 'SCHEMA' as const,
        detail: `${i.path.join('.') || '(root)'}: ${i.message}`,
      })),
    };
  }
  const value = toInterpretation(parsed.data);
  const failures: VerificationFailure[] = [];

  // ① 섹션 구성 — 지정한 섹션 집합·순서와 정확히 같아야 한다.
  const got = value.sections.map((s) => s.id);
  const want = req.sections;
  if (got.length !== want.length || got.some((id, i) => id !== want[i])) {
    failures.push({
      code: 'SECTION_MISMATCH',
      detail: `기대 [${want.join(',')}] / 실제 [${got.join(',')}]`,
    });
  }

  // ②~⑤ 근거 카드 · 금지 표현 · 지어낸 간지 · 지어낸 수치 — 출력 모양과 무관한 검사는 공통 함수가 한다.
  failures.push(
    ...verifyAuthoredText(authoredText(value), value.usedCardIds, {
      factPack: req.factPack,
      knowledgeCardIds: req.knowledgeCardIds,
    }),
  );

  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, value };
}

/* ─────────────────────────── 분할 응답 검증 ─────────────────────────── */

export type SummaryVerifyResult =
  | { readonly ok: true; readonly value: SummaryValue }
  | { readonly ok: false; readonly failures: readonly VerificationFailure[] };

/** zod 이슈 → 실패 목록. 세 검증기가 같은 모양으로 보고하도록 한 곳에 둔다. */
function schemaFailures(error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] }): readonly VerificationFailure[] {
  return error.issues.map((i) => ({
    code: 'SCHEMA' as const,
    detail: `${i.path.join('.') || '(root)'}: ${i.message}`,
  }));
}

/**
 * 요약(한 단어 + 한 문장) 검증.
 *
 * 홈 첫 화면을 만드는 값이라 짧고 단정적이다. 짧다고 규율을 늦추지 않는다 — 오히려 짧을수록
 * 지어낸 수치 하나가 화면 전체를 지배한다. 단어와 문장을 이어 붙여 공통 검사에 넘긴다.
 */
export function verifySummary(raw: unknown, ctx: AuthoredGuardContext): SummaryVerifyResult {
  const parsed = rawSummarySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, failures: schemaFailures(parsed.error) };
  }
  const value = toSummary(parsed.data);
  const failures = verifyAuthoredText(`${value.word}
${value.sentence}`, value.usedCardIds, ctx);
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, value };
}

export type CardVerifyResult =
  | { readonly ok: true; readonly value: CardValue }
  | { readonly ok: false; readonly failures: readonly VerificationFailure[] };

/**
 * 카드 한 장 검증.
 *
 * 섹션 id 는 **요청값에서 채운다** — 모델에게 되돌려 달라고 하지 않는다(`CARD_JSON_SCHEMA` 주석).
 */
export function verifyCard(
  raw: unknown,
  sectionId: SectionId,
  ctx: AuthoredGuardContext,
): CardVerifyResult {
  const parsed = rawCardSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, failures: schemaFailures(parsed.error) };
  }
  const failures = verifyAuthoredText(parsed.data.body, parsed.data.used_card_ids, ctx);
  if (failures.length > 0) return { ok: false, failures };
  return {
    ok: true,
    value: { id: sectionId, body: parsed.data.body, usedCardIds: parsed.data.used_card_ids },
  };
}
