/**
 * 규칙 기반 궁합 리포트 — 계산 결과 → 화면에 그릴 문장.
 *
 * 근거: C00 §S8-4 「점수는 LLM 이 만들지 않는다」 / 문서10 §5.1 · §8(리포트 IA).
 *
 * ## 이 파일이 지키는 한 가지
 * **숫자를 만들지 않는다.** 문장에 들어가는 모든 수치는 `CompatResult` 에서 그대로 꺼낸 값이고,
 * 여기서 하는 일은 반올림 표기와 조사 붙이기뿐이다. 정렬·임계값 판정조차 하지 않는다 —
 * 딱 하나 하는 판정("여섯 항목 중 가장 덜 채워진 것")도 결과가 이미 들고 있는 `score/cap` 비율의
 * 최솟값이고, 그 결과로 고르는 것은 점수가 아니라 **문장 하나**다.
 *
 * LLM 이 붙는 날 바뀌는 것은 이 파일 한 벌이다 — 출력 타입이 같기 때문이다.
 */

import { labelColon } from '../../shared/interpret/dash';
import { CARDS, type KnowledgeCard } from '../../shared/knowledge';
import type { CompatResult, CompatSajuItem } from '../../shared/lib/compat';
import {
  ADVICE_BALANCED,
  ADVICE_BY_WEAKEST_ITEM,
  COMPAT_DISCLAIMERS,
  MISSING_AXIS_NOTE,
  SAME_GENDER_NOTE,
  type CompatSectionId,
} from './copy';
import { dotJoin, eunNeun, iGa, igo, josa, yeyo } from './josa';

export interface CompatReportSection {
  readonly id: CompatSectionId;
  readonly body: string;
}

export interface CompatReport {
  /** "84점 · 찰떡궁합" */
  readonly headline: string;
  /** 한 줄 요약 */
  readonly summary: string;
  readonly sections: readonly CompatReportSection[];
  /** 문장의 근거로 실제로 인용한 카드. 화면 하단 "참고한 자료" 와 QA 추적용 */
  readonly usedCards: readonly KnowledgeCard[];
  readonly disclaimers: readonly string[];
  /** 자기신고가 빠져 축이 줄었을 때의 안내. 없으면 null */
  readonly missingAxisNote: string | null;
}

export interface CompatReportOptions {
  /** 화면에서 부르는 호칭. 기본은 '나' / '상대분' */
  readonly labels?: readonly [string, string];
  /** 동성 쌍이면 십신의 성역할 서술을 빼고 그 사실을 밝힌다 (C00 §3-H11) */
  readonly sameGender?: boolean;
  readonly knowledgeBase?: readonly KnowledgeCard[];
}

const DEFAULT_LABELS: readonly [string, string] = ['나', '상대분'];

/** 소수 첫째 자리까지. 정수면 정수로 — "20.0점" 은 계산이 흔들린 것처럼 읽힌다 */
const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** `detail` 에서 `prefix` 로 시작하는 줄 하나. 없으면 null */
function detailLine(card: KnowledgeCard | undefined, prefix: string): string | null {
  if (card === undefined) return null;
  const hit = card.detail.split('\n').find((line) => line.startsWith(prefix));
  return hit === undefined ? null : hit.trim();
}

/** 카드 제목의 앞머리("甲(갑) — 목(양)" → "甲(갑)") */
function titleHead(card: KnowledgeCard | undefined): string | null {
  if (card === undefined) return null;
  const head = card.title.split('—')[0];
  return head === undefined ? null : head.trim();
}

/** "子(자) — 쥐띠" → "쥐띠" */
function ttiName(card: KnowledgeCard | undefined): string | null {
  if (card === undefined) return null;
  const tail = card.title.split('—')[1];
  return tail === undefined ? null : tail.trim();
}

/**
 * 인용한 카드를 **인용 순서대로 중복 없이** 모은다.
 * `erasableSyntaxOnly` 라 파라미터 프로퍼티를 쓸 수 없어 필드를 직접 대입한다(엔진 `EngineError` 와 같다).
 */
