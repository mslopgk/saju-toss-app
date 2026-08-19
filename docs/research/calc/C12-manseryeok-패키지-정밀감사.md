# manseryeok 패키지 정밀 감사 (소스 레벨 + 전수 실측)

> 조사 축: 채택 후보 1순위 정밀검증 | 상태: 완료 | 검증도: 최상(dist 전 파일 Read + 8종 실행 스크립트)
>
> 실행 환경: Windows 11 / node v24.14.1 / npm 11.11.0 / ICU 78.2 (tzdata 2025c) / 2026-08-11
> 실행 디렉터리: `C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab/mansaudit/`
> 스크립트: `a1-options.js` `a2-terms.js` `a2b-rounding.js` `a3-features.js` `a4-luck.js` `a5-bugs.js` `a6-impact.js` `a7b-tz.js` `a8-interaction.js`
> 원본 로그: `a1.out.txt` `a2.out.txt` `a2b.out.txt` `a3.out.txt` `a4.out.txt` `a5.out.txt` `a6.out.txt` `a7b.out.txt` `a8.out.txt`
>
> ⚠️ **`a7-tz-bundle.js` / `a7.out.txt` 는 폐기된 1차 시도다.** 벽시계→offset 역산 시 분(minute)을 비교하지 않아 1912년 이후 전 구간에서 거짓 불일치 28,802건을 냈다. §6.3 의 수치는 전부 수정본 `a7b-tz.js` 결과다.
>
> 선행: C01(표준시) · C02(절기) · C03(4주) · C04(십신/신살) · C05(신강신약) · C06(대운) · C09(라이브러리 bake-off)

---

## 0. 최종 판정

| 기능 | 판정 | 근거 |
|---|---|---|
| 절기 절입 시각 | **채택** (단 §7.5 반올림 이슈 래핑) | KASI 168건 중 164건 분 단위 완전일치, 4건 +1분 |
| 일주(日柱) | **그대로 채택** | 1930~2029 **36,525일 전수** lunar-javascript 일치 (불일치 0) |
| 연주·월주 | **그대로 채택** | 동일 36,525일 전수 일치 (불일치 0), 입춘/절입 경계 분 단위 정확 |
| 시주(時柱) | **그대로 채택** | 동일 36,525일 전수 일치, 오서둔 자기정합 확인 |
| 야자시(`dayBoundary`) | **그대로 채택** | 3관법 전부 구현, 각각 오서둔 자기정합 |
| 한국 표준시 이력·서머타임 | **채택하되 옵션 강제 필요** | IANA tzdata 2025c와 1908-04-01 이후 **100% 일치**. 단 **기본값 OFF** |
| 진태양시(경도·EoT) | **래핑 필요** | 경도 보정이 **일주 경계까지** 이동시킴(§10.3). 시주만 보정하는 유파는 자체 구현 필요 |
| 십신(`getTenGodChart`) | **그대로 채택** | C04 확정표와 천간 100칸 + 지지 120칸 **전수 일치** |
| 공망(`getVoidBranches`) | **부분 채택** | 60갑자 전수 일치. 단 **일주 기준만** 제공 (연주 기준 미제공 — C04 §7-9 기본과 동일) |
| 대운 방향·간지 | **그대로 채택** | 20조합 전수 일치, C06 케이스 A~F 첫 대운 6/6 일치 |
| 대운수(`startAge`) | **래핑 필요** | 유파 **(D) 반올림** 고정. C06 확정 기본은 **(C) 한국식** → §13.3 |
| 음↔양력 변환 | **그대로 채택** | 1391~2100 왕복 2,130건 무결, 설날·추석·윤달 8건 전수 일치 |
| 십이운성·신살·신강신약 | **미제공 → 자체 구현 필수** | 저자가 의도적으로 배제(README "학파마다 갈리는 해석 영역") |

**결론: 부분 채택 + 얇은 래퍼.** 4주·십신·공망·음양력은 그대로 쓰고, 래퍼는 (1) `trueSolarTime`/`dayBoundary` 기본값 강제, (2) 대운수 유파 재계산, (3) 절입 초 단위 재산출 3가지만 담당한다. **자체 천문 구현·자체 절기표는 불필요하다.**

---

## 1. 패키지 메타 (실측)

```
$ npm view manseryeok version license dist.unpackedSize dist.fileCount time.modified time.created main types
version = '2.0.0'
license = 'MIT'
dist.unpackedSize = 127579
dist.fileCount = 38
time.modified = '2026-06-11T03:22:05.437Z'
time.created  = '2025-07-14T14:41:47.281Z'
main = 'dist/index.js'
types = 'dist/index.d.ts'

$ npm view manseryeok versions
[ '1.0.0', '1.0.1', '2.0.0' ]

$ npm view manseryeok dependencies peerDependencies
(둘 다 없음 — 런타임 의존성 0)
```

```
$ curl -s https://api.github.com/repos/yhj1024/manseryeok
{ "stars": 35, "forks": 23, "issues": 9, "pushed": "2026-08-01T00:16:12Z",
  "created": "2025-07-14T09:18:24Z", "license": "MIT", "archived": false, "size": 280 }

$ curl -s .../issues?state=open
#15 [PR] chore(deps): bump actions/setup-node from 4 to 7   | 2026-08-01
#14 [PR] chore(deps): bump github/codeql-action 3 → 4.37.3  | 2026-08-01
#13 [PR] chore(deps-dev): bump prettier 3.6.2 → 3.9.4       | 2026-07-01
#12 [PR] chore(deps-dev): bump @types/node 24.0.13 → 26.0.1 | 2026-07-01
#11 [PR] chore(deps-dev): bump eslint-config-prettier       | 2026-07-01
#10 [PR] chore(deps-dev): bump @typescript-eslint/parser    | 2026-07-01
#9  [PR] chore(deps): bump actions/checkout from 4 to 7     | 2026-07-01
#7  [PR] chore(deps-dev): bump @eslint/js                   | 2026-06-11
#2  [PR] chore(deps): bump pnpm/action-setup from 4 to 6    | 2026-06-11
```

**열린 이슈 9건이 전부 Dependabot PR이다. 버그 리포트 0건.** 마지막 푸시 2026-08-01(감사 시점 10일 전) — 유지보수 활성.

| 항목 | 값 |
|---|---|
| 저자 | Yoohyojun `<hyojun99222@gmail.com>` (yhj1024) |
| 라이선스 | MIT (npm 메타 + GitHub `license.spdx_id` 양쪽 확인) |
| `engines.node` | `>=18` |
| `sideEffects` | `false` (선언은 되어 있으나 CJS라 실효 없음 — §16) |
| `exports` | `"."` 와 `"./package.json"` **2개만** — 서브모듈 직접 import 불가 |
| 빌드 형식 | **CommonJS 단일** (`"use strict"; Object.defineProperty(exports,…)`). ESM 빌드 없음 |
| devDependency | `lunar-javascript ^1.7.7` (**교차검증 및 절기표 생성 전용**, 런타임 미포함) |

---

## 2. dist 파일 구조 전문 (18 모듈, .js 기준 크기)

| 경로 | bytes | 역할 |
|---|---|---|
| `dist/index.js` | 14,254 | 공개 API, 입력 검증, 결과 객체 조립 |
| `dist/astro/solar-terms-data.js` | 14,193 | **1800~2300 절입 보정표** (base64 패킹 12,024문자) |
| `dist/calendar/lunar-data.js` | 9,015 | 음력 16비트 패킹 테이블 (1391~2100, 710년치) |
| `dist/astro/solar-terms.js` | 5,994 | 절기 인덱스/황경 매핑, 사주년·사주월 판정 |
| `dist/calendar/convert.js` | 4,959 | `lunarToSolar` / `solarToLunar` / `isValidSolarDate` |
| `dist/pillars.js` | 4,461 | **4주 산출 핵심** (오호둔·오서둔·60갑자) |
| `dist/features/luck-pillars.js` | 3,926 | 대운 |
| `dist/astro/sun-longitude.js` | 3,785 | Meeus 태양황경 + 균시차 + 뉴턴 반복 |
| `dist/constants.js` | 3,732 | 천간·지지·오행·지장간 본기·일주 앵커 |
| `dist/time/korea-timezone.js` | 3,285 | **한국 표준시 이력 + 서머타임 12구간** |
| `dist/validation.js` | 2,718 | assert 계열 |
| `dist/features/ten-gods.js` | 2,726 | 십신 |
| `dist/time/true-solar-time.js` | 2,418 | **진태양시 환산 (resolveInstant)** |
| `dist/elements.js` | 1,336 | 음양·오행 조회 |
| `dist/ganji.js` | 1,090 | 60갑자 인덱스 산술 |
| `dist/features/void-branches.js` | 962 | 공망 |
| `dist/types.js` | 128 | (빈 CJS 스텁) |
| **합계** | **78,982** | + `.d.ts` 18개 = tarball unpacked 127,579 |

GitHub `src/` 트리(실측, `git/trees/main?recursive=1`)에는 위 17개 `.ts` 원본 + 테스트 3종:

| 테스트 파일 | bytes | 내용 |
|---|---|---|
| `src/index.test.ts` | 28,284 | 단위 테스트 |
| `src/crossvalidation.test.ts` | 4,473 | 6tail 교차검증 + 절입 1800~2300 전수 스윕 |
| `src/golden.test.ts` | 2,167 | **골든 11건** (§18에 전수 수록) |

---

## 3. 공개 export 전수 (30개, 실측)

```
$ node -e "console.log(Object.keys(require('manseryeok')).sort().join(', '))"
DEFAULT_LONGITUDE, EARTHLY_BRANCHES, EARTHLY_BRANCHES_HANJA, FIVE_ELEMENTS,
HEAVENLY_STEMS, HEAVENLY_STEMS_HANJA, LUNAR_MAX_YEAR, LUNAR_MIN_YEAR,
SOLAR_TERM_NAMES, SOLAR_TERM_NAMES_HANJA, TEN_GOD_HANJA, YIN_YANG,
apparentSolarLongitude, calculateFourPillars, equationOfTimeMinutes,
fourPillarsToString, getBranchTenGod, getEarthlyBranchElement,
getEarthlyBranchYinYang, getHeavenlyStemElement, getHeavenlyStemYinYang,
getLuckPillars, getSolarTerm, getSolarTermsOfYear, getTenGod, getTenGodChart,
getVoidBranches, isValidSolarDate, lunarToSolar, solarToLunar
```

상수 실측값: `DEFAULT_LONGITUDE = 127.5` / `LUNAR_MIN_YEAR = 1391` / `LUNAR_MAX_YEAR = 2100`.

**비공개(내부 전용, `exports` 맵이 막고 있음)**: `solarTermInstantMs`, `sajuYearForInstant`, `sajuMonthForInstant`, `solveSolarLongitudeInstant`, `resolveInstant`, `koreaCivilOffsetMin`, `solarTermCorrectionMinutes`, `SOLAR_TERM_DATA_MIN_YEAR/MAX_YEAR`, `computeFourPillars`, `ganjiIndexOf`, `pillarFromGanji`, `DAY_PILLAR_ANCHOR`, `BRANCH_MAIN_STEM`, `MONTH_BRANCHES`.

> `require('manseryeok/dist/astro/solar-terms-data.js')` 는 `ERR_PACKAGE_PATH_NOT_EXPORTED` 로 실패한다. 본 감사에서는 `require('./node_modules/manseryeok/dist/…')` 상대경로로 우회해 내부 상수를 검증했다. **프로덕션에서 내부 모듈에 의존하면 안 된다.**

---

## 4. `calculateFourPillars` 전체 옵션 시그니처 (`dist/types.d.ts` 원문 기준)

```ts
calculateFourPillars(birthInfo: BirthInfo): FourPillarsDetail

interface BirthInfo {
  year: number;                     // 정수. 양력 1800~2300 / 음력 1800~2100
  month: number;                    // 정수 1~12
  day: number;                      // 정수. 양력 1~31(실재 검증) / 음력 1~30
  hour: number;                     // 정수 0~23
  minute: number;                   // 정수 0~59
  isLunar?: boolean;                // 기본 false
  isLeapMonth?: boolean;            // 기본 false (isLunar=true 일 때만 의미)
  trueSolarTime?: {                 // ★ 객체를 넘기는 순간 3개 보정이 한꺼번에 켜진다
    longitude?: number;             //   기본 127.5, 허용 -180~180
    applyEquationOfTime?: boolean;  //   기본 true
    applyHistoricalDst?: boolean;   //   기본 true
  };
  dayBoundary?: 'midnight' | 'jasi' | 'splitJasi';  // 기본 'midnight'
  gender?: 'male' | 'female';       // 지정 시에만 luckPillars 포함
}
```

### 4.1 `trueSolarTime` 의 ON/OFF 이분법 — **가장 중요한 발견**

`dist/time/true-solar-time.js` 원문:

