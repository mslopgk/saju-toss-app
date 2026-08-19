/**
 * 규칙 기반 해석 렌더러 — LLM 도 서버도 없이 읽을 만한 리포트를 만든다.
 *
 * 근거: 문서10 §5.1 [3] 문장 조립 레이어(템플릿) · §6.2 4단 구조(관찰→양가→긍정재해석→행동)
 *       · §6.3 금지어/권장어 · §6.4 긍정6:중립3:주의1 / C00 §H(점수·간지는 계산이 확정)
 *
 * ## 이 파일이 지키는 세 가지
 *
 * ① **숫자를 만들지 않는다.** 간지·나이·십신 이름은 팩트팩(=계산 엔진)에서 온 값을 그대로 옮긴다.
 *    임계값 판정·가중합·점수 산출을 여기서 하지 않는다. 엔진이 "임시 정의"라고 밝힌
 *    `tenGodWeights` 는 숫자로 내보내지 않고 순위 결과(`dominantTenGod`)만 쓴다.
 *
 * ② **카드에 없는 내용을 지어내지 않는다.** 성향·강점·주의·직업 재료 같은 **실질 주장**은 전부
 *    지식카드 본문(`detail`)에서 추출한 문자열이고, 이 파일이 보태는 것은 그 조각을 잇는
 *    접속 문장과 안전 고지뿐이다. 쓴 카드의 id 는 `usedCardIds` 에 남는다.
 *
 * ③ **없는 섹션을 있는 척하지 않는다.** 근거 카드가 없는 섹션은 빈 문장을 채우는 대신 목록에서 빠진다.
 *    `sinsal`·`zodiac` 은 S4-2·S7 이 붙으면서 생겼고, 팩트팩에 그 값이 없는 차트에서는 사라진다.
 *    `intersection`·`conflict` 는 **네 체계를 실제로 견줄 수 있을 때만** 만든다 — 비교할 축이 하나도
 *    없으면 "공통점" 도 "어긋남" 도 사실이 아니게 된다.
 *
 * ## 결정론
 *
 * 순수함수다. `Date.now()`·`Math.random()`·`Intl`·`localeCompare` 를 쓰지 않으므로(C00 §F7)
 * 같은 팩트팩 + 같은 카드 배열 → 항상 같은 문장이 나온다. `template.test.ts` 가 두 번 호출 결과를
 * 문자 단위로 비교해 고정한다.
 *
 * ## LLM 경로와의 관계
 *
 * 출력 타입은 LLM 응답과 **같은 `Interpretation`** 이다(같은 섹션 id, 같은 길이 제약).
 * 그래서 서버가 붙는 날 이 렌더러를 폴백으로 남기고 값만 갈아끼우면 화면은 바뀌지 않는다.
 * 기존 `renderTemplateInterpretation()`(client.ts)은 **LLM 경로의 폴백**이라 `req.sections` 를
 * 그대로 채워야 하고, 이 파일은 **화면의 1차 경로**라 채울 수 있는 섹션만 만든다 — 그래서 두 벌이다.
 */

import { cardBody } from '../knowledge/types';
import type { BloodType, Element, KnowledgeCard, PillarKey, SectionId, TenGodGroup } from './contracts';
import { compareCodepoint, type FactPack, type FactPackSinsalHit } from './factPack';
import { systemOfKind } from './retrieve';
import type { Interpretation, InterpretationSection } from './schema';

/* ─────────────────────────── 카드 본문 파싱 ─────────────────────────── */

/**
 * 카드 본문에서 **쓰지 않는** 라벨.
 * 대부분 "쓰면 사실이 아니게 되는" 것들이라 목록마다 이유를 적는다.
 */
const OMITTED_FIELDS: ReadonlySet<string> = new Set([
  // 표본 비율(`5.37%`)·인구 비중(`34%`)은 팩트팩에 없는 수치다 → guard 의 FABRICATED_NUMBER 대상.
  '빈도',
  '국내 분포',
  // 내부 배점 재료. 화면에 나가면 근거 없는 점수로 읽힌다.
  '점수 축',
  // 계산 재료(지장간 분일). 서술 근거가 아니다.
  '지장간',
  // 가족 관계 단정으로 읽힌다("남 이복형제·경쟁자").
  '육친',
  // 조건문 그대로다("신약이면 A, 신강이면 B"). S5 가 붙은 지금은 조건이 이미 풀려 있고,
  // 풀린 결과(용신 오행)는 strength 섹션이 엔진 값으로 말한다. 조건문을 함께 실으면 같은 사실이
  // 두 번 나오고, 조후·종격 경로로 뽑힌 용신과 어긋나 보인다.
  '억부 방향',
  // 일간별 신살 **자리표**(어떤 지지에 붙는지)다. 실제로 붙었는지는 엔진 S4-2 가 판정하고
  // sinsal 섹션이 그 결과로 말한다. 자리표를 함께 실으면 안 붙은 신살까지 말하게 된다.
  '일간 기준 신살 자리',
  // 방위 대응이라 "띠=별자리"로 읽히면 오해다(카드 본문도 그렇게 못박는다). 두 카드 모두 막는다.
  '전통 천문 방위 대응 서양 12궁',
  '전통 천문 방위 대응',
  // 혈액형 성격론은 C18 이 반증을 확정했다. 성격 판정에 쓰지 않는다.
  '대중 통념',
  // ── 신살 카드의 계산·출처 재료. 사용자 문장의 근거가 아니다. ──
  // 구결 한문(「甲戊庚牛羊…」)이거나 자료 객체가 문자열로 굳은 것(`[object Object]`)이다.
  '판정 규칙',
  // 삼합국 墓地 순환 규칙. 판정 절차이지 서술이 아니다.
  '판정',
  // 대조한 원전·라이브러리 목록과 그 등급. QA 추적용이며 화면 근거는 카드 제목·출처가 맡는다.
  '근거',
  '근거 등급(tables.json)',
  // ── 융합 카드의 편집 재료. ──
  // 사영 공식(E_score=(목+화)/8 …). **우리는 이 값을 계산하지 않는다** — 실으면 계산한 척이 된다.
  '정규화 공식',
  // "[근거 있음] / [창작 필요]" 같은 편집 메모.
  '근거 구분',
  // 문서10 이 [창작 필요]로 표시한 제품용 확장 매핑. 학술 근거 매핑과 섞이면 근거 등급이 흐려진다.
  '확장 매핑(제품용)',
  // 충돌 카드의 예시(`사주 금수 강함(I) vs 자기신고 ENFP`)와 `{A}`·`{B}` 슬롯이 든 원문 템플릿.
  // 예시는 남의 사주고, 템플릿은 슬롯을 다 채우지 못하면 중괄호가 그대로 화면에 나간다.
  '예시 상황',
  '문장 템플릿',
  // 대운 나이 카드의 내부 결정문(`startAgeWestern·startAgeKorean 둘 다 보관`). 코드 식별자다.
  '본 앱 결정',
]);

/** `(C03 §1.1)` 같은 인용 괄호와 `[창작 필요]` 같은 편집 주석을 지운다. */
function strip(text: string): string {
  return text
    .replace(/\s*\([^()]*§[^()]*\)/g, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 문장 끝의 마침표만 떼어낸다(접속 문장에 끼워 넣을 때 마침표가 겹치지 않도록). */
function trimPeriod(text: string): string {
  return text.replace(/\.+$/, '').trim();
}

/** 값 끝의 괄호 주석을 떼어낸다. `陰(순서 기준)` → `陰` */
function trimTrailingParen(text: string): string {
  return text.replace(/\s*\([^()]*\)\s*$/, '').trim();
}

/**
 * `라벨 — 값` 조각을 뽑는다. 한 줄에 ` · ` 로 두 조각이 오는 카드도 있다
 * (`강점 — … · 주의 — …`). 같은 라벨이 두 번 나오면 **첫 등장을 쓴다**(결정론).
 */
function fieldsOf(card: KnowledgeCard): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of cardBody(card).split('\n')) {
    const line = rawLine.trim();
    // 편집자 경고 줄(⚠️/※)은 서술 재료가 아니다.
    if (line === '' || /^[⚠※]/u.test(line)) continue;
    for (const segment of line.split(' · ')) {
      const at = segment.indexOf(' — ');
      if (at < 0) continue;
      const label = segment.slice(0, at).trim();
      const value = trimPeriod(strip(segment.slice(at + 3)));
      if (label === '' || value === '' || OMITTED_FIELDS.has(label) || out.has(label)) continue;
      out.set(label, value);
    }
  }
  return out;
}

/**
 * 카드 본문의 `키 값 / 키 값 / …` 줄을 읽는다.
 * (`오행 金 / 음양 陽 / 방위 西` · `오행 火 / 음양 陽(순서 기준) / 띠 말 / …`)
 *
 * 슬래시가 하나도 없는 줄은 건너뛴다 — 그런 줄에서 "첫 공백 앞"을 키로 잡으면 아무 문장이나
 * 키:값으로 오독된다. 별자리 카드는 이 형식이 **둘째 줄**에 있어서 첫 줄만 보면 놓친다.
 * 같은 키가 여러 줄에 나오면 **첫 등장을 쓴다**(결정론 + 기존 일간·지지 카드 동작 유지).
 */
function slashFieldsOf(card: KnowledgeCard): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const line of cardBody(card).split('\n')) {
    const parts = strip(line).split(' / ');
    // ` — ` 가 섞인 줄은 `라벨 — 값` 문법의 줄이다(`오행 역할 — 인성 木 / 비겁 火 …`).
    // 그런 줄을 슬래시 문법으로 읽으면 `일간 기준 신살 자리 — …` 이 키 `일간` 으로 잘린다.
    if (parts.length < 2 || parts.some((p) => p.includes(' — '))) continue;
    for (const part of parts) {
      const at = part.indexOf(' ');
      if (at < 0) continue;
      const key = part.slice(0, at).trim();
      const value = trimPeriod(part.slice(at + 1)).trim();
      if (key === '' || value === '' || out.has(key)) continue;
      out.set(key, value);
    }
  }
  return out;
}

