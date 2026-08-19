// gen-prod.mjs — golden-set-prod.json 생성기 (축② 프로덕션 회귀)
//   확정 유파: historical TZ(A5) + TRUE_SOLAR(A1) + 출생지 경도(A3, 기본 서울) + yajasi(C3)
//   실행: cd docs/research/calc/proto && node gen-prod.mjs
//   ⚠️ ref.mjs 가 F3 정정본(termRefUtc = utc)이 아니면 즉시 중단한다.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as REF from './ref.mjs';

const { fourPillars, daewoon, tenGodsOf, solarTermUtc, eotMinutes, offsetAt, prevJie, nextJie,
        JIE, STEMS, BRANCHES } = REF;
const __d = path.dirname(fileURLToPath(import.meta.url));
const CALC = path.join(__d, '..');
const G = JSON.parse(fs.readFileSync(path.join(CALC, 'golden-set.json'), 'utf8'));

// ── 0. ref.mjs 가 F3 정정본인지 강제 검증 (적대검증 #5) ───────────────────
{
  const tv = { year: 2025, month: 2, day: 3, hour: 23, minute: 20 };
  const o = { applyTz: true, jasiRule: 'yajasi', longitude: 126.9784204, region: 'KR' };
  const r = fourPillars(tv, o);
  const got = r.yearPillar + ' ' + r.monthPillar;
  if (got !== '乙巳 戊寅')
    throw new Error('ref.mjs 가 F3 정정본이 아니다 (2025-02-03 23:20 서울 TRUE_SOLAR → ' + got + ', 기대 乙巳 戊寅). 생성 중단.');
  if (r._meta.termRefUtc !== Date.parse(r._meta.utc))
    throw new Error('termRefUtc !== utc — F3 위반. 생성 중단.');
}

const SEOUL_LON = 126.9784204, SEOUL_LAT = 37.5665;
const CONV = {
  engine: 'SAJU-ENGINE-1.0.0',
  tzMode: 'historical',            // C00 §3-A5
  trueSolarMode: 'TRUE_SOLAR',     // C00 §3-A1
  eotAlgorithm: 'NOAA_MEEUS',      // C00 §3-A4
  jasiRule: 'yajasi',              // C00 §3-C3
  gapPolicy: 'SHIFT_FORWARD',      // C00 §3-A11
  overlapPolicy: 'FIRST',          // C00 §3-A12
  defaultLongitude: SEOUL_LON,     // C00 §3-A3 / §S0-3(a)
  defaultLatitude: SEOUL_LAT,
  termSource: 'proto/solarterms-de440s.json (Skyfield + JPL DE440s, 1851~2145, 7080건)',
  termComparisonFrame: 'UTC 절대순간 (F3)',
};

const parse = (d, t) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
  return { year: y, month: m, day: dd, hour: h, minute: mi }; };
const pad = (n, w = 2) => String(n).padStart(w, '0');
const isoDate = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
const isoTime = (h, mi) => pad(h) + ':' + pad(mi);

// ── F3 위반 구현(구 ref) 의 연주·월주 재현 — 판별력 검증 전용 ─────────────
//    구 코드: termRefUtc = (longitude===null) ? utc : localMs − std*60000
const OHODUN = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0];
function yearMonthPillarAt(termRefUtc, localYear) {
  const ipchun = solarTermUtc(localYear, 315);
  const sajuYear = termRefUtc >= ipchun ? localYear : localYear - 1;
  const ys = ((sajuYear - 4) % 10 + 10) % 10, yb = ((sajuYear - 4) % 12 + 12) % 12;
  const pj = prevJie(termRefUtc);
  const ms = (OHODUN[ys] + pj.jie[2]) % 10;
  return STEMS[ys] + BRANCHES[yb] + ' ' + STEMS[ms] + BRANCHES[pj.jie[1]];
}
function f3ViolatingYearMonth(inp, opts) {
  const fp = fourPillars(inp, opts);                 // 정정본
  const utc = Date.parse(fp._meta.utc);
  const std = fp._meta.stdOffsetMinutes;
  const L = 4 * (opts.longitude - std / 4), E = eotMinutes(utc);
  const localMs = utc + std * 60000 + Math.round((L + E) * 60000);
  const bad = localMs - std * 60000;                 // ← 구 구현의 termRefUtc
  const lt = new Date(localMs);
  return { violating: yearMonthPillarAt(bad, lt.getUTCFullYear()),
           correct: fp.yearPillar + ' ' + fp.monthPillar };
}

