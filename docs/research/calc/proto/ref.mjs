// ref.mjs — 골든 테스트셋 검증용 레퍼런스 엔진
// 근거: C01/C02/C03/C06/C13/C15/C16
import * as Astronomy from 'astronomy-engine';

export const STEMS = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
export const BRANCHES = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// ── 표준시 이력 (C15 §2.2, ICU tzdata 2025c 실측 28건) ────────────────────
// [전환 UTC ms, 전환 이후 총오프셋(분), std(분), dst(분)]
const TZ = [
  [-Infinity,                  507.8667, 507.8667, 0], // LMT +08:27:52
  [Date.UTC(1908,2,31,15,32,8),   510, 510, 0],
  [Date.UTC(1911,11,31,15,30,0),  540, 540, 0],
  [Date.UTC(1948,4,31,15,0,0),    600, 540,60],
  [Date.UTC(1948,8,12,14,0,0),    540, 540, 0],
  [Date.UTC(1949,3,2,15,0,0),     600, 540,60],
  [Date.UTC(1949,8,10,14,0,0),    540, 540, 0],
  [Date.UTC(1950,2,31,15,0,0),    600, 540,60],
  [Date.UTC(1950,8,9,14,0,0),     540, 540, 0],
  [Date.UTC(1951,4,5,15,0,0),     600, 540,60],
  [Date.UTC(1951,8,8,14,0,0),     540, 540, 0],
  [Date.UTC(1954,2,20,15,30,0),   510, 510, 0],  // C20: 대통령령 제876호 「檀紀四二八七年三月二十一日午前零時三十分부터」. tzdb 15:00Z 는 오류
  [Date.UTC(1955,4,4,15,30,0),    570, 510,60],
  [Date.UTC(1955,8,8,14,30,0),    510, 510, 0],
  [Date.UTC(1956,4,19,15,30,0),   570, 510,60],
  [Date.UTC(1956,8,29,14,30,0),   510, 510, 0],
  [Date.UTC(1957,4,4,15,30,0),    570, 510,60],
  [Date.UTC(1957,8,21,14,30,0),   510, 510, 0],
  [Date.UTC(1958,4,3,15,30,0),    570, 510,60],
  [Date.UTC(1958,8,20,14,30,0),   510, 510, 0],
  [Date.UTC(1959,4,2,15,30,0),    570, 510,60],
  [Date.UTC(1959,8,19,14,30,0),   510, 510, 0],
  [Date.UTC(1960,3,30,15,30,0),   570, 510,60],
  [Date.UTC(1960,8,17,14,30,0),   510, 510, 0],
  [Date.UTC(1961,7,9,15,30,0),    540, 540, 0],
  [Date.UTC(1987,4,9,17,0,0),     600, 540,60],
  [Date.UTC(1987,9,10,17,0,0),    540, 540, 0],
  [Date.UTC(1988,4,7,17,0,0),     600, 540,60],
  [Date.UTC(1988,9,8,17,0,0),     540, 540, 0],
];
export function offsetAt(utcMs) {
  let r = TZ[0];
  for (const t of TZ) if (utcMs >= t[0]) r = t; else break;
  return { total: r[1], std: r[2], dst: r[3] };
}
// 벽시계 → UTC. 후보 0개(GAP)/2개(OVERLAP) 처리: gap=SHIFT_FORWARD, overlap=FIRST
export function wallToUtc(y, mo, d, h, mi, s = 0) {
  const naive = Date.UTC(y, mo - 1, d, h, mi, s);
  const cands = [];
  const seen = new Set();
  for (const t of TZ) {
    const off = t[1];
    const cand = naive - Math.round(off * 60000);
    if (seen.has(cand)) continue;
    seen.add(cand);
    if (offsetAt(cand).total === off) cands.push({ utc: cand, off });
  }
  cands.sort((a, b) => a.utc - b.utc);
  if (cands.length === 1) return { utc: cands[0].utc, off: cands[0].off, flags: [] };
  if (cands.length >= 2) return { utc: cands[0].utc, off: cands[0].off, flags: ['OVERLAP'] };
  // GAP: 갭 직전에 유효했던 오프셋으로 해석 → 벽시계가 갭 폭만큼 앞으로 밀린다
  //       (SHIFT_FORWARD = Temporal 'compatible')
  // C20 정정: 구 구현은 `shifted`(naive 로부터 real*60000 떨어진 값)를 `best`(naive 로부터
  //           507.8667*60000 떨어진 값)와 비교해 갱신 조건이 절대 성립하지 않았고,
  //           그 결과 모든 갭에서 LMT 오프셋 후보를 반환했다(15구간 중 14구간 오답,
  //           오차 +2.1333분 또는 +32.1333분). C20 §5.4 참조.
  let best = null;
  for (let i = 1; i < TZ.length; i++) {
    const trans = TZ[i][0];              // 전환 순간(UTC ms)
    const before = TZ[i - 1][1];         // 전환 직전 총오프셋(분)
    const cand = naive - Math.round(before * 60000);
    if (cand >= trans && cand < trans + 86400000) {
      if (best === null || cand < best) best = cand;
    }
  }
  if (best === null) best = naive - Math.round(TZ[0][1] * 60000);
  const off = offsetAt(best).total;
  return { utc: best, off, flags: ['GAP'] };
}

