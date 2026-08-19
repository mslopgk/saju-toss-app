# -*- coding: utf-8 -*-
"""C21 데이터 정합성 수정 — 검증 + personality-data.json 생성"""
import json, sys, io, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OUT = []
def P(*a):
    s = " ".join(str(x) for x in a)
    OUT.append(s); print(s)

# ─────────────────────────────────────────────────────────────
# [V1] testmoa 국내 표본 — 비율/표본수 역전 진단
# ─────────────────────────────────────────────────────────────
P("="*72); P("[V1] testmoa 국내 MBTI 표(2023.3~8) 자기정합성 검사")
TESTMOA = [  # (rank, type, pct_stated, count_stated)
 (1,"ISFJ",9.08,9484),(2,"ISTJ",8.89,9289),(3,"INFP",8.07,8435),(4,"INFJ",7.68,8021),
 (5,"ENFP",7.36,7695),(6,"ISFP",7.13,7447),(7,"ENFJ",6.61,6910),(8,"ESFJ",6.31,6598),
 (9,"ESTJ",6.11,6381),(10,"ISTP",5.37,6241),(11,"INTJ",5.97,5607),(12,"ESFP",5.21,5444),
 (13,"INTP",4.92,5143),(14,"ENTJ",4.87,5084),(15,"ENTP",3.61,3767),(16,"ESTP",2.81,2938)]
N = 104484
P(f"  표본수 합계 = {sum(c for *_ ,c in TESTMOA)}  (표기 N = {N})  일치={sum(c for *_,c in TESTMOA)==N}")
P(f"  비율 합계   = {round(sum(p for _,_,p,_ in TESTMOA),4)}")
P(f"  {'rank':>4} {'type':5} {'pct_표기':>9} {'명':>7} {'pct=명/N':>9} {'Δ(pp)':>8} {'판정'}")
bad = []
for r,t,p,c in TESTMOA:
    pc = c/N*100; d = pc-p
    v = "OK" if abs(d) < 0.01 else "**역전**"
    if abs(d) >= 0.01: bad.append((t,p,pc))
    P(f"  {r:>4} {t:5} {p:9.2f} {c:7d} {pc:9.4f} {d:8.3f} {v}")
P(f"  → 불일치 {len(bad)}건: {bad}")
P("  → 진단: rank 는 명(count) 내림차순과 100% 일치(9484>9289>...>2938).")
P("     ISTP(rank10, 6241명)·INTJ(rank11, 5607명) 두 칸의 **비율 값만 서로 뒤바뀜**.")
P("     원표의 count 열이 정본. pct 는 count/N 으로 전량 재산출한다.")

FIXED_KR = {t: round(c/N*100, 2) for _,t,_,c in TESTMOA}
FIXED_CNT = {t: c for _,t,_,c in TESTMOA}
P("  재산출 결과:", json.dumps(FIXED_KR, ensure_ascii=False))
P(f"  재산출 합계 = {round(sum(FIXED_KR.values()),4)}")

# ─────────────────────────────────────────────────────────────
# [V2] 미국 인구 빈도 (myersbriggs.org / Wayback 2023-04-17 복원)
# ─────────────────────────────────────────────────────────────
P(""); P("="*72); P("[V2] 미국 인구 유형 빈도 (estimated_frequency_table.gif 판독)")
US = {  # type: (lo, hi, point)
 "ISTJ":(11,14,11.6), "ISFJ":(9,14,13.8), "INFJ":(1,3,1.5), "INTJ":(2,4,2.1),
 "ISTP":(4,6,5.4),    "ISFP":(5,9,8.8),   "INFP":(4,5,4.4), "INTP":(3,5,3.3),
 "ESTP":(4,5,4.3),    "ESFP":(4,9,8.5),   "ENFP":(6,8,8.1), "ENTP":(2,5,3.2),
 "ESTJ":(8,12,8.7),   "ESFJ":(9,13,12.3), "ENFJ":(2,5,2.5), "ENTJ":(2,5,1.8)}