// 프로덕션 입력 정규화: longitude 는 절대 null 이 아니고, GENERIC 은 std/dst 필수
function prodInput(i) {
  const region = i.region ?? 'KR';
  const o = {
    date: i.date, time: i.time, gender: i.gender, calendarType: i.calendarType ?? 'solar',
    region,
    longitude: i.longitude ?? (region === 'KR' ? SEOUL_LON : null),
    latitude: i.latitude ?? (region === 'KR' ? SEOUL_LAT : null),
    ianaTz: i.ianaTz ?? (region === 'KR' ? 'Asia/Seoul' : null),
    tzMode: CONV.tzMode, jasiRule: CONV.jasiRule, trueSolarMode: CONV.trueSolarMode,
  };
  if (region === 'GENERIC') {
    o.stdOffsetMinutes = i.stdOffsetMinutes ?? i.utcOffsetMinutes ?? null;
    o.dstMinutes = i.dstMinutes ?? null;
  }
  return o;
}
export const toOpts = (pi) => ({
  applyTz: true, jasiRule: 'yajasi', longitude: pi.longitude, region: pi.region,
  stdOffsetMinutes: pi.stdOffsetMinutes, dstMinutes: pi.dstMinutes,
});

function build(id, pi, extra = {}) {
  const inp = parse(pi.date, pi.time);
  const opts = toOpts(pi);
  const fp = fourPillars(inp, opts);
  const dw = daewoon(inp, pi.gender, opts);
  const tg = tenGodsOf(fp);
  const birthMs = Date.parse(fp._meta.utc);
  const jieMs = Date.parse(fp._meta.jieUtc);
  const std = fp._meta.stdOffsetMinutes, dst = fp._meta.dstMinutes;
  const L = 4 * (pi.longitude - std / 4);
  const E = eotMinutes(birthMs);
  return {
    id, input: pi,
    expected: {
      yearPillar: fp.yearPillar, monthPillar: fp.monthPillar, dayPillar: fp.dayPillar, hourPillar: fp.hourPillar,
      tenGods: tg,
      daewoonNumber: dw.daewoonNumber, daewoonDirection: dw.direction,
      changeoverUtcMs: dw.changeoverUtcMs,
      sajuYear: fp._meta.sajuYear, dayJdn: fp._meta.dayJdn,
    },
    tz: { stdOffsetMinutes: std, dstMinutes: dst, totalOffsetMinutes: fp._meta.offMin, flags: fp._meta.flags },
    diag: {
      birthUtc: fp._meta.utc,
      apparentLocalIso: fp._meta.localIso,
      longitudeMinutes: +L.toFixed(4), eotMinutes: +E.toFixed(4),
      trueSolarTotalMinutes: +(L + E).toFixed(4),
      prevJie: fp._meta.jieName, prevJieUtc: fp._meta.jieUtc,
      jieMarginSec: +((birthMs - jieMs) / 1000).toFixed(3),
      nextJieUtc: new Date(nextJie(birthMs).t).toISOString(),
      deltaDaysToJie: +dw.deltaDays.toFixed(6),
    },
    ...extra,
  };
}