```js
function resolveInstant(year, month, day, hour, minute, options) {
    const wallMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    if (!options) {                                   // ← 옵션 자체를 안 주면
        const instantUTCms = wallMs - 540 * 60000;    //   무조건 UTC+9 고정
        const apparentMs   = instantUTCms + 135 * 4 * 60000;  // = wallMs
        return { instantUTCms, apparentMs };
    }
    const longitude      = options.longitude ?? 127.5;
    const applyEoT       = options.applyEquationOfTime ?? true;
    const applyDst       = options.applyHistoricalDst ?? true;
    const civilOffsetMin = applyDst ? koreaCivilOffsetMin(year, month, day, hour) : 540;
    const instantUTCms   = wallMs - civilOffsetMin * 60000;
    const eotMin         = applyEoT ? equationOfTimeMinutes(instantUTCms) : 0;
    const apparentMs     = instantUTCms + (longitude * 4 + eotMin) * 60000;
    return { instantUTCms, apparentMs };
}
```

| 입력 | `instantUTCms` (연·월주 판정용) | `apparentMs` (일·시주 판정용) |
|---|---|---|
| `trueSolarTime` **미지정** | `wall − 540분` (항상) | `wall` (보정 0) |
| `trueSolarTime: {}` | `wall − koreaCivilOffsetMin(...)` | `instant + (127.5×4 + EoT)분` = `wall − 30분 + EoT` |
| `{longitude:126.978}` | 동일 | `wall − 32.088분 + EoT` |
| `{longitude:135, applyEquationOfTime:false}` | 동일 | `wall`(현대) — **표준시 이력만 적용** |
| `{applyHistoricalDst:false}` | `wall − 540분` | `wall − 30분 + EoT` |

**→ C09 §11.5 의 관찰("기본값에서 경도 보정 미적용")은 정확했다. 원인은 `if (!options)` 얼리 리턴이다.**
**→ 한국 표준시 이력·서머타임도 `trueSolarTime` 객체를 넘겨야만 켜진다. 기본값에서는 1954~1961 UTC+8:30 도, 1948~88 서머타임도 전혀 반영되지 않는다.**

실측 (`a1-options.js`, 2024-02-04 17:00 KST):

```
옵션 없음(기본)                  癸卯 乙丑 戊戌 辛酉    ← 酉시(17-19)
trueSolarTime:{} (전부 기본)     癸卯 乙丑 戊戌 庚申    ← 17:00 −30분 −13.83분(EoT) = 16:16 → 申시
longitude=126.978(서울)         癸卯 乙丑 戊戌 庚申
longitude=129.075(부산)         癸卯 乙丑 戊戌 庚申
longitude=135(보정무효)          癸卯 乙丑 戊戌 庚申    ← EoT −13.83분만으로도 申시로 넘어감
EoT off, lon=127.5              癸卯 乙丑 戊戌 庚申    ← 16:30 → 申시
```

### 4.2 시진 경계가 경도에 따라 이동하는 실측 (2024-06-15 분단위 스캔)

| 옵션 | 子→丑 | 丑→寅 | … 이하 모든 경계 |
|---|---|---|---|
| 보정 없음 | 01:00 | 03:00 | 정각 |
| `longitude:127.5` | 01:31 | 03:31 | **+31분** |
| `longitude:126.978` (서울) | 01:33 | 03:33 | **+33분** |
| `longitude:129.075` (부산) | 01:25 | 03:25 | **+25분** |

경도 보정량 = `(longitude − 135) × 4분`. 127.5 → −30분 / 126.978 → −32.088분 / 129.075 → −23.7분. 여기에 EoT(당일 −0.9분)가 더해져 위 값이 된다.

### 4.3 균시차(EoT) 실측값 (`equationOfTimeMinutes`, Meeus 28.3)

| 날짜(2024) | EoT (분) |
|---|---|
| 02-04 | **−13.831** |
| 02-11 | **−14.225** (연중 최저 부근) |
| 05-15 | +3.631 |
| 07-26 | −6.556 |
| 11-03 | **+16.488** (연중 최고 부근) |
| 12-25 | −0.118 |

---

## 5. 시각 정규화 파이프라인 (수식 전문)

```
wallMs      = Date.UTC(y, mo-1, d, h, mi)                    // 벽시계를 UTC 눈금에 그대로 얹음
civilOffset = koreaCivilOffsetMin(y, mo, d, h)               // 분. §6 표
instantUTC  = wallMs − civilOffset × 60000                   // 절대 순간
eot         = equationOfTimeMinutes(instantUTC)              // 분
apparentMs  = instantUTC + (longitude × 4 + eot) × 60000     // 지방 진태양시

연주 = f(instantUTC, 입춘 절입 순간)
월주 = f(instantUTC, 직전 節 절입 순간)
일주 = f(apparentMs 의 UTC 날짜, dayBoundary)
시주 = f(일간, apparentMs 의 UTC 시각)
```

**설계 요점**: 연·월주는 절대 순간(`instantUTC`), 일·시주는 지방 진태양시(`apparentMs`) — 서로 다른 시계를 쓴다. C09 §4가 지적한 "입력 −1시간 시프트" 오염 문제를 구조적으로 회피한 올바른 설계다.

**1954~1961 구간의 수학적 우연**: 그 시기 표준시가 이미 동경 127.5° 기준(+510분)이었으므로,
`apparentMs = wall − 510 + 510 + eot = wall + eot` 가 되어 **경도 보정이 상쇄된다.** 즉 그 시기 출생자에게는 진태양시 보정을 켜도 시주가 EoT(±16분)만큼만 움직인다. 이것은 버그가 아니라 물리적으로 옳은 결과다.

---

## 6. 한국 표준시 이력 + 서머타임 (`dist/time/korea-timezone.js` 상수표 전문)

### 6.1 표준시 전이 (`STANDARD_EPOCHS`, 원문 4행 전부)

| 발효 벽시계 | offset(분) | 기준 자오선 |
|---|---|---|
| (1908-04-01 이전) | 540 | fallback |
| 1908-04-01 | **510** (UTC+8:30) | 127.5° |
| 1912-01-01 | **540** (UTC+9:00) | 135° |
| 1954-03-21 | **510** (UTC+8:30) | 127.5° |
| 1961-08-10 | **540** (UTC+9:00) | 135° |

### 6.2 서머타임 (`DST_INTERVALS`, 원문 12구간 전부 — 벽시계 기준 `[start, end)`)

| # | 시작 | 종료 | 기저 표준시 | DST 총 offset |
|---|---|---|---|---|
| 1 | 1948-06-01 00시 | 1948-09-13 00시 | +540 | **600** |
| 2 | 1949-04-03 00시 | 1949-09-11 00시 | +540 | **600** |
| 3 | 1950-04-01 00시 | 1950-09-10 00시 | +540 | **600** |
| 4 | 1951-05-06 00시 | 1951-09-09 00시 | +540 | **600** |
| 5 | 1955-05-05 00시 | 1955-09-09 00시 | +510 | **570** |
| 6 | 1956-05-20 00시 | 1956-09-30 00시 | +510 | **570** |
| 7 | 1957-05-05 00시 | 1957-09-22 00시 | +510 | **570** |
| 8 | 1958-05-04 00시 | 1958-09-21 00시 | +510 | **570** |
| 9 | 1959-05-03 00시 | 1959-09-20 00시 | +510 | **570** |
| 10 | 1960-05-01 00시 | 1960-09-18 00시 | +510 | **570** |
| 11 | 1987-05-10 **02시** | 1987-10-11 **03시** | +540 | **600** |
| 12 | 1988-05-08 **02시** | 1988-10-09 **03시** | +540 | **600** |

> C01 §2 가 경고한 "1955~1960 은 +9:30 이지 +10:00 이 아니다" 함정을 **정확히 처리하고 있다**(570분). 구현은 `koreaCivilOffsetMin = standardOffsetMin(...) + (isDst ? 60 : 0)` 이라, 기저 표준시가 자동으로 반영된다.

### 6.3 Node ICU(IANA tzdata **2025c**) 와 전수 대조 (`a7b-tz.js`)

ICU가 실제로 갖고 있는 전이점을 이분탐색으로 뽑아 manseryeok 판정과 맞춘 결과:

| ICU 전이 시각(UTC) | offset 변화 | manseryeok 판정 | 결과 |
|---|---|---|---|
| 1908-03-31T15:33Z | 507 → 510 | 510 | ✅ |
| 1911-12-31T15:30Z | 510 → 540 | 540 | ✅ |
| 1948-05-31T15:00Z | 540 → 600 | 600 | ✅ |
| 1948-09-12T14:00Z | 600 → 540 | 600(첫 발생 채택) | ✅ 오버랩 |
| 1949-04-02T15:00Z | 540 → 600 | 600 | ✅ |
| 1949-09-10T14:00Z | 600 → 540 | 600(첫 발생) | ✅ 오버랩 |
| 1950-03-31T15:00Z | 540 → 600 | 600 | ✅ |
| 1950-09-09T14:00Z | 600 → 540 | 600(첫 발생) | ✅ 오버랩 |
| 1951-05-05T15:00Z | 540 → 600 | 600 | ✅ |
| 1951-09-08T14:00Z | 600 → 540 | 600(첫 발생) | ✅ 오버랩 |
| **1954-03-20T15:00Z** | 540 → 510 | 03-20 은 540, 03-21 은 510 | ⚠ **§6.4** |
| 1955-05-04T15:30Z | 510 → 570 | 570 | ✅ |
| 1955-09-08T14:30Z | 570 → 510 | 570(첫 발생) | ✅ 오버랩 |
| 1956-05-19T15:30Z | 510 → 570 | 570 | ✅ |
| 1956-09-29T14:30Z | 570 → 510 | 570(첫 발생) | ✅ 오버랩 |
| 1957-05-04T15:30Z | 510 → 570 | 570 | ✅ |
| 1957-09-21T14:30Z | 570 → 510 | 570(첫 발생) | ✅ 오버랩 |
| 1958-05-03T15:30Z | 510 → 570 | 570 | ✅ |
| 1958-09-20T14:30Z | 570 → 510 | 570(첫 발생) | ✅ 오버랩 |
| 1959-05-02T15:30Z | 510 → 570 | 570 | ✅ |
| 1959-09-19T14:30Z | 570 → 510 | 570(첫 발생) | ✅ 오버랩 |
| 1960-04-30T15:30Z | 510 → 570 | 570 | ✅ |
| 1960-09-17T14:30Z | 570 → 510 | 570(첫 발생) | ✅ 오버랩 |
| 1961-08-09T15:30Z | 510 → 540 | 540 | ✅ |
| 1987-05-09T17:00Z | 540 → 600 | 600 | ✅ |
| 1987-10-10T17:00Z | 600 → 540 | 02:xx 는 600(첫 발생), 03:00~ 는 540 | ✅ |
| 1988-05-07T17:00Z | 540 → 600 | 600 | ✅ |
| 1988-10-08T17:00Z | 600 → 540 | 02:xx 는 600(첫 발생), 03:00~ 는 540 | ✅ |

전수 대조 (1900-01-01 ~ 1995-12-31 매일 12:00 벽시계, 35,063일):

```
35063일 대조 | 불일치 3012건 (8.590%)
   1900-01-01 12:00 manseryeok=540 ICU후보=[507]
   … (1900-01-01 ~ 1908-03-31 전부 동일 사유)
```

**불일치 3,012건 = 1900-01-01 ~ 1908-03-31 정확히 그 구간뿐.** ICU는 그 이전을 서울 LMT(+8:27:52 → 분 절사 507)로 잡고, manseryeok은 +540 fallback으로 잡는다. **1908-04-01 이후는 32,051일 전수 100% 일치.** README에 "1908년 이전은 KST로 간주" 라고 명시되어 있어 문서화된 동작이다.

### 6.4 ⚠️유파차이 / 자료차이 — 1954-03-21 전이 시각

| 자료 | 전이 순간 | 벽시계 서술 |
|---|---|---|
| C01 §1.2 (대통령령 제876호) | 1954-03-20T**15:30**Z | 1954-03-21 00:30 (+9) → 00:00 (+8:30) |
| IANA tzdata 2025c (실측) | 1954-03-20T**15:00**Z | 1954-03-21 00:00 (+9) → 1954-03-20 23:30 (+8:30) |
| manseryeok (일 단위 테이블) | 1954-03-21 00:00 벽시계부터 510 | 1954-03-20 전체 540, 03-21 전체 510 |

**세 자료가 30분씩 어긋난다.** 실무 영향은 1954-03-20 23:30~23:59 (또는 03-21 00:00~00:29) 라는 **하루 30분 창**에 국한된다. 동일 성격의 갭/오버랩:

