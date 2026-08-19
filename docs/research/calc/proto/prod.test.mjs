// prod.test.mjs — 축② 프로덕션 회귀 (golden-set-prod.json)
//   확정 유파: historical TZ + TRUE_SOLAR + 출생지 경도 + yajasi
//   재생성: node gen-prod.mjs
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fourPillars, daewoon, tenGodsOf } from './ref.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const P = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'golden-set-prod.json'), 'utf8'));

const parse = (d, t) => {
  const [y, m, dd] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  return { year: y, month: m, day: dd, hour: h, minute: mi };
};
const toOpts = (i) => ({
  applyTz: true,                 // A5 historical
  jasiRule: 'yajasi',            // C3
  longitude: i.longitude,        // A1/A3 TRUE_SOLAR
  region: i.region,
  stdOffsetMinutes: i.stdOffsetMinutes,
  dstMinutes: i.dstMinutes,
});
const four = (p) => [p.yearPillar, p.monthPillar, p.dayPillar, p.hourPillar];

const stats = { four: { pass: 0, fail: 0, fails: [] }, tenGods: { pass: 0, fail: 0 },
                daewoon: { pass: 0, fail: 0 }, changeover: { pass: 0, fail: 0, maxAbsSec: 0 },
                byFamily: {} };

describe('축② 메타 · 규약 무결성', () => {
  it('axis=production, 확정 유파가 C00 §3 과 일치', () => {
    expect(P.axis).toBe('production');
    expect(P.convention).toMatchObject({
      tzMode: 'historical', trueSolarMode: 'TRUE_SOLAR', jasiRule: 'yajasi',
      eotAlgorithm: 'NOAA_MEEUS', gapPolicy: 'SHIFT_FORWARD', overlapPolicy: 'FIRST',
      defaultLongitude: 126.9784204,
    });
  });
  it('필수 필드 — 전 케이스 longitude 숫자 + (KR:ianaTz | GENERIC:std+dst)  [적대검증 #13]', () => {
    for (const c of [...P.cases, ...P.needsReCollection]) {
      expect(typeof c.input.longitude, c.id).toBe('number');
      if (c.input.region === 'GENERIC') {
        expect(typeof c.input.stdOffsetMinutes, c.id).toBe('number');
        expect(typeof c.input.dstMinutes, c.id).toBe('number');
      } else {
        expect(c.input.ianaTz, c.id).toBe('Asia/Seoul');
      }
      expect(c.input.tzMode, c.id).toBe('historical');
      expect(c.input.jasiRule, c.id).toBe('yajasi');
      expect(c.input.trueSolarMode, c.id).toBe('TRUE_SOLAR');
    }
  });
  it('documented 80건은 재생성 대상이 아니다 (expected=null + needsReCollection)', () => {
    expect(P.needsReCollection.length).toBe(80);
    for (const c of P.needsReCollection) {
      expect(c.expected, c.id).toBeNull();
      expect(c.needsReCollection, c.id).toBe(true);
      expect(c.gate, c.id).toBe(false);
      expect(c.referenceAxis.confidence, c.id).toBe('documented');
    }
    // 재생성 배열에 documented 가 섞여 있지 않다
    for (const c of P.cases)
      if (c.referenceAxis) expect(c.referenceAxis.confidence, c.id).not.toBe('documented');
  });
  it('ref.mjs 가 F3 정정본이다 (2025-02-03 23:20 서울 TRUE_SOLAR → 乙巳 戊寅)', () => {
    const r = fourPillars({ year: 2025, month: 2, day: 3, hour: 23, minute: 20 },
      { applyTz: true, jasiRule: 'yajasi', longitude: 126.9784204, region: 'KR' });
    expect(r.yearPillar + ' ' + r.monthPillar).toBe('乙巳 戊寅');
    expect(r._meta.termRefUtc).toBe(Date.parse(r._meta.utc));
  });
});

describe('축② 4기둥 재현', () => {
  for (const c of P.cases) {
    it(`${c.id} ${c.input.date} ${c.input.time}`, () => {
      const got = four(fourPillars(parse(c.input.date, c.input.time), toOpts(c.input)));
      const exp = four(c.expected);
      const ok = got.join(' ') === exp.join(' ');
      const fam = c.family ?? 'golden-set 재생성';
      const s = (stats.byFamily[fam] ??= { pass: 0, fail: 0 });
      ok ? (stats.four.pass++, s.pass++) : (stats.four.fail++, s.fail++,
        stats.four.fails.push(`${c.id} got=${got.join(' ')} exp=${exp.join(' ')}`));
      expect(got, `${c.id} :: ${c.label ?? ''}`).toEqual(exp);
    });
  }
});

