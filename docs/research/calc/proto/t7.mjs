import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const M = require('manseryeok');
const { Solar, SolarUtil } = require('lunar-javascript');
const T = JSON.parse(fs.readFileSync('solarterms-de440s.json','utf8'));
const REF = new Map(T.map(r=>[r.year+':'+r.name, Date.parse(r.utc)]));
// manseryeok
const MN = M.SOLAR_TERM_NAMES;
let ms=[], lje=[];
for (let y=1900;y<=2100;y++){
  for (let i=0;i<24;i++){
    let d; try{ d=M.getSolarTerm(y,i);}catch{continue;}
    const k=y+':'+d.name; if(!REF.has(k))continue;
    ms.push({y,n:d.name,delta:(Date.parse(d.date)-REF.get(k))/1000});
  }
}
// lunar-javascript : Lunar.getJieQiTable() 은 CST(UTC+8) 벽시계
for (let y=1900;y<=2100;y++){
  const l = Solar.fromYmd(y,6,1).getLunar();
  const tb = l.getJieQiTable();
  for (const [nm,sl] of Object.entries(tb)) {
    const kn = {'立春':'입춘','雨水':'우수','驚蟄':'경칩','春分':'춘분','清明':'청명','穀雨':'곡우',
      '立夏':'입하','小滿':'소만','芒種':'망종','夏至':'하지','小暑':'소서','大暑':'대서',
      '立秋':'입추','處暑':'처서','白露':'백로','秋分':'추분','寒露':'한로','霜降':'상강',
      '立冬':'입동','小雪':'소설','大雪':'대설','冬至':'동지','小寒':'소한','大寒':'대한'}[nm];
    if(!kn) continue;
    const yy = sl.getYear();
    const k = yy+':'+kn; if(!REF.has(k)) continue;
    const utc = Date.UTC(sl.getYear(),sl.getMonth()-1,sl.getDay(),sl.getHour(),sl.getMinute(),sl.getSecond())-8*3600000;
    lje.push({y:yy,n:kn,delta:(utc-REF.get(k))/1000});
  }
}
const stat=(a,lbl)=>{const v=a.map(x=>Math.abs(x.delta)).sort((p,q)=>p-q);
  const mean=a.reduce((s,x)=>s+x.delta,0)/a.length;
  console.log(`${lbl}: n=${a.length} 평균 ${mean.toFixed(2)}s |Δ|중앙 ${v[Math.floor(v.length/2)].toFixed(1)} p95 ${v[Math.floor(v.length*0.95)].toFixed(1)} max ${v[v.length-1].toFixed(1)}  |Δ|>30s ${a.filter(x=>Math.abs(x.delta)>30).length}  >60s ${a.filter(x=>Math.abs(x.delta)>60).length}`);
  const w=[...a].sort((p,q)=>Math.abs(q.delta)-Math.abs(p.delta)).slice(0,5);
  w.forEach(x=>console.log(`   최악 ${x.y} ${x.n} ${x.delta.toFixed(1)}s`));};
stat(ms,'manseryeok(분단위 저장) vs DE440s');
stat(lje,'lunar-javascript vs DE440s');
// 1900~2100 구간별 lunar-js
for(const[lo,hi]of[[1900,1949],[1950,1999],[2000,2049],[2050,2100]]){
  const s=lje.filter(x=>x.y>=lo&&x.y<=hi); if(!s.length)continue;
  const v=s.map(x=>Math.abs(x.delta)).sort((p,q)=>p-q);
  console.log(`   LJ ${lo}~${hi} n=${s.length} 평균 ${(s.reduce((a,x)=>a+x.delta,0)/s.length).toFixed(2)}s max|Δ| ${v[v.length-1].toFixed(1)}s`);
}
for(const[lo,hi]of[[1900,1949],[1950,1999],[2000,2049],[2050,2100]]){
  const s=ms.filter(x=>x.y>=lo&&x.y<=hi); if(!s.length)continue;
  const v=s.map(x=>Math.abs(x.delta)).sort((p,q)=>p-q);
  console.log(`   MS ${lo}~${hi} n=${s.length} 평균 ${(s.reduce((a,x)=>a+x.delta,0)/s.length).toFixed(2)}s max|Δ| ${v[v.length-1].toFixed(1)}s`);
}