| 날짜 | ICU 상태 | manseryeok |
|---|---|---|
| 1912-01-01 00:00~00:29 | **부존재(갭)** | 540 반환 (예외 없음) |
| 1961-08-10 00:00~00:29 | **부존재(갭)** | 540 반환 (예외 없음) |
| 1987-05-10 02:00~02:59 | **부존재(갭)** | 600 반환 |
| 1988-05-08 02:00~02:59 | **부존재(갭)** | 600 반환 |
| 1987-10-11 02:00~02:59 | 중복(540/600) | **600**(첫 발생) |
| 1988-10-09 02:00~02:59 | 중복(540/600) | **600**(첫 발생) |

manseryeok은 존재하지 않는 벽시계를 던지지 않고 조용히 해석한다. **입력 UI 단에서 이 6개 창을 경고/차단하는 것은 래퍼 책임이다.**

### 6.5 기본값(보정 OFF)을 쓰면 얼마나 틀리나 — 전수 정량 (`a6-impact.js`)

`옵션 없음` vs `trueSolarTime:{longitude:135, applyEquationOfTime:false}` (= 표준시 이력·서머타임만 적용) 비교. 각 구간 매일 매시 정각.

| 구간 | 스캔 | 연주 차이 | 월주 차이 | 일주 차이 | 시주 차이 |
|---|---|---|---|---|---|
| 1948-1951 서머타임 | 35,064 | 0 | 21 | 553 | **7,189 (20.50%)** |
| 1954-1961 UTC+8:30 | 70,128 | **4** | 48 | 820 | **10,660 (15.20%)** |
| 1955-1960 (+8:30 & DST) | 52,608 | 3 | 42 | 820 | **10,660 (20.26%)** |
| 1987-1988 서머타임 | 17,544 | 0 | 10 | 308 | **4,004 (22.82%)** |
| 1970-1980 (대조군) | 96,432 | 0 | 0 | 0 | **0 (0.00%)** |

월주가 갈리는 실제 사례:

```
M 1948-6-6  5시 KST고정=戊午 IANA보정=丁巳
M 1948-7-7 15시 KST고정=己未 IANA보정=戊午
M 1949-4-5 12시 KST고정=戊辰 IANA보정=丁卯
M 1950-4-5 18시 KST고정=庚辰 IANA보정=己卯
```

**→ 1948~1988 해당 구간 출생자의 15~23%가 기본 옵션에서 시주를 잘못 받는다.** 프로덕션에서 `trueSolarTime` 미지정은 선택지가 아니다.

---

## 7. 절기(節氣) — 알고리즘·정밀도·KASI 대조

### 7.1 산출 방식 (`dist/astro/solar-terms.js` + `solar-terms-data.js`)

**하이브리드다. 순수 사전계산 테이블도, 순수 런타임 천문계산도 아니다.**

```js
function solarTermInstantMs(year, index) {
    const target  = (285 + 15 * index) % 360;                 // 목표 황경
    const month   = Math.floor(index / 2);                    // 초기 추정 월(0-indexed)
    const guessMs = Date.UTC(year, month, 15, 0, 0, 0);       // 그 달 15일을 시드로
    const meeusMin = Math.round(solveSolarLongitudeInstant(target, guessMs) / 60000);
    const instantMs = (meeusMin + solarTermCorrectionMinutes(year, index)) * 60000;
    SOLAR_TERM_CACHE.set(year * 24 + index, instantMs);       // 메모이즈
    return instantMs;
}
```

1. **런타임**: Jean Meeus *Astronomical Algorithms* 2판 저정밀 태양 위치식으로 황경 계산 (`solarElements`: L0/M/e/C/ε, 장동·광행차 근사 `−0.00569 − 0.00478·sin Ω`), 뉴턴식 반복 **최대 8회**, 수렴 임계 `1e-7°`, 속도 상수 `360/365.2422 °/day`.
2. **분 단위로 반올림** → `meeusMin`.
3. **보정표**: 1800~2300 각 (연,절기)마다 −31~+32분 보정을 base64 1글자로 패킹한 12,024문자 문자열에서 조회해 더한다.
4. 범위 밖(연도 100~1799, 2301~9999)은 보정 0 = **Meeus 단독 폴백**.

### 7.2 보정표 실측 통계 (1800~2300 전수 12,024건)

```
보정값 범위 −18 ~ +13 분  (패킹 표현 한계 −31..+32, 한계 도달 0건)
히스토그램 분:건수 →
-18:3  -17:4  -16:10  -15:18  -14:50  -13:74  -12:107  -11:146  -10:193
 -9:258  -8:335  -7:419  -6:505  -5:574  -4:679  -3:705  -2:805  -1:871
  0:899   1:873   2:859   3:835   4:676   5:636   6:521   7:379   8:255
  9:152  10:88  11:57  12:28  13:10
```

**→ Meeus 저정밀식 단독의 오차는 최대 18분.** 보정표 없이는 절입 경계 판정이 불가능하다. 포화(±한계) 0건 → 패킹 손실 없음.

### 7.3 보정표 밖 폴백 오차 실측

| 연도 | manseryeok 입춘 (UTC) | lunar-javascript(천문) | Δ |
|---|---|---|---|
| 1750 | 1750-02-03T20:11:00Z | 1750-02-03T20:17:35Z | **−6.58분** |
| 1799 | 1799-02-03T17:48:00Z | 1799-02-03T17:55:34Z | **−7.57분** |
| 2301 | 2301-02-04T13:56:00Z | 2301-02-04T13:51:36Z | **+4.40분** |
| 2350 | 2350-02-04T11:13:00Z | 2350-02-04T10:58:22Z | **+14.63분** |
| 2400 | 2400-02-04T14:24:00Z | 2400-02-04T14:02:37Z | **+21.38분** |

`getSolarTerm` 자체는 연도 **100~9999** 를 허용한다(`SOLAR_TERM_MIN_YEAR=100`, `MAX=9999`). 밖은 `RangeError: 절기 연도(year)은 100~9999 범위여야 합니다`.

### 7.4 절기 인덱스 → 황경 → 월 매핑 전문 (24행)

| idx | 이름 | 한자 | 목표황경 | 節/中 | 사주 월번호 | 초기추정 월 |
|---|---|---|---|---|---|---|
| 0 | 소한 | 小寒 | 285° | **節** | 12 (축월) | 1월 |
| 1 | 대한 | 大寒 | 300° | 中 | — | 1월 |
| 2 | 입춘 | 立春 | 315° | **節** | 1 (인월) | 2월 |
| 3 | 우수 | 雨水 | 330° | 中 | — | 2월 |
| 4 | 경칩 | 驚蟄 | 345° | **節** | 2 (묘월) | 3월 |
| 5 | 춘분 | 春分 | 0° | 中 | — | 3월 |
| 6 | 청명 | 淸明 | 15° | **節** | 3 (진월) | 4월 |
| 7 | 곡우 | 穀雨 | 30° | 中 | — | 4월 |
| 8 | 입하 | 立夏 | 45° | **節** | 4 (사월) | 5월 |
| 9 | 소만 | 小滿 | 60° | 中 | — | 5월 |
| 10 | 망종 | 芒種 | 75° | **節** | 5 (오월) | 6월 |
| 11 | 하지 | 夏至 | 90° | 中 | — | 6월 |
| 12 | 소서 | 小暑 | 105° | **節** | 6 (미월) | 7월 |
| 13 | 대서 | 大暑 | 120° | 中 | — | 7월 |
| 14 | 입추 | 立秋 | 135° | **節** | 7 (신월) | 8월 |
| 15 | 처서 | 處暑 | 150° | 中 | — | 8월 |
| 16 | 백로 | 白露 | 165° | **節** | 8 (유월) | 9월 |
| 17 | 추분 | 秋分 | 180° | 中 | — | 9월 |
| 18 | 한로 | 寒露 | 195° | **節** | 9 (술월) | 10월 |
| 19 | 상강 | 霜降 | 210° | 中 | — | 10월 |
| 20 | 입동 | 立冬 | 225° | **節** | 10 (해월) | 11월 |
| 21 | 소설 | 小雪 | 240° | 中 | — | 11월 |
| 22 | 대설 | 大雪 | 255° | **節** | 11 (자월) | 12월 |
| 23 | 동지 | 冬至 | 270° | 中 | — | 12월 |

한자 표기는 **한국/번체**(`驚蟄`, `穀雨`, `處暑`, `淸明`, `小滿`)를 쓴다 — C09 §1이 지적한 lunar-javascript의 간체자 함정(`惊蛰`, `谷雨`)이 없다.

### 7.5 🔴 KASI 공표값 전수 대조 — README 주장 정정

2020~2026 × 24절기 = **168건**을 KASI 유래 데이터셋(`distbe/holidays`)과 대조:

```
총 168건 중 분 단위 완전일치 163건 (97.02%)
```

불일치 5건의 정체:

| 연 | 절기 | idx | 節/中 | manseryeok (KST) | 데이터셋 (KST) | Δ | 판정 |
|---|---|---|---|---|---|---|---|
| 2020 | 춘분 | 5 | 中 | 2020-03-20 **12:50** | 2020-03-20 **03:20** | 570분 | **데이터셋 오류**(§7.6) |
| 2020 | 대설 | 22 | **節** | 2020-12-07 **01:10** | 2020-12-07 01:09 | **+1분** | manseryeok 반올림 |
| 2022 | 입동 | 20 | **節** | 2022-11-07 **19:46** | 2022-11-07 19:45 | **+1분** | manseryeok 반올림 |
| 2022 | 소설 | 21 | 中 | 2022-11-22 **17:21** | 2022-11-22 17:20 | **+1분** | manseryeok 반올림 |
| 2024 | 소설 | 21 | 中 | 2024-11-22 **04:57** | 2024-11-22 04:56 | **+1분** | manseryeok 반올림 |

**→ 실질 불일치는 4건(2.38%). 그중 월주에 영향을 주는 節은 2020 대설·2022 입동 2건.**

원인은 소스에서 확정된다. `tools/gen-solar-terms.mjs` 원문:

```js
function trueTermMinutes(y) {
  ...
  .map((s) => Date.UTC(s.getYear(), s.getMonth()-1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond()) - BEIJING_OFFSET_MS)
  ...
  return inYear.map((ms) => Math.round(ms / 60000));   // ★ 초를 반올림
}
```

**보정표 생성 시 초를 `Math.round` 한다. KASI 공표 시각은 초 절사(floor)다.** 실측으로 확인:

```
표본 168건 | floor(초 버림) 일치 85 | round(초 반올림) 일치 161 | 둘 다 아님 7(동지 인덱싱 아티팩트)
```

위 4건의 lunar-javascript 초값은 각각 **30, 30, 30, 31초** — 정확히 반올림 경계에 걸린 값이다.

> **README/CHANGELOG 의 "KASI와 분 단위 일치" 는 과장이다.** 실제 검증 기준은 6tail/lunar-javascript 이며(`src/crossvalidation.test.ts` 는 `Math.abs(oursMin − theirsMinutes[i]) <= 1` 를 통과 조건으로 삼는다), KASI 원본과의 직접 대조는 상류에 없다. 본 감사가 최초의 KASI 직접 대조다.

### 7.6 🔴 C02 정정 — `distbe/holidays` 2020 춘분 데이터 오류

```
$ node -e "for (const y of [2020..2026]) print(kasi[y].filter(e=>e.name==='춘분'))"
2020 [{"date":"2020-03-20","time":"03:20","sunLng":null}]   ← 오류
2021 [{"date":"2021-03-20","time":"18:37"}]   ✅ (천문값 09:37Z + 9h)
2022 [{"date":"2022-03-21","time":"00:33"}]   ✅
2023 [{"date":"2023-03-21","time":"06:24"}]   ✅
2024 [{"date":"2024-03-20","time":"12:06"}]   ✅
2025 [{"date":"2025-03-20","time":"18:01"}]   ✅
2026 [{"date":"2026-03-20","time":"23:46"}]   ✅
```

2020 춘분의 천문학적 값은 2020-03-20T03:49:3xZ = **KST 12:49~12:50**. 데이터셋의 `03:20` 은 근거 없는 값이다. **C02가 이 데이터셋을 KASI 정본으로 인용했다면 해당 항목은 무효다.** 또한 이 데이터셋의 `sunLng` 필드는 2021·2023·2025·2026 전체가 `null` 이므로 황경 검증에 쓸 수 없다.

### 7.7 lunar-javascript 60분 차이의 진짜 원인 — C09 §3 보강

```
2024 입춘 | lunar-js 문자열 2024-02-04 16:27:07 | CST로 해석한 UTC 2024-02-04T08:27:07Z | manseryeok UTC 2024-02-04T08:27:00Z | Δ=7초
2025 입춘 | lunar-js 문자열 2025-02-03 22:10:28 | CST로 해석한 UTC 2025-02-03T14:10:28Z | manseryeok UTC 2025-02-03T14:10:00Z | Δ=28초
2026 입춘 | lunar-js 문자열 2026-02-04 04:02:08 | CST로 해석한 UTC 2026-02-03T20:02:08Z | manseryeok UTC 2026-02-03T20:02:00Z | Δ=8초
```