// ── 1. 재생성 대상 = consensus + low. documented 는 자기참조 방지로 제외 ──
const cases = [], needsReCollection = [];
let diffFromRefAxis = 0;
for (const c of G.cases) {
  const pi = prodInput(c.input);
  if (c.confidence === 'documented') {
    const obs = build(c.id, pi);
    needsReCollection.push({
      id: c.id, input: pi, expected: null, needsReCollection: true, gate: false,
      referenceAxis: { source: c.source, confidence: c.confidence, label: c.label,
        recordedInput: c.input, recordedExpected: c.expected },
      productionObserved: obs.expected,   // ⚠️ 기대값 아님(진단). U2/U3 확정 후 외부 재수집으로 대체
      tz: obs.tz, diag: obs.diag,
      reason: 'raw_kst 관행으로 수집된 외부 기록값. 프로덕션 유파로 자체 재생성하면 회귀가 자기참조가 된다(C00 §6.3). U2/U3 판별 확정 후 재수집.',
    });
    continue;
  }
  const cs = build(c.id, pi, {
    origin: 'golden-set.json',
    referenceAxis: { confidence: c.confidence, label: c.label, source: c.source, recordedExpected: {
      yearPillar: c.expected.yearPillar, monthPillar: c.expected.monthPillar,
      dayPillar: c.expected.dayPillar, hourPillar: c.expected.hourPillar,
      daewoonNumber: c.expected.daewoonNumber, daewoonDirection: c.expected.daewoonDirection } },
    gate: c.excludeFromMergeGate ? false : true,
    label: c.label,
  });
  if (c.excludeFromMergeGate) cs.excludeFromMergeGate = true;
  if (c.diag && c.diag.deltaTSensitive) cs.deltaTSensitive = true;
  cs.differsFromReferenceAxis = !['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar']
    .every(k => cs.expected[k] === c.expected[k]);
  if (cs.differsFromReferenceAxis) diffFromRefAxis++;
  cases.push(cs);
}

// ── 2. 확장 ① 진태양시 ON × 절입 직후 0~46분 (C00 §6.3 확장 ①) ──────────
//   offMin=0 은 분 절삭 때문에 항상 節 직전이 되어 판별력이 없다 → 1분부터 시작한다.
//   F3 오류창의 폭 = |L+E| 이고 이는 표준자오선에 의존한다.
//     +09:00 epoch(λ_std=135): 서울 −46.3~−15.6분 (창 넓음)
//     +08:30 epoch(λ_std=127.5): 서울 −16.3~+14.4분 (창 좁음) → 작은 offMin 이 필요
const F3_GRID = [
  [2024, [0,1,2,3,4,5,6,7,8,9,10,11], [1, 9, 33]],
  [1954, [0, 5, 11], [1, 5, 15, 33]],   // +09:00 → +08:30 전환 연도
  [1961, [0, 5, 11], [1, 5, 15, 33]],   // +08:30 → +09:00 전환 연도
  [1988, [0, 5, 11], [1, 5, 15, 33]],   // 서머타임 연도
  [2000, [0, 5, 11], [1, 5, 15, 33]],
  [2050, [0, 5, 11], [1, 5, 15, 33]],   // ΔT 외삽 구간
];
let f3n = 0, f3tried = 0, f3skipRT = 0;
for (const [y, orders, offs] of F3_GRID) {
  for (const ord of orders) {
    const j = JIE[ord];
    const t = solarTermUtc(y, j[0]);
    for (const offMin of offs) {
      f3tried++;
      const ms = t + offMin * 60000;
      const off = offsetAt(ms).total;
      const w = new Date(ms + off * 60000);
      const pi = prodInput({ date: isoDate(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate()),
        time: isoTime(w.getUTCHours(), w.getUTCMinutes()), gender: (offMin % 2 ? 'F' : 'M'),
        calendarType: 'solar', region: 'KR' });
      const opts = toOpts(pi), inp = parse(pi.date, pi.time);
      const fp = fourPillars(inp, opts);
      if (Math.abs(Date.parse(fp._meta.utc) - ms) >= 60000) { f3skipRT++; continue; }  // 분 절삭 왕복
      const d = f3ViolatingYearMonth(inp, opts);
      if (d.violating === d.correct) continue;                                        // 판별력 없음
      f3n++;
      cases.push(build('G-PROD-F3-' + y + '-' + pad(j[2]) + '-' + pad(offMin), pi, {
        origin: 'generated', family: 'F3-절입직후창', gate: true,
        label: y + ' ' + j[3] + ' 절입 +' + offMin + '분 · 진태양시 ON — F3 위반 구현은 ' + d.violating + ' 를 낸다',
        f3Discriminator: { violatingImpl: d.violating, correct: d.correct },
      }));
    }
  }
}

