// S5 신강신약 · 격국 · 용신 — 근거: C00 §S5-1~§S5-5 · §3-E1~E24, C05 §7~§8, C17 §TV
//
// ⚠ **C05/C17 테스트 벡터와의 알려진 차이 1건** (보고 대상, 코드 버그 아님)
//    墓庫 4지지(丑辰未戌)의 지장간 배분 순서가 문서 두 곳에서 어긋난다.
//      · C00 §S4-2 표 + `tables.json > hiddenStems`  : 丑 = 여기 癸 / 중기 辛 / 정기 己
//      · `strength-params.json > hiddenStemRatio`     : `"order": "[본기, 중기, 여기]"`
//        → 위 둘을 그대로 따르면 己 .60 / 辛 .25 / 癸 .15
//      · C05 §1.2 STD 열 + C17 참조구현                : 己 .60 / 癸 .25 / 辛 .15 (여기가 .25)
//    본 구현은 **데이터 파일 두 개(tables.json + strength-params.json)** 를 따른다 — 반대 순서를 쓰려면
//    코드에 「墓庫 4지지 예외표」를 하드코딩해야 하고 이는 F6/runtimeContract 위반이다.
//    실측 영향(N=518,400): R 변동 50.714% / 2치 뒤집힘 2.476% / 3치 뒤집힘 4.541%.
//    아래 벡터에서 `scores` 만 갈리고 등급·격국·조후·용신 방향은 전부 C17 과 일치한다.
//    墓庫 지지가 없는 TV-06 은 **전 필드 완전 일치**한다(파이프라인 자체의 교차검증).

import { describe, expect, it } from 'vitest';
import { CARDS } from '../../src/shared/knowledge';
import {
  BRANCHES,
  GEONROK_BRANCH,
  STEMS,
  STEM_META,
  YANGIN_BRANCH,
} from '../../src/shared/lib/saju/constants';
import {
  ELEMENTS,
  STRENGTH_PARAM_VIEW as P,
  climateIndexOf,
  computeElementScores,
  computeStrengthChart,
  elementAxesOf,
  gradeOf,
  strengthIndexOf,
  tiaohouPrimaryOf,
  unseongOf,
  wangSangOf,
} from '../../src/shared/lib/saju/strength';
import { mainHiddenStem } from '../../src/shared/lib/saju/ten-gods';
import type { Branch, Element, Stem } from '../../src/shared/lib/saju/types';
import { pillarsOf } from './strength-fixtures';
import params from '../../src/shared/data/strength-params.json';

const S = (gz8: string) => computeStrengthChart(pillarsOf(gz8));
const sum = (r: Record<Element, number>): number => ELEMENTS.reduce((a, e) => a + r[e], 0);

/* ───────────────────────── 1. 오행 점수 (합 80.00 고정) ───────────────────────── */

describe('S5-1 오행 점수 — 총점 고정', () => {
  it('사주 모드 합 = 80.00 (허용오차 1e-9)', () => {
    for (const gz of ['癸巳 甲子 丁酉 甲辰', '庚午 辛巳 庚辰 癸未', '乙卯 己卯 甲寅 乙亥']) {
      const { scores, total } = computeElementScores(pillarsOf(gz));
      expect(Math.abs(sum(scores) - 80)).toBeLessThan(1e-9);
      expect(total).toBe(80);
      expect(total).toBe(P.totalFull);
    }
  });

  it('삼주 모드(생시 모름) 합 = 62.00 — 시간 8.0 + 시지 10.0 이 빠진다 (C00 §1.2.7)', () => {
    const { scores, total } = computeElementScores(pillarsOf('癸巳 甲子 丁酉'));
    expect(total).toBe(62);
    expect(Math.abs(sum(scores) - 62)).toBeLessThan(1e-9);
  });

  it('일간은 점수화하지 않는다 (E4) — 일간만 바꿔도 오행 점수는 불변', () => {
    // 甲寅일 ↔ 丙寅일: 일지가 같으면 일간 교체가 점수에 영향을 주면 안 된다
    const a = computeElementScores(pillarsOf('乙卯 己卯 甲寅 乙亥')).scores;
    const b = computeElementScores(pillarsOf('乙卯 己卯 丙寅 乙亥')).scores;
    expect(b).toEqual(a);
  });

  it('월지 ×2.0 · 일지 ×1.4 (E5/E6) — 같은 지지를 월/일에 두면 기여가 2.0 : 1.4', () => {
    // 子(단일 지장간 癸=水)를 월지/일지에 각각 두고 水 증분을 비교
    const base = computeElementScores(pillarsOf('甲戌 甲戌 甲戌 甲戌')).scores['水'];
    const month = computeElementScores(pillarsOf('甲戌 甲子 甲戌 甲戌')).scores['水'] - base;
    const day = computeElementScores(pillarsOf('甲戌 甲戌 甲子 甲戌')).scores['水'] - base;
    // 戌 여기 辛 → 水 기여 0. 증분은 순수하게 子(水 1.00) 몫이다
    expect(month).toBeCloseTo(20, 9);
    expect(day).toBeCloseTo(14, 9);
  });
});

