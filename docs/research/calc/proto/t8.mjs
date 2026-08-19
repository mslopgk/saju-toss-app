import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url); const M = require('manseryeok');
const T = JSON.parse(fs.readFileSync('solarterms-de440s.json','utf8'));
const REF = new Map(T.map(r=>[r.year+':'+r.name, Date.parse(r.utc)]));
const JIE=['입춘','경칩','청명','입하','망종','소서','입추','백로','한로','입동','대설','소한'];
const rows=[];
for(let y=1900;y<=2100;y++){
  let tot=0,worst=0,wn='';
  for(let i=0;i<24;i++){ let d;try{d=M.getSolarTerm(y,i);}catch{continue;}
    if(!JIE.includes(d.name))continue; const k=y+':'+d.name; if(!REF.has(k))continue;
    const dd=Math.abs(Date.parse(d.date)-REF.get(k))/60000; tot+=dd; if(dd>worst){worst=dd;wn=d.name;}
  }
  rows.push({y,tot,worst,wn});
}
for(const[lo,hi]of[[1900,1919],[1920,1939],[1940,1959],[1960,1979],[1980,1999],[2000,2019],[2020,2039],[2040,2059],[2060,2079],[2080,2100]]){
  const s=rows.filter(r=>r.y>=lo&&r.y<=hi);
  const avg=s.reduce((a,r)=>a+r.tot,0)/s.length;
  const mx=s.reduce((a,r)=>r.worst>a.worst?r:a,s[0]);
  console.log(`${lo}~${hi}: 연평균 월주오판 창 ${avg.toFixed(2)}분 / 연 (=${(avg/525949*100).toFixed(4)}% 확률), 최악 ${mx.y} ${mx.wn} ${mx.worst.toFixed(1)}분`);
}
const tot=rows.reduce((a,r)=>a+r.tot,0);
console.log(`1900~2100 합계 ${tot.toFixed(0)}분 / 전체 ${(201*525949).toFixed(0)}분 = ${(tot/(201*525949)*100).toFixed(4)}%`);
