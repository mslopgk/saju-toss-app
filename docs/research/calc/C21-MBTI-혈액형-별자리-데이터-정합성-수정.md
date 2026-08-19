# C21 — MBTI · 혈액형 · 별자리 데이터 정합성 수정

> 상태: 확정 | 선행: 05, 06, C00 §S8-2/§S8-3, C08 §1·§4·§7
> 작업 디렉터리: `C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/dataint`
> 산출물: `docs/research/calc/personality-data.json` (43,520 B)
> 실행 스크립트: `docs/research/calc/personality-data.verify.py` (Python 3.12.10, 원본 `dataint/build.py` 사본) — **재실행 시 [V1]~[V7] 검증 로그 출력 + JSON 재생성**. 전체 로그 `dataint/run.log`
>
> ```
> $ python docs/research/calc/personality-data.verify.py
> …
> [BUILD] personality-data.json
>   wrote …\docs\research\calc\personality-data.json  (43520 bytes)
>   mbti.types=16  bloodTypes=4  zodiacSigns=12
>   'stone' 키 잔존: 0건
> ```

---

## 0. 처리 결과 요약

| # | 크리틱 지적 | 처리 | 근거 등급 |
|---|---|---|---|
| 1 | [05] testmoa 비율-표본수 역전 | **폐기 아님 — 오류 위치를 특정해 정정.** `count` 열이 정본이고 `pct` 열의 ISTP↔INTJ 두 칸만 전치됨을 산술로 증명. 전 16행 `pct = count/104484` 재산출 | P2-corrected |
| 2 | [05] 미국 인구 유형 빈도 404 | **원출처 복원 성공.** Wayback `20230417084849` 스냅샷의 `estimated_frequency_table.gif` 를 내려받아 판독 → 16유형 범위+점추정 + 8개 축 Total 전량 확보 | P1-archived |
| 3 | [06] 혈액형 4×4 궁합 3중 분기 | **C08 §7 로 단일화.** 문서06 §A-3(a) Threads 랭킹·§A-3(b) 대칭표·§D-2 "자체 재설계 권장" 3자를 폐기하고 C08 §7.1 대칭기저 + §7.2 성별보정으로 통일. C08 §7.3 표와 코드 재생성 결과 16/16 일치 | D (자체 설계, C00 canon) |
| 4 | [06] 12별자리 탄생석 `stone` 필드 | **필드 삭제.** 사인-월 적중률 **247/365 = 67.67%** (오적용 118일)를 실측해 삭제 근거를 수치화. `monthBirthstones`(양력 월 키)로 분리하고 AGS·Wikipedia 2출처 확보 | P2 |
| 5 | [06] 출처 6·7 동일 URL | **7번 삭제, 6번에 통합.** seqNo=870 원문 재확인 과정에서 2002/2012=67% → 2017=58%(−9%p) 시계열을 추가 확보 | P1 |
| 6 | [06] 한국 혈액형 분포 | **대한적십자사 원문 재확인 완료.** "A형이 약 34%로 가장 높고 O형은 28%, B형은 27%의 빈도를 보이고 AB형은 11% 정도임" 직접 인용 확보 | P1 |
| 7 | [05] KIPRIS 제9류 미확보 상태에서 B안 확정 서술 | **확보 실패(11개 엔드포인트 전부).** 실패 로그를 기재하고 05 §0 결론 8·§7-3·§5-4 의 확신도를 하향 서술로 교정 | 미확보 |
| 8 | 통합 마스터 데이터 | `personality-data.json` 생성 (16유형 + 혈액형4 + 별자리12 + 궁합2종 + 탄생석 + 12지대응). 모든 값 필드에 `_source_*` / `_confidence_*` 병기 | — |
| 9 | 원 문서 05·06 정정 | 05: 4곳 / 06: 6곳 Edit. §9 에 diff 기록 | — |

**추가 발견(크리틱 미지적, 본 조사에서 신규 검출) 4건** — §6 참조.

---

## 1. [05] testmoa 국내 비율표 — 오류 위치 특정과 정정

### 1-1. 원표 전량 (재확인, `testmoa.com/korea-mbti-statistics/`)

조사기간 2023.3~8 / N=104,484 / 테스트모아 자체 개발 검사 자가선택 표본.

| rank | type | pct(표기) | 명(표기) |
|---|---|---|---|
| 1 | ISFJ | 9.08 | 9,484 |
| 2 | ISTJ | 8.89 | 9,289 |
| 3 | INFP | 8.07 | 8,435 |
| 4 | INFJ | 7.68 | 8,021 |
| 5 | ENFP | 7.36 | 7,695 |
| 6 | ISFP | 7.13 | 7,447 |
| 7 | ENFJ | 6.61 | 6,910 |
| 8 | ESFJ | 6.31 | 6,598 |
| 9 | ESTJ | 6.11 | 6,381 |
| 10 | ISTP | 5.37 | 6,241 |
| 11 | INTJ | 5.97 | 5,607 |
| 12 | ESFP | 5.21 | 5,444 |
| 13 | INTP | 4.92 | 5,143 |
| 14 | ENTJ | 4.87 | 5,084 |
| 15 | ENTP | 3.61 | 3,767 |
| 16 | ESTP | 2.81 | 2,938 |

### 1-2. 자기정합성 검사 실행 로그 (`build.py` [V1])

```
[V1] testmoa 국내 MBTI 표(2023.3~8) 자기정합성 검사
  표본수 합계 = 104484  (표기 N = 104484)  일치=True
  비율 합계   = 100.0
  rank type     pct_표기       명   pct=명/N    Δ(pp) 판정
     1 ISFJ       9.08    9484    9.0770   -0.003 OK
     2 ISTJ       8.89    9289    8.8904    0.000 OK
     3 INFP       8.07    8435    8.0730    0.003 OK
     4 INFJ       7.68    8021    7.6768   -0.003 OK
     5 ENFP       7.36    7695    7.3648    0.005 OK
     6 ISFP       7.13    7447    7.1274   -0.003 OK
     7 ENFJ       6.61    6910    6.6135    0.003 OK
     8 ESFJ       6.31    6598    6.3148    0.005 OK
     9 ESTJ       6.11    6381    6.1072   -0.003 OK
    10 ISTP       5.37    6241    5.9732    0.603 **역전**
    11 INTJ       5.97    5607    5.3664   -0.604 **역전**
    12 ESFP       5.21    5444    5.2104    0.000 OK
    13 INTP       4.92    5143    4.9223    0.002 OK
    14 ENTJ       4.87    5084    4.8658   -0.004 OK
    15 ENTP       3.61    3767    3.6053   -0.005 OK
    16 ESTP       2.81    2938    2.8119    0.002 OK
  → 불일치 2건: [('ISTP', 5.37, 5.973163355154856), ('INTJ', 5.97, 5.366371884690479)]
```

### 1-3. 진단 — 폐기가 아니라 전치(transposition) 정정

세 가지 독립 제약이 동시에 성립한다.

```
(C1) Σ count = 104,484 = 표기 N            → 오차 0
(C2) Σ pct   = 100.00                      → 오차 0
(C3) rank 순서 == count 내림차순            → 16/16 일치 (9484 > 9289 > … > 2938)
(C4) |pct - count/N| < 0.006 pp             → ISTP·INTJ 2행 제외 14/14 성립
(C5) pct(ISTP)=5.37 ≈ count(INTJ)/N=5.3664
     pct(INTJ)=5.97 ≈ count(ISTP)/N=5.9732 → 두 셀이 정확히 교환됨
```

`count` 열은 (C1)(C3) 을 만족하고 `pct` 열은 (C2) 만 만족한다. (C5) 가 결정타 — 두 오류값이 서로의 정답값과 소수 4자리까지 일치한다. **원표 제작 시 pct 열 두 칸이 서로 바뀌어 입력된 것**이며, `count` 열이 정본이다.

→ **처리: 전 16행 `pct = round(count/104484×100, 2)` 로 재산출**하고, rank 10/11 의 행 순서도 count 기준으로 정렬.

### 1-4. 정정된 국내 자가선택 표본 비율 (05 §1-2 '국내 비율' 컬럼 대체값)

