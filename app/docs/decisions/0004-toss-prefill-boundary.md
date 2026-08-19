# 0004. 토스 동의 데이터 프리필 — 생년월일·성별만, 그리고 양력 확인을 강제한다

- 날짜: 2026-08-13 (음력 지원 반영: 2026-08-13)
- 상태: 확정 (§3 의 "음력 답변 처리"만 개정 — 아래 개정 주석)
- 구현: `src/shared/api/tossUser.ts` · `src/features/onboarding/tossPrefill.ts`

## 문제

온보딩 첫 화면이 생년월일·출생시각·성별·출생지를 묻는다. 토스 앱은 `User.getConsentedData` 로
동의 기반 사용자 데이터를 준다(Toss Android/iOS 5.264.0 이상). 어디까지 받아서 어디까지 믿을 것인가.

## 결정

### 1. 요청 항목은 `USER_BIRTHDAY` + `USER_GENDER` **둘뿐**이다

`USER_NAME` · `USER_PHONE` · `USER_EMAIL` · `USER_ADDRESS` · `USER_NATIONALITY` ·
`USER_CONSUMPTION_HISTORY` 는 요청하지도, 읽지도, 저장하지도, 로그에 남기지도 않는다.
경계 모듈의 zod 스키마가 `z.object()`(모르는 키 strip)라, 응답에 섞여 오더라도 파싱 결과에서 사라진다.

### 2. `USER_ADDRESS` 를 출생지로 쓰지 않는다

`USER_ADDRESS` 는 **거주지**다. 사주 계산에서 출생지가 필요한 유일한 이유는 진태양시 보정용
**경도(λ)** 이고(C00 §S0-3 · C15 §7.2), 거주지 경도를 넣으면 그 자리에서 계산이 틀린다.
국내만 봐도 백령도(λ=124.6724)와 독도의 보정 폭이 **28.77분**이다 — 시주(時柱)가 한 칸 밀리기에 충분하다.
"서울에 살지만 부산에서 태어난 사람"은 예외가 아니라 다수다. 출생지는 계속 사용자가 고르고,
기본값은 서울(C00 §S0-3)로 둔다.

즉 프리필로 줄이는 입력은 **생년월일·성별 두 개**이고, 남는 필수 입력은 **출생시각 하나**다.

### 3. 프리필된 날짜에는 "이 날짜가 양력이 맞나요?" 확인을 **강제**한다 (제출 차단)

토스가 주는 것은 등록된 생년월일 문자열뿐이고, **그게 양력인지 음력인지 알려주는 필드가 없다.**
한국에서는 음력 생일을 그대로 등록해 둔 사용자가 드물지 않다.

음력 날짜도 대개 **존재하는 양력 날짜**라서 어느 쪽으로 읽어도 엔진이 거절하지 못한다. 오류 없이
통과하고, 네 기둥이 통째로 다른 사주가 나온다. 이건 "실패"가 아니라 **조용한 오답**이고, 사용자도
우리도 알아챌 방법이 없다.

그래서 확인을 문구가 아니라 **상태**로 둔다: `confirmingSolar` 단계에서는 CTA 를 잠근다
(`blocksSubmit`). 안 물어보고 넘어가는 경로를 코드에 남기지 않는다.

- "네, 양력이에요" → 그대로 진행
- "아니요, 음력이에요" → **같은 날짜를 음력으로 읽는다**(`setCalendarType`)

사용자가 시트에서 **직접 고른** 날짜에는 이 확인을 붙이지 않는다. 그 시트에서 달력까지 사용자가
고른다. 위험은 "사용자가 고르지 않았는데 채워진 날짜"에만 있다.

> **개정 (음력 지원 이후).** 이 문서의 원안은 "아니요, 음력이에요" 에서 **채운 날짜를 버렸다**
> (`clearDate` → "음력은 준비 중"). 엔진이 음력을 지원하는 지금은 버리지 않는다 — 사용자가 "음력이에요"
> 라고 답했다는 것은 **그 세 숫자가 음력 날짜**라는 뜻이므로, 버리면 같은 값을 다시 입력하게 만드는 셈이다.
> **확인을 강제한다는 결정 자체는 바뀌지 않는다.** 엔진이 음력을 지원해도 토스 데이터에는 여전히 달력
> 종류 필드가 없고, 달력을 아는 것은 사용자뿐이기 때문이다.
> 다만 **윤달 여부는 프리필로 알 수 없다.** 평달로 두고 폼이 윤달 확인을 요청한다(`prefillNotice`).
> 음력에 없는 날짜(31일 등)일 때만 원안대로 날짜를 비운다.

### 4. 파싱 실패는 조용히 넘기지 않는다

SDK 타입은 `Partial<Record<ConsentedUserDataKey, string>>` 이다 — 전 필드 옵셔널, 전부 `string`.
"`YYYY-MM-DD` 로 온다"는 보장이 타입에 **없다**. 그래서 `YYYY-MM-DD` · `YYYYMMDD` · `YYYY.MM.DD` ·
`YYYY/M/D` 를 관대하게 읽되, **값이 왔는데 못 읽으면 프리필 전체를 실패**로 만든다(부분 적용 금지).
성별도 같다(`M`/`F`/`MALE`/`FEMALE`/`남`/`여`/`남성`/`여자` …).