**lunar-javascript 의 천문 계산 자체는 정확하다. 문제는 반환 문자열이 CST(UTC+8) 벽시계라는 점뿐이다.** 실제로 manseryeok의 보정표는 lunar-javascript 값을 CST→UTC 환산해 만들어졌다(생성기 원문의 `- BEIJING_OFFSET_MS`). C09 §3의 "lunar-javascript 는 동경 120° 기준으로 절기를 산출" 이라는 서술은 **결과적으로 맞지만 원인 진단이 틀렸다** — 산출은 절대 순간이고, 표기만 CST다. 두 라이브러리의 절기는 **동일한 천문 계산의 초 절사/반올림 차이(≤59초)** 만 다르다.

---

## 8. 일주 앵커·60갑자 산술 (상수 실측)

```js
// dist/constants.js
exports.DAY_PILLAR_ANCHOR = { year: 1992, month: 10, day: 24, ganjiIndex: 9 };  // 계유(癸酉)

// dist/pillars.js
function ganjiIndexForDate(year, month, day) {
    const anchorMs = Date.UTC(1992, 9, 24);
    const targetMs = Date.UTC(year, month - 1, day);
    const daysDiff = Math.round((targetMs - anchorMs) / 86400000);
    return mod(9 + daysDiff, 60);
}

// dist/ganji.js
function ganjiIndexOf(stemIndex, branchIndex) {         // 역함수
    if ((stemIndex - branchIndex) % 2 !== 0) throw new RangeError(...);   // 갑축 등 거부
    return (((6 * stemIndex - 5 * branchIndex) % 60) + 60) % 60;
}
function pillarFromGanji(g) { return { heavenlyStem: HEAVENLY_STEMS[g % 10], earthlyBranch: EARTHLY_BRANCHES[g % 12] }; }
```

**JDN 오프셋을 쓰지 않는다.** 그레고리력 소급(proleptic) `Date.UTC` 밀리초 차이를 86400000으로 나눈 정수 일수 + 앵커 인덱스 9. 앵커 = **1992-10-24 = 계유일(index 9)**.

전수 검증 (`a3-features.js`):

```
1930-01-01 ~ 2029-12-31 총 36525일 | 일주 불일치 0건   (vs lunar-javascript getDayInGanZhi)
```

동일 36,525일에 대해 연·월·시주도 전수 대조 (lunar-javascript 에 KST−1h = CST 벽시계를 투입, `setSect(2)`):

```
총 36525일 (매일 12:00) | 연주 불일치 0 | 월주 불일치 0 | 시주 불일치 0
```

---

## 9. 4주 산출 공식 전문 (`dist/pillars.js`)

### 9.1 연주

```js
sajuYear = (instantUTC < 입춘(calendarYear)) ? calendarYear - 1 : calendarYear
연간 = HEAVENLY_STEMS[(sajuYear - 4) mod 10]
연지 = EARTHLY_BRANCHES[(sajuYear - 4) mod 12]
```

> `calendarYear` 는 **입력된 양력 연도**(음력 입력이면 변환 후 양력 연도)다. `instantUTC` 의 연도가 아니다. 연말/연초 교차 검증 결과 모든 경우에 정답(§15 A5-9). 이유: `instantUTC` 는 항상 `wall` 보다 **이르므로** 연도가 커지는 방향으로 넘어갈 수 없다.

### 9.2 월주 (오호둔 五虎遁)

```js
monthNumber = (직전 節 의 JEOL_TO_MONTH 값)        // 1=인월 … 12=축월
yearStem    = (sajuYear - 4) mod 10
monthStemIndex = (yearStem % 5 * 2 + monthNumber + 1) % 10
```

전개 검증 (인월 기준, 전 10행):

| 연간 | 인월 | 묘월 | 진월 | 사월 | 오월 | 미월 | 신월 | 유월 | 술월 | 해월 | 자월 | 축월 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 甲·己 | 丙寅 | 丁卯 | 戊辰 | 己巳 | 庚午 | 辛未 | 壬申 | 癸酉 | 甲戌 | 乙亥 | 丙子 | 丁丑 |
| 乙·庚 | 戊寅 | 己卯 | 庚辰 | 辛巳 | 壬午 | 癸未 | 甲申 | 乙酉 | 丙戌 | 丁亥 | 戊子 | 己丑 |
| 丙·辛 | 庚寅 | 辛卯 | 壬辰 | 癸巳 | 甲午 | 乙未 | 丙申 | 丁酉 | 戊戌 | 己亥 | 庚子 | 辛丑 |
| 丁·壬 | 壬寅 | 癸卯 | 甲辰 | 乙巳 | 丙午 | 丁未 | 戊申 | 己酉 | 庚戌 | 辛亥 | 壬子 | 癸丑 |
| 戊·癸 | 甲寅 | 乙卯 | 丙辰 | 丁巳 | 戊午 | 己未 | 庚申 | 辛酉 | 壬戌 | 癸亥 | 甲子 | 乙丑 |

`sajuMonthForInstant` 는 연 경계를 넘는 節(소한·대설)을 잡기 위해 **`year-1, year, year+1` 3개 연도 × 12개 節 = 36개 후보**를 전부 계산해 `boundary <= instantMs` 중 최댓값을 고른다. 폴백 기본값은 12(축월).

### 9.3 일주

```js
d          = new Date(apparentMs)
baseGanji  = ganjiIndexForDate(d.getUTCFullYear(), d.getUTCMonth()+1, d.getUTCDate())
isLateZi   = d.getUTCHours() >= 23
nextGanji  = (baseGanji + 1) % 60
dayGanji      = baseGanji;  hourStemGanji = baseGanji;
if (isLateZi) {
  if (dayBoundary === 'jasi')      { dayGanji = nextGanji; hourStemGanji = nextGanji; }
  else if (dayBoundary === 'splitJasi') {                  hourStemGanji = nextGanji; }
}
```

### 9.4 시주 (오서둔 五鼠遁)

```js
shichen        = Math.floor(((apparent의 분 + 60) % 1440) / 120)   // 0=자 … 11=해
hourStemBase   = (dayStemIndex % 5) * 2
hourStemIndex  = (hourStemBase + shichen) % 10
```

| 일간 | 자시 | 축시 | 인시 | 묘시 | 진시 | 사시 | 오시 | 미시 | 신시 | 유시 | 술시 | 해시 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 甲·己 | 甲子 | 乙丑 | 丙寅 | 丁卯 | 戊辰 | 己巳 | 庚午 | 辛未 | 壬申 | 癸酉 | 甲戌 | 乙亥 |
| 乙·庚 | 丙子 | 丁丑 | 戊寅 | 己卯 | 庚辰 | 辛巳 | 壬午 | 癸未 | 甲申 | 乙酉 | 丙戌 | 丁亥 |
| 丙·辛 | 戊子 | 己丑 | 庚寅 | 辛卯 | 壬辰 | 癸巳 | 甲午 | 乙未 | 丙申 | 丁酉 | 戊戌 | 己亥 |
| 丁·壬 | 庚子 | 辛丑 | 壬寅 | 癸卯 | 甲辰 | 乙巳 | 丙午 | 丁未 | 戊申 | 己酉 | 庚戌 | 辛亥 |
| 戊·癸 | 壬子 | 癸丑 | 甲寅 | 乙卯 | 丙辰 | 丁巳 | 戊午 | 己未 | 庚申 | 辛酉 | 壬戌 | 癸亥 |

시진 경계는 **23:00, 01:00, 03:00, …, 21:00** (12시진 각 120분, 자시가 23:00 시작).

---

## 10. 야자시 3관법 (`dayBoundary`)

### 10.1 실측 대조표

| 입력(KST) | `midnight`(기본) | `jasi` | `splitJasi` |
|---|---|---|---|
| 1990-05-05 23:30 | 庚午 庚辰 **庚午 丙子** | 庚午 庚辰 **辛未 戊子** | 庚午 庚辰 **庚午 戊子** |
| 2025-02-03 23:20 | 乙巳 戊寅 **癸卯 壬子** | 乙巳 戊寅 **甲辰 甲子** | 乙巳 戊寅 **癸卯 甲子** |
| 2010-12-31 23:59 | 庚寅 戊子 **乙卯 丙子** | 庚寅 戊子 **丙辰 戊子** | 庚寅 戊子 **乙卯 戊子** |
| 1985-02-03 23:50 | 甲子 丁丑 **癸酉 壬子** | 甲子 丁丑 **甲戌 甲子** | 甲子 丁丑 **癸酉 甲子** |
| 2024-03-10 23:30 | 甲辰 丁卯 **癸酉 壬子** | 甲辰 丁卯 **甲戌 甲子** | 甲辰 丁卯 **癸酉 甲子** |
| 2000-01-01 00:00 | 己卯 丙子 戊午 壬子 | 己卯 丙子 戊午 壬子 | 己卯 丙子 戊午 壬子 |

### 10.2 유파 매핑과 자기정합성

| `dayBoundary` | C03 분류 | 일주 | 시주 천간 기준 | 오서둔 자기정합 |
|---|---|---|---|---|
| `midnight` (기본) | **(a) 당일 유지** — 한국 주류 | 당일 | 당일 일간 | ✅ |
| `jasi` | (b) 자초환일 | 익일 | 익일 일간 | ✅ |
| `splitJasi` | **(c) yajasi-nextstem** — lunar-javascript `sect=2` 와 동일 | 당일 | 익일 일간 | ❌ (설계상) |

자기정합 실측:

```
TC01 1990-5-5 23:30 → 庚午 庚辰 庚午 丙子 | 일간=경 → 오서둔 자시 천간=병 | 실제=병 ✅
TC10 2025-2-3 23:20 → 乙巳 戊寅 癸卯 壬子 | 일간=계 → 오서둔 자시 천간=임 | 실제=임 ✅
```

**C09 §11.3 의 결론 재확인**: 기본값 `midnight` 이 C03 확정 한국 주류(a)와 일치하며, `splitJasi` 만이 lunar-javascript 와 같은 (c) 유파다.

### 10.3 🔴 진태양시 × dayBoundary 상호작용 트랩 (미문서화)

`isLateZi` 판정과 `shichen` 이 **`apparentMs`(진태양시)** 기준이므로, 진태양시를 켜면 자시 창 자체가 이동한다.

2024-06-15, `trueSolarTime:{}` (127.5° + EoT):

| 입력(KST) | 보정없음+midnight | 진태양시+midnight | 진태양시+jasi | 진태양시+splitJasi |
|---|---|---|---|---|
| 00:00 | 甲辰 庚午 **庚戌 丙子** | 甲辰 庚午 **己酉 甲子** | 甲辰 庚午 **庚戌 丙子** | 甲辰 庚午 **己酉 丙子** |
| 00:10 | 庚戌 丙子 | **己酉 甲子** | 庚戌 丙子 | 己酉 丙子 |
| 00:30 | 庚戌 丙子 | **己酉 甲子** | 庚戌 丙子 | 己酉 丙子 |
| 00:34 | 庚戌 丙子 | 庚戌 丙子 | 庚戌 丙子 | 庚戌 丙子 |
| 23:00 | 庚戌 丙子 | 庚戌 **丁亥** | 庚戌 丁亥 | — |
| 23:30 | 庚戌 丙子 | 庚戌 **丁亥** | 庚戌 丁亥 | — |
| 23:40 | 庚戌 丙子 | 庚戌 丙子 | **辛亥 戊子** | — |

**→ 진태양시 ON + `midnight` 이면 00:00~00:34 출생자의 일주가 전날로 −1일 밀린다.**
**→ 진태양시 ON 이면 야자시 창이 23:00~24:00 KST 에서 약 23:31~00:35 KST 로 이동한다.**

영향률 (`a6-impact.js`, 2000~2010): 자시 인근 시각을 편중 표집한 32,144건에서 일주 차이 30.55%. 균등 표집 기준 실제 노출은 **롤백 창 ≈ 30분 ± EoT(16분) / 1440분 = 약 1.0~3.1% 의 출생시각**이다.

한국 상용 만세력 다수는 **경도 보정을 시주에만 적용하고 일주 경계는 자정에 고정**한다. manseryeok은 그 분리를 제공하지 않는다. **래퍼에서 일주만 무보정 시각으로 재계산하거나, 진태양시 ON 시 `dayBoundary:'jasi'` 를 함께 쓰는 우회가 필요하다**(위 표에서 `진태양시+jasi` 의 일주가 무보정과 일치함을 확인).

---

## 11. 십신 (`getTenGod` / `getBranchTenGod` / `getTenGodChart`)

### 11.1 판정 규칙 (소스 원문)

```js
if (targetEl === dayEl)                    return same ? '비견' : '겁재';
if (ELEMENT_GENERATES[dayEl] === targetEl) return same ? '식신' : '상관';
if (ELEMENT_CONTROLS[dayEl] === targetEl)  return same ? '편재' : '정재';
if (ELEMENT_CONTROLS[targetEl] === dayEl)  return same ? '편관' : '정관';
return same ? '편인' : '정인';
// same = (일간 음양 === 대상 음양)
```