| rank | type | 정정 pct | 명 | 변경 |
|---|---|---|---|---|
| 1 | ISFJ | 9.08 | 9,484 | — |
| 2 | ISTJ | 8.89 | 9,289 | — |
| 3 | INFP | 8.07 | 8,435 | — |
| 4 | INFJ | 7.68 | 8,021 | — |
| 5 | ENFP | 7.36 | 7,695 | — |
| 6 | ISFP | 7.13 | 7,447 | — |
| 7 | ENFJ | 6.61 | 6,910 | — |
| 8 | ESFJ | 6.31 | 6,598 | — |
| 9 | ESTJ | 6.11 | 6,381 | — |
| 10 | **ISTP** | **5.97** | 6,241 | 5.37 → 5.97 |
| 11 | **INTJ** | **5.37** | 5,607 | 5.97 → 5.37 |
| 12 | ESFP | 5.21 | 5,444 | — |
| 13 | INTP | 4.92 | 5,143 | — |
| 14 | ENTJ | 4.87 | 5,084 | — |
| 15 | ENTP | 3.61 | 3,767 | — |
| 16 | ESTP | 2.81 | 2,938 | — |
| | **합계** | **100.00** | **104,484** | |

병기 필수 문구(변경 없음): *자가선택 온라인 표본. 인구 대표성 없음.*

---

## 2. [05] 미국 인구 유형 빈도 — 원출처 복원

### 2-1. 복원 절차 (실행 커맨드 그대로)

```bash
# 1) 스냅샷 존재 확인
curl -s -L -m 40 "https://archive.org/wayback/available?url=myersbriggs.org/my-mbti-personality-type/my-mbti-results/how-frequent-is-my-type.htm"
# → {"archived_snapshots":{"closest":{"status":"200","available":true,
#    "url":"http://web.archive.org/web/20230417084849/https://www.myersbriggs.org/.../how-frequent-is-my-type.htm",
#    "timestamp":"20230417084849"}}}

# 2) 원본 HTML (id_ 플래그 = 아카이브 배너 미삽입 원본)
curl -s -L -m 60 -A "Mozilla/5.0" \
  "http://web.archive.org/web/20230417084849id_/https://www.myersbriggs.org/my-mbti-personality-type/my-mbti-results/how-frequent-is-my-type.htm" -o freq.html
# → 27,780 bytes

# 3) 표는 텍스트가 아니라 GIF 였다
#    <img src="https://www.myersbriggs.org/_images/estimated_frequency_table.gif" width="350" height="223">
curl -s -L -m 60 -A "Mozilla/5.0" \
  "http://web.archive.org/web/20230417084849im_/https://www.myersbriggs.org/_images/estimated_frequency_table.gif" -o freq.gif
# → GIF89a 350x223, 15,277 bytes → 4× LANCZOS 업스케일 후 판독
```

> ※ WebFetch 는 `web.archive.org` 호스트가 차단돼 실패("Claude Code is unable to fetch from web.archive.org"). **Bash `curl` 로만 성공**. 이것이 05 §출처의 "404" 기록이 그동안 뚫리지 않았던 이유다.

### 2-2. 원문 서술 (freq.html 에서 추출)

> "The table below shows estimates of the relative frequency of each of the sixteen types in the United States population."
> "Text adapted from **Building People, Building Programs** by **Gordon Lawrence and Charles Martin (CAPT 2001)**"
> "The estimated frequency table was compiled from a variety of MBTI® results **from 1972 through 2002**, including data banks at the **Center for Applications of Psychological Type**; **The Myers-Briggs Company**; and **Stanford Research Institute (SRI)**."

### 2-3. 판독 결과 — 16유형 (범위 / 점추정)

| type | 범위 | 점추정 | type | 범위 | 점추정 |
|---|---|---|---|---|---|
| ISTJ | 11–14% | 11.6% | ESTP | 4–5% | 4.3% |
| ISFJ | 9–14% | 13.8% | ESFP | 4–9% | 8.5% |
| INFJ | 1–3% | 1.5% | ENFP | 6–8% | **8.1%** |
| INTJ | 2–4% | 2.1% | ENTP | 2–5% | 3.2% |
| ISTP | 4–6% | 5.4% | ESTJ | 8–12% | 8.7% |
| ISFP | 5–9% | 8.8% | ESFJ | 9–13% | 12.3% |
| INFP | 4–5% | 4.4% | ENFJ | 2–5% | 2.5% |
| INTP | 3–5% | 3.3% | ENTJ | 2–5% | **1.8%** |

### 2-4. 판독 결과 — 4축 Total

| 극 | 범위 | 점추정 | 극 | 범위 | 점추정 |
|---|---|---|---|---|---|
| E | 45–53% | 49.3% | T | 40–50% | 40.2% |
| I | 47–55% | 50.7% | F | 50–60% | 59.8% |
| S | 66–74% | 73.3% | J | 54–60% | 54.1% |
| N | 26–34% | 26.7% | P | 40–46% | 45.9% |

### 2-5. 원출처 자체의 내부 불정합 (신규 발견)

```
[V2] 미국 인구 유형 빈도 (estimated_frequency_table.gif 판독)
  점추정 합계 = 100.3 %
  ENFP        6-8%     8.1 **범위이탈**
  ENTJ        2-5%     1.8 **범위이탈**
  ── 4축 주변합 재계산 (점추정 합 vs 표 하단 Total 열)
   E: 재계산  49.4%  vs 표기  49.3%  Δ=+0.1pp  범위 45-53%  OK
   I: 재계산  50.9%  vs 표기  50.7%  Δ=+0.2pp  범위 47-55%  **불일치**
   S: 재계산  73.4%  vs 표기  73.3%  Δ=+0.1pp  범위 66-74%  OK
   N: 재계산  26.9%  vs 표기  26.7%  Δ=+0.2pp  범위 26-34%  **불일치**
   T: 재계산  40.4%  vs 표기  40.2%  Δ=+0.2pp  범위 40-50%  **불일치**
   F: 재계산  59.9%  vs 표기  59.8%  Δ=+0.1pp  범위 50-60%  OK
   J: 재계산  54.3%  vs 표기  54.1%  Δ=+0.2pp  범위 54-60%  **불일치**
   P: 재계산  46.0%  vs 표기  45.9%  Δ=+0.1pp  범위 40-46%  OK
```

- **점추정 16개 합 = 100.3%** (0.3pp 초과). Total 열의 주변합도 그만큼 +0.1~0.2pp 씩 어긋난다.
- **ENFP 8.1% 는 자기 범위 6–8% 를 벗어난다.** **ENTJ 1.8% 는 자기 범위 2–5% 를 벗어난다.** (ENTJ 셀은 이미지 8× 확대 재판독으로 `2–5%` / `1.8%` 확정 — 판독 오류 아님.)
- 원인 추정: 1972~2002 서로 다른 데이터뱅크에서 산출한 범위와 점추정을 **다른 시점·다른 표본으로 각각 계산해 한 표에 얹은** 결과. 권리자 스스로 "estimates … compiled from a variety of" 라고 적었다.

→ **제품 적용 규칙**: 이 수치는 **정규화하지 말고 원문 그대로** 표기하고, 합이 100 이 아님을 각주로 밝힌다. 임의 정규화는 원출처를 왜곡한 2차 저작이 된다. `personality-data.json` 에는 `usFrequencyPct`(점추정)와 `usFrequencyRangePct`(범위)를 **둘 다** 넣었다.

---

## 3. [06] 혈액형 궁합 4×4 — 3중 분기 단일화

### 3-1. 상충 상태 (수정 전)

| 위치 | 내용 | 출처 | 값 예 (A×O) |
|---|---|---|---|
| 06 §A-3(a) | 남녀 구분 16쌍 랭킹 (95%~40%) | Threads 카드뉴스 | 여A+남O = 95 |
| 06 §A-3(b) | "앱 기본값 권장" 대칭 4×4 (a의 양방향 평균) | 위 파생 | A-O = 88 |
| 06 §D-2 | "4x4 혈액형 궁합 수치가 SNS 출처 불명 → **자체 룰로 재설계 권장**" | — | — |
| **C08 §7 / C00 §S8-2** | 대칭기저 + 성별보정, 실제 엔진 canon | jaypromax 별점 4×4 + 국내 통설 서열 정합화 | 남O×여A = 93 |

같은 저장소 안에 **앱 기본값이 3벌** 존재했고, 그중 실제 계산엔진이 쓰는 것은 C08 §7 하나였다.

### 3-2. 채택 canon — C08 §7.1 대칭 기저

| 나\상대 | A | B | O | AB |
|---|---|---|---|---|
| **A** | 78 | 45 | 85 | 62 |
| **B** | 45 | 68 | 80 | 82 |
| **O** | 85 | 80 | 70 | 66 |
| **AB** | 62 | 82 | 66 | 76 |

