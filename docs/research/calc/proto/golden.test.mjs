// golden.test.mjs — golden-set.json 회귀 테스트 (vitest)
// 실행: npm install && npx vitest run --reporter=verbose
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fourPillars, daewoon, tenGodsOf } from './ref.mjs';
import { mans, lj } from './engines.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'golden-set.json'), 'utf8'));

const parse = (d, t) => {
  const [y, m, dd] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return { year: y, month: m, day: dd, hour: h, minute: mi };
};
// ⚠️ region:'GENERIC' 케이스는 stdOffsetMinutes / dstMinutes 를 **반드시** 넘겨야 한다.
//    안 넘기면 KR_TIMELINE 이 오적용되어 4기둥 4건·대운 2건이 실패한다(C00 적대검증 「반박된 정정 4」).
//    `utcOffsetMinutes` 는 골든셋 v1 별칭이므로 stdOffsetMinutes 로 승격해 넘긴다.
const toOpts = (i) => {
  const o = {
    applyTz: i.tzMode === 'historical',
    jasiRule: i.jasiRule,
    longitude: i.longitude,
    region: i.region ?? 'KR',
  };
  if (o.region === 'GENERIC') {
    o.stdOffsetMinutes = i.stdOffsetMinutes ?? i.utcOffsetMinutes;
    o.dstMinutes = i.dstMinutes ?? 0;
    if (typeof o.stdOffsetMinutes !== 'number')
      throw new Error(`${i.date} ${i.time}: region=GENERIC 인데 stdOffsetMinutes/utcOffsetMinutes 가 없다 (MISSING_TZ)`);
  }
  return o;
};
const four = (p) => [p.yearPillar, p.monthPillar, p.dayPillar, p.hourPillar];

// ── 결과 집계 ───────────────────────────────────────────────────────────
const stats = {};
function tally(bucket, key, ok) {
  const b = (stats[bucket] ??= {});
  const s = (b[key] ??= { pass: 0, fail: 0, fails: [] });
  ok ? s.pass++ : s.fail++;
}

const withPillars = GOLDEN.cases.filter((c) => c.expected.yearPillar);
const withDaewoon = GOLDEN.cases.filter((c) => c.expected.daewoonNumber !== undefined);

describe('ref 엔진 vs 골든셋 — 4기둥', () => {
  for (const c of withPillars) {
    it(`${c.id} ${c.input.date} ${c.input.time} [${c.confidence}] ${c.label}`, () => {
      const got = four(fourPillars(parse(c.input.date, c.input.time), toOpts(c.input)));
      const exp = [c.expected.yearPillar, c.expected.monthPillar, c.expected.dayPillar, c.expected.hourPillar];
      const ok = got.join(' ') === exp.join(' ');
      tally('ref', c.confidence, ok);
      if (!ok) stats.ref[c.confidence].fails.push(`${c.id} got=${got.join(' ')} exp=${exp.join(' ')} :: ${c.label}`);
      expect(got, `${c.id} :: ${c.label}`).toEqual(exp);
    });
  }
});

describe('ref 엔진 vs 골든셋 — 십신 (4기둥 파생)', () => {
  for (const c of withPillars) {
    if (!c.expected.tenGods) continue;
    it(`${c.id} 십신`, () => {
      const got = tenGodsOf({
        yearPillar: c.expected.yearPillar, monthPillar: c.expected.monthPillar,
        dayPillar: c.expected.dayPillar, hourPillar: c.expected.hourPillar,
      });
      tally('tenGods', c.confidence, JSON.stringify(got) === JSON.stringify(c.expected.tenGods));
      expect(got).toEqual(c.expected.tenGods);
    });
  }
});