두 가지는 일부러 **거부**한다:

- **날짜+시각 문자열**(`1995-03-05T00:00:00Z`): 앞 10자를 잘라 쓰면 UTC 자정으로 직렬화된 KST 생일이
  하루 앞당겨진 채 통과한다. 못 읽는 편이 낫다.
- **숫자 성별 코드**(`1`/`2`): 체계마다 뜻이 달라 추측하면 반반 확률로 틀린다.

### 5. 예외를 밖으로 내보내지 않는다 — 전부 판별 유니온

미니앱 WebView 에서 렌더 경로로 예외가 새면 사용자가 보는 것은 오류 화면이 아니라 **흰 화면**이다.
SDK 는 실제로 던진다:

- `User.getConsentedData` 는 `withUnsupportedThrow` 래퍼라 미지원 환경에서 `UNSUPPORTED_APP_VERSION` 을 던진다.
- **`isSupported()` 조차 WebView 밖에서는 던진다** — `getConstant()` 가 `window` 를 읽는다.
  실측: `ReferenceError: window is not defined` (노드 테스트 러너, 브라우저 프리뷰).
  이 함수는 렌더 중에 호출되므로, 여기서 새면 첫 화면이 통째로 비어 버린다.

`fetchTossProfile` 은 `{ok:true, birthday?, gender?} | {ok:false, reason}` 만 반환하고
`isPrefillSupported()` 는 try/catch 로 `false` 를 낸다.

| SDK 오류 코드 | 사유 | 화면 |
|---|---|---|
| `USER_DECLINED` · `CANCELED` | `DECLINED` | 버튼 유지(다시 시도) · 토스트 없음 |
| `UNAVAILABLE` · `UNSUPPORTED_APP_VERSION` · 반환값 `undefined` | `UNSUPPORTED` | **버튼 숨김** |
| `TERMS_NOT_SET` · `INVALID_REQUEST` · 키 미설정 | `NOT_CONFIGURED` | **버튼 숨김** |
| 그 외 · 형식 파손 | `FAILED` | 버튼 유지(다시 시도) |

`INVALID_REQUEST` 를 `NOT_CONFIGURED` 로 접는 이유: 잘못된 키·파라미터는 **사용자가 고칠 수 없다.**
다시 시도를 권하는 대신 버튼을 감춘다.

### 6. 동의 항목 키를 소스에 박지 않는다

`DEFAULT_CONSENT_KEY = ''`(미발급) + `import.meta.env.VITE_TOSS_CONSENT_KEY` 오버라이드.
**미설정이면 SDK 를 부르지 않고** `NOT_CONFIGURED` 를 내고, 화면은 버튼 자체를 그리지 않는다.
현재 콘솔 키가 미발급이므로 지금 빌드에서 이 버튼은 **보이지 않는다** — 기존 수동 입력 경로가 그대로다.

## 부수 효과

- 초기 청크가 늘었다: 1,330.42 kB → **1,336.37 kB**(gzip 419.24 → **421.05 kB**, +1.81 kB).
  `@apps-in-toss/web-framework` 가 온보딩 화면에서 처음으로 정적 import 된다.
  `ARCHITECTURE.md`「번들 분할」표의 수치는 이 시점 이후로 갱신이 필요하다.
- 달력 규칙(`isValidSolarDate` · 지원 연도 1900~2100)은 `features/onboarding/calendar.ts` 한 곳에만 둔다.
  `shared` 는 기능 도메인을 import 할 수 없으므로(ARCHITECTURE.md 의존 방향), 경계 모듈은 **형식만**
  판정하고(연 4자리·월 1~12·일 1~31) 실재 날짜 판정은 `applyTossPrefill` 이 한다. 같은 달력 규칙을
  두 벌 두지 않기 위한 분담이다.
- `OnboardingDraft` 에는 필드를 추가하지 않았다. 프리필 단계는 입력값이 아니라 화면 흐름이라
  별도 상태 기계(`tossPrefill.ts`)에 둔다. `clearDate` 액션 하나만 늘었다.

## 콘솔에 등록할 동의 항목 사양

파트너센터에서 동의 항목을 만들 때 **포함 필드는 두 개뿐**이어야 한다.

| 항목 | 값 |
|---|---|
| 포함 필드 | `USER_BIRTHDAY`, `USER_GENDER` |
| 제외 필드 | `USER_NAME`, `USER_PHONE`, `USER_EMAIL`, `USER_ADDRESS`, `USER_NATIONALITY`, `USER_CONSUMPTION_HISTORY` |
| 이용 목적 | 사주 계산 입력(네 기둥·대운 방향) 자동 입력 |
| 보관 | 저장하지 않음. 세션 내 화면 상태로만 사용하고 서버로 보내지 않는다 |
| 최소 앱 버전 | Android/iOS **5.264.0** (`User.getConsentedData.MIN_TOSS_APP_VERSION`) |

발급받은 키는 `VITE_TOSS_CONSENT_KEY` 로 주입한다. 키를 넣기 전까지 버튼은 나타나지 않는다.