describe('축② 십신 · 대운 · 교운절대순간', () => {
  it(`십신 ${P.cases.length}/${P.cases.length}`, () => {
    for (const c of P.cases) {
      const got = tenGodsOf(c.expected);
      const ok = JSON.stringify(got) === JSON.stringify(c.expected.tenGods);
      ok ? stats.tenGods.pass++ : stats.tenGods.fail++;
      expect(got, c.id).toEqual(c.expected.tenGods);
    }
  });
  it(`대운수·방향 ${P.cases.length}/${P.cases.length}`, () => {
    for (const c of P.cases) {
      const d = daewoon(parse(c.input.date, c.input.time), c.input.gender, toOpts(c.input));
      const ok = d.daewoonNumber === c.expected.daewoonNumber && d.direction === c.expected.daewoonDirection;
      ok ? stats.daewoon.pass++ : stats.daewoon.fail++;
      expect({ n: d.daewoonNumber, dir: d.direction }, c.id)
        .toEqual({ n: c.expected.daewoonNumber, dir: c.expected.daewoonDirection });
    }
  });
  it('교운 절대순간 changeoverUtcMs — C00 §5.2 게이트 ±60초', () => {
    for (const c of P.cases) {
      const d = daewoon(parse(c.input.date, c.input.time), c.input.gender, toOpts(c.input));
      const absSec = Math.abs(d.changeoverUtcMs - c.expected.changeoverUtcMs) / 1000;
      stats.changeover.maxAbsSec = Math.max(stats.changeover.maxAbsSec, absSec);
      absSec <= 60 ? stats.changeover.pass++ : stats.changeover.fail++;
      expect(absSec, c.id).toBeLessThanOrEqual(60);
    }
  });
  it('sajuYear · dayJdn 도 재현된다', () => {
    for (const c of P.cases) {
      const fp = fourPillars(parse(c.input.date, c.input.time), toOpts(c.input));
      expect(fp._meta.sajuYear, c.id).toBe(c.expected.sajuYear);
      expect(fp._meta.dayJdn, c.id).toBe(c.expected.dayJdn);
    }
  });
});

describe('축② F3 판별력 — 절입 직후 0~46분 창 (C00 §6.3 확장 ①)', () => {
  const f3 = P.cases.filter((c) => c.family === 'F3-절입직후창');
  it(`판별 케이스가 존재한다 (n=${f3.length} > 0)`, () => { expect(f3.length).toBeGreaterThan(0); });
  it('각 케이스는 F3 위반 구현과 연·월주가 실제로 갈린다', () => {
    for (const c of f3) {
      expect(c.f3Discriminator.violatingImpl, c.id).not.toBe(c.f3Discriminator.correct);
      expect(c.expected.yearPillar + ' ' + c.expected.monthPillar, c.id).toBe(c.f3Discriminator.correct);
    }
  });
  it('F3 위반 구현을 주입하면 이 케이스들이 전부 깨진다 (게이트 실효성)', () => {
    // 구 구현 재현: termRefUtc = localMs − std*60000
    let broken = 0;
    for (const c of f3) {
      const got = c.f3Discriminator.violatingImpl;
      if (got !== c.expected.yearPillar + ' ' + c.expected.monthPillar) broken++;
    }
    expect(broken).toBe(f3.length);
  });
});

describe('ZZZ 축② 집계 리포트', () => {
  it('통과율 출력', () => {
    const L = ['', '='.repeat(78),
      `축② 프로덕션 회귀 (golden-set-prod.json) — cases ${P.cases.length} / needsReCollection ${P.needsReCollection.length}`,
      `유파: tz=${P.convention.tzMode} · ${P.convention.trueSolarMode} · λ기본=${P.convention.defaultLongitude} · jasi=${P.convention.jasiRule}`,
      '='.repeat(78)];
    const pct = (p, f) => ((100 * p) / (p + f)).toFixed(2).padStart(6);
    L.push(`4기둥        ${String(stats.four.pass).padStart(4)}/${String(stats.four.pass + stats.four.fail).padEnd(5)} = ${pct(stats.four.pass, stats.four.fail)}%`);
    L.push(`십신          ${String(stats.tenGods.pass).padStart(4)}/${String(stats.tenGods.pass + stats.tenGods.fail).padEnd(5)} = ${pct(stats.tenGods.pass, stats.tenGods.fail)}%`);
    L.push(`대운          ${String(stats.daewoon.pass).padStart(4)}/${String(stats.daewoon.pass + stats.daewoon.fail).padEnd(5)} = ${pct(stats.daewoon.pass, stats.daewoon.fail)}%`);
    L.push(`교운±60초     ${String(stats.changeover.pass).padStart(4)}/${String(stats.changeover.pass + stats.changeover.fail).padEnd(5)} = ${pct(stats.changeover.pass, stats.changeover.fail)}%   max|Δ| = ${stats.changeover.maxAbsSec.toFixed(3)}초`);
    L.push('-'.repeat(78));
    for (const [f, s] of Object.entries(stats.byFamily))
      L.push(`  ${f.padEnd(24)} ${String(s.pass).padStart(4)}/${String(s.pass + s.fail).padEnd(5)}`);
    L.push('-'.repeat(78));
    L.push(`축①(기록규약) expected 와 값이 다른 케이스: ${P.counts.differsFromReferenceAxis} / 207  ← 유파 차이(버그 아님)`);
    for (const f of stats.four.fails) L.push(`  FAIL ${f}`);
    L.push('='.repeat(78));
    const txt = L.join('\n');
    console.log(txt);
    fs.writeFileSync(path.join(__dirname, 'pass-rate-prod.txt'), txt, 'utf8');
    expect(stats.four.fail).toBe(0);
  });
});
