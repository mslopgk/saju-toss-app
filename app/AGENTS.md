# 사주믹스 (sajumix)

사주·MBTI·혈액형·별자리를 한 번에 합쳐 보는 종합 운세 앱인토스 미니앱.

## 명령

```bash
npm run dev        # vite --host 0.0.0.0 (WebView 실기기 접속용 --host 필수)
npm run typecheck  # tsc -b --noEmit
npm test           # vitest run (엔진 골든셋 + 온보딩 + 지식베이스 + 해석 레이어 전건)
npm run lint       # oxlint
npm run build      # tsc -b && vite build && ait build → sajuapp.ait
npm run ui-smoke   # 실제 Chrome 으로 빌드된 앱을 몰아 본다 (레이아웃 검증은 여기뿐)
npm run deploy     # ait deploy (검수·배포 단계에서만)

npm run gen-store-assets   # 콘솔용 로고·썸네일 → docs/store (색·문구 바꿀 때만)
npm run optimize-assets    # 생성 에셋 원본 PNG → 화면 크기 WebP (에셋을 새로 받은 뒤)
npm run ui-smoke -- --shots docs/store   # 스토어 스크린샷 636x1048 재촬영
```

검증은 `npm test` → `npm run typecheck` → `npm run lint` → `npm run build` → `npm run ui-smoke` 순으로 한다.

**`ui-smoke` 를 건너뛰지 않는다.** 나머지 검증은 전부 `react-dom/server` 정적 렌더라 **크기·위치를
보지 못한다.** 그 틈으로 날짜/시각 휠이 통째로 접힌 채 나간 적이 있다(§휠 높이). 예외가 나지 않는
종류의 깨짐은 이 스크립트만 잡는다.
vitest 설정은 루트 `vitest.config.ts` **하나**다. 영역별 설정을 `src` 안에 만들지 않는다 —
tsconfig.app.json 의 타입체크 대상(`include: ["src"]`)에 끌려들어온다.

## 구조

```text
src/
├── main.tsx            # TDSMobileAITProvider 래핑 (진입점)
├── App.tsx             # 화면 조합 + 2단계 상태(onboarding → result) + EngineError 문구 매핑
├── pages/              # 화면 단위 (OnboardingPage · ResultPage)
├── features/
│   ├── onboarding      # 생년월일시·성별·출생지 + MBTI·혈액형(선택) 입력
│   └── report          # 규칙 기반 리포트 조립(buildReport) + 표시(ReportView)
└── shared/
    ├── lib/saju        # 계산 엔진 (결정론 순수함수)
    ├── data            # 빌드타임 데이터 자산 (tables.json · 절기 팩)
    ├── knowledge       # 해석용 지식카드 198장 + 검색 (cards.json 단일 산출물)
    └── interpret       # 팩트팩 → 카드검색 → (규칙 렌더러 | 프롬프트 조립 → 응답검증)
                        #   화면은 `shared/interpret/ui` 에서만 가져온다(배럴 금지)
scripts/
├── build-knowledge.mjs     # cards.json 굽기
├── ui-smoke.mjs            # 실제 Chrome 구동 검증 (레이아웃을 보는 유일한 곳)
└── gen-store-assets.mjs    # 콘솔용 로고·썸네일 → docs/store
docs/store/             # 콘솔 등록용 이미지(규격 고정) + 생성 에셋 **원본**
                        #   원본을 지우지 않는다 — 다시 뽑으면 같은 그림이 나오지 않는다
src/assets/generated/   # optimize-assets 산출물. 앱이 실제로 쓰는 것은 이쪽뿐이다
apps-in-toss.config.ts  # ait init 산출물 — 손으로 고치지 말고 CLI로 재생성
```

의존 방향과 경계 규칙은 [ARCHITECTURE.md](./ARCHITECTURE.md).

## 불변 조건

1. **TDS 우선.** 버튼·리스트·배지·타이포·색상은 `@toss/tds-mobile` 컴포넌트·토큰을 먼저 쓴다. 존재하는 TDS 컴포넌트를 HTML/CSS로 재현하지 않는다. TDS API를 기억으로 추측하지 말고 `node_modules/@toss/tds-mobile/dist/esm/index.d.ts` 또는 공식 문서를 확인한다.
2. **전역 스타일로 TDS를 덮지 않는다.** `src/index.css` 는 박스모델·마진 리셋만 담는다. 색·폰트·간격은 TDS 토큰이 담당한다.
3. **`apps-in-toss.config.ts` 를 손으로 만들지 않는다.** `npx ait init` 으로만 생성/갱신한다.
4. **계산 로직은 명세를 따른다.** 사주·별자리·궁합 계산은 추측하지 말고 아래 명세를 근거로 구현한다.
5. **외부 데이터는 `shared/api` 경계에서 타입 검증**한 뒤 앱 내부로 전달한다.
6. **시스템 프롬프트를 클라이언트 번들에 넣지 않는다.** 화면은 `shared/interpret`(배럴)이 아니라
   `shared/interpret/ui` 에서만 import 한다. 회귀는 `src/shared/interpret/ui.test.ts` 와
   빌드 후 `grep '사실 규율' dist/assets/*.js` (0 이어야 한다)로 이중 확인한다.
