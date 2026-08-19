# S8 궁합 (2인 비교)

근거: `docs/research/calc/C00-계산엔진-통합명세서.md` §S8 · §3-H / `C08` / `C18`
제품 결정: [decisions/0005-compat-blood-and-ecdf.md](./decisions/0005-compat-blood-and-ecdf.md)

---

## 한 줄

`computeCompatibility(chartA, chartB, profileA, profileB)` 는 **결정론 순수함수**다.
같은 두 원국 + 같은 자기신고 값이면 언제 어디서 불러도 같은 점수·같은 등급이 나온다.
시기(대운)를 보지 않고(C00 §3-H10), `Date.now()`·`Math.random()`·`Intl`·로컬 타임존을 쓰지 않는다.

---

## 파이프라인

```
chartA, chartB (S0~S7 결과)          profileA, profileB (MBTI · 혈액형, 둘 다 null 가능)
        │                                     │
        ├── S8-1 사주 100점 ──┐               │
        │    S1 일간 20  S2 일지 20           │
        │    S3 오행 20  S4 용신 15           │
        │    S5 십신 15  S6  띠  10           │
        ├── S8-2 별자리 ──────┤               │
        │    matrix_MB[signA][signB]          │
        │                     ├── MBTI ───────┤  matrix_v3[a][b]  (미입력 → 축 제외)
        │                     └── 혈액형 ─────┘  대칭기저 + 성별보정 (미입력 → 축 제외)
        ▼
  z2p(raw, mu, sd)  = 100 / (1 + exp(−0.82·(raw−mu)/sd))     ※ sd < 1e-9 → 50
  combined          = Σ wᵢ′ · z2p                             ※ 미입력 축은 비례 재분배
  p                 = ecdf(combined, 자기신고조합)             ※ 101분위 그리드, 조합별 4벌
  final             = round(interp(ANCHOR, p))                 ※ 32 ~ 99
  band              = bands.find(final ≥ min)                  ※ S · A+ · A · B+ · B · C+ · C · D
```

**점수·등급은 계산이 만든다.** 문장 생성기(`features/compat`)는 이 결과를 읽기만 하고 숫자를
만들거나 고치지 않는다(C00 §S8-4).

---

## 파일 배치

| 경로 | 역할 |
|---|---|
| `src/shared/data/compat-params.json` | **C18 산출물 원본 그대로**(34,954 B). 한 글자도 고치지 않는다 |
| `src/shared/data/compat-params-ext.json` | C18 이 외부화하지 않고 C08 본문에만 남긴 상수 + 제품 정책 |
| `src/shared/data/compat-calib.json` | 본 구현체로 **실측**한 POP + 조합별 ECDF 그리드 (생성물) |
| `src/shared/data/tools/gen-compat-calib.mjs` | 위 파일 생성기 (고정 시드 · 결정론) |
| `src/shared/data/tools/check-compat-distribution.mjs` | 홀드아웃 분포 검증기 (다른 시드) |
| `src/shared/lib/compat/` | 계산 엔진 (React 없음, 순수함수) |
| `src/features/compat/` | 규칙 기반 리포트 + 상대방 입력 폼 + 결과 표시 |
| `src/pages/CompatPage.tsx` | 조합 계층 — 상대방 입력 → 결과 |

### 세 데이터 파일의 관계

`compat-params.json` 은 **C18 의 산출물이라 손대지 않는다.** 드리프트는
`compat-params-ext.json > sourceFingerprint`(bytes / chars / FNV-1a32)로 잠그고
`shared/lib/compat/params.test.ts` 가 원문을 다시 해싱해 대조한다.
런타임이 더 필요로 하는 값(C08 §3.4 의 `w(chart)` 지장간 가중, S4 조후 정책, 반올림 규칙)은
**전부 `-ext` 쪽**에 있다. 코드에는 계수가 없다.

---

## 배점 (전부 `compat-params.json`)

### 사주 6항목 — 100점

| 코드 | 항목 | 배점 | 산출 | 근거등급 |
|---|---|---|---|---|
| S1 | 일간 합충 | 20 | 룩업 (천간합 20 / 상생 17 / 동오행음양상보 14 / 비화 10 / 상극 8 / 천간충 4) | 순위 **B** · 크기 C |
| S2 | 일지 합충 | 20 | base 10 ± 가감, clamp[0,20] | 순위 **B** · 크기 **B** |
| S3 | 오행 상보성 | 20 | `clamp(8 + improve×22 + fill×2.5, 0, 20)` | D |
| S4 | 용신 충족도 | 15 | `clamp((oneWay(A,B)+oneWay(B,A))×3.6, 0, 15)` | D |
| S5 | 십신 교차 | 15 | 두 방향 십신 룩업의 평균 | C |
| S6 | 띠(년지) | 10 | base 5 ± 가감, clamp[0,10] | **B** |

