import { solarTermUtc } from './ref.mjs';
import fs from 'fs';
const G=JSON.parse(fs.readFileSync('C:/Users/user/orca/projects/saju-toss-app/docs/research/calc/golden-solarterms.json','utf8'));
const kst=ms=>new Date(ms+9*3600000).toISOString().replace('T',' ').slice(0,19);
const cases=[['B-01',2018,315,'입춘','2018-02-04 06:28'],['B-04',2016,345,'경칩','2016-03-05 12:43'],
['B-05',2015,285,'소한','2015-01-06 01:20'],['B-06',2013,255,'대설','2013-12-07 08:08'],
['B-07',2022,225,'입동','2022-11-07 19:45'],['B-08',2012,135,'입추','2012-08-07 11:30'],
['B-09',2006,15,'청명','2006-04-05 07:15'],['B-10',2009,345,'경칩','2009-03-05 19:47']];
console.log('| ID | 절 | KASI 공표(분) | manseryeok(분) | AE 초정밀(KST) | 입력시각 | AE판정 |');
console.log('|---|---|---|---|---|---|---|');
for(const[id,y,lng,nm,inp]of cases){
  const ae=solarTermUtc(y,lng); const aeK=kst(ae);
  const rec=G.terms.find(t=>t.year===y&&t.name===nm);
  const inpMs=Date.parse(inp.replace(' ','T')+'+09:00');
  console.log(`| ${id} | ${y} ${nm} | ${rec?rec.kasi_kst:'—'} | ${rec?rec.manseryeok_kst:'—'} | ${aeK} | ${inp} | ${inpMs>=ae?'절입 후':'절입 전'} |`);
}