describe('ref 엔진 vs 골든셋 — 대운수', () => {
  for (const c of withDaewoon) {
    it(`${c.id} 대운수=${c.expected.daewoonNumber} ${c.expected.daewoonDirection}`, () => {
      const d = daewoon(parse(c.input.date, c.input.time), c.input.gender, toOpts(c.input));
      const ok = d.daewoonNumber === c.expected.daewoonNumber && d.direction === c.expected.daewoonDirection;
      tally('daewoon', c.confidence, ok);
      if (!ok) stats.daewoon[c.confidence].fails.push(`${c.id} got=${d.daewoonNumber}/${d.direction} exp=${c.expected.daewoonNumber}/${c.expected.daewoonDirection}`);
      expect({ n: d.daewoonNumber, dir: d.direction })
        .toEqual({ n: c.expected.daewoonNumber, dir: c.expected.daewoonDirection });
    });
  }
});

// ── 골든셋 스키마 · C00 §6.3 정정 반영 검증 (M0) ────────────────────────
describe('골든셋 결함 수정 검증 (C00 §6.3)', () => {
  it('정정①(철회) — G-EDGE-104 는 expected 유지 + deltaTSensitive/excludeFromMergeGate 태깅', () => {
    const c = GOLDEN.cases.find((x) => x.id === 'G-EDGE-104');
    expect([c.expected.yearPillar, c.expected.monthPillar, c.expected.dayPillar, c.expected.hourPillar])
      .toEqual(['己未', '丁丑', '丁丑', '壬寅']);          // 정정 철회 — DE440s 기준 정답
    expect(c.diag.deltaTSensitive).toBe(true);
    expect(c.excludeFromMergeGate).toBe(true);
  });
  it('정정①-b — deltaTSensitive 태깅은 「1970~2040 밖 + 節마진 < threshSec」 과 정확히 일치', () => {
    for (const c of GOLDEN.cases) {
      const y = Number(c.input.date.split('-')[0]);
      const outside = y < 1970 || y > 2040;
      const want = outside && c.diag.jieMarginSec < c.diag.threshSec;
      expect(Boolean(c.diag.deltaTSensitive), `${c.id} y=${y} margin=${c.diag.jieMarginSec} thresh=${c.diag.threshSec}`)
        .toBe(want);
    }
  });
  it('정정② — conventions.daewoonNumber 에 max(1,·) 클램프가 명시돼 있다', () => {
    expect(GOLDEN.conventions.daewoonNumber).toContain('max(1, round(floor(Δ일)/3))');
  });
  it('정정②-b — 클램프를 빼면 275건 중 216건만 통과한다(클램프가 규범인 근거)', () => {
    let withClamp = 0, without = 0, deltaLt3 = 0, rawZero = 0;
    for (const c of withDaewoon) {
      const d = daewoon(parse(c.input.date, c.input.time), c.input.gender, toOpts(c.input));
      const raw = Math.round(Math.floor(d.deltaDays) / 3);
      if (Math.floor(d.deltaDays) < 3) deltaLt3++;
      if (Math.max(1, raw) === c.expected.daewoonNumber) withClamp++;
      if (raw === c.expected.daewoonNumber) without++; else if (raw === 0) rawZero++;
    }
    expect(withClamp).toBe(275);
    expect(without).toBe(216);          // 275 − 216 = 59 건이 클램프를 필요로 한다
    expect(rawZero).toBe(59);           // 그 59건은 전부 raw===0 → max(1,·) 이 유일한 구제
    // ⚠️ floor(Δ)<3 은 65건. 그중 floor(Δ)∈{2} 인 6건은 round(2/3)=1 이라 클램프 없이도 맞는다.
    //    C00 §6.3 conventions 의 「Δ<3일 케이스 59건」은 **클램프 필요 건수**(=59)이지 floor(Δ)<3 건수(=65)가 아니다.
    expect(deltaLt3).toBe(65);
  });
  it('정정③ — 4기둥 없는 케이스는 정확히 7건이고 전부 pillarsOmitted 플래그를 갖는다', () => {
    const noP = GOLDEN.cases.filter((c) => !c.expected.yearPillar);
    expect(noP.length).toBe(7);
    expect(noP.map((c) => c.id).sort()).toEqual(
      ['G-C06-TV-3-A','G-C06-TV-3-B','G-C06-TV-3-C','G-C06-TV-3-D','G-C06-TV-3-E','G-C06-TV-3-F','G-C06-TV-3-G']);
    for (const c of noP) { expect(c.expected.pillarsOmitted).toBe(true); expect(c.expected.pillarsOmittedReason).toBeTruthy(); }
    expect(withPillars.length).toBe(GOLDEN.cases.length - 7);   // 287 − 7 = 280
  });
  it('정정④(반박) — 해외 케이스는 region/std/dst 를 갖고 있고, 하네스가 넘기면 전건 통과한다', () => {
    const xs = GOLDEN.cases.filter((c) => c.input.region === 'GENERIC');
    expect(xs.length).toBe(4);
    for (const c of xs) {
      expect(c.input.stdOffsetMinutes).toBeTypeOf('number');
      expect(c.input.dstMinutes).toBeTypeOf('number');
      expect(c.input.utcOffsetMinutes).toBe(c.input.stdOffsetMinutes);   // v1 별칭 정합
      const got = four(fourPillars(parse(c.input.date, c.input.time), toOpts(c.input)));
      expect(got, c.id).toEqual([c.expected.yearPillar, c.expected.monthPillar, c.expected.dayPillar, c.expected.hourPillar]);
    }
  });
  it('정정④-b(음성 대조) — std/dst 를 안 넘기면 해외 4기둥 4/4 가 깨진다 (대운은 1건)', () => {
    // C00 적대검증 「반박된 정정 4」의 「대운 2건」은 F3 정정 **전** ref 로 잰 값이다.
    // F3 정정본에서는 1건(G-C03-TV-10-03)만 깨진다 — 아래가 재실행 근거다.
    const xs = GOLDEN.cases.filter((c) => c.input.region === 'GENERIC');
    for (const variant of ['KR', 'GENERIC-no-offsets']) {
      let pf = 0, pd = 0;
      for (const c of xs) {
        const bad = variant === 'KR'
          ? { applyTz: true, jasiRule: c.input.jasiRule, longitude: c.input.longitude, region: 'KR' }
          : { applyTz: true, jasiRule: c.input.jasiRule, longitude: c.input.longitude, region: 'GENERIC' };
        const g = four(fourPillars(parse(c.input.date, c.input.time), bad));
        if (g.join(' ') !== [c.expected.yearPillar, c.expected.monthPillar, c.expected.dayPillar, c.expected.hourPillar].join(' ')) pf++;
        const d = daewoon(parse(c.input.date, c.input.time), c.input.gender, bad);
        if (d.daewoonNumber !== c.expected.daewoonNumber || d.direction !== c.expected.daewoonDirection) pd++;
      }
      expect(pf, variant).toBe(4);
      expect(pd, variant).toBe(1);
    }
  });
  it('스키마 — 전 케이스가 longitude 키와 (ianaTz | std+dst) 를 갖는다 (적대검증 #13)', () => {
    for (const c of GOLDEN.cases) {
      expect(Object.hasOwn(c.input, 'longitude'), c.id).toBe(true);
      if (c.input.region === 'GENERIC') {
        expect(typeof c.input.stdOffsetMinutes, c.id).toBe('number');
        expect(typeof c.input.dstMinutes, c.id).toBe('number');
      } else expect(c.input.ianaTz, c.id).toBe('Asia/Seoul');
    }
  });
  it('스키마 — revision/axis 메타가 존재하고 축①로 선언돼 있다', () => {
    expect(GOLDEN.axis).toBe('reference');
    expect(GOLDEN.revision.version).toBe('golden-set v1.1');
    expect(GOLDEN.count).toBe(GOLDEN.cases.length);
  });
});

