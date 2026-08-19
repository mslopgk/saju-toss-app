'use strict';
const P=require('./pillars.js'),L=require('./luck.js'),ST=require('./solarterms.js');
const M=require('C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/manseryeok');
const KS=['갑','을','병','정','무','기','경','신','임','계'];
const KB=['자','축','인','묘','진','사','오','미','신','유','술','해'];
console.log('## 2023-11-11 04:30 男 상세');
{
  const p=P.fourPillars({y:2023,mo:11,d:11,hh:4,mi:30,region:'GENERIC',stdOffsetMin:540,mode:'CIVIL'});
  const lc=L.luckCycles(p,'M',{count:1});
  console.log('  원국',p.text,' 방향',lc.direction);
  console.log('  자체 prevJie(입동)',lc.prevJie.kst,' Δ(분)=',lc.totalMin.toFixed(4));
  const mj=M.getSolarTerm(2023,20).date;                    // index20 = 입동
  console.log('  manseryeok 입동   ', new Date(mj.getTime()+9*3600e3).toISOString().replace('T',' ').slice(0,19),
              ' Δ(분)=', ((Date.UTC(2023,10,11,4-9,30)-mj.getTime())/60000).toFixed(4));
  const m1=lc.totalMin%4320%360;
  console.log('  자체 잔여분',m1.toFixed(4),' /12 =',(m1/12).toFixed(4),'→ round',Math.round(m1/12),' floor',Math.floor(m1/12));
  const m2=((Date.UTC(2023,10,11,4-9,30)-mj.getTime())/60000)%4320%360;
  console.log('  ms  잔여분',m2.toFixed(4),' /12 =',(m2/12).toFixed(4),'→ round',Math.round(m2/12));
}
console.log('\n## 대운 400 케이스 종합 일치율 (자체 vs manseryeok)');
{
  let s=987654321; const rnd=()=>(s=(1103515245*s+12345)%2147483648)/2147483648;
  let n=0,dir=0,gzOK=0,ymdOK=0,startOK=0; const bad=[];
  for(let i=0;i<400;i++){
    const y=1950+Math.floor(rnd()*100),mo=1+Math.floor(rnd()*12),d=1+Math.floor(rnd()*28);
    const hh=Math.floor(rnd()*24),mi=Math.floor(rnd()*60),g=rnd()<0.5?'M':'F';
    const p=P.fourPillars({y,mo,d,hh,mi,region:'GENERIC',stdOffsetMin:540,mode:'CIVIL'});
    const lc=L.luckCycles(p,g,{count:8});
    let r;try{r=M.getLuckPillars({instantUTCms:Date.UTC(y,mo-1,d,hh-9,mi),birthYear:y,
      monthPillar:{heavenlyStem:KS[p.month.gan],earthlyBranch:KB[p.month.zhi]},
      sajuYearStemIndex:p.year.gan,gender:g==='M'?'male':'female',count:8});}catch(e){continue;}
    n++;
    const a=lc.list.map(x=>x.gz).join(' ');
    const b=r.pillars.map(x=>P.GAN[KS.indexOf(x.korean[0])]+P.ZHI[KB.indexOf(x.korean[1])]).join(' ');
    if((lc.direction==='forward')===r.forward) dir++;
    if(a===b) gzOK++;
    const ymd = lc.exact.year===r.startYears&&lc.exact.month===r.startMonths&&lc.exact.day===r.startDays;
    if(ymd) ymdOK++; else if(bad.length<12) bad.push([`${y}-${mo}-${d} ${hh}:${String(mi).padStart(2,'0')} ${g}`,
      `${lc.exact.year}/${lc.exact.month}/${lc.exact.day}`,`${r.startYears}/${r.startMonths}/${r.startDays}`,lc.totalMin.toFixed(3)]);
    if(lc.numKorean===r.startAge||lc.numRound===r.startAge) startOK++;
  }
  console.log(`  n=${n}`);
  console.log(`  순역 방향 일치      : ${dir}/${n}`);
  console.log(`  대운 간지 8개 일치  : ${gzOK}/${n}`);
  console.log(`  정밀 년/월/일 일치  : ${ymdOK}/${n}`);
  console.log(`  startAge ∈ {C,D}    : ${startOK}/${n}`);
  console.log('  | 입력 | 자체 y/m/d | manseryeok y/m/d | Δ분 |');
  console.log('  |---|---|---|---|');
  for(const e of bad) console.log('  | '+e.join(' | ')+' |');
}
