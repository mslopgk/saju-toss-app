// invariants.test.mjs — L0 불변식 (C00 §6.2)
//   I14 : 절기 인접 간격 ∈ [21180, 22665] 분 — 1851~2145 전수
//   I17 : 연주·월주는 longitude / jasiRule 값에 불변 (F3) — 랜덤 10,000 + 절입 ±60분 격자
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fourPillars, daewoon, solarTermUtc, offsetAt, JIE } from './ref.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'solarterms-de440s.json'), 'utf8'))
  .map((r) => ({ ...r, ms: Date.parse(r.utc) }))
  .sort((a, b) => a.ms - b.ms);

const LOG = [];
const log = (s) => { LOG.push(s); };

// ── I14 절기 간격 게이트 ─────────────────────────────────────────────────
describe('I14 절기 인접간격 게이트 (하한 21,180분)', () => {
  const GATE = [21180, 22665];
  const OLD_LO = 21188;
  let min = Infinity, max = -Infinity, minAt = null, maxAt = null;
  const violNew = [], violOld = [];
  for (let i = 1; i < TABLE.length; i++) {
    const g = (TABLE[i].ms - TABLE[i - 1].ms) / 60000;
    if (g < min) { min = g; minAt = TABLE[i - 1]; }
    if (g > max) { max = g; maxAt = TABLE[i - 1]; }
    if (g < GATE[0] || g > GATE[1]) violNew.push([TABLE[i - 1], TABLE[i], g]);
    if (g < OLD_LO || g > GATE[1]) violOld.push([TABLE[i - 1], TABLE[i], g]);
  }
  it(`전수 ${TABLE.length}건 / 인접쌍 ${TABLE.length - 1} — 신 게이트 위반 0`, () => {
    log(`I14  n=${TABLE.length}  min=${min.toFixed(3)}분 @${minAt.year} ${minAt.name}  max=${max.toFixed(3)}분 @${maxAt.year} ${maxAt.name}`);
    log(`     게이트[21180,22665] 위반 ${violNew.length} / 구게이트[21188,22665] 위반 ${violOld.length}`);
    expect(violNew.length).toBe(0);
  });
  it('구 하한 21,188 은 정답 테이블 12건을 탈락시킨다 (하한 인하의 근거)', () => {
    expect(violOld.length).toBe(12);
    const in1900 = violOld.filter(([a, b]) => a.year >= 1900 && b.year <= 2100);
    expect(in1900.length).toBe(2);
    log('     구게이트 탈락 12건 중 1900~2100 = ' + in1900.map(([a]) => a.year).join(','));
  });
  it('실측 극값이 신 게이트 안쪽에 있다 (여유 하한 4.988분 / 상한 4.285분)', () => {
    expect(min).toBeGreaterThan(21180); expect(max).toBeLessThan(22665);
    expect(+(min - 21180).toFixed(3)).toBe(4.988);
    expect(+(22665 - max).toFixed(3)).toBe(4.285);
  });
  it('sunLng 가 15°씩 단조 증가한다 (누락·중복 0)', () => {
    let bad = 0;
    for (let i = 1; i < TABLE.length; i++) if (TABLE[i].sunLng !== (TABLE[i - 1].sunLng + 15) % 360) bad++;
    expect(bad).toBe(0);
  });
});

// ── I17 연주·월주 불변식 ────────────────────────────────────────────────
// 결정론적 PRNG (mulberry32) — 시드 고정
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LONS = [null, 124.6100, 126.1000, 126.9784204, 127.5000, 128.3300, 129.0800, 131.8700,
              -157.8583, -74.0060, 13.4050, 151.2093];
const JASIS = ['yajasi', 'johjasi', 'yajasi-nextstem'];

function scanInvariance(inputs, tag) {
  let n = 0, viol = 0; const examples = [];
  for (const inp of inputs) {
    const base = { applyTz: true, region: 'KR', longitude: null, jasiRule: 'yajasi' };
    const ref = fourPillars(inp, base);
    const key = ref.yearPillar + ' ' + ref.monthPillar;
    for (const lon of LONS) for (const jasi of JASIS) {
      n++;
      const g = fourPillars(inp, { ...base, longitude: lon, jasiRule: jasi });
      if (g.yearPillar + ' ' + g.monthPillar !== key) {
        viol++;
        if (examples.length < 8) examples.push(
          `${inp.year}-${inp.month}-${inp.day} ${inp.hour}:${inp.minute} lon=${lon} jasi=${jasi} → ${g.yearPillar} ${g.monthPillar} (기준 ${key})`);
      }
    }
  }
  log(`I17  ${tag}: 조합 ${n}건, 위반 ${viol}`);
  for (const e of examples) log('       ' + e);
  return { n, viol, examples };
}