// ── 참고: 외부 구현체의 통과율 (실패해도 테스트는 통과시키고 집계만) ──
describe('외부 구현체 통과율 집계 (raw_kst · 정자시 케이스 한정)', () => {
  const subset = withPillars.filter(
    (c) => c.input.tzMode === 'raw_kst' && c.input.jasiRule === 'yajasi' && c.input.longitude === null,
  );
  it(`manseryeok@2.0.0 — n=${subset.length}`, () => {
    for (const c of subset) {
      let got = null;
      try { got = mans(parse(c.input.date, c.input.time)).join(' '); } catch { got = 'ERR'; }
      const exp = [c.expected.yearPillar, c.expected.monthPillar, c.expected.dayPillar, c.expected.hourPillar].join(' ');
      const ok = got === exp;
      tally('manseryeok', c.confidence, ok);
      if (!ok) stats.manseryeok[c.confidence].fails.push(`${c.id} got=${got} exp=${exp} :: ${c.label}`);
    }
    expect(true).toBe(true);
  });
  it(`lunar-javascript@1.7.7 (KST−1h 보정) — n=${subset.length}`, () => {
    for (const c of subset) {
      let got = null;
      try { got = lj(parse(c.input.date, c.input.time)).join(' '); } catch { got = 'ERR'; }
      const exp = [c.expected.yearPillar, c.expected.monthPillar, c.expected.dayPillar, c.expected.hourPillar].join(' ');
      const ok = got === exp;
      tally('lunarjs', c.confidence, ok);
      if (!ok) stats.lunarjs[c.confidence].fails.push(`${c.id} got=${got} exp=${exp} :: ${c.label}`);
    }
    expect(true).toBe(true);
  });
});