/* ───────────────────────── 2. SI · 등급 ───────────────────────── */

describe('S5-1 SI 백분위 (E2)', () => {
  const anchors = params.threshold.anchors_R_to_SI;

  it('앵커 23점을 정확히 재현한다', () => {
    expect(anchors.length).toBe(23);
    for (const [r, si] of anchors) expect(strengthIndexOf(r!)).toBeCloseTo(si!, 9);
  });

  it('단조증가하고 0~100 을 벗어나지 않는다', () => {
    let prev = -1;
    for (let i = 0; i <= 2000; i++) {
      const si = strengthIndexOf(i / 2000);
      expect(si).toBeGreaterThanOrEqual(0);
      expect(si).toBeLessThanOrEqual(100);
      expect(si).toBeGreaterThanOrEqual(prev);
      prev = si;
    }
    expect(strengthIndexOf(-1)).toBe(0);
    expect(strengthIndexOf(2)).toBe(100);
  });

  it('등급 7구간 경계 (strength-params > threshold.grades)', () => {
    expect(gradeOf(0)).toBe('극신약');
    expect(gradeOf(9.9)).toBe('극신약');
    expect(gradeOf(10)).toBe('신약');
    expect(gradeOf(29.9)).toBe('신약');
    expect(gradeOf(30)).toBe('중화신약');
    expect(gradeOf(44.9)).toBe('중화신약');
    expect(gradeOf(45)).toBe('중화'); // 중립밴드 하한 = 중화 (E3)
    expect(gradeOf(54.9)).toBe('중화');
    expect(gradeOf(55)).toBe('중화신강');
    expect(gradeOf(69.9)).toBe('중화신강');
    expect(gradeOf(70)).toBe('신강');
    expect(gradeOf(89.9)).toBe('신강');
    expect(gradeOf(90)).toBe('극신강');
    expect(gradeOf(100)).toBe('극신강');
  });

  it('isStrong 컷과 중립밴드는 파라미터 파일에서 온다 (55 / [45,55))', () => {
    expect(P.isStrongCut).toBe(55);
    expect(P.neutralBand).toEqual([45, 55]);
    expect(S('庚午 辛巳 庚辰 癸未').strength.isStrong).toBe(true);
    expect(S('癸巳 甲子 丁酉 甲辰').strength.isStrong).toBe(false);
    expect(S('甲子 丙寅 甲戌 己巳').strength.isNeutralBand).toBe(true);
  });
});

/* ───────────────────────── 3. 표 무결성 ───────────────────────── */

