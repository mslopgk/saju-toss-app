import { describe, expect, it } from 'vitest';
import { findBannedPhrases } from '../../shared/interpret/guard';
import { computeChart, type Chart, type Gender } from '../../shared/lib/saju';
import { computeCompatibility, type CompatProfile } from '../../shared/lib/compat';
import { MBTI_TYPE_ORDER } from '../../shared/lib/compat/params';
import { buildCompatReport } from './buildCompatReport';
import { COMPAT_DISCLAIMERS } from './copy';

const chartOf = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  gender: Gender,
): Chart =>
  computeChart({
    calendarType: 'solar',
    year,
    month,
    day,
    hour,
    minute,
    timeUnknown: false,
    gender,
    birthPlace: { region: 'KR' },
  });

const A = chartOf(1990, 5, 15, 10, 30, 'M');
const B = chartOf(1992, 11, 3, 22, 10, 'F');
const PA: CompatProfile = { mbti: 'ENFP', blood: 'O' };
const PB: CompatProfile = { mbti: 'INFJ', blood: 'A' };

const reportOf = (
  chartA: Chart,
  chartB: Chart,
  pa: CompatProfile,
  pb: CompatProfile,
  sameGender = false,
) => buildCompatReport(computeCompatibility(chartA, chartB, pa, pb), { sameGender });

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('buildCompatReport — 규칙 기반 (LLM 없이 동작)', () => {
  it('같은 결과면 같은 문장이다', () => {
    const first = JSON.stringify(reportOf(A, B, PA, PB));
    for (let i = 0; i < 20; i++) {
      expect(JSON.stringify(reportOf(A, B, PA, PB))).toBe(first);
    }
  });

  it('전 축이 있으면 9개 섹션이 전부 나온다', () => {
    const report = reportOf(A, B, PA, PB);
    expect(report.sections.map((s) => s.id)).toEqual([
      'score',
      'ilju',
      'sipsin',
      'element',
      'tti',
      'zodiac',
      'mbti',
      'blood',
      'advice',
    ]);
    expect(report.missingAxisNote).toBeNull();
  });

  it('자기신고가 없으면 그 섹션이 빠지고 안내가 붙는다', () => {
    const report = reportOf(A, B, { mbti: null, blood: null }, { mbti: null, blood: null });
    const ids = report.sections.map((s) => s.id);
    expect(ids).not.toContain('mbti');
    expect(ids).not.toContain('blood');
    expect(ids).toContain('score');
    expect(report.missingAxisNote).not.toBeNull();
  });

  /**
   * C18 §5.7 BL-3 의 조건. 혈액형을 배점에 남긴 제품 결정은 이 고지가 화면에 있을 때만 유효하다.
   * 문구가 사라지면 매트릭스를 균등(BL-1)으로 바꾸는 것이 먼저다.
   */
  it('혈액형 근거 없음을 면책과 본문 양쪽에서 밝힌다', () => {
    const report = reportOf(A, B, PA, PB);
    expect(report.disclaimers).toBe(COMPAT_DISCLAIMERS);
    expect(report.disclaimers.some((d) => d.includes('혈액형 궁합은 과학적 근거가 없습니다'))).toBe(
      true,
    );
    const blood = report.sections.find((s) => s.id === 'blood')!;
    expect(blood.body).toContain('확인된 근거가 없어요');
    // 배점 비중도 함께 밝힌다 — "근거 없는데 왜 넣었나" 에 답하는 자리다.
    expect(blood.body).toMatch(/몫은 \d+%/);
  });

  it('동성 쌍이면 십신의 성역할 서술을 쓰지 않는다고 밝힌다 (C00 §3-H11)', () => {
    const male2 = chartOf(1991, 3, 3, 8, 0, 'M');
    const sipsin = reportOf(A, male2, PA, PB, true).sections.find((s) => s.id === 'sipsin')!;
    expect(sipsin.body).toContain('남녀를 전제한 표현');
  });

  it('근거 카드를 중복 없이, 인용한 것만 남긴다', () => {
    const report = reportOf(A, B, PA, PB);
    const ids = report.usedCards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('blood:면책');
    for (const card of report.usedCards) {
      expect(card.source.doc.length).toBeGreaterThan(0);
      expect(['A', 'B', 'C', 'D']).toContain(card.confidence);
    }
  });

  it('헤드라인·요약이 계산 결과의 값만 인용한다', () => {
    const result = computeCompatibility(A, B, PA, PB);
    const report = buildCompatReport(result);
    expect(report.headline).toBe(`${result.score}점 · ${result.band.name}`);
    expect(report.summary).toContain(result.band.tag);
  });
});