`S2` 가감은 **성립하는 관계를 전부 더한다.** 원진·해는 독립 적용(子未 −10, C00 §3-H2)이고
巳申 은 육합 +8 · 형 −5 · 파 −2 가 동시에 걸려 11 이다.

> ⚠ **C08 §3.3 의 12×12 표는 산출물 오류다.** 그 표는 최댓값이 19 인데 같은 문서 §3.8 의 시뮬
> 실측은 max 20 이고, TV-01 이 子丑 을 "base10 +육합8 +방합3 → clamp **20**" 이라고 못박았는데
> 표에는 18 로 적혀 있다. 규칙 쪽이 정본이며, 본 구현이 재현한 분포는 C18 §8.1 재실행값과
> 일치한다(S2 mean 10.18 / sd 5.25, C18 10.19 / 5.21). §3.7 의 띠 표도 卯辰(육해)에서 같은
> 성격의 오류가 있다. 근거는 `shared/lib/compat/saju.test.ts` 가 고정한다.

`S4` 의 억부·조후는 **C05-STD 엔진 호출**이다(C00 §S8-1 a-2, §3-H4). C08 §3.5 의 saju-engine
이식판은 폐기됐다. 조후는 `yongsin.tiaohouChars` 의 오행을 쓰되 **이미 `favorable[:3]` 에 있으면
더하지 않는다**(`TIAOHOU_IF_NEW`) — 이중 계상을 막는다. 세 후보(ALWAYS / TIAOHOU_IF_NEW / NEVER)
중 C18 의 S4 분포(9.14 / 2.45)에 가장 가까운 안을 실측으로 골랐다(각각 10.78 / **8.69** / 7.46).

### 별자리 · MBTI · 혈액형

- 별자리 = `matrix_MB`(C18 X1: 양태 항 `same +5 / diff 0`). 자유도는 각거리 7값뿐이다.
  오브(evidenceGrade **A**)는 파라미터에 실려 있지만 **v1 은 발동하지 않는다** — 이산 12×12 를
  쓴다(C00 §3-H14: 오브 연속화는 부호 경계에서 최대 40점 불연속이라 기각).
- MBTI = `matrix_v3`(C18 X3·X4: S/N +6/−4, T/F +6/+3). 최고 95(INFP×INFJ, ENFP×ENFJ) / 최저 25.
- 혈액형 = 대칭 기저 + 성별 보정. **근거 없음이 확정된 축이고, 화면 고지가 조건이다** — [0005](./decisions/0005-compat-blood-and-ecdf.md).

---

## 분포 (실측)

`check-compat-distribution.mjs` — 캘리브레이션과 **다른 시드**로 원국 20,000개를 새로 만들고
100,000쌍을 배포 경로 그대로 통과시킨다.

```
mean 67.73 / sd 13.45 / min 32 / p01 35 / p05 45 / p25 59 / p50 68 / p75 77 / p95 89 / p99 95 / max 99
← C18 §6.3  mean 67.67 / sd 13.51 / min 32 / p01 35 / p05 45 / p25 59 / p50 68 / p75 77 / p95 89 / p99 95 / max 99
```

| 등급 | 실측 | C18 §6.3 | Δ |
|---|---|---|---|
| S 천생연분 | 2.62% | 2.67% | −0.05%p |
| A+ 찰떡궁합 | 8.85% | 8.76% | +0.09%p |
| A 아주 좋은 인연 | 17.70% | 17.50% | +0.20%p |
| B+ 좋은 궁합 | 25.36% | 25.36% | +0.00%p |
| B 무난한 궁합 | 25.04% | 25.36% | −0.32%p |
| C+ 노력이 필요한 사이 | 14.93% | 14.80% | +0.13%p |
| C 조율이 많이 필요 | 5.37% | 4.98% | +0.39%p |
| D 많이 다른 두 사람 | 0.13% | 0.58% | −0.45%p |

60~75 구간 집중도 **41.75%** (C18 41.79%). 30~100 전 구간이 0.8% 이상으로 채워진다.
성능은 **0.035 ms/쌍**(원국 계산 제외)이다.

**한쪽 쏠림이 구조적으로 불가능한 이유**: 최종 점수의 주변분포는 ANCHOR 가 100% 결정한다
(C18 §6.4 분포 불변 정리). 가중치를 바꾸면 바뀌는 것은 분포가 아니라 **순위**다.
단, 그 정리는 `ecdf` 를 그 가중치 조합 자신의 경험분포로 재적합했을 때만 성립한다 — 그래서
그리드가 자기신고 조합마다 4벌이다([0005](./decisions/0005-compat-blood-and-ecdf.md) §2).

---

## 화면

```
결과 화면 ──[궁합 보기]──▶ 상대방 입력 ──▶ 궁합 결과
                                │              └──[다른 사람과 보기]──▶ 상대방 입력
                                └──[내 결과로 돌아가기]──▶ 결과 화면
```