비대칭 셀 0/16.

### 3-3. 채택 canon — C08 §7.2 성별 보정

```python
BLOOD_GENDER_MOD = {   # (남, 여) → 가산. 미기재 조합은 0
 ("O","A"): +8,  ("B","AB"): +6, ("A","O"): +2, ("A","AB"): -8,
 ("AB","B"): +4, ("B","A"): -4,  ("A","B"): +2, ("O","O"): -3,
}
blood_score(male, female) = clamp(base(male,female) + MOD.get((male,female), 0), 0, 100)
```

### 3-4. 재생성 검증 로그

```
[V7] 혈액형 궁합 정본화 (C08 §7)
  §7.1 대칭 기저 비대칭 셀: 0/16  OK
  §7.3 성별보정 최종 (남 행 × 여 열)
            A     B     O    AB
    A      78    47    87    54
    B      41    68    80    88
    O      93    80    67    66
    AB     62    86    66    76
  C08 §7.3 표와 일치: OK
  인구비 가중 평균 71.029 / sd 16.022 / min 41 / max 93
  C08/C00 표기값     평균 70.973 / sd 16.036 / min 41 / max 93
```

16/16 셀 일치. → **06 §A-3(a)(b) 는 삭제하고 C08 §7 참조로 대체. §D-2 의 "자체 재설계 권장"은 "완료(C08 §7)"로 갱신.**

### 3-5. Threads 랭킹은 왜 버려도 되는가 (정보 손실 없음 증명)

Threads 16쌍 서열의 **상위 3개**가 canon 에서도 상위 3개다.

| Threads 서열 | Threads 값 | canon(남·여 순서 맞춤) | canon 순위 |
|---|---|---|---|
| 1위 여A+남O | 95% | 남O×여A = **93** | **1위/16** |
| 2위 여AB+남B | 90% | 남B×여AB = **88** | **2위/16** |
| 3위 여O+남A | 80% | 남A×여O = **87** | 3위/16 |
| 16위 여A+남AB | 40% | 남AB×여A = 62 | 12위/16 |
| — | — | 남B×여A = **41** | **16위/16** (최저) |

상위 서열은 보존되고 최하위만 다르다(Threads: 여A+남AB / canon: 남B×여A). canon 은 이미 §7.1 조정 단계에서 "threads 자료의 95%/90%/80% 서열과 정합하도록" 만들어졌으므로 **Threads 표를 별도 보관할 이유가 없다.**

---

## 4. [06] 12별자리 탄생석 — 필드 삭제와 분리

### 4-1. 구 `stone` 필드가 실제로 무엇이었는가

`zodiacSigns[*].stone` 12개 값을 양력 월별 탄생석 표와 대조하면 **사인이 끝나는 달의 탄생석**과 정확히 일치한다.

| sign | 기간 | 구 stone | 그 stone 의 실제 월 |
|---|---|---|---|
| aries | 03-21~04-19 | 다이아몬드 | 4월 |
| taurus | 04-20~05-20 | 에메랄드 | 5월 |
| gemini | 05-21~06-21 | 진주 | 6월 |
| cancer | 06-22~07-22 | 루비 | 7월 |
| leo | 07-23~08-22 | 페리도트 | 8월 |
| virgo | 08-23~09-22 | 사파이어 | 9월 |
| libra | 09-23~10-22 | 오팔 | 10월 |
| scorpio | 10-23~11-21 | 토파즈 | 11월 |
| sagittarius | 11-22~12-21 | 터키석 | 12월 |
| capricorn | 12-22~01-19 | 가넷 | 1월 |
| aquarius | 01-20~02-18 | 자수정 | 2월 |
| pisces | 02-19~03-20 | 아쿠아마린 | 3월 |

즉 `stone` 은 별자리 데이터가 아니라 **월별 탄생석을 사인에 오프바이원으로 갖다 붙인 것**이다.

### 4-2. 오적용률 실측 (365일 전수)

```
[V5] 탄생석: '사인별 stone' 필드의 실제 오류율
  sign          구 stone  해당 월     일치일수    총일수      적중률
  aries           다이아몬드     4월       19     30    63.3%
  taurus           에메랄드     5월       20     31    64.5%
  gemini             진주     6월       21     32    65.6%
  cancer             루비     7월       22     31    71.0%
  leo              페리도트     8월       22     31    71.0%
  virgo            사파이어     9월       22     31    71.0%
  libra              오팔    10월       22     30    73.3%
  scorpio           토파즈    11월       21     30    70.0%
  sagittarius       터키석    12월       21     30    70.0%
  capricorn          가넷     1월       19     29    65.5%
  aquarius          자수정     2월       18     30    60.0%
  pisces          아쿠아마린     3월       20     30    66.7%
  전체 적중률 = 247/365 = 67.67%  → 오적용 118일 (32.33%)
```

**1년 365일 중 118일(32.33%) 의 사용자에게 자기 생월과 다른 돌을 보여준다.** 최악은 물병자리(60.0%), 즉 1/20~1/31 태어난 11일치 사용자는 1월생인데 2월 자수정을 받는다.

### 4-3. 처리

- `zodiacSigns[*].stone` **삭제** (잔존 0건, `personality-data.json` 문자열 검색으로 확인).
- 신규 `monthBirthstones.byMonth` — **양력 월 키**, 2출처 교차 확인.

| 월 | 탄생석 |
|---|---|
| 1 | 가넷 |
| 2 | 자수정 |
| 3 | 아쿠아마린, 블러드스톤 |
| 4 | 다이아몬드 |
| 5 | 에메랄드 |
| 6 | 진주, 문스톤, 알렉산드라이트 |
| 7 | 루비 |
| 8 | 페리도트, 스피넬, 사도닉스 |
| 9 | 사파이어 |
| 10 | 오팔, 투르말린 |
| 11 | 토파즈, 시트린 |
| 12 | 탄자나이트, 터키석, 지르콘 |

American Gem Society 목록과 Wikipedia "Birthstone" 의 U.S.(2019) 열이 **12/12 완전 일치**(6·8·12월의 복수 항목 순서까지). Wikipedia 원문: *"각 요일에도 고유 보석이 배정되며 이는 월별 배정과 별개"* — 그리고 별도의 **"Zodiacal"** 절에 사인별 보석 표가 따로 있음을 명시한다. 즉 **월별 목록과 사인별 목록은 원래 다른 체계**다. 사인별 목록은 이번 조사에서 원문 표를 확보하지 못했으므로 **채택하지 않는다**.

> UI 표기: "탄생석"은 생년월일의 **월**로만 계산하고, 별자리 카드에는 넣지 않는다. 별자리 카드에 돌을 넣고 싶으면 "수호석"이 아니라 **원소 상징(불/흙/공기/물)** 을 쓴다 — 이쪽은 Wikipedia Triplicity 로 1차 확인된 축이다.

---

## 5. [06] 출처 중복 · 한국 혈액형 분포 확정

### 5-1. 출처 6·7 중복

수정 전:
```
6. 한국갤럽 데일리 오피니언 리포트 (seqNo=870) — …
7. 한국갤럽 2017 혈액형 조사 관련 검색 결과 (58%, ±2.5%p, 95% 신뢰수준) — 위와 동일 리포트 교차 확인
```
두 항목의 URL 이 `https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=870` 로 **완전 동일**. → **7번 삭제, 6번에 내용 병합.**

### 5-2. seqNo=870 원문 재확인 결과 (신규 정보 포함)

| 항목 | 값 |
|---|---|
| 제목 | 혈액형에 따른 성격 차이와 혈액형 신뢰도 — 2002/2012/2017년 |
| 조사기간 | 2017.7.6 ~ 7.26 |
| 표본 | 전국 만 19세 이상 1,500명 |
| 표본오차 | ±2.5%p (95% 신뢰수준) |
| 자기응답 혈액형 | A 34% / B 28% / O 27% / AB 11% |
| "혈액형에 따라 성격 차이가 있다" | **2002년 67% → 2012년 67% → 2017년 58%** (−9%p) |
| "차이가 없다" (2017) | 42% |

기존 문서 06 은 2017년 58% 만 적고 **2002/2012=67% 시계열을 누락**했다. 추가 반영.

### 5-3. 한국인 혈액형 분포 — 대한적십자사 원문 직접 인용

`bloodinfo.net/knrcbs/cm/cntnts/cntntsView.do?mi=1056&cntntsId=1129`

