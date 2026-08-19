/**
 * S8 궁합 — 형(型).
 *
 * 근거: C00 §S8(통합 점수·궁합) · §3-H(유파 분기 결정표 H1~H15) / C08 §3~§8 / C18 전문.
 *
 * 설계 규약 하나만 기억하면 된다: **점수·등급은 계산이 만든다.** 문장 생성기는 여기 있는 값을
 * 읽어 문장으로 옮길 뿐이고, 새 숫자를 만들지 않는다(C00 §S8-4).
 */

import type { Branch, Chart, Element, Gender, SignIdx, Stem, TenGod } from '../saju/types';

/** 자기신고 값. 계산 입력이 아니라 **사용자가 적은 값**이라 `Chart` 와 섞지 않는다. */
export type CompatBloodType = 'A' | 'B' | 'O' | 'AB';

export interface CompatProfile {
  /** 16유형 문자열. 모르면 null → MBTI 축을 빼고 가중치를 재분배한다 */
  readonly mbti: string | null;
  readonly blood: CompatBloodType | null;
}

export const EMPTY_COMPAT_PROFILE: CompatProfile = { mbti: null, blood: null };

/**
 * 궁합이 차트에서 읽는 필드의 전부. 엔진 `Chart` 가 이 모양의 상위집합이라 그대로 대입된다.
 *
 * `Chart` 전체를 받지 않는 이유는 테스트가 아니라 **경계**다 — 여기 없는 필드를 궁합이 읽기
 * 시작하면(예: `time`·`warnings`) 같은 사주가 입력 경로에 따라 다른 점수를 받을 수 있다.
 */
export type CompatChart = Pick<Chart, 'pillars' | 'strength' | 'astro' | 'input'>;

/** 궁합 축. 미입력으로 빠질 수 있는 축이 있어 배열이 아니라 레코드로 든다 */
export type CompatAxis = 'saju' | 'zodiac' | 'mbti' | 'blood';

/** 사주 궁합 6항목 (C00 §S8-1) */
export type CompatSajuItemId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

export interface CompatSajuItem {
  readonly id: CompatSajuItemId;
  /** "일간 합충" 등 화면 라벨 */
  readonly label: string;
  /** 배점 상한 (`compat-params.json` 의 cap) */
  readonly cap: number;
  /** 0 ~ cap */
  readonly score: number;
  /** 판정 근거 라벨. 예: ['천간합'] · ['육합', '형'] — 문장 생성기가 그대로 인용한다 */
  readonly reasons: readonly string[];
}

export interface CompatSajuDetail {
  /** 0 ~ 100 */
  readonly total: number;
  readonly items: readonly CompatSajuItem[];
  readonly dayStems: readonly [Stem, Stem];
  readonly dayBranches: readonly [Branch, Branch];
  readonly yearBranches: readonly [Branch, Branch];
  /** 일간이 천간합일 때의 원전 명칭("중정지합"). 합이 아니면 null */
  readonly dayStemHeName: string | null;
  /** 일지 합이 만드는 오행. 합이 아니면 null */
  readonly dayBranchHwa: Element | null;
  /** A 가 B 의 일간을 보는 십신 / 그 역 (S5) */
  readonly crossTenGods: readonly [TenGod, TenGod];
  /** S3 결핍 보완이 일어난 오행 */
  readonly complementedElements: readonly Element[];
  /** 각자의 용신 제1순위 (S4 의 입력. C05-STD 값 그대로) */
  readonly yongsinPrimaries: readonly [Element, Element];
}

export interface CompatZodiacDetail {
  readonly signs: readonly [SignIdx, SignIdx];
  /** 지식카드 `zodiac:*` 의 key ('leo'). 서술 레이어가 인덱스를 다시 이름으로 풀지 않도록 실어 준다 */
  readonly signIds: readonly [string, string];
  readonly signNames: readonly [string, string];
  /** 각거리 k = min(d, 12−d). C08 §4.1 — 12×12 의 자유도는 이 7값뿐이다 */
  readonly angularDistance: number;
  /** 가장 가까운 어스펙트 이름. 격자상 정확히 맞는 것이 없으면 null */
  readonly aspect: string | null;
  /** 0 ~ 100 */
  readonly score: number;
}

export interface CompatMbtiDetail {
  readonly types: readonly [string, string];
  /** 0 ~ 100 (matrix_v3) */
  readonly score: number;
  /** 4축 중 같은 글자 수 */
  readonly sharedLetters: number;
}

export interface CompatBloodDetail {
  readonly types: readonly [CompatBloodType, CompatBloodType];
  /** 0 ~ 100 */
  readonly score: number;
  /** 성별 보정이 실제로 적용됐는가 (동성 쌍이면 false — C00 §3-H11) */
  readonly genderModApplied: boolean;
}

export interface CompatAxisScore {
  readonly axis: CompatAxis;
  /** 서브시스템 원점수 (0~100 스케일이지만 축마다 분포가 다르다) */
  readonly raw: number;
  /** z2p 정규화 후 0~100 */
  readonly normalized: number;
  /** 실제 적용된 가중치 (미입력 축이 있으면 재분배된 값) */
  readonly weight: number;
  /** 자기신고 미입력으로 빠진 축인가 */
  readonly present: boolean;
}

export interface CompatBand {
  /** "S" · "A+" … "D" */
  readonly tag: string;
  /** "천생연분" 등 */
  readonly name: string;
  /** 이 등급의 하한 점수 */
  readonly min: number;
  /** C18 §6.3 실측 비율 (0~1). 화면이 "상위 몇 %" 를 말할 때 쓴다 */
  readonly observed: number;
}

export interface CompatResult {
  readonly version: string;
  /** 32 ~ 99 정수 (C00 §3-H12) */
  readonly score: number;
  readonly band: CompatBand;
  /** ECDF 백분위 0~1. `score` 를 만든 중간값이라 화면이 다시 계산하지 않는다 */
  readonly percentile: number;
  /** 가중합(정규화 후, 0~100). 진단·회귀용 */
  readonly combined: number;
  readonly axes: Readonly<Record<CompatAxis, CompatAxisScore>>;
  readonly saju: CompatSajuDetail;
  readonly zodiac: CompatZodiacDetail;
  /** 둘 중 하나라도 MBTI 를 모르면 null */
  readonly mbti: CompatMbtiDetail | null;
  /** 둘 중 하나라도 혈액형을 모르면 null */
  readonly blood: CompatBloodDetail | null;
  /** 축별 기여도 = weight × normalized, 합 = combined. 화면의 "무엇이 점수를 만들었나" */
  readonly contributions: Readonly<Record<CompatAxis, number>>;
}

export type { Element, Gender };
