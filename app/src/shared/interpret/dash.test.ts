/**
 * 화면에 나가는 문자열에 엠대시가 없다.
 *
 * 엠대시는 지식베이스의 **구조 구분자**다(카드 198장 중 156장 제목이 `라벨 — 값`). 그래서
 * 소스를 grep 하면 수백 건이 나오지만 대부분 화면에 닿지 않는다. 반대로 카드 본문이 문장으로
 * 인용될 때는 화면까지 따라온다 — 실측 결과 사용자가 보는 문자열 52개 중 12개에 있었다.
 *
 * 그래서 이 테스트는 소스가 아니라 **렌더 결과**를 본다. 규칙 근거는
 * `design-taste-frontend` 스킬 §9.G(엠대시 전면 금지).
 */
import { describe, expect, it } from 'vitest';
import { computeChart } from '../lib/saju';
import { computeCompatibility } from '../lib/compat';
import { buildRuleBasedReport } from '../../features/report/buildReport';
import { buildCompatReport, COMPAT_SECTION_TITLES } from '../../features/compat';
import { DISCLAIMERS, SECTION_TITLES } from './ui';
import { labelColon } from './dash';

const RAW = {
  calendarType: 'solar' as const,
  year: 1993,
  month: 5,
  day: 16,
  hour: 12,
  minute: 0,
  timeUnknown: false,
  gender: 'M' as const,
  birthPlace: { region: 'KR' as const },
};

/** 사용자가 실제로 읽는 문자열 전부. 새 표시 문구가 늘면 여기 더한다. */
function visibleStrings(): { where: string; text: string }[] {
  const chart = computeChart(RAW);
  const partner = computeChart({ ...RAW, year: 1992, month: 11, day: 3, gender: 'F' });
  const out: { where: string; text: string }[] = [];

  const report = buildRuleBasedReport(chart, { mbti: 'INFP', blood: 'A' });
  out.push({ where: 'headline', text: report.interpretation.headline });
  out.push({ where: 'actionToday', text: report.interpretation.actionToday });
  for (const s of report.interpretation.sections) out.push({ where: `section:${s.id}`, text: s.body });
  for (const [k, v] of Object.entries(SECTION_TITLES)) out.push({ where: `sectionTitle:${k}`, text: v });
  for (const d of DISCLAIMERS) out.push({ where: 'disclaimer', text: d });

  const compat = computeCompatibility(
    chart,
    partner,
    { mbti: 'INFP', blood: 'A' },
    { mbti: 'ENFJ', blood: 'B' },
  );
  const cr = buildCompatReport(compat, { sameGender: false });
  out.push({ where: 'compat.headline', text: cr.headline });
  out.push({ where: 'compat.summary', text: cr.summary });
  for (const s of cr.sections) out.push({ where: `compat.section:${s.id}`, text: s.body });
  for (const [k, v] of Object.entries(COMPAT_SECTION_TITLES)) {
    out.push({ where: `compatTitle:${k}`, text: v });
  }
  for (const d of cr.disclaimers) out.push({ where: 'compat.disclaimer', text: d });
  return out;
}

describe('labelColon', () => {
  it('`라벨 — 값` 을 콜론으로 바꾼다', () => {
    expect(labelColon('강점 — 공감, 창의')).toBe('강점: 공감, 창의');
  });

  it('엔대시도 함께 처리한다', () => {
    expect(labelColon('강점 – 공감')).toBe('강점: 공감');
  });

  /** 앞에 이미 문장부호가 있으면 `.:` 같은 이중 부호를 만들지 않는다. */
  it('부호 뒤에서는 콜론을 겹치지 않는다', () => {
    expect(labelColon('끝났어요. — 다음')).toBe('끝났어요. 다음');
    expect(labelColon('A · — B')).toBe('A · B');
  });

  /** 가운뎃점이 **앞 단어에 붙어 있지 않으면** 콜론이 맞다 — 나열의 끝이 아니라 라벨의 끝이다. */
  it('나열 뒤라도 단어로 끝나면 콜론이다', () => {
    expect(labelColon('A · B — C')).toBe('A · B: C');
  });

  it('엠대시가 없으면 그대로 둔다', () => {
    expect(labelColon('바뀔 것이 없는 문장입니다.')).toBe('바뀔 것이 없는 문장입니다.');
  });
});

describe('렌더 결과의 엠대시', () => {
  const strings = visibleStrings();

  it('검사할 문자열이 실제로 있다 — 없으면 이 테스트가 헛돈다', () => {
    expect(strings.length).toBeGreaterThan(30);
  });

  it('사용자가 보는 문자열에 엠대시가 없다', () => {
    const bad = strings.filter((s) => /[—–]/.test(s.text));
    expect(
      bad.length,
      bad.map((b) => `[${b.where}] ${b.text.slice(0, 80)}`).join('\n'),
    ).toBe(0);
  });
});