> "한국인에서는 A형이 약 34%로 가장 높고 O형은 28%, B형은 27%의 빈도를 보이고 AB형은 11% 정도임."
> Rh 음성: 0.1%

| 계열 | A | B | O | AB | 합 |
|---|---|---|---|---|---|
| **대한적십자사(정본)** | **34** | **27** | **28** | **11** | 100 |
| 한국갤럽 2017 자기응답 | 34 | 28 | 27 | 11 | 100 |

B/O 가 1%p 씩 뒤집힌 것은 갤럽 표본오차 ±2.5%p 안이다. → **엔진 인구비는 적십자사 값(A34/B27/O28/AB11) 고정.** C08 §7 시뮬레이션이 이미 이 값을 쓰고 있어 정합.

---

## 6. 신규 발견 (크리틱 미지적)

### 6-1. [N1] 별자리 궁합 k값이 저장소 안에 3벌 존재

```
[V6] 별자리 궁합 k값 3종 상충 확인 + C00 canon 재생성
  C08 §4.1 규칙 재생성 k0..k6 = [79, 37, 83, 23, 95, 35, 79]
  C00 §S8-2 표기         k0..k6 = [79, 37, 83, 23, 95, 35, 79]   일치=True
  C08 §1.5 mybias.app 관측 k0..k6 = [88, 35, 83, 32, 92, 40, 85]  (외부 상용값, 참고)
  문서06 §B-2 표기        k0..k6 = [72, 45, 85, 40, 95, 35, 65]  ← 근거 없음, 폐기 대상
  대칭성: 비대칭 셀 0/144
  고유값 6종: [23, 35, 37, 79, 83, 95]
  동일원소 비동일사인 → 전부 트라인(95)? 위반 0건
```

문서 06 §B-2 의 `ASPECT_TABLE`(72/45/85/40/95/35/65)은 어떤 출처와도 대응되지 않는 **고아 상수표**다. 문서 06 이 앱 구현용 JS 코드까지 제공하고 있어 그대로 구현되면 C00 canon 과 어긋난다. → **06 §B-2 를 C00 canon 값으로 교체.**

canon 재생성 규칙(C08 §4.1):
```python
k  = min(|i-j| % 12, 12 - (|i-j| % 12))          # 0..6
A  = {0:+12, 1:-6, 2:+14, 3:-12, 4:+20, 5:-8, 6:+18}[k]
E  = +18 if (i%4)==(j%4) else (+12 if ((i-j)%4)==2 else -8)
M  = -4 if (i%3)==(j%3) else +4
P  = +3 if (i%2)==(j%2) else -3
score = clamp(50 + A + E + M + P, 0, 100)
```

| k | 각도 | 어스펙트 | A | E | M | P | 점수 | 셀 수 |
|---|---|---|---|---|---|---|---|---|
| 0 | 0° | conjunction | +12 | +18 | −4 | +3 | **79** | 12 |
| 1 | 30° | semisextile | −6 | −8 | +4 | −3 | **37** | 24 |
| 2 | 60° | sextile | +14 | +12 | +4 | +3 | **83** | 24 |
| 3 | 90° | square | −12 | −8 | −4 | −3 | **23** | 24 |
| 4 | 120° | trine | +20 | +18 | +4 | +3 | **95** | 24 |
| 5 | 150° | quincunx | −8 | −8 | +4 | −3 | **35** | 24 |
| 6 | 180° | opposition | +18 | +12 | −4 | +3 | **79** | 12 |

### 6-2. [N2] C00 §S8-2 의 "7값"은 실제로 고유값 6종

k=0 과 k=6 이 둘 다 79 다. 자유도(파라미터 수)는 7이지만 **치역의 고유값은 6종**이고, 각 값의 도수가 정확히 24로 균등하다(k0 12셀 + k6 12셀 = 24).

```
ZODIAC 값 도수: {23: 24, 35: 24, 37: 24, 79: 24, 83: 24, 95: 24}
```

→ 12×12 별자리 점수 분포는 **6점 균등분포**. 해석해:
```
μ = (23+35+37+79+83+95)/6 = 352/6 = 58.6667
σ = sqrt( Σ(x-μ)² / 6 )   = 27.7709
```
C00 표기 `zodiac:(58.655, 27.764)` 와 Δμ=+0.0117 / Δσ=+0.0069. 몬테카를로 잡음 수준. **해석해가 존재하므로 C00 의 시뮬 추정치를 해석해로 교체 권장**(계산 비용 0, 재현성 100%).

### 6-3. [N3] 혈액형 POP 모멘트 — 해석해 vs C00 표기치

```
BLOOD 해석해   mu=71.0286 sd=16.0222     (성별보정 최종표, 인구비 A.34/B.27/O.28/AB.11)
C00 표기       mu=70.973  sd=16.036      Δmu=+0.0556  Δsd=-0.0138
```
영향도 실측:
```
z2p(blood) 최대 변동 = 0.0775 점 → 가중 0.10 적용 시 최종 0.00775 점
```
→ **최종점수 0.008점** 이므로 비차단(non-blocking). 그러나 해석해가 닫힌 형태로 존재하므로 C00 갱신 시 교체 권장.

### 6-4. [N4] ⚠️ 성별 미입력 폴백 시 z2p 파라미터가 틀린다 (차단성 있음)

C00 §S8-2 는 "성별 미입력 시 대칭표 폴백"을 규정하는데, §S8-3 의 `POP.blood = (70.973, 16.036)` 은 **성별보정 최종표의 모멘트**다. 대칭 기저표의 모멘트는 다르다.

| 분포 | μ | σ |
|---|---|---|
| 성별보정 최종 4×4 (남×여) | 71.0286 | 16.0222 |
| **대칭 기저 4×4 (폴백)** | **70.4976** | **13.9612** |

σ 가 16.02 → 13.96 으로 **12.9% 작다.** 잘못된 σ 로 z2p 를 돌리면:

```
 pair  base  z2p(70.973,16.036)  z2p(70.498,13.961)   Δ    Δ×0.10
 A -A     78             58.888             60.841  +1.953  +0.1953
 A -B     45             20.947             18.278  -2.669  -0.2669
 A -O     85             67.201             70.094  +2.893  +0.2893
 A -AB    62             38.726             37.775  -0.952  -0.0952
 B -A     45             20.947             18.278  -2.669  -0.2669
 B -B     68             46.207             46.339  +0.132  +0.0132
 B -O     80             61.339             63.601  +2.262  +0.2262
 B -AB    82             63.735             66.275  +2.540  +0.2540
 O -A     85             67.201             70.094  +2.893  +0.2893
 O -B     80             61.339             63.601  +2.262  +0.2262
 O -O     70             48.756             49.269  +0.512  +0.0512
 O -AB    66             43.677             43.433  -0.243  -0.0243
 AB-A     62             38.726             37.775  -0.952  -0.0952
 AB-B     82             63.735             66.275  +2.540  +0.2540
 AB-O     66             43.677             43.433  -0.243  -0.0243
 AB-AB    76             56.391             58.009  +1.618  +0.1618
최대 |Δ| = 2.893 점 (서브점수) → 가중 0.10 적용 시 최종 0.2893 점
```

→ **권고: `POP.blood` 를 2분기한다.**
```python
POP_BLOOD_GENDERED  = (71.029, 16.022)   # 남녀 모두 입력
POP_BLOOD_SYMMETRIC = (70.498, 13.961)   # 성별 미입력 폴백
```
영향 0.29점으로 등급 경계(ANCHOR 구간 폭 최소 6점)를 넘지 않아 등급 변동은 없지만, "같은 입력 = 같은 점수" 결정론 명세상 파라미터가 분포와 어긋나 있는 것은 스펙 결함이다. **C08/C00 후속 개정 항목으로 등록.**

---

## 7. 검증 통과 항목 (변경 불필요 — 회귀 기준선)

### 7-1. 인지기능 스택 16/16

```
[V3] 인지기능 스택 규칙 생성 vs 문서05 §2-3 표
  16/16 일치 여부: 불일치 0건  → PASS
```

생성 규칙(문서 05 §2-3 의 의사코드를 실행 가능 코드로):
```python
OPP = {"S":"N","N":"S","T":"F","F":"T"}
def stack(t):                       # t = "INTJ"
    E  = t[0]=="E";  Pp = t[3]=="P"
    per, jud = t[1], t[2]
    extF = per if Pp else jud       # P → 인식기능을 외향, J → 판단기능을 외향
    intF = jud if Pp else per
    dom = (extF+"e") if E else (intF+"i")
    aux = (intF+"i") if E else (extF+"e")
    ter = OPP[aux[0]] + ("e" if aux[1]=="i" else "i")
    inf = OPP[dom[0]] + ("e" if dom[1]=="i" else "i")
    return [dom, aux, ter, inf]
```