// ── 절기 ─────────────────────────────────────────────────────────────────
// 1차 소스: Skyfield + JPL DE440s 로 산출한 사전계산 테이블 (1851~2145, 7080건)
// 2차 소스: astronomy-engine SearchSunLongitude (테이블 범위 밖) — ΔT 모델 차이로
//           DE440s 대비 최대 175 s 어긋난다(§AE편차 참조). 범위 밖은 신뢰도 저하.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __d = path.dirname(fileURLToPath(import.meta.url));
let TABLE = null;
export let TABLE_RANGE = [0, 0];
try {
  const raw = JSON.parse(fs.readFileSync(path.join(__d, 'solarterms-de440s.json'), 'utf8'));
  TABLE = new Map();
  let lo = Infinity, hi = -Infinity;
  for (const r of raw) { TABLE.set(r.year + ':' + r.sunLng, Date.parse(r.utc)); lo = Math.min(lo, r.year); hi = Math.max(hi, r.year); }
  TABLE_RANGE = [lo, hi];
} catch { TABLE = null; }

const termCache = new Map();
export function solarTermUtc(year, lng) {
  const key = year + ':' + lng;
  if (TABLE && TABLE.has(key)) return TABLE.get(key);
  if (termCache.has(key)) return termCache.get(key);
  // 근사 기준: 춘분(λ=0) ≈ 3/20, λ 증가율 0.98564736°/일
  const baseY = lng >= 285 ? year - 1 : year;
  const est = Date.UTC(baseY, 2, 20) + (lng / 0.98564736) * 86400000;
  let t = null;
  for (const w of [12, 25, 45]) {                // 창을 넓혀가며 재시도
    const start = new Astronomy.AstroTime(new Date(est - w * 86400000));
    t = Astronomy.SearchSunLongitude(lng, start, 2 * w);
    if (t) break;
  }
  if (!t) throw new Error('solarTermUtc fail ' + year + ' ' + lng);
  const ms = t.date.getTime();
  termCache.set(key, ms);
  return ms;
}
// 12절(節) : [황경, 월지 index(0=子), 寅기준 순번]
export const JIE = [
  [315, 2,  0, '입춘'], [345, 3,  1, '경칩'], [15,  4,  2, '청명'], [45,  5,  3, '입하'],
  [75,  6,  4, '망종'], [105, 7,  5, '소서'], [135, 8,  6, '입추'], [165, 9,  7, '백로'],
  [195, 10, 8, '한로'], [225, 11, 9, '입동'], [255, 0, 10, '대설'], [285, 1, 11, '소한'],
];
// 특정 UTC 이전의 마지막 節 (연도 후보 스캔)
export function prevJie(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  let best = null;
  for (const yy of [y - 1, y, y + 1]) {
    for (const j of JIE) {
      const t = solarTermUtc(yy, j[0]);
      if (t <= utcMs && (best === null || t > best.t)) best = { t, jie: j, year: yy };
    }
  }
  return best;
}
export function nextJie(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  let best = null;
  for (const yy of [y - 1, y, y + 1]) {
    for (const j of JIE) {
      const t = solarTermUtc(yy, j[0]);
      if (t > utcMs && (best === null || t < best.t)) best = { t, jie: j, year: yy };
    }
  }
  return best;
}

