/**
 * 해석 레이어가 의존하는 **최소 구조 타입**.
 *
 * 근거: `docs/research/calc/C00-계산엔진-통합명세서.md` §1.2 (TypeScript 인터페이스 전량).
 *
 * 구조적(structural) 최소 타입인 이유: 해석 레이어는 차트의 일부 필드만 읽는다. 엔진 `Chart` 가
 * 이 모양의 상위집합이기만 하면 대입만으로 통합된다(`buildRequest.e2e.test.ts` 가 실제 `computeChart()`
 * 출력으로 그 대입을 고정한다).
 *
 * ⚠ **엔진 v1(SAJU-ENGINE-1.0.0)에 없는 것**: 신살(S4-2)·별자리(S7)·캐시키(§7.3).
 *   그래서 `sinsal` / `astro` / `cacheKey` 는 **옵셔널**이다. 있는 척하지 않는다 —
 *   `buildFactPack()` 이 없는 섹션을 건너뛰고 `FactPack.missingSections` 에 무엇이 빠졌는지 남긴다.
 *   `strength`(S5)는 엔진이 항상 채우지만, 이 계약은 **옵셔널로 남긴다** — 해석 레이어가 S5 이전
 *   차트(픽스처·저장된 구버전 결과)에서도 동작해야 하기 때문이다.
 */

// 엔진과 겹치는 도메인 타입은 엔진 정의를 정본으로 삼는다(두 벌이면 언젠가 어긋난다).
import type {
  Element,
  EngineWarning,
  Gender,
  PillarKey,
  TenGod,
  TenGodGroup,
  Unseong,
} from '../lib/saju/types';

export type { Element, EngineWarning, Gender, PillarKey, TenGod, TenGodGroup, Unseong };

// 지식카드는 `shared/knowledge` 의 정의가 정본이다. 해석 레이어는 재수출만 한다.
export type { Confidence, KnowledgeCard, KnowledgeKind, KnowledgeSource } from '../knowledge/types';

/** C00 §S5. 엔진 v1 미구현 — `strength` 섹션이 붙을 때 쓰인다. */
export type StrengthGrade =
  | '극신약'
  | '신약'
  | '중화신약'
  | '중화'
  | '중화신강'
  | '신강'
  | '극신강';
/** C00 §S5 용신 도출 경로. 이 표기가 태그 `yongsinRoute:*` 의 정본이다. */
export type YongsinRoute = '從/專旺' | '調候' | '抑扶+格局' | '通關';
export type BloodType = 'A' | 'B' | 'O' | 'AB';
export type SignIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** 서양점성술 4원소. C00 §S7 은 SignIdx 만 주므로 원소는 이 레이어에서 고정표로 환산한다. */
export type ZodiacElement = 'fire' | 'earth' | 'air' | 'water';

export interface PillarLike {
  readonly stem: string;
  readonly branch: string;
  readonly ganji: string;
  readonly ganjiKo: string;
}

export interface PlacementLike {
  readonly sign: SignIdx;
  readonly signKo: string;
  /**
   * 생시를 몰라 두 궁 사이에 걸릴 때 **함께 적어야 할** 다른 궁 (C00 §3-G15b).
   * 엔진은 이 사실을 경고 코드가 아니라 값으로 낸다 — 화면 문구표를 건드리지 않고 배지를 만들기 위해서다.
   * 구버전 차트에는 없으므로 옵셔널이다.
   */
  readonly alsoSignKo?: string | null;
}

/** 달 배치. 생시를 모르면 12:00 을 가정하므로(C00 §3-G15) 그 사실을 서술이 밝혀야 한다. */
export interface MoonPlacementLike extends PlacementLike {
  readonly assumedNoon?: boolean;
}

export interface DaewoonEntryLike {
  readonly index: number;
  /** C00 §1.2.8: index 0(교운 전)은 null */
  readonly ganji: string | null;
  readonly startAgeWestern: number;
  readonly endAgeWestern: number;
}

/**
 * S4-2 신살. `name` 은 지식카드 `sinsal:*` 의 key 와 글자 단위로 같다(엔진 계약).
 * `pillars` 는 히트한 기둥(연→월→일→시 고정 순서)이라 "어디에 붙었나"를 서술이 말할 수 있다.
 * 점수(`score`)는 **일부러 읽지 않는다** — 화면에 나가면 근거 없는 등급으로 읽히고, 길흉 분류는
 * 이미 카드 제목이 들고 있다.
 */
export interface SinsalLike {
  readonly sinsal: readonly {
    readonly name: string;
    readonly pillars?: readonly PillarKey[];
  }[];
}