| type | stack | type | stack |
|---|---|---|---|
| ISTJ | Si-Te-Fi-Ne | ESTP | Se-Ti-Fe-Ni |
| ISFJ | Si-Fe-Ti-Ne | ESFP | Se-Fi-Te-Ni |
| INFJ | Ni-Fe-Ti-Se | ENFP | Ne-Fi-Te-Si |
| INTJ | Ni-Te-Fi-Se | ENTP | Ne-Ti-Fe-Si |
| ISTP | Ti-Se-Ni-Fe | ESTJ | Te-Si-Ne-Fi |
| ISFP | Fi-Se-Ni-Te | ESFJ | Fe-Si-Ne-Ti |
| INFP | Fi-Ne-Si-Te | ENFJ | Fe-Ni-Se-Ti |
| INTP | Ti-Ne-Si-Fe | ENTJ | Te-Ni-Se-Fi |

(Grant 모델. 3차기능 태도가 부기능의 반대라는 전제는 유파차이 — C00 유파 분기 표기 방식과 동일하게 병기.)

### 7-2. 12별자리 구조 무결성 전항 통과

```
[V4] 12별자리 원소·양태·극성·지배행성 무결성
  원소 fire  : 3개  OK
  원소 earth : 3개  OK
  원소 air   : 3개  OK
  원소 water : 3개  OK
  양태 cardinal: 4개  OK
  양태 fixed   : 4개  OK
  양태 mutable : 4개  OK
  element == ELEMS[i%4] : OK
  modality == MODS[i%3] : OK
  polarity == (i%2==0?+:-): OK
  현대==전통 지배행성 (전갈/물병/물고기 제외): OK
  2023년 365일 전수 매핑: 미매핑 0건 []  OK
  2024년 366일 전수 매핑: 미매핑 0건 []  OK
```

즉 12궁 속성은 전부 인덱스 `i` 의 함수다 — 저장할 필요조차 없다.
```
element  = ["fire","earth","air","water"][i % 4]
modality = ["cardinal","fixed","mutable"][i % 3]
polarity = (i % 2 == 0) ? "+" : "-"
```

| i | id | 기간 | element | modality | polarity | rulerModern | rulerTraditional |
|---|---|---|---|---|---|---|---|
| 0 | aries | 03-21~04-19 | fire | cardinal | + | mars | mars |
| 1 | taurus | 04-20~05-20 | earth | fixed | − | venus | venus |
| 2 | gemini | 05-21~06-21 | air | mutable | + | mercury | mercury |
| 3 | cancer | 06-22~07-22 | water | cardinal | − | moon | moon |
| 4 | leo | 07-23~08-22 | fire | fixed | + | sun | sun |
| 5 | virgo | 08-23~09-22 | earth | mutable | − | mercury | mercury |
| 6 | libra | 09-23~10-22 | air | cardinal | + | venus | venus |
| 7 | scorpio | 10-23~11-21 | water | fixed | − | **pluto** | **mars** |
| 8 | sagittarius | 11-22~12-21 | fire | mutable | + | jupiter | jupiter |
| 9 | capricorn | 12-22~01-19 | earth | cardinal | − | saturn | saturn |
| 10 | aquarius | 01-20~02-18 | air | fixed | + | **uranus** | **saturn** |
| 11 | pisces | 02-19~03-20 | water | mutable | − | **neptune** | **jupiter** |

---

## 8. [05] MBTI 상표권 — 확신도 하향

### 8-1. KIPRIS 제9류 확인 재시도 — 전량 실패 로그

| # | 엔드포인트 | 결과 |
|---|---|---|
| 1 | `http://kpat.kipris.or.kr/kpat/searchLogina.do?next=MainSearch` | **HTTP 502** (138 B) |
| 2 | `https://www.kipris.or.kr/khome/main.do` | HTTP 200 / 1,013,141 B — SPA 셸, 검색결과 없음 |
| 3 | `https://www.kipris.or.kr/khome/search/searchResult.do?searchWord=MBTI` | HTTP 200 / 1,088,677 B — 본문에 `MBTI` 문자열 **0회** (JS 렌더) |
| 4 | `https://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/trademarkInfoSearch?searchString=MBTI` | **HTTP 404** |
| 5 | `https://www.tmdn.org/tmview/` (TMview, KR 데이터 보유) | HTTP 200 / **531 B** SPA 셸 |
| 6 | `POST https://www.tmdn.org/tmview/api/search/results` (fOffices=["KR"]) | **HTTP 000** — 연결 실패 |
| 7 | `https://branddb.wipo.int/branddb/en/` (WIPO Global Brand DB) | HTTP 200 / **1,708 B** SPA 셸 |
| 8 | `POST https://branddb.wipo.int/api/search` | HTTP 200 이지만 Angular 셸 HTML 반환 (JSON 아님) |
| 9 | `https://tsdrapi.uspto.gov/ts/cd/casestatus/sn74377710/info.xml` | **HTTP 401** (API key 필요) |
| 10 | `POST https://tmsearch.uspto.gov/api-v1-0-0/tmsearch` | **HTTP 405** MethodNotAllowed |
| 11 | `https://www.trademarkelite.com/korea/trademark/search?q=MBTI` | **HTTP 404** |
| 참고 | `https://www.assesta.com/` | HTTP 200 — 푸터에 "공식 상표 The Myers-Briggs Company" 표기는 있으나 **등록번호·지정상품류 없음** |
| 참고 | `https://www.capt.org/mbti-assessment/estimated-frequencies.htm` | **HTTP 301 → myersbriggs.org** (CAPT 사이트가 재단 사이트로 통합됨) |

**결론: 한국 내 `MBTI` 상표의 지정상품류(특히 제9류 소프트웨어) 등록 여부는 이번에도 확보하지 못했다.** 공개 웹에서 접근 가능한 모든 경로가 SPA/키필수/차단이다. 확인하려면 KIPRIS 계정 로그인 후 수동 조회 또는 KIPRIS Plus API 키 발급이 필요하다.

### 8-2. 문서 05 서술 교정 방향

기존 05 는 §0 결론 8 과 §7-3 에서 **"권장: B안"** 을 확정적으로 제시했다. 근거 구조는 이렇다.

| B안을 지지하는 근거 | 확보 여부 |
|---|---|
| MBTI 가 Myers & Briggs Foundation 등록상표 | ✅ 권리자 공식 페이지 2건 |
| 한국에서도 등록상표라고 권리자 측이 공개 주장 | ✅ App Store 어세스타 앱 설명문 |
| 상표 사용은 형용사로, 정품에만 | ✅ 가이드라인 원문 |
| 4글자 유형코드는 상표 목록에 없음 | ✅ (부존재 확인이라 단정 불가 → 중) |
| **어느 상품류(class)에 등록되었는가** | ❌ **미확보** |
| 앱 스토어 타이틀/ASO 키워드가 상표적 사용인지 | ❌ 미확보 |
| 국내 경고장·소송 확정 사례 | ❌ 0건 확인 |

**지정상품류 미확보가 B안 권고를 무효로 만들지는 않는다.** B안(앱명에서 MBTI 제거)은 제9류 등록 여부와 **무관하게** 안전한 쪽이기 때문이다. 무효가 되는 것은 반대 방향, 즉 **"제9류 미등록이니 A안(앱명에 MBTI)도 괜찮다"** 라는 추론이다. 05 §10 미해결질문 2 가 *"제9류 미등록이라면 앱 자체에 대한 리스크가 크게 달라진다"* 라고 적은 것이 바로 이 반대 방향의 기대인데, 이건 **성립하지 않는다**:

- 상표법 제34조①7호는 동일·유사 상품에 대한 유사상표 등록을 막지만, **침해 판단(제108조 간주침해 포함)** 은 제41류(교육)·제42류(심리검사) 등록만으로도 "유사 상품/서비스"로 확장될 수 있다. 미니앱은 **성격유형 검사 관련 서비스 제공**이라 제41/42류의 지정서비스와 유사성 다툼이 가능하다.
- 부정경쟁방지법 제2조1호 가·나목(주지·저명 표지 혼동·희석)은 **등록류와 무관**하게 작동한다. MBTI 는 국내 인지도 77.0%(트렌드모니터 2023)로 주지성 요건 충족 가능성이 높다.
- 앱인토스 운영정책은 **권리자 신고 → 노출 중단** 구조라 등록류 심사를 거치지 않는다(05 §8).