US_TOTALS = {"E":(45,53,49.3),"I":(47,55,50.7),"S":(66,74,73.3),"N":(26,34,26.7),
             "T":(40,50,40.2),"F":(50,60,59.8),"J":(54,60,54.1),"P":(40,46,45.9)}
P(f"  점추정 합계 = {round(sum(v[2] for v in US.values()),4)} %")
P(f"  {'type':5} {'범위':>10} {'점추정':>7} {'범위내?'}")
for t,(lo,hi,pt) in US.items():
    ok = lo <= pt <= hi
    P(f"  {t:5} {str(lo)+'-'+str(hi)+'%':>10} {pt:7.1f} {'OK' if ok else '**범위이탈**'}")
P("  ── 4축 주변합 재계산 (점추정 합 vs 표 하단 Total 열)")
for letter, pos in [("E",0),("I",0),("S",1),("N",1),("T",2),("F",2),("J",3),("P",3)]:
    s = round(sum(v[2] for k,v in US.items() if k[pos]==letter), 1)
    lo,hi,stated = US_TOTALS[letter]
    P(f"   {letter}: 재계산 {s:5.1f}%  vs 표기 {stated:5.1f}%  Δ={round(s-stated,1):+.1f}pp  "
      f"범위 {lo}-{hi}%  {'OK' if abs(s-stated)<0.15 else '**불일치**'}")

# ─────────────────────────────────────────────────────────────
# [V3] 인지기능 스택 생성기 (문서05 §2-3 표 회귀검증)
# ─────────────────────────────────────────────────────────────
P(""); P("="*72); P("[V3] 인지기능 스택 규칙 생성 vs 문서05 §2-3 표")
OPP = {"S":"N","N":"S","T":"F","F":"T"}
def stack(t):
    E = t[0]=="E"; Pp = t[3]=="P"; per=t[1]; jud=t[2]
    extF = per if Pp else jud
    intF = jud if Pp else per
    dom = (extF+"e") if E else (intF+"i")
    aux = (intF+"i") if E else (extF+"e")
    ter = OPP[aux[0]] + ("e" if aux[1]=="i" else "i")
    inf = OPP[dom[0]] + ("e" if dom[1]=="i" else "i")
    return [dom,aux,ter,inf]
DOC05 = {
 "ISTJ":"Si-Te-Fi-Ne","ISFJ":"Si-Fe-Ti-Ne","INFJ":"Ni-Fe-Ti-Se","INTJ":"Ni-Te-Fi-Se",
 "ISTP":"Ti-Se-Ni-Fe","ISFP":"Fi-Se-Ni-Te","INFP":"Fi-Ne-Si-Te","INTP":"Ti-Ne-Si-Fe",
 "ESTP":"Se-Ti-Fe-Ni","ESFP":"Se-Fi-Te-Ni","ENFP":"Ne-Fi-Te-Si","ENTP":"Ne-Ti-Fe-Si",
 "ESTJ":"Te-Si-Ne-Fi","ESFJ":"Fe-Si-Ne-Ti","ENFJ":"Fe-Ni-Se-Ti","ENTJ":"Te-Ni-Se-Fi"}
STACK = {}
miss = 0
for t in DOC05:
    g = "-".join(stack(t)); STACK[t] = stack(t)
    if g != DOC05[t]: miss += 1; P(f"  {t}: 생성 {g} != 문서 {DOC05[t]}  **불일치**")
P(f"  16/16 일치 여부: 불일치 {miss}건  → {'PASS' if miss==0 else 'FAIL'}")