/**
 * 카드 제목의 첫 토막.
 * `丙(병) — 화(양)` → `丙(병)` (뒷부분은 오행 표기라 본문 슬롯과 겹친다)
 * `정인(正印) · 印綬 — 인성` → `정인(正印)` (별칭까지 붙이면 한 문장에 괄호가 두 번 나온다)
 */
function titleHead(card: KnowledgeCard): string {
  const cut = card.title.split(' — ')[0] ?? card.title;
  return (cut.split(' · ')[0] ?? cut).trim();
}

/** `승부욕이 강하다 / 사람을 끌어모으는 힘이 있다` → `승부욕이 강하다, 사람을 …` */
function commaJoin(value: string): string {
  return value
    .split(' / ')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join(', ');
}

/**
 * 라벨 값을 읽되 **자리표시자를 걸러낸다.**
 * 격국 카드는 해당 없는 칸을 대시 한 글자로 적어 둔다(`유형 — —` · `기(忌) — —`).
 * 그대로 문장에 넣으면 "유형은 —입니다" 가 되므로 없는 값으로 취급한다.
 */
function usableField(fields: ReadonlyMap<string, string>, label: string): string | undefined {
  const value = fields.get(label);
  if (value === undefined || value === '' || /^[—–-]+$/.test(value)) return undefined;
  return value;
}

/** 쉼표로 나열된 값의 첫 항목. 행동 제안 슬롯에 쓴다. */
function firstItem(value: string): string {
  const head = commaJoin(value).split(',')[0];
  return (head ?? value).trim();
}

/* ─────────────────────────── 조사 ─────────────────────────── */