// ── 균시차 (NOAA/Meeus, C01 §4) ───────────────────────────────────────────
const R = Math.PI / 180;
export function eotMinutes(utcMs) {
  const jd = utcMs / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  const L0 = (280.46646 + 36000.76983 * T + 0.0003032 * T * T) % 360;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const eps0 = 23 + 26 / 60 + 21.448 / 3600 - (46.8150 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
  const om = 125.04 - 1934.136 * T;
  const eps = eps0 + 0.00256 * Math.cos(om * R);
  const y = Math.tan(eps / 2 * R) ** 2;
  const E = y * Math.sin(2 * L0 * R) - 2 * e * Math.sin(M * R)
    + 4 * e * y * Math.sin(M * R) * Math.cos(2 * L0 * R)
    - 0.5 * y * y * Math.sin(4 * L0 * R) - 1.25 * e * e * Math.sin(2 * M * R);
  return E / R * 4;
}

// ── 60갑자 / JDN ─────────────────────────────────────────────────────────
export function gz(i) { const n = ((i % 60) + 60) % 60; return STEMS[n % 10] + BRANCHES[n % 12]; }
// 정오 JDN. 1582-10-15 이후는 그레고리력, 이전은 율리우스력으로 해석한다.
// (근거: en.wikipedia Sexagenary cycle 워크드 예제 5건 — §외부 앵커 검증)
export function jdnFromYmd(y, m, d) {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  const common = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4);
  const greg = common - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  if (y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)))) return greg;
  return common - 32083;                                   // 율리우스력
}

// ── 메인 ─────────────────────────────────────────────────────────────────
// opts: { jasiRule: 'yajasi'|'johjasi'|'yajasi-nextstem', longitude: number|null,
//         applyTz: boolean }
export function fourPillars(input, opts = {}) {
  const jasiRule = opts.jasiRule ?? 'yajasi';
  const longitude = opts.longitude ?? null;
  const applyTz = opts.applyTz ?? true;
  const { year: Y, month: MO, day: D, hour: H, minute: MI } = input;

  let utc, offMin, flags = [], o;
  if (opts.region === 'GENERIC') {
    // C00 §3-A14 / 적대검증 #13: 해외는 `stdOffsetMinutes` + `dstMinutes` 를 필수로 받는다.
    // `utcOffsetMinutes` 는 골든셋 v1 호환 별칭(= stdOffsetMinutes).
    const std = opts.stdOffsetMinutes ?? opts.utcOffsetMinutes ?? 540, dst = opts.dstMinutes ?? 0;
    utc = Date.UTC(Y, MO - 1, D, H, MI) - (std + dst) * 60000;
    offMin = std + dst; o = { total: std + dst, std, dst };
  } else if (applyTz) {
    const r = wallToUtc(Y, MO, D, H, MI); utc = r.utc; offMin = r.off; flags = r.flags;
    o = offsetAt(utc);
  } else {
    utc = Date.UTC(Y, MO - 1, D, H, MI) - 540 * 60000; offMin = 540; o = { total: 540, std: 540, dst: 0 };
  }
  let localMs;                                   // 명식용 로컬 ms (UTC epoch + 오프셋)
  if (longitude === null) {
    localMs = utc + o.std * 60000;               // DST 제거한 표준시 벽시계
  } else {
    const lstd = o.std / 4;                      // 표준자오선 경도(°)
    const L = 4 * (longitude - lstd);            // 분
    const E = eotMinutes(utc);
    localMs = utc + o.std * 60000 + Math.round((L + E) * 60000);
  }
  const lt = new Date(localMs);
  const ly = lt.getUTCFullYear(), lmo = lt.getUTCMonth() + 1, ld = lt.getUTCDate();
  const lh = lt.getUTCHours(), lmi = lt.getUTCMinutes();

  // 절기 판정은 절대시각(UTC) 기준. (F3 / C00 §4.3 V4 정정 1 — 2026-08-12 적용)
  // 구 구현: `longitude === null ? utc : localMs - o.std*60000` — 진태양시 모드에서 절기
  //          비교 기준을 (L+E) = −46.27~−15.55분(서울)만큼 이동시켜 每 節 직후 최대 46분
  //          창에서 연주·월주·대운Δ 를 오염시켰다. 반례: 서울 2025-02-03 23:20 TRUE_SOLAR
  //          → 구현 `甲辰 丁丑` vs F3 정답 `乙巳 戊寅`.
  const termRefUtc = utc;

  // 연주: 입춘
  const ipchun = solarTermUtc(ly, 315);
  const sajuYear = termRefUtc >= ipchun ? ly : ly - 1;
  const ysIdx = ((sajuYear - 4) % 10 + 10) % 10;
  const ybIdx = ((sajuYear - 4) % 12 + 12) % 12;

  // 월주: 직전 節 + 오호둔
  const pj = prevJie(termRefUtc);
  const mbIdx = pj.jie[1], order = pj.jie[2];
  const OHODUN = [2, 4, 6, 8, 0, 2, 4, 6, 8, 0];
  const msIdx = (OHODUN[ysIdx] + order) % 10;

  // 일주 : 로컬 달력일 JDN
  let dayJdn = jdnFromYmd(ly, lmo, ld);
  const isYaja = lh === 23;
  if (isYaja && jasiRule === 'johjasi') dayJdn += 1;
  const dIdx = ((dayJdn - 11) % 60 + 60) % 60;

  // 시주
  const hbIdx = Math.floor((((lh * 60 + lmi) + 60) % 1440) / 120);
  const OSEODUN = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8];
  let stemBaseDay = dIdx % 10;
  if (isYaja && jasiRule === 'yajasi-nextstem') stemBaseDay = (dIdx + 1) % 10;
  const hsIdx = (OSEODUN[stemBaseDay] + hbIdx) % 10;

  return {
    yearPillar: STEMS[ysIdx] + BRANCHES[ybIdx],
    monthPillar: STEMS[msIdx] + BRANCHES[mbIdx],
    dayPillar: gz(dIdx),
    hourPillar: STEMS[hsIdx] + BRANCHES[hbIdx],
    _meta: { utc: new Date(utc).toISOString(), offMin, flags, localIso: lt.toISOString().slice(0, 19),
             stdOffsetMinutes: o.std, dstMinutes: o.dst,
             sajuYear, jieName: pj.jie[3], jieUtc: new Date(pj.t).toISOString(), dayJdn, termRefUtc },
  };
}

