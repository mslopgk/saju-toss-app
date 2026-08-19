import { wallToUtc, offsetAt } from './ref.mjs';
const MIN = 60000;
const iso = ms => new Date(ms).toISOString();
// Temporal 'compatible'(SHIFT_FORWARD) 정의:
//   갭에 빠진 벽시계는 "갭 직전에 유효했던 오프셋"으로 해석한다.
//   결과 순간은 전환 순간 이후가 되고, 벽시계는 갭 폭만큼 앞으로 밀린다.
const TRANS = [ // [전환 UTC ms, 전환 전 총오프셋, 전환 후 총오프셋]
  [Date.UTC(1908,2,31,15,32,8), 507.8667, 510],
  [Date.UTC(1911,11,31,15,30,0), 510, 540],
  [Date.UTC(1948,4,31,15,0,0), 540, 600],
  [Date.UTC(1949,3,2,15,0,0), 540, 600],
  [Date.UTC(1950,2,31,15,0,0), 540, 600],
  [Date.UTC(1951,4,5,15,0,0), 540, 600],
  [Date.UTC(1955,4,4,15,30,0), 510, 570],
  [Date.UTC(1956,4,19,15,30,0), 510, 570],
  [Date.UTC(1957,4,4,15,30,0), 510, 570],
  [Date.UTC(1958,4,3,15,30,0), 510, 570],
  [Date.UTC(1959,4,2,15,30,0), 510, 570],
  [Date.UTC(1960,3,30,15,30,0), 510, 570],
  [Date.UTC(1961,7,9,15,30,0), 510, 540],
  [Date.UTC(1987,4,9,17,0,0), 540, 600],
  [Date.UTC(1988,4,7,17,0,0), 540, 600],
];
function expect(y, mo, d, h, mi) {
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  for (const [t, before] of TRANS) {
    const c = naive - Math.round(before * MIN);
    if (c >= t && c < t + 24 * 3600000) return { utc: c, before };
  }
  return null;
}
const GAPS = [
  [1908, 4, 1, 0, 1], [1912, 1, 1, 0, 15], [1948, 6, 1, 0, 30], [1949, 4, 3, 0, 30],
  [1950, 4, 1, 0, 30], [1951, 5, 6, 0, 30], [1955, 5, 5, 0, 30], [1956, 5, 20, 0, 30],
  [1957, 5, 5, 0, 30], [1958, 5, 4, 0, 30], [1959, 5, 3, 0, 30], [1960, 5, 1, 0, 30],
  [1961, 8, 10, 0, 15], [1987, 5, 10, 2, 30], [1988, 5, 8, 2, 30],
];
console.log('| # | 갭 벽시계 | 갭 직전 오프셋 | ref.mjs 반환 | 정답(SHIFT_FORWARD) | 오차 |');
console.log('|---|---|---|---|---|---|');
let bad = 0, i = 0;
for (const g of GAPS) {
  i++;
  const r = wallToUtc(...g);
  const e = expect(...g);
  const err = (r.utc - e.utc) / 1000;
  if (err !== 0) bad++;
  const errs = err === 0 ? '**0**' : `**+${(err/60).toFixed(4)}분 (${err}s)**`;
  console.log(`| ${i} | ${g[0]}-${String(g[1]).padStart(2,'0')}-${String(g[2]).padStart(2,'0')} ${String(g[3]).padStart(2,'0')}:${String(g[4]).padStart(2,'0')} | ${e.before} | ${iso(r.utc)} | ${iso(e.utc)} | ${errs} |`);
}
console.log(`\n오답 ${bad}/${GAPS.length}`);