7. **음력 입력을 지원한다(양력·음력·음력 윤달).** 음력 표(C00 A7)는 `src/shared/data/lunar-table.packed.ts`
   **한 벌**이고, 화면과 엔진이 같은 `shared/lib/saju/lunar` 를 부른다. 표는 빌드타임에
   `src/shared/data/tools/gen-lunar-table.mjs` 가 npm `manseryeok`(MIT, dev 전용)에서 뽑아 굽는다 —
   **런타임·프로덕션 의존은 0**이다. 표를 다시 구우면 `ENGINE_VERSION` 을 올려야 한다(§7.3 버전 정책).
   - 온보딩은 날짜 시트에서 달력을 고르고, 월 휠은 **그 해에 실제로 있는 달만** 보여 준다(윤달 체크박스 없음).
   - 엔진 S0 이 환산해 `NormalizedInput.solar` 에 넣고 원본은 `lunarSource` 에 남긴다. `lunarSource` 는
     **표시 전용**이라 캐시 키(`chartKeyInput`)에 넣지 않는다 — 넣으면 같은 양력일이 두 키로 갈린다(§S0-2 b).
   - 지원 범위(1900~2100)는 **환산된 양력**으로 판정한다. 없는 음력 날짜는 `INVALID_LUNAR_DATE`.
   - `shared/lib/saju/lunar.ts` 는 데이터 파일 말고 **아무것도 import 하지 않는다** — 온보딩(초기 청크)이
     딥 임포트하기 때문이다. 회귀는 `test/saju/lunar.test.ts` 가 소스를 훑어 고정한다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/product.md](./docs/product.md) | 대상 사용자, 문제, 핵심 흐름, MVP 범위 |
| [docs/design-system.md](./docs/design-system.md) | TDS 패키지·Provider 위치·사용 컴포넌트 |
| [docs/decisions/](./docs/decisions/) | 되돌리기 어려운 결정 기록 |
| [../docs/research/calc/C00-계산엔진-통합명세서.md](../docs/research/calc/C00-계산엔진-통합명세서.md) | **계산 엔진 단일 명세** — 유파 분기 결정표 포함 |
| [../docs/research/00-종합-리서치-브리프.md](../docs/research/00-종합-리서치-브리프.md) | 플랫폼·시장·법률 리서치 종합 |

계산을 건드리기 전에 `C00` 의 **유파 분기 결정표**를 먼저 읽는다. 같은 입력에 다른 답이 나오는 지점이 문서화되어 있고, 임의로 바꾸면 회귀 테스트가 깨진다.

## 이미 한 것 (착각하기 쉬운 것만)

- **규칙 기반 해석 리포트가 동작한다.** LLM·서버·네트워크 없이 결과 화면이 채워진다 — 렌더러가 낼 수
  있는 섹션은 11개이고, 실측(1990-05-15 14:30 서울 남)으로 자기신고 없이 8섹션 3,265자,
  MBTI·혈액형까지 넣으면 10섹션 4,029자가 나온다.
  `features/report` → `shared/interpret/template.ts`. 문장은 지식카드 본문에서 슬롯을 뽑아 조립하고,
  근거 카드 id 를 `usedCardIds` 로 남긴다. 출력 타입은 LLM 응답과 **같은 `Interpretation`** 이다.
- **S5(신강신약·격국·용신)가 리포트에 배선돼 있다.** 엔진 → 팩트팩 → 검색 → `strength` 섹션까지 이어진다.
  섹션이 쓰는 숫자는 오행 점수 5개 + 신강지수 1개가 전부이고 **전부 엔진 값 그대로**다 — 렌더러는
  정렬·임계값 판정·가중합을 하지 않는다. 억부 카드의 조건문("신약이면 …")은 **쓰지 않는다**:
  조후·종격 경로로 뽑힌 용신과 어긋나 카드가 엔진 결과를 부정하게 된다.