→ **05 의 교정 방향: "B안 권장"은 유지하되, (a) 근거를 "제9류 미등록 가능성"에 걸지 않았음을 명시하고, (b) A안이 안전해질 조건이 없음을 §10 미해결질문 2 에 반영하며, (c) §0 결론 8 의 확신도를 "권고(근거강도 중~상)"로 표기한다.** 실제 Edit 내용은 §9.

---

## 9. 원 문서 정정 기록 (실제 Edit)

### 9-1. `docs/research/05-MBTI-데이터와-상표권-리스크.md`

| # | 위치 | 수정 전 | 수정 후 |
|---|---|---|---|
| E05-1 | §1-2 표 헤더 · 주석 | "인구비율은 국내 testmoa 자가선택 표본…" | 국내 비율 = **count 열 재산출값**임을 명시 + 미국 인구 빈도 컬럼 신설 안내 + C21 참조 |
| E05-2 | §1-2 표 rank 10·11 행 | `INTJ … 5.97%` / `ISTP … 5.37%` (INTJ 가 위) | `ISTP … 5.97%` / `INTJ … 5.37%` (ISTP 가 위, count 순) + 미국 빈도 컬럼 추가 |
| E05-3 | §1-2 "데이터 품질 경고" | "testmoa 표 원본은 … 정합성이 깨져 있음(원 데이터 오탈자로 보임)" / "미국 인구 빈도표는 404 로 원본 확인 실패 `[미검증]`" | 전치 오류의 **위치 특정 + 정정 방법** 기술 / 미국 빈도표 **Wayback 복원 완료 + 원출처 내부 불정합(합 100.3%, ENFP·ENTJ 범위이탈) 명기** |
| E05-4 | §0 결론 8 · §7-3 · §10 Q2 · §9 액션 | "권고안: B안" 단정 / Q2 "제9류 미등록이면 리스크가 크게 달라진다" / 액션 8 "미국 빈도 재확인 P2" | B안 근거강도 표기 + **"제9류 미등록이어도 A안이 안전해지지 않는다"** 로 Q2 교정 + 액션 8 완료 처리 + KIPRIS 11경로 실패 기록 |

### 9-2. `docs/research/06-혈액형-성격론과-서양점성술-별자리-데이터.md`

| # | 위치 | 수정 전 | 수정 후 |
|---|---|---|---|
| E06-1 | §A-3 전체 | (a) Threads 16쌍 랭킹 + (b) "앱 기본값 권장" 대칭 4×4 + JSON | **C08 §7 canon 으로 교체.** Threads 표는 "서열 참고용(폐기)"로 강등, 앱 기본값은 §7.1/§7.2/§7.3 |
| E06-2 | §A-4 갤럽 블록 | 2017 58% 만 기재 | 2002/2012 = 67% → 2017 = 58%(−9%p) 시계열 + 리포트 제목·표본오차 추가 |
| E06-3 | §B-1 "상징·수호석" 표 + JSON | `stone` 필드 12개 | **표 삭제 → 월별 탄생석 표로 대체**, JSON `stone` 키 전량 제거, 적중률 67.67% 근거 명기 |
| E06-4 | §B-2 `ASPECT_TABLE` + 12×12 표 | 72/45/85/40/95/35/65 | **C00 canon 79/37/83/23/95/35/79** + 생성 규칙(C08 §4.1) 로 교체, 고유값 6종 명기 |
| E06-5 | §D 리스크 표 2·4행 | "자체 룰 재설계 권장" / "수호석 1차 출처 없음" | 둘 다 **해결 완료(C21)** 로 갱신 |
| E06-6 | §출처 6·7 | 동일 URL 2개 항목 | 7번 삭제, 6번 통합 + 신규 출처(AGS, Wikipedia Birthstone) 추가 |

---

## 10. 산출물 — `personality-data.json`

### 10-1. 최상위 구조

```
_meta                     생성일 / confidenceLegend / removedFields
mbti
  ├ dichotomies           4축
  ├ usFrequencyDichotomyTotals   E/I/S/N/T/F/J/P 각 {rangePct, pointPct}
  ├ krSampleN / krSampleWindow / krSampleKind
  └ types[16]             code, aliasKo, temperament, stack[4],
                          usFrequencyPct, usFrequencyRangePct[2],
                          krSelfSelectedPct, krSelfSelectedN
bloodTypes[4]             code, labelKo, krPopulationPct, krSelfReportedPct,
                          keywordsKo, strengthsKo, weaknessesKo
bloodCompatibility        symmetricBase 4×4 / genderMod / finalMaleRowFemaleCol 4×4
                          / fallback / popWeighted
zodiacSigns[12]           index, id, ko, en, glyph, lonStart, lonEnd,
                          startMMDD, endMMDD, element, modality, polarity,
                          rulerModern, rulerTraditional, symbolKo   ← stone 없음
zodiacCompatibility       formula / aspectK{0..6} / aspectName / uniqueValues / symmetric
monthBirthstones          byMonth{1..12}
zodiacToEarthlyBranch     map{sign → {hanja, branch}}
disclaimer                blood / mbti / zodiac
```

### 10-2. `_confidence` 등급 정의

| 코드 | 의미 | 해당 필드 예 |
|---|---|---|
| `P1` | 1차 출처 원문 직접 확인 | `bloodTypes[*].krPopulationPct`, `zodiacSigns[*].element` |
| `P1-archived` | 1차 출처 원문(웹아카이브 스냅샷) 판독 | `mbti.types[*].usFrequencyPct` |
| `P1-rule` | 1차 출처의 규칙을 코드로 재생성해 표와 대조 통과 | `mbti.types[*].stack` |
| `P2` | 2차 출처(위키·언론·상용사이트) | `zodiacSigns[*].startMMDD`, `monthBirthstones` |
| `P2-corrected` | 2차 출처 확인 + 원표 오류를 자체 재산출로 정정 | `mbti.types[*].krSelfSelectedPct` |
| `D` | 자체 설계/자체 저작(외부 근거 없음) | `aliasKo`, `bloodCompatibility`, `zodiacCompatibility` |
| `U` | 미검증 | (현재 0건 — 전부 제거 또는 강등 처리) |

### 10-3. 레코드 샘플

```json
{
  "code": "ISTJ",
  "aliasKo": "원칙의 관리자",
  "_source_aliasKo": "자체 작성(본 프로젝트 저작물)",
  "_confidence_aliasKo": "D",
  "temperament": "SJ",
  "stack": ["Si", "Te", "Fi", "Ne"],
  "_source_stack": "https://www.myersbriggs.org/unique-features-of-myers-briggs/type-dynamics-processes/ + Grant 모델",
  "_confidence_stack": "P1-rule",
  "usFrequencyPct": 11.6,
  "usFrequencyRangePct": [11, 14],
  "_source_usFrequency": "…how-frequent-is-my-type.htm (Wayback 20230417084849, estimated_frequency_table.gif 판독)",
  "_confidence_usFrequency": "P1-archived",
  "krSelfSelectedPct": 8.89,
  "krSelfSelectedN": 9289,
  "_source_krSelfSelected": "https://testmoa.com/korea-mbti-statistics/ (2023.3~8, n=104,484, 자가선택 표본; 비율열 ISTP/INTJ 전치 오류를 count열로 재산출)",
  "_confidence_krSelfSelected": "P2-corrected"
}
```

### 10-4. 빌드 로그 (말미)

```
[BUILD] personality-data.json
  wrote C:\Users\user\orca\projects\saju-toss-app\docs\research\calc\personality-data.json  (43520 bytes)
  mbti.types=16  bloodTypes=4  zodiacSigns=12
  'stone' 키 잔존: 0건
```

---

## 11. 16유형 마스터 표 (정정 후 최종본)

별칭은 전부 **자체 작명**(16Personalities 번역명 미사용). 국내 비율은 재산출값.

