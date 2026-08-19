/**
 * S8-2 — 별자리 · MBTI · 혈액형 서브점수.
 *
 * 근거: C00 §S8-2 / C18 §3(MBTI v3) · §4(별자리 M-B) · §5(혈액형) / C00 §3-H5·H7·H11·H13·H14·H15.
 *
 * 세 축 모두 **미리 계산된 매트릭스 조회**다. 규칙(인지기능 스택·어스펙트 합성)은 C18 이
 * `compat-params.json` 을 구울 때 이미 돌렸고, 런타임이 규칙을 다시 돌리면 두 벌이 된다.
 */

import type { Gender, SignIdx } from '../saju/types';
import {
  BLOOD_BASE,
  BLOOD_EXT,
  BLOOD_GENDER_MOD,
  MBTI_MATRIX,
  MBTI_TYPE_ORDER,
  ZODIAC_ASPECTS,
  ZODIAC_MATRIX,
  ZODIAC_SIGN_IDS,
  ZODIAC_SIGN_ORDER,
} from './params';
import type { CompatBloodDetail, CompatBloodType, CompatMbtiDetail, CompatZodiacDetail } from './types';

/** 태양궁 격자의 한 칸 = 30°. 어스펙트 각도와 각거리를 잇는 유일한 상수라 여기 둔다 */
const DEGREES_PER_SIGN = 360 / 12;

// ── 별자리 ────────────────────────────────────────────────────────────────
/**
 * 각거리 `k = min(d, 12−d)` 기반. 12×12 의 자유도는 이 7값뿐이다(C08 §4.1, mybias.app 역공학).
 *
 * 오브(evidenceGrade A)는 `compat-params.json` 에 실려 있지만 **v1 은 발동하지 않는다** —
 * 이산 12×12 를 쓰기 때문이다(C00 §3-H14: 오브 연속화는 부호 경계에서 최대 40점 불연속이라 기각).
 * 그래서 여기서는 어스펙트를 **이름 표시용**으로만 조회한다.
 */
export function scoreZodiac(a: SignIdx, b: SignIdx): CompatZodiacDetail {
  const d = Math.abs(a - b);
  const k = Math.min(d, 12 - d);
  const angle = k * DEGREES_PER_SIGN;
  const aspect = ZODIAC_ASPECTS.find((asp) => asp.angle === angle) ?? null;
  return {
    signs: [a, b],
    signIds: [ZODIAC_SIGN_IDS[a]!, ZODIAC_SIGN_IDS[b]!],
    signNames: [ZODIAC_SIGN_ORDER[a]!, ZODIAC_SIGN_ORDER[b]!],
    angularDistance: k,
    aspect: aspect === null ? null : aspect.name,
    score: ZODIAC_MATRIX[a]![b]!,
  };
}

// ── MBTI ──────────────────────────────────────────────────────────────────
export function mbtiIndexOf(type: string): number {
  return MBTI_TYPE_ORDER.indexOf(type.toUpperCase());
}

/** 16유형 매트릭스 v3 조회. 둘 중 하나라도 목록에 없으면 null(= 축을 빼고 가중치 재분배) */
export function scoreMbti(a: string | null, b: string | null): CompatMbtiDetail | null {
  if (a === null || b === null) return null;
  const ia = mbtiIndexOf(a);
  const ib = mbtiIndexOf(b);
  if (ia < 0 || ib < 0) return null;

  const ta = MBTI_TYPE_ORDER[ia]!;
  const tb = MBTI_TYPE_ORDER[ib]!;
  let shared = 0;
  for (let i = 0; i < 4; i++) {
    if (ta[i] === tb[i]) shared++;
  }
  return { types: [ta, tb], score: MBTI_MATRIX[ia]![ib]!, sharedLetters: shared };
}

// ── 혈액형 ────────────────────────────────────────────────────────────────
const bloodBaseOf = (a: CompatBloodType, b: CompatBloodType): number =>
  BLOOD_BASE[`${a}|${b}`] ?? BLOOD_BASE[`${b}|${a}`]!;

/**
 * 대칭 기저 + 성별 보정 (C00 §3-H7). **동성 쌍은 대칭표만** 쓴다 — `genderMod` 는
 * '남 행 × 여 열' 로만 정의된 표라 남/여 배정이 없으면 적용할 근거가 없다(§3-H11).
 *
 * ⚠ 이 축의 evidenceGrade 는 **D 확정(개선 불가)** 이다. C18 §5 가 학술 근거 부재를 확정했고
 *   (Nawata 2014 η²<0.003), 그래도 배점에 남긴 것은 제품 결정(BL-3)이다. 그 결정에는
 *   "화면에 근거 없음을 고지한다"가 **조건으로 붙어 있다** — `features/compat/copy.ts`.
 */
export function scoreBlood(
  a: CompatBloodType | null,
  b: CompatBloodType | null,
  genderA: Gender,
  genderB: Gender,
): CompatBloodDetail | null {
  if (a === null || b === null) return null;

  const base = bloodBaseOf(a, b);
  const oppositeSex = genderA !== genderB;
  const applyMod = oppositeSex && BLOOD_EXT.genderModPolicy === 'OPPOSITE_SEX_ONLY';
  if (!applyMod) {
    return { types: [a, b], score: base, genderModApplied: false };
  }
  const male = genderA === 'M' ? a : b;
  const female = genderA === 'M' ? b : a;
  const mod = BLOOD_GENDER_MOD[`${male}|${female}`] ?? 0;
  return { types: [a, b], score: base + mod, genderModApplied: mod !== 0 };
}