# ─────────────────────────────────────────────────────────────
# [V4] 12별자리 데이터 무결성
# ─────────────────────────────────────────────────────────────
P(""); P("="*72); P("[V4] 12별자리 원소·양태·극성·지배행성 무결성")
SIGNS = [
 ("aries","양자리","Aries","♈","03-21","04-19","fire","cardinal","mars","mars","+","숫양"),
 ("taurus","황소자리","Taurus","♉","04-20","05-20","earth","fixed","venus","venus","-","황소"),
 ("gemini","쌍둥이자리","Gemini","♊","05-21","06-21","air","mutable","mercury","mercury","+","쌍둥이"),
 ("cancer","게자리","Cancer","♋","06-22","07-22","water","cardinal","moon","moon","-","게"),
 ("leo","사자자리","Leo","♌","07-23","08-22","fire","fixed","sun","sun","+","사자"),
 ("virgo","처녀자리","Virgo","♍","08-23","09-22","earth","mutable","mercury","mercury","-","처녀"),
 ("libra","천칭자리","Libra","♎","09-23","10-22","air","cardinal","venus","venus","+","저울"),
 ("scorpio","전갈자리","Scorpio","♏","10-23","11-21","water","fixed","pluto","mars","-","전갈"),
 ("sagittarius","사수자리","Sagittarius","♐","11-22","12-21","fire","mutable","jupiter","jupiter","+","궁수"),
 ("capricorn","염소자리","Capricorn","♑","12-22","01-19","earth","cardinal","saturn","saturn","-","염소"),
 ("aquarius","물병자리","Aquarius","♒","01-20","02-18","air","fixed","uranus","saturn","+","물병"),
 ("pisces","물고기자리","Pisces","♓","02-19","03-20","water","mutable","neptune","jupiter","-","물고기"),
]
ELEMS=["fire","earth","air","water"]; MODS=["cardinal","fixed","mutable"]
for e in ELEMS:
    n=sum(1 for s in SIGNS if s[6]==e); P(f"  원소 {e:6}: {n}개  {'OK' if n==3 else '**FAIL**'}")
for m in MODS:
    n=sum(1 for s in SIGNS if s[7]==m); P(f"  양태 {m:8}: {n}개  {'OK' if n==4 else '**FAIL**'}")
ok=all(SIGNS[i][6]==ELEMS[i%4] for i in range(12)); P(f"  element == ELEMS[i%4] : {'OK' if ok else '**FAIL**'}")
ok=all(SIGNS[i][7]==MODS[i%3] for i in range(12));  P(f"  modality == MODS[i%3] : {'OK' if ok else '**FAIL**'}")
ok=all(SIGNS[i][10]==("+" if i%2==0 else "-") for i in range(12)); P(f"  polarity == (i%2==0?+:-): {'OK' if ok else '**FAIL**'}")
ok=all(SIGNS[i][8]==SIGNS[i][9] for i in range(12) if SIGNS[i][0] not in ("scorpio","aquarius","pisces"))
P(f"  현대==전통 지배행성 (전갈/물병/물고기 제외): {'OK' if ok else '**FAIL**'}")
# 날짜 커버리지 (윤년 포함)
def sign_of(mm, dd):
    key = f"{mm:02d}-{dd:02d}"
    for s in SIGNS:
        a,b = s[4], s[5]
        if a<=b:
            if a<=key<=b: return s[0]
        else:
            if key>=a or key<=b: return s[0]
    return None
for yr in (2023, 2024):
    d = datetime.date(yr,1,1); cnt=0; nomatch=[]
    while d.year==yr:
        if sign_of(d.month,d.day) is None: nomatch.append(str(d))
        cnt+=1; d+=datetime.timedelta(days=1)
    P(f"  {yr}년 {cnt}일 전수 매핑: 미매핑 {len(nomatch)}건 {nomatch[:5]}  {'OK' if not nomatch else '**FAIL**'}")

# ─────────────────────────────────────────────────────────────
# [V5] 탄생석 — 월별 vs 사인 불일치 정량화
# ─────────────────────────────────────────────────────────────
P(""); P("="*72); P("[V5] 탄생석: '사인별 stone' 필드의 실제 오류율")
MONTH_STONE = {1:["가넷"],2:["자수정"],3:["아쿠아마린","블러드스톤"],4:["다이아몬드"],
 5:["에메랄드"],6:["진주","문스톤","알렉산드라이트"],7:["루비"],
 8:["페리도트","스피넬","사도닉스"],9:["사파이어"],10:["오팔","투르말린"],
 11:["토파즈","시트린"],12:["탄자나이트","터키석","지르콘"]}