- **카드 선별은 두 패스다.** `selectKnowledgeCards` 가 ① 아직 없는 분류의 1등을 먼저 확보하고
  ② 남은 자리를 점수로 채운다. 점수 한 줄로만 담으면 카드가 많은 분류(십신 10장)와 근거등급이 높은
  분류(신강지수 A)가 예산을 먹고 일간·십이운성이 밀려나는데, 그 결과는 **에러가 아니라 섹션이
  조용히 사라지는 것**이라 알아채기 어렵다. 분류별 상한(`maxPerKind`)도 같은 이유로 있다.
- **MBTI·혈액형을 온보딩에서 받는다.** 둘 다 선택 입력이고 "모름"이 정상값이다(CTA 를 막지 않는다).
  계산에는 쓰이지 않는다 — `Chart` 에 섞지 않고 `SelfReport` 로 따로 흐른다.
- **팩트팩이 기둥별 십신 이름(`tenGodPlacements`)을 낸다.** S4-1 룩업 결과의 투영이며 새 수치가 아니다.
  `tenGodNames` 로 "원국에 실제로 있는 십신"을 걸러야 한다 — 그룹 태그 검색은 없는 십신의 카드도 함께 준다.
- **휠 높이는 `WheelColumn` 이 들고 있다(240px). 지우면 화면이 조용히 깨진다.**
  TDS `Wheel` 은 최상위가 `height:100%` 라 **고유 높이가 없다** — 선택칸 `16%`, 위아래 그라데이션 각 `42%`
  전부 부모 높이에 걸려 있다. 부모가 확정 높이를 안 주면 0 으로 접히고, 항목이 `position:absolute` +
  `matrix3d` 라 **예외도 경고도 없이** 연도 201개가 한 줄에 겹쳐 그려진다. 실제로 그 상태로 배포돼
  있었고 테스트 1,900개가 전부 초록이었다(SSR 은 `BottomSheet` 본문을 아예 안 그린다).
  회귀는 `WheelColumn.test.tsx`(높이 존재)와 `npm run ui-smoke`(실제 렌더 높이) 두 겹으로 막는다.
  휠을 담는 행에 `alignItems: 'center'` 를 주지 않는다 — 늘어나지 못해 같은 증상이 난다.
- **화면에 나가는 출처는 `formatSourceLabel()` 을 거친다.** `source.doc` 은 저장소 파일명이고
  `source.section` 뒤에는 `(+ tables.json …)` 상호참조가 붙어 있다. 그대로 찍으면 소비자 앱에
  내부 경로가 노출된다 — 실제로 `C04-…-룩업테이블.md §7-12 §12-1 (+ tables.json gosinGwasuk)` 가
  결과 화면에 보이고 있었다. **새는 곳이 두 군데**라 `doc` 만 고치면 절반만 막힌다.

- **생성 에셋은 원본과 배포본이 따로다.** Higgsfield 가 내는 2048px PNG 는 장당 4.7~6.4MB 라
  그대로 번들에 넣을 수 없다(46장이면 215MB). `docs/store/` 에 원본을 두고
  `npm run optimize-assets` 가 세트별 실사용 크기 WebP 로 굽는다 — 실측 71.7MB → 103KB.
  히어로 800px · 배경 720px · 카드 아이콘 320px 로 나눈 이유는 아이콘 하나에 히어로만 한
  용량을 쓰지 않기 위해서다.
  - **원본 PNG 를 지우지 않는다.** 크기 정책이 바뀌거나 다른 용도로 다시 뽑아야 할 때
    원본이 없으면 Higgsfield 를 다시 돌려야 하는데 **같은 그림이 나오지 않는다.**
  - `shared/assets` 는 엔진 값(오행·사인 id·지지·십신 그룹)을 주소로 옮기기만 한다.
    무엇을 보여 줄지 **판정하지 않는다** — 그 판정은 엔진이 이미 했다(C00 §H).
    없는 에셋은 `null` 이고 던지지 않는다. 한 장 빠졌다고 화면이 죽으면 안 된다.
  - `import.meta.glob` 에 `query: '?url'` 을 빼면 4KB 미만 파일이 base64 로 JS 안에 인라인돼
    초기 청크가 커진다. URL 로 받아야 이미지가 별도 파일로 남는다.
  - 에셋 생성 시 Higgsfield **동시 작업 한도는 8개**다. 넘기면 `rate_limit_reached` 로 실패한다.
  - **에이전트를 병렬로 돌릴 때 스크립트 경로를 공유하지 않는다.** 십이지 첫 판이 12장 중 9장
    똑같은 연꽃으로 나왔는데, 원인은 프롬프트가 아니라 **경로 충돌**이었다 — 두 에이전트가 같은
    스크래치패드에 인자 순서가 다른 `gen.sh` 를 각자 써서, 한쪽 호출의 `"1:1"` 이 프롬프트 자리로
    들어갔다. 산출물은 유효한 PNG 였고 개수도 맞아 **개수 검사로는 잡히지 않는다.**
    에이전트마다 전용 디렉터리를 주고, 결과는 반드시 눈으로(컨택트 시트) 본다.
  - 세트 하나에 **에이전트를 둘 이상 배정하지 않는다.** branch 를 에이전트와 내가 동시에 굽는 바람에
    같은 디렉터리에 서로 다른 판이 섞여 들어갔다. 최종본은 검수로 걸렀지만 낭비였다.

