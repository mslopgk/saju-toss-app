'use strict';
// v10c — 대운 정밀식의 "일(day)" 절삭 규칙 역공학 (floor vs round vs ceil)
const P=require('./pillars.js'), L=require('./luck.js');
const M=require('C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/manseryeok');
const KS=['갑','을','병','정','무','기','경','신','임','계'];
const KB=['자','축','인','묘','진','사','오','미','신','유','술','해'];
let s=12345; const rnd=()=> (s=(1103515245*s+12345)%2147483648)/2147483648;
const V={floor:0,round:0,ceil:0}, VY={floor:0,round:0,ceil:0}, VM={floor:0,round:0,ceil:0};
let n=0; const ex=[];
for(let i=0;i<400;i++){
  const y=1950+Math.floor(rnd()*100), mo=1+Math.floor(rnd()*12), d=1+Math.floor(rnd()*28);
  const hh=Math.floor(rnd()*24), mi=Math.floor(rnd()*60), g=rnd()<0.5?'M':'F';
  const p=P.fourPillars({y,mo,d,hh,mi,region:'GENERIC',stdOffsetMin:540,mode:'CIVIL'});
  const lc=L.luckCycles(p,g,{count:1});
  let r; try{ r=M.getLuckPillars({instantUTCms:Date.UTC(y,mo-1,d,hh-9,mi),birthYear:y,
    monthPillar:{heavenlyStem:KS[p.month.gan],earthlyBranch:KB[p.month.zhi]},
    sajuYearStemIndex:p.year.gan,gender:g==='M'?'male':'female',count:1}); }catch(e){continue;}
  n++;
  // 3가지 규칙으로 재계산
  const tot=lc.totalMin;
  for(const [k,f] of [['floor',Math.floor],['round',Math.round],['ceil',Math.ceil]]){
    let m=tot;
    const Y=Math.floor(m/4320); m-=Y*4320;
    const MO=Math.floor(m/360);  m-=MO*360;
    const D=f(m/12);
    if(Y===r.startYears) VY[k]++;
    if(MO===r.startMonths) VM[k]++;
    if(D===r.startDays) V[k]++;
  }
  if(ex.length<8 && Math.floor((tot%4320%360)/12)!==r.startDays) ex.push([`${y}-${mo}-${d} ${hh}:${mi} ${g}`,tot.toFixed(3),r.startYears+'/'+r.startMonths+'/'+r.startDays,Math.floor(tot/4320)+'/'+Math.floor((tot%4320)/360)+'/'+Math.floor((tot%4320%360)/12)]);
}
console.log('n =',n);
console.log('| 규칙 | 년 일치 | 월 일치 | 일 일치 |');
console.log('|---|---|---|---|');
for(const k of ['floor','round','ceil']) console.log(`| ${k} | ${VY[k]}/${n} | ${VM[k]}/${n} | ${V[k]}/${n} |`);
console.log('\n floor 불일치 예:');
for(const e of ex) console.log('  ',e.join(' | '));
