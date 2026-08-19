/**
 * 규칙 기반 렌더러 회귀.
 *
 * 픽스처를 쓰지 않는다 — **실제 `computeChart()` 출력**과 **실제 지식카드 198장**으로 돌린다.
 * 그래야 "엔진이 내는 모양"과 "카드 저작 규약"이 어긋나는 순간 여기서 깨진다.
 */

import { describe, expect, it } from 'vitest';

import { computeChart, type Chart, type RawBirthInput } from '../lib/saju';
import { CARDS } from '../knowledge';
import type { KnowledgeCard, SectionId, UserProfile } from './contracts';
import { buildFactPack, ganjiAllowList, numberAllowList } from './factPack';
import { selectKnowledgeCards } from './retrieve';
import { renderTemplateReport } from './template';
import { findBannedPhrases } from './guard';
import { rawInterpretationSchema } from './schema';
import { toRawShape } from './client';
import { SECTION_TITLES } from './copy';

const SEOUL = { latitude: 37.5665, longitude: 126.9784204 };

/** 대표 차트 4개. 자기신고 값의 유무·삼주 모드·십신 분포가 서로 다르다. */
const CASES: readonly {
  readonly label: string;
  readonly raw: RawBirthInput;
  readonly profile: UserProfile;
}[] = [
  {
    label: '1990-05-15 14:30 서울 남 · ENFP · O형',
    raw: {
      calendarType: 'solar',
      year: 1990,
      month: 5,
      day: 15,
      hour: 14,
      minute: 30,
      timeUnknown: false,
      gender: 'M',
      birthPlace: SEOUL,
    },
    profile: { gender: 'M', mbti: 'ENFP', blood: 'O' },
  },
  {
    label: '2000-01-01 12:00 서울 여 · 자기신고 없음',
    raw: {
      calendarType: 'solar',
      year: 2000,
      month: 1,
      day: 1,
      hour: 12,
      minute: 0,
      timeUnknown: false,
      gender: 'F',
      birthPlace: SEOUL,
    },
    profile: { gender: 'F', mbti: null, blood: null },
  },
  {
    label: '1993-05-16 시각 모름 서울 남 · INTJ · A형 (삼주)',
    raw: {
      calendarType: 'solar',
      year: 1993,
      month: 5,
      day: 16,
      timeUnknown: true,
      gender: 'M',
      birthPlace: SEOUL,
    },
    profile: { gender: 'M', mbti: 'INTJ', blood: 'A' },
  },
  {
    label: '1978-11-03 04:05 서울 여 · ISTJ · AB형',
    raw: {
      calendarType: 'solar',
      year: 1978,
      month: 11,
      day: 3,
      hour: 4,
      minute: 5,
      timeUnknown: false,
      gender: 'F',
      birthPlace: SEOUL,
    },
    profile: { gender: 'F', mbti: 'ISTJ', blood: 'AB' },
  },
];

/** 규칙 기반 리포트 경로. `features/report` 와 같은 상한을 쓴다(그쪽이 정본). */
/** `features/report/buildReport.ts` 의 `REPORT_RETRIEVAL` 과 같은 값이어야 한다(화면과 같은 조건으로 돌린다). */
const RETRIEVAL = { maxCards: 64, maxPerSystem: 40, maxPerKind: 14 };

function render(raw: RawBirthInput, profile: UserProfile) {
  const chart: Chart = computeChart(raw);
  const fact = buildFactPack(chart, profile, 'fusion');
  const cards: readonly KnowledgeCard[] = selectKnowledgeCards(fact, CARDS, RETRIEVAL);
  return { chart, fact, cards, report: renderTemplateReport(fact, cards) };
}

/**
 * 규칙 기반 렌더러가 만들 수 있는 섹션 전부. `SECTION_ORDER` 와 같은 순서다.
 * 여기 없는 id 가 나오면 렌더러가 근거 없는 섹션을 만든 것이고, 순서가 어긋나면 IA(문서10 §8)가 깨진 것이다.
 */
const ALLOWED_SECTIONS: readonly SectionId[] = [
  'saju',
  'sipsin',
  'jiji',
  'sinsal',
  'strength',
  'luck',
  'zodiac',
  'mbti',
  'blood',
  'intersection',
  'conflict',
];

