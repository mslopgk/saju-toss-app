// engines.mjs — 4개 독립 구현체를 동일 인터페이스로 감싼다 (KST 벽시계 입력, 정자시, 표준시 그대로)
import { createRequire } from 'module';
import { fourPillars } from './ref.mjs';
const require = createRequire(import.meta.url);
const M = require('manseryeok');
const { Solar } = require('lunar-javascript');

const S = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const B = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
const KS = ['갑','을','병','정','무','기','경','신','임','계'];
const KB = ['자','축','인','묘','진','사','오','미','신','유','술','해'];
const h = (s) => S[KS.indexOf(s[0])] + B[KB.indexOf(s[1])];

// ① ref (astronomy-engine + C03 공식) — 표준시 이력 미적용 = raw KST(+9)
export function ref_raw(i) {
  const p = fourPillars(i, { applyTz: false, jasiRule: 'yajasi' });
  return [p.yearPillar, p.monthPillar, p.dayPillar, p.hourPillar];
}
// ①' ref (표준시 이력 적용)
export function ref_tz(i) {
  const p = fourPillars(i, { applyTz: true, jasiRule: 'yajasi' });
  return [p.yearPillar, p.monthPillar, p.dayPillar, p.hourPillar];
}
// ② manseryeok 기본값 (KST 벽시계 그대로, dayBoundary=midnight = 정자시)
export function mans(i) {
  const r = M.calculateFourPillars({ year: i.year, month: i.month, day: i.day, hour: i.hour, minute: i.minute });
  return [h(r.yearString), h(r.monthString), h(r.dayString), h(r.hourString)];
}
// ③ lunar-javascript 시간대 보정판:
//    연·월주 = LJ(T−1h)  (LJ 절기는 UTC+8 기준이라 KST 입력을 1시간 빼서 중국 로컬로 변환)
//    일·시주 = LJ(T) sect=2 로 얻되 시간 天干은 당일 일간 遁(정자시)으로 재계산
export function lj(i) {
  const t = Date.UTC(i.year, i.month - 1, i.day, i.hour, i.minute) - 3600000;
  const d = new Date(t);
  const ecA = Solar.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), 0).getLunar().getEightChar();
  ecA.setSect(2);
  const ecB = Solar.fromYmdHms(i.year, i.month, i.day, i.hour, i.minute, 0).getLunar().getEightChar();
  ecB.setSect(2);
  const day = ecB.getDay();
  const hb = ecB.getTime()[1];
  const OSEODUN = [0, 2, 4, 6, 8, 0, 2, 4, 6, 8];
  const hs = S[(OSEODUN[S.indexOf(day[0])] + B.indexOf(hb)) % 10];
  return [ecA.getYear(), ecA.getMonth(), day, hs + hb];
}
export function agree(...rows) {
  const j = rows.map((r) => r.join(' '));
  return j.every((x) => x === j[0]) ? j[0] : null;
}