## 아직 하지 않은 것

- 로그인·결제·광고 연동
- **실기기 테스트** — `npm run ui-smoke` 가 데스크톱 Chrome 에서 빌드된 앱을 실제로 몰아 보므로
  "레이아웃이 성립하는가"까지는 확인된다(온보딩 → 날짜·시각 휠 스와이프 → 결과 리포트, 17개 검사.
  `--prefill` 을 붙이면 토스 프리필 버튼까지 19개).
  하지만 **토스 WebView 에서 도는 것은 여전히 아무도 보지 않았다** — 안드로이드 Chromium /
  iOS WKWebView, 실제 터치, 세이프에어리어, 폰트 스케일, 네트워크. 검수 전 마지막 관문.
- **콘솔 앱정보 등록 · 출시 검수 요청** — `ait deploy` 는 테스트 채널(`intoss-private`)까지다.
  일반 공개는 콘솔에서 '검토 요청' → 검수 3~5영업일 → '출시' 를 눌러야 한다(문서02 §1).
  **이 단계는 사람이 판단한다 — 에이전트가 대신 누르지 않는다.**
  - 콘솔 MCP 의 `miniapp_update_*` 는 전부 **"수정 + 검토 요청"이 한 몸**이다. 초안 저장이 없으므로
    값 하나를 시험 삼아 넣어 볼 수 없다. 전부 확정한 뒤 한 번에 보내야 한다.
  - 등록에 쓸 자산은 `docs/store/` 에 구워져 있다(로고 600x600 라이트·다크, 가로 썸네일 1932x828,
    세로 스크린샷 636x1048 5장). 재생성은 위 명령 두 줄.
  - 콘솔 웹에서만 되는 것 둘: **워크스페이스 제휴 약관 동의**(대표관리자,
    `releaseDecision: WORKSPACE_TERMS_AGREEMENT_REQUIRED_FROM_OWNER`)와 **사용 연령**
    (현재 기본값 19~99세 — 운세 앱에 19금은 과하다). MCP 에 해당 tool 이 없다.
- **LLM 해석은 분할 호출이다(요약 1 + 카드 N).** 한 번에 3,000자를 뽑던 구조를 쪼갰다 —
  단일 호출은 **93.8초**였고 화면이 그동안 규칙 기반 글만 보여 줬다.
  - 실측(2026-08-19, opus-5): **첫 결과 5.8초** · 전부 도착 58.8초 · 390원 · 본문 4,223자.
    분할 전은 93.8초 / 262원 / 2,812자였다. **글자당 원가는 0.093 → 0.092원으로 같다** —
    비싸진 게 아니라 글을 1.5배 더 쓰는 것이다.
  - **캐시 브레이크포인트가 원가의 절반을 좌우한다.** 접두를 공유하도록 만들어 놓고
    `cache_control` 을 system 에만 걸면 팩트팩·지식카드(약 5,800토큰)가 호출마다 전액 과금된다
    (그 상태 실측 565원). `toMessagesApiParams` 가 user 턴을 두 블록으로 나눠 접두에도 건다.
    회귀는 `split.test.ts` 의 "user 턴 접두에 cache_control 이 걸린다" 가 고정한다.
  - **카드를 전부 병렬로 쏘면 안 된다.** 접두 캐시는 사람마다 콜드라, 동시에 쏘면 전부
    캐시를 *쓰고*(입력가의 1.25배) 아무도 못 읽는다(실측 633원). `interpretCards` 가
    **첫 장으로 데운 뒤 나머지를 병렬로** 보낸다.
  - **요약과 카드는 캐시를 공유하지 못한다.** 출력 스키마가 달라 프리픽스가 갈린다
    (캐시읽기 3,257 vs 3,048 로 실측). 워밍은 카드끼리만 성립한다.
  - **모델이 지어내는 퍼센트는 프롬프트로 못 막았다.** `15%` 를 금지하니 `20%` 를 썼다.
    금지 대신 엔진이 올바른 값을 준다 — `FactPackStrength.elementPercent`(합 80 기준).
    그 뒤 거부 0건. 숫자를 막을 게 아니라 **맞는 숫자를 주는 것**이 이 프로젝트의 규율이다.
