// gen.mjs — golden-set.json 생성기
import fs from 'fs';
import { createRequire } from 'module';
import { fourPillars, daewoon, tenGodsOf, solarTermUtc } from './ref.mjs';
import { ref_raw, ref_tz, mans, lj, agree } from './engines.mjs';
const require = createRequire(import.meta.url);
const M = require('manseryeok');

const OUT = [];
const P = (s) => s.split(' ');
const pad = (n) => String(n).padStart(2, '0');

function mk({ id, date, time, gender = 'M', calendarType = 'solar', longitude = null,
              tzMode = 'raw_kst', jasiRule = 'yajasi', region = 'KR', utcOffsetMinutes = null,
              expected, source, confidence, label }) {
  OUT.push({ id,
    input: { date, time, gender, calendarType, longitude,
             tzMode, jasiRule, ...(region !== 'KR' ? { region, utcOffsetMinutes } : {}) },
    expected, source, confidence, label });
}
// 옵션 → ref 엔진 opts
export function toOpts(inp) {
  return { applyTz: inp.tzMode === 'historical', jasiRule: inp.jasiRule,
           longitude: inp.longitude, region: inp.region ?? 'KR',
           utcOffsetMinutes: inp.utcOffsetMinutes ?? undefined };
}
const parse = (d, t) => { const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number);
  return { year: y, month: m, day: dd, hour: h, minute: mi }; };