describe('표 무결성 — 코드에 표를 다시 적지 않았는지', () => {
  it('오행 생극을 tables.json > tenGods 에서 역산한 결과가 표준 순환이다', () => {
    expect(Object.fromEntries(P.sheng)).toEqual({ 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' });
    expect(Object.fromEntries(P.ke)).toEqual({ 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' });
  });

  it('旺相休囚死 60칸이 C05 §1.7 표와 일치한다 (E11 — 지지 오행 기준)', () => {
    // 행 = 월지, 열 = 木火土金水
    const expected: Record<string, string[]> = {
      子: ['相', '死', '囚', '休', '旺'],
      丑: ['囚', '休', '旺', '相', '死'],
      寅: ['旺', '相', '死', '囚', '休'],
      卯: ['旺', '相', '死', '囚', '休'],
      辰: ['囚', '休', '旺', '相', '死'],
      巳: ['休', '旺', '相', '死', '囚'],
      午: ['休', '旺', '相', '死', '囚'],
      未: ['囚', '休', '旺', '相', '死'],
      申: ['死', '囚', '休', '旺', '相'],
      酉: ['死', '囚', '休', '旺', '相'],
      戌: ['囚', '休', '旺', '相', '死'],
      亥: ['相', '死', '囚', '休', '旺'],
    };
    for (const b of BRANCHES) {
      const monthElement = STEM_META.get(mainHiddenStem(b))!.element;
      const row = ELEMENTS.map((e) => wangSangOf(monthElement, e));
      expect(row, b).toEqual(expected[b]);
    }
  });

  it('조후 제1용신표 무결성 (TV-C17-08) — 10×12, 3표 다수결 정정 4칸', () => {
    const t = params.tiaohouPrimary.table as Record<string, string[]>;
    expect(Object.keys(t).length).toBe(10);
    for (const row of Object.values(t)) {
      expect(row.length).toBe(12);
      for (const c of row) expect(STEMS).toContain(c as Stem);
    }
    expect(tiaohouPrimaryOf('丁', '卯')).toBe('庚'); // C05 정정 (기존 甲)
    expect(tiaohouPrimaryOf('庚', '寅')).toBe('戊'); // C05 정정 (기존 丙)
    expect(tiaohouPrimaryOf('乙', '申')).toBe('丙');
    expect(tiaohouPrimaryOf('丁', '子')).toBe('甲');
    // 열 순서가 寅…丑 인지 (오프셋이 밀리면 여기서 잡힌다)
    expect(P.tiaohouColumns[0]).toBe('寅');
    expect(P.tiaohouColumns[11]).toBe('丑');
  });

  it('양인은 양간 5개에만 존재한다 (C05 §6.1 / C00 §3-D5)', () => {
    expect(YANGIN_BRANCH).toEqual({ 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' });
    expect(GEONROK_BRANCH['甲']).toBe('寅');
    expect(GEONROK_BRANCH['癸']).toBe('子');
  });

  it('십이운성은 음간 역행판을 쓴다 (C00 §S4-3)', () => {
    expect(unseongOf('丁', '酉')).toBe('장생'); // 음간 역행. 순행판이면 '사'
    expect(unseongOf('庚', '辰')).toBe('양');
    expect(unseongOf('甲', '寅')).toBe('건록');
  });

  it('조후지수는 월지를 ×2 로 센다 (E17)', () => {
    expect(climateIndexOf(pillarsOf('癸巳 甲子 丁酉 甲辰'))).toBe(-10);
    expect(climateIndexOf(pillarsOf('庚午 辛巳 庚辰 癸未'))).toBe(4);
    expect(climateIndexOf(pillarsOf('甲子 丙寅 甲戌 己巳'))).toBe(17);
    expect(climateIndexOf(pillarsOf('庚辰 甲申 戊戌 甲子'))).toBe(0);
    expect(climateIndexOf(pillarsOf('辛巳 癸巳 乙巳 丁丑'))).toBe(12);
    expect(climateIndexOf(pillarsOf('乙卯 己卯 甲寅 乙亥'))).toBe(2);
  });
});

/* ───────────────────────── 4. 테스트 벡터 (C05 §8 / C17 §TV) ───────────────────────── */

describe('테스트 벡터 TV-01~06', () => {
  it('TV-01 癸巳 甲子 丁酉 甲辰 (마오쩌둥) — 중화신약 / 칠살격', () => {
    const c = S('癸巳 甲子 丁酉 甲辰');
    // 巳 중기=庚 정정 반영값(C00 §S4-2 c). 木/水 는 위 헤더의 墓庫 차이(辰) 때문에 C17 과 ±1.0
    expect(c.strength.scores).toEqual({ 木: 19.5, 火: 6, 土: 7.5, 金: 16.5, 水: 30.5 });
    expect(c.strength.ally).toBe(25.5);
    expect(c.strength.foe).toBe(54.5);
    expect(c.strength.grade).toBe('중화신약');
    expect(c.strength.isStrong).toBe(false);
    expect(c.strength.deuk).toEqual({
      deukryeong: false,
      wangsang: '死',
      deukji: true,
      unseongIlji: '장생',
      deukse: true,
      allyCount: 3,
      condCount: 2,
    });
    expect(c.strength.root).toMatchObject({ hasRoot: true, strongRoot: true, rootScore: 2 });
    expect(c.geokguk).toMatchObject({ name: '칠살격', special: false, tenGod: '편관' });
    expect(c.yongsin).toMatchObject({
      primary: '木',
      favorable: ['木', '火'],
      avoid: ['水', '金'],
      route: '抑扶+格局',
      climateIndex: -10,
      tiaohouChars: '甲',
    });
  });

  it('TV-02 庚午 辛巳 庚辰 癸未 — 신강 / 칠살격 / 4관 승격 (R·SI 는 C17 과 완전 일치)', () => {
    const c = S('庚午 辛巳 庚辰 癸未');
    expect(c.strength.R).toBeCloseTo(0.5425, 9);
    expect(c.strength.SI).toBe(80.4);
    expect(c.strength.grade).toBe('신강');
    expect(c.strength.deuk).toMatchObject({ deukryeong: false, deukji: true, unseongIlji: '양', allyCount: 4 });
    expect(c.strength.root).toMatchObject({ hasRoot: true, strongRoot: false, rootScore: 1 });
    expect(c.geokguk).toMatchObject({ name: '칠살격', special: false });
    expect(c.yongsin).toMatchObject({
      primary: '火',
      favorable: ['火', '水', '木'],
      avoid: ['土', '金'],
      route: '抑扶+格局',
      climateIndex: 4,
      tiaohouChars: '壬',
    });
    expect(c.yongsin.steps.some((s) => s.includes('1순위 승격'))).toBe(true);
  });

  it('TV-03 甲子 丙寅 甲戌 己巳 — SI 45.0 중립밴드 경계 + 조후 미발동 (경계 회귀)', () => {
    const c = S('甲子 丙寅 甲戌 己巳');
    expect(c.strength.R).toBeCloseTo(0.375, 9);
    expect(c.strength.SI).toBe(45); // 앵커 정확히 위 — 반올림 방향이 밴드를 가른다
    expect(c.strength.grade).toBe('중화');
    expect(c.strength.isNeutralBand).toBe(true);
    expect(c.geokguk).toMatchObject({ name: '건록격', basis: '월지=일간 祿位(寅)' });
    // ci +17 ≥ 12 이나 水 10.0 ≥ 8.0 → 2관 미발동
    expect(c.yongsin.climateIndex).toBe(17);
    expect(c.yongsin.route).toBe('抑扶+格局');
    expect(c.yongsin.steps[1]).toContain('이미 해소');
    // 중립밴드 → 조후표 1순위 丙(火)
    expect(c.yongsin.primary).toBe('火');
    expect(c.yongsin.tiaohouChars).toBe('丙');
  });

  it('TV-04 庚辰 甲申 戊戌 甲子 — 신약 / 식신격 / 득지 OR 결합(戌=土 O, 12운성 墓 X)', () => {
    const c = S('庚辰 甲申 戊戌 甲子');
    expect(c.strength.grade).toBe('신약');
    expect(c.strength.deuk).toMatchObject({
      deukryeong: false,
      wangsang: '休',
      deukji: true,
      unseongIlji: '묘',
      deukse: false,
    });
    expect(c.strength.root).toMatchObject({ rootScore: 5, strongRoot: true });
    expect(c.geokguk).toMatchObject({ name: '식신격', tenGod: '식신' });
    expect(c.geokguk.basis).toContain('庚 투출');
    expect(c.yongsin).toMatchObject({
      primary: '火',
      favorable: ['火', '土'],
      avoid: ['木', '水'],
      route: '抑扶+格局',
      climateIndex: 0,
      tiaohouChars: '丙',
    });
  });

  it('TV-05 辛巳 癸巳 乙巳 丁丑 — 종세격(1관에서 확정, 이하 관문 스킵)', () => {
    const c = S('辛巳 癸巳 乙巳 丁丑');
    expect(c.strength.scores['木']).toBe(0);
    expect(c.strength.grade).toBe('극신약');
    expect(c.strength.root).toEqual({ hasRoot: false, strongRoot: false, rootScore: 0, roots: [] });
    expect(c.geokguk).toMatchObject({ name: '종세격', special: true });
    expect(c.geokguk.basis).toContain('이당 카테고리 3종');
    expect(c.yongsin).toMatchObject({
      primary: '火',
      favorable: ['火', '土', '金'],
      avoid: ['木', '水'],
      route: '從/專旺',
      climateIndex: 12,
    });
    expect(c.yongsin.steps).toHaveLength(1); // 1관에서 확정 → 2~5관 기록 없음
  });

  it('TV-06 乙卯 己卯 甲寅 乙亥 — SI 99.1 이나 己(재성) 명투 → 전왕 불성립, 양인격 (C17 전 필드 일치)', () => {
    const c = S('乙卯 己卯 甲寅 乙亥');
    expect(c.strength.scores).toEqual({ 木: 57.4, 火: 3.5, 土: 12.1, 金: 0, 水: 7 });
    expect(c.strength.ally).toBe(64.4);
    expect(c.strength.R).toBeCloseTo(0.805, 9);
    expect(c.strength.SI).toBe(99.1);
    expect(c.strength.grade).toBe('극신강');
    expect(c.strength.deuk).toEqual({
      deukryeong: true,
      wangsang: '旺',
      deukji: true,
      unseongIlji: '건록',
      deukse: true,
      allyCount: 6,
      condCount: 3,
    });
    expect(c.strength.root).toMatchObject({ rootScore: 7, strongRoot: true, hasRoot: true });
    expect(c.geokguk).toMatchObject({ name: '양인격', special: false }); // ★ special=false 가 핵심
    expect(c.yongsin).toMatchObject({
      primary: '金',
      favorable: ['金', '火', '土'],
      avoid: ['水', '木'],
      route: '抑扶+格局',
      climateIndex: 2,
      tiaohouChars: '庚',
    });
  });
});

/* ───────────────────────── 5. 五道关 각 관문 트리거 ───────────────────────── */

describe('용신 五道关 — 각 관문이 실제로 트리거된다 (E15)', () => {
  it('1관 專旺 — SI ≥ 95 & 이당 명투 0 → 전왕격 順勢', () => {
    // 甲木 일간, 7자가 전부 木/水(비겁·인성)라 식상·재성·관성 명투가 없다 (오호둔·오서둔 정합 명식)
    const c = S('甲子 乙亥 甲子 甲子');
    expect(c.strength.SI).toBeGreaterThanOrEqual(P.jeonwangSiMin);
    expect(c.strength.ally).toBe(80);
    expect(c.geokguk).toMatchObject({ name: '전왕격', special: true });
    expect(c.yongsin.route).toBe('從/專旺');
    expect(c.yongsin.primary).toBe('木');
    expect(c.yongsin.favorable).toEqual(['木', '水', '火']); // 왕신 + 인성 + 식상
    expect(c.yongsin.avoid).toEqual(['土', '金']);
  });

  it('1관 從 — SI ≤ 8 & 무근. 이당 1종이면 종아/종재/종살, 혼잡이면 종세격 (E23)', () => {
    expect(P.jongSiMax).toBe(8);
    expect(S('辛巳 癸巳 乙巳 丁丑').geokguk.name).toBe('종세격'); // 식상·재성·관성 3종 혼잡
    expect(S('乙丑 己丑 丙辰 己丑').geokguk.name).toBe('종아격'); // 식상 1종
    expect(S('壬午 丙午 壬午 丙午').geokguk.name).toBe('종재격'); // 재성 1종
    expect(S('癸未 己未 癸未 己未').geokguk.name).toBe('종살격'); // 관성 1종
    for (const gz of ['乙丑 己丑 丙辰 己丑', '壬午 丙午 壬午 丙午', '癸未 己未 癸未 己未']) {
      const c = S(gz);
      expect(c.geokguk.special).toBe(true);
      expect(c.strength.root.hasRoot).toBe(false);
      expect(c.yongsin.route).toBe('從/專旺');
    }
  });

  it('2관 調候 — |ci| ≥ 12 & 필요오행 < 8.0 → 調候 route', () => {
    // 한랭 편고(ci ≤ −12) + 火 부족
    const c = S('壬子 壬子 庚子 庚辰');
    expect(c.yongsin.climateIndex).toBeLessThanOrEqual(-P.climateTrigger);
    expect(c.strength.scores['火']).toBeLessThan(P.climateRequiredCut);
    expect(c.yongsin.route).toBe('調候');
    expect(c.yongsin.primary).toBe('火');
    expect(c.yongsin.steps[1]).toContain('발동');
  });

  it('2관은 필요오행이 이미 8.0 이상이면 발동하지 않는다 (경계)', () => {
    const c = S('甲子 丙寅 甲戌 己巳'); // ci=+17, 水 10.0
    expect(c.yongsin.climateIndex).toBeGreaterThanOrEqual(P.climateTrigger);
    expect(c.strength.scores['水']).toBeGreaterThanOrEqual(P.climateRequiredCut);
    expect(c.yongsin.route).not.toBe('調候');
  });

  it('3관 抑扶 — 신강/신약/중립밴드 3분기가 전부 다른 방향을 낸다', () => {
    const strong = S('庚午 辛巳 庚辰 癸未');
    const weak = S('庚辰 甲申 戊戌 甲子');
    const neutral = S('甲子 丙寅 甲戌 己巳');
    expect(strong.yongsin.steps[2]).toContain('신강');
    expect(weak.yongsin.steps[2]).toContain('신약');
    expect(neutral.yongsin.steps[2]).toContain('중립밴드');
    // 신강은 관·식·재, 신약은 인·비
    const sa = elementAxesOf('金');
    expect(strong.yongsin.favorable).toContain(sa.gwan);
    const wa = elementAxesOf('土');
    expect(weak.yongsin.favorable[0]).toBe(wa.ins);
  });

  it('4관 格局 — 격국 오행이 억부 방향 안이면 1순위로 승격된다', () => {
    const c = S('庚午 辛巳 庚辰 癸未'); // 칠살격(火) + 신강 [관 火, 식 水, 재 木]
    expect(c.yongsin.steps[3]).toContain('1순위 승격');
    expect(c.yongsin.primary).toBe('火');
  });

  it('5관 病藥 — 용신을 극하는 오행이 총점 20% 이상이면 藥을 희신에 더한다', () => {
    const c = S('癸巳 甲子 丁酉 甲辰'); // 용신 木, 기신 金 16.5 ≥ 16.0 → 藥 = 火
    expect(P.byeongyakCutRatio).toBe(0.2);
    expect(c.yongsin.steps[4]).toContain('藥');
    expect(c.yongsin.favorable).toContain('火');
    // 중복은 제거된다 (C05 의사코드가 그대로면 火 가 두 번 들어간다)
    expect(new Set(c.yongsin.favorable).size).toBe(c.yongsin.favorable.length);
  });

  it('용신 primary 는 절대 avoid 에 들어가지 않는다 (I6)', () => {
    for (const gz of [
      '癸巳 甲子 丁酉 甲辰',
      '庚午 辛巳 庚辰 癸未',
      '甲子 丙寅 甲戌 己巳',
      '庚辰 甲申 戊戌 甲子',
      '辛巳 癸巳 乙巳 丁丑',
      '乙卯 己卯 甲寅 乙亥',
      '甲子 乙亥 甲子 甲子',
      '壬子 壬子 庚子 庚辰',
    ]) {
      const y = S(gz).yongsin;
      expect(y.avoid).not.toContain(y.primary);
      expect(y.favorable[0]).toBe(y.primary);
    }
  });

  it('v1 파이프라인에 通關 관문은 없다 — 감지해도 route 를 바꾸지 않는다 (C00 §S5-4)', () => {
    const c = S('庚午 辛巳 庚辰 癸未'); // 火 20.5 ↔ 金 23.0 상전 조건 충족
    expect(c.yongsin.steps.some((s) => s.includes('통관'))).toBe(true);
    expect(c.yongsin.route).toBe('抑扶+格局');
  });
});

/* ───────────────────────── 6. 격국 ───────────────────────── */

describe('S5-3 격국', () => {
  it('일간은 투출 대상이 아니다 (E20) — 甲일간 寅월이 비견격이 되지 않는다', () => {
    const c = S('己巳 丙寅 甲子 甲子');
    expect(c.geokguk.name).not.toBe('비견격');
    expect(c.geokguk.name).toBe('건록격'); // 寅 = 甲의 祿
  });

  it('비겁은 격이 되지 않는다 — 월지 지장간 중 비겁은 후보에서 빠진다', () => {
    // 庚일간 巳월: 巳 = 丙(편관)/庚(비견)/戊(편인). 庚 이 년간에 투출해도 비견격이 되면 안 된다
    const c = S('庚午 辛巳 庚辰 癸未');
    expect(c.geokguk.name).toBe('칠살격');
  });

  it('투출이 없으면 월지 본기 십신으로 간다', () => {
    const c = S('庚午 辛巳 庚辰 癸未');
    expect(c.geokguk.basis).toContain('투출 없음');
  });

  it('격 이름 10종이 지식카드 `geokguk:` 태그와 정확히 같다 (도달 가능성)', () => {
    const cardTags = new Set(
      CARDS.flatMap((c) => c.tags).filter((t) => t.startsWith('geokguk:')),
    );
    const engineNames = new Set(Object.values(P.geokgukNames));
    expect(engineNames.size).toBe(10);
    for (const n of engineNames) expect(cardTags.has(`geokguk:${n}`), n).toBe(true);
    expect(cardTags.size).toBe(10);
  });
});

/* ───────────────────────── 7. 배점 체계는 하나다 ───────────────────────── */

describe('groupScores — S4 groupWeights 와 같은 체계', () => {
  it('groupScores 합 = total 이고 오행 점수를 일간 기준으로 접은 것이다', () => {
    for (const gz of ['癸巳 甲子 丁酉 甲辰', '庚午 辛巳 庚辰 癸未', '辛巳 癸巳 乙巳 丁丑']) {
      const s = S(gz).strength;
      const total = Object.values(s.groupScores).reduce((a, b) => a + b, 0);
      expect(Math.abs(total - s.total)).toBeLessThan(1e-9);
      const axes = elementAxesOf(STEM_META.get(pillarsOf(gz).day.stem)!.element);
      expect(s.groupScores['비겁']).toBe(s.scores[axes.bi]);
      expect(s.groupScores['인성']).toBe(s.scores[axes.ins]);
      expect(s.groupScores['식상']).toBe(s.scores[axes.sik]);
      expect(s.groupScores['재성']).toBe(s.scores[axes.jae]);
      expect(s.groupScores['관성']).toBe(s.scores[axes.gwan]);
      expect(s.ally).toBeCloseTo(s.groupScores['비겁'] + s.groupScores['인성'], 9);
    }
  });

  it('키 순서가 고정이다 (Chart 직렬화 캐시키 전제)', () => {
    const s = S('庚午 辛巳 庚辰 癸未').strength;
    expect(Object.keys(s.scores)).toEqual(['木', '火', '土', '金', '水']);
    expect(Object.keys(s.groupScores)).toEqual(['비겁', '식상', '재성', '관성', '인성']);
  });
});

describe('결정론', () => {
  it('같은 입력이면 JSON 직렬화까지 동일하다', () => {
    const a = JSON.stringify(S('庚午 辛巳 庚辰 癸未'));
    const b = JSON.stringify(S('庚午 辛巳 庚辰 癸未'));
    expect(a).toBe(b);
  });

  it('파라미터 미러가 산문 조건과 어긋나지 않는다 (drift 방지)', () => {
    const jw = params.specialPattern.jeonwang;
    const jg = params.specialPattern.jong;
    expect(Number(/SI\s*>=\s*(\d+)/.exec(jw.condition)![1])).toBe(jw.si_min);
    expect(Number(/SI\s*<=\s*(\d+)/.exec(jg.condition)![1])).toBe(jg.si_max);
    const tg = params.tonggwan.triggerCondition;
    expect(Number(/(\d+)%/.exec(tg.value)![1]) / 100).toBe(tg.eachShareMin);
    expect(Number(/<\s*(0\.\d+)/.exec(tg.value)![1])).toBe(tg.gapShareMax);
    expect(params.byeongyak.gisinScoreCutRatio.value * params.scoreModel.totalScore.value).toBe(16);
  });
});

/* ───────────────────────── 8. 지지/천간 전 조합 스모크 ───────────────────────── */

describe('전 지지 · 전 천간 스모크', () => {
  it('120개 일간×월지 전부에서 조후 제1용신이 존재한다', () => {
    for (const s of STEMS) for (const b of BRANCHES as readonly Branch[]) {
      expect(STEMS).toContain(tiaohouPrimaryOf(s, b) as Stem);
    }
  });
});