/** 마지막 글자에 받침이 있는가. 한자·라틴 문자는 판단하지 않고 `false` 로 둔다. */
function hasFinalConsonant(word: string): boolean {
  const code = word.charCodeAt(word.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function eulReul(word: string): string {
  return `${word}${hasFinalConsonant(word) ? '을' : '를'}`;
}

function iGa(word: string): string {
  return `${word}${hasFinalConsonant(word) ? '이' : '가'}`;
}

/** `황소` → `황소예요` / `황금` → `황금이에요`. */
function yeyo(word: string): string {
  return `${word}${hasFinalConsonant(word) ? '이에요' : '예요'}`;
}


/** 한국어 낱말 목록을 `와/과` 로 잇는다. 십신 이름은 전부 한글 2자라 조사가 정확히 갈린다. */
function joinKo(words: readonly string[]): string {
  return words.reduce(
    (acc, word, i) =>
      i === 0 ? word : `${acc}${hasFinalConsonant(acc) ? '과' : '와'} ${word}`,
    '',
  );
}

/* ─────────────────────────── 혈액형 → 어조 ─────────────────────────── */

/**
 * 혈액형은 **성격을 판정하지 않는다**(C18: 縄田健悟 2014, n=11,729 로 반증).
 * 이 리포트에서 혈액형이 정하는 것은 아래 두 자리의 어조뿐이다 — 여는 한마디와 닫는 한마디.
 *
 * 문장 전체를 4벌로 만들지 않은 이유: 같은 사실을 4번 적으면 어느 한 벌만 고쳐지는 날이 오고,
 * 결정론 검증 대상도 4배가 된다. 어조를 두 자리로 좁혀도 "말투만 바꾼다"는 약속은 지켜진다.
 */
interface Tone {
  readonly lead: string;
  readonly close: string;
}

/**
 * 어조는 문체 카드가 선언한 라벨(`차분·정리형` / `발랄·직설` / `활기·행동유도형` / `아이러니·양면 서술`)에
 * 맞춘다 — 카드가 말하는 문체와 실제 문장이 어긋나면 혈액형 섹션의 설명이 거짓이 된다.
 */
const TONE_BY_BLOOD: Readonly<Record<BloodType, Tone>> = {
  A: { lead: '차례대로 천천히 짚어 볼게요.', close: '오늘은 여기서 한 가지만 골라 두어도 충분해요.' },
  B: { lead: '가볍게, 바로 짚어 볼게요.', close: '마음이 가는 쪽부터 하나 집어 보세요.' },
  O: { lead: '바로 가 볼게요.', close: '지금 할 수 있는 것 하나만 정하고 넘어가세요.' },
  AB: { lead: '두 겹으로 나눠서 볼게요.', close: '한 가지만 시험해 보고 결과를 다시 보세요.' },
};

const NEUTRAL_TONE: Tone = {
  lead: '차례대로 짚어 볼게요.',
  close: '오늘은 여기서 한 가지만 골라 두어도 충분해요.',
};

/** 문체 카드의 `제품 활용 — 문체를 활기·행동유도형으로` 에서 어조 라벨만 뽑는다. */
function toneLabelOf(card: KnowledgeCard): string | null {
  const use = fieldsOf(card).get('제품 활용');
  if (use === undefined) return null;
  const matched = /문체를\s*(.+)$/.exec(use);
  return matched?.[1]?.trim() ?? null;
}

/* ─────────────────────────── 섹션 조립 ─────────────────────────── */

const PILLAR_LABEL: Readonly<Record<PillarKey, string>> = {
  year: '연주',
  month: '월주',
  day: '일주',
  hour: '시주',
};

/**
 * 오행 나열 순서. 팩트팩·엔진과 같은 木火土金水 고정이다.
 * 점수 크기로 다시 정렬하지 않는다 — 그 순간 렌더러가 "가장 강한 오행"이라는 새 지표를 만든다.
 */
const ELEMENT_ORDER: readonly Element[] = ['木', '火', '土', '金', '水'];
/** 억부 카드의 `오행 역할` 한 줄을 파싱할 때의 허용 어휘. 파싱 실패를 조용히 통과시키지 않는다. */
const TEN_GOD_GROUPS: ReadonlySet<string> = new Set<TenGodGroup>([
  '비겁',
  '식상',
  '재성',
  '관성',
  '인성',
]);
const ELEMENTS: ReadonlySet<string> = new Set<Element>(ELEMENT_ORDER);

/**
 * 섹션 렌더 순서. 여기 없는 섹션 id 는 규칙 기반 리포트가 만들지 않는다.
 *
 * 문서10 §8 리포트 IA 를 따른다 — 체계별 카드(사주 → 별자리 → MBTI → 혈액형)를 먼저 늘어놓고,
 * 그 다음에 체계를 **가로지르는** 두 섹션(교집합 → 충돌)이 온다. 가로지르는 이야기가 먼저 오면
 * 독자가 아직 각 체계에서 무슨 값이 나왔는지 모르는 상태에서 "공통점"을 읽게 된다.
 */
const SECTION_ORDER: readonly SectionId[] = [
  'saju',
  'sipsin',
  'jiji',
  'sinsal',
  'strength',
  'luck',
  'zodiac',
  'mbti',
  'blood',
  'intersection',
  'conflict',
];

interface Draft {
  readonly id: SectionId;
  readonly body: string;
  readonly cardIds: readonly string[];
}

function cardOf(cards: readonly KnowledgeCard[], id: string): KnowledgeCard | undefined {
  return cards.find((c) => c.id === id);
}

/**
 * ① 일간 — 나머지 일곱 글자를 읽는 기준선.
 *
 * 첫 섹션이라 **읽는 순서**를 여기서 한 번 밝힌다(문서10 §6.2 4단 구조). 그 순서를 정한 카드가
 * `fusion:카피:4단구조` 이고, 이 문장이 그 카드를 인용하는 유일한 자리다. 4단의 마지막 ④는 섹션이
 * 아니라 리포트 끝의 "오늘 해볼 만한 한 가지" 블록이므로 문장도 거기까지 가리킨다.
 */
function draftSaju(fact: FactPack, cards: readonly KnowledgeCard[], tone: Tone): Draft | null {
  const s = fact.saju;
  const card = cardOf(cards, `ilgan:${s.dayStem}`);
  if (card === undefined) return null;

  const slash = slashFieldsOf(card);
  const fields = fieldsOf(card);
  const element = slash.get('오행');
  const polarity = slash.get('음양');
  const roles = fields.get('오행 역할');

  const parts: string[] = [
    tone.lead,
    // 간지(한자) 뒤에 조사·연결어미를 붙이지 않는다 — 발음을 알 수 없어 받침 판정이 불가능하다.
    `사주 여덟 글자는 ${s.gz8}입니다. 그중 태어난 날의 천간인 일간이 나머지 글자를 읽는 기준점이에요.`,
    element === undefined || polarity === undefined
      ? `당신의 일간은 ${titleHead(card)}입니다.`
      : `당신의 일간은 ${titleHead(card)}, 오행으로는 ${element}, 음양으로는 ${trimTrailingParen(polarity)}입니다.`,
  ];
  if (roles !== undefined) {
    parts.push(`이 기준에서 나머지 오행의 역할이 갈립니다 — ${roles}.`);
  }
  if (s.threePillarMode) {
    parts.push('태어난 시각을 모른다고 하셨으니 시주(時柱)를 뺀 세 기둥으로 읽었어요.');
  }
  parts.push(
    '일간은 성격을 한 단어로 정하는 도장이 아니라 기준선입니다.',
    '아래 항목은 모두 이 기준선에서 갈라져 나온 이야기예요.',
  );

  const used: string[] = [card.id];
  const structureCard = cardOf(cards, 'fusion:카피:4단구조');
  if (structureCard !== undefined) {
    parts.push(
      '항목마다 계산으로 나온 사실을 먼저 적고, 그 사실의 양면을 함께 본 다음, 마지막에 오늘 해볼 만한 한 가지로 닫습니다.',
    );
    used.push(structureCard.id);
  }
  return { id: 'saju', body: parts.join(' '), cardIds: used };
}

/**
 * ② 십신 배치 — 기둥별 룩업 결과 + 실제로 등장하는 십신의 카드.
 *
 * 카드를 `fact.saju.tenGodNames` 로 한 번 더 거르는 것이 핵심이다. 검색은 그룹 태그(`tenGod:재성`)로
 * 하므로 같은 그룹의 다른 십신(원국에 없는 정재)도 함께 뽑힌다 — 그 카드로 문장을 쓰면 없는 사실이 된다.
 */
function draftSipsin(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const s = fact.saju;
  const present = new Set<string>(s.tenGodNames);
  const picked = cards.filter((c) => c.kind === 'sipsin' && present.has(c.key)).slice(0, 2);
  if (picked.length === 0) return null;

  const placements = s.tenGodPlacements
    .filter((p) => p.stem !== null || p.branchMain !== null)
    .map((p) => {
      const names = [p.stem === '일간' ? '일간(기준점)' : p.stem, p.branchMain].filter(
        (n): n is string => n !== null,
      );
      return `${PILLAR_LABEL[p.pillar]} ${names.join('·')}`;
    });

  const parts: string[] = [
    '십신은 일간을 기준으로 나머지 글자가 어떤 역할을 맡는지 보는 자리입니다.',
    `당신의 배치는 ${placements.join(', ')}입니다.`,
    `가장 두텁게 모인 쪽은 ${iGa(s.dominantTenGod)}고, 그 자리에 실제로 앉은 십신은 ${joinKo(
      picked.map((c) => c.key),
    )}입니다.`,
  ];

  for (const card of picked) {
    const f = fieldsOf(card);
    const trait = f.get('성격');
    const strong = f.get('강점');
    const caution = f.get('주의') ?? f.get('약점');
    const job = f.get('직업 재료') ?? f.get('직무 재료');
    if (trait !== undefined) parts.push(`${titleHead(card)} — ${commaJoin(trait)}.`);
    if (strong !== undefined && caution !== undefined) {
      parts.push(`강점은 ${strong} 쪽이고, 눈여겨볼 곳은 ${caution} 쪽입니다.`);
    } else if (strong !== undefined) {
      parts.push(`강점은 ${strong} 쪽입니다.`);
    }
    if (job !== undefined) parts.push(`일의 재료로는 ${iGa(job)} 꼽힙니다.`);
  }

  parts.push('같은 기운이 강점과 주의를 함께 만든다는 점이 십신을 읽는 요령이에요.');
  return { id: 'sipsin', body: parts.join(' '), cardIds: picked.map((c) => c.id) };
}

/** ③ 지지 — 일지·월지의 오행과 띠, 절기월. */
function draftJiji(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const s = fact.saju;
  const dayCard = cardOf(cards, `jiji:${s.dayBranch}`);
  const monthCard = cardOf(cards, `jiji:${s.monthBranch}`);
  if (dayCard === undefined && monthCard === undefined) return null;
  // 일지 = 월지면 카드도 한 장뿐이다("두 자리의 오행" 문장을 쓸 수 없다).
  const sameBranch = s.dayBranch === s.monthBranch;

  const parts: string[] = ['지지는 네 기둥의 아래 글자입니다.'];
  const used: string[] = [];
  const elements: string[] = [];

  if (dayCard !== undefined) {
    const f = slashFieldsOf(dayCard);
    const element = f.get('오행');
    const animal = f.get('띠');
    parts.push(
      `태어난 날의 지지는 ${titleHead(dayCard)}입니다.` +
        (element === undefined ? '' : ` 오행은 ${element}`) +
        (animal === undefined ? '' : `, 띠로는 ${animal}`) +
        (element === undefined && animal === undefined ? '' : '에 해당해요.'),
    );
    used.push(dayCard.id);
    if (element !== undefined) elements.push(element);
  }

  if (monthCard !== undefined && !sameBranch) {
    const f = slashFieldsOf(monthCard);
    const element = f.get('오행');
    const month = f.get('절기월');
    parts.push(
      `태어난 달의 지지는 ${titleHead(monthCard)}입니다.` +
        (element === undefined ? '' : ` 오행은 ${element}`) +
        (month === undefined ? '' : `, 절기월로는 ${month}`) +
        (element === undefined && month === undefined ? '' : '에 해당해요.'),
    );
    used.push(monthCard.id);
    if (element !== undefined) elements.push(element);
  } else if (monthCard !== undefined) {
    const month = slashFieldsOf(monthCard).get('절기월');
    parts.push(
      '태어난 날과 태어난 달의 지지가 같은 글자예요. 같은 기운이 두 자리에 겹쳐 있는 배치입니다.' +
        (month === undefined ? '' : ` 절기월로는 ${month}에 해당해요.`),
    );
    if (!used.includes(monthCard.id)) used.push(monthCard.id);
  }

  parts.push('월지는 절기가 정하는 글자라, 같은 날에 태어나도 절기 경계를 지나면 달라집니다.');
  // 오행을 두 개 다 확보했을 때만 "두 자리" 문장을 쓴다. 한 장뿐이면 나머지 자리를 아는 척하게 된다.
  if (elements.length > 1) parts.push(`두 자리의 오행은 ${elements.join('·')}입니다.`);
  return { id: 'jiji', body: parts.join(' '), cardIds: used };
}

/* ─────────────────────────── 신살 ─────────────────────────── */

/**
 * 신살 카드 제목 꼬리의 분류. `천을귀인(天乙貴人) — 길신` → `길신`.
 * 12신살 카드는 `— 십이신살` 이라 길흉이 아니라 계열 이름이 온다 — 그래서 셋을 구분해서 받는다.
 */
function sinsalToneOf(card: KnowledgeCard): string {
  return (card.title.split(' — ')[1] ?? '').trim();
}

/**
 * ④ 신살 — S4-2 판정 결과.
 *
 * **엔진이 "붙었다"고 한 것만 말한다.** 일간별 자리표(`일간 기준 신살 자리`)는 어떤 지지에 붙는지의
 * 표일 뿐이라 OMITTED_FIELDS 로 막혀 있고, 여기서 쓰는 사실은 두 가지다:
 *   ① 이름과 히트한 기둥 — 엔진 값
 *   ② 길흉 분류와 키워드 — 카드 값(제목 꼬리 · `키워드` 라벨)
 *
 * 점수는 읽지 않는다. 카드 본문이 직접 요구하는 규율이기도 하다 —
 * "해석 문구는 이 카드의 길흉·규칙만 근거로 쓰고, 원문에 없는 구체 사건 단정은 금지한다."
 * 그래서 마지막 문장이 그 경계를 사용자에게도 그대로 밝힌다.
 */
function draftSinsal(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const hits = fact.saju.sinsalHits;
  if (hits === null || hits.length === 0) return null;

  // 근거 카드가 있는 신살만 말한다. 이름만 있고 카드가 없으면 뜻을 지어내게 된다.
  const picked: { readonly hit: FactPackSinsalHit; readonly card: KnowledgeCard }[] = [];
  for (const hit of hits) {
    const card = cardOf(cards, `sinsal:${hit.name}`);
    if (card === undefined || picked.some((p) => p.card.id === card.id)) continue;
    picked.push({ hit, card });
  }
  if (picked.length === 0) return null;

  const byTone = (tone: string): readonly string[] =>
    picked.filter((p) => sinsalToneOf(p.card) === tone).map((p) => titleHead(p.card));
  const gil = byTone('길신');
  const hyung = byTone('흉신');
  const twelve = byTone('십이신살');

  const parts: string[] = [
    '신살(神煞)은 여덟 글자의 특정 조합에 옛 표가 붙여 둔 이름표입니다.',
    `이번 판에 걸린 이름은 ${picked.map((p) => titleHead(p.card)).join(', ')}입니다.`,
  ];
  if (gil.length > 0) parts.push(`이 중 길(吉)로 분류돼 온 쪽은 ${gil.join(', ')}입니다.`);
  if (hyung.length > 0) {
    parts.push(
      `주의 쪽으로 분류돼 온 이름은 ${hyung.join(', ')}인데, 이름표가 곧 사건은 아니에요.`,
    );
  }
  if (twelve.length > 0) {
    parts.push(`${twelve.join(', ')} 쪽은 십이신살 순환에서 온 이름입니다.`);
  }

  /*
   * 자세히 보는 건 두 장까지. 전부 늘어놓으면 이름표 목록이 리포트를 잡아먹는다.
   * 고르는 순서는 길신 → 십이신살 → 흉신으로 **고정**한다. 엔진 배열 순서를 그대로 쓰면 우연히
   * 흉신 두 장이 앞에 와서 섹션이 경고문처럼 읽히는데, 문서10 §6.4 는 주의를 1할로 묶는다.
   * (크기를 재서 고르는 게 아니라 분류로 나누는 것이라 새 지표가 생기지 않는다.)
   * 조사가 붙는 자리에는 제목(`역마살(驛馬殺)`)이 아니라 카드 key(`역마살`)를 쓴다 —
   * 한자 괄호로 끝나는 말은 받침을 알 수 없어 `…)는` 처럼 틀린 조사가 나온다.
   */
  const TONE_ORDER = ['길신', '십이신살', '흉신'];
  const detailed = [...picked].sort((a, b) => {
    const ra = TONE_ORDER.indexOf(sinsalToneOf(a.card));
    const rb = TONE_ORDER.indexOf(sinsalToneOf(b.card));
    return (ra < 0 ? TONE_ORDER.length : ra) - (rb < 0 ? TONE_ORDER.length : rb);
  });
  for (const { hit, card } of detailed.slice(0, 2)) {
    const where = hit.pillars.map((p) => PILLAR_LABEL[p]).join('·');
    const keywords = usableField(fieldsOf(card), '키워드');
    if (where !== '' && keywords !== undefined) {
      parts.push(`${iGa(card.key)} 걸린 자리는 ${where}이고, 따라붙는 말은 ${commaJoin(keywords)} 쪽이에요.`);
    } else if (where !== '') {
      parts.push(`${iGa(card.key)} 걸린 자리는 ${where}입니다.`);
    } else if (keywords !== undefined) {
      parts.push(`${card.key}에 따라붙는 말은 ${commaJoin(keywords)} 쪽이에요.`);
    }
  }

  parts.push(
    '신살은 여기까지가 근거입니다 — 이름과 길흉 분류, 그리고 어느 자리에 걸렸는지.',
    '그 이름에서 병이나 사고 같은 구체적인 사건을 끌어내지는 않습니다.',
  );
  return { id: 'sinsal', body: parts.join(' '), cardIds: picked.map((p) => p.card.id) };
}

/**
 * ⑤ 신강신약과 용신 — S5 결과.
 *
 * **숫자는 전부 엔진 값을 그대로 옮긴다.** 오행 점수·신강지수·등급·용신 오행은 `computeStrengthChart()`
 * 가 확정한 값이고, 이 함수는 임계값 판정도 순위 매김도 하지 않는다(C00 §H). 오행은 고정 순서
 * 木火土金水 로만 나열한다 — "가장 높은 오행" 같은 표현은 렌더러가 새 지표를 만드는 것이다.
 *
 * 카드는 **엔진 값과 겹치지 않는 것만** 쓴다:
 *   `unseong:*`    일지 십이운성 국면의 키워드
 *   `yongsin:격국:*` 그 격이 반기고 꺼리는 자리(순용/역용)
 *   `yongsin:용신5법:*` 어떤 도출 경로였는지의 한국어 표기(엔진 유니온은 한자라 화면에 쓰지 않는다)
 *   `yongsin:억부:*`  오행 → 십신 자리 대응(용신 오행이 나에게 무슨 자리인지)
 * 억부 카드의 "신약 용신 순서" 는 **쓰지 않는다** — 조후·종격 경로로 뽑힌 용신과 어긋날 수 있고,
 * 그때 카드 문장은 엔진 결과를 부정하는 거짓이 된다.
 *
 * 특수격(종세격·전왕격 …)은 지식카드가 아직 없다. 그때는 격 이름만 적고 설명을 지어내지 않는다.
 */
function draftStrength(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const s = fact.saju.strength;
  if (s === null) return null;
  const used: string[] = [];

  const scores = ELEMENT_ORDER.map((e) => `${e} ${s.elementScores[e]}`).join(' · ');
  const parts: string[] = [
    '신강신약은 일간이 여덟 글자 안에서 얼마나 힘을 받고 있는지 보는 자리입니다.',
    `오행 점수는 ${scores} 입니다.`,
    `이 점수를 백분위로 옮긴 신강지수는 ${s.strengthIndex}, 등급으로는 ${s.strengthGrade}입니다.`,
    '일간을 돕는 비겁·인성 쪽과 힘을 나눠 쓰는 식상·재성·관성 쪽을 견준 값이라, 높으면 좋고 낮으면 나쁜 눈금이 아니라 어느 쪽으로 기울었는지를 보는 눈금이에요.',
  ];

  /*
   * 등급 카드(`yongsin:신강지수:*` 7장)는 이 등급이 **어떤 눈금 위의 어디인지**를 밝힌 근거다.
   * 카드가 든 구간 경계·설계 인구 비중은 문장으로 옮기지 않는다 — 구간은 등급 이름이 이미 말했고,
   * 인구 비중은 팩트팩에 없는 수치라 `numberAllowList` 밖이다(= 지어낸 수치로 걸린다).
   * 그래서 여기서 늘어나는 건 문장 하나와 근거 한 줄뿐이고, 이 섹션의 숫자는 여전히 여섯 개다.
   */
  const gradeCard = cardOf(cards, `yongsin:신강지수:${s.strengthGrade}`);
  if (gradeCard !== undefined) {
    parts.push('신강지수는 전체 분포에서의 백분위라, 눈금을 그대로 읽으면 됩니다.');
    used.push(gradeCard.id);
  }

  // 일지 십이운성 — 국면 이름과 그 국면에 따라붙는 말. "당신은 …하다" 로 쓰지 않는다.
  const unseongCard = cardOf(cards, `unseong:${s.unseongIlji}`);
  if (unseongCard !== undefined) {
    const keywords = usableField(fieldsOf(unseongCard), '키워드');
    parts.push(`태어난 날의 지지에서 일간이 놓인 자리는 십이운성으로 ${s.unseongIlji}입니다.`);
    if (keywords !== undefined) {
      parts.push(`이 국면에는 ${commaJoin(keywords)} 같은 말이 따라붙습니다.`);
    }
    parts.push('십이운성은 좋고 나쁨의 등급이 아니라 기운이 지금 어느 국면에 있는지를 가리킵니다.');
    used.push(unseongCard.id);
  }

  // 격국 — 월지에서 잡히는 판의 유형.
  const geokgukCard = cardOf(cards, `yongsin:격국:${s.geokguk}`);
  parts.push(`월지에서 잡히는 격은 ${s.geokguk}입니다.`);
  if (geokgukCard === undefined) {
    parts.push('이 격은 일반 격과 읽는 법이 달라, 여기서는 이름까지만 적어 둘게요.');
  } else {
    const f = fieldsOf(geokgukCard);
    const kind = usableField(f, '유형');
    const like = usableField(f, '희(喜)=상신');
    const dislike = usableField(f, '기(忌)');
    if (kind !== undefined) parts.push(`쓰는 방식은 ${kind}입니다.`);
    if (like !== undefined && dislike !== undefined) {
      parts.push(`이 격이 반기는 자리는 ${like} 쪽이고, 꺼리는 자리는 ${dislike} 쪽입니다.`);
    } else if (like !== undefined) {
      parts.push(`이 격이 반기는 자리는 ${like} 쪽입니다.`);
    }
    used.push(geokgukCard.id);
  }

  // 용신 — 도출 경로 이름은 카드에서, 오행은 엔진에서.
  parts.push('용신은 기울어진 판을 고르게 만드는 오행입니다.');
  const routeCards = routeCardsOf(cards, s.yongsin.route);
  const routeNames = routeCards.map((c) => c.key.slice('용신5법:'.length));
  if (routeNames.length > 0) {
    parts.push(`이번 사주는 ${routeNames.join('·')} 경로로 잡혔어요.`);
    for (const c of routeCards) used.push(c.id);
  }

  // 용신 오행이 나에게 어떤 십신 자리인지 — 억부 카드의 `오행 역할` 대응표에서만 읽는다.
  const bufuCard = cardOf(
    cards,
    `yongsin:억부:${fact.saju.dayElement}:${s.isStrong ? '신강' : '신약'}`,
  );
  const primaryRole =
    bufuCard === undefined ? undefined : elementRolesOf(bufuCard).get(s.yongsin.primary);
  if (bufuCard === undefined || primaryRole === undefined) {
    parts.push(`이번 판의 용신은 ${s.yongsin.primary} 하나입니다.`);
  } else {
    parts.push(`이번 판의 용신은 ${s.yongsin.primary}, 당신 기준으로는 ${primaryRole} 자리입니다.`);
    used.push(bufuCard.id);
  }
  // favorable[0] 은 primary 와 같다(엔진 계약). 그래서 "함께"가 아니라 "우선순위"로 받는다.
  const favorable = s.yongsin.favorable.join('·');
  parts.push(
    s.yongsin.avoid.length === 0
      ? `힘이 되는 오행은 우선순위대로 ${favorable} 순입니다.`
      : `힘이 되는 오행은 우선순위대로 ${favorable} 순이고, 지금은 덜 기대는 편이 나은 오행은 ${s.yongsin.avoid.join('·')}입니다.`,
  );
  parts.push(
    '용신은 좋은 오행과 나쁜 오행을 가르는 판정이 아니라, 기울어진 쪽의 반대편을 가리키는 방향 표시예요.',
  );

  return { id: 'strength', body: parts.join(' '), cardIds: used };
}

/**
 * 용신 도출 경로 카드. 여러 장일 때(`抑扶+格局` 은 억부·격국 두 장) **엔진 유니온 문자열의 순서**로 세운다.
 * 카드 id 코드포인트 순으로 두면 "격국·억부"가 되어, 상위 관문이 억부라는 C05-STD 순서와 어긋나 읽힌다.
 * 경로 문자열에 없는 카드는 뒤로 보내고 id 로 안정 정렬한다(결정론).
 */
function routeCardsOf(
  cards: readonly KnowledgeCard[],
  route: string,
): readonly KnowledgeCard[] {
  const rank = (card: KnowledgeCard): number => {
    const hanja = /\(([^()]+)\)\s*$/.exec(card.key)?.[1];
    const at = hanja === undefined ? -1 : route.indexOf(hanja);
    return at < 0 ? Number.MAX_SAFE_INTEGER : at;
  };
  return cards
    .filter(
      (c) =>
        c.kind === 'yongsin' &&
        c.key.startsWith('용신5법:') &&
        c.tags.includes(`yongsinRoute:${route}`),
    )
    .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 억부 카드의 `오행 역할 — 인성 水 / 비겁 木 / …` 한 줄을 오행 → 십신그룹 대응표로 읽는다.
 * 표는 카드가 들고 있고 이 함수는 옮기기만 한다(대응 규칙을 여기서 계산하지 않는다).
 */
function elementRolesOf(card: KnowledgeCard): ReadonlyMap<Element, TenGodGroup> {
  const out = new Map<Element, TenGodGroup>();
  const line = usableField(fieldsOf(card), '오행 역할');
  if (line === undefined) return out;
  for (const pair of line.split('/')) {
    const [group, element] = pair.trim().split(/\s+/);
    if (group === undefined || element === undefined) continue;
    if (!TEN_GOD_GROUPS.has(group) || !ELEMENTS.has(element)) continue;
    if (!out.has(element as Element)) out.set(element as Element, group as TenGodGroup);
  }
  return out;
}

/**
 * ⑥ 대운 — 간지와 나이, 그리고 방향.
 *
 * 대운 간지 **관계** 카드(`daewoon:관계:*` 15장)는 대운 간지 × 원국의 합·충 이벤트 판정(C06 §7.3)이
 * 있어야 하는데 엔진이 그 판정을 내지 않는다. 원국 **내부**의 합충(`chart.sinsal.branchRelations`)은
 * 있지만 그 카드들은 "운과 원국 사이"의 가중치를 서술한 것이라 바꿔 쓰면 뜻이 달라진다 → 쓰지 않는다.
 *
 * 반면 **서술 지침 카드 2장**(`daewoon:서술:*`)은 지금 바로 근거가 된다. 이 섹션이 실제로 만나이로
 * 적고 있고(§5.2), 5년 분할을 쓰지 않고 있기(§5.3) 때문이다 — 지키고 있는 규칙의 출처를 밝힌다.
 * "지금 몇 번째 대운인가"는 오늘 날짜가 필요해 결정론이 깨지므로 계산하지 않는다(C00 §F7).
 */
function draftLuck(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const entries = fact.saju.daewoon.slice(0, 3);
  const first = entries[0];
  if (first === undefined) return null;

  const rest = entries
    .slice(1)
    .map((d) => `${d.ganji}(만 ${d.startAgeWestern}~${d.endAgeWestern}세)`)
    .join(', ');

  const parts: string[] = [
    '대운은 10년 단위로 바뀌는 큰 흐름입니다.',
    `첫 대운은 ${first.ganji}, 만 ${first.startAgeWestern}세부터 ${first.endAgeWestern}세까지예요.`,
  ];
  // 간지는 한자라 뒤에 붙는 조사(로/으로)를 판정할 수 없다 → 조사가 필요 없는 문형으로 받는다.
  if (rest !== '') parts.push(`이어지는 구간은 ${rest} 순서예요.`);

  const used: string[] = [];
  const directionCard = cardOf(cards, `daewoon:방향:${fact.saju.daewoonDirectionKey}`);
  if (directionCard !== undefined) {
    parts.push(
      `대운의 진행 방향은 ${fact.saju.daewoonForward ? '순행' : '역행'}입니다.`,
      '방향은 태어난 해 천간의 음양과 성별이 함께 정하고, 방향이 뒤집히면 대운 간지가 통째로 달라져요.',
    );
    used.push(directionCard.id);
  }

  const ageCard = cardOf(cards, 'daewoon:서술:나이기준');
  if (ageCard !== undefined) {
    parts.push(
      '나이는 만나이로 적었어요. 세는나이로 세는 유파도 있어서 첫 구간이 한 살씩 밀려 보일 수 있습니다.',
    );
    used.push(ageCard.id);
  }
  const splitCard = cardOf(cards, 'daewoon:서술:5년분할');
  if (splitCard !== undefined) {
    parts.push(
      '앞 5년은 천간, 뒤 5년은 지지라고 잘라 말하는 방식은 쓰지 않았습니다. 기계적으로 나누면 자주 틀리는 자리예요.',
    );
    used.push(splitCard.id);
  }

  parts.push(
    '대운은 좋고 나쁨이 정해진 구간이 아니라 결이 바뀌는 구간입니다.',
    '익숙한 방식이 예전만큼 통하지 않는다고 느껴질 때가 구간이 바뀌는 무렵일 수 있어요.',
  );

  /*
   * 금지어 규칙(문서10 §6.3)을 밝히는 자리는 **여기 하나**다. 리포트 전체에 걸리는 규칙이지만,
   * 사용자가 예언을 기대하는 지점이 바로 이 섹션(앞으로의 10년)이라 그 자리에서 말해야 뜻이 산다.
   * 규칙을 지키는지는 `guard.ts` 의 `findBannedPhrases()` 가 검사하고 스윕 테스트가 800+ 사주에서
   * 0건을 고정한다 — 즉 이 문장은 바람이 아니라 검증된 사실이다.
   * 금지 표현을 예시로 인용하지 않는다: 인용하는 순간 그 문자열이 본문에 실려 검사기에 걸린다.
   */
  const copyCard = cardOf(cards, 'fusion:카피:금지어');
  if (copyCard !== undefined) {
    parts.push(
      '어느 해에 무슨 일이 일어난다고 단정하거나 병·합격·재물 같은 결과를 미리 못박는 문장은 이 리포트에 쓰지 않았어요.',
    );
    used.push(copyCard.id);
  }
  return { id: 'luck', body: parts.join(' '), cardIds: used };
}

/**
 * ⑤ MBTI — 자기신고 값.
 *
 * 카드 **제목은 쓰지 않는다.** 16유형 별칭은 NERIS 저작물이라는 경고가 카드 본문에 붙어 있다
 * (문서05 상표권). 4글자 코드와 본문 슬롯만 쓴다.
 */
function draftMbti(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const code = fact.mbti;
  if (code === null) return null;
  const card = cardOf(cards, `mbti:${code}`);
  if (card === undefined) return null;

  const f = fieldsOf(card);
  const stack = f.get('인지기능 스택');
  const strong = f.get('강점');
  const weak = f.get('약점') ?? f.get('주의');
  const job = f.get('직무 재료') ?? f.get('직업 재료');
  const love = f.get('연애 성향');

  const parts: string[] = [
    'MBTI는 검사 결과가 아니라 직접 알려주신 값입니다.',
    '이 앱은 성격 검사를 제공하지 않으니, 아래 내용은 진단이 아니라 자기 인식을 옮긴 것으로 읽어 주세요.',
  ];
  const used: string[] = [card.id];

  /*
   * 네 글자가 각각 어떤 축의 어느 쪽인지 — 축 카드 4장이 정의를 들고 있다(05 §1-1).
   * **코드 글자 순서로** 훑는다(카드 id 순이 아니다). ENFP 를 E·J·N·F 순으로 늘어놓으면
   * 사용자가 자기 코드와 눈으로 맞춰 볼 수 없다.
   * 알파벳 뒤에는 조사를 붙이지 않는다 — `N` 을 "엔"으로 읽으면 받침이 있고 `E` 는 없다.
   */
  const axisCards = cards.filter((c) => c.kind === 'mbti' && c.key.startsWith('축:'));
  const axes: string[] = [];
  for (const letter of code) {
    for (const axisCard of axisCards) {
      const text = mbtiAxisGlossOf(axisCard)?.get(letter);
      if (text === undefined) continue;
      axes.push(`${letter} ${text}`);
      used.push(axisCard.id);
      break;
    }
  }
  if (axes.length > 0) parts.push(`네 글자를 축으로 풀면 이렇습니다 — ${axes.join(', ')}.`);

  // 스택 값 끝에는 `(기질 NT)` 같은 괄호가 붙는다 — `…입니다` 를 이어 붙이면 문장이 어색해서 대시로 받는다.
  if (stack !== undefined) parts.push(`${code}의 인지기능 스택은 이렇게 정리돼요 — ${stack}.`);
  // 주기능 카드는 그 기능이 무엇을 하는 기능인지의 한 줄 정의를 들고 있다.
  const dominant = stack === undefined ? undefined : /(?:^|\s)주\s+([A-Z][a-z])/.exec(stack)?.[1];
  const dominantCard = dominant === undefined ? undefined : cardOf(cards, `mbti:인지기능:${dominant}`);
  if (dominantCard !== undefined) {
    // 제목 `Ne 외향 직관 (Extraverted Intuition)` → 코드 + 한국어 이름. 영문 정식명은 쓰지 않는다.
    const named = /^(\S+)\s+([^(]+?)\s*\(/.exec(dominantCard.title);
    const meaning = firstFieldValueOf(dominantCard);
    if (named !== null && meaning !== undefined) {
      parts.push(`맨 앞의 주기능은 ${named[1] ?? ''}(${named[2] ?? ''})입니다 — ${meaning}.`);
      used.push(dominantCard.id);
    }
  }
  if (strong !== undefined && weak !== undefined) {
    parts.push(`강점은 ${strong} 쪽이고, 조심하면 좋은 쪽은 ${weak}입니다.`);
  } else if (strong !== undefined) {
    parts.push(`강점은 ${strong} 쪽입니다.`);
  }
  if (job !== undefined) parts.push(`일의 재료로는 ${iGa(job)} 꼽힙니다.`);
  // 카드 값이 `효율 중시. 소수·깊이. 애정표현 학습형` 처럼 마침표로 끊겨 있어 쉼표로 이어 붙인다.
  if (love !== undefined) parts.push(`가까운 관계에서는 ${love.replace(/\.\s*/g, ', ')} 쪽으로 이야기돼요.`);
  parts.push(
    '사주 쪽 기운과 이 유형이 다르게 읽힌다면 어느 하나가 틀린 것이 아니라, 타고난 결과 지금까지 만들어 온 방식이 서로 다른 층에 있다는 뜻으로 봐 주세요.',
  );
  return { id: 'mbti', body: parts.join(' '), cardIds: used };
}

/**
 * MBTI 4축 카드에서 **글자 → 한 줄 정의**를 읽는다.
 * `E Extraversion ↔ I Introversion — 바깥을 향하는가 / 안을 향하는가 . 16Personalities …`
 *   → `{ E: '바깥을 향하는가', I: '안을 향하는가' }`
 *
 * 라벨이 카드마다 다르므로(축 이름이 곧 라벨이다) 첫 항목 하나만 읽고, 값은 첫 마침표 앞까지 자른다 —
 * 뒤에는 카드가 붙여 둔 상표 주의 문장이 이어져 있고 그건 축의 정의가 아니다.
 */
function mbtiAxisGlossOf(card: KnowledgeCard): ReadonlyMap<string, string> | null {
  const first = [...fieldsOf(card).entries()][0];
  if (first === undefined) return null;
  const [label, rawValue] = first;
  const letters = /^([EISNTFJP])\b[^↔]*↔\s*([EISNTFJP])\b/.exec(label);
  if (letters === null) return null;
  const halves = (rawValue.split('.')[0] ?? '').split(' / ').map((s) => s.trim());
  const a = halves[0];
  const b = halves[1];
  if (a === undefined || b === undefined || a === '' || b === '') return null;
  return new Map([
    [letters[1] ?? '', a],
    [letters[2] ?? '', b],
  ]);
}

/** 카드 본문의 첫 `라벨 — 값` 항목의 값. 라벨이 카드마다 달라 이름으로 집을 수 없을 때 쓴다. */
function firstFieldValueOf(card: KnowledgeCard): string | undefined {
  const first = [...fieldsOf(card).values()][0];
  return first === undefined || first === '' ? undefined : first;
}

/** ⑥ 혈액형 — 말투만. 성격 판정에 쓰지 않는다는 사실을 본문에서 밝힌다. */
function draftBlood(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const blood = fact.blood;
  if (blood === null) return null;
  const card = cardOf(cards, `blood:문체:${blood}`);
  const label = card === undefined ? null : toneLabelOf(card);
  if (card === undefined || label === null) return null;

  return {
    id: 'blood',
    body: [
      '혈액형은 이 리포트에서 성격을 판정하지 않습니다.',
      '혈액형과 성격의 관계는 확인된 근거가 없어서, 여기서 혈액형이 정하는 것은 문장의 말투 하나뿐이에요.',
      `알려주신 ${blood}형에 맞춰 이 리포트는 ${label} 썼습니다.`,
      '그래서 이 항목은 당신에 대한 결론이 아니라, 당신에게 말을 거는 방식이라고 보시면 돼요.',
    ].join(' '),
    cardIds: [card.id],
  };
}

/* ─────────────────────────── 별자리 ─────────────────────────── */

/**
 * ⑧ 별자리 — S7 결과.
 *
 * 사인 이름·원소는 엔진(황경 계산)이 확정하고, 그 사인이 무엇을 뜻하는지는 카드가 말한다.
 * **중복성 고지가 이 섹션의 필수 부품이다**: 태양궁은 사주 월지를 약 15일 시프트한 같은 12분할이라
 * (문서10 §2.6) 그 사실을 빼면 "정보가 하나 더 늘었다"로 읽힌다.
 */
function draftZodiac(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const astro = fact.astro;
  if (astro === null) return null;
  const signCard = cardOf(cards, `zodiac:${astro.sunSignId}`);
  const elementCard = cardOf(cards, `zodiac:원소:${astro.sunElement}`);
  if (signCard === undefined && elementCard === undefined) return null;
  const used: string[] = [];

  const parts: string[] = [
    '별자리는 태어난 순간 태양이 놓여 있던 황도 12분할 자리입니다.',
    astro.sunAlsoSignKo === null
      ? `당신의 태양 별자리는 ${astro.sunSignKo}입니다.`
      : `당신의 태양 별자리는 ${astro.sunSignKo}인데, 경계에 가까워서 ${astro.sunAlsoSignKo} 쪽도 함께 봐야 해요.`,
  ];

  if (signCard !== undefined) {
    const f = slashFieldsOf(signCard);
    const element = usableField(f, '원소');
    const modality = usableField(f, '특질');
    const ruler = usableField(f, '지배행성');
    const symbol = usableField(f, '상징');
    const traits = [
      element === undefined ? '' : `원소는 ${element}`,
      modality === undefined ? '' : `특질은 ${modality}`,
      ruler === undefined ? '' : `지배행성은 ${trimTrailingParen(ruler)}`,
    ].filter((s) => s !== '');
    if (traits.length > 0) parts.push(`${traits.join(', ')}입니다.`);
    if (symbol !== undefined) parts.push(`상징으로 쓰는 그림은 ${yeyo(symbol)}.`);
    used.push(signCard.id);
  }

  if (elementCard !== undefined) {
    const letter = zodiacElementLetterOf(elementCard);
    // 값 끝의 괄호 주석(`… (같은 원소끼리는 정확히 120° 트라인)`)을 떼고 쉼표로 잇는다.
    const siblings = usableField(fieldsOf(elementCard), '소속 사인');
    if (letter !== null) {
      parts.push(`이 원소를 MBTI 쪽 어휘로 옮기면 ${letter.label} 자리에 대응합니다.`);
    }
    if (siblings !== undefined) {
      parts.push(
        `같은 원소를 쓰는 사인은 ${commaJoin(trimTrailingParen(siblings))}이고, 셋은 서로 120도 간격이에요.`,
      );
    }
    used.push(elementCard.id);
  }

  if (astro.moonSignKo !== null) {
    parts.push(
      astro.moonAssumedNoon
        ? `달 별자리는 ${astro.moonSignKo}로 잡혔지만, 태어난 시각을 몰라 낮 12시를 가정한 값이에요. 달은 하루에 한 궁 가까이 움직여서 이 자리는 흔들릴 수 있습니다.`
        : `달 별자리는 ${astro.moonSignKo}입니다.`,
    );
    if (astro.moonAlsoSignKo !== null) {
      parts.push(`경계에 걸쳐 있어 ${astro.moonAlsoSignKo} 쪽도 함께 적어 둘게요.`);
    }
  }

  // 중복성 고지. 카드 본문의 주장(약 15일 위상차의 같은 분할)을 이 리포트의 말투로 옮긴 문장이다.
  const overlapCard = cardOf(cards, 'fusion:통합:별자리중복');
  if (overlapCard !== undefined) {
    parts.push(
      '별자리는 사주의 월지와 약 15일 어긋난 같은 12분할입니다.',
      '그래서 여기서 늘어나는 건 정보가 아니라 어휘예요 — 같은 계절을 서양식 이름으로 한 번 더 부르는 자리입니다.',
    );
    used.push(overlapCard.id);
  }
  return { id: 'zodiac', body: parts.join(' '), cardIds: used };
}

/* ─────────────────────────── 융합(교집합 · 충돌) ─────────────────────────── */

/**
 * 한 축의 비교 결과. **여기에 점수는 없다.**
 *
 * 문서10 §3.2 는 일치도(Coherence)를 0~100 으로 계산하라고 하지만, 그 값의 정의는 C00 에 없다.
 * 팩트팩 규율("C00 에 정의가 없는 지표는 여기서 만들지 않는다")에 정면으로 걸리므로 **점수를 만들지 않고**
 * 글자 하나의 같고 다름만 본다. 대응표는 전부 카드가 들고 있고 이 파일은 읽어서 견주기만 한다.
 */
interface AxisView {
  /** 충돌 카드의 key 와 같은 이름. 근거 카드를 찾는 열쇠다. */
  readonly pattern: string;
  /** 왼쪽(사주 또는 별자리) 표기. `E(외향)` 처럼 카드 문자열 그대로다. */
  readonly leftLabel: string;
  readonly left: string;
  /** 오른쪽(자기신고 MBTI 또는 월지) 표기. */
  readonly rightLabel: string;
  readonly right: string;
  readonly agree: boolean;
  readonly cardIds: readonly string[];
}

/**
 * 오행 ↔ MBTI 축 카드에서 **E/I 글자 하나**를 읽는다.
 * `학술 근거 매핑 — E(외향) ↑ (근거: …)` → `{ letter: 'E', label: 'E(외향)' }`, 土(중립)는 null.
 *
 * 학술 근거가 붙은 앞부분만 쓰고 `확장 매핑(제품용)`([창작 필요])은 OMITTED_FIELDS 로 막았다.
 * 화(火)·금(金)은 S 도 함께 달고 있지만 여기서 보는 축은 EI 하나다 — 문서10 §3.3 의
 * 「사주 vs MBTI 상충」예시가 EI 축이고, S/N 축은 별자리 원소 쪽이 맡는다.
 */
function sajuAxisLetterOf(card: KnowledgeCard): { readonly letter: string; readonly label: string } | null {
  const mapping = usableField(fieldsOf(card), '학술 근거 매핑');
  if (mapping === undefined) return null;
  const matched = /(^|[\s,])([EI])\(([^()]+)\)/.exec(mapping);
  const letter = matched?.[2];
  if (letter === undefined) return null;
  return { letter, label: `${letter}(${matched?.[3] ?? ''})` };
}

/**
 * 별자리 4원소 카드에서 융 4기능 글자를 읽는다.
 * 제목 `흙 원소(earth) — MBTI S (감각)` → `{ letter: 'S', label: 'S (감각)' }`.
 * (본문의 `채택 매핑` 줄에도 같은 표가 있지만, 제목 쪽이 그 원소 **하나**만 담고 있어 오독 여지가 없다.)
 */
function zodiacElementLetterOf(card: KnowledgeCard): { readonly letter: string; readonly label: string } | null {
  const matched = /MBTI\s+([NSTF])\s*(\([^()]*\))?/.exec(card.title);
  const letter = matched?.[1];
  if (letter === undefined) return null;
  // 오행 카드 쪽 표기(`E(외향)`)와 모양을 맞춘다 — 두 라벨이 같은 문장에서 나란히 나온다.
  return { letter, label: `${letter}${matched?.[2] ?? ''}` };
}

/** 융 4기능 글자가 MBTI 코드의 몇 번째 자리와 겨루는가. N/S 는 두 번째, T/F 는 세 번째. */
function mbtiSlotOfJungLetter(letter: string): number | null {
  if (letter === 'N' || letter === 'S') return 1;
  if (letter === 'T' || letter === 'F') return 2;
  return null;
}

/**
 * 네 체계를 견줄 수 있는 축을 전부 모은다. 순서는 고정(사주↔MBTI → 별자리↔MBTI → 사주 내부)이다.
 * 비교가 성립하지 않으면(대응 카드가 없거나 오행이 중립이거나 자기신고 값이 없으면) 그 축은 빠진다 —
 * "비교했는데 같았다"와 "비교할 수 없었다"는 다른 사실이다.
 */
function axisViewsOf(fact: FactPack, cards: readonly KnowledgeCard[]): readonly AxisView[] {
  const out: AxisView[] = [];
  const dayCard = cardOf(cards, `fusion:오행MBTI:${elementCardKey(fact.saju.dayElement)}`);
  const monthCard = cardOf(cards, `fusion:오행MBTI:${elementCardKey(fact.saju.monthElement)}`);
  const day = dayCard === undefined ? null : sajuAxisLetterOf(dayCard);
  const month = monthCard === undefined ? null : sajuAxisLetterOf(monthCard);
  const mbti = fact.mbti;

  // ① 타고난 기운(일간 오행) vs 자기신고 유형의 첫 글자.
  const sajuVsMbti = cardOf(cards, 'fusion:충돌:사주 vs MBTI 상충');
  if (day !== null && dayCard !== undefined && mbti !== null && sajuVsMbti !== undefined) {
    const right = mbti.slice(0, 1);
    out.push({
      pattern: '사주 vs MBTI 상충',
      leftLabel: day.label,
      left: day.letter,
      rightLabel: right,
      right,
      agree: day.letter === right,
      cardIds: [dayCard.id, sajuVsMbti.id],
    });
  }

  // ② 별자리 원소(융 4기능) vs 자기신고 유형의 대응 글자.
  const zodiacVsMbti = cardOf(cards, 'fusion:충돌:별자리 원소 vs MBTI');
  const elementCard =
    fact.astro === null ? undefined : cardOf(cards, `zodiac:원소:${fact.astro.sunElement}`);
  const zodiacLetter = elementCard === undefined ? null : zodiacElementLetterOf(elementCard);
  const slot = zodiacLetter === null ? null : mbtiSlotOfJungLetter(zodiacLetter.letter);
  if (
    zodiacLetter !== null &&
    elementCard !== undefined &&
    slot !== null &&
    mbti !== null &&
    zodiacVsMbti !== undefined
  ) {
    const right = mbti.slice(slot, slot + 1);
    out.push({
      pattern: '별자리 원소 vs MBTI',
      leftLabel: zodiacLetter.label,
      left: zodiacLetter.letter,
      rightLabel: right,
      right,
      agree: zodiacLetter.letter === right,
      cardIds: [elementCard.id, zodiacVsMbti.id],
    });
  }

  // ③ 사주 안쪽 — 일간 오행(타고난 결) vs 월지 오행(태어난 계절).
  const inner = cardOf(cards, 'fusion:충돌:사주 내부 상충');
  if (day !== null && month !== null && dayCard !== undefined && monthCard !== undefined && inner !== undefined) {
    out.push({
      pattern: '사주 내부 상충',
      leftLabel: day.label,
      left: day.letter,
      rightLabel: month.label,
      right: month.letter,
      agree: day.letter === month.letter,
      cardIds: [dayCard.id, monthCard.id, inner.id],
    });
  }
  return out;
}

/** 오행 한 글자 → 융합 카드 key 조각. 카드 key 는 문서10 §2.1 표기(`목(木)`)를 그대로 쓴다. */
function elementCardKey(element: Element): string {
  return `${ELEMENT_KO[element]}(${element})`;
}

/** 융합 카드 key 에 쓰이는 오행 한글 표기. 태그(`fusionElement:木`)와 달리 key 는 문서 표기다. */
const ELEMENT_KO: Readonly<Record<Element, string>> = {
  木: '목',
  火: '화',
  土: '토',
  金: '금',
  水: '수',
};

/** 축 이름 그대로의 사람 말. 「사주 vs MBTI 상충」 같은 카드 key 를 화면에 그대로 내보내지 않는다. */
const AXIS_PAIR_LABEL: Readonly<Record<string, readonly [string, string]>> = {
  '사주 vs MBTI 상충': ['타고난 기운', '알려주신 유형'],
  '별자리 원소 vs MBTI': ['별자리 원소', '알려주신 유형'],
  '사주 내부 상충': ['타고난 결(일간)', '태어난 계절(월지)'],
};

function axisPairOf(pattern: string): readonly [string, string] {
  return AXIS_PAIR_LABEL[pattern] ?? ['한쪽', '다른 쪽'];
}

/** 충돌 카드의 `서술 전략 — "타고남 vs 만들어진 나" 프레임` 에서 프레임 이름만. */
function frameNameOf(card: KnowledgeCard): string | undefined {
  const strategy = usableField(fieldsOf(card), '서술 전략');
  if (strategy === undefined) return undefined;
  return strategy.replace(/["'“”]/g, '').replace(/\s*프레임\s*$/, '').trim() || undefined;
}

/**
 * 공통 키워드에 참여하는 체계와 그 표기. **혈액형은 없다** — 문서10 §3.1 이 혈액형 가중치를 0 으로
 * 두고(A3/A4 반증) 이 리포트도 혈액형으로 성격을 말하지 않는데, 혈액형 카드의 통념 키워드가
 * 교집합에 섞이면 바로 그 짓을 하게 된다. 융합 카드도 없다 — 서술 규칙이지 사용자의 사실이 아니다.
 */
const KEYWORD_SYSTEMS: Readonly<Record<string, string>> = {
  saju: '사주',
  zodiac: '별자리',
  mbti: 'MBTI',
};
const KEYWORD_SYSTEM_ORDER: readonly string[] = ['사주', '별자리', 'MBTI'];

/**
 * 체계 간 공통 키워드(문서10 §3.4). **배지 숫자를 만들지 않는다** — "3/4" 같은 표기는 우리가 만든
 * 지표로 읽히므로, 어떤 체계가 같은 말을 했는지 이름으로만 적는다.
 *
 * 후보는 검색된 카드의 `keywords` 뿐이고, 두 체계 **이상**에서 똑같이 등장한 낱말만 남긴다.
 * 두 겹의 거름을 둔다:
 *   ① **두 글자 이상 한글만.** `S`·`Ne`·`Taurus` 같은 표기 코드가 체계를 넘어 겹치는 걸 막고,
 *      동시에 MBTI 카드의 자체 별칭(`불꽃 탐험가` — 공백 포함)이 새어 나가는 경로를 막는다.
 *   ② **자기 카드 제목에 들어 있는 낱말 제외.** `겁재`·`황소자리`처럼 이름 자체인 키워드는
 *      "두 체계가 같은 말을 했다"의 근거가 아니라 그냥 그 카드의 이름이다.
 */
function sharedKeywordsOf(
  fact: FactPack,
  cards: readonly KnowledgeCard[],
): readonly { readonly word: string; readonly systems: readonly string[] }[] {
  const bySystem = new Map<string, Set<string>>();
  const presentSipsin = new Set<string>(fact.saju.tenGodNames);
  for (const card of cards) {
    // 원국에 없는 십신 카드는 그룹 태그로 딸려 온 것이라 이 사람의 사실이 아니다.
    if (card.kind === 'sipsin' && !presentSipsin.has(card.key)) continue;
    const system = KEYWORD_SYSTEMS[systemOfKind(card.kind)];
    if (system === undefined) continue;
    for (const raw of card.keywords) {
      const word = raw.trim();
      if (!/^[가-힣]{2,}$/.test(word) || card.title.includes(word)) continue;
      if (!bySystem.has(word)) bySystem.set(word, new Set());
      bySystem.get(word)?.add(system);
    }
  }
  const out: { word: string; systems: string[] }[] = [];
  for (const [word, systems] of bySystem) {
    if (systems.size < 2) continue;
    // 체계 순서를 고정한다(Set 삽입 순서에 기대면 카드 배열 순서가 문장을 흔든다).
    out.push({ word, systems: KEYWORD_SYSTEM_ORDER.filter((s) => systems.has(s)) });
  }
  // 많이 겹친 낱말 먼저, 동수면 코드포인트 순. 정렬 키가 둘 다 값이라 결정론이 유지된다.
  out.sort((a, b) => b.systems.length - a.systems.length || compareCodepoint(a.word, b.word));
  return out;
}

/**
 * ⑪ 교집합 — 서로 다른 체계가 **같은 쪽**을 가리킨 지점.
 *
 * 견줄 축이 하나도 없고 공통 낱말도 없으면 섹션을 만들지 않는다. 그 상태에서 "네 체계가 공통으로
 * 가리키는 당신" 이라는 제목을 붙이면 제목 자체가 거짓이 된다.
 */
function draftIntersection(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const agreed = axisViewsOf(fact, cards).filter((v) => v.agree);
  const shared = sharedKeywordsOf(fact, cards).slice(0, 3);
  if (agreed.length === 0 && shared.length === 0) return null;
  const used: string[] = [];

  const parts: string[] = [
    '여기서부터는 체계를 가로질러 봅니다.',
    '사주·별자리·MBTI는 서로 다른 자리에서 나온 이야기라, 겹치는 지점이 있으면 그쪽은 상황이 바뀌어도 잘 흔들리지 않는 편이에요.',
  ];

  for (const view of agreed) {
    const [left, right] = axisPairOf(view.pattern);
    parts.push(`${left} 쪽과 ${right} 쪽이 같은 방향을 가리킵니다 — ${view.leftLabel} 자리예요.`);
    for (const id of view.cardIds) used.push(id);
  }

  if (shared.length > 0) {
    const listed = shared.map((s) => `${s.word}(${s.systems.join('·')})`).join(', ');
    parts.push(`쓰는 낱말이 겹치는 곳도 있어요 — ${listed}.`);
    const badgeCard = cardOf(cards, 'fusion:통합:교집합');
    if (badgeCard !== undefined) {
      parts.push('두 체계 이상에서 같은 말이 나온 것만 골랐고, 한 체계에서만 나온 말은 뺐습니다.');
      used.push(badgeCard.id);
    }
  }

  const tail = crossSystemCaveat(cards);
  parts.push(...tail.parts);
  used.push(...tail.cardIds);
  return { id: 'intersection', body: parts.join(' '), cardIds: used };
}

/**
 * 체계를 가로지르는 섹션이 반드시 함께 밝혀야 하는 두 가지 —
 * ① 혈액형은 합산에 들어가지 않는다(문서10 §3.1, 가중치 0) ② 세 체계 각각의 한계(면책 카드).
 *
 * `intersection` 이 있으면 거기서, 없으면 `conflict` 가 대신 말한다. 두 섹션이 다 없는 경우는
 * 견줄 축이 하나도 없는 사주(예: 土 일간 + 자기신고 없음)이고, 그때는 가로지르는 이야기 자체가 없다.
 */
function crossSystemCaveat(cards: readonly KnowledgeCard[]): {
  readonly parts: readonly string[];
  readonly cardIds: readonly string[];
} {
  const parts: string[] = [];
  const cardIds: string[] = [];
  const weightCard = cardOf(cards, 'fusion:통합:가중치');
  if (weightCard !== undefined) {
    parts.push('혈액형은 이 비교에 들어가지 않습니다. 이 리포트에서 혈액형이 맡은 일은 말투 하나뿐이에요.');
    cardIds.push(weightCard.id);
  }
  const disclaimerCard = cardOf(cards, 'blood:면책');
  if (disclaimerCard !== undefined) {
    parts.push(
      'MBTI는 검사 결과가 아니라 알려주신 값이고, 별자리는 즐길거리로 보는 자리이며, 혈액형과 성격의 관계는 확인된 근거가 없습니다.',
      '세 가지를 함께 놓고 읽는 이유는 정확도를 높이려는 게 아니라 한 가지 어휘에 갇히지 않으려는 데 있어요.',
    );
    cardIds.push(disclaimerCard.id);
  }
  return { parts, cardIds };
}

/**
 * ⑫ 충돌 — 체계끼리 다른 쪽을 가리킨 지점.
 *
 * 문서10 §3.3 3원칙: 모순을 결함이 아니라 **층(layer)** 으로 번역하고, 시간축·상황축으로 나눈다.
 * **어느 하나를 부정하지 않는다** — "사주가 맞고 MBTI가 틀렸다" 는 말은 이 섹션에서 나오지 않는다.
 *
 * 어긋난 축이 하나도 없으면 섹션을 만들지 않는다(제목이 "어긋나는 지점"이다). 혈액형 문단은
 * 곁다리라 단독으로 섹션을 세우지 않는다 — 그 처리 지침 자체가 "언급하지 않음"이기 때문이다.
 *
 * 어긋난 축이 여럿이어도 **한 가지만** 짚는다. 제목이 "딱 하나"이기도 하고, 어긋남을 줄줄이 나열하면
 * §6.4 의 긍정6:중립3:주의1 비율이 무너진다. 어느 것을 고르는가는 `axisViewsOf` 의 고정 순서가
 * 정한다 — 크기를 재서 고르면 그 순간 우리가 만들지 않기로 한 "일치도 점수"가 뒷문으로 들어온다.
 */
function draftConflict(fact: FactPack, cards: readonly KnowledgeCard[]): Draft | null {
  const clashes = axisViewsOf(fact, cards).filter((v) => !v.agree);
  const view = clashes[0];
  if (view === undefined) return null;
  const used: string[] = [];

  const [left, right] = axisPairOf(view.pattern);
  const parts: string[] = [
    '한편 방향이 갈리는 자리도 있어요.',
    `${left} 쪽은 ${view.leftLabel} 방향인데, ${right} 쪽은 ${view.rightLabel} 방향입니다.`,
  ];
  const card = cardOf(cards, `fusion:충돌:${view.pattern}`);
  const frame = card === undefined ? undefined : frameNameOf(card);
  // 프레임 이름에 쉼표가 든 것도 있어서(`판단은 머리, 결정은 마음`) 따옴표로 묶어 문장에서 떼어 놓는다.
  if (frame !== undefined) parts.push(`이 어긋남을 읽는 틀은 ‘${frame}’입니다.`);
  for (const id of view.cardIds) used.push(id);
  if (clashes.length > 1) {
    parts.push('다른 축에서도 결이 갈리지만, 한 번에 하나씩 보는 편이 읽기 쉬워요.');
  }

  parts.push(
    '어느 한쪽이 틀린 것이 아니라 결이 다른 층입니다.',
    '평소와 중요한 순간, 일할 때와 가까운 사람과 있을 때로 나눠 보면 두 쪽이 다 사실인 경우가 많아요.',
  );

  const bloodCard = cardOf(cards, 'fusion:충돌:혈액형 통념 vs 결과');
  if (bloodCard !== undefined && fact.blood !== null) {
    parts.push(
      '혈액형은 이 비교에서 뺐습니다. 통념과 결과가 달라 보여도 그 어긋남은 이야기하지 않는 쪽이 맞아요.',
    );
    used.push(bloodCard.id);
  }
  // 교집합 섹션이 서지 않는 사주라면 가로지르는 고지를 여기서 대신 한다(둘 다 서면 중복이 된다).
  if (draftIntersection(fact, cards) === null) {
    const tail = crossSystemCaveat(cards);
    parts.push(...tail.parts);
    used.push(...tail.cardIds);
  }
  return { id: 'conflict', body: parts.join(' '), cardIds: used };
}

/* ─────────────────────────── 헤드라인 · 행동 제안 ─────────────────────────── */

/**
 * 헤드라인. 세 조각 모두 계산 결과이며 여기서 새로 판정하는 것은 없다.
 * 신강신약 등급은 S5 가 있을 때만 끼운다 — 없으면 예전 두 조각 그대로다(`HEADLINE_MAX` 60자 안).
 */
function headlineOf(fact: FactPack, cards: readonly KnowledgeCard[]): string {
  const s = fact.saju;
  const card = cardOf(cards, `ilgan:${s.dayStem}`);
  const head = card === undefined ? s.dayStem : titleHead(card);
  const grade = s.strength === null ? '' : `${s.strength.strengthGrade} · `;
  return `${head} 일간 · ${grade}${s.dominantTenGod} 쪽이 두터운 사주`;
}

/**
 * 오늘의 행동 한 가지. 문서10 §6.2 ④ 항목이며 §6.4 가 요구하는 "주의 문장과 세트"에 해당한다.
 * 명사 슬롯은 카드에서 오고, 문장 골격만 이 파일 것이다.
 */
function actionOf(fact: FactPack, cards: readonly KnowledgeCard[]): string {
  const present = new Set<string>(fact.saju.tenGodNames);
  const card = cards.find((c) => c.kind === 'sipsin' && present.has(c.key));
  if (card !== undefined) {
    const f = fieldsOf(card);
    const strong = f.get('강점');
    const caution = f.get('주의') ?? f.get('약점');
    if (strong !== undefined && caution !== undefined) {
      return `오늘은 ${eulReul(firstItem(strong))} 쓸 일 하나를 먼저 끝내고, ${iGa(
        firstItem(caution),
      )} 나올 만한 자리에서는 결정을 하루 미뤄 보세요.`;
    }
  }
  return '오늘은 하루를 시작하는 30분보다, 끝내는 30분을 먼저 정해 보세요.';
}

/**
 * 섹션 id → 초안. `SECTION_ORDER` 에 없는 id 는 여기서도 `null` 이라 두 목록이 어긋나도 조용히 늘지 않는다.
 * (분기를 `renderTemplateReport` 안의 삼항 사슬로 두면 섹션이 늘 때마다 한 줄이 더 깊어진다.)
 */
function draftOf(
  id: SectionId,
  fact: FactPack,
  cards: readonly KnowledgeCard[],
  tone: Tone,
): Draft | null {
  switch (id) {
    case 'saju':
      return draftSaju(fact, cards, tone);
    case 'sipsin':
      return draftSipsin(fact, cards);
    case 'jiji':
      return draftJiji(fact, cards);
    case 'sinsal':
      return draftSinsal(fact, cards);
    case 'strength':
      return draftStrength(fact, cards);
    case 'luck':
      return draftLuck(fact, cards);
    case 'zodiac':
      return draftZodiac(fact, cards);
    case 'mbti':
      return draftMbti(fact, cards);
    case 'blood':
      return draftBlood(fact, cards);
    case 'intersection':
      return draftIntersection(fact, cards);
    case 'conflict':
      return draftConflict(fact, cards);
    default:
      return null;
  }
}

/* ─────────────────────────── 공개 API ─────────────────────────── */

/**
 * 팩트팩 + 검색된 카드 → 리포트.
 *
 * @param fact  `buildFactPack()` 결과. 여기 없는 사실은 문장에 등장하지 않는다.
 * @param cards `selectKnowledgeCards()` 결과. 카드가 없으면 해당 섹션이 사라진다(빈 섹션을 만들지 않는다).
 *
 * 반환값의 `sections` 는 비어 있을 수 있다 — 지식카드가 하나도 매칭되지 않고 대운도 없는 경우다.
 * 호출부는 그 상태를 "리포트 없음"으로 다뤄야 한다(`features/report` 가 그렇게 한다).
 */
export function renderTemplateReport(
  fact: FactPack,
  cards: readonly KnowledgeCard[],
): Interpretation {
  const tone = fact.blood === null ? NEUTRAL_TONE : (TONE_BY_BLOOD[fact.blood] ?? NEUTRAL_TONE);

  const drafts: Draft[] = [];
  for (const id of SECTION_ORDER) {
    const draft = draftOf(id, fact, cards, tone);
    if (draft !== null) drafts.push(draft);
  }

  // 닫는 한마디는 마지막 섹션 끝에 붙인다(어조 슬롯 2개 중 하나 — TONE_BY_BLOOD 주석 참고).
  const sections: InterpretationSection[] = drafts.map((d, i) => ({
    id: d.id,
    body: i === drafts.length - 1 ? `${d.body} ${tone.close}` : d.body,
  }));

  const usedCardIds: string[] = [];
  for (const d of drafts) {
    for (const id of d.cardIds) {
      if (!usedCardIds.includes(id)) usedCardIds.push(id);
    }
  }

  return {
    headline: headlineOf(fact, cards),
    sections,
    actionToday: actionOf(fact, cards),
    usedCardIds,
  };
}