OLD_SIGN_STONE = {"aries":"다이아몬드","taurus":"에메랄드","gemini":"진주","cancer":"루비",
 "leo":"페리도트","virgo":"사파이어","libra":"오팔","scorpio":"토파즈",
 "sagittarius":"터키석","capricorn":"가넷","aquarius":"자수정","pisces":"아쿠아마린"}
P(f"  {'sign':12} {'구 stone':>8} {'해당 월':>5} {'일치일수':>8} {'총일수':>6} {'적중률':>8}")
tot_hit=tot_all=0
for s in SIGNS:
    sid=s[0]; stone=OLD_SIGN_STONE[sid]
    # 이 stone 이 속한 달
    m_of = [m for m,v in MONTH_STONE.items() if stone in v][0]
    hit=all_=0
    d=datetime.date(2023,1,1)
    while d.year==2023:
        if sign_of(d.month,d.day)==sid:
            all_+=1
            if d.month==m_of: hit+=1
        d+=datetime.timedelta(days=1)
    tot_hit+=hit; tot_all+=all_
    P(f"  {sid:12} {stone:>8} {m_of:>5}월 {hit:>8} {all_:>6} {hit/all_*100:7.1f}%")
P(f"  전체 적중률 = {tot_hit}/{tot_all} = {tot_hit/tot_all*100:.2f}%  "
  f"→ 오적용 {tot_all-tot_hit}일 ({(tot_all-tot_hit)/tot_all*100:.2f}%)")
P("  → 결론: zodiacSigns.stone 필드 **제거**. monthBirthstones 로 분리(양력 월 키).")

# ─────────────────────────────────────────────────────────────
# [V6] 별자리 궁합 — C08 §4 규칙 재생성 & 문서06 표와 대조
# ─────────────────────────────────────────────────────────────
P(""); P("="*72); P("[V6] 별자리 궁합 k값 3종 상충 확인 + C00 canon 재생성")
def zscore(i,j):
    d=abs(i-j)%12; k=min(d,12-d)
    A={0:12,1:-6,2:14,3:-12,4:20,5:-8,6:18}[k]
    dm4=(i%4-j%4)%4
    E = 18 if dm4==0 else (12 if dm4==2 else -8)
    M = -4 if (i%3)==(j%3) else 4
    Pl= 3 if (i%2)==(j%2) else -3
    return max(0,min(100,50+A+E+M+Pl))
CANON=[zscore(0,k) for k in range(7)]
P(f"  C08 §4.1 규칙 재생성 k0..k6 = {CANON}")
P(f"  C00 §S8-2 표기         k0..k6 = [79, 37, 83, 23, 95, 35, 79]   일치={CANON==[79,37,83,23,95,35,79]}")
P(f"  C08 §1.5 mybias.app 관측 k0..k6 = [88, 35, 83, 32, 92, 40, 85]  (외부 상용값, 참고)")
P(f"  문서06 §B-2 표기        k0..k6 = [72, 45, 85, 40, 95, 35, 65]  ← 근거 없음, 폐기 대상")
asym=sum(1 for i in range(12) for j in range(12) if zscore(i,j)!=zscore(j,i))
P(f"  대칭성: 비대칭 셀 {asym}/144")
uniq=sorted({zscore(i,j) for i in range(12) for j in range(12)})
P(f"  고유값 {len(uniq)}종: {uniq}")
# 같은 원소끼리는 반드시 k=0 또는 4
bad=[(i,j) for i in range(12) for j in range(12) if i!=j and (i%4)==(j%4) and zscore(i,j) not in (95,)]
P(f"  동일원소 비동일사인 → 전부 트라인(95)? 위반 {len(bad)}건")