// ══ A. C13 XP-01~XP-35 (문서화 · manseryeok 기본값 = raw KST 표준시, 정자시) ══
const XP = [
  ['XP-01','2024-02-04','17:26','癸卯 乙丑 戊戌 辛酉','절기 시간대 1시간 (lunar-js 계열 오답)'],
  ['XP-02','2024-02-04','17:27','甲辰 丙寅 戊戌 辛酉','절입 정각 포함 규칙'],
  ['XP-03','1990-05-06','03:34','庚午 庚辰 辛未 庚寅','입하 절입 1분 전'],
  ['XP-04','1990-05-06','03:36','庚午 辛巳 辛未 庚寅','입하 절입 1분 후'],
  ['XP-05','1970-07-07','09:00','庚戌 壬午 戊子 丁巳','sxtwl 날짜단위 절기 오답 검출'],
  ['XP-06','1990-05-05','23:30','庚午 庚辰 庚午 丙子','야자시 유파 3분기 (정자시)'],
  ['XP-07','2025-02-03','23:20','乙巳 戊寅 癸卯 壬子','입춘+야자시 중첩'],
  ['XP-08','2010-12-31','23:59','庚寅 戊子 乙卯 丙子','연말 야자시'],
  ['XP-09','1985-02-03','23:50','甲子 丁丑 癸酉 壬子','입춘 직전 야자시'],
  ['XP-10','2000-01-01','00:00','己卯 丙子 戊午 壬子','자정 정각'],
  ['XP-11','2024-02-11','00:20','甲辰 丙寅 乙巳 丙子','EoT 음수 최대(−14.2분) 구간'],
  ['XP-12','2024-06-21','00:20','甲辰 庚午 丙辰 戊子','EoT −1.6분 + 경도 −30분'],
  ['XP-13','2024-11-03','00:20','甲辰 甲戌 辛未 戊子','EoT +16.5분이 경도보정 상쇄'],
  ['XP-14','1954-03-20','23:30','甲午 丁卯 乙亥 丙子','+9:00 마지막날 야자시'],
  ['XP-15','1954-03-21','00:30','甲午 丁卯 丙子 戊子','표준시 +8:30 첫날'],
  ['XP-16','1961-08-09','23:30','辛丑 丙申 甲戌 甲子','표준시 이력 ↔ 야자시 상호작용'],
  ['XP-17','1987-05-10','03:30','丁卯 乙巳 己未 丙寅','1987 서머타임 개시일'],
  ['XP-18','1988-05-08','03:00','戊辰 丁巳 癸亥 甲寅','1988 서머타임 개시일'],
  ['XP-19','1955-05-05','03:00','乙未 庚辰 丙寅 庚寅','1955 서머타임 + UTC+8:30 중첩'],
  ['XP-20','2025-06-05','23:00','乙巳 壬午 乙巳 丙子','자시 개시 정각'],
  ['XP-21','1948-06-15','12:00','戊子 戊午 辛未 甲午','최초 서머타임 구간(1948)'],
  ['XP-22','1908-04-01','12:00','戊申 乙卯 丙戌 甲午','최초 표준시 시행일(+8:30)'],
  ['XP-23','1912-01-01','12:00','辛亥 庚子 丙子 甲午','+9:00 전환일(1912)'],
  ['XP-24','2050-06-15','08:00','庚午 壬午 丙寅 壬辰','미래 상한'],
  ['XP-25','1988-08-15','12:00','戊辰 庚申 壬寅 丙午','서머타임 기간 낮'],
  ['XP-26','2003-10-08','15:30','癸未 辛酉 甲寅 壬申','한로 무렵(평범 대조군)'],
  ['XP-27','1976-11-11','01:00','丙辰 己亥 丁卯 辛丑','축시 경계'],
  ['XP-28','1996-06-21','06:00','丙子 甲午 己丑 丁卯','전 구현 일치 무해 대조군'],
  ['XP-29','1960-01-01','12:00','己亥 丙子 戊子 戊午','UTC+8:30 시기 낮'],
  ['XP-30','2020-03-20','12:49','庚子 己卯 壬戌 丙午','KASI 미러 손상일(춘분)'],
  ['XP-31','1987-10-11','02:30','丁卯 庚戌 癸巳 癸丑','서머타임 해제 중복시각'],
  ['XP-32','1988-10-09','02:30','戊辰 壬戌 丁酉 辛丑','서머타임 해제 중복시각'],
  ['XP-33','2024-02-04','18:00','甲辰 丙寅 戊戌 辛酉','입춘 직후'],
  ['XP-34','1961-08-10','12:00','辛丑 丙申 乙亥 壬午','+9:00 복귀 당일 낮'],
];
for (const [id, d, t, e, lb] of XP) {
  const got = ref_raw(parse(d, t));
  const same = got.join(' ') === e;
  mk({ id: 'G-' + id, date: d, time: t,
       expected: { pillars: same ? P(e) : got, ...(same ? {} : { supersedes: e }) },
       source: same ? 'C13 §테스트벡터 C (' + id + ')'
                    : 'C13 TV C (' + id + ') 정정 — Skyfield/DE440s 초정밀 절입시각 기준',
       confidence: same ? 'documented' : 'documented',
       label: lb + (same ? '' : ' ⚠️C13 정정: manseryeok 분단위 반올림 테이블 기준 기대값 ' + e + ' 은 오답') });
}
mk({ id: 'G-XP-35', date: '2024-06-21', time: '00:20', longitude: 127.5, tzMode: 'historical',
     expected: { pillars: P('甲辰 庚午 乙卯 丙子') },
     source: 'C13 §테스트벡터 C (XP-35, manseryeok M_tst 모드)', confidence: 'documented',
     label: '진태양시(λ=127.5 + 균시차 + 표준시이력) 모드 골든값 — 일주가 전날로 이동' });

// ══ B. C06 TV-2 원국 4주 (야자시=시주 천간만 익일) ══
const C06 = [
  ['TV-2-1','1990-08-17','10:00','庚午 甲申 甲寅 己巳','평범 기준 케이스(대운 TV-3-A/B와 쌍)'],
  ['TV-2-2','2000-01-01','12:00','己卯 丙子 戊午 戊午','대운수 계단점프 케이스와 쌍'],
  ['TV-2-3','2024-02-04','16:00','癸卯 乙丑 戊戌 庚申','입춘 87분 전'],
  ['TV-2-4','2024-02-04','18:00','甲辰 丙寅 戊戌 辛酉','입춘 33분 후'],
  ['TV-2-5','1949-10-01','00:30','己丑 癸酉 甲子 甲子','일주 기준점(甲子) 검증'],
  ['TV-2-6','2023-11-11','04:30','癸卯 癸亥 癸酉 甲寅','평범'],
  ['TV-2-7','1982-03-21','14:20','壬戌 癸卯 癸卯 己未','평범'],
];
for (const [id, d, t, e, lb] of C06)
  mk({ id: 'G-C06-' + id, date: d, time: t, jasiRule: 'yajasi-nextstem',
       expected: { pillars: P(e) }, source: 'C06 §테스트벡터 TV-2 (' + id + ')',
       confidence: 'documented', label: lb });