export interface StrengthLike {
  readonly strength: {
    readonly scores: Readonly<Record<Element, number>>;
    readonly SI: number;
    readonly grade: StrengthGrade;
    readonly isStrong: boolean;
    /**
     * 得令·得地·得勢 판정 묶음. 해석 레이어가 읽는 건 **일지 십이운성 하나**다 —
     * 지식카드 `unseong:*` 12장의 유일한 조회 축이기 때문이다(C00 §S5-2 a).
     * 나머지 판정(deukryeong/deukse/…)은 서술에 쓰지 않으므로 계약에 넣지 않는다.
     */
    readonly deuk: { readonly unseongIlji: Unseong };
  };
  readonly geokguk: { readonly name: string };
  readonly yongsin: {
    readonly primary: Element;
    readonly favorable: readonly Element[];
    readonly avoid: readonly Element[];
    readonly route: YongsinRoute;
  };
}

export interface AstroLike {
  readonly sun: PlacementLike;
  readonly moon: MoonPlacementLike | null;
  readonly asc: PlacementLike | null;
}

/**
 * 해석 레이어가 읽는 차트 필드의 전부.
 * 여기에 없는 필드는 프롬프트에 절대 들어가지 않는다(= LLM 이 볼 수 없다).
 */
export interface ChartLike {
  readonly engineVersion: string;
  readonly pillars: {
    readonly year: PillarLike;
    readonly month: PillarLike;
    readonly day: PillarLike;
    readonly hour: PillarLike | null;
    readonly threePillarMode: boolean;
    readonly gz8: string;
  };
  /**
   * C00 §S4-1. 엔진에서는 `chart.tenGods` 다(`chart.sinsal.tenGods` 가 아니다).
   *
   * `byPillar` 는 **룩업 결과(이름)** 이고 `groupWeights` 는 **S5 의 오행 점수(합 80.00 / 삼주 62.00)를
   * 십신 그룹으로 접은 값**이다(C00 §S5-1). v1 의 「임시 정의(합 7.0)」는 폐기됐고 이제 배점 체계가
   * 하나뿐이라 `elementScores` 와 함께 숫자로 인용해도 된다.
   */
  readonly tenGods: {
    readonly byPillar: Readonly<
      Record<
        PillarKey,
        { readonly stem: TenGod | '일간' | null; readonly branchMain: TenGod | null }
      >
    >;
    readonly groupWeights: Readonly<Record<TenGodGroup, number>>;
  };
  readonly luck: {
    readonly daewoon: {
      /**
       * 順行 여부. 연간 음양 × 성별이 정하며(C06 §3), 지식카드 `daewoonDirection:*` 4장의 조회 축이다.
       * 이 값과 성별만 있으면 네 경우(양남/음남/양녀/음녀)가 유일하게 결정된다 — 연간 음양을 다시 읽지 않는다.
       */
      readonly forward: boolean;
      readonly pillars: readonly DaewoonEntryLike[];
    };
  };
  /** 엔진 `EngineWarning` 문자열 유니온이 정본. 코드/문구 이중 구조를 쓰지 않는다. */
  readonly warnings: readonly EngineWarning[];

  /** S4-2 신살. 엔진 v1 미구현 → 없으면 팩트팩에서 신살 섹션을 건너뛴다. */
  readonly sinsal?: SinsalLike;
  /** S5 신강신약·격국·용신. 엔진 v1 미구현. */
  readonly strength?: StrengthLike;
  /** S7 별자리. 엔진 v1 미구현. */
  readonly astro?: AstroLike;
  /** C00 §7.3 L1 캐시 키. 엔진 v1 미구현 → 없으면 `narrativeKeyOf` 가 차트에서 대체 키를 만든다. */
  readonly cacheKey?: string;
}

/**
 * 사용자 자기신고 프로필.
 * MBTI 는 **검사를 제공하지 않고 자기신고만 받는다** (문서10 §9 상표 리스크 대응).
 * 이름·닉네임·디바이스ID 는 의도적으로 없다 — C00 §7.3-6(캐시키 PII 금지)과 같은 이유로
 * 프롬프트에도 넣지 않는다.
 */
export interface UserProfile {
  readonly gender: Gender;
  readonly mbti: string | null;
  readonly blood: BloodType | null;
}

/**
 * v1 이 지원하는 리포트 종류.
 * `daily`(일진 필요)·`compat`(2인 차트)는 v1 범위 밖이다 — docs/interpretation.md 참조.
 */
export type ReportKind = 'fusion' | 'basic_saju';

/**
 * 리포트 섹션 id.
 *
 * `sipsin`·`jiji`·`sinsal` 은 규칙 기반 리포트(`template.ts`)를 위해 추가했다. 엔진이 실제로 내는
 * S4-1(십신 룩업)·S3(지지)·S4-2(신살)만으로 채울 수 있는 섹션이며, 기존 `saju` 하나에 눌러 담으면
 * 근거가 다른 이야기가 한 덩어리로 섞인다. LLM 경로의 섹션 구성(`SECTIONS_BY_KIND`)은 바뀌지 않는다 —
 * 두 경로가 **같은 스키마**를 쓰되 어떤 섹션을 채우는지는 각자 결정한다.
 */
export type SectionId =
  | 'saju'
  | 'sipsin'
  | 'jiji'
  | 'sinsal'
  | 'zodiac'
  | 'mbti'
  | 'blood'
  | 'intersection'
  | 'conflict'
  | 'strength'
  | 'luck';
