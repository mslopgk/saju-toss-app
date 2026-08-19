'use strict';
// v11-arbit.js — 절기 3자 대조 + KASI 심판 (2020~2026, KASI 골든셋 커버 구간)
const fs=require('fs'),path=require('path');
const ST=require('./solarterms.js');
const XC='C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/xcheck';
const rd=p=>JSON.parse(fs.readFileSync(p,'utf-8'));
const G=rd('C:/Users/user/orca/projects/saju-toss-app/docs/research/calc/golden-solarterms.json');
const sky=rd(path.join(XC,'skyfield_terms.json'));
const sxt=rd(path.join(XC,'sxtwl_terms.json'));
const KST=9*3600e3, ky=ms=>new Date(ms+KST).getUTCFullYear();
const Msky=new Map(sky.map(r=>[`${ky(Date.parse(r.utc))}:${r.sunLng}`,Date.parse(r.utc)]));
const Msxt=new Map(sxt.map(r=>[`${ky(Date.parse(r.utc))}:${r.sunLng}`,Date.parse(r.utc)]));
const NM='C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/kasi/node_modules/';
const M=require(NM+'manseryeok');
const IDX=ST.TERMS.map(t=>t.lng);

let n=0; const hit={self:0,mans:0,sxtwl:0,sky:0}; const rows=[];
for(const r of G.terms){
  if(r.defect||r.year<2020||r.year>2026) continue;
  const k=`${r.year}:${r.sunLng}`;
  const kms=Date.parse(r.kasi_kst.replace(' ','T')+':00+09:00');
  const self=ST.solarTerm(r.year,r.sunLng,true).utcMs;
  const i=IDX.indexOf(r.sunLng);
  const mans=M.getSolarTerm(r.year,i).date.getTime();
  const sk=Msky.get(k), sx=Msxt.get(k);
  const R=ms=>ms==null?null:Math.round(ms/60000)*60000;
  n++;
  const v={self:R(self)===kms,mans:R(mans)===kms,sxtwl:R(sx)===kms,sky:R(sk)===kms};
  for(const key of Object.keys(v)) if(v[key]) hit[key]++;
  if(!(v.self&&v.mans&&v.sxtwl)) rows.push([r,kms,self,mans,sx,sk,v]);
}
console.log(`## 절기 3자 대조 + KASI 심판 (2020~2026, n=${n})`);
console.log('| 구현 | KASI 분단위 일치 | 비율 |');
console.log('|---|---|---|');
for(const [k,nm] of [['self','자체 오라클(VSOP87+USNO ΔT)'],['mans','manseryeok v2.0.0'],['sxtwl','sxtwl'],['sky','Skyfield DE440s(참조)']])
  console.log(`| ${nm} | ${hit[k]}/${n} | ${(hit[k]/n*100).toFixed(2)}% |`);

console.log(`\n## 불일치 전량 (${rows.length}건) — 심판 = Skyfield DE440s`);
console.log('| 연도 | 절기 | KASI | 자체 | manseryeok | sxtwl | DE440s | 심판 |');
console.log('|---|---|---|---|---|---|---|---|');
const f=ms=>ms==null?'-':ST.fmtKST(ms);
for(const [r,kms,self,mans,sx,sk,v] of rows){
  const who=[v.self?'자체':'',v.mans?'ms':'',v.sxtwl?'sx':''].filter(Boolean).join('+')||'없음';
  const judge = v.sky ? `KASI 옳음 (일치: ${who})` : `KASI≠DE440s`;
  console.log(`| ${r.year} | ${r.name} | ${r.kasi_kst} | ${f(self)} | ${f(mans)} | ${f(sx)} | ${f(sk)} | ${judge} |`);
}