// 대운수 (C06 TV-3)
const C06D = [
  ['TV-3-A','1990-08-17','10:00','M','forward',7,'순행 대운수 7'],
  ['TV-3-B','1990-08-17','10:00','F','reverse',3,'역행 대운수 3 (성별만 뒤집기)'],
  ['TV-3-C','2000-01-01','12:00','F','forward',1,'한국식1/반올림2 — 계단 점프 경계'],
  ['TV-3-D','2000-01-01','09:00','F','forward',2,'3시간 앞당기면 대운수 2 (TV-7-1)'],
  ['TV-3-E','2000-01-01','12:00','M','reverse',8,'역행 대운수 8'],
  ['TV-3-F','2023-11-11','04:30','M','reverse',1,'역행 최소값'],
  ['TV-3-G','1982-03-21','14:20','F','reverse',5,'역행 대운수 5'],
];
for (const [id, d, t, g, dir, n, lb] of C06D)
  mk({ id: 'G-C06-' + id, date: d, time: t, gender: g, jasiRule: 'yajasi-nextstem',
       expected: { daewoonDirection: dir, daewoonNumber: n },
       source: 'C06 §테스트벡터 TV-3/TV-7 (' + id + ')', confidence: 'documented', label: lb });

// ══ C. C14 TV-B / TV-C (KASI 절입 기준 기대값) ══
const C14B = [
  ['B-01','2018-02-04','06:28','戊戌 甲寅 丁卯 癸卯','KASI 입춘 06:28 정각 — manseryeok 은 06:29 라 연·월주 오답'],
  ['B-02','2018-02-04','06:29','戊戌 甲寅 丁卯 癸卯','절입 1분 후'],
  ['B-03','2018-02-04','06:27','丁酉 癸丑 丁卯 癸卯','절입 1분 전'],
  ['B-04','2016-03-05','12:43','丙申 辛卯 丙戌 甲午','경칩 반올림 경계 — 월주 갈림'],
  ['B-05','2015-01-06','01:20','甲午 丁丑 壬午 辛丑','소한 반올림 경계 — 월주 갈림'],
  ['B-06','2013-12-07','08:08','癸巳 甲子 丁未 甲辰','대설 반올림 경계 — 월주 갈림'],
  ['B-07','2022-11-07','19:45','壬寅 辛亥 甲子 甲戌','입동 반올림 경계 — 월주 갈림'],
  ['B-08','2012-08-07','11:30','壬辰 戊申 庚子 壬午','입추 반올림 경계 — 월주 갈림'],
  ['B-09','2006-04-05','07:15','丙戌 壬辰 甲子 戊辰','청명 반올림 경계 — 월주 갈림'],
  ['B-10','2009-03-05','19:47','己丑 丁卯 己酉 甲戌','경칩 반올림 경계 — 월주 갈림'],
];
for (const [id, d, t, e, lb] of C14B) {
  const got = ref_raw(parse(d, t));
  const same = got.join(' ') === e;
  mk({ id: 'G-C14-' + id, date: d, time: t,
       expected: { pillars: same ? P(e) : got, ...(same ? {} : { supersedes: e }) },
       source: same ? 'C14 §테스트벡터 TV-B (' + id + ')'
                    : 'C14 TV-B (' + id + ') 정정 — Skyfield/DE440s 초정밀 절입시각 기준(§AE·KASI 반올림 분석)',
       confidence: 'documented',
       label: lb + (same ? '' : ' ⚠️C14 정정: KASI 분값을 절입 순간으로 간주한 기존 기대값 ' + e + ' 은 오답') });
}
const C14C = [
  ['C-01','2011-02-04','15:00','辛卯 庚寅 庚寅 甲申','KASI 미러 2011 오염(입춘 19:22) 배제 — 실입춘 13:33'],
  ['C-02','2011-03-05','20:00','辛卯 庚寅 己未 甲戌','KASI 미러 경칩 03-05 13:21 배제 — 실경칩 03-06 07:30'],
  ['C-03','2011-12-07','10:00','辛卯 己亥 丙申 癸巳','KASI 미러 대설 02:19 배제 — 실대설 20:29'],
];
for (const [id, d, t, e, lb] of C14C)
  mk({ id: 'G-C14-' + id, date: d, time: t, expected: { pillars: P(e) },
       source: 'C14 §테스트벡터 TV-C (' + id + ')', confidence: 'documented', label: lb });