describe('renderTemplateReport — 대표 차트', () => {
  for (const { label, raw, profile } of CASES) {
    describe(label, () => {
      const { chart, fact, cards, report } = render(raw, profile);

      it('예외 없이 섹션을 만든다', () => {
        expect(report.sections.length).toBeGreaterThan(0);
        expect(report.headline.length).toBeGreaterThan(3);
      });

      it('usedCardIds 가 비지 않고 전부 검색된 카드 안에 있다', () => {
        expect(report.usedCardIds.length).toBeGreaterThan(0);
        const allowed = new Set(cards.map((c) => c.id));
        for (const id of report.usedCardIds) expect(allowed.has(id)).toBe(true);
        // 중복 없이 쌓인다(같은 카드를 두 섹션에서 써도 한 번만 남는다).
        expect(new Set(report.usedCardIds).size).toBe(report.usedCardIds.length);
      });

      it('선언된 섹션만, 선언된 순서로 만든다', () => {
        const ids = report.sections.map((s) => s.id);
        for (const id of ids) expect(ALLOWED_SECTIONS).toContain(id);
        // 실제 순서가 ALLOWED_SECTIONS 의 부분수열이어야 한다(섹션이 빠질 수는 있어도 뒤바뀌면 안 된다).
        expect(ids).toEqual(ALLOWED_SECTIONS.filter((id) => ids.includes(id)));
      });

      it('결정론 — 두 번 호출하면 문자 단위로 같다', () => {
        const again = renderTemplateReport(fact, cards);
        expect(JSON.stringify(again)).toBe(JSON.stringify(report));
        // 카드 배열을 뒤집어도 검색이 같은 순서를 내므로 리포트도 같다
        const reSelected = selectKnowledgeCards(fact, [...CARDS].reverse(), RETRIEVAL);
        expect(JSON.stringify(renderTemplateReport(fact, reSelected))).toBe(JSON.stringify(report));
      });

      it('LLM 응답과 같은 스키마를 만족한다(길이 제약 포함)', () => {
        const parsed = rawInterpretationSchema.safeParse(toRawShape(report));
        if (!parsed.success) {
          throw new Error(
            `스키마 위반: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
          );
        }
      });

      it('금지 표현이 없다(guard 와 같은 목록)', () => {
        const text = [report.headline, report.actionToday, ...report.sections.map((s) => s.body)].join(
          '\n',
        );
        expect(findBannedPhrases(text)).toEqual([]);
      });

      it('원국·대운에 없는 간지를 말하지 않는다', () => {
        const allowed = ganjiAllowList(fact);
        const text = [report.headline, report.actionToday, ...report.sections.map((s) => s.body)].join(
          '\n',
        );
        const stems = '甲乙丙丁戊己庚辛壬癸';
        const branches = '子丑寅卯辰巳午未申酉戌亥';
        for (const m of text.matchAll(new RegExp(`[${stems}][${branches}]`, 'g'))) {
          expect(allowed.has(m[0])).toBe(true);
        }
      });

      it('팩트팩에 없는 수치를 "N점"·"N%" 로 쓰지 않는다', () => {
        const allowed = numberAllowList(fact);
        const text = [report.actionToday, ...report.sections.map((s) => s.body)].join('\n');
        for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(점|%|퍼센트)/g)) {
          expect(allowed.has(m[1] ?? '')).toBe(true);
        }
      });

      /**
       * 예전에는 "본문에 소수가 있으면 곧 유출"이었다. S5 가 붙으면서 오행 점수·신강지수가 정식
       * 인용 대상이 됐으므로 규칙을 **화이트리스트**로 바꾼다: 본문에 나오는 모든 소수는 팩트팩이
       * 실제로 들고 있는 값이어야 한다. 렌더러가 계산해 만든 소수는 여전히 여기서 걸린다.
       */
      it('본문의 모든 소수는 팩트팩이 들고 있는 값이다', () => {
        const allowed = numberAllowList(fact);
        const text = report.sections.map((s) => s.body).join('\n');
        const seen = [...text.matchAll(/\d+\.\d+/g)].map((m) => m[0]);
        for (const n of seen) expect(allowed.has(n), n).toBe(true);
      });

      it('오행 점수와 신강지수는 엔진 값을 그대로 옮긴다', () => {
        const st = fact.saju.strength;
        if (st === null) throw new Error('S5 는 더 이상 옵셔널이 아니다');
        const body = report.sections.find((s) => s.id === 'strength')?.body ?? '';
        expect(body).not.toBe('');
        expect(body).toContain(String(st.strengthIndex));
        expect(body).toContain(st.strengthGrade);
        expect(body).toContain(st.geokguk);
        expect(body).toContain(st.yongsin.primary);
        for (const e of ['木', '火', '土', '金', '水'] as const) {
          expect(body).toContain(`${e} ${st.elementScores[e]}`);
        }
        // 엔진이 SI 를 소수로 낸 사주라면 그 소수가 본문에 실제로 등장한다(위 화이트리스트가 헛돌지 않는다)
        expect(body).toContain(String(chart.strength.strength.SI));
      });

      it('모든 섹션에 화면 제목이 있다', () => {
        for (const s of report.sections) expect(SECTION_TITLES[s.id]).toBeTruthy();
      });

      it('사주 여덟 글자와 첫 대운이 본문에 그대로 들어간다', () => {
        const body = report.sections.map((s) => s.body).join('\n');
        expect(body).toContain(chart.pillars.gz8);
        const first = fact.saju.daewoon[0];
        if (first !== undefined) expect(body).toContain(first.ganji);
      });
    });
  }
});

describe('renderTemplateReport — 섹션 유무', () => {
  const withProfile = render(CASES[0]!.raw, CASES[0]!.profile);
  const withoutProfile = render(CASES[1]!.raw, CASES[1]!.profile);

  it('자기신고 값이 있으면 MBTI·혈액형 섹션이 생긴다', () => {
    const ids = withProfile.report.sections.map((s) => s.id);
    expect(ids).toContain('mbti');
    expect(ids).toContain('blood');
  });

  it('자기신고 값이 없으면 두 섹션이 아예 없다(빈 섹션을 만들지 않는다)', () => {
    const ids = withoutProfile.report.sections.map((s) => s.id);
    expect(ids).not.toContain('mbti');
    expect(ids).not.toContain('blood');
  });

  it('엔진 계산만으로 서는 일곱 섹션은 자기신고 없이도 항상 채워진다', () => {
    // sinsal(S4-2)·zodiac(S7)이 붙으면서 다섯에서 일곱이 됐다. 자기신고 값은 이 일곱에 관여하지 않는다.
    for (const id of ['saju', 'sipsin', 'jiji', 'sinsal', 'strength', 'luck', 'zodiac']) {
      expect(withoutProfile.report.sections.map((s) => s.id), id).toContain(id);
    }
  });

  it('신강신약 섹션은 지지 다음, 대운 앞에 온다', () => {
    const ids = withProfile.report.sections.map((s) => s.id);
    expect(ids.indexOf('strength')).toBeGreaterThan(ids.indexOf('jiji'));
    expect(ids.indexOf('strength')).toBeLessThan(ids.indexOf('luck'));
  });

  it('팩트팩에 strength 가 없으면 그 섹션이 사라진다(없는 걸 있는 척하지 않는다)', () => {
    const chart = computeChart(CASES[0]!.raw);
    const fact = buildFactPack(chart, CASES[0]!.profile, 'fusion');
    // S5 이전 차트가 들어온 상황을 그대로 재현한다 — 팩트팩에서 strength 만 뺀다.
    const legacy = { ...fact, saju: { ...fact.saju, strength: null } };
    const cards = selectKnowledgeCards(legacy, CARDS, RETRIEVAL);
    const report = renderTemplateReport(legacy, cards);
    expect(report.sections.map((s) => s.id)).not.toContain('strength');
    // 헤드라인에서도 등급이 빠진다(엔진 값이 없으면 말하지 않는다)
    expect(report.headline).not.toContain(fact.saju.strength?.strengthGrade ?? 'X');
  });

  it('삼주 모드면 시주 칸을 배치에서 빼고 그 사실을 밝힌다', () => {
    const three = render(CASES[2]!.raw, CASES[2]!.profile);
    const saju = three.report.sections.find((s) => s.id === 'saju')?.body ?? '';
    const sipsin = three.report.sections.find((s) => s.id === 'sipsin')?.body ?? '';
    expect(saju).toContain('세 기둥');
    expect(sipsin).not.toContain('시주');
  });

  it('일지와 월지가 같은 글자면 "두 자리의 오행" 을 지어내지 않는다', () => {
    // 1985-01-01 12:00 서울: 甲子 丙子 庚子 — 일지·월지가 모두 子라 jiji 카드가 한 장만 매칭된다.
    const { fact, report } = render(
      {
        calendarType: 'solar',
        year: 1985,
        month: 1,
        day: 1,
        hour: 10,
        minute: 0,
        timeUnknown: false,
        gender: 'M',
        birthPlace: SEOUL,
      },
      { gender: 'M', mbti: null, blood: null },
    );
    expect(fact.saju.dayBranch).toBe(fact.saju.monthBranch);
    const jiji = report.sections.find((s) => s.id === 'jiji')?.body ?? '';
    expect(jiji).toContain('같은 글자');
    expect(jiji).not.toContain('두 자리의 오행은');
    // 카드는 한 장만 근거로 남는다(같은 카드를 두 번 세지 않는다).
    expect(report.usedCardIds.filter((id) => id.startsWith('jiji:'))).toEqual(['jiji:子']);
  });

  it('카드가 하나도 없으면 계산값만으로 서는 두 섹션이 남는다', () => {
    const chart = computeChart(CASES[0]!.raw);
    const fact = buildFactPack(chart, CASES[0]!.profile, 'fusion');
    const report = renderTemplateReport(fact, []);
    // strength·luck 은 근거가 엔진 계산값이라 카드 없이도 선다. 나머지는 카드가 없으면 사라진다.
    expect(report.sections.map((s) => s.id)).toEqual(['strength', 'luck']);
    expect(report.usedCardIds).toEqual([]);
  });
});

describe('renderTemplateReport — 신살 섹션', () => {
  const { chart, fact, report } = render(CASES[0]!.raw, CASES[0]!.profile);
  const body = report.sections.find((s) => s.id === 'sinsal')?.body ?? '';

  it('엔진이 판정한 신살만 말한다(자리표에서 이름을 끌어오지 않는다)', () => {
    expect(body).not.toBe('');
    const engineNames = new Set(chart.sinsal.sinsal.map((s) => s.name));
    expect(engineNames.size).toBeGreaterThan(0);
    for (const id of report.usedCardIds.filter((x) => x.startsWith('sinsal:'))) {
      expect(engineNames.has(id.slice('sinsal:'.length)), id).toBe(true);
    }
    // 엔진이 붙이지 않은 신살 이름은 본문에 없다.
    for (const card of CARDS.filter((c) => c.kind === 'sinsal' && !engineNames.has(c.key))) {
      expect(body, card.key).not.toContain(card.key);
    }
  });

  it('붙은 자리는 엔진이 준 기둥 그대로다', () => {
    const LABEL = { year: '연주', month: '월주', day: '일주', hour: '시주' } as const;
    const hits = fact.saju.sinsalHits ?? [];
    expect(hits.length).toBeGreaterThan(0);
    for (const m of body.matchAll(/([가-힣]+)이 걸린 자리는 ([연월일시]주(?:·[연월일시]주)*)/g)) {
      const hit = hits.find((h) => h.name === m[1]);
      if (hit === undefined) throw new Error(`엔진에 없는 신살: ${m[1]}`);
      expect(hit.pillars.map((p) => LABEL[p]).join('·')).toBe(m[2]);
    }
  });

  it('점수를 말하지 않고, 구체적 사건 단정을 하지 않는다(카드 본문의 요구)', () => {
    expect(body).not.toMatch(/\d/);
    expect(body).toContain('그 이름에서 병이나 사고 같은 구체적인 사건을 끌어내지는 않습니다');
    expect(findBannedPhrases(body)).toEqual([]);
  });

  it('신살이 없는 차트에서는 섹션이 사라진다', () => {
    const empty = { ...fact, saju: { ...fact.saju, sinsalHits: [], sinsalNames: [] } };
    const cards = selectKnowledgeCards(empty, CARDS, RETRIEVAL);
    expect(renderTemplateReport(empty, cards).sections.map((s) => s.id)).not.toContain('sinsal');
  });
});

describe('renderTemplateReport — 별자리 섹션', () => {
  const { chart, report, cards } = render(CASES[0]!.raw, CASES[0]!.profile);
  const body = report.sections.find((s) => s.id === 'zodiac')?.body ?? '';

  it('엔진이 계산한 사인 이름과 원소를 그대로 옮긴다', () => {
    expect(body).toContain(chart.astro.sun.signKo);
    expect(report.usedCardIds).toContain(`zodiac:${chart.astro.sun.signId}`);
    expect(report.usedCardIds).toContain(`zodiac:원소:${chart.astro.sun.element}`);
  });

  it('월지와의 중복성을 반드시 밝힌다(문서10 §2.6)', () => {
    expect(body).toContain('사주의 월지와 약 15일 어긋난 같은 12분할');
    expect(report.usedCardIds).toContain('fusion:통합:별자리중복');
  });

  it('생시를 모르면 달 별자리가 가정값임을 밝힌다', () => {
    const three = render(CASES[2]!.raw, CASES[2]!.profile);
    expect(three.chart.astro.moon.assumedNoon).toBe(true);
    const threeBody = three.report.sections.find((s) => s.id === 'zodiac')?.body ?? '';
    expect(threeBody).toContain('낮 12시를 가정한 값');
  });

  it('카드 값의 괄호 주석·자리표시자가 새지 않는다', () => {
    expect(body).not.toContain('트라인)');
    expect(body).not.toMatch(/—\s*[,.]/);
    expect(body).not.toMatch(/undefined|null/);
    // 별자리를 사주 띠와 같은 것으로 읽히게 하는 방위 대응표는 쓰지 않는다.
    expect(body).not.toContain('방위 대응');
    expect(cards.some((c) => c.id === `zodiac:${chart.astro.sun.signId}`)).toBe(true);
  });
});

describe('renderTemplateReport — 융합 섹션(교집합 · 충돌)', () => {
  it('일치한 축은 교집합으로, 갈린 축은 충돌로 간다', () => {
    // 1993-05-16 · INTJ: 일간 壬(水→I)·월지 巳(火→E)·별자리 원소 흙(S) vs INTJ 의 N.
    const { report } = render(CASES[2]!.raw, CASES[2]!.profile);
    const inter = report.sections.find((s) => s.id === 'intersection')?.body ?? '';
    const conflict = report.sections.find((s) => s.id === 'conflict')?.body ?? '';
    expect(inter).not.toBe('');
    expect(conflict).not.toBe('');
    // 일치는 "같은 방향", 불일치는 "갈리는" 어휘로 나뉜다.
    expect(inter).toContain('같은 방향을 가리킵니다');
    expect(conflict).toContain('방향이 갈리는');
  });

  it('충돌 서술이 어느 한쪽을 부정하지 않는다(문서10 §5 · §3.3 3원칙)', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const body = report.sections.find((s) => s.id === 'conflict')?.body ?? '';
    expect(body).not.toBe('');
    expect(body).toContain('어느 한쪽이 틀린 것이 아니라 결이 다른 층입니다');
    // "틀렸다/아니다/맞지 않는다" 로 한쪽을 지우는 문장이 없다.
    expect(body).not.toMatch(/(사주|MBTI|별자리|혈액형)[가는은이]?\s*(틀렸|아닙니다|맞지)/);
    expect(findBannedPhrases(body)).toEqual([]);
  });

  it('충돌은 한 번에 한 축만 짚는다(제목이 "딱 하나"다)', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const body = report.sections.find((s) => s.id === 'conflict')?.body ?? '';
    expect([...body.matchAll(/방향인데/g)]).toHaveLength(1);
    expect(SECTION_TITLES.conflict).toBe('그런데 딱 하나, 어긋나는 지점');
  });

  it('혈액형은 교집합 계산에도 충돌 서술에도 들어가지 않는다', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const text = report.sections
      .filter((s) => s.id === 'intersection' || s.id === 'conflict')
      .map((s) => s.body)
      .join('\n');
    // 혈액형 통념 카드(`blood:O`)의 키워드가 공통 키워드로 새어 나오면 안 된다.
    const bloodCard = CARDS.find((c) => c.id === 'blood:O');
    for (const kw of bloodCard?.keywords ?? []) {
      if (kw.length < 2 || kw === '혈액형') continue;
      expect(text, kw).not.toContain(`${kw}(`);
    }
    expect(text).toContain('혈액형은 이 비교에');
  });

  it('견줄 축이 하나도 없으면 두 섹션이 다 사라진다', () => {
    // 자기신고 없음 + 土 일간(문서10 §2.1 에서 중립) → 비교 가능한 축이 없다.
    const { fact, report } = render(CASES[1]!.raw, CASES[1]!.profile);
    expect(fact.saju.dayElement).toBe('土');
    expect(fact.mbti).toBeNull();
    const ids = report.sections.map((s) => s.id);
    expect(ids).not.toContain('intersection');
    expect(ids).not.toContain('conflict');
  });

  it('가로지르는 고지는 두 섹션 중 정확히 한 곳에서만 나온다', () => {
    for (const c of CASES) {
      const { report } = render(c.raw, c.profile);
      const hits = report.sections.filter(
        (s) =>
          (s.id === 'intersection' || s.id === 'conflict') &&
          s.body.includes('혈액형은 이 비교에 들어가지 않습니다'),
      );
      expect(hits.length, c.label).toBeLessThanOrEqual(1);
    }
  });

  it('융합 섹션에는 우리가 만든 점수가 없다(일치도 숫자를 지어내지 않는다)', () => {
    for (const c of CASES) {
      const { report } = render(c.raw, c.profile);
      for (const s of report.sections) {
        if (s.id !== 'intersection' && s.id !== 'conflict') continue;
        expect(s.body, `${c.label}/${s.id}`).not.toMatch(/\d/);
      }
    }
  });
});

describe('renderTemplateReport — 신강신약과 용신 섹션', () => {
  const { chart, fact, cards, report } = render(CASES[0]!.raw, CASES[0]!.profile);
  const body = report.sections.find((s) => s.id === 'strength')?.body ?? '';
  const strength = fact.saju.strength!;

  it('섹션이 존재하고 화면 제목이 붙어 있다', () => {
    expect(body).not.toBe('');
    expect(SECTION_TITLES.strength).toBe('신강신약과 용신');
  });

  it('용신·기신 오행이 엔진 배열 그대로 나온다', () => {
    expect(body).toContain(strength.yongsin.favorable.join('·'));
    if (strength.yongsin.avoid.length > 0) {
      expect(body).toContain(strength.yongsin.avoid.join('·'));
    }
    // 엔진이 기신으로 잡은 오행을 "힘이 되는 오행"으로 뒤집어 말하지 않는다
    for (const e of strength.yongsin.avoid) {
      expect(body).not.toContain(`함께 힘이 되는 오행은 ${e}`);
    }
  });

  it('오행을 점수 크기로 다시 정렬하지 않는다(木火土金水 고정)', () => {
    const order = ['木', '火', '土', '金', '水'].map((e) => body.indexOf(`${e} `));
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    }
    // "가장 강한/약한 오행" 같은 새 지표를 만들지 않는다
    expect(body).not.toMatch(/가장 (강한|약한|높은|낮은)/);
  });

  it('십이운성·격국 카드를 실제 근거로 남긴다', () => {
    expect(body).toContain(strength.unseongIlji);
    expect(report.usedCardIds).toContain(`unseong:${strength.unseongIlji}`);
    expect(report.usedCardIds).toContain(`yongsin:격국:${strength.geokguk}`);
    // 근거로 남은 카드는 전부 검색 결과 안에 있다
    const allowed = new Set(cards.map((c) => c.id));
    for (const id of report.usedCardIds) expect(allowed.has(id)).toBe(true);
  });

  /**
   * 이 섹션의 **숫자는 두 종류뿐**이다: 오행 점수 5개와 신강지수 1개. 둘 다 엔진 값이다.
   * 십신 그룹 배점(`tenGodWeights`)은 같은 체계라 `numberAllowList` 는 통과하지만,
   * 오행 단위로 이미 말한 값을 십신 단위로 한 번 더 흘리면 서로 다른 점수처럼 읽힌다.
   */
  it('섹션에 등장하는 수치는 오행 점수와 신강지수뿐이다', () => {
    const allowed = new Set<string>([
      String(strength.strengthIndex),
      ...(['木', '火', '土', '金', '水'] as const).map((e) => String(strength.elementScores[e])),
    ]);
    const seen = [...body.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
    expect(seen.length).toBe(6);
    for (const n of seen) expect(allowed.has(n), n).toBe(true);
  });

  it('용신 경로는 엔진 유니온 순서대로 적는다(억부 → 격국)', () => {
    expect(strength.yongsin.route).toBe('抑扶+格局');
    expect(body).toContain('억부(抑扶)·격국(格局) 경로로');
  });

  it('억부 카드의 조건문("신약이면 …")을 그대로 옮기지 않는다', () => {
    // 억부 카드는 오행→십신 대응표로만 쓴다. 조후·종격 경로에서 엔진 결과와 어긋나기 때문이다.
    expect(body).not.toContain('용신 순서');
    expect(body).not.toContain('중립 밴드');
  });

  it('단정 예언·의료·재무·법률 조언이 되지 않는다(guard 목록)', () => {
    expect(findBannedPhrases(body)).toEqual([]);
    // 등급·용신을 "좋다/나쁘다"로 읽히지 않게 본문이 직접 못박는다
    expect(body).toContain('높으면 좋고 낮으면 나쁜 눈금이 아니라');
    expect(body).toContain('가르는 판정이 아니라');
    expect(body).toContain('좋고 나쁨의 등급이 아니라');
  });

  /**
   * 대표 4건으로는 특수격(종세격·전왕격)도 조후·종격 경로도 나오지 않는다.
   * 카드가 없는 격, 대시(`—`) 자리표시자, 빈 `avoid` 배열은 전부 그런 사주에서만 나타나므로
   * 실제 사주를 넓게 훑어 **한 건도 깨지지 않는지** 고정한다(≈2,200건, 1초 미만).
   */
  it('전 구간 스윕 — 어떤 사주에서도 자리표시자·미허용 수치·금지어가 새지 않는다', () => {
    const seenGeokguk = new Set<string>();
    const seenRoute = new Set<string>();
    let charts = 0;
    for (let year = 1930; year <= 2020; year += 3) {
      for (let month = 1; month <= 12; month += 1) {
        for (const day of [4, 26]) {
          for (const gender of ['M', 'F'] as const) {
            const c = computeChart({ ...CASES[0]!.raw, year, month, day, gender });
            const fact = buildFactPack(c, { gender, mbti: null, blood: null }, 'fusion');
            const cards = selectKnowledgeCards(fact, CARDS, RETRIEVAL);
            const text = renderTemplateReport(fact, cards).sections.find((s) => s.id === 'strength')
              ?.body;
            charts += 1;
            seenGeokguk.add(c.strength.geokguk.name);
            seenRoute.add(c.strength.yongsin.route);

            if (text === undefined) throw new Error(`strength 섹션 없음: ${c.pillars.gz8}`);
            // 카드의 대시 자리표시자(`유형 — —`)와 undefined/null 이 문장으로 새지 않는다
            expect(text, c.pillars.gz8).not.toMatch(/—|undefined|null/);
            expect(findBannedPhrases(text), c.pillars.gz8).toEqual([]);
            const allowed = new Set<string>([
              String(c.strength.strength.SI),
              ...(['木', '火', '土', '金', '水'] as const).map((e) =>
                String(fact.saju.strength!.elementScores[e]),
              ),
            ]);
            for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
              expect(allowed.has(m[0]), `${m[0]} @ ${c.pillars.gz8}`).toBe(true);
            }
          }
        }
      }
    }
    expect(charts).toBeGreaterThan(1000);
    // 스윕이 실제로 특수격과 세 도출 경로를 다 밟았는지 — 밟지 못했다면 위 단언들이 헛돌았다는 뜻이다
    expect(seenGeokguk.has('종세격') || seenGeokguk.has('전왕격')).toBe(true);
    expect([...seenRoute].sort()).toEqual(['抑扶+格局', '從/專旺', '調候'].sort());
  });

  it('결정론 — 엔진 값이 그대로 흐른다', () => {
    expect(strength.strengthIndex).toBe(chart.strength.strength.SI);
    expect(strength.unseongIlji).toBe(chart.strength.strength.deuk.unseongIlji);
    expect(strength.geokguk).toBe(chart.strength.geokguk.name);
  });
});

/**
 * 새 섹션 넷(신살·별자리·교집합·충돌)은 **카드 본문을 그대로 실어 나르는 슬롯이 많다.**
 * 대표 4건으로는 긴 신살 목록, 자리표시자(`—`), 파싱 실패로 생기는 `undefined`, 스키마 길이 상한
 * 초과가 드러나지 않는다. 실제 사주를 넓게 훑어 **한 건도 새지 않는지** 고정한다(≈1,500건, 2초 미만).
 */
describe('renderTemplateReport — 전 구간 스윕 (전체 리포트)', () => {
  it('어떤 사주에서도 스키마·금지어·자리표시자가 깨지지 않는다', () => {
    const MBTIS = [null, 'ENFP', 'INTJ', 'ISTJ', 'ESFP'] as const;
    const BLOODS = [null, 'A', 'B', 'O', 'AB'] as const;
    const seenSections = new Set<string>();
    let charts = 0;
    let maxBody = 0;
    for (let year = 1935; year <= 2020; year += 5) {
      for (let month = 1; month <= 12; month += 1) {
        for (const day of [3, 18]) {
          for (const gender of ['M', 'F'] as const) {
            charts += 1;
            const profile: UserProfile = {
              gender,
              mbti: MBTIS[charts % MBTIS.length] ?? null,
              blood: BLOODS[charts % BLOODS.length] ?? null,
            };
            const chart = computeChart({ ...CASES[0]!.raw, year, month, day, gender });
            const fact = buildFactPack(chart, profile, 'fusion');
            const cards = selectKnowledgeCards(fact, CARDS, RETRIEVAL);
            const report = renderTemplateReport(fact, cards);
            const where = `${chart.pillars.gz8}/${profile.mbti}/${profile.blood}`;

            const parsed = rawInterpretationSchema.safeParse(toRawShape(report));
            if (!parsed.success) {
              throw new Error(`${where} 스키마 위반: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
            }
            for (const s of report.sections) {
              seenSections.add(s.id);
              maxBody = Math.max(maxBody, s.body.length);
              expect(s.body, `${where}/${s.id}`).not.toMatch(/undefined|null|\{[A-Z가-힣]+\}/);
              // 카드의 대시 자리표시자와 인용 표기·편집 주석이 새지 않는다.
              expect(s.body, `${where}/${s.id}`).not.toMatch(/§|⚠|\[[^\]]*\]/);
            }
            expect(findBannedPhrases(report.sections.map((s) => s.body).join('\n')), where).toEqual([]);
            // 팩트팩에 없는 수치를 단위와 함께 쓰지 않는다.
            const allowed = numberAllowList(fact);
            for (const m of report.sections
              .map((s) => s.body)
              .join('\n')
              .matchAll(/(\d+(?:\.\d+)?)\s*(점|%|퍼센트)/g)) {
              expect(allowed.has(m[1] ?? ''), `${where} ${m[0]}`).toBe(true);
            }
          }
        }
      }
    }
    expect(charts).toBeGreaterThan(800);
    // 본문 최장 길이가 스키마 상한(1200자)에 여유를 두고 들어온다.
    expect(maxBody).toBeLessThan(1200);
    // 스윕이 열한 섹션을 전부 밟았는지 — 밟지 못했다면 위 단언들이 그 섹션에서 헛돌았다는 뜻이다.
    expect([...seenSections].sort()).toEqual(
      [...ALLOWED_SECTIONS].sort(),
    );
  });
});