// ── 3. 확장 ② 진태양시 ON × 야자시 창 (C00 §6.3 확장 ②) ─────────────────
let jasiN = 0;
const JASI_DAYS = [[2024,2,15], [2024,11,15], [2000,1,1], [1954,3,21], [1988,5,8], [1961,8,10]];
for (const [y, m, d] of JASI_DAYS) {
  for (const hm of [[23,0],[23,10],[23,20],[23,30],[23,45],[23,55],[0,5],[0,20],[0,40]]) {
    const pi = prodInput({ date: isoDate(y, m, d), time: isoTime(hm[0], hm[1]), gender: 'M',
      calendarType: 'solar', region: 'KR' });
    const inp = parse(pi.date, pi.time), o = toOpts(pi);
    const A = fourPillars(inp, { ...o, jasiRule: 'yajasi' });
    const B = fourPillars(inp, { ...o, jasiRule: 'johjasi' });
    const C = fourPillars(inp, { ...o, jasiRule: 'yajasi-nextstem' });
    const key = (p) => p.dayPillar + ' ' + p.hourPillar;
    if (key(A) === key(B) && key(A) === key(C)) continue;
    jasiN++;
    cases.push(build('G-PROD-JASI-' + y + pad(m) + pad(d) + '-' + pad(hm[0]) + pad(hm[1]), pi, {
      origin: 'generated', family: '야자시창×진태양시', gate: true,
      label: '야자시 3유파 분기점 · apparent ' + A._meta.localIso.slice(11),
      jasiVariants: { yajasi: key(A), johjasi: key(B), 'yajasi-nextstem': key(C) },
    }));
  }
}

// ── 4. 해외(GENERIC) 프로덕션 커버리지 ─────────────────────────────────
let xtN = 0;
const XT = [
  // std/dst 는 A14 에 따라 **사용자가 확정해 입력하는 값**이다. 아래는 실제 시행 이력과 맞춘 값.
  ['LA',  'America/Los_Angeles', -480, 60, -118.2437,  34.0522, '1975-07-04', '06:30', 'M'], // PDT
  ['NYC', 'America/New_York',    -300, 60,  -74.0060,  40.7128, '1999-08-15', '23:40', 'F'], // EDT
  ['BER', 'Europe/Berlin',         60, 60,   13.4050,  52.5200, '1988-06-01', '12:00', 'M'], // CEST
  ['HNL', 'Pacific/Honolulu',    -600,  0, -157.8583,  21.3069, '2004-02-04', '01:05', 'F'], // HST(DST 없음)
  ['SYD', 'Australia/Sydney',     600, 60,  151.2093, -33.8688, '2010-12-25', '23:10', 'M'], // AEDT
  ['UTC0','Etc/UTC',                0,  0,    0.0000,   0.0000, '2000-03-20', '00:00', 'F'], // λ=0 · offset=0
];
for (const [tag, tz, std, dst, lon, lat, date, time, gender] of XT) {
  xtN++;
  const pi = prodInput({ date, time, gender, calendarType: 'solar', region: 'GENERIC',
    ianaTz: tz, stdOffsetMinutes: std, dstMinutes: dst, longitude: lon, latitude: lat });
  cases.push(build('G-PROD-XT-' + tag, pi, {
    origin: 'generated', family: '해외 GENERIC', gate: true,
    label: '해외 ' + tag + ' (' + tz + ', std=' + std + ', dst=' + dst + ') — ianaTz 단독 금지(A14) 검증용',
  }));
}

// ── 5. 필수 필드 검증 (적대검증 #13) ────────────────────────────────────
const errs = [];
for (const c of [...cases, ...needsReCollection]) {
  const i = c.input;
  if (typeof i.longitude !== 'number') errs.push(c.id + ': longitude 누락');
  if (i.region === 'GENERIC') {
    if (typeof i.stdOffsetMinutes !== 'number') errs.push(c.id + ': GENERIC stdOffsetMinutes 누락');
    if (typeof i.dstMinutes !== 'number') errs.push(c.id + ': GENERIC dstMinutes 누락');
  } else if (!i.ianaTz) errs.push(c.id + ': ianaTz 누락');
  if (i.tzMode !== 'historical' || i.jasiRule !== 'yajasi' || i.trueSolarMode !== 'TRUE_SOLAR')
    errs.push(c.id + ': 유파 필드가 확정값과 다름');
}
if (errs.length) { console.error(errs.join('\n')); throw new Error('필수 필드 검증 실패 ' + errs.length + '건'); }