C04 §2-1 의 `同性 → 偏 / 異性 → 正` 원칙과 동일.

### 11.2 전수 대조 결과 (`a3-features.js`)

```
=== 십신 천간 10×10 전수 대조 (manseryeok vs C04 §2-2) ===
100칸 중 불일치 0건

=== 십신 지지(본기) 10×12 전수 대조 (vs C04 §2-3) ===
120칸 중 불일치 0건
```

**총 220칸 전수 일치.** 지장간 본기 매핑도 C04와 동일:

| 지지 | 子 | 丑 | 寅 | 卯 | 辰 | 巳 | 午 | 未 | 申 | 酉 | 戌 | 亥 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 본기 | 癸 | 己 | 甲 | 乙 | 戊 | 丙 | 丁 | 己 | 庚 | 辛 | 戊 | 壬 |

### 11.3 기능 한계

- **지장간 여기(餘氣)·중기(中氣) 미제공.** `getBranchTenGod` 는 본기 1개만 본다. C04 §2-4의 지장간 다중 십신(예: 甲 일간 丑 → 癸=정인, 辛=정관, 己=정재)이 필요하면 자체 구현.
- `tenGods.day.stem` 은 십신이 아니라 문자열 `'일간'` 이다.
- 대운·세운 간지에 대한 십신은 `getTenGod(일간, 대운천간)` 으로 직접 호출해야 한다.

출력 구조 실측 (1990-05-15 14:30, 庚午 辛巳 庚辰 癸未):

```json
{"year":{"stem":"비견","branch":"정관"},"month":{"stem":"겁재","branch":"편관"},
 "day":{"stem":"일간","branch":"편인"},"hour":{"stem":"상관","branch":"정인"}}
```

---

## 12. 공망 (`getVoidBranches`)

```js
const dayGanji = ganjiIndexOf(일간idx, 일지idx);
const xunStartBranch = (dayGanji - (dayGanji % 10)) % 12;
return [ EARTHLY_BRANCHES[(xunStartBranch + 10) % 12],
         EARTHLY_BRANCHES[(xunStartBranch + 11) % 12] ];
```

60갑자 전수 대조 (C04 §7-9 순중공망 60행표):

| 순(旬) | 60갑자 인덱스 | manseryeok 산출 | C04 기대 | |
|---|---|---|---|---|
| 甲子순 | 0~9 | 戌亥 | 戌亥 | ✅ |
| 甲戌순 | 10~19 | 申酉 | 申酉 | ✅ |
| 甲申순 | 20~29 | 午未 | 午未 | ✅ |
| 甲午순 | 30~39 | 辰巳 | 辰巳 | ✅ |
| 甲辰순 | 40~49 | 寅卯 | 寅卯 | ✅ |
| 甲寅순 | 50~59 | 子丑 | 子丑 | ✅ |

```
60갑자 전수 불일치 0건
```

**기능 한계**: **일주 기준 공망 지지 2개만** 반환한다. C04 §7-9가 "본 앱은 일주 기준 1개만 산출" 로 확정했으므로 정책 일치. 다만 "공망 지지가 연지/월지/시지 중 어디에 히트했는가" 판정은 래퍼가 해야 한다(라이브러리는 히트 판정 미제공).

> C04 §부록이 지적한 `hjsh200219/fortuneteller` 의 결함(공망을 지지→지지 12행 표로 축약해 60갑자 중 절반이 틀림)은 manseryeok에 없다. 천간·지지를 모두 써서 순(旬)을 정확히 특정한다.

---

## 13. 대운 (`getLuckPillars`)

### 13.1 방향 판정 — 20조합 전수 일치

```js
const yangYear = sajuYearStemIndex % 2 === 0;
const forward  = (yangYear && male) || (!yangYear && !male);
```

| 연간 | 남 | 여 |
|---|---|---|
| 甲(양) | 순행 ✅ | 역행 ✅ |
| 乙(음) | 역행 ✅ | 순행 ✅ |
| 丙(양) | 순행 ✅ | 역행 ✅ |
| 丁(음) | 역행 ✅ | 순행 ✅ |
| 戊(양) | 순행 ✅ | 역행 ✅ |
| 己(음) | 역행 ✅ | 순행 ✅ |
| 庚(양) | 순행 ✅ | 역행 ✅ |
| 辛(음) | 역행 ✅ | 순행 ✅ |
| 壬(양) | 순행 ✅ | 역행 ✅ |
| 癸(음) | 역행 ✅ | 순행 ✅ |

C06 §3 판정표(양남·음녀 순행 / 음남·양녀 역행)와 **20/20 일치**.

### 13.2 C06 케이스 A~F 전수 대조

| case | 입력 | 사주 | 방향 (man/C06) | `startAge` | C06 한국식/반올림 | 첫 대운 (man/C06) | 정밀 (man / C06) |
|---|---|---|---|---|---|---|---|
| A | 1990-08-17 10:00 남 | 庚午 甲申 甲寅 己巳 | 순행/순행 ✅ | 7 | 7 / 7 | 을유/을유 ✅ | 7년3개월13일 / 7년3개월13일2시간 |
| B | 1990-08-17 10:00 여 | 庚午 甲申 甲寅 己巳 | 역행/역행 ✅ | 3 | 3 / 3 | 계미/계미 ✅ | 3년1개월1일 / 3년1개월1일4시간 |
| C | 2000-01-01 12:00 여 | 己卯 丙子 戊午 戊午 | 순행/순행 ✅ | **2** | **1 / 2** | 정축/정축 ✅ | 1년7개월20일 / 1년7개월20일0시간 |
| D | 2000-01-01 12:00 남 | 己卯 丙子 戊午 戊午 | 역행/역행 ✅ | 8 | 8 / 8 | 을해/을해 ✅ | 8년2개월6일 / 8년2개월5일22시간 |
| E | 2023-11-11 04:30 남 | 癸卯 癸亥 癸酉 甲寅 | 역행/역행 ✅ | 1 | 1 / 1 | 임술/임술 ✅ | 1년0개월14일 / 1년0개월14일12시간 |
| F | 1982-03-21 14:20 여 | 壬戌 癸卯 癸卯 己未 | 역행/역행 ✅ | 5 | 5 / 5 | 임인/임인 ✅ | 5년1개월7일 / 5년1개월7일2시간 |

**사주 4주 6/6 일치, 방향 6/6, 첫 대운 간지 6/6, 정밀 대운수 6/6 (시간 잔여는 일 단위로 반올림 흡수).**

10주기 전개 실측 (케이스 A, 월주 甲申, 순행):
```
7세 을유 → 17세 병술 → 27세 정해 → 37세 무자 → 47세 기축 → 57세 경인 → 67세 신묘 → 77세 임진 → 87세 계사 → 97세 갑오
```
(케이스 B, 역행): `3세 계미 → 13세 임오 → 23세 신사 → 33세 경진 → 43세 기묘 → 53세 무인 → 63세 정축 → 73세 병자 → 83세 을해 → 93세 갑술`

### 13.3 🔴 ⚠️유파차이 — 대운수(`startAge`)는 (D) 반올림 고정

```js
const startAge = Math.max(1, Math.round(days / 3));    // days 는 소수(시·분 포함)
```

C06 §4.4 가 정의한 4유파 중:

| 유파 | 정의 | manseryeok |
|---|---|---|
| (A) 정밀 | 교운 일시 직접 제시 | `startYears/startMonths/startDays` 로 제공 ✅ |
| (C) 한국식 | 정수 일수 ÷3, 나머지 1 버림 / 2 올림 | ❌ 미제공 |
| (D) 반올림 | `round(exactDays / 3)` | ✅ **이것만 제공** |
| 세는나이 | (C) 또는 (D) + 1 | ❌ 미제공 |

**C06 §4.4 는 "(C) 한국식 기본, `numberRule:'round'` 로 (D) 전환" 을 확정했다. manseryeok은 (D) 고정이므로 기본값이 어긋난다.**

갈리는 구체 케이스 (2000-01-01 여, 己卯년 음녀 → 순행, 다음 節 = 소한):

| 출생시각 | Δ일(정확) | manseryeok `startAge` | `floor(Δ/3)` | (C) 한국식 |
|---|---|---|---|---|
| 00:00 | 5.4167 | **2** | 1 | 2 |
| 03:00 | 5.2917 | **2** | 1 | 2 |
| 06:00 | 5.1667 | **2** | 1 | 2 |
| 09:00 | 5.0417 | **2** | 1 | 2 |
| 12:00 | 4.9167 | **2** | 1 | **1** ← 갈림 |
| 15:00 | 4.7917 | **2** | 1 | **1** ← 갈림 |
| 18:00 | 4.6667 | **2** | 1 | **1** ← 갈림 |
| 21:00 | 4.5417 | **2** | 1 | **1** ← 갈림 |

### 13.4 🔴 버그 — `Math.max(1, …)` 클램프가 `startAge=0` 을 은폐

```
$ 1980~2020 매일 12시 × 남녀 (29,952건) startAge 분포
1:4428  2:2953  3:2952  4:2952  5:2952  6:2952  7:2952  8:2953  9:2952  10:1906
```

**`startAge=1` 이 다른 값의 정확히 1.5배(4,428 vs ≈2,952).** 초과분 1,476건은 원래 0이 되어야 할 값이 1로 흡수된 것이다.

정밀값과 `startAge` 가 모순되는 실례:

```
G01  1990-05-05 23:30 남 (庚午 양남 → 순행, 다음 節 입하 = 1990-05-06 03:35 KST)
     startAge=1   정밀=0년0개월20일   첫 대운 = 1세 신사    ← 0년인데 1세

2024-02-04 17:27 여 (입춘 정각, 갑진년 양녀 → 역행, 직전 節까지 0일)
     startAge=1   정밀=0년0개월0일    첫 대운 = 1세 을축    ← 0년0개월0일인데 1세
```

C06 §5(만나이 기준, 0세 출발 비례식)를 따르면 **0이 정답**이다. **래퍼에서 `startAge` 를 버리고 `startYears/startMonths/startDays` 에서 재계산해야 한다.**

### 13.5 대운수 정밀 환산식 (소스 원문)

```js
let startYears  = Math.floor(days / 3);            // 3일 = 1년
const remMonths = (days - startYears * 3) * 4;     // 1일 = 4개월
let startMonths = Math.floor(remMonths);
let startDays   = Math.round((remMonths - startMonths) * 30);   // 1개월 = 30(환산)일
if (startDays  >= 30) { startDays  -= 30; startMonths += 1; }   // carry
if (startMonths>= 12) { startMonths-= 12; startYears  += 1; }
```

C06 §4.3 의 환산 단위(3일=1년 / 1일=4개월)와 동일. **단 C06의 `1시진=10일 / 1시간=5일 / 1분=2시간` 단위는 미제공** — `startDays` 아래 잔여는 반올림으로 버려진다(케이스 D: C06 `5일22시간` → manseryeok `6일`).

### 13.6 `getLuckPillars` 직접 호출 시그니처

```ts
getLuckPillars({
  instantUTCms: number,        // 출생 절대 순간
  birthYear: number,           // 정수 101~9998 (절기 수집 범위 ±1년에 사용)
  monthPillar: Pillar,
  sajuYearStemIndex: number,   // 0~9
  gender: 'male' | 'female',
  count?: number,              // 기본 10, 허용 1~120
}): LuckPillarInfo
```

`count:3` 실행 결과:
```json
{"forward":true,"startAge":7,"startYears":7,"startMonths":3,"startDays":13,
 "pillars":[{"age":7,"pillar":{"heavenlyStem":"을","earthlyBranch":"유"},"korean":"을유"},
            {"age":17,...,"korean":"병술"},{"age":27,...,"korean":"정해"}]}
```

절 수집은 `birthYear-1 ~ birthYear+1` × 12節 = 36개. **중기(中氣)는 쓰지 않는다** — C06 §1.4 확정과 일치.

---

## 14. 결함 목록 (심각도 순)