// ══ D. C03 TV-10 회귀 고정 케이스 (진태양시 · 해외 포함) ══
const C03T = [
  ['TV-10-01','1917-11-14','12:00',128.33,null,'丁巳 辛亥 庚申 壬午','국내 진태양시(경도 128.33)'],
  ['TV-10-02','1924-01-06','12:00',126.10,null,'癸亥 甲子 甲申 庚午','국내 진태양시(경도 126.10) 소한 무렵'],
  ['TV-10-03','1955-02-24','19:15',-122.42,-480,'乙未 戊寅 丙辰 丁酉','해외(샌프란시스코 PST)'],
  ['TV-10-04','1879-03-14','11:30',9.99,60,'己卯 丁卯 丙申 甲午','해외(울름 CET) · 1800년대'],
  ['TV-10-05','1961-08-04','19:24',-157.86,-600,'辛丑 乙未 己巳 癸酉','해외(호놀룰루 HST)'],
  ['TV-10-06','1963-02-17','12:00',-74.01,-300,'癸卯 甲寅 辛卯 甲午','해외(뉴욕 EST)'],
  ['TV-10-07','1992-07-08','12:00',127.73,null,'壬申 丁未 乙酉 壬午','국내 진태양시'],
  ['TV-10-08','1997-09-01','12:00',129.08,null,'丁丑 戊申 丙午 甲午','국내 진태양시(부산 경도)'],
  ['TV-10-09','1993-05-16','12:00',126.978,null,'癸酉 丁巳 丁酉 丙午','국내 진태양시(서울 경도)'],
  ['TV-10-10','1968-06-23','12:00',126.978,null,'戊申 戊午 甲子 庚午','국내 진태양시(서울 경도)'],
  ['TV-10-11','1988-08-15','12:00',126.978,null,'戊辰 庚申 壬寅 乙巳','서머타임(+60m) 제거 + 진태양시'],
];
for (const [id, d, t, lon, uoff, e, lb] of C03T)
  mk({ id: 'G-C03-' + id, date: d, time: t, longitude: lon, tzMode: 'historical',
       region: uoff === null ? 'KR' : 'GENERIC', utcOffsetMinutes: uoff,
       expected: { pillars: P(e) }, source: 'C03 §테스트벡터 TV-10 (' + id + ')',
       confidence: 'documented', label: lb });
// C03 TV-7 (입춘 경계 · 진태양시 서울)
mk({ id: 'G-C03-TV-7-1', date: '2025-02-03', time: '23:05', longitude: 126.978, tzMode: 'historical',
     expected: { pillars: P('甲辰 丁丑 癸卯 癸亥') }, source: 'C03 §테스트벡터 TV-7',
     confidence: 'documented', label: '입춘 5분 전 + 진태양시로 亥時 강등(표준시면 子時)' });
mk({ id: 'G-C03-TV-7-2', date: '2025-02-04', time: '00:05', longitude: 126.978, tzMode: 'historical',
     expected: { pillars: P('乙巳 戊寅 癸卯 壬子') }, source: 'C03 §테스트벡터 TV-7',
     confidence: 'documented', label: '입춘 직후 + 진태양시' });
// C03 TV-8 (야자시 3규칙)
for (const [r, e] of [['yajasi','庚午 庚辰 庚午 丙子'], ['johjasi','庚午 庚辰 辛未 戊子'], ['yajasi-nextstem','庚午 庚辰 庚午 戊子']])
  mk({ id: 'G-C03-TV-8-' + r, date: '1990-05-05', time: '23:30', jasiRule: r,
       expected: { pillars: P(e) }, source: 'C03 §테스트벡터 TV-8', confidence: 'documented',
       label: '야자시 규칙 ' + r + ' — 일주/시주가 규칙마다 갈리는 벡터' });
mk({ id: 'G-C03-TV-8-ctrl', date: '1990-05-06', time: '00:30', jasiRule: 'yajasi',
     expected: { pillars: P('庚午 庚辰 辛未 戊子') }, source: 'C03 §테스트벡터 TV-8 (대조)',
     confidence: 'documented', label: '00:30 은 규칙 무관 — 야자시 대조군' });