// ── 6. 출력 ────────────────────────────────────────────────────────────
const byFamily = {};
for (const c of cases) { const k = c.family ?? 'golden-set 재생성'; byFamily[k] = (byFamily[k] ?? 0) + 1; }
const OUT = {
  title: '사주 계산엔진 프로덕션 회귀 골든셋 (축② — 확정 유파)',
  axis: 'production',
  axisNote: '축② 프로덕션 회귀 — 확정 유파(historical TZ + TRUE_SOLAR + 출생지 경도 + yajasi)로 ref.mjs 를 돌려 ' +
            'expected 를 재생성한 **락파일**이다. 외부 정답이 아니라 "프로덕션 규약에서의 엔진 동작 스냅샷" 이며, ' +
            '용도는 의도치 않은 동작 변경 탐지다. 외부 정답 축은 golden-set.json(축①).',
  generatedAt: new Date().toISOString(),
  generator: 'docs/research/calc/proto/gen-prod.mjs',
  refEngine: 'proto/ref.mjs (F3 정정본 — termRefUtc = utc, 생성 시 강제 검증)',
  convention: CONV,
  counts: { cases: cases.length, needsReCollection: needsReCollection.length, byFamily,
            differsFromReferenceAxis: diffFromRefAxis, gate: cases.filter(c => c.gate).length },
  cautions: [
    '이 파일의 expected 는 자체 엔진 산출값이다. 정확도 근거가 아니라 회귀(변경 탐지) 기준이다.',
    'documented 80건은 raw_kst 관행 외부값이므로 재생성하지 않았다 — needsReCollection 배열에 있고 게이트 대상이 아니다.',
    'differsFromReferenceAxis:true 인 케이스는 축①의 기록 expected 와 값이 다르다. 유파 차이지 버그가 아니다.',
    'excludeFromMergeGate / deltaTSensitive 는 축①에서 승계했다(2041~2100 ΔT 미정의 구간).',
  ],
  fieldSpec: {
    'input.longitude': '필수. null 금지(적대검증 #13). KR 기본 = 서울 126.9784204',
    'input.ianaTz': 'KR 필수 라벨. GENERIC 에서는 표시용이며 단독으로는 MISSING_TZ',
    'input.stdOffsetMinutes / input.dstMinutes': 'region=GENERIC 필수. KR 은 KR_TIMELINE 이 결정하므로 입력 아님(tz.* 에 해석 결과 기록)',
    'tz.*': '엔진이 해석한 오프셋(감사용). 입력이 아니다',
    'expected.changeoverUtcMs': 'C00 §S6-2 정수식 birth + round(Δ분×480)×60000. §5.2 게이트 ±60초',
    'diag.*': '재현 실패 시 원인 추적용. 기대값 아님',
  },
  cases,
  needsReCollection,
};
const OUTPATH = path.join(CALC, 'golden-set-prod.json');
fs.writeFileSync(OUTPATH, JSON.stringify(OUT, null, 1), 'utf8');

const log = [
  'golden-set-prod.json 생성 완료',
  '  cases              : ' + cases.length + '  (게이트 대상 ' + OUT.counts.gate + ')',
  '  needsReCollection  : ' + needsReCollection.length,
  '  family 분해        : ' + JSON.stringify(byFamily),
  '  F3 창 시도/채택    : ' + f3tried + ' / ' + f3n + '  (판별력 있는 것만 채택, 왕복실패 스킵 ' + f3skipRT + ')',
  '  야자시 채택        : ' + jasiN,
  '  해외 GENERIC       : ' + xtN,
  '  축① expected 와 다른 케이스 : ' + diffFromRefAxis + ' / 207',
  '  파일 크기          : ' + fs.statSync(OUTPATH).size + ' B',
].join('\n');
console.log(log);