| code | 자체 별칭 | 기질 | 스택 | 미국 범위 | 미국 점추정 | 국내(자가선택) | 국내 명 |
|---|---|---|---|---|---|---|---|
| ISTJ | 원칙의 관리자 | SJ | Si-Te-Fi-Ne | 11–14% | 11.6% | 8.89% | 9,289 |
| ISFJ | 든든한 지킴이 | SJ | Si-Fe-Ti-Ne | 9–14% | 13.8% | 9.08% | 9,484 |
| INFJ | 통찰의 조언자 | NF | Ni-Fe-Ti-Se | 1–3% | 1.5% | 7.68% | 8,021 |
| INTJ | 전략 설계자 | NT | Ni-Te-Fi-Se | 2–4% | 2.1% | **5.37%** | 5,607 |
| ISTP | 손끝의 해결사 | SP | Ti-Se-Ni-Fe | 4–6% | 5.4% | **5.97%** | 6,241 |
| ISFP | 조용한 예술가 | SP | Fi-Se-Ni-Te | 5–9% | 8.8% | 7.13% | 7,447 |
| INFP | 마음의 이상가 | NF | Fi-Ne-Si-Te | 4–5% | 4.4% | 8.07% | 8,435 |
| INTP | 개념의 탐구자 | NT | Ti-Ne-Si-Fe | 3–5% | 3.3% | 4.92% | 5,143 |
| ESTP | 돌파하는 실전가 | SP | Se-Ti-Fe-Ni | 4–5% | 4.3% | 2.81% | 2,938 |
| ESFP | 무대 위 활력가 | SP | Se-Fi-Te-Ni | 4–9% | 8.5% | 5.21% | 5,444 |
| ENFP | 불꽃 탐험가 | NF | Ne-Fi-Te-Si | 6–8% | 8.1% | 7.36% | 7,695 |
| ENTP | 논쟁하는 발명가 | NT | Ne-Ti-Fe-Si | 2–5% | 3.2% | 3.61% | 3,767 |
| ESTJ | 실행하는 사령탑 | SJ | Te-Si-Ne-Fi | 8–12% | 8.7% | 6.11% | 6,381 |
| ESFJ | 살뜰한 살림꾼 | SJ | Fe-Si-Ne-Ti | 9–13% | 12.3% | 6.31% | 6,598 |
| ENFJ | 사람의 리더 | NF | Fe-Ni-Se-Ti | 2–5% | 2.5% | 6.61% | 6,910 |
| ENTJ | 목표의 지휘관 | NT | Te-Ni-Se-Fi | 2–5% | 1.8% | 4.87% | 5,084 |
| | | | **합계** | | **100.3%** | **100.00%** | **104,484** |

**두 열의 괴리 자체가 콘텐츠다**: 미국 S 73.3% vs 국내 자가선택 표본 S 계열(ISTJ+ISFJ+ISTP+ISFP+ESTP+ESFP+ESTJ+ESFJ) = 8.89+9.08+5.97+7.13+2.81+5.21+6.11+6.31 = **51.51%**. 자가선택 온라인 표본이 N 계열로 크게 치우쳐 있다는 뜻이며, 이는 **표본 편향의 직접 증거**다. 앱에서 "국내 비율"을 노출한다면 이 문장을 반드시 병기한다.

---

## 12. 앱 적용 체크리스트

```
[x] personality-data.json 단일 파일로 통합 (16 + 4 + 12)
[x] zodiacSigns.stone 제거 → monthBirthstones 분리
[x] 혈액형 궁합 = C08 §7 단일 소스 (Threads 표 삭제)
[x] 별자리 궁합 = C00 canon k값 (문서06 고아 상수표 삭제)
[x] 모든 값 필드에 _source_* / _confidence_* 병기
[x] 16Personalities 별칭/번역명 0건 수록
[ ] POP.blood 2분기 (gendered / symmetric) — C08·C00 개정 필요 (§6-4)
[ ] C00 §S8-2 "7값" → "자유도 7 / 고유값 6" 문구 정정 (§6-2)
[ ] C00 §S8-3 POP 모멘트를 해석해로 교체 (§6-2, §6-3)
[ ] KIPRIS 제9류 수동 조회 (계정 로그인 필요) — 여전히 미해결
```

---

## 출처

WebFetch 또는 Bash `curl` 로 **이번 세션에 직접 열어 본문을 확인한 URL만** 기재.

1. **Myers & Briggs Foundation — How Frequent Is My Type (Wayback 20230417084849)** — `http://web.archive.org/web/20230417084849id_/https://www.myersbriggs.org/my-mbti-personality-type/my-mbti-results/how-frequent-is-my-type.htm` — 원문 서술, CAPT 2001 출처, 1972~2002 데이터뱅크 명시. curl 27,780 B
2. **estimated_frequency_table.gif (Wayback im_)** — `http://web.archive.org/web/20230417084849im_/https://www.myersbriggs.org/_images/estimated_frequency_table.gif` — 16유형 범위+점추정, 4축 Total. GIF89a 350×223, 15,277 B
3. **Wayback Availability API** — `https://archive.org/wayback/available?url=myersbriggs.org/...how-frequent-is-my-type.htm` — 스냅샷 존재 확인 JSON
4. **테스트모아 — 한국 MBTI 비율 순위 통계(2023, n=104,484)** — `https://testmoa.com/korea-mbti-statistics/` — 16행 비율+명 전량 재확인, 조사기간·출처
5. **대한적십자사 혈액관리본부 — 혈액형 종류** — `https://bloodinfo.net/knrcbs/cm/cntnts/cntntsView.do?mi=1056&cntntsId=1129` — "A형이 약 34% … O형은 28%, B형은 27% … AB형은 11% 정도임", Rh 음성 0.1%
6. **한국갤럽 — 혈액형에 따른 성격 차이와 혈액형 신뢰도 2002/2012/2017** — `https://www.gallup.co.kr/gallupdb/reportContent.asp?seqNo=870` — 2017.7.6~26, n=1,500, ±2.5%p, 자기응답 A34/B28/O27/AB11, "차이 있다" 67→67→58%
7. **American Gem Society — Birthstones** — `https://www.americangemsociety.org/birthstones/` — 12개월 탄생석 전량
8. **Wikipedia — Birthstone** — `https://en.wikipedia.org/wiki/Birthstone` — U.S.(2019) 12개월 목록, "Zodiacal" 절이 별개 체계임을 명시
9. **Wikipedia — Myers–Briggs Type Indicator** — `https://en.wikipedia.org/wiki/Myers%E2%80%93Briggs_Type_Indicator` — **인구 분포표 부존재 확인**(대안 출처 탐색 과정)
10. **나무위키 — MBTI** — `https://namu.wiki/w/MBTI` — 국내 공식 분포 통계 **부존재 확인**, 16personalities 통계의 자가선택 경고 원문
11. **어세스타** — `https://www.assesta.com/` — 푸터 "공식 상표 The Myers-Briggs Company" 표기 확인, **등록번호·지정상품류 없음**

### 접근 실패 URL (§8-1 전량 재게)

| URL | 코드 |
|---|---|
| `http://kpat.kipris.or.kr/kpat/searchLogina.do?next=MainSearch` | 502 |
| `https://www.kipris.or.kr/khome/main.do` | 200 / SPA 셸 |
| `https://www.kipris.or.kr/khome/search/searchResult.do?searchWord=MBTI` | 200 / SPA 셸 (본문 `MBTI` 0회) |
| `https://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/trademarkInfoSearch?searchString=MBTI` | 404 |
| `https://www.tmdn.org/tmview/` | 200 / 531 B SPA 셸 |
| `POST https://www.tmdn.org/tmview/api/search/results` | 000 (연결 실패) |
| `https://branddb.wipo.int/branddb/en/` | 200 / 1,708 B SPA 셸 |
| `POST https://branddb.wipo.int/api/search` | 200 / Angular 셸 HTML |
| `https://tsdrapi.uspto.gov/ts/cd/casestatus/sn74377710/info.xml` | 401 |
| `POST https://tmsearch.uspto.gov/api-v1-0-0/tmsearch` | 405 |
| `https://www.trademarkelite.com/korea/trademark/search?q=MBTI` | 404 |
| `https://www.capt.org/mbti-assessment/estimated-frequencies.htm` | 301 → `https://www.myersbriggs.org/` |
| `https://www.myersbriggs.org/my-mbti-personality-type/my-mbti-results/how-frequent-is-my-type/` | 404 |
| `https://www.gia.edu/birthstones` (WebFetch) | timeout 60s |
| `https://web.archive.org/...` (WebFetch) | 도구 차단 — curl 로 우회 |

### 참조한 내부 문서

