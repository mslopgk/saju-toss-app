/**
 * 엔드투엔드 배선 검증 — **실제 `computeChart()` 출력**이 해석 레이어를 그대로 통과하는가.
 *
 * 이 파일이 존재하는 이유: 통합 전에는 해석 레이어가 픽스처(`ChartLike` 를 손으로 채운 객체)로만
 * 돌아갔다. 엔진이 실제로 내는 모양과 어긋나도(예: `chart.sinsal.tenGods` vs `chart.tenGods`)
 * 테스트는 전부 초록이었다. 여기서는 픽스처를 쓰지 않는다 — 엔진 출력만 쓴다.
 */

import { describe, expect, it } from 'vitest';

import { computeChart, type Chart, type RawBirthInput } from '../lib/saju';
import { CARDS } from '../knowledge';
import type { ChartLike, UserProfile } from './contracts';
import { buildFactPack } from './factPack';
import { queryTagsOf, selectKnowledgeCards } from './retrieve';
import { buildInterpretationRequest } from './buildRequest';
import { MockInterpretationClient, renderTemplateInterpretation, toRawShape } from './client';
import { verifyInterpretation } from './guard';
import { renderTemplateReport } from './template';

/** 화면 경로의 검색 예산. `features/report/buildReport.ts` 의 `REPORT_RETRIEVAL` 과 같은 값이다. */
const REPORT_BUDGET = { maxCards: 64, maxPerSystem: 40, maxPerKind: 14 };

const RAW: RawBirthInput = {
  calendarType: 'solar',
  year: 1993,
  month: 5,
  day: 16,
  hour: 12,
  minute: 0,
  timeUnknown: false,
  gender: 'M',
  birthPlace: { latitude: 37.5665, longitude: 126.9784204 },
};

const PROFILE: UserProfile = { gender: 'M', mbti: 'INTJ', blood: 'A' };

const chart: Chart = computeChart(RAW);
// 이 대입이 컴파일되는 것 자체가 계약 검증이다. `Chart` 는 `ChartLike` 의 상위집합이어야 한다.
const chartLike: ChartLike = chart;