| # | 심각도 | 위치 | 내용 | 대응 |
|---|---|---|---|---|
| **B1** | 🔴 높음 | `true-solar-time.js` `if (!options)` | **기본값에서 한국 표준시 이력·서머타임이 전혀 적용되지 않음.** 1948~88 구간 출생자 시주 15~23% 오류(§6.5) | 래퍼가 `trueSolarTime` 을 항상 넘긴다 |
| **B2** | 🔴 높음 | `pillars.js` `computeDayPillar` | 경도·EoT 보정이 **일주 경계까지** 이동시킴. 00:00~00:34 출생자 일주 −1일(§10.3). 분리 옵션 없음 | 일주만 무보정 시각으로 재계산 |
| **B3** | 🟠 중간 | `luck-pillars.js` `Math.max(1, …)` | `startAge=0` 이 1로 클램프되어 정밀값(0년0개월)과 모순(§13.4) | `startYears` 로 재계산 |
| **B4** | 🟠 중간 | `luck-pillars.js` `Math.round(days/3)` | 대운수 유파가 (D) 반올림 고정. C06 확정 기본 (C) 한국식과 갈림(§13.3) | 래퍼에서 (C) 재계산 |
| **B5** | 🟡 낮음 | `tools/gen-solar-terms.mjs` `Math.round(ms/60000)` | 절입 초를 반올림 → KASI(절사) 대비 +1분. 168건 중 4건, 그중 節 2건(§7.5) | 경계 ±1분은 "경계 사주" 로 UI 경고 |
| **B6** | 🟡 낮음 | `korea-timezone.js` `STANDARD_EPOCHS` | 전이가 **일 단위**라 1954-03-20 23:30~23:59 등 30분 창에서 IANA와 어긋남(§6.4) | 무시 가능 / 입력 경고 |
| **B7** | 🟡 낮음 | `korea-timezone.js` | 존재하지 않는 벽시계(1912-01-01 00:00~00:29, 1961-08-10 00:00~00:29, 1987/88-05 02:00~02:59)를 예외 없이 해석 | 입력 UI에서 차단 |
| **B8** | 🟡 낮음 | `constants.js` | `DEFAULT_LONGITUDE=127.5` 는 C03의 서울 126.978°(−32.09분)와 다른 상수(−30분) | `longitude` 를 명시 지정 |
| **B9** | ⚪ 정보 | `package.json` `exports` | 서브모듈 import 차단 → `solarTermInstantMs` 등 유용한 내부 API 접근 불가 | `getSolarTerm` 로 우회 |
| **B10** | ⚪ 정보 | CJS 단일 빌드 | 트리셰이킹 불가 — `getTenGod` 하나만 import 해도 전체 번들(§16) | 수용 |
| **B11** | ⚪ 정보 | README/CHANGELOG | "KASI와 분 단위 일치" 는 실제로는 6tail 대비 ≤1분 일치. KASI 직접 대조는 상류에 없음(§7.5) | 문서 신뢰도 조정 |

**소스 레벨 로직 오류(오호둔·오서둔·60갑자·십신·공망·대운 방향)는 단 1건도 발견되지 않았다.** 위 결함은 전부 (a) 기본값 정책, (b) 유파 선택 고정, (c) 반올림 관행 문제다.

---

## 15. 경계값·예외 전수 테스트 (`a5-bugs.js`)

### 15.1 연도 경계

| 입력 | 결과 |
|---|---|
| `year=1799` 양력 | ✗ `RangeError: 연도(year)는 1800~2300 정수여야 합니다: 1799` |
| `year=1800` 양력 | 庚申 壬午 乙亥 壬午 |
| `year=2100` 양력 | 庚申 壬午 戊子 戊午 |
| `year=2101` 양력 | 辛酉 甲午 癸巳 戊午 (정상 — 양력 상한은 2300) |
| `year=2300` 양력 | 庚辰 壬午 丙辰 甲午 |
| `year=2301` 양력 | ✗ `RangeError: … 1800~2300 …: 2301` |
| `year=1391` **음력** | ✗ `RangeError: 연도(year)는 1800~2100 정수여야 합니다: 1391` |
| `year=1800` 음력 | 庚申 癸未 丙寅 甲午 |
| `year=2100` 음력 | 庚申 癸未 甲子 庚午 |
| `year=2101` 음력 | ✗ `RangeError: … 1800~2100 …: 2101` |

**→ `LUNAR_MIN_YEAR=1391` 은 `lunarToSolar`/`solarToLunar` 전용이다. `calculateFourPillars(isLunar:true)` 는 1800부터.** C09 §11.4 표를 이 축으로 세분해야 한다.

### 15.2 음양력 변환 단독 API

| 호출 | 결과 |
|---|---|
| `lunarToSolar(1390,1,1,false)` | ✗ `RangeError: 음력 연도(year)은 1391~2100 범위여야 합니다: 1390` |
| `lunarToSolar(1391,1,1,false)` | `{year:1391, month:2, day:13}` ← **음력 테이블 기준일** |
| `lunarToSolar(2100,1,1,false)` | `{year:2100, month:2, day:9}` |
| `lunarToSolar(2101,1,1,false)` | ✗ `RangeError` |
| `solarToLunar(1390,12,31)` | ✗ `RangeError: 음력 변환 지원 범위(양력 1391-02-13) 이전 날짜입니다` |
| `solarToLunar(1391,2,5)` | ✗ 동일 |
| `solarToLunar(2100,12,31)` | `{year:2100, month:12, day:1, isLeapMonth:false}` |
| `solarToLunar(2101,1,20)` | `{year:2100, month:12, day:21, …}` ← 음력 2100-12월이 양력 2101-01까지 이어짐, 정상 |
| `solarToLunar(2101,2,1)` | ✗ `RangeError: 음력 변환 지원 범위(2100년)를 벗어났습니다` |

### 15.3 윤년·비실재 날짜

| 입력 | 결과 |
|---|---|
| 2024-02-29 (윤년) | 甲辰 丙寅 癸亥 戊午 |
| 2000-02-29 (400년 윤년) | 庚辰 戊寅 丁巳 丙午 |
| 2023-02-29 | ✗ `RangeError: 유효하지 않은 양력 날짜입니다: 2023-2-29` |
| **1900-02-29** (100년 비윤년) | ✗ `RangeError` ✅ 그레고리력 규칙 정확 |
| 2024-02-30 / 2024-04-31 | ✗ `RangeError` |
| 2024-13-1 / 2024-0-1 / 2024-6-0 | ✗ `RangeError` |

### 15.4 시·분·타입 오염

| 입력 | 결과 |
|---|---|
| `hour=0, minute=0` | 甲辰 庚午 庚戌 丙子 |
| `hour=23, minute=59` | 甲辰 庚午 庚戌 丙子 (midnight 기본 → 일주 당일 유지) |
| `hour=24` / `hour=-1` / `hour=12.5` | ✗ `RangeError: 시(hour)는 0~23 정수여야 합니다` |
| `minute=60` / `-1` / `30.5` | ✗ `RangeError: 분(minute)은 0~59 정수여야 합니다` |
| `year=NaN` | ✗ `RangeError: … : NaN` |
| `year="2024"` (문자열) | ✗ `RangeError: … : 2024` ✅ 타입 강제 |
| `birthInfo=null` | ✗ `TypeError: 생년월일시 정보(birthInfo)는 객체여야 합니다.` |
| `birthInfo={}` | ✗ `RangeError: … : undefined` |
| `longitude=181` | ✗ `RangeError: 출생지 경도는 -180~180 범위여야 합니다: 181` |
| `longitude=-180` | 甲辰 庚午 **己酉 辛未** (검증 통과, 서반구 계산) |
| `dayBoundary='night'` | ✗ `RangeError: … 'midnight','jasi','splitJasi' 중 하나여야 합니다` |
| `gender='M'` | ✗ `RangeError: … 'male' 또는 'female' 이어야 합니다: M` |

**입력 검증은 전 항목에서 조용한 오답 대신 예외를 던진다. NaN 전파 없음.**

### 15.5 절입 정각 ±1분

2024 입춘 (KASI 2024-02-04 17:27 KST):

| 입력 | 결과 |
|---|---|
| 17:25 | **癸卯 乙丑** 戊戌 辛酉 |
| 17:26 | **癸卯 乙丑** 戊戌 辛酉 |
| **17:27** | **甲辰 丙寅** 戊戌 辛酉 ← 정각 포함(`instantMs < lichunMs` 이므로 정각은 새 연) |
| 17:28 | 甲辰 丙寅 戊戌 辛酉 |

2025 입춘 (23:10 KST) × 야자시 3관법 중첩:

| 입력 | midnight | jasi | splitJasi |
|---|---|---|---|
| 23:09 | **甲辰 丁丑** 癸卯 壬子 | **甲辰 丁丑** 甲辰 甲子 | **甲辰 丁丑** 癸卯 甲子 |
| **23:10** | **乙巳 戊寅** 癸卯 壬子 | **乙巳 戊寅** 甲辰 甲子 | **乙巳 戊寅** 癸卯 甲子 |
| 23:11 | 乙巳 戊寅 癸卯 壬子 | 乙巳 戊寅 甲辰 甲子 | 乙巳 戊寅 癸卯 甲子 |

**연주·월주 전환은 분 단위로 정확하며, 야자시 관법과 독립적으로 동작한다.**

### 15.6 연말/연초 교차 + 지원 한계

| 입력 | 결과 |
|---|---|
| 2025-01-01 00:00 | 甲辰 丙子 庚午 丙子 (입춘 전 → 사주년 2024) ✅ |
| 2024-12-31 23:59 | 甲辰 丙子 己巳 甲子 ✅ |
| 2025-12-31 23:59 | 乙巳 戊子 甲戌 甲子 ✅ |
| 1800-01-01 00:00 | 己未 丙子 庚寅 丙子 (1799 = 己未) ✅ |
| 2300-12-31 23:59 | 庚辰 戊子 乙亥 丙子 ✅ |
| 2301-01-01 00:00 | ✗ `RangeError` |

1800년 1월 구간은 **보정표 밖인 1799 대설**을 참조한다:
```
1799 대설(idx22) = 1799-12-07T00:46:00Z   (보정 0 = Meeus 폴백, 오차 ≈ ±8분)
1800 소한(idx0)  = 1800-01-05T11:37:00Z   (보정 −1분)
1800-01-01 12:00 → 己未 丙子 庚寅 壬午   (자월)
1800-01-05 12:00 → 己未 丙子 甲午 庚午   (자월, 소한 20:37 KST 이전)
1800-01-06 12:00 → 己未 丁丑 乙未 壬午   (축월)
```
→ **1800-01-01 ~ 01-05 출생자의 월주는 ±8분 폴백 오차 노출.** 실무 무관.

---

## 16. 번들 크기·성능 실측

### 16.1 esbuild 번들 (browser, ESM, minify)

| 진입점 | minified | gzip -9 |
|---|---|---|
| `import {calculateFourPillars}` | 44,081 B | **17,216 B** |
| `import {getSolarTerm}` | 44,029 B | **17,207 B** |
| `import {getTenGod}` | 44,018 B | **17,200 B** |

**트리셰이킹이 전혀 되지 않는다.** `getTenGod`(2.7KB 모듈) 하나만 import 해도 절기 보정표 14KB·음력 테이블 9KB가 전부 딸려 온다. 원인: `dist` 가 **CommonJS 단일 빌드**라 esbuild가 정적 분석으로 dead code를 제거할 수 없다. `package.json` 의 `"sideEffects": false` 는 CJS에서 무의미하다.

| 항목 | 값 |
|---|---|
| npm tarball unpacked | 127,579 B (38 파일, `.d.ts` 포함) |
| dist `.js` 합계 | 78,982 B |
| 클라이언트 번들 실효 | **44 KB (min) / 17.2 KB (gzip)** |

**토스 미니앱 클라이언트 번들에 17.2KB gzip 은 수용 가능하다.** 단 절기·음력 테이블이 상수의 대부분(23KB/79KB = 29%)이므로, 서버 계산으로 돌리면 클라이언트에서 제거 가능하다.

### 16.2 성능 (`a5-bugs.js`)

```
10,000회 (입력 분산, 절기 캐시 워밍 포함): 151.4 ms = 15.1 µs/회
10,000회 (동일 입력, 캐시 히트)          :  82.1 ms =  8.2 µs/회
```

`SOLAR_TERM_CACHE` 는 모듈 스코프 `Map` 이며 키는 `year*24+index`. **해제 로직이 없어 무한 증가**하지만, 1800~2300 전 범위를 채워도 12,024 엔트리(수백 KB)라 실무상 문제 없다.

---

## 17. 최종 권고 — 래퍼 사양

### 17.1 고정 호출 규약

```ts
// 프로덕션에서 raw manseryeok 을 직접 호출하지 않는다.
export function computeSaju(input: {
  year: number; month: number; day: number; hour: number; minute: number;
  isLunar?: boolean; isLeapMonth?: boolean;
  gender: 'male' | 'female';
  longitude?: number;              // 기본 126.978 (서울). C03 확정 상수
  useTrueSolarTime: boolean;       // 사용자 설정. 기본 false(표준시 표기 유지)
}) {
  // 1) 표준시 이력·서머타임은 항상 켠다. 진태양시 OFF 는 longitude=135 + EoT off 로 표현.
  const tst = input.useTrueSolarTime
    ? { longitude: input.longitude ?? 126.978, applyEquationOfTime: true,  applyHistoricalDst: true }
    : { longitude: 135,                        applyEquationOfTime: false, applyHistoricalDst: true };

  const r = calculateFourPillars({ ...input, trueSolarTime: tst, dayBoundary: 'midnight' });

  // 2) 진태양시 ON 이면 일주만 무보정 시각으로 재계산 (B2 우회)
  //    → 무보정 + applyHistoricalDst:true 로 한 번 더 호출해 day 만 채택
  // 3) 대운수는 startAge 를 버리고 startYears/Months/Days 에서 (C) 한국식으로 재계산 (B3, B4)
  // 4) 절입 ±1분 창에 걸리면 "경계 사주" 플래그 (B5)
  return { ... };
}
```