describe('renderTemplateReport — 카드 규율', () => {
  it('원국에 없는 십신의 카드로 문장을 쓰지 않는다', () => {
    // 1993-05-16: 재성 그룹이 우세해 정재·편재 카드가 함께 검색되지만 원국에는 편재만 있다.
    const { fact, cards, report } = render(CASES[2]!.raw, CASES[2]!.profile);
    expect(cards.map((c) => c.id)).toContain('sipsin:정재');
    expect(fact.saju.tenGodNames).not.toContain('정재');
    expect(report.usedCardIds).not.toContain('sipsin:정재');
    expect(report.usedCardIds).toContain('sipsin:편재');
    expect(report.sections.find((s) => s.id === 'sipsin')?.body).not.toContain('정재');
  });

  it('낱말 목록의 조사가 받침에 맞는다', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const sipsin = report.sections.find((s) => s.id === 'sipsin')?.body ?? '';
    // 겁재(받침 없음) + 비견 → `겁재와 비견`. 고정 문자열로 이으면 `겁재과` 가 된다.
    expect(sipsin).toContain('겁재와 비견');
    expect(sipsin).not.toContain('겁재과');
    // 한자 뒤에는 조사를 붙이지 않는다(발음을 알 수 없어 받침 판정이 불가능하다).
    const luck = report.sections.find((s) => s.id === 'luck')?.body ?? '';
    expect(luck).not.toMatch(/[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥][은는이가을를와과로]/);
  });

  it('혈액형은 말투만 정하고 성격을 판정하지 않는다', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const blood = report.sections.find((s) => s.id === 'blood')?.body ?? '';
    expect(blood).toContain('성격을 판정하지 않습니다');
    expect(blood).toContain('확인된 근거가 없');
    // 혈액형 성격 카드(`blood:O`)의 통념 서술은 근거로 쓰지 않는다 — 문체 카드만 쓴다.
    expect(report.usedCardIds).toContain('blood:문체:O');
    expect(report.usedCardIds).not.toContain('blood:O');
  });

  it('혈액형이 다르면 어조 슬롯이 실제로 달라진다', () => {
    const a = render(CASES[0]!.raw, { gender: 'M', mbti: null, blood: 'A' }).report;
    const o = render(CASES[0]!.raw, { gender: 'M', mbti: null, blood: 'O' }).report;
    const first = (r: typeof a): string => r.sections[0]?.body ?? '';
    expect(first(a)).not.toBe(first(o));
    // 어조만 다르고 사실은 같다 — 같은 카드를 근거로 쓴다.
    expect(a.usedCardIds.filter((id) => !id.startsWith('blood:'))).toEqual(
      o.usedCardIds.filter((id) => !id.startsWith('blood:')),
    );
  });

  it('MBTI 카드의 16Personalities 별칭을 노출하지 않는다(문서05 상표권)', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const card = CARDS.find((c) => c.id === 'mbti:ENFP');
    const alias = card?.title.split(' — ')[1] ?? '';
    expect(alias).not.toBe('');
    const text = report.sections.map((s) => s.body).join('\n');
    expect(text).not.toContain(alias);
  });

  /**
   * 저작 규칙 카드 2장(문서10 §6.2 4단 구조 · §6.3 금지어)은 **조건 없이 조회**되므로
   * 인용 자리가 사라지면 "근거 목록에는 있는데 대응 문장이 없는" 카드가 된다.
   * 그 상태는 에러가 아니라 화면에서만 드러나므로 여기서 문장·인용을 함께 못박는다.
   */
  it('저작 규칙 2장은 각각 한 문장으로 밝히며 인용한다', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const saju = report.sections.find((s) => s.id === 'saju')?.body ?? '';
    const luck = report.sections.find((s) => s.id === 'luck')?.body ?? '';

    // §6.2 — 읽는 순서(관찰 → 양면 → 오늘 한 가지). ④는 섹션이 아니라 actionToday 블록이다.
    expect(report.usedCardIds).toContain('fusion:카피:4단구조');
    expect(saju).toContain('오늘 해볼 만한 한 가지');
    expect(report.actionToday.length).toBeGreaterThan(0);

    // §6.3 — 무엇을 말하지 않는지. 예언을 기대하는 자리(대운)에서 밝힌다.
    expect(report.usedCardIds).toContain('fusion:카피:금지어');
    expect(luck).toContain('단정하거나');

    // 금지 표현을 **예시로도** 인용하지 않는다 — 인용하는 순간 검사기에 걸린다.
    expect(findBannedPhrases([saju, luck].join('\n'))).toEqual([]);
  });

  it('카드의 인용 표기·편집 주석·표본 비율을 본문에 흘리지 않는다', () => {
    const { report } = render(CASES[0]!.raw, CASES[0]!.profile);
    const text = [report.headline, report.actionToday, ...report.sections.map((s) => s.body)].join(
      '\n',
    );
    expect(text).not.toContain('§');
    expect(text).not.toContain('⚠');
    expect(text).not.toMatch(/\[[^\]]*\]/);
    expect(text).not.toContain('인구 대표성 없음');
    expect(text).not.toContain('대한적십자사');
  });
});