class CardBag {
  private readonly base: readonly KnowledgeCard[];
  private readonly seen = new Set<string>();
  private readonly out: KnowledgeCard[] = [];

  constructor(base: readonly KnowledgeCard[]) {
    this.base = base;
  }

  /** 조회 + 근거 목록 등록. 없는 카드는 조용히 건너뛴다(문장이 그 자리를 비워 둔다) */
  take(kind: string, key: string): KnowledgeCard | undefined {
    const card = this.base.find((c) => c.id === `${kind}:${key}`);
    if (card !== undefined && !this.seen.has(card.id)) {
      this.seen.add(card.id);
      this.out.push(card);
    }
    return card;
  }

  get cards(): readonly KnowledgeCard[] {
    return this.out;
  }
}

const itemOf = (result: CompatResult, id: string): CompatSajuItem =>
  result.saju.items.find((it) => it.id === id)!;

export function buildCompatReport(
  result: CompatResult,
  options: CompatReportOptions = {},
): CompatReport {
  const [labelA, labelB] = options.labels ?? DEFAULT_LABELS;
  const bag = new CardBag(options.knowledgeBase ?? CARDS);
  const sections: CompatReportSection[] = [];

  const push = (id: CompatSectionId, parts: readonly (string | null)[]): void => {
    // 카드 본문에서 인용된 `라벨 — 값` 의 엠대시를 여기서 콜론으로 바꾼다(`dash.ts` 주석 참고).
    const body = labelColon(parts.filter((p): p is string => p !== null && p.length > 0).join(' '));
    if (body.length > 0) sections.push({ id, body });
  };

  // ── 점수 ────────────────────────────────────────────────────────────────
  // "상위 N%" 로 적지 않는 이유: 백분위 0(최하위)이면 "상위 100%" 가 되는데, 맞는 말이지만
  // 읽는 사람 절반은 그걸 좋은 뜻으로 읽는다. 등수 표기는 양 끝에서 둘 다 바르게 읽힌다.
  const rank = Math.min(100, Math.max(1, Math.round((1 - result.percentile) * 100)));
  const axisLine = (['saju', 'zodiac', 'mbti', 'blood'] as const)
    .filter((a) => result.axes[a].present)
    .map((a) => `${AXIS_KO[a]} ${fmt(Math.round(result.axes[a].normalized * 10) / 10)}`)
    .join(' · ');
  const weightLine = (['saju', 'zodiac', 'mbti', 'blood'] as const)
    .filter((a) => result.axes[a].present)
    .map((a) => `${AXIS_KO[a]} ${Math.round(result.axes[a].weight * 100)}%`)
    .join(' · ');
  push('score', [
    `무작위로 짝지은 100쌍을 줄 세우면 위에서 ${rank}번째쯤이에요.`,
    `배점 비중은 ${weightLine} 이에요.`,
    // "100점" 처럼 배점 스케일을 숫자로 적지 않는다 — 본문의 `N점` 은 전부 계산 결과에 실재하는
    // 값이어야 하고, 그 규율을 `buildCompatReport.test.ts` 가 정규식으로 지킨다.
    `각 항목을 백점 만점으로 환산하면 이렇게 나와요. ${axisLine}.`,
    `그 가중합을 전체 분포에 대보고 나온 값이 ${result.score}점이에요.`,
  ]);

  // ── 일주 ────────────────────────────────────────────────────────────────
  const [stemA, stemB] = result.saju.dayStems;
  const [branchA, branchB] = result.saju.dayBranches;
  const s1 = itemOf(result, 'S1');
  const s2 = itemOf(result, 'S2');
  const stemLabels = [
    titleHead(bag.take('ilgan', stemA)) ?? stemA,
    titleHead(bag.take('ilgan', stemB)) ?? stemB,
  ];
  const branchLabels = [
    titleHead(bag.take('jiji', branchA)) ?? branchA,
    titleHead(bag.take('jiji', branchB)) ?? branchB,
  ];
  const s1Kind = s1.reasons.join('·');
  push('ilju', [
    `두 분의 일간은 ${yeyo(dotJoin(stemLabels))}.`,
    `이 둘의 관계는 ${igo(s1Kind)}${result.saju.dayStemHeName === null ? '' : `(${result.saju.dayStemHeName})`}, 일간 항목은 ${s1.cap}점 중 ${fmt(s1.score)}점이에요.`,
    `일지는 ${dotJoin(branchLabels)} 이고, ${s2.reasons.length === 0 ? '이렇다 할 합도 충도 걸리지 않아요' : `${iGa(s2.reasons.join('·'))} 걸려요`}.`,
    `일지 항목은 ${s2.cap}점 중 ${fmt(s2.score)}점이에요.`,
    result.saju.dayBranchHwa === null
      ? null
      : `두 지지가 합쳐서 만드는 기운은 ${result.saju.dayBranchHwa} 기운이에요.`,
  ]);

  // ── 십신 교차 ───────────────────────────────────────────────────────────
  const [godAB, godBA] = result.saju.crossTenGods;
  const s5 = itemOf(result, 'S5');
  const godCardA = bag.take('sipsin', godAB);
  const godCardB = bag.take('sipsin', godBA);
  const traits = (god: string, card: KnowledgeCard | undefined): string | null => {
    const line = detailLine(card, '성격 —');
    return line === null ? null : `${eunNeun(god)} ${line.replace(/^성격\s*—\s*/, '')}.`;
  };
  push('sipsin', [
    `${labelA}의 일간이 ${josa(labelB, '을', '를')} 보는 자리는 ${godAB}, 반대는 ${yeyo(godBA)}.`,
    `십신 교차 항목은 ${s5.cap}점 중 ${fmt(s5.score)}점이에요.`,
    options.sameGender === true ? SAME_GENDER_NOTE : null,
    traits(godAB, godCardA),
    godAB === godBA ? null : traits(godBA, godCardB),
  ]);

  // ── 오행 · 용신 ─────────────────────────────────────────────────────────
  const s3 = itemOf(result, 'S3');
  const s4 = itemOf(result, 'S4');
  const [yongA, yongB] = result.saju.yongsinPrimaries;
  push('element', [
    result.saju.complementedElements.length > 0
      ? `한쪽에 없다시피 한 ${result.saju.complementedElements.join('·')} 기운을 상대가 넉넉히 갖고 있어요.`
      : '서로에게 크게 모자란 오행을 채워 주는 관계는 아니에요.',
    `오행 상보성은 ${s3.cap}점 중 ${fmt(s3.score)}점이에요.`,
    `두 분의 용신은 ${yongA} · ${yongB} 두 기운이고, 상대 원국이 그 기운을 얼마나 담고 있는지를 본 용신 충족도는 ${s4.cap}점 중 ${fmt(s4.score)}점이에요.`,
  ]);

  // ── 띠 ──────────────────────────────────────────────────────────────────
  const [yearA, yearB] = result.saju.yearBranches;
  const s6 = itemOf(result, 'S6');
  const ttiCardA = bag.take('jiji', yearA);
  const ttiCardB = bag.take('jiji', yearB);
  push('tti', [
    `띠는 ${yeyo(dotJoin([ttiName(ttiCardA) ?? yearA, ttiName(ttiCardB) ?? yearB]))}.`,
    s6.reasons.length === 0
      ? '띠끼리는 이렇다 할 관계가 걸리지 않아요.'
      : `${iGa(s6.reasons.join('·'))} 걸려요.`,
    `띠 항목은 ${s6.cap}점 중 ${fmt(s6.score)}점이고, 여섯 항목 중 배점이 가장 작아요. 겉궁합이라 그렇게 뒀어요.`,
  ]);

  // ── 별자리 ──────────────────────────────────────────────────────────────
  const [signNameA, signNameB] = result.zodiac.signNames;
  const zodiacCardA = bag.take('zodiac', result.zodiac.signIds[0]);
  const zodiacCardB = bag.take('zodiac', result.zodiac.signIds[1]);
  const elementLine = (name: string, card: KnowledgeCard | undefined): string | null => {
    const line = detailLine(card, '원소');
    return line === null ? null : `${eunNeun(name)} ${line.split('/').slice(0, 2).join('/').trim()}.`;
  };
  push('zodiac', [
    `별자리는 ${dotJoin([signNameA, signNameB])}, 열두 칸 중 ${result.zodiac.angularDistance}칸 떨어져 있어요${result.zodiac.aspect === null ? '' : `(${result.zodiac.aspect})`}.`,
    `별자리 점수는 ${result.zodiac.score}점이에요.`,
    elementLine(signNameA, zodiacCardA),
    result.zodiac.signIds[0] === result.zodiac.signIds[1]
      ? null
      : elementLine(signNameB, zodiacCardB),
  ]);

  // ── MBTI ────────────────────────────────────────────────────────────────
  if (result.mbti !== null) {
    const [typeA, typeB] = result.mbti.types;
    const mbtiCardA = bag.take('mbti', typeA);
    const mbtiCardB = bag.take('mbti', typeB);
    const strengthLine = (type: string, card: KnowledgeCard | undefined): string | null => {
      const line = detailLine(card, '강점');
      // MBTI 유형은 마지막 글자가 J(제이)·P(피)라 받침이 없다 — 조사는 항상 `는`.
      return line === null ? null : `${type}는 ${line}.`;
    };
    push('mbti', [
      `MBTI 는 ${dotJoin([typeA, typeB])}, 네 글자 중 ${result.mbti.sharedLetters}개가 같아요.`,
      `MBTI 점수는 ${result.mbti.score}점이에요.`,
      strengthLine(typeA, mbtiCardA),
      typeA === typeB ? null : strengthLine(typeB, mbtiCardB),
    ]);
  }

  // ── 혈액형 ──────────────────────────────────────────────────────────────
  if (result.blood !== null) {
    const [bloodA, bloodB] = result.blood.types;
    bag.take('blood', bloodA);
    bag.take('blood', bloodB);
    // 이 카드는 지금까지 어떤 화면에서도 인용되지 않던 장이다. 근거 없음을 밝히는
    // 자리에서만 쓸 수 있는 카드라, 혈액형을 배점에 남긴 이 리포트가 그 자리다.
    bag.take('blood', '면책');
    push('blood', [
      `혈액형은 ${bloodA}형 · ${bloodB}형이에요.`,
      result.blood.genderModApplied
        ? `배점표상 점수는 ${result.blood.score}점이고, 국내 콘텐츠 관행대로 남녀 조합에 따른 보정이 들어갔어요.`
        : `배점표상 점수는 ${result.blood.score}점이에요.`,
      '다만 혈액형과 성격·궁합의 관계는 확인된 근거가 없어요.',
      `최종 점수에서 혈액형이 차지하는 몫은 ${Math.round(result.axes.blood.weight * 100)}%예요.`,
    ]);
  }

  // ── 조언 ────────────────────────────────────────────────────────────────
  const weakest = [...result.saju.items].sort((x, y) => x.score / x.cap - y.score / y.cap)[0]!;
  const balanced = weakest.score / weakest.cap >= 0.7;
  push('advice', [balanced ? ADVICE_BALANCED : ADVICE_BY_WEAKEST_ITEM[weakest.id] ?? null]);

  const missing = (['mbti', 'blood'] as const).some((a) => !result.axes[a].present);

  return {
    headline: `${result.score}점 · ${result.band.name}`,
    summary: `백점 만점의 사주 궁합 ${fmt(Math.round(result.saju.total * 10) / 10)}점을 중심으로 네 체계를 합쳐 ${result.band.tag} 등급이에요.`,
    sections,
    usedCards: bag.cards,
    disclaimers: COMPAT_DISCLAIMERS,
    missingAxisNote: missing ? MISSING_AXIS_NOTE : null,
  };
}

const AXIS_KO = {
  saju: '사주',
  zodiac: '별자리',
  mbti: 'MBTI',
  blood: '혈액형',
} as const;