# ─────────────────────────────────────────────────────────────
# [V7] 혈액형 궁합 — C08 §7 정본 재생성 (문서06 Threads 표 폐기)
# ─────────────────────────────────────────────────────────────
P(""); P("="*72); P("[V7] 혈액형 궁합 정본화 (C08 §7)")
BT=["A","B","O","AB"]
BASE={("A","A"):78,("A","B"):45,("A","O"):85,("A","AB"):62,
      ("B","A"):45,("B","B"):68,("B","O"):80,("B","AB"):82,
      ("O","A"):85,("O","B"):80,("O","O"):70,("O","AB"):66,
      ("AB","A"):62,("AB","B"):82,("AB","O"):66,("AB","AB"):76}
MOD={("O","A"):8,("B","AB"):6,("A","O"):2,("A","AB"):-8,
     ("AB","B"):4,("B","A"):-4,("A","B"):2,("O","O"):-3}
def bscore(m,f): return max(0,min(100,BASE[(m,f)]+MOD.get((m,f),0)))
asym=sum(1 for a in BT for b in BT if BASE[(a,b)]!=BASE[(b,a)])
P(f"  §7.1 대칭 기저 비대칭 셀: {asym}/16  {'OK' if asym==0 else '**FAIL**'}")
P("  §7.3 성별보정 최종 (남 행 × 여 열)")
P("       " + "".join(f"{b:>6}" for b in BT))
G={}
for m in BT:
    G[m]={f:bscore(m,f) for f in BT}
    P(f"    {m:3}" + "".join(f"{G[m][f]:6d}" for f in BT))
DOC08=[[78,47,87,54],[41,68,80,88],[93,80,67,66],[62,86,66,76]]
ok=all(G[BT[i]][BT[j]]==DOC08[i][j] for i in range(4) for j in range(4))
P(f"  C08 §7.3 표와 일치: {'OK' if ok else '**FAIL**'}")
POP={"A":0.34,"B":0.27,"O":0.28,"AB":0.11}
import statistics
vals=[];w=[]
for m in BT:
    for f in BT:
        vals.append(G[m][f]); w.append(POP[m]*POP[f])
mu=sum(v*x for v,x in zip(vals,w))/sum(w)
sd=(sum(x*(v-mu)**2 for v,x in zip(vals,w))/sum(w))**0.5
P(f"  인구비 가중 평균 {mu:.3f} / sd {sd:.3f} / min {min(vals)} / max {max(vals)}")
P(f"  C08/C00 표기값     평균 70.973 / sd 16.036 / min 41 / max 93")
P(f"  문서06 §A-3(b) 대칭표 [A:75/55/88/53 ...] → **폐기**(Threads 카드뉴스 파생)")

# ─────────────────────────────────────────────────────────────
# personality-data.json 조립
# ─────────────────────────────────────────────────────────────
P(""); P("="*72); P("[BUILD] personality-data.json")

SRC = {
 "MB_FREQ": "https://www.myersbriggs.org/my-mbti-personality-type/my-mbti-results/how-frequent-is-my-type.htm (Wayback 20230417084849, estimated_frequency_table.gif 판독)",
 "TESTMOA": "https://testmoa.com/korea-mbti-statistics/ (2023.3~8, n=104,484, 자가선택 표본; 비율열 ISTP/INTJ 전치 오류를 count열로 재산출)",
 "MB_DYN":  "https://www.myersbriggs.org/unique-features-of-myers-briggs/type-dynamics-processes/",
 "REDCROSS":"https://bloodinfo.net/knrcbs/cm/cntnts/cntntsView.do?mi=1056&cntntsId=1129",
 "GALLUP":  "https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=870 (2017.7.6~26, n=1,500, ±2.5%p)",
 "NAWATA":  "https://news.mynavi.jp/article/20140722-a253/ (縄田健悟 2014, 心理学研究, n=11,729, 68문항)",
 "WIKI_BT": "https://en.wikipedia.org/wiki/Blood_type_personality_theory",
 "WIKI_BTK":"https://ko.wikipedia.org/wiki/%ED%98%88%EC%95%A1%ED%98%95_%EC%84%B1%EA%B2%A9%EC%84%A4",
 "WIKI_SIGN":"https://en.wikipedia.org/wiki/Astrological_sign",
 "WIKI_TRIP":"https://en.wikipedia.org/wiki/Triplicity",
 "WIKI_BSTONE":"https://en.wikipedia.org/wiki/Birthstone",
 "AGS":     "https://www.americangemsociety.org/birthstones/",
 "ENCYK":   "https://encykorea.aks.ac.kr/Article/E0065113",
 "C08":     "docs/research/calc/C08-4체계-통합-점수화-궁합-알고리즘설계.md §4·§7",
 "C00":     "docs/research/calc/C00-계산엔진-통합명세서.md §S8-2",
 "SELF":    "자체 작성(본 프로젝트 저작물)",
}

