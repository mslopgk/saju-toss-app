import { describe, expect, it } from 'vitest';
import astroTables from '../../data/astro-tables.json';
import rawParams from '../../data/compat-params.json';
import ext from '../../data/compat-params-ext.json';
import calib from '../../data/compat-calib.json';
import {
  ANCHOR,
  BANDS,
  BLOOD_BASE,
  BLOOD_GENDER_MOD,
  ECDF_GRIDS,
  MBTI_MATRIX,
  MBTI_TYPE_ORDER,
  POP,
  POP_C18,
  WEIGHTS,
  ZODIAC_MATRIX,
  ZODIAC_MODALITY_ADOPTED,
  ZODIAC_SIGN_IDS,
  ZODIAC_SIGN_ORDER,
  type CompatAxisSetKey,
} from './params';

/**
 * 런타임 사본의 **원문**. `node:fs` 를 쓰지 않는 이유는 `App.split.test.ts` 와 같다 —
 * tsconfig.app.json 의 `types` 가 `["vite/client"]` 뿐이라 앱 타입체크에 노드 타입이 없다.
 */
const RAW_TEXT = (
  import.meta.glob('../../data/compat-params.json', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
)['../../data/compat-params.json']!;

/** FNV-1a 32bit. 암호용이 아니라 "누가 손댔는가"만 잡으면 되는 자리다 */
function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * 배점 데이터의 형·불변식 고정.
 *
 * 여기서 값을 **다시 적지 않는다** — 적으면 데이터 파일과 두 벌이 된다. 대신 "이 구조가
 * 무너지면 코드가 조용히 다른 것을 읽게 되는" 조건만 못박는다.
 */
describe('compat-params.json — C18 산출물 원본', () => {
  it('C18 원본에서 한 글자도 바뀌지 않았다 (드리프트 0)', () => {
    const fp = ext.sourceFingerprint;
    expect(rawParams.$id).toBe('compat-params.json');
    expect(RAW_TEXT.length).toBe(fp.chars);
    expect(fnv1a32(RAW_TEXT)).toBe(fp.fnv1a32);
  });

  it('4체계 가중치 합은 1이다 (C18 §6 — 50/20/20/10)', () => {
    const sum = WEIGHTS.saju + WEIGHTS.zodiac + WEIGHTS.mbti + WEIGHTS.blood;
    expect(sum).toBeCloseTo(1, 12);
    // C00 §3-H6: MBTI 0.4 는 상한 초과. 사주가 절반 이상을 쥐고 있어야 한다.
    expect(WEIGHTS.saju).toBeGreaterThanOrEqual(0.5);
    expect(WEIGHTS.mbti).toBeLessThanOrEqual(0.2);
  });

  it('사주 6항목 cap 의 합은 saju.total(100)이다', () => {
    const s = rawParams.saju;
    const sum =
      s.S1_dayStem.cap +
      s.S2_dayBranch.cap +
      s.S3_elementComplement.cap +
      s.S4_yongsinFulfillment.cap +
      s.S5_tenGodCross.cap +
      s.S6_yearBranch.cap;
    expect(sum).toBe(s.total);
  });

  it('별자리는 M-B(C18 X1)를 채택했다 — 코드가 matrix_MB 를 읽는 근거', () => {
    expect(ZODIAC_MODALITY_ADOPTED).toBe('M-B');
  });

  it('별자리 signOrder 는 엔진 SignIdx(astro-tables.signs) 순서와 같다', () => {
    const engineOrder = astroTables.signs.data.map((s) => s.ko);
    expect([...ZODIAC_SIGN_ORDER]).toEqual(engineOrder);
    // 지식카드 key 도 같은 자리여야 서술 레이어가 엉뚱한 별자리 카드를 인용하지 않는다.
    expect([...ZODIAC_SIGN_IDS]).toEqual(astroTables.signs.data.map((s) => s.id));
  });

  it('별자리 12×12 는 대칭이고 각거리만의 함수다 (C08 §4.1 자유도 7)', () => {
    expect(ZODIAC_MATRIX).toHaveLength(12);
    const byK = new Map<number, number>();
    for (let i = 0; i < 12; i++) {
      expect(ZODIAC_MATRIX[i]).toHaveLength(12);
      for (let j = 0; j < 12; j++) {
        expect(ZODIAC_MATRIX[i]![j]).toBe(ZODIAC_MATRIX[j]![i]);
        const d = Math.abs(i - j);
        const k = Math.min(d, 12 - d);
        const seen = byK.get(k);
        if (seen === undefined) byK.set(k, ZODIAC_MATRIX[i]![j]!);
        else expect(ZODIAC_MATRIX[i]![j]).toBe(seen);
      }
    }
    expect(byK.size).toBe(7);
  });

  it('MBTI 16×16 은 대칭이고 typeOrder 는 16유형 전량이다 (C18 §3.8 비대칭 0)', () => {
    expect(new Set(MBTI_TYPE_ORDER).size).toBe(16);
    for (const t of MBTI_TYPE_ORDER) expect(t).toMatch(/^[EI][SN][TF][JP]$/);
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 16; j++) {
        expect(MBTI_MATRIX[i]![j]).toBe(MBTI_MATRIX[j]![i]);
      }
    }
  });

  it('혈액형 대칭 기저는 4형의 비순서쌍 10칸을 모두 덮는다', () => {
    const types = ['A', 'B', 'O', 'AB'];
    for (let i = 0; i < 4; i++) {
      for (let j = i; j < 4; j++) {
        const hit = BLOOD_BASE[`${types[i]}|${types[j]}`] ?? BLOOD_BASE[`${types[j]}|${types[i]}`];
        expect(hit, `${types[i]}|${types[j]}`).toBeTypeOf('number');
      }
    }
    expect(Object.keys(BLOOD_BASE)).toHaveLength(10);
    // 성별 보정은 '남 행 × 여 열' 이라 **순서쌍**이다. 비순서쌍 표와 크기가 다르다.
    expect(Object.keys(BLOOD_GENDER_MOD).length).toBeGreaterThan(0);
  });

  it('ANCHOR 는 p·점수 모두 단조증가이고 양끝이 32/99 다 (C00 §3-H12)', () => {
    expect(ANCHOR[0]).toEqual([0, 32]);
    expect(ANCHOR[ANCHOR.length - 1]).toEqual([1, 99]);
    for (let i = 1; i < ANCHOR.length; i++) {
      expect(ANCHOR[i]![0]!).toBeGreaterThan(ANCHOR[i - 1]![0]!);
      expect(ANCHOR[i]![1]!).toBeGreaterThan(ANCHOR[i - 1]![1]!);
    }
  });

  it('등급표는 하한 내림차순이고 실측 비율의 합이 1이다', () => {
    for (let i = 1; i < BANDS.length; i++) {
      expect(BANDS[i]!.min).toBeLessThan(BANDS[i - 1]!.min);
    }
    expect(BANDS[BANDS.length - 1]!.min).toBe(0);
    const sum = BANDS.reduce((acc, b) => acc + b.observed, 0);
    expect(sum).toBeCloseTo(1, 2);
  });
});