describe('ZZZ 집계 리포트', () => {
  it('통과율 출력', () => {
    const lines = ['', '='.repeat(78), '골든셋 통과율 (총 ' + GOLDEN.cases.length + '건 / 4기둥 보유 ' + withPillars.length + '건)', '='.repeat(78)];
    for (const [engine, b] of Object.entries(stats)) {
      let tp = 0, tf = 0;
      const parts = [];
      for (const [conf, s] of Object.entries(b)) {
        tp += s.pass; tf += s.fail;
        parts.push(`${conf} ${s.pass}/${s.pass + s.fail}`);
      }
      lines.push(`${engine.padEnd(12)} ${String(tp).padStart(4)}/${String(tp + tf).padEnd(5)} = ${((100 * tp) / (tp + tf)).toFixed(2).padStart(6)}%   [${parts.join(' | ')}]`);
    }
    lines.push('-'.repeat(78));
    for (const [engine, b] of Object.entries(stats))
      for (const [conf, s] of Object.entries(b))
        for (const f of s.fails) lines.push(`  FAIL ${engine}/${conf}: ${f}`);
    lines.push('='.repeat(78));
    const txt = lines.join('\n');
    console.log(txt);
    fs.writeFileSync(path.join(__dirname, 'pass-rate.txt'), txt, 'utf8');
    expect(true).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 불변식 (property test)
// ══════════════════════════════════════════════════════════════════════════
import { gz, jdnFromYmd, STEMS, BRANCHES, solarTermUtc } from './ref.mjs';

describe('불변식', () => {
  it('60갑자 인덱스 왕복: (6g−5z) mod 60 == n', () => {
    for (let n = 0; n < 60; n++) {
      const g = n % 10, z = n % 12;
      expect(((6 * g - 5 * z) % 60 + 60) % 60).toBe(n);
      expect(gz(n)).toBe(STEMS[g] + BRANCHES[z]);
    }
  });
  it('일주 60일 주기: d 와 d+60 일은 항상 동일 (1900-01-01 + 73000일)', () => {
    const base = jdnFromYmd(1900, 1, 1);
    let bad = 0;
    for (let i = 0; i < 73000; i++) if (gz(base + i - 11) !== gz(base + i + 60 - 11)) bad++;
    expect(bad).toBe(0);
  });
  it('JDN 앵커 5점 (C03 TV-1)', () => {
    const A = [[1900, 1, 1, 2415021, '甲戌'], [1949, 10, 1, 2433191, '甲子'], [1992, 10, 24, 2448920, '癸酉'],
               [2000, 1, 1, 2451545, '戊午'], [2026, 8, 11, 2461264, '丁巳']];
    for (const [y, m, d, jdn, p] of A) { expect(jdnFromYmd(y, m, d)).toBe(jdn); expect(gz(jdn - 11)).toBe(p); }
  });
  it('연속 5일 × 12시진 시주 = 60갑자 완전순환 (중복 0)', () => {
    const seen = new Set();
    const OSEODUN = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8];
    for (let d = 0; d < 5; d++) for (let b = 0; b < 12; b++)
      seen.add(STEMS[(OSEODUN[d % 10] + b) % 10] + BRANCHES[b]);
    expect(seen.size).toBe(60);
  });
});

describe('절기 회귀 가드 (기준 = Skyfield DE440s 사전계산표)', () => {
  const LNG = { 입춘: 315, 우수: 330, 경칩: 345, 춘분: 0, 청명: 15, 곡우: 30, 입하: 45, 소만: 60,
    망종: 75, 하지: 90, 소서: 105, 대서: 120, 입추: 135, 처서: 150, 백로: 165, 추분: 180,
    한로: 195, 상강: 210, 입동: 225, 소설: 240, 대설: 255, 동지: 270, 소한: 285, 대한: 300 };
  const mansDelta = (lo, hi) => {
    const M = createRequire(import.meta.url)('manseryeok');
    let max = 0;
    for (let y = lo; y <= hi; y++) for (let i = 0; i < 24; i++) {
      let d; try { d = M.getSolarTerm(y, i); } catch { continue; }
      const lng = LNG[d.name]; if (lng === undefined) continue;
      max = Math.max(max, Math.abs(Date.parse(d.date) - solarTermUtc(y, lng)) / 1000);
    }
    return max;
  };
  it('manseryeok 2000~2049 max|Δ| ≤ 32초', () => { expect(mansDelta(2000, 2049)).toBeLessThanOrEqual(32); });
  it('manseryeok 1950~1999 max|Δ| ≤ 45초', () => { expect(mansDelta(1950, 1999)).toBeLessThanOrEqual(45); });
  it('manseryeok 1900~1949 max|Δ| ≤ 127초 (ΔT 모델 편차)', () => { expect(mansDelta(1900, 1949)).toBeLessThanOrEqual(127); });
  it('manseryeok 2050~2100 max|Δ| ≤ 147초 (ΔT 외삽 발산)', () => { expect(mansDelta(2050, 2100)).toBeLessThanOrEqual(147); });
  it('2024/2025/2026 입춘 KST 초정밀', () => {
    const kst = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
    expect(kst(solarTermUtc(2024, 315))).toBe('2024-02-04 17:27:07');
    expect(kst(solarTermUtc(2025, 315))).toBe('2025-02-03 23:10:28');
    expect(kst(solarTermUtc(2026, 315))).toBe('2026-02-04 05:02:07');
  });
});

describe('일주 외부 앵커 (율리우스/그레고리 전환 포함)', () => {
  const julJdn = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083; };
  for (const a of GOLDEN.dayPillarAnchors) {
    it(`${a.date} → ${a.dayPillar} (${a.calendar}) [${a.source}]`, () => {
      const neg = a.date.startsWith('-');
      const [ys, ms, ds] = (neg ? a.date.slice(1) : a.date).split('-');
      const y = (neg ? -1 : 1) * Number(ys);
      const jdn = jdnFromYmd(y, Number(ms), Number(ds));
      expect(gz(jdn - 11)).toBe(a.dayPillar);
      if (a.calendar === 'julian') expect(jdn).toBe(julJdn(y, Number(ms), Number(ds)));
    });
  }
});