ALIAS = {  # 문서05 '자체 별칭 案' (16Personalities 번역명 미사용)
 "ISFJ":"든든한 지킴이","ISTJ":"원칙의 관리자","INFP":"마음의 이상가","INFJ":"통찰의 조언자",
 "ENFP":"불꽃 탐험가","ISFP":"조용한 예술가","ENFJ":"사람의 리더","ESFJ":"살뜰한 살림꾼",
 "ESTJ":"실행하는 사령탑","INTJ":"전략 설계자","ISTP":"손끝의 해결사","ESFP":"무대 위 활력가",
 "INTP":"개념의 탐구자","ENTJ":"목표의 지휘관","ENTP":"논쟁하는 발명가","ESTP":"돌파하는 실전가"}
TEMPER = {}
for t in ALIAS:
    if t[1]=="N" and t[2]=="T": TEMPER[t]="NT"
    elif t[1]=="N" and t[2]=="F": TEMPER[t]="NF"
    elif t[1]=="S" and t[3]=="J": TEMPER[t]="SJ"
    else: TEMPER[t]="SP"

ORDER=["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP",
       "ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ"]

mbti_types=[]
for t in ORDER:
    lo,hi,pt = US[t]
    mbti_types.append({
      "code": t,
      "aliasKo": ALIAS[t],           "_source_aliasKo": SRC["SELF"], "_confidence_aliasKo": "D",
      "temperament": TEMPER[t],      "_source_temperament": SRC["SELF"], "_confidence_temperament": "D",
      "stack": STACK[t],             "_source_stack": SRC["MB_DYN"]+" + Grant 모델", "_confidence_stack": "P1-rule",
      "usFrequencyPct": pt, "usFrequencyRangePct": [lo,hi],
      "_source_usFrequency": SRC["MB_FREQ"], "_confidence_usFrequency": "P1-archived",
      "krSelfSelectedPct": FIXED_KR[t], "krSelfSelectedN": FIXED_CNT[t],
      "_source_krSelfSelected": SRC["TESTMOA"], "_confidence_krSelfSelected": "P2-corrected",
    })