describe('문장 규율 (고정 시드 · 600쌍)', () => {
  const rnd = mulberry32(20260814);
  const randInt = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const BLOOD = ['A', 'B', 'O', 'AB'] as const;

  const pool = Array.from({ length: 60 }, () => {
    const gender: Gender = rnd() < 0.5 ? 'M' : 'F';
    return {
      chart: chartOf(randInt(1935, 2020), randInt(1, 12), randInt(1, 28), randInt(0, 23), randInt(0, 59), gender),
      profile: {
        mbti: rnd() < 0.2 ? null : MBTI_TYPE_ORDER[randInt(0, 15)]!,
        blood: rnd() < 0.2 ? null : BLOOD[randInt(0, 3)]!,
      } satisfies CompatProfile,
    };
  });

  const reports = Array.from({ length: 600 }, () => {
    const a = pool[randInt(0, pool.length - 1)]!;
    const b = pool[randInt(0, pool.length - 1)]!;
    return reportOf(a.chart, b.chart, a.profile, b.profile, a.chart.input.gender === b.chart.input.gender);
  });

  const bodyOf = (r: (typeof reports)[number]) =>
    [r.headline, r.summary, ...r.sections.map((s) => s.body)].join('\n');

  /** 문서10 §6.3 금지어. 해석 레이어의 가드를 그대로 재사용한다 — 규칙이 두 벌이면 갈린다 */
  it('금지 표현이 하나도 없다', () => {
    for (const r of reports) {
      const failures = findBannedPhrases(bodyOf(r));
      expect(failures.map((f) => f.detail)).toEqual([]);
    }
  });

  it('한자·라틴 문자 바로 뒤에 한글 조사를 붙이지 않는다', () => {
    // `甲은`·`ENFP가` 처럼 읽는 법이 정해지지 않은 글자 뒤의 조사는 절반이 틀린다.
    // 한자는 `甲(갑)` 표기로, MBTI 는 항상 받침 없는 J/P 로 끝나므로 `는` 만 쓴다.
    const bad = /[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥][은는이가을를와과로]/;
    const badLatin = /[A-Z](?:은|이|을|과)(?![A-Za-z])/;
    for (const r of reports) {
      const body = bodyOf(r);
      expect(body).not.toMatch(bad);
      expect(body).not.toMatch(badLatin);
    }
  });

  it('빈 섹션·미치환 슬롯·NaN 이 없다', () => {
    for (const r of reports) {
      for (const s of r.sections) {
        expect(s.body.trim().length).toBeGreaterThan(0);
        expect(s.body).not.toMatch(/\{|\}|undefined|null|NaN/);
      }
      expect(r.headline).not.toMatch(/NaN|undefined/);
    }
  });

  it('숫자를 지어내지 않는다 — 본문의 "N점"은 전부 계산 결과에 있는 값이다', () => {
    const rnd2 = mulberry32(20260815);
    for (let i = 0; i < 120; i++) {
      const a = pool[Math.floor(rnd2() * pool.length)]!;
      const b = pool[Math.floor(rnd2() * pool.length)]!;
      const result = computeCompatibility(a.chart, b.chart, a.profile, b.profile);
      const report = buildCompatReport(result);
      const allowed = new Set<string>([
        String(result.score),
        String(result.zodiac.score),
        ...(result.mbti === null ? [] : [String(result.mbti.score)]),
        ...(result.blood === null ? [] : [String(result.blood.score)]),
        ...result.saju.items.flatMap((it) => [
          String(it.cap),
          String(Number.isInteger(it.score) ? it.score : it.score.toFixed(1)),
        ]),
      ]);
      const body = report.sections.map((s) => s.body).join('\n');
      for (const m of body.matchAll(/(\d+(?:\.\d+)?)점/g)) {
        expect(allowed.has(m[1]!), `${m[1]} 점은 결과에 없는 숫자다`).toBe(true);
      }
    }
  });
});
