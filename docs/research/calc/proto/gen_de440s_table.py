# -*- coding: utf-8 -*-
import sys, json, numpy as np, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
from skyfield.api import load
from skyfield.framelib import ecliptic_frame
ts=load.timescale(); eph=load('de440s.bsp'); earth,sun=eph['earth'],eph['sun']
P=r'C:\Users\user\AppData\Local\Temp\claude\C--Users-user-orca-projects-saju-toss-app\580e6bb5-351e-4ff9-a1d7-96bfe16ed90a\scratchpad\calc-lab\golden'
J=[r for r in json.load(open(P+r'\ae_terms_1900_2100.json',encoding='utf-8')) if 1851<=r["y"]<=2145]
def mkT(recs):
    ys=[];ms=[];ds=[];hs=[];mi=[];se=[]
    for u in recs:
        t=dt.datetime.strptime(u[:19],'%Y-%m-%dT%H:%M:%S')
        ys.append(t.year);ms.append(t.month);ds.append(t.day);hs.append(t.hour);mi.append(t.minute)
        se.append(t.second+float('0'+u[19:23] if u[19:23] else 0))
    return ts.utc(ys,ms,ds,hs,mi,se)
tgt=np.array([r['lng'] for r in J],dtype=float)
T=mkT([r['utc'] for r in J])
tt=T.tt.copy()
for it in range(3):
    T=ts.tt_jd(tt)
    e=earth.at(T).observe(sun).apparent(); _,lon,_=e.frame_latlon(ecliptic_frame)
    err=(lon.degrees-tgt+180.0)%360.0-180.0
    T2=ts.tt_jd(tt+1000.0/86400.0)
    e2=earth.at(T2).observe(sun).apparent(); _,lon2,_=e2.frame_latlon(ecliptic_frame)
    rate=((lon2.degrees-lon.degrees+180)%360-180)/1000.0
    tt = tt - (err/rate)/86400.0
    print('iter%d max|err| %.3e deg'%(it,np.abs(err).max()))
T=ts.tt_jd(tt)
out=[]
for r,u in zip(J,T.utc_iso(places=3)):
    out.append({'year':r['y'],'name':r['n'],'sunLng':r['lng'],'utc':u})
json.dump(out,open(P+r'\solarterms-de440s.json','w',encoding='utf-8'),ensure_ascii=False)
print('records',len(out))
for r in out[:3]+[x for x in out if x['year']==2024 and x['sunLng']==315]: print(r)