describe('computeChart → 해석 레이어', () => {
  it('엔진 Chart 를 ChartLike 로 그대로 쓴다(구조 대입)', () => {
    expect(chartLike.engineVersion).toBe('SAJU-ENGINE-1.0.0');
    expect(chartLike.pillars.gz8.split(' ')).toHaveLength(4);
    // 십신은 chart.tenGods 다 — chart.sinsal.tenGods 가 아니다.
    expect(Object.keys(chartLike.tenGods.groupWeights).sort()).toEqual(
      ['비겁', '식상', '재성', '관성', '인성'].sort(),
    );
    // 경고는 문자열 유니온이다(코드/문구 객체가 아니다).
    for (const w of chartLike.warnings) expect(typeof w).toBe('string');
  });

  it('엔진이 채우는 섹션은 팩트팩에서 빠지지 않는다', () => {
    const fact = buildFactPack(chartLike, PROFILE, 'fusion');
    // S4-2(신살)·S5(신강신약)·S7(별자리)가 모두 붙었다 — 더 이상 건너뛰는 섹션이 없다.
    // (`missingSections` 분기 자체는 남는다: 저장된 구버전 차트·픽스처가 들어올 수 있기 때문이다.)
    expect(fact.missingSections).toEqual([]);
    expect(fact.saju.sinsalNames).not.toBeNull();
    expect(fact.saju.sinsalNames?.length ?? 0).toBeGreaterThan(0);
    expect(fact.astro).not.toBeNull();
    expect(fact.astro?.sunSignId).toBe(chart.astro.sun.signId);
    expect(fact.saju.gz8).toBe(chart.pillars.gz8);
    expect(fact.saju.dayStem).toBe(chart.pillars.day.stem);
    expect(fact.saju.daewoon.length).toBeGreaterThan(0);
  });

  it('빠진 섹션 표시는 여전히 동작한다(구버전 차트 대비)', () => {
    const legacy: ChartLike = {
      engineVersion: chart.engineVersion,
      pillars: chart.pillars,
      tenGods: chart.tenGods,
      luck: chart.luck,
      warnings: chart.warnings,
    };
    const fact = buildFactPack(legacy, PROFILE, 'fusion');
    expect(fact.missingSections).toEqual(['sinsal', 'strength', 'astro']);
    expect(fact.saju.sinsalNames).toBeNull();
    expect(fact.astro).toBeNull();
  });

  it('S5 가 실제 엔진 출력으로 팩트팩까지 흘러간다', () => {
    const fact = buildFactPack(chartLike, PROFILE, 'fusion');
    const s = fact.saju.strength;
    if (s === null) throw new Error('S5 는 더 이상 옵셔널이 아니다');
    expect(Object.values(s.elementScores).reduce((a, b) => a + b, 0)).toBeCloseTo(80, 6);
    expect(s.strengthIndex).toBe(chart.strength.strength.SI);
    expect(s.strengthGrade).toBe(chart.strength.strength.grade);
    expect(s.geokguk).toBe(chart.strength.geokguk.name);
    expect(s.yongsin.route).toBe(chart.strength.yongsin.route);
    // 십신 그룹 배점도 같은 체계(합 80.00)다
    expect(Object.values(fact.saju.tenGodWeights).reduce((a, b) => a + b, 0)).toBeCloseTo(80, 6);
  });

  it('S5 태그가 실제로 발행되고 그 태그로 카드가 뽑힌다 (도달 가능 카드 확대)', () => {
    const fact = buildFactPack(chartLike, PROFILE, 'fusion');
    const tags = queryTagsOf(fact);
    // 엔진이 실제로 낸 값으로 3축이 열린다 — 예전에는 strength 가 없어 축 자체가 닫혀 있었다
    expect(tags).toContain(`strengthGrade:${chart.strength.strength.grade}`);
    expect(tags).toContain(`geokguk:${chart.strength.geokguk.name}`);
    expect(tags).toContain(`yongsinRoute:${chart.strength.yongsin.route}`);
    // 세 축 모두 지식베이스에 대응 카드가 존재한다(선정 상한 때문에 전부 뽑히지는 않는다)
    const all = new Set(CARDS.flatMap((c) => c.tags));
    for (const t of tags.filter((x) => /^(strengthGrade|geokguk|yongsinRoute):/.test(x))) {
      expect(all.has(t), t).toBe(true);
    }
    const picked = selectKnowledgeCards(fact, CARDS);
    expect(picked.some((c) => c.tags.some((t) => t.startsWith('strengthGrade:')))).toBe(true);
  });

  /**
   * **도달률 회귀.** 태그 축이 하나 조용히 빠져도 에러는 나지 않는다 — 그 카드들이 영영 안 뽑힐 뿐이다.
   * 그래서 실제 사주를 넓게 훑어 "한 번이라도 뽑히는 카드"의 수를 세고 바닥을 고정한다.
   *
   * 실측 178/198. 못 닿는 20장의 사유는 `retrieve.test.ts` 의 `UNREACHABLE_CARD_IDS` 에 낱장으로 적혀 있다:
   *   대운 간지관계 15(C06 §7.3 미구현 + 본문이 운 점수 가중표) · 일치도 라벨 4(Coherence 점수가 C00 에 없음)
   *   · 병약 용신 1(엔진이 route 로 노출하지 않음 — `yongsin.steps` 로그 문자열에만 있다)
   *
   * **문장에 실제로 쓰이는 수(`usedCardIds`)도 함께 잰다.** 검색만 되고 한 번도 인용되지 않는 카드는
   * "도달했다"고 보기 어렵고, 그 상태는 검색 테스트만으로는 드러나지 않는다.
   */
  it('실제 사주를 훑으면 지식카드 절반 이상에 닿는다(도달률 회귀)', () => {
    const MBTIS = [
      'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
      'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
    ];
    const BLOODS = ['A', 'B', 'O', 'AB'] as const;
    const reached = new Set<string>();
    const used = new Set<string>();
    let i = 0;
    for (let year = 1960; year <= 2005; year += 5) {
      for (let month = 1; month <= 12; month += 1) {
        for (const day of [5, 20]) {
          for (const gender of ['M', 'F'] as const) {
            const chart = computeChart({ ...RAW, year, month, day, gender });
            i += 1;
            const fact = buildFactPack(
              chart,
              { gender, mbti: MBTIS[i % MBTIS.length] ?? null, blood: BLOODS[i % BLOODS.length] ?? null },
              'fusion',
            );
            const cards = selectKnowledgeCards(fact, CARDS, REPORT_BUDGET);
            for (const c of cards) reached.add(c.id);
            for (const id of renderTemplateReport(fact, cards).usedCardIds) used.add(id);
          }
        }
      }
    }
    // 실측 178. 이 수가 줄면 축이 하나 끊긴 것이다(S5·S6 을 붙이기 전 같은 방식의 실측은 81 이었다).
    expect(reached.size).toBe(178);
    // 검색된 178장 중 실제로 문장에 인용되는 수. 남는 5장은 사유가 명확하다:
    //   blood:{A,B,O,AB} 4 — 혈액형 통념 카드. 성격 판정에 쓰지 않기로 한 카드라 일부러 인용하지 않는다.
    //   fusion:오행MBTI:토(土) 1 — 문서10 §2.1 에서 土 만 "중립"이라 견줄 글자가 없다.
    expect(used.size).toBe(reached.size - 5);
    for (const id of ['blood:A', 'blood:B', 'blood:O', 'blood:AB', 'fusion:오행MBTI:토(土)']) {
      expect(reached.has(id), id).toBe(true);
      expect(used.has(id), id).toBe(false);
    }
    // 새로 열린 축들이 실제로 카드를 끌어온다
    const kinds = new Set([...reached].map((id) => id.split(':')[0]));
    expect(kinds.has('unseong')).toBe(true);
    for (const prefix of [
      'yongsin:억부:',
      'yongsin:격국:',
      'yongsin:신강지수:',
      'daewoon:방향:',
      'daewoon:서술:',
      'sinsal:',
      'zodiac:',
      'mbti:인지기능:',
      'fusion:충돌:',
      'fusion:통합:',
      'fusion:오행MBTI:',
    ]) {
      expect([...reached].some((id) => id.startsWith(prefix)), prefix).toBe(true);
    }
    expect(reached.has('blood:면책')).toBe(true);
  });

  it('실제 지식베이스에서 카드가 실제로 뽑힌다(빈 배열이 아니다)', () => {
    const fact = buildFactPack(chartLike, PROFILE, 'fusion');
    // 기본 예산(16장)은 프롬프트용이라 좁다. 화면 경로와 같은 상한으로 본다.
    const cards = selectKnowledgeCards(fact, CARDS, REPORT_BUDGET);
    expect(cards.length).toBeGreaterThan(0);
    const ids = cards.map((c) => c.id);
    expect(ids).toContain(`ilgan:${chart.pillars.day.stem}`);
    expect(ids).toContain('mbti:축:EI');
    expect(ids).toContain('blood:A');
    // 기본 예산에서도 체계는 다 살아 있다(분류가 통째로 잘리면 섹션이 조용히 사라진다).
    const narrow = selectKnowledgeCards(fact, CARDS);
    expect(new Set(narrow.map((c) => c.kind)).size).toBeGreaterThanOrEqual(5);
  });

  it('프롬프트 조립이 성공하고 팩트팩 사실만 담는다', () => {
    const fact = buildFactPack(chartLike, PROFILE, 'fusion');
    const cards = selectKnowledgeCards(fact, CARDS);
    const req = buildInterpretationRequest(chartLike, PROFILE, cards, 'fusion');

    expect(req.engineVersion).toBe(chart.engineVersion);
    expect(req.userText).toContain(chart.pillars.gz8);
    expect(req.knowledgeCardIds).toEqual(cards.map((c) => c.id));
    // 엔진이 캐시키를 내지 않으므로 대체 키(`x:`)가 쓰인다
    expect(req.narrativeKey).toContain('|x:');
    // 같은 입력이면 문자 단위로 같은 요청
    expect(JSON.stringify(req)).toBe(
      JSON.stringify(buildInterpretationRequest(chartLike, PROFILE, cards, 'fusion')),
    );
  });

  it('템플릿 폴백 응답이 검증기를 통과한다(파이프라인 왕복)', () => {
    const fact = buildFactPack(chartLike, PROFILE, 'fusion');
    const cards = selectKnowledgeCards(fact, CARDS);
    const req = buildInterpretationRequest(chartLike, PROFILE, cards, 'fusion');
    const verified = verifyInterpretation(toRawShape(renderTemplateInterpretation(req)), req);
    if (!verified.ok) throw new Error(`검증 실패: ${JSON.stringify(verified.failures)}`);
    expect(verified.value.sections.map((s) => s.id)).toEqual(req.sections);
  });

  it('MockInterpretationClient 가 엔진 출력만으로 리포트를 낸다', async () => {
    const client = new MockInterpretationClient({ knowledgeBase: CARDS });
    const outcome = await client.interpret({ kind: 'fusion', chart: chartLike, profile: PROFILE });
    if (outcome.status !== 'ok') {
      throw new Error(`기대: ok / 실제: ${JSON.stringify(outcome)}`);
    }
    expect(outcome.value.headline.length).toBeGreaterThan(3);
    expect(outcome.value.sections.length).toBeGreaterThan(0);
  });

  it('삼주 모드(생시 모름) 차트도 같은 경로를 통과한다', async () => {
    const three = computeChart({ ...RAW, hour: undefined, minute: undefined, timeUnknown: true });
    expect(three.warnings).toContain('THREE_PILLAR_MODE');
    const fact = buildFactPack(three, PROFILE, 'basic_saju');
    expect(fact.saju.hourGanji).toBeNull();
    expect(fact.warnings).toContain('THREE_PILLAR_MODE');

    const client = new MockInterpretationClient({ knowledgeBase: CARDS });
    const outcome = await client.interpret({ kind: 'basic_saju', chart: three, profile: PROFILE });
    expect(outcome.status).toBe('ok');
  });
});