describe('I17 연주·월주는 longitude / jasiRule 에 불변 (F3)', () => {
  it('랜덤 10,000 케이스 × (경도 12 × 야자시 3) = 360,000 조합 위반 0', () => {
    const r = rng(20260812);
    const inputs = [];
    for (let i = 0; i < 10000; i++) {
      const y = 1900 + Math.floor(r() * 201);
      const m = 1 + Math.floor(r() * 12);
      const dmax = new Date(Date.UTC(y, m, 0)).getUTCDate();
      inputs.push({ year: y, month: m, day: 1 + Math.floor(r() * dmax),
                    hour: Math.floor(r() * 24), minute: Math.floor(r() * 60) });
    }
    const { n, viol, examples } = scanInvariance(inputs, '랜덤 10,000');
    expect(n).toBe(10000 * LONS.length * JASIS.length);
    expect(viol, examples.join('\n')).toBe(0);
  }, 180000);

  it('절입 ±60분 격자 (1900~2100 × 12절 × ±60분 1분 간격) 위반 0', () => {
    // 절입 순간을 서울 벽시계로 역산해 ±60분을 1분 간격으로 훑는다.
    const inputs = [];
    for (let y = 1900; y <= 2100; y += 7) {          // 29개 연도 × 12절 × 121분
      for (const j of JIE) {
        const t = solarTermUtc(y, j[0]);
        for (let d = -60; d <= 60; d++) {
          const ms = t + d * 60000;
          const w = new Date(ms + offsetAt(ms).total * 60000);
          inputs.push({ year: w.getUTCFullYear(), month: w.getUTCMonth() + 1, day: w.getUTCDate(),
                        hour: w.getUTCHours(), minute: w.getUTCMinutes() });
        }
      }
    }
    const { n, viol, examples } = scanInvariance(inputs, `절입±60분 격자 ${inputs.length}입력`);
    expect(viol, examples.join('\n')).toBe(0);
    expect(n).toBeGreaterThan(1000000);
  }, 180000);

  it('음성 대조 — F3 를 위반하면 절입 창에서 실제로 깨진다', () => {
    // 구 구현(termRefUtc = apparent 프레임) 을 재현해 같은 격자를 돌리면 위반이 나와야 한다.
    // 반례: 서울 2025-02-03 23:20 TRUE_SOLAR
    const inp = { year: 2025, month: 2, day: 3, hour: 23, minute: 20 };
    const now = fourPillars(inp, { applyTz: true, region: 'KR', longitude: 126.9784204, jasiRule: 'yajasi' });
    const std = now._meta.stdOffsetMinutes;
    expect(now.yearPillar + ' ' + now.monthPillar).toBe('乙巳 戊寅');
    // apparent 프레임으로 절기를 비교하면 46분 앞당겨져 입춘 전으로 판정된다
    const utc = Date.parse(now._meta.utc);
    const apparentFrame = Date.parse(now._meta.localIso + 'Z') - std * 60000;
    expect(utc - apparentFrame).toBeGreaterThan(45 * 60000);
    expect(apparentFrame).toBeLessThan(solarTermUtc(2025, 315));   // 입춘 전 → 甲辰 丁丑 로 오판
    expect(utc).toBeGreaterThanOrEqual(solarTermUtc(2025, 315));   // 정답은 입춘 후
  });

  it('대운 Δ 도 longitude / jasiRule 에 불변 (termRefUtc = utc 의 따름정리)', () => {
    const r = rng(777);
    let n = 0, viol = 0;
    for (let i = 0; i < 500; i++) {
      const y = 1900 + Math.floor(r() * 201), m = 1 + Math.floor(r() * 12);
      const dmax = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const inp = { year: y, month: m, day: 1 + Math.floor(r() * dmax),
                    hour: Math.floor(r() * 24), minute: Math.floor(r() * 60) };
      const g = 'MF'[Math.floor(r() * 2)];
      const base = daewoon(inp, g, { applyTz: true, region: 'KR', longitude: null, jasiRule: 'yajasi' });
      for (const lon of LONS) for (const jasi of JASIS) {
        n++;
        const d = daewoon(inp, g, { applyTz: true, region: 'KR', longitude: lon, jasiRule: jasi });
        if (d.daewoonNumber !== base.daewoonNumber || d.direction !== base.direction) viol++;
      }
    }
    log(`I17b 대운 불변: 조합 ${n}건, 위반 ${viol}`);
    expect(viol).toBe(0);
  }, 120000);
});

describe('ZZZ 불변식 로그', () => {
  it('출력', () => {
    const txt = ['', '='.repeat(78), 'L0 불변식 실측 (I14 / I17)', '='.repeat(78), ...LOG, '='.repeat(78)].join('\n');
    console.log(txt);
    fs.writeFileSync(path.join(__dirname, 'invariants.txt'), txt, 'utf8');
    expect(true).toBe(true);
  });
});