blood=[]
BLOOD_KO={"A":"A형","B":"B형","O":"O형","AB":"AB형"}
KR_ABO={"A":34,"O":28,"B":27,"AB":11}
GALLUP_ABO={"A":34,"B":28,"O":27,"AB":11}
BT_KW={
 "A":(["꼼꼼함","배려심","성실","책임감","완벽주의"],["세심한 관찰력","약속을 지킴","팀 내 조율자 역할"],["소심함","지나친 눈치","집단주의적 자기검열","스트레스 내재화"]),
 "B":(["리더십","호기심","자유분방","마이페이스","창의"],["새로운 것에 빠른 적응","솔직한 화법","발상 전환"],["자만","무례하게 보일 수 있음","싫증","규칙 경시"]),
 "O":(["열정","노력","사교성","목표지향","현실감각"],["추진력","분위기 메이커","위기 상황에서 결정"],["과장","모방","승부욕 과잉","고집"]),
 "AB":(["지능","판단력","합리","이중성","거리두기"],["객관적 분석","감정에 휘둘리지 않음","중재 능력"],["이기적으로 보임","속을 알 수 없음","관계 온도차"]),
}
for code in ["A","B","O","AB"]:
    kw,st,wk = BT_KW[code]
    blood.append({
      "code": code, "labelKo": BLOOD_KO[code],
      "krPopulationPct": KR_ABO[code], "_source_krPopulationPct": SRC["REDCROSS"], "_confidence_krPopulationPct": "P1",
      "krSelfReportedPct": GALLUP_ABO[code], "_source_krSelfReportedPct": SRC["GALLUP"], "_confidence_krSelfReportedPct": "P1",
      "keywordsKo": kw, "_source_keywordsKo": SRC["WIKI_BTK"]+" 장단점 표 확장", "_confidence_keywordsKo": "P2/U-mixed",
      "strengthsKo": st, "_source_strengthsKo": SRC["SELF"], "_confidence_strengthsKo": "D",
      "weaknessesKo": wk, "_source_weaknessesKo": SRC["SELF"], "_confidence_weaknessesKo": "D",
    })

signs=[]
for i,s in enumerate(SIGNS):
    signs.append({
      "index": i, "id": s[0], "ko": s[1], "en": s[2], "glyph": s[3],
      "lonStart": i*30, "lonEnd": (i+1)*30,
      "startMMDD": s[4], "endMMDD": s[5],
      "_source_dates": SRC["WIKI_SIGN"]+" (국내 통용 경계일 채택, 위키 기준과 최대 1일 차)",
      "_confidence_dates": "P2",
      "element": s[6], "modality": s[7], "polarity": s[10],
      "rulerModern": s[8], "rulerTraditional": s[9],
      "_source_attrs": SRC["WIKI_SIGN"], "_confidence_attrs": "P1",
      "symbolKo": s[11], "_source_symbolKo": SRC["WIKI_SIGN"], "_confidence_symbolKo": "P2",
    })