// ══ D-2. 외부 사료 앵커 ══
mk({ id: 'G-EXT-MAO', date: '1893-12-26', time: '07:30',
     expected: { pillars: P('癸巳 甲子 丁酉 甲辰') },
     source: '마오쩌둥 명조 — C05 TV-01 / C17 TV-C17-01 이 9개 외부 구현체 교차검증에 사용한 4주와 일치',
     confidence: 'documented',
     label: '실존 인물 명조(1893-12-26 辰時). 4주가 외부 문헌 다수와 일치하는 유일한 실명 케이스' });

// ══ E. 엣지케이스 설계 (기대값은 3구현체 합의 또는 ref 단독) ══
const EDGE = [];
function edge(date, time, label, opt = {}) { EDGE.push({ date, time, label, opt }); }
// (1) 절입 ±1분 / ±1시간 : 2020~2026 입춘
for (const y of [2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
  const t = solarTermUtc(y, 315) + 9 * 3600000;
  const dt = new Date(t);
  const fm = (off) => { const x = new Date(t + off * 60000);
    return [`${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`, `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`]; };
  for (const [off, tag] of [[-60, '−1시간'], [-1, '−1분'], [1, '+1분'], [60, '+1시간']]) {
    const [d, tm] = fm(off);
    edge(d, tm, `${y} 입춘(KST ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}) ${tag} — 연주·월주 경계`);
  }
}
// (2) 12절 전체 ±1분 (2024)
for (const [lng, , , nm] of [[345,0,0,'경칩'],[15,0,0,'청명'],[45,0,0,'입하'],[75,0,0,'망종'],[105,0,0,'소서'],
  [135,0,0,'입추'],[165,0,0,'백로'],[195,0,0,'한로'],[225,0,0,'입동'],[255,0,0,'대설'],[285,0,0,'소한']]) {
  const t = solarTermUtc(2024, lng) + 9 * 3600000;
  for (const off of [-1, 1]) {
    const x = new Date(t + off * 60000);
    edge(`${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`,
      `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`, `2024 ${nm} 절입 ${off > 0 ? '+' : '−'}1분 — 월주 경계`);
  }
}
// (3) 자시 경계
for (const [d, t] of [['2024-03-15','22:59'],['2024-03-15','23:00'],['2024-03-15','23:30'],
  ['2024-03-15','23:59'],['2024-03-16','00:00'],['2024-03-16','00:59'],['2024-03-16','01:00']])
  edge(d, t, `자시 경계 ${t} — 시지·일주 전환 검증`);
// (4) 1954~1961 UTC+8:30
for (const [d, t] of [['1954-03-21','12:00'],['1956-08-15','12:00'],['1958-06-01','12:00'],
  ['1959-11-11','12:00'],['1960-05-05','12:00'],['1961-08-09','12:00'],['1961-08-10','12:00']])
  edge(d, t, `UTC+8:30 시행기(1954-03-21~1961-08-09) — ${d}`);
// (5) 서머타임 각 구간 (1948~1988) 한복판 정오
for (const [d, y] of [['1948-07-15',1948],['1949-07-15',1949],['1950-07-15',1950],['1951-07-15',1951],
  ['1955-07-15',1955],['1956-07-15',1956],['1957-07-15',1957],['1958-07-15',1958],
  ['1959-07-15',1959],['1960-07-15',1960],['1987-07-15',1987],['1988-07-15',1988]])
  edge(d, '12:00', `${y} 서머타임 시행 구간 정오 — DST +60분 제거 여부`);
// (6) 윤년 2/29
for (const d of ['2000-02-29','2024-02-29','2036-02-29','1996-02-29','2020-02-29'])
  edge(d, '12:00', `윤년 2월 29일 — 일주 JDN 연속성`);
// (7) 연·세기 경계
for (const [d, t] of [['1900-01-01','12:00'],['2000-01-01','12:00'],['2099-12-31','23:30'],
  ['2100-01-01','00:30'],['2100-12-31','12:00'],['1800-01-01','12:00']])
  edge(d, t, `달력 경계 ${d} — 세기/라이브러리 상하한`);

// (8) 節이 속한 '분' 자체 — 구현체가 가장 잘 갈리는 지점
for (const [lng, nm] of [[315,'입춘'],[345,'경칩'],[15,'청명'],[45,'입하'],[75,'망종'],[105,'소서'],
  [135,'입추'],[165,'백로'],[195,'한로'],[225,'입동'],[255,'대설'],[285,'소한']]) {
  const t = solarTermUtc(2024, lng) + 9 * 3600000; const x = new Date(t);
  edge(`${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`,
    `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`,
    `2024 ${nm} 절입이 속한 분(:00초 기준, 실절입 ${pad(x.getUTCSeconds())}초) — 절입 정각 판정 규칙`);
}
for (const y of [1900, 1950, 2000, 2050, 2100]) {
  const t = solarTermUtc(y, 315) + 9 * 3600000; const x = new Date(t);
  edge(`${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`,
    `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`,
    `${y} 입춘이 속한 분(실절입 ${pad(x.getUTCSeconds())}초) — ΔT 모델 발산 구간 포함`);
}
// (9) 1954-03-20~21 표준시 전환 창 (C15 §2.3 정정 대상)
for (const [d, t] of [['1954-03-20','23:29'],['1954-03-20','23:30'],['1954-03-20','23:45'],
  ['1954-03-20','23:59'],['1954-03-21','00:00'],['1954-03-21','00:15'],['1954-03-21','00:29'],['1954-03-21','00:30']])
  edge(d, t, `1954 +9:00→+8:30 전환창 ${d} ${t} — 오버랩/유일해 판정 (C15 §2.3)`);
// (10) 서머타임 시작/해제 갭·오버랩 분 단위
for (const [d, t] of [['1987-05-10','01:59'],['1987-05-10','02:30'],['1987-05-10','03:00'],
  ['1988-05-08','01:59'],['1988-05-08','02:59'],['1988-05-08','03:00'],
  ['1987-10-11','02:00'],['1987-10-11','02:59'],['1988-10-09','02:00'],['1988-10-09','02:59'],
  ['1961-08-09','23:59'],['1961-08-10','00:15'],['1961-08-10','00:30'],
  ['1912-01-01','00:15'],['1912-01-01','00:30'],['1908-04-01','00:03'],
  ['1948-06-01','00:30'],['1948-06-01','01:00'],['1948-09-12','23:30'],['1955-09-08','23:30']])
  edge(d, t, `표준시/서머타임 전환 경계 ${d} ${t} — GAP/OVERLAP 처리`);
// (11) 라이브러리 상하한
for (const [d, t] of [['1800-01-01','12:00'],['1801-06-15','12:00'],['2299-12-31','12:00'],
  ['2300-01-01','12:00'],['2145-12-31','12:00'],['2146-01-01','12:00']])
  edge(d, t, `절기 지원범위 경계 ${d} — manseryeok 1800~2300 / DE440s 표 1851~2145`);


// ── 엣지 케이스 판정 : 3구현체 합의 여부로 confidence 결정 ──
let ei = 0;
for (const e of EDGE) {
  ei++;
  const inp = parse(e.date, e.time);
  const a = ref_raw(inp);
  let b = null, c = null, err = '';
  try { b = mans(inp); } catch (x) { err += ' manseryeok:' + x.message; }
  try { c = lj(inp); } catch (x) { err += ' lunarjs:' + x.message; }
  const cons = (b && c) ? agree(a, b, c) : null;
  const id = 'G-EDGE-' + pad(ei);
  if (!b || !c) {
    mk({ id, date: e.date, time: e.time,
         expected: { pillars: a, _disagree: { ref: a.join(' '), manseryeok: b ? b.join(' ') : 'ERR', lunarjs: c ? c.join(' ') : 'ERR', note: err.trim() } },
         source: 'ref 단독(astronomy-engine) — 타 구현체 지원범위 밖' + err,
         confidence: 'low', label: e.label + ' ⚠️타 구현체 범위 밖' });
  } else if (cons) {
    mk({ id, date: e.date, time: e.time, expected: { pillars: cons.split(' ') },
         source: 'consensus(ref@astronomy-engine + manseryeok@2.0.0 + lunar-javascript@1.7.7 −1h보정)',
         confidence: 'consensus', label: e.label });
  } else {
    mk({ id, date: e.date, time: e.time, expected: { pillars: a, _disagree: { ref: a.join(' '), manseryeok: b.join(' '), lunarjs: c.join(' ') } },
         source: 'ref 단독(astronomy-engine VSOP87 절기) — 구현체 불일치',
         confidence: 'low', label: e.label + ' ⚠️구현체 불일치' });
  }
}

// ── 음력 입력 (윤달 포함) ──
const LUN = [
  [2023, 2, 1, true, '2023 윤2월 초하루'], [2023, 2, 1, false, '2023 평2월 초하루(윤달 대조군)'],
  [2020, 4, 15, true, '2020 윤4월 보름'], [2020, 4, 15, false, '2020 평4월 보름(대조군)'],
  [2017, 5, 10, true, '2017 윤5월'], [1998, 5, 5, true, '1998 윤5월'],
  [2025, 6, 1, true, '2025 윤6월 초하루'], [1391, 1, 1, false, 'manseryeok 음력 하한 LUNAR_MIN_YEAR=1391'],
  [2100, 12, 1, false, 'manseryeok 음력 상한 LUNAR_MAX_YEAR=2100'],
];
let li = 0;
for (const [y, m, d, leap, lb] of LUN) {
  li++;
  let s; try { s = M.lunarToSolar(y, m, d, leap); } catch (err) { console.log('lunar skip', y, m, d, leap, err.message); continue; }
  const date = `${s.year}-${pad(s.month)}-${pad(s.day)}`;
  const inp = parse(date, '12:00');
  const a = ref_raw(inp);
  let b = null, c = null, err = '';
  try { b = mans(inp); } catch (e) { err += ' manseryeok:' + e.message; }
  try { c = lj(inp); } catch (e) { err += ' lunarjs:' + e.message; }
  const cons = (b && c) ? agree(a, b, c) : null;
  mk({ id: 'G-LUNAR-' + pad(li), date, time: '12:00', calendarType: leap ? 'lunar_leap' : 'lunar',
       expected: { pillars: cons ? cons.split(' ') : a, solarDate: date,
                   ...(cons ? {} : { _disagree: { ref: a.join(' '), manseryeok: b ? b.join(' ') : 'ERR', lunarjs: c ? c.join(' ') : 'ERR', note: err.trim() } }) },
       source: cons ? 'consensus(3구현체) + manseryeok.lunarToSolar 음↔양 변환'
                    : 'ref 단독(astronomy-engine) — 타 구현체 범위 밖/불일치' + err,
       confidence: cons ? 'consensus' : 'low',
       label: `${lb} (음력 ${y}-${leap ? '윤' : ''}${m}-${d} → 양력 ${date})` });
}

// ── 대량 합의 케이스 : 1900~2100 결정적 샘플 ──
let rnd = 20260811;
const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
let ci = 0, tried = 0, rejected = 0;
while (ci < 60 && tried < 4000) {
  tried++;
  const y = 1900 + Math.floor(rand() * 201);
  const mo = 1 + Math.floor(rand() * 12);
  const d = 1 + Math.floor(rand() * 28);
  const h = Math.floor(rand() * 24), mi = Math.floor(rand() * 60);
  const inp = { year: y, month: mo, day: d, hour: h, minute: mi };
  let a, b, c;
  try { a = ref_raw(inp); b = mans(inp); c = lj(inp); } catch { rejected++; continue; }
  const cons = agree(a, b, c);
  if (!cons) { rejected++; continue; }
  ci++;
  mk({ id: 'G-CONS-' + pad(ci), date: `${y}-${pad(mo)}-${pad(d)}`, time: `${pad(h)}:${pad(mi)}`,
       gender: ci % 2 ? 'M' : 'F',
       expected: { pillars: cons.split(' ') },
       source: 'consensus(ref@astronomy-engine + manseryeok@2.0.0 + lunar-javascript@1.7.7 −1h보정)',
       confidence: 'consensus', label: `무작위 합의 표본 #${ci} (1900~2100 균등)` });
}

// ── 파생값 채우기 : tenGods (순수 룩업) · daewoonNumber (ref) ──
for (const g of OUT) {
  if (!g.expected.pillars) continue;
  const [yp, mp, dp, hp] = g.expected.pillars;
  g.expected.yearPillar = yp; g.expected.monthPillar = mp;
  g.expected.dayPillar = dp; g.expected.hourPillar = hp;
  g.expected.tenGods = tenGodsOf({ yearPillar: yp, monthPillar: mp, dayPillar: dp, hourPillar: hp });
  if (g.confidence !== 'low') {
    try {
      const dw = daewoon(parse(g.input.date, g.input.time), g.input.gender, toOpts(g.input));
      g.expected.daewoonNumber = dw.daewoonNumber;
      g.expected.daewoonDirection = dw.direction;
    } catch { /* 범위 밖 */ }
  }
  delete g.expected.pillars;
}
for (const g of OUT) if (g.expected._disagree) { g.expected.disagreement = g.expected._disagree; delete g.expected._disagree; }

// ── 일주 전용 외부 앵커 (en.wikipedia Sexagenary cycle 워크드 예제) ──
const dayPillarAnchors = [
  { date: '1949-10-01', dayPillar: '甲子', calendar: 'gregorian', source: 'en.wikipedia Sexagenary_cycle 예제 1' },
  { date: '1592-12-31', dayPillar: '甲申', calendar: 'gregorian', source: 'en.wikipedia Sexagenary_cycle 예제 2' },
  { date: '1338-08-04', dayPillar: '辛亥', calendar: 'julian',    source: 'en.wikipedia Sexagenary_cycle 예제 3' },
  { date: '-0104-05-25', dayPillar: '庚寅', calendar: 'julian',   source: 'en.wikipedia Sexagenary_cycle 예제 4 (105 BC)' },
  { date: '-0719-02-22', dayPillar: '己巳', calendar: 'julian',   source: 'en.wikipedia Sexagenary_cycle 예제 5 (720 BC)' },
  { date: '1900-01-01', dayPillar: '甲戌', calendar: 'gregorian', source: 'C03 TV-1' },
  { date: '1992-10-24', dayPillar: '癸酉', calendar: 'gregorian', source: 'C03 TV-1 / ssaju baseGanjiNum=9' },
  { date: '2000-01-01', dayPillar: '戊午', calendar: 'gregorian', source: 'C03 TV-1' },
  { date: '2026-08-11', dayPillar: '丁巳', calendar: 'gregorian', source: 'C03 TV-1' },
];

const meta = {
  title: '사주 계산 엔진 골든 테스트셋',
  dayPillarAnchors,
  generatedAt: new Date().toISOString(),
  count: OUT.length,
  byConfidence: OUT.reduce((a, g) => (a[g.confidence] = (a[g.confidence] || 0) + 1, a), {}),
  engines: { ref: 'astronomy-engine@2.1.19 (VSOP87) + C03 공식 자체구현',
             manseryeok: '2.0.0', 'lunar-javascript': '1.7.7 (KST−1h 보정 적용)' },
  conventions: {
    tzMode: "'raw_kst' = 입력 벽시계를 UTC+9 로 그대로 해석(manseryeok 기본값). 'historical' = C15 §2.2 전환표 28건 적용(서머타임 제거, 1954~1961 +8:30)",
    jasiRule: "'yajasi' 정자시(일주=당일, 시간天干=당일 일간 遁) | 'johjasi' 조자시(23시부터 일주도 익일) | 'yajasi-nextstem' (일주=당일, 시간天干만 익일 일간 遁)",
    longitude: 'null = 경도·균시차 보정 없음. 숫자 = 진태양시(경도보정 4(λ−λ_std) + 균시차 NOAA/Meeus)',
    calendarType: "'solar' | 'lunar' | 'lunar_leap' (음력은 date 필드에 이미 변환된 양력이 들어있고 label 에 원 음력일 표기)",
    daewoonNumber: '한국식 = round(floor(Δ일)/3), Δ = 순행이면 다음 節까지, 역행이면 직전 節부터',
  },
  cautions: [
    'confidence:"low" 는 3구현체가 갈린 케이스. expected.disagreement 에 각 구현 산출값을 병기했으며 정답은 미확정이다.',
    'confidence:"consensus" 는 외부 사료 근거가 아니라 3구현체 합의일 뿐이다. 세 구현이 공통으로 틀릴 가능성은 배제하지 못한다.',
    'tenGods 는 expected 4주로부터 순수 룩업으로 유도한 값이라 4주가 틀리면 함께 틀린다(독립 근거 아님).',
  ],
};
fs.writeFileSync('golden-set.json', JSON.stringify({ ...meta, cases: OUT }, null, 1), 'utf8');
console.log('총', OUT.length, '건', JSON.stringify(meta.byConfidence));
console.log('합의 샘플: 시도', tried, '기각', rejected);
