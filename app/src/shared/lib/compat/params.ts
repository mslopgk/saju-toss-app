/**
 * 궁합 배점의 단일 출처 — `compat-params.json`(C18 산출물) + `compat-params-ext.json`(C08 본문 이식분).
 *
 * 근거: C00 §S8-2(a-2) 「전 배점은 compat-params.json 으로 외부화됐다. 런타임은 이 파일만 읽는다」
 *       / C18 §9 소비 규약.
 *
 * ⛔ **이 파일에 숫자를 적지 않는다.** 여기서 하는 일은 JSON 의 형(型)을 한 번만 좁히는 것뿐이다.
 *    새 계수가 필요하면 코드가 아니라 `compat-params-ext.json` 에 넣는다(§F6 과 같은 규율).
 *
 * `compat-params.json` 은 `docs/research/calc/compat-params.json` 과 **바이트 단위로 같아야 한다** —
 * 드리프트가 생기면 C18 의 근거표와 런타임 값이 갈린다. 회귀는 `params.test.ts` 가 고정한다.
 */

import astroTables from '../../data/astro-tables.json';
import raw from '../../data/compat-params.json';
import ext from '../../data/compat-params-ext.json';
import calib from '../../data/compat-calib.json';
import type { CompatAxis } from './types';

export const COMPAT_PARAMS_VERSION: string = raw.version;
export const COMPAT_PARAMS_EXT_VERSION: string = ext.version;
export const COMPAT_CALIB_VERSION: string = calib.version;

/** 엔진 버전. 세 데이터 파일 중 하나라도 다시 구우면 올린다 (C00 §7.3 버전 정책) */
export const COMPAT_ENGINE_VERSION = `COMPAT-ENGINE-1.0.0/p${COMPAT_PARAMS_VERSION}+x${COMPAT_PARAMS_EXT_VERSION}+c${COMPAT_CALIB_VERSION}`;

// ── 4체계 가중치 (C18 §6 · C00 §3-H6) ─────────────────────────────────────
export const WEIGHTS: Readonly<Record<CompatAxis, number>> = {
  saju: raw.weights.saju,
  zodiac: raw.weights.zodiac,
  mbti: raw.weights.mbti,
  blood: raw.weights.blood,
};

// ── 사주 6항목 ────────────────────────────────────────────────────────────
export const S1 = raw.saju.S1_dayStem;
export const S1_LOOKUP = S1.lookup as Readonly<Record<string, number>>;
export const S2 = raw.saju.S2_dayBranch;
export const S2_DELTA = S2.delta as Readonly<Record<string, number>>;
export const S3 = raw.saju.S3_elementComplement;
export const S4 = raw.saju.S4_yongsinFulfillment;
export const S5 = raw.saju.S5_tenGodCross;
export const S5_LOOKUP = S5.lookup as Readonly<Record<string, number>>;
export const S6 = raw.saju.S6_yearBranch;
export const S6_DELTA = S6.delta as Readonly<Record<string, number>>;
export const SAJU_TOTAL: number = raw.saju.total;

/** C08 §3.4 의 w(chart) 정의 — C18 이 외부화하지 않은 부분 */
export const S3_EXT = ext.S3_elementComplement;
export const S3_HIDDEN_WEIGHTS = S3_EXT.hiddenStemWeights as Readonly<Record<string, readonly number[]>>;
export const S4_EXT = ext.S4_yongsinFulfillment;

// ── 별자리 (C18 §4 · C00 §3-H13/H14) ──────────────────────────────────────
export const ZODIAC_MATRIX = raw.zodiac.matrix_MB as readonly (readonly number[])[];
export const ZODIAC_SIGN_ORDER = raw.zodiac.signOrder as readonly string[];
export const ZODIAC_ASPECTS = raw.zodiac.aspects as readonly {
  name: string;
  angle: number;
  orb: number;
  points: number;
}[];
/** C18 §7 X1 — 채택된 양태(M) 모델. 'M-B' 가 아니면 matrix_MB 를 읽는 이 코드가 틀린 것이다 */
export const ZODIAC_MODALITY_ADOPTED: string = raw.zodiac.modality.adopted;
/**
 * 지식카드 `zodiac:*` 의 key('aries'). `astro-tables.json` 이 정본이고 `signOrder` 와 자리가 같다
 * (`params.test.ts` 가 두 표의 순서 일치를 고정한다).
 */