// ── 대운수 (C06) ─────────────────────────────────────────────────────────
export function daewoon(input, gender, opts = {}) {
  const fp = fourPillars(input, opts);
  const ysIdx = STEMS.indexOf(fp.yearPillar[0]);
  const yangYear = ysIdx % 2 === 0;
  const forward = (gender === 'M') === yangYear;
  const ref = fp._meta.termRefUtc;
  const deltaMs = forward ? (nextJie(ref).t - ref) : (ref - prevJie(ref).t);
  const days = deltaMs / 86400000;
  const deltaMinutes = deltaMs / 60000;
  // C00 §S6-2: 대운수 = max(1, round(floor(Δ일)/3)). 클램프는 규범(§S6-2(b): 없으면 275→216).
  const kr = Math.max(1, Math.round(Math.floor(days) / 3));
  // C00 §S6-2: 교운 절대순간은 정수 산술로 직접 정의한다(달력 덧셈 금지).
  const changeoverUtcMs = Date.parse(fp._meta.utc) + Math.round(deltaMinutes * 480) * 60000;
  return { direction: forward ? 'forward' : 'reverse', deltaMinutes,
           deltaDays: days, daewoonNumber: kr,
           changeoverUtcMs,
           roundNumber: Math.round(days / 3), floorNumber: Math.floor(days / 3) };
}

// ── 십신 (C04/C16) ───────────────────────────────────────────────────────
const ELEM = { 甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水' };
const YY = { 甲:1,乙:0,丙:1,丁:0,戊:1,己:0,庚:1,辛:0,壬:1,癸:0 };
const GEN = { 木:'火', 火:'土', 土:'金', 金:'水', 水:'木' };
const OVC = { 木:'土', 火:'金', 土:'水', 金:'木', 水:'火' };
// 지지 정기(본기)
export const JIJANGGAN_MAIN = { 子:'癸',丑:'己',寅:'甲',卯:'乙',辰:'戊',巳:'丙',
                                午:'丁',未:'己',申:'庚',酉:'辛',戌:'戊',亥:'壬' };
export function tenGod(dayStem, other) {
  const de = ELEM[dayStem], oe = ELEM[other];
  const same = YY[dayStem] === YY[other];
  if (oe === de)      return same ? '비견' : '겁재';
  if (GEN[de] === oe) return same ? '식신' : '상관';
  if (OVC[de] === oe) return same ? '편재' : '정재';
  if (OVC[oe] === de) return same ? '편관' : '정관';
  if (GEN[oe] === de) return same ? '편인' : '정인';
  throw new Error('tenGod fail ' + dayStem + other);
}
export function tenGodsOf(p) {
  const ds = p.dayPillar[0];
  return {
    yearStem: tenGod(ds, p.yearPillar[0]),
    monthStem: tenGod(ds, p.monthPillar[0]),
    hourStem: tenGod(ds, p.hourPillar[0]),
    yearBranch: tenGod(ds, JIJANGGAN_MAIN[p.yearPillar[1]]),
    monthBranch: tenGod(ds, JIJANGGAN_MAIN[p.monthPillar[1]]),
    dayBranch: tenGod(ds, JIJANGGAN_MAIN[p.dayPillar[1]]),
    hourBranch: tenGod(ds, JIJANGGAN_MAIN[p.hourPillar[1]]),
  };
}