### 17.2 반드시 자체 구현할 것 (manseryeok 미제공)

| 항목 | 근거 문서 |
|---|---|
| 십이운성(十二運星) | C04 §5 — 거법(일간 기준) 채택 |
| 신살(神煞) 전반 (천을귀인·문창·도화·역마·화개·양인·괴강·백호·원진·귀문…) | C04 §7 |
| 지장간 여기·중기 및 다중 십신 | C04 §2-4 |
| 신강신약·오행 점수·용신 | C05 전체 |
| 세운·월운 | C06 §6~ |
| 공망 히트 판정(연/월/시지 매칭) | C04 §7-9 |
| 별자리·ASC | C07 |

### 17.3 채택하지 않을 근거가 없는 것

- 4주(연·월·일·시) 산출 → **36,525일 전수 검증 완료**
- 십신 220칸 → **C04 전수 일치**
- 공망 60갑자 → **C04 전수 일치**
- 대운 방향·간지 20조합 + 6케이스 → **C06 전수 일치**
- 음양력 변환 → **왕복 2,130건 무결 + 설날/추석/윤달 8건 일치**
- 절기 → **KASI 164/168 완전일치, 나머지 4건 +1분**

---

## 18. 선행 문서 정정

| 대상 | 기존 서술 | 정정 |
|---|---|---|
| **C09 §11.5** | "`DEFAULT_LONGITUDE=127.5` 가 기본값에서 미적용으로 보임. 옵션 확인 필요 `[미검증]`" | **확정.** `if (!options)` 얼리 리턴 때문. `trueSolarTime` 객체를 넘겨야만 켜지며, 그 순간 경도+EoT+표준시이력 3개가 동시에 켜진다 (§4.1) |
| **C09 §11.5** | "한국 표준시 이력·서머타임 자동 처리 여부 미확인. **처리하지 않을 가능성이 높다** `[미검증]`" | **부분 오답.** 처리한다 — `dist/time/korea-timezone.js` 에 IANA 기반 4전이 + 12 DST 구간이 전부 있고 tzdata 2025c와 1908-04-01 이후 100% 일치. **단 기본값 OFF** (§6) |
| **C09 §11.5** | "십신·대운·공망 유파 미대조 `[미검증]`" | **확정.** 십신 220칸 전수 일치, 공망 60갑자 전수 일치, 대운 방향 20조합 일치. **대운수만 유파 (D) 고정으로 C06 확정 (C)와 갈림** (§11~13) |
| **C09 §11.5** | "라이선스 MIT 확인. 번들 크기·최근 커밋일 미확인 `[미검증]`" | **확정.** unpackedSize 127,579B / gzip 번들 17.2KB / 마지막 푸시 2026-08-01 / 열린 이슈 9건 전부 Dependabot (§1, §16) |
| **C09 §11.2** | "절기가 KASI와 **초 단위까지 일치**" | **과장.** 168건 중 164건 분 단위 일치, 4건 +1분(초 반올림 관행 차이). 보정표의 진짜 기준은 KASI가 아니라 6tail (§7.5) |
| **C09 §3** | "lunar-javascript 는 **동경 120° 기준으로 절기를 산출**" | **원인 진단 정정.** 산출은 절대 순간으로 정확하고, 반환 **문자열이 CST 벽시계**일 뿐. manseryeok의 보정표가 바로 그 값을 CST→UTC 환산해 만든 것 (§7.7) |
| **C09 §11.4** | "음↔양력 변환 1391~2100" | **세분 필요.** `lunarToSolar`/`solarToLunar` 는 1391~2100, **`calculateFourPillars(isLunar:true)` 는 1800~2100** (§15.1) |
| **C02** | `distbe/holidays` 를 KASI 정본으로 인용 | **2020 춘분 항목이 오류**(03:20, 실제 12:49~50). `sunLng` 필드는 2021·2023·2025·2026 전체 `null` (§7.6) |
| **C01 §1.2** | 1954-03-21 전이 = 1954-03-20T15:30Z | **IANA tzdata 2025c 는 15:00Z.** 30분 차이 ⚠️유파차이/자료차이 (§6.4) |
| **문서 04 / 문서 11** | 만세력 연도 상한 2050 / 1800~2300 | **양력 사주 1800~2300, 음력 사주 1800~2100, 절기 단독 조회 100~9999(1800~2300만 정밀), 음양력 변환 1391~2100** |

---

## 19. ⚠️유파차이 종합 — 각 선택의 구체적 결과

### 19.1 서머타임 보정 (1948~51, 55~60, 87~88)

상류 골든 벡터에도 이 선택이 박혀 있다:

```
1988-09-20 16:00 (서머타임 기간) 상류 골든 기대값 = 무진 신유 무인 경신
  manseryeok 기본(보정 OFF)  = 戊辰 辛酉 戊寅 庚申   ← 골든과 일치
  manseryeok 진태양시 ON      = 戊辰 辛酉 戊寅 己未   ← 시주 1칸 이동
```

**상류 저자도 "KASI 표준값" 으로 서머타임 미보정 값을 채택했다.** 한국 상용 만세력 다수가 그렇다. 그러나 물리적으로는 1988-09-20 16:00 벽시계 = 실제 태양시 15:00 대이므로 **未시가 옳다.**

| 선택 | 1988-09-20 16:00 시주 | 근거 |
|---|---|---|
| 서머타임 무시 (상류 골든, 다수 상용 만세력) | **庚申** | 벽시계 그대로 |
| 서머타임 보정 (C01 확정) | **己未** | 실제 태양 위치 |

### 19.2 진태양시 적용 범위

| 선택 | 2024-06-15 00:10 출생 결과 |
|---|---|
| 미적용 | 甲辰 庚午 **庚戌 丙子** |
| 시주에만 적용 (한국 상용 다수) | 甲辰 庚午 **庚戌** + 子시 (분 보정만) |
| 일주까지 적용 (**manseryeok**) | 甲辰 庚午 **己酉 甲子** ← 일간이 庚→己 로 바뀜 |

**일간이 바뀌면 십신 전체가 재배치된다.** 20건 골든 벡터 중 진태양시 ON 시 일주가 바뀐 것: G12(2000-01-01 00:00) 戊午→丁巳, G19(1800-01-01 00:00) 庚寅→己丑.

### 19.3 야자시

§10.1 표 참조. 23:00~23:59 출생(전체의 **4.17%**)에서:

```
23시대 표본 27,396건 (2000~2024)
  midnight vs jasi      : 일주 차이 27,396건 (100.0%) / 시주 차이 27,396건 (100.0%)
  midnight vs splitJasi : 일주 차이      0건 (  0.0%) / 시주 차이 27,396건 (100.0%)
```

### 19.4 대운수

§13.3 표 참조. 2000-01-01 여 12:00~23:59 출생 → manseryeok 2 vs C06 한국식 1.

---

## 20. 출처

| # | URL | 확인 내용 | 확인 방식 |
|---|---|---|---|
| 1 | https://raw.githubusercontent.com/yhj1024/manseryeok/main/package.json | `exports` 맵 2개, CJS `main`, devDep `lunar-javascript ^1.7.7`, `prepublishOnly` 훅 | curl 200 |
| 2 | https://raw.githubusercontent.com/yhj1024/manseryeok/main/CHANGELOG.md | v2.0.0 breaking changes 전문, "6tail 천문 계산값을 개발 시점에 추출", 지원 범위 서술 | curl 200 |
| 3 | https://raw.githubusercontent.com/yhj1024/manseryeok/main/tools/gen-solar-terms.mjs | 보정표 생성기 원문. `Math.round(ms/60000)` 초 반올림 확정, `BEIJING_OFFSET_MS` CST→UTC 환산, `OFFSET=31` 패킹 한계 | curl 200 |
| 4 | https://raw.githubusercontent.com/yhj1024/manseryeok/main/src/pillars.ts | TypeScript 원본이 dist와 동일 로직임을 확인 | curl 200 |
| 5 | https://raw.githubusercontent.com/yhj1024/manseryeok/main/src/golden.test.ts | **상류 골든 11건 전문** (§18에 수록, 로컬 재현 11/11 통과) | curl 200 |
| 6 | https://raw.githubusercontent.com/yhj1024/manseryeok/main/src/crossvalidation.test.ts | 검증 기준이 **6tail** 이며 절입 허용오차가 **≤1분**임을 확인. KASI 직접 대조 없음 | curl 200 |
| 7 | https://api.github.com/repos/yhj1024/manseryeok | stars 35 / forks 23 / open issues 9 / pushed 2026-08-01 / MIT / archived false | curl 200 |
| 8 | https://api.github.com/repos/yhj1024/manseryeok/issues?state=open&per_page=15 | 열린 이슈 9건 전부 Dependabot PR, 버그 리포트 0건 | curl 200 |
| 9 | https://api.github.com/repos/yhj1024/manseryeok/git/trees/main?recursive=1 | `src/` 17파일 + 테스트 3종 파일 크기 | curl 200 |
| 10 | https://api.github.com/repos/yhj1024/manseryeok/contents/ | 저장소 루트 구조 (tests 디렉터리 없음 → 테스트는 src 코로케이션) | curl 200 |
| 11 | https://registry.npmjs.org/manseryeok (`npm view` 경유) | version 2.0.0 / license MIT / unpackedSize 127579 / fileCount 38 / time.modified 2026-06-11 / dependencies 없음 / versions [1.0.0, 1.0.1, 2.0.0] | npm CLI |
| 12 | https://registry.npmjs.org/manseryeok/-/manseryeok-2.0.0.tgz | `npm i manseryeok` 로 실제 다운로드·전개, dist 18개 `.js` 전부 Read | npm install |
| 13 | https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/2020.json | 2020 24절기 KST 시각. **춘분 항목 오류 발견** | curl 200, 15,498 B |
| 14 | https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/2021.json | 2021 24절기. `sunLng` 전체 null | curl 200, 18,627 B |
| 15 | https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/2022.json | 2022 24절기. 입동·소설 +1분 불일치 | curl 200, 18,756 B |
| 16 | https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/2023.json | 2023 24절기 | curl 200, 18,960 B |
| 17 | https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/2024.json | 2024 24절기. 입춘 17:27 확인, 소설 +1분 불일치 | curl 200, 20,382 B |
| 18 | https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/2025.json | 2025 24절기. 입춘 23:10 확인 | curl 200, 21,469 B |
| 19 | https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/2026.json | 2026 24절기. 입춘 05:02 확인 | curl 200, 21,649 B |
| 20 | (로컬) Node.js v24.14.1 내장 ICU 78.2 / **IANA tzdata 2025c** `Asia/Seoul` | 표준시 전이 28개 지점 이분탐색 추출, manseryeok 테이블과 대조 | `Intl.DateTimeFormat` |

**README 가 인용하나 본 감사에서 직접 열지 않은 것** `[미검증]`:
- https://www.data.go.kr/data/15012679/openapi.do (KASI 음양력 API — 음력 테이블 원천이라 주장)
- https://github.com/6tail/lunar-javascript (npm 패키지로는 설치·실행함. 저장소 페이지는 미열람)

---

## 21. 테스트 벡터

### TV-M1 — 기본 옵션 골든 20건 (보정 없음 + `dayBoundary:'midnight'`)