data = {
  "_meta": {
    "doc": "C21-MBTI-혈액형-별자리-데이터-정합성-수정.md",
    "generated": "2026-08-12",
    "confidenceLegend": {
      "P1": "1차 출처 원문 직접 확인",
      "P1-archived": "1차 출처 원문(웹아카이브 스냅샷)에서 직접 판독",
      "P1-rule": "1차 출처의 규칙을 코드로 재생성해 표와 대조 통과",
      "P2": "2차 출처(위키·언론·상용사이트) 확인",
      "P2-corrected": "2차 출처 확인 + 원표 오류를 자체 재산출로 정정",
      "D": "자체 설계/자체 저작(derived, 외부 근거 없음)",
      "U": "미검증"
    },
    "removedFields": {
      "zodiacSigns.stone": "제거. 탄생석은 양력 월 기준이라 사인 경계와 불일치(적중률 %s%%). monthBirthstones 로 분리." % round(tot_hit/tot_all*100,2),
      "bloodCompatibility(문서06 §A-3)": "제거. Threads 카드뉴스 파생 → C08 §7 정본으로 대체.",
      "mbtiAlias16P": "미수록. NERIS Analytics 저작물/브랜딩."
    }
  },
  "mbti": {
    "dichotomies": [
      {"axis":"attitude","pair":["E","I"],"ko":["외향","내향"]},
      {"axis":"perceiving","pair":["S","N"],"ko":["감각","직관"]},
      {"axis":"judging","pair":["T","F"],"ko":["사고","감정"]},
      {"axis":"lifestyle","pair":["J","P"],"ko":["판단","인식"]}
    ],
    "_source_dichotomies": "https://en.wikipedia.org/wiki/Myers%E2%80%93Briggs_Type_Indicator",
    "_confidence_dichotomies": "P2",
    "usFrequencyDichotomyTotals": {k:{"rangePct":[v[0],v[1]],"pointPct":v[2]} for k,v in US_TOTALS.items()},
    "_source_usFrequencyDichotomyTotals": SRC["MB_FREQ"], "_confidence_usFrequencyDichotomyTotals": "P1-archived",
    "krSampleN": N, "krSampleWindow": "2023-03 ~ 2023-08", "krSampleKind": "self-selected online (인구 대표성 없음)",
    "types": mbti_types
  },
  "bloodTypes": blood,
  "bloodCompatibility": {
    "_canon": SRC["C08"], "_confidence": "D",
    "symmetricBase": {a:{b:BASE[(a,b)] for b in BT} for a in BT},
    "genderMod": {f"{m}_{f}": v for (m,f),v in MOD.items()},
    "finalMaleRowFemaleCol": {m:{f:G[m][f] for f in BT} for m in BT},
    "fallback": "성별 미입력 시 symmetricBase 사용",
    "popWeighted": {"mean": round(mu,3), "sd": round(sd,3), "min": min(vals), "max": max(vals)}
  },
  "zodiacSigns": signs,
  "zodiacCompatibility": {
    "_canon": SRC["C00"] + " / " + SRC["C08"], "_confidence": "D",
    "formula": "k=min(|i-j|%12, 12-|i-j|%12); score=clamp(50+A[k]+E+M+P,0,100)",
    "aspectK": {str(k): CANON[k] for k in range(7)},
    "aspectName": {"0":"conjunction","1":"semisextile","2":"sextile","3":"square","4":"trine","5":"quincunx","6":"opposition"},
    "uniqueValues": uniq, "symmetric": asym==0
  },
  "monthBirthstones": {
    "_note": "양력 '월' 기준. 별자리(사인)와 1:1 대응하지 않는다. 사인 경계는 황경 30° 구간이라 한 사인이 두 달에 걸친다.",
    "_source": SRC["AGS"] + " / " + SRC["WIKI_BSTONE"],
    "_confidence": "P2",
    "byMonth": {str(m): v for m,v in MONTH_STONE.items()}
  },
  "zodiacToEarthlyBranch": {
    "_note": "방위 대응이며 '띠' 대응이 아니다.",
    "_source": SRC["ENCYK"], "_confidence": "P1",
    "map": dict(zip([s[0] for s in SIGNS],
      [("白羊宮","戌"),("金牛宮","酉"),("陰陽宮","申"),("巨蟹宮","未"),("獅子宮","午"),("雙女宮","巳"),
       ("天秤宮","辰"),("天蠍宮","卯"),("人馬宮","寅"),("磨羯宮","丑"),("寶甁宮","子"),("雙魚宮","亥")]))
  },
  "disclaimer": {
    "blood": "혈액형 성격론은 대규모 연구로 반증됨. " + SRC["NAWATA"],
    "mbti": "본 서비스는 공인 성격유형 검사를 제공하지 않으며 Myers & Briggs Foundation / The Myers-Briggs Company / (주)어세스타 / NERIS Analytics Limited 와 무관하다.",
    "zodiac": "엔터테인먼트 목적."
  }
}
data["zodiacToEarthlyBranch"]["map"] = {k:{"hanja":v[0],"branch":v[1]} for k,v in data["zodiacToEarthlyBranch"]["map"].items()}

path = r"C:\Users\user\orca\projects\saju-toss-app\docs\research\calc\personality-data.json"
with open(path,"w",encoding="utf-8") as f:
    json.dump(data,f,ensure_ascii=False,indent=2)
import os
P(f"  wrote {path}  ({os.path.getsize(path)} bytes)")
P(f"  mbti.types={len(data['mbti']['types'])}  bloodTypes={len(data['bloodTypes'])}  zodiacSigns={len(data['zodiacSigns'])}")
P(f"  'stone' 키 잔존: {json.dumps(data,ensure_ascii=False).count(chr(34)+'stone'+chr(34))}건")

with open("run.log","w",encoding="utf-8") as f: f.write("\n".join(OUT))
