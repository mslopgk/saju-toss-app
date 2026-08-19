'use strict';
const fs=require('fs');
const ST=require('./solarterms.js'), S=require('./sun.js'), P=require('./pillars.js');
const {deltaTFromJD}=require('./deltat.js'), {msToJD}=require('./jd.js');

console.log('====== [1] 이분법 수렴 특성 ======');
{
  const target=315, y=2024;
  console.log('| 반복수 N | 결과(KST) | 이전 N 대비 변화(초) | λ 잔차(arcsec) |');
  console.log('|---|---|---|---|');
  let prev=null;
  for(const N of [10,20,30,40,50,60,70]){
    const eq=2451545.0+0, guess=require('./jd.js').calendarToJD(y,3,20.5)+(target-360)/0.98564736;
    const jd=ST.bisect(target,guess-6,guess+6,true,N);
    const ms=require('./jd.js').jdToMs(jd);
    const lam=ST.lonAtUT(jd,true);
    const resid=S.norm180(lam-target)*3600;
    console.log(`| ${N} | ${ST.fmtKST(ms)}.${String(Math.floor(ms%1000)).padStart(3,'0')} | ${prev===null?'-':((ms-prev)/1000).toExponential(2)} | ${resid.toExponential(3)} |`);
    prev=ms;
  }
  console.log('  bracket = 추정치 ±6일 = 12일 → 12/2^60 = 1.0e-17 일 = 9.0e-13 초 (배정도 한계)');
}

console.log('\n====== [2] 절입 시각의 "초" 성분 분포 (12節 1900~2100, n=2412) ======');
{
  const tbl=JSON.parse(fs.readFileSync('jie-1900-2100.json','utf-8'));
  const hist=new Array(6).fill(0); let zero=0;
  for(const r of tbl){ const s=new Date(r.ms+9*3600e3).getUTCSeconds(); if(s===0) zero++; hist[Math.floor(s/10)]++; }
  console.log('  초=0 인 절기 =',zero,'/',tbl.length);
  console.log('  | 초 구간 | 건수 |'); console.log('  |---|---|');
  for(let i=0;i<6;i++) console.log(`  | ${i*10}~${i*10+9} | ${hist[i]} |`);
  console.log('  → 분 단위 테이블(KASI/manseryeok)은 절입 순간을 최대 ±30초 이동시킨다.');
  console.log(`  → 1년당 12절 × 1분 = 12분/525600분 = ${(12/525600*100).toFixed(4)}% 의 출생시각에서 월주가 갈릴 수 있다.`);
}

console.log('\n====== [3] XP-02 재검 — 초 단위 입력에서 연주가 실제로 갈리는 지점 ======');
{
  const cfg={region:'GENERIC',stdOffsetMin:540,dstOffsetMin:0,mode:'CIVIL'};
  const ip=ST.solarTerm(2024,315,true);
  console.log('  자체 입춘 =',ip.kst,'  DE440s = 2024-02-04 17:27:08.593  KASI = 2024-02-04 17:27  manseryeok = 2024-02-04 17:27:00');
  console.log('  | 입력(KST) | 자체 연주+월주 | manseryeok |');
  console.log('  |---|---|---|');
  const M=require('C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/manseryeok');
  const KS=['갑','을','병','정','무','기','경','신','임','계'],KB=['자','축','인','묘','진','사','오','미','신','유','술','해'];
  const h=s=>P.GAN[KS.indexOf(s[0])]+P.ZHI[KB.indexOf(s[1])];
  for(const [hh,mi] of [[17,26],[17,27],[17,28]]){
    const r=P.fourPillars({y:2024,mo:2,d:4,hh,mi,...cfg});
    const m=M.calculateFourPillars({year:2024,month:2,day:4,hour:hh,minute:mi});
    console.log(`  | 2024-02-04 ${hh}:${String(mi).padStart(2,'0')} | ${r.year.gz} ${r.month.gz} | ${h(m.yearString)} ${h(m.monthString)} |`);
  }
  // 초 단위: 절입 전후 1초
  const base=Date.UTC(2024,1,4,17,27,0)-9*3600e3;
  for(const off of [-1,0,5,6,7,8]){
    const t=base+off*1000;
    const lon=ST.lonAtUT(msToJD(t),true);
    console.log(`  UTC+${off}s → 2024-02-04 17:27:${String(off<0?59:off).padStart(2,'0')} KST  λ=${lon.toFixed(8)}°  ${lon>=315||lon<100?'≥315 (立春 이후)':'<315 (立春 이전)'}`);
  }
}

console.log('\n====== [4] LOW vs HIGH 태양황경이 사주를 바꾸는 비율 (2000~2030 12절) ======');
{
  let n=0,minDiff=0,dateDiff=0; const worst=[];
  for(let y=2000;y<=2030;y++) for(const t of ST.TERMS){ if(!t.jie) continue;
    const a=ST.solarTerm(y,t.lng,true), b=ST.solarTerm(y,t.lng,false); n++;
    const d=(b.utcMs-a.utcMs)/1000;
    if(Math.round(b.utcMs/60000)!==Math.round(a.utcMs/60000)) minDiff++;
    if(b.kst.slice(0,10)!==a.kst.slice(0,10)) dateDiff++;
    worst.push([Math.abs(d),y,t.kor,a.kst,b.kst,d]);
  }
  worst.sort((x,y)=>y[0]-x[0]);
  console.log(`  n=${n}  분 불일치=${minDiff} (${(minDiff/n*100).toFixed(1)}%)  KST 날짜 뒤집힘=${dateDiff}`);
  console.log(`  최악 = ${worst[0][1]} ${worst[0][2]} : HIGH ${worst[0][3]} / LOW ${worst[0][4]} = ${worst[0][5].toFixed(1)}초`);
  const p=v=>{const s=worst.map(w=>w[0]).sort((a,b)=>a-b);return s[Math.floor(s.length*v)];};
  console.log(`  |오차| 중앙값=${p(0.5).toFixed(1)}초  90%=${p(0.9).toFixed(1)}초  최대=${worst[0][0].toFixed(1)}초`);
  console.log(`  → 출생시각이 절입 ±ε 안에 들 확률 2ε/86400: ε=${worst[0][0].toFixed(0)}초 → ${(2*worst[0][0]/86400*100).toFixed(3)}%`);
}