- **해석 서버가 실제로 돌고 있다.** `https://sajumix.kodekorea.kr/api/*`
  (blend 서버, Docker `~/sajumix-stack`, 127.0.0.1:8787 에만 바인딩 + Caddy 프록시).
  그 서버에는 node 가 없어 컨테이너로 돈다 — 공유 장비라 시스템 패키지를 얹지 않았다.
  이미지는 `dist/main.mjs` 와 런타임 의존 둘만 담는다(번들이 앱 코드까지 포함하므로 소스 불필요).
  - 앱은 아직 이 주소를 **보지 않는다**. `VITE_INTERPRET_API_BASE` 가 비어 있으면 서버를 부르지
    않고 규칙 기반으로만 돈다 — 화면 재설계(계획 C)와 함께 켠다.
  - **켜는 순간 개인정보처리방침이 이미 그 상태를 반영하고 있어야 한다.** 이미 개정해 뒀다
    (제2판: 국외 이전 Anthropic/미국, 해설 문장 24시간 메모리 캐시). 되돌리면 방침이 거짓이 된다.
- **토스 프리필은 버튼 없이 자동으로 돈다.** 화면이 뜨면 `OnboardingForm` 의 마운트 이펙트가
  `startsAutomatically()` 를 보고 스스로 부른다. 버튼은 **거부·실패 뒤의 재시도 수단**으로만 남는다.
  - 자동 호출은 `requestAgreementAgain: false` 로 나가므로 **한 번 거부한 사용자에게 동의 화면을
    다시 띄우지 않는다.** 재요청은 사용자가 직접 눌렀을 때만(`shouldRequestAgreementAgain('declined')`).
    이 짝을 깨면 앱을 켤 때마다 동의 화면이 뜨는 앱이 된다.
  - 실패해도 수동 입력 폼은 **항상** 그려진다. 회귀는 `npm run ui-smoke -- --prefill` 이 본다
    (SSR 테스트는 `useEffect` 를 실행하지 않아 자동 호출 자체를 볼 수 없다).
- **토스 프리필 실동작** — **구현은 끝났다**(경계 `shared/api/tossUser.ts` · 도메인 상태기계
  `features/onboarding/tossPrefill.ts` · 화면 배선 `OnboardingForm.tsx`, 테스트 53개,
  `docs/decisions/0004-toss-prefill-boundary.md`). 남은 것은 확인뿐이다.
  - 버튼·고지 문구의 **렌더는 확인됐다**: `VITE_TOSS_CONSENT_KEY=preview npm run build &&
    npm run ui-smoke -- --prefill`. SDK 의 `isSupported()` 가 보는 전역 하나만 심는 방식이라
    프로덕션 코드는 손대지 않는다.
  - **버튼을 누른 뒤는 토스 앱 안에서만 확인된다.** 동의 → 생년월일 수신 → "이 날짜가 양력이
    맞나요?" 확인 블록까지는 호스트 브릿지가 실제로 응답해야 한다. 분기 로직은
    `tossPrefill.test.ts` 가 전수로 고정하므로 미확인으로 남는 것은 **그 블록의 레이아웃**뿐이다.
  - 콘솔 동의 항목 키가 미발급이라 **실배포본에서는 버튼이 아예 그려지지 않는다**(의도된 동작 —
    눌러도 실패할 버튼은 보이지 않는다). 키가 나오면 `VITE_TOSS_CONSENT_KEY` 로 주입한다.
    콘솔에 등록할 동의 항목은 `USER_BIRTHDAY` + `USER_GENDER` **둘뿐**이어야 한다(결정 0004).
- 지식카드 198장 중 **178장이 도달 가능**하다(실측: `computeChart()` 스윕 1,728건).
  남은 20장은 원리적 불가 사유가 확정돼 있다: 대운 간지관계 15(운↔원국 합충 판정을 엔진이 내지
  않고, 카드 본문이 통째로 점수 가중표라 인용할 문장도 없다) · 융합 일치도 4(0~100 Coherence 정의가
  C00 에 없어 렌더러가 만들면 숫자 규율 위반) · 병약 용신 1.
  (목록은 `retrieve.test.ts` 의 `PENDING_CARD_AXES`, 바닥은 `e2e.test.ts` 의 도달률 회귀가 고정한다.)
  `cards.json` 전량이 번들에 실리므로 도달 가능 카드만 굽는 것은 번들 축소 후보다.
