// 지식카드 타입 — 근거: docs/research/calc/C00 §4.1 A12(해석 텍스트는 엔진과 분리), C03·C04·C05·C06·C07, docs/research/05·06·10
//
// ⚠️ 이 지식베이스는 사주 "계산"에 관여하지 않는다. 계산은 결정론적 엔진 코드가 담당하고,
//    여기 카드는 계산 결과를 사람이 읽을 문장으로 바꿀 때의 근거 재료로만 쓴다.

/**
 * 카드 분류.
 *
 * `jiji`·`unseong` 은 원 명세의 9종에 추가된 것이다. 12지지(띠·지장간)와 십이운성은
 * 해석 서술에서 독립 축으로 쓰이는데 기존 9종 어디에 넣어도 의미가 뒤틀려서 별도 kind 로 뒀다.
 */
export type KnowledgeKind =
  | 'ilgan'
  | 'jiji'
  | 'sipsin'
  | 'unseong'
  | 'sinsal'
  | 'yongsin'
  | 'daewoon'
  | 'zodiac'
  | 'mbti'
  | 'blood'
  | 'fusion';

/**
 * 근거 등급.
 * - `A` 1차 출처 확인 또는 전수 계산으로 검증된 규칙
 * - `B` 리서치 문서가 유파를 비교한 끝에 제품 채택으로 확정한 값
 * - `C` 문서에 수록돼 있으나 1차 출처를 확보하지 못한 통용 서술
 * - `D` 근거 없음 — 톤/문체 재료로만 쓰고 단정 서술 금지
 */
export type Confidence = 'A' | 'B' | 'C' | 'D';

export interface KnowledgeSource {
  /** 근거 문서 파일명 (docs/research 기준) */
  readonly doc: string;
  /** 문서 내 절 번호 */
  readonly section: string;
}

export interface KnowledgeCard {
  /** `${kind}:${key}` — 전역 유일 */
  readonly id: string;
  readonly kind: KnowledgeKind;
  /** 조회 키. 계산 엔진 출력값과 직접 맞물린다(예: '甲', '정관', '역마살', 'leo', 'INFP') */
  readonly key: string;
  readonly title: string;
  /** 한 문장 요약. 추출값을 끼운 결정론적 템플릿이며 새로운 주장을 담지 않는다 */
  readonly summary: string;
  readonly keywords: readonly string[];
  /** 서술 재료 본문(줄바꿈 구분) */
  readonly detail: string;
  /**
   * 해석 레이어 검색용 `축:값` 태그. kind/key 에서 `scripts/build-knowledge.mjs` 가 결정론적으로 만든다.
   * 손으로 적지 않는다 — 값 표기는 **계산 엔진 출력**이 정본이며(예: `zodiac:leo`, `yongsinRoute:抑扶+格局`),
   * `shared/interpret/retrieve.ts` 의 `queryTagsOf()` 와 글자 단위로 맞아야 카드가 검색된다.
   */
  readonly tags: readonly string[];
  readonly source: KnowledgeSource;
  readonly confidence: Confidence;
}

/**
 * 프롬프트에 주입할 카드 본문.
 *
 * **`detail` 을 쓴다.** `summary` 는 추출값을 끼운 결정론적 한 문장이라 팩트팩과 내용이 겹치고,
 * 같은 사실을 두 번 주면 토큰만 늘고 모델이 "카드가 근거"라고 착각할 여지가 생긴다.
 * 서술 재료로 실제로 쓸 수 있는 건 `detail` 쪽이다.
 */
export function cardBody(card: KnowledgeCard): string {
  return card.detail;
}

/**
 * 화면에 보여 줄 출처 표기.
 *
 * `source` 는 **저장소 내부 좌표**다. 프롬프트에는 그대로 넣어도 되지만(모델만 본다) 화면에 그대로
 * 찍으면 소비자 앱에 파일 경로가 노출된다. 실제로 결과 화면 "이 리포트가 참고한 자료"에
 * `C04-…-룩업테이블.md §7-12 §12-1 (+ tables.json gosinGwasuk)` 가 그대로 보이고 있었다.
 *
 * 새는 곳이 **두 군데**라는 점이 함정이다:
 *   - `doc` — 파일명 그 자체(`calc/personality-data.json`)
 *   - `section` — 뒤에 붙는 `(+ tables.json gosinGwasuk)` 상호참조. 44종 중 23종이 이 꼴이다.
 * `doc` 만 고치면 절반만 막힌다.
 *
 * 문서 번호(`C04`, `06`)는 남긴다 — 이 목록의 목적이 "이 문장이 어디서 나왔는지 되짚기"이고
 * (문서10 §5.1 설명가능성), 번호를 지우면 같은 주제의 문서 여러 개가 구분되지 않는다.
 */
export function formatSourceLabel(source: KnowledgeSource): string {
  return `${formatSourceDoc(source.doc)} ${formatSourceSection(source.section)}`.trim();
}

/** 파일명 → 읽을 수 있는 문서 이름. 디렉터리·확장자를 떼고 하이픈을 공백으로 바꾼다. */
export function formatSourceDoc(doc: string): string {
  const base = doc.slice(doc.lastIndexOf('/') + 1);
  const withoutExt = base.replace(/\.(md|json|ya?ml|txt)$/i, '');
  return withoutExt.replace(/-/g, ' ').trim();
}

/** 절 번호만 남기고 `(+ …)` 상호참조를 뗀다 — 거기에 데이터 파일명이 들어 있다. */
export function formatSourceSection(section: string): string {
  return section.replace(/\s*\([^)]*\)/g, '').trim();
}

export interface RetrieveQuery {
  /** 이 분류만 대상으로 삼는다. 생략하면 전체 */
  readonly kinds?: readonly KnowledgeKind[];
  /** 정확 키 매칭. 계산 엔진 출력(십신명·신살명·사인 id 등)을 그대로 넣는다 */
  readonly keys?: readonly string[];
  /** 키워드/본문 스코어링용 자유 검색어 */
  readonly terms?: readonly string[];
  /** 이 등급 이상만 반환(A가 가장 높음) */
  readonly minConfidence?: Confidence;
  /** 기본 12 */
  readonly limit?: number;
}

export interface ScoredCard {
  readonly card: KnowledgeCard;
  readonly score: number;
  /** 점수에 기여한 검색어/키 (디버깅·근거 표시용) */
  readonly matched: readonly string[];
}