| ID | 입력(KST) | 성별 | 연주 | 월주 | 일주 | 시주 | 공망 | 대운방향 | `startAge` | 검증 대상 |
|---|---|---|---|---|---|---|---|---|---|---|
| M01 | 1990-05-05 23:30 | 남 | 庚午 | 庚辰 | 庚午 | 丙子 | 술해 | 순행 | 1 | 야자시 경계 + 클램프 |
| M02 | 2024-02-04 17:00 | 남 | 癸卯 | 乙丑 | 戊戌 | 辛酉 | 진사 | 역행 | 10 | 입춘(17:27) 직전 |
| M03 | 2024-02-04 17:27 | 남 | 甲辰 | 丙寅 | 戊戌 | 辛酉 | 진사 | 순행 | 10 | **입춘 정각 = 새 연** |
| M04 | 2024-02-04 18:00 | 남 | 甲辰 | 丙寅 | 戊戌 | 辛酉 | 진사 | 순행 | 10 | 입춘 직후 |
| M05 | 2025-02-03 23:09 | 여 | 甲辰 | 丁丑 | 癸卯 | 壬子 | 진사 | 역행 | 10 | 입춘(23:10) 직전 + 야자시 |
| M06 | 2025-02-03 23:10 | 여 | 乙巳 | 戊寅 | 癸卯 | 壬子 | 진사 | 순행 | 10 | 입춘 정각 + 야자시 중첩 |
| M07 | 1970-07-07 09:00 | 남 | 庚戌 | 壬午 | 戊子 | 丁巳 | 오미 | 순행 | 1 | 소서 절입 당일 (solarlunar 오답 케이스) |
| M08 | 1988-08-15 12:00 | 여 | 戊辰 | 庚申 | 壬寅 | 丙午 | 진사 | 역행 | 3 | 서머타임 기간, 보정 OFF |
| M09 | 1988-05-08 03:00 | 남 | 戊辰 | 丁巳 | 癸亥 | 甲寅 | 자축 | 순행 | 10 | 서머타임 시작일 |
| M10 | 1960-01-01 12:00 | 남 | 己亥 | 丙子 | 戊子 | 戊午 | 오미 | 역행 | 8 | UTC+8:30 기간, 보정 OFF |
| M11 | 1954-03-21 12:00 | 여 | 甲午 | 丁卯 | 丙子 | 甲午 | 신유 | 역행 | 5 | 표준시 전환 당일 |
| M12 | 2000-01-01 00:00 | 여 | 己卯 | 丙子 | 戊午 | 壬子 | 자축 | 순행 | 2 | 자정 경계 |
| M13 | 2000-01-01 12:00 | 여 | 己卯 | 丙子 | 戊午 | 戊午 | 자축 | 순행 | **2** | C06 케이스 C (한국식은 1) |
| M14 | 2010-12-31 23:59 | 남 | 庚寅 | 戊子 | 乙卯 | 丙子 | 자축 | 순행 | 2 | 연말 야자시 |
| M15 | 1985-02-03 23:50 | 남 | 甲子 | 丁丑 | 癸酉 | 壬子 | 술해 | 순행 | 1 | 입춘 직전 + 야자시 |
| M16 | 1996-06-21 06:00 | 여 | 丙子 | 甲午 | 己丑 | 丁卯 | 오미 | 역행 | 5 | 하지 무렵 |
| M17 | 2003-10-08 15:30 | 남 | 癸未 | 辛酉 | 甲寅 | 壬申 | 자축 | 역행 | 10 | 한로 무렵 |
| M18 | 1976-11-11 01:00 | 여 | 丙辰 | 己亥 | 丁卯 | 辛丑 | 술해 | 역행 | 1 | 축시 경계 |
| M19 | 1800-01-01 00:00 | 남 | 己未 | 丙子 | 庚寅 | 丙子 | 오미 | 역행 | 8 | 지원 하한 |
| M20 | 2300-12-31 23:59 | 여 | 庚辰 | 戊子 | 乙亥 | 丙子 | 신유 | 역행 | 8 | 지원 상한 |

### TV-M2 — 동일 20건, `trueSolarTime:{}` (127.5° + EoT + IANA)

| ID | 연주 | 월주 | 일주 | 시주 | 기본 대비 |
|---|---|---|---|---|---|
| M01 | 庚午 | 庚辰 | 庚午 | 丙子 | 동일 |
| M02 | 癸卯 | 乙丑 | 戊戌 | **庚申** | 시주 |
| M03 | 甲辰 | 丙寅 | 戊戌 | **庚申** | 시주 |
| M04 | 甲辰 | 丙寅 | 戊戌 | 辛酉 | 동일 |
| M05 | 甲辰 | 丁丑 | 癸卯 | **癸亥** | 시주 |
| M06 | 乙巳 | 戊寅 | 癸卯 | **癸亥** | 시주 |
| M07 | 庚戌 | 壬午 | 戊子 | **丙辰** | 시주 |
| M08 | 戊辰 | 庚申 | 壬寅 | **乙巳** | 시주 (서머타임 −1h) |
| M09 | 戊辰 | 丁巳 | 癸亥 | **癸丑** | 시주 (서머타임 −1h) |
| M10 | 己亥 | 丙子 | 戊子 | 戊午 | 동일 (+8:30 상쇄) |
| M11 | 甲午 | 丁卯 | 丙子 | 甲午 | 동일 (+8:30 상쇄) |
| M12 | 己卯 | 丙子 | **丁巳** | **庚子** | **일주+시주** |
| M13 | 己卯 | 丙子 | 戊午 | 戊午 | 동일 |
| M14 | 庚寅 | 戊子 | 乙卯 | 丙子 | 동일 |
| M15 | 甲子 | 丁丑 | 癸酉 | 壬子 | 동일 |
| M16 | 丙子 | 甲午 | 己丑 | 丁卯 | 동일 |
| M17 | 癸未 | 辛酉 | 甲寅 | 壬申 | 동일 |
| M18 | 丙辰 | 己亥 | 丁卯 | **庚子** | 시주 |
| M19 | 己未 | 丙子 | **己丑** | **甲子** | **일주+시주** |
| M20 | 庚辰 | 戊子 | 乙亥 | 丙子 | 동일 |

### TV-M3 — 상류 골든 11건 (로컬 재현 11/11 통과)

| ID | 입력(KST) | 기대 = 실측 |
|---|---|---|
| U01 | 1936-08-25 07:30 | 병자 병신 기묘 무진 |
| U02 | 1948-05-01 12:00 | 무자 병진 병술 갑오 |
| U03 | 1960-03-15 10:00 | 경자 기묘 임인 을사 |
| U04 | 1975-07-07 14:00 | 을묘 임오 갑인 신미 |
| U05 | 1984-06-15 09:00 | 갑자 경오 경진 신사 |
| U06 | 1988-09-20 16:00 | 무진 신유 무인 경신 ← **서머타임 미보정 채택** |
| U07 | 1992-10-24 05:30 | 임신 경술 계유 을묘 ← **일주 앵커일** |
| U08 | 1995-11-11 11:11 | 을해 정해 병오 갑오 |
| U09 | 2000-06-10 08:30 | 경진 임오 기해 무진 |
| U10 | 2010-12-05 18:00 | 경인 정해 기축 계유 |
| U11 | 2020-04-20 13:00 | 경자 경진 계사 기미 |

### TV-M4 — 표준시 이력 offset 벡터 (`koreaCivilOffsetMin`)

| 입력 벽시계 | manseryeok | IANA 2025c | 일치 |
|---|---|---|---|
| 1900-06-15 12:00 | 540 | 507 (LMT) | ⚠ 문서화된 fallback |
| 1908-04-01 12:00 | 510 | 510 | ✅ |
| 1912-01-01 00:15 | 540 | (부존재 갭) | — |
| 1912-01-01 12:00 | 540 | 540 | ✅ |
| 1948-07-01 12:00 | 600 | 600 | ✅ |
| 1949-06-01 12:00 | 600 | 600 | ✅ |
| 1954-03-20 12:00 | 540 | 540 | ✅ |
| 1954-03-21 00:15 | 510 | 510 | ✅ |
| 1955-06-01 12:00 | 570 | 570 | ✅ |
| 1958-07-07 07:10 | 570 | 570 | ✅ |
| 1960-07-01 12:00 | 570 | 570 | ✅ |
| 1961-08-09 12:00 | 510 | 510 | ✅ |
| 1961-08-10 00:15 | 540 | (부존재 갭) | — |
| 1961-08-10 12:00 | 540 | 540 | ✅ |
| 1987-05-10 01:00 | 540 | 540 | ✅ |
| 1987-05-10 02:30 | 600 | (부존재 갭) | — |
| 1987-10-11 02:30 | 600 | 중복(540/600) | ✅ 첫 발생 |
| 1988-08-15 12:00 | 600 | 600 | ✅ |
| 1990-01-01 12:00 | 540 | 540 | ✅ |

### TV-M5 — 절기 회귀 벡터 (KASI 대조, KST)

| 연 | 절기 | manseryeok | KASI 데이터셋 | Δ |
|---|---|---|---|---|
| 2024 | 입춘 | 2024-02-04 17:27 | 17:27 | 0 |
| 2025 | 입춘 | 2025-02-03 23:10 | 23:10 | 0 |
| 2026 | 입춘 | 2026-02-04 05:02 | 05:02 | 0 |
| 2020 | 대설 | 2020-12-07 **01:10** | 01:09 | **+1** |
| 2022 | 입동 | 2022-11-07 **19:46** | 19:45 | **+1** |
| 2022 | 소설 | 2022-11-22 **17:21** | 17:20 | **+1** |
| 2024 | 소설 | 2024-11-22 **04:57** | 04:56 | **+1** |
| 2020 | 춘분 | 2020-03-20 12:50 | ~~03:20~~ (데이터셋 오류) | — |
| 나머지 160건 | — | — | — | **0** |

### TV-M6 — 야자시 3관법 회귀 벡터

| 입력(KST) | `midnight` | `jasi` | `splitJasi` |
|---|---|---|---|
| 1990-05-05 23:30 | 庚午 庚辰 庚午 丙子 | 庚午 庚辰 辛未 戊子 | 庚午 庚辰 庚午 戊子 |
| 2025-02-03 23:20 | 乙巳 戊寅 癸卯 壬子 | 乙巳 戊寅 甲辰 甲子 | 乙巳 戊寅 癸卯 甲子 |
| 2010-12-31 23:59 | 庚寅 戊子 乙卯 丙子 | 庚寅 戊子 丙辰 戊子 | 庚寅 戊子 乙卯 戊子 |
| 1985-02-03 23:50 | 甲子 丁丑 癸酉 壬子 | 甲子 丁丑 甲戌 甲子 | 甲子 丁丑 癸酉 甲子 |
| 2024-03-10 23:30 | 甲辰 丁卯 癸酉 壬子 | 甲辰 丁卯 甲戌 甲子 | 甲辰 丁卯 癸酉 甲子 |

### TV-M7 — 예외 회귀 벡터

| 입력 | 기대 예외 |
|---|---|
| `{year:1799,…}` | `RangeError: 연도(year)는 1800~2300 정수여야 합니다: 1799` |
| `{year:2301,…}` | `RangeError: 연도(year)는 1800~2300 정수여야 합니다: 2301` |
| `{year:1391,…,isLunar:true}` | `RangeError: 연도(year)는 1800~2100 정수여야 합니다: 1391` |
| `{year:2023,month:2,day:29,…}` | `RangeError: 유효하지 않은 양력 날짜입니다: 2023-2-29` |
| `{year:1900,month:2,day:29,…}` | `RangeError: 유효하지 않은 양력 날짜입니다: 1900-2-29` |
| `{…,hour:24}` | `RangeError: 시(hour)는 0~23 정수여야 합니다: 24` |
| `{…,minute:60}` | `RangeError: 분(minute)은 0~59 정수여야 합니다: 60` |
| `{year:NaN,…}` | `RangeError: 연도(year)는 1800~2300 정수여야 합니다: NaN` |
| `null` | `TypeError: 생년월일시 정보(birthInfo)는 객체여야 합니다.` |
| `{…,trueSolarTime:{longitude:181}}` | `RangeError: 출생지 경도(trueSolarTime.longitude)는 -180~180 범위여야 합니다: 181` |
| `{…,dayBoundary:'night'}` | `RangeError: 일 경계(dayBoundary)는 'midnight', 'jasi', 'splitJasi' 중 하나여야 합니다: night` |
| `{…,gender:'M'}` | `RangeError: 성별(gender)은 'male' 또는 'female' 이어야 합니다: M` |
| `getSolarTerm(99, 2)` | `RangeError: 절기 연도(year)은 100~9999 범위여야 합니다: 99` |
| `getSolarTerm(10000, 2)` | `RangeError: 절기 연도(year)은 100~9999 범위여야 합니다: 10000` |
| `lunarToSolar(1390,1,1,false)` | `RangeError: 음력 연도(year)은 1391~2100 범위여야 합니다: 1390` |
| `solarToLunar(1391,2,5)` | `RangeError: 음력 변환 지원 범위(양력 1391-02-13) 이전 날짜입니다: 1391-2-5` |
| `solarToLunar(2101,2,1)` | `RangeError: 음력 변환 지원 범위(2100년)를 벗어났습니다: 2101-2-1` |

### TV-M8 — 음양력 회귀 벡터

| 양력 | 음력 | 비고 |
|---|---|---|
| 2023-01-22 | 2023-01-01 | 2023 설날 ✅ |
| 2024-02-10 | 2024-01-01 | 2024 설날 ✅ |
| 2025-01-29 | 2025-01-01 | 2025 설날 ✅ |
| 2026-02-17 | 2026-01-01 | 2026 설날 ✅ |
| 2024-09-17 | 2024-08-15 | 2024 추석 ✅ |
| 2025-10-06 | 2025-08-15 | 2025 추석 ✅ |
| 2020-05-23 | 2020-**윤**04-01 | 윤달 ✅ |
| 1997-02-08 | 1997-01-01 | **한국 정본**(중국은 2/7) ✅ |
| 1391-02-13 | 1391-01-01 | 음력 테이블 기준일 |
| 2100-02-09 | 2100-01-01 | 음력 상한 |

왕복 무결성: `lunarToSolar → solarToLunar` 1391~2100 전 연도 × {1/1, 6/15, 12/1} = **2,130건 불일치 0**.