export const ZODIAC_SIGN_IDS = astroTables.signs.data.map((s) => s.id) as readonly string[];

// ── MBTI (C18 §3 · C00 §3-H5) ─────────────────────────────────────────────
export const MBTI_MATRIX = raw.mbti.matrix_v3 as readonly (readonly number[])[];
export const MBTI_TYPE_ORDER = raw.mbti.typeOrder as readonly string[];

// ── 혈액형 (C18 §5 · C00 §3-H7/H11/H15) ───────────────────────────────────
export const BLOOD_BASE = raw.blood.base_symmetric as Readonly<Record<string, number>>;
export const BLOOD_GENDER_MOD = raw.blood.genderMod as Readonly<Record<string, number>>;
export const BLOOD_UNIFORM_VALUE: number = raw.blood.recommendation.uniformValue;
/** C18 권고는 'UNIFORM'(BL-1). 본 제품 결정은 `compat-params-ext.json` 이 들고 있다 */
export const BLOOD_RECOMMENDED_ADOPT: string = raw.blood.recommendation.adopt;
export const BLOOD_EXT = ext.blood;

// ── 정규화 · 앵커 · 등급 ──────────────────────────────────────────────────
export const LOGISTIC_K: number = raw.normalization.logisticK;
/**
 * `sd < SD_ZERO_EPSILON` 이면 z2p 는 50 을 낸다 (C18 §7 X6).
 * 값 자체는 `sdZeroRule` 문자열에 갇혀 있어 여기서 한 번만 파싱한다 — 문자열을 코드가 다시 쓰지 않는다.
 */
export const SD_ZERO_RULE: string = raw.normalization.sdZeroRule;
export const SD_ZERO_EPSILON = 1e-9;

/** C18 §6.2 실측 모집단 상수. `compat-calib.json` 의 실측치와 대조된다(`params.test.ts`) */
export const POP_C18 = raw.normalization.POP_C18_seed20260812 as Readonly<
  Record<string, readonly number[]>
>;

/** 실제로 z2p 에 먹이는 (mu, sd). 본 구현체로 다시 측정한 값이다 — `tools/gen-compat-calib.mjs` */
export const POP: Readonly<Record<CompatAxis, readonly [number, number]>> = {
  saju: calib.pop.saju as [number, number],
  zodiac: calib.pop.zodiac as [number, number],
  mbti: calib.pop.mbti as [number, number],
  blood: calib.pop.blood as [number, number],
};

export const ANCHOR = raw.anchor.table as readonly (readonly number[])[];
export const BANDS = raw.bands as readonly { min: number; tag: string; name: string; observed: number }[];

/**
 * 자기신고 조합 키. MBTI·혈액형은 미입력이 정상값이라 가중치 조합이 4가지로 갈리고,
 * **조합마다 ECDF 그리드가 따로 있어야 한다**(C18 §6.4 정리의 전제 — `normalize.ts` 주석 참조).
 */
export type CompatAxisSetKey =
  | 'saju+zodiac+mbti+blood'
  | 'saju+zodiac+mbti'
  | 'saju+zodiac+blood'
  | 'saju+zodiac';

/** 조합별 101분위 ECDF 그리드. `combined` → 백분위 (C00 §S8-3) */
export const ECDF_GRIDS = calib.ecdf as Readonly<Record<CompatAxisSetKey, readonly number[]>>;
export const CALIB_META = calib.meta;

export const ROUNDING: string = ext.final.rounding;