describe('compat-calib.json — 본 구현체 실측 캘리브레이션', () => {
  const KEYS: CompatAxisSetKey[] = [
    'saju+zodiac+mbti+blood',
    'saju+zodiac+mbti',
    'saju+zodiac+blood',
    'saju+zodiac',
  ];

  it('부트스트랩 자리표시자가 아니다', () => {
    expect(calib.version).not.toMatch(/bootstrap/);
    expect(calib.meta.pairs).toBeGreaterThanOrEqual(100_000);
  });

  it('자기신고 조합 4벌 모두 101점 단조 그리드다', () => {
    expect(Object.keys(ECDF_GRIDS).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      const g = ECDF_GRIDS[key];
      expect(g, key).toHaveLength(101);
      for (let i = 1; i < g.length; i++) {
        expect(g[i]!, `${key}[${i}]`).toBeGreaterThanOrEqual(g[i - 1]!);
      }
    }
  });

  it('축이 줄수록 combined 의 분산이 커진다 — 그리드가 조합별로 있어야 하는 이유', () => {
    const spread = (key: CompatAxisSetKey) => ECDF_GRIDS[key][95]! - ECDF_GRIDS[key][5]!;
    expect(spread('saju+zodiac')).toBeGreaterThan(spread('saju+zodiac+mbti+blood'));
    expect(spread('saju+zodiac+blood')).toBeGreaterThan(spread('saju+zodiac+mbti+blood'));
  });

  /**
   * 실측 POP 과 C18 §6.2 의 대조. **혈액형만 크게 벌어지는 것이 정상**이다 —
   * C18 의 `blood_ours`(sd 13.957)는 성별 보정을 **끈** 대칭 기저 값이고(C18 이 "성별 미입력
   * 폴백이 기본 경로" 라서 그렇게 골랐다), 본 앱은 성별을 필수로 받으므로 이성 쌍에 보정이
   * 걸린다(C00 §3-H7). C08 §7.3 의 보정 적용값 sd 16.036 과 우리 15.1 사이가 맞는 자리다.
   */
  it('실측 POP 이 C18 §6.2 와 일치한다 (혈액형 sd 만 성별보정 때문에 벌어진다)', () => {
    expect(POP.saju[0]).toBeCloseTo(POP_C18.saju![0]!, 0);
    expect(POP.saju[1]).toBeCloseTo(POP_C18.saju![1]!, 0);
    expect(POP.zodiac[0]).toBeCloseTo(POP_C18.zodiac_MB![0]!, 0);
    expect(POP.zodiac[1]).toBeCloseTo(POP_C18.zodiac_MB![1]!, 0);
    expect(POP.mbti[0]).toBeCloseTo(POP_C18.mbti_v3![0]!, 0);
    expect(POP.mbti[1]).toBeCloseTo(POP_C18.mbti_v3![1]!, 0);
    expect(POP.blood[0]).toBeCloseTo(POP_C18.blood_ours![0]!, 0);
    // 대칭기저(13.957) < 우리(≈15.1) < C08 성별보정 적용값(16.036)
    expect(POP.blood[1]).toBeGreaterThan(POP_C18.blood_ours![1]!);
    expect(POP.blood[1]).toBeLessThan(16.036);
  });
});