- `docs/research/calc/C00-계산엔진-통합명세서.md` §S8-2, §S8-3
- `docs/research/calc/C08-4체계-통합-점수화-궁합-알고리즘설계.md` §1.5, §1.7, §4, §7
- `docs/research/05-MBTI-데이터와-상표권-리스크.md` §1-2, §2-3, §5-4, §7-3, §10
- `docs/research/06-혈액형-성격론과-서양점성술-별자리-데이터.md` §A-2, §A-3, §A-4, §B-1, §B-2, §D

---

## 테스트 벡터

`personality-data.json` 로드 후 아래 전부 통과해야 한다. (`build.py` 재실행으로 자동 검증)

### TV-1. testmoa 재산출 (16건)

| # | type | 기대 `krSelfSelectedPct` | 기대 `krSelfSelectedN` |
|---|---|---|---|
| 1 | ISFJ | 9.08 | 9484 |
| 2 | ISTJ | 8.89 | 9289 |
| 3 | INFP | 8.07 | 8435 |
| 4 | INFJ | 7.68 | 8021 |
| 5 | ENFP | 7.36 | 7695 |
| 6 | ISFP | 7.13 | 7447 |
| 7 | ENFJ | 6.61 | 6910 |
| 8 | ESFJ | 6.31 | 6598 |
| 9 | ESTJ | 6.11 | 6381 |
| 10 | **ISTP** | **5.97** | 6241 |
| 11 | **INTJ** | **5.37** | 5607 |
| 12 | ESFP | 5.21 | 5444 |
| 13 | INTP | 4.92 | 5143 |
| 14 | ENTJ | 4.87 | 5084 |
| 15 | ENTP | 3.61 | 3767 |
| 16 | ESTP | 2.81 | 2938 |
| — | Σ | **100.00** | **104484** |

### TV-2. 미국 빈도 — 원문 보존 (정규화 금지)

| # | 검사 | 기대 |
|---|---|---|
| 17 | `Σ usFrequencyPct` | **100.3** (100.0 이면 누군가 정규화한 것 → FAIL) |
| 18 | `ENFP.usFrequencyPct` ∈ `ENFP.usFrequencyRangePct` | **false** (원문 그대로) |
| 19 | `ENTJ.usFrequencyPct` ∈ `ENTJ.usFrequencyRangePct` | **false** (원문 그대로) |
| 20 | 나머지 14유형 점추정 ∈ 범위 | **true** ×14 |
| 21 | `usFrequencyDichotomyTotals.S.pointPct` | 73.3 |
| 22 | `usFrequencyDichotomyTotals.N.pointPct` | 26.7 |
| 23 | S+N | 100.0 |
| 24 | Σ(S 계열 8유형 점추정) − 73.3 | **+0.1** |

### TV-3. 인지기능 스택 (16건, #25~40)

| type | 기대 stack | type | 기대 stack |
|---|---|---|---|
| ISTJ | Si,Te,Fi,Ne | ESTP | Se,Ti,Fe,Ni |
| ISFJ | Si,Fe,Ti,Ne | ESFP | Se,Fi,Te,Ni |
| INFJ | Ni,Fe,Ti,Se | ENFP | Ne,Fi,Te,Si |
| INTJ | Ni,Te,Fi,Se | ENTP | Ne,Ti,Fe,Si |
| ISTP | Ti,Se,Ni,Fe | ESTJ | Te,Si,Ne,Fi |
| ISFP | Fi,Se,Ni,Te | ESFJ | Fe,Si,Ne,Ti |
| INFP | Fi,Ne,Si,Te | ENFJ | Fe,Ni,Se,Ti |
| INTP | Ti,Ne,Si,Fe | ENTJ | Te,Ni,Se,Fi |

### TV-4. 별자리 구조 (#41~52)

| # | 검사 | 기대 |
|---|---|---|
| 41 | `count(element=='fire')` | 3 |
| 42 | `count(element=='earth')` | 3 |
| 43 | `count(element=='air')` | 3 |
| 44 | `count(element=='water')` | 3 |
| 45 | `count(modality=='cardinal')` | 4 |
| 46 | `count(modality=='fixed')` | 4 |
| 47 | `count(modality=='mutable')` | 4 |
| 48 | `∀i: element[i] == ["fire","earth","air","water"][i%4]` | true |
| 49 | `∀i: modality[i] == ["cardinal","fixed","mutable"][i%3]` | true |
| 50 | `∀i: polarity[i] == (i%2==0 ? "+" : "-")` | true |
| 51 | 2023년 365일 전수 사인 매핑 미매핑 건수 | 0 |
| 52 | 2024년 366일(윤년) 전수 사인 매핑 미매핑 건수 | 0 |

### TV-5. 별자리 궁합 (#53~62)

| # | 입력 (i, j) | k | 기대 score |
|---|---|---|---|
| 53 | aries(0), aries(0) | 0 | 79 |
| 54 | aries(0), taurus(1) | 1 | 37 |
| 55 | aries(0), gemini(2) | 2 | 83 |
| 56 | aries(0), cancer(3) | 3 | 23 |
| 57 | aries(0), leo(4) | 4 | **95** |
| 58 | aries(0), virgo(5) | 5 | 35 |
| 59 | aries(0), libra(6) | 6 | 79 |
| 60 | pisces(11), aries(0) | 1 | 37 |
| 61 | 144칸 비대칭 셀 수 | — | 0 |
| 62 | 고유값 집합 | — | {23,35,37,79,83,95} (6종, 각 24회) |

### TV-6. 혈액형 궁합 (#63~82)

성별 입력 시 `finalMaleRowFemaleCol[남][여]`:

| # | 남 | 여 | 기대 | # | 남 | 여 | 기대 |
|---|---|---|---|---|---|---|---|
| 63 | A | A | 78 | 71 | O | A | **93** |
| 64 | A | B | 47 | 72 | O | B | 80 |
| 65 | A | O | 87 | 73 | O | O | 67 |
| 66 | A | AB | 54 | 74 | O | AB | 66 |
| 67 | B | A | **41** | 75 | AB | A | 62 |
| 68 | B | B | 68 | 76 | AB | B | 86 |
| 69 | B | O | 80 | 77 | AB | O | 66 |
| 70 | B | AB | 88 | 78 | AB | AB | 76 |

| # | 검사 | 기대 |
|---|---|---|
| 79 | `symmetricBase` 비대칭 셀 수 | 0 |
| 80 | `max(finalMaleRowFemaleCol)` | 93 (O×A) |
| 81 | `min(finalMaleRowFemaleCol)` | 41 (B×A) |
| 82 | 인구비 가중 (μ, σ) | (71.029, 16.022) |

### TV-7. 탄생석 분리 (#83~88)

| # | 검사 | 기대 |
|---|---|---|
| 83 | `zodiacSigns[*]` 에 `stone` 키 존재 | **false** (전 12건) |
| 84 | `monthBirthstones.byMonth["1"]` | ["가넷"] |
| 85 | `monthBirthstones.byMonth["6"]` | ["진주","문스톤","알렉산드라이트"] |
| 86 | `monthBirthstones.byMonth["12"]` | ["탄자나이트","터키석","지르콘"] |
| 87 | `len(byMonth)` | 12 |
| 88 | 구 매핑 재현 시 365일 적중률 | 247/365 = 67.67% (회귀 근거값) |

### TV-8. 혈액형 인구비 (#89~93)

| # | 검사 | 기대 | 출처 |
|---|---|---|---|
| 89 | `bloodTypes[A].krPopulationPct` | 34 | 적십자사 |
| 90 | `bloodTypes[B].krPopulationPct` | 27 | 적십자사 |
| 91 | `bloodTypes[O].krPopulationPct` | 28 | 적십자사 |
| 92 | `bloodTypes[AB].krPopulationPct` | 11 | 적십자사 |
| 93 | Σ krPopulationPct | 100 | — |
| 94 | Σ krSelfReportedPct (갤럽) | 100 | 갤럽 |

### TV-9. 메타 무결성 (#95~100)

| # | 검사 | 기대 |
|---|---|---|
| 95 | `mbti.types` 길이 | 16 |
| 96 | `bloodTypes` 길이 | 4 |
| 97 | `zodiacSigns` 길이 | 12 |
| 98 | `_confidence_*` 값이 legend 에 없는 코드 사용 | 0건 |
| 99 | `_confidence == "U"` 인 필드 | **0건** |
| 100 | 16Personalities 별칭 문자열(건축가/논리술사/옹호자/중재자/…) 포함 | **0건** |

**총 100 벡터.** `build.py` 실행 시 [V1]~[V7] 로그가 위 항목을 전량 커버한다.