- **첫 사람은 다시 입력받지 않는다.** 온보딩에서 계산해 둔 `Chart` 와 자기신고 값을 그대로 쓴다.
- 상대방 화면에는 **토스 프리필 버튼이 없다.** 그 경로가 채우는 것은 사용자 **본인**의 생년월일이라
  상대방 칸에 넣으면 자기 사주를 두 번 보게 된다(`pages/CompatPage.test.tsx` 가 고정).
- 출생지는 묻지 않고 서울(엔진 기본값, C00 §S0-3)로 둔다. 국내 진태양시 보정 차이는 최대 8분대라
  시주 경계에 걸리지 않는 한 결과가 달라지지 않는다 — 그 사실을 화면이 그대로 밝힌다.
- 궁합 화면은 **지연 청크**다(`CompatPage-*.js`). 결과 화면에 들어온 사람 전부가 궁합을 보는 것은
  아니므로 `compat-params.json`(34.9 kB) + `compat-calib.json`(9.5 kB)의 무게를 한 번 더 미룬다.

### 번들 영향 (실측 — 궁합 진입점을 뺀 빌드와 대조)

| 청크 | 궁합 없음 | 궁합 있음 | Δ gzip |
|---|---|---|---|
| `index` (초기) | 423.40 kB | 423.55 kB | **+0.15 kB** |
| `saju` | 60.20 | 60.21 | +0.01 |
| `ResultPage` | 46.53 | 46.60 | +0.07 |
| `tables` | 17.18 | 17.18 | 0 |
| `CompatPage` | — | **23.76** | 지연 (탭해야 받는다) |

초기 청크 증가분 0.15 kB 는 rolldown 의 동적 import 장부다. 궁합 엔진·배점·리포트·입력 폼은
초기 청크에 **한 글자도 없다** — `천생연분`·`matrix_MB`·`sdZeroRule`·`PartnerForm`·
`buildCompatReport` 전부 `index-*.js` 에서 0회다.

---

## 리포트

`buildCompatReport(result)` — 규칙 기반, LLM 없이 동작한다. 9섹션:
`score · ilju · sipsin · element · tti · zodiac · mbti · blood · advice`.

지식카드를 근거로 인용하고 `usedCards` 로 남긴다. **`blood:면책` 카드가 여기서 처음 도달한다** —
근거 없음을 밝히는 자리에서만 쓸 수 있는 카드라, 혈액형을 배점에 남긴 이 리포트가 그 자리다.

문장 규율(전부 테스트로 고정):

1. **숫자를 지어내지 않는다.** 본문의 `N점` 은 전부 `CompatResult` 에 실재하는 값이다
   (정규식 전수 검사). 배점 스케일조차 "백점 만점" 으로 적어 숫자를 피한다.
2. **금지 표현 0.** 해석 레이어의 `findBannedPhrases()` 를 그대로 재사용한다 — 규칙이 두 벌이면 갈린다.
   특히 `관계 낙인`("안 맞는 사람")이 궁합 문장에서 가장 나오기 쉬운 위반이다.
3. **한자·라틴 문자 뒤에 한글 조사를 붙이지 않는다.** 한자는 `甲(갑)` 표기로 독음을 달아 조사를
   맞추고(`features/compat/josa.ts`), MBTI 는 항상 받침 없는 J/P 로 끝나므로 `는` 만 쓴다.
4. 동성 쌍이면 십신의 성역할 서술(정재=아내 / 정관=남편)을 빼고 **뺐다는 사실을 밝힌다**(C00 §3-H11).

---

## 다시 구워야 하는 때

배점(`compat-params.json`)·정책(`compat-params-ext.json`)·엔진 코드를 하나라도 바꾸면
캘리브레이션이 어긋난다.

```bash
node src/shared/data/tools/gen-compat-calib.mjs --write        # 실측 → compat-calib.json (약 8초)
node src/shared/data/tools/check-compat-distribution.mjs       # 홀드아웃 검증 (다른 시드, 약 12초)
```

두 스크립트는 TS 엔진을 노드에서 그대로 부르려고 `jiti` 를 쓴다. **`package.json` 에 직접
선언돼 있지 않고** `vite`(devDependency)의 직접 의존으로 딸려 온다. 런타임·빌드에는 영향이
없지만, vite 메이저가 바뀌며 jiti 가 빠지면 **이 두 스크립트만** 깨진다. 그때는
`npm i -D jiti` 한 줄로 복구된다.

`COMPAT_ENGINE_VERSION` 은 세 데이터 파일의 버전을 물고 있으므로(`.../p1.0.0+x1.0.0+c1.0.0`)
파일을 다시 구우면 화면 하단 표기도 함께 바뀐다.
