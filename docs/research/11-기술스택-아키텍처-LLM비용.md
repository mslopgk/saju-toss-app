# 사주+MBTI+혈액형+별자리 토스 미니앱 — 기술 스택 · 아키텍처 · LLM 운영비 산정

> 조사 축: 기술 스택 · 아키텍처 · LLM 운영비 산정 | 상태: 초안 | 검증도: 중상

조사일: 2026-08-11 / 환율 가정: **1 USD = 1,450 KRW** (계산 편의용 고정값, 실제 청구는 USD)

---

## 0. TL;DR — 이 문서의 결론 6줄

1. **앱인토스는 SSR을 금지한다.** 비게임 출시 체크리스트에 "서버 사이드 렌더링(SSR)은 사용할 수 없어요. 클라이언트 사이드 렌더링(CSR) 또는 정적 사이트 생성(SSG) 방식만 사용할 수 있어요"가 명시 → **Next.js를 쓰더라도 `output: 'export'` (SSG) 전용**. App Router의 RSC/Server Actions는 사실상 불가.
2. **`eval` 등 외부 코드 실행 금지** → 서드파티 분석 스크립트 동적 로딩 전략을 재검토해야 한다.
3. **번들 100MB 이하**, 인터랙션 응답 2초 이내, 검토 최대 영업일 3일(카테고리별 7일+).
4. **만세력은 클라이언트 계산이 정답.** 1900~2050 데이터가 gzip 95KB로 압축된 실측 사례(`@fullstackfamily/manseryeok`)가 있고, 1900~2100 확장 시에도 gzip 150~300KB 수준.
5. **백엔드는 Vercel(icn1 서울) 또는 Supabase(ap-northeast-2 서울)** 가 레이턴시상 유리. Cloudflare Workers는 엣지는 좋지만 D1 primary 리전 문제가 남는다.
6. **리포트 1건 원가**: Opus 5 ≈ **$0.110 (160원)**, Sonnet 5 (도입가) ≈ **$0.044 (64원)**, Haiku 4.5 ≈ **$0.022 (32원)**. 프롬프트 캐싱 적용 시 입력측 **70.7% 절감**, Batch API 병행 시 총 **~50% 추가 절감**.

---

## 1. 앱인토스 플랫폼 제약 (검증된 사실)

### 1.1 두 가지 개발 경로

| 항목 | 웹뷰 (Web) | React Native (Granite) |
|---|---|---|
| 필수 패키지 | `@apps-in-toss/web-framework` | `@apps-in-toss/framework` |
| 디자인 시스템 | `@toss/tds-mobile`, `@toss/tds-mobile-ait` | `@toss/tds-react-native` |
| 프로젝트 생성 | 기존 웹 프로젝트에 SDK 연동 (`npx ait init`) | `npm create granite-app@"^1"` |
| 설정 파일 | `granite.config.ts` (필수) | `granite.config.ts` (필수) |
| 기본 번들러 커맨드 | `vite dev` / `vite build` (기본값) | `npm run dev` / `npm run build` |
| 피어 의존성 | `@emotion/react@^11`, `react@^18`, `react-dom@^18` | RN 계열 |
| 로컬 브라우저 테스트 | 가능 (TDS 일부 제외) | **TDS는 로컬 브라우저에서 동작 안 함** → 샌드박스앱 필수 |
| 적합한 팀 | 기존 웹 자산 재활용, 빠른 출시 | 네이티브 수준 UI/UX, 복잡한 제스처·애니메이션 |

`granite.config.ts` 최소 형태 (RN 기준, 공식 문서 발췌):

```ts
export default defineConfig({
  appName: '<app-name>',           // 딥링크 intoss://{appName} 및 배포 키로 사용되는 고유 식별자
  plugins: [
    appsInToss({
      brand: {
        displayName: '앱 이름',
        primaryColor: '#3182F6',
        icon: null,
      },
      permissions: [],
    }),
  ],
});
```

### 1.2 하드 제약 목록 (비게임 출시 체크리스트 기준)

| # | 제약 | 아키텍처 함의 |
|---|---|---|
| C1 | **SSR 불가** — CSR 또는 SSG만 허용 | Next.js App Router의 RSC/Server Actions/ISR 전면 불가. `next build && next export` 또는 Vite SPA |
| C2 | **`eval` 등 외부 코드 실행 금지** — "외부에서 전달받은 코드를 실행하는 기능은 사용할 수 없어요" | 서드파티 태그 매니저(GTM 컨테이너), 동적 스크립트 주입, JIT 템플릿 엔진 회피 |
| C3 | **WebSocket은 `wss://` 만** | 실시간 스트리밍 리포트 구현 시 TLS 필수 |
| C4 | **인터랙션 응답 2초 이내** | LLM 동기 호출을 UI 블로킹 경로에 두면 탈락. 스트리밍/낙관적 UI 필수 |
| C5 | **번들 100MB 이하** | 만세력 테이블 300KB는 문제 없음 |
| C6 | **결제는 토스페이 / 스토어 IAP 만** | 자체 PG·외부 결제 링크 금지 |
| C7 | **토스 로그인 외 인증 방식 금지** | 자체 회원가입/소셜 로그인 불가 → user identity = `userKey` |
| C8 | **자사 서비스/앱 설치 유도 금지** | 외부 웹으로 리포트 전문 유도 금지 |
| C9 | **공유는 `intoss://` 스킴** (`intoss-private://` 금지) | 공유 카드 딥링크 설계에 반영 |
| C10 | **브라우저 히스토리 조작으로 사이트 이동 금지** | 라우터 구현 주의 |
| C11 | **자동 바텀시트 오픈 금지** | 온보딩 UX 재설계 |
| C12 | 로그인 화면에서 닫기 → 미니앱 종료 / 연결 해제 시 사용자 데이터 잔존 금지 | `userKey` 기준 하드 삭제 API 필요 |

### 1.3 배포 · 검토 · 테스트

| 항목 | 값 |
|---|---|
| 검토 소요 | 영업일 기준 **최대 3일**, 카테고리에 따라 **7일 이상** |
| 검토 요청 전제 | **QR 테스트 1회 이상 완료** 시 버튼 활성화 |
| 샌드박스 테스트 URL (SDK 3.x) | `https://<appName>.private-web.tossmini.com` |
| 샌드박스 테스트 URL (SDK 1.x~2.x) | `https://<appName>.private-apps.tossmini.com` |
| 배포 채널 | 단일 채널, 출시 시 전체 사용자 즉시 반영 |
| 롤백 | 이전 출시 버전으로 즉시 전환 지원 |
| 긴급 수정 | 채널톡 문의 |

### 1.4 토스 로그인 (서버 연동 스펙 — 검증됨)

| 항목 | 값 |
|---|---|
| API 베이스 | `https://apps-in-toss-api.toss.im` |
| 토큰 발급 | `POST /api-partner/v1/apps-in-toss/user/oauth2/generate-token` |
| 사용자 조회 | `GET /api-partner/v1/apps-in-toss/user/oauth2/login-me` |
| 토큰 재발급 | `POST /api-partner/v1/apps-in-toss/user/oauth2/refresh-token` |
| 연결 해제(accessToken) | `POST /api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-access-token` |
| 연결 해제(userKey) | `POST /api-partner/v1/apps-in-toss/user/oauth2/access/remove-by-user-key` |
| 서버 인증 | 파트너 발급 **클라이언트 인증서 기반 mTLS** + OAuth2 |
| accessToken 유효기간 | **1시간** |
| refreshToken 유효기간 | **14일** |
| 요청 한도 | **앱당 분당 3,000회** |
| 필수 응답 필드 | `userKey` (정수형 고유 식별자) |
| 동의 기반 선택 필드 | `name`, `email`, `phone`, `birthday`(YYYYMMDD), `gender`(M/F), `ci`, `di`, `nationality`, `callingCode`, `agreedTerms`, `scope` |

> **사주 앱 관점의 결정적 이점**: `birthday`(YYYYMMDD)와 `gender`를 토스 로그인에서 동의 기반으로 받을 수 있다. 다만 **출생 시각(시/분)은 제공되지 않으므로** 시주(時柱) 입력 UI는 자체 구현 필수. `ci`(연계정보)를 받으면 재설치 후에도 동일 인물 식별이 가능하지만, 사주 앱에 CI를 요구하는 것은 심사·개인정보 리스크가 크므로 **`userKey` 단독 사용을 권장**.
>
> mTLS 요구는 아키텍처에 직접적 영향을 준다 → **Cloudflare Workers에서 클라이언트 인증서 mTLS 아웃바운드 호출은 mTLS 인증서 바인딩 기능이 필요**하며 제약이 있을 수 있다 `[미검증]`. Node.js 런타임(Vercel Node / AWS Lambda)에서 `https.Agent({ cert, key })`로 처리하는 편이 확실하다.

---

## 2. 프론트 스택 3안 비교 및 권장안

| 항목 | (A) React Native / Granite | (B) 웹뷰 + Vite React SPA | (C) 웹뷰 + Next.js (static export) |
|---|---|---|---|
| 앱인토스 공식 지원 | ★★★ 1급 (`@apps-in-toss/framework`) | ★★★ 1급 (`@apps-in-toss/web-framework`) | ★★ 웹뷰 경로로 동작하나 기본값은 Vite |
| SSR 제약(C1) 충돌 | 해당 없음 | 해당 없음 | **`output: 'export'` 강제.** RSC/Server Actions/ISR/`next/og` 라우트 전부 불가 |
| 네이티브 UI 일관성 | 최상 (TDS RN) | 중 (TDS Mobile 웹) | 중 |
| 라이브러리 자유도 | **낮음** — "네이티브 모듈이 필요한 라이브러리는 앱인토스에서 지원하는 범위 내에서만" | 높음 (순수 JS 전부) | 높음 |
| 만세력 JS 라이브러리 사용 | 가능 (순수 JS라면) | 가능 | 가능 |
| 애니메이션/제스처(사주 카드 인터랙션) | 최상 | 중 | 중 |
| 로컬 개발 DX | TDS 로컬 브라우저 미동작 → 샌드박스 왕복 | 브라우저에서 즉시 확인 | 브라우저에서 즉시 확인 |
| 초기 로딩 (C4 2초) | 네이티브 번들, 유리 | Vite code-split + preload로 관리 가능 | Next static은 라우트 단위 청크 자동 분할 |
| 인력 요구 | RN 경험 필수 | React 웹만 있으면 됨 | React 웹 + Next 이해 |

### 권장안

> **웹뷰 + Vite + React 18 + Emotion + `@toss/tds-mobile` (B안)** 을 1차 권장.

근거:

- **C1(SSR 금지)이 Next.js의 최대 강점을 전부 무효화한다.** SSG-only Next는 "무거운 Vite"에 가깝다. OG 이미지도 `next/og` 라우트를 못 쓰므로 별도 서비스로 빼야 한다(§7).
- 앱인토스 웹뷰 문서의 기본 번들러 커맨드가 `vite dev`/`vite build`로 설정돼 있어 **플랫폼 기본 경로**다.
- 피어 의존성이 `react@^18`, `react-dom@^18`, `@emotion/react@^11`로 고정 → React 19 기능 의존 금지.
- 만세력·궁합 계산이 순수 JS 연산이므로 RN의 네이티브 이점이 크지 않다.

**RN(A안)으로 가야 하는 조건**: 사주 카드 뒤집기/오행 파티클 같은 60fps 인터랙션이 핵심 차별점이거나, 팀에 RN 시니어가 이미 있을 때.

### 프론트 확정 스택 제안

```
런타임      : React 18.3 + TypeScript 5.x
빌드        : Vite 5.x (esbuild dev / rollup build)
앱인토스     : @apps-in-toss/web-framework
디자인      : @toss/tds-mobile + @toss/tds-mobile-ait, @emotion/react@^11
상태        : Zustand (또는 Jotai) — Redux 불필요
서버 통신   : TanStack Query v5 + fetch (SSE 스트리밍은 EventSource/fetch-stream)
라우팅      : React Router 6 (memory/hash 라우터 검토 — C10 히스토리 조작 금지 주의)
만세력      : @fullstackfamily/manseryeok (MIT) — 클라이언트 번들 내장
검증        : Zod (LLM 구조화 출력 스키마 공유)
```

---

## 3. 백엔드 후보 비교표 (공식 가격 페이지 확인)

### 3.1 Cloudflare Workers (공식 가격 페이지 확인)

| 항목 | Free | Paid ($5/월 최소) |
|---|---|---|
| 요청 | 100,000 / 일 | 1,000만 / 월 포함, 초과 **+$0.30 / 100만** |
| CPU 시간 | 호출당 10ms | 3,000만 CPU-ms / 월 포함, 초과 **+$0.02 / 100만 CPU-ms** |
| 호출당 최대 CPU | 10ms | 최대 5분 (기본 30초) |
| Workers KV 읽기 | 100,000 / 일 | 1,000만/월 + **$0.50 / 100만** |
| Workers KV 쓰기 | 1,000 / 일 | 100만/월 + **$5.00 / 100만** |
| Workers KV 저장 | 1 GB | 1 GB + **$0.50 / GB-월** |
| D1 행 읽기 | 500만 / 일 | 250억/월 포함 + **$0.001 / 100만 행** |
| D1 행 쓰기 | 100,000 / 일 | 5,000만/월 포함 + **$1.00 / 100만 행** |
| D1 저장 | 5 GB | 5 GB 포함 + **$0.75 / GB-월** |
| R2 저장 | — | **$0.015 / GB-월** (Standard) |
| R2 Class A ops | — | **$4.50 / 100만 요청** |
| R2 Class B ops | — | **$0.36 / 100만 요청** |
| R2 egress | — | **무료** |
| Durable Objects 요청 | — | 100만/월 + **$0.15 / 100만** |
| Durable Objects duration | — | 400,000 GB-s/월 + **$12.50 / 100만 GB-s** |

### 3.2 Vercel (공식 가격 문서 확인)

| 항목 | Hobby 포함량 | Pro |
|---|---|---|
| Functions — Active CPU | 4시간 포함 | On-demand, **리전별 요금 상이** |
| Functions — Provisioned Memory | 360 GB-hrs 포함 | On-demand, 리전별 요금 상이 |
| Functions — Invocations | 100만 포함 | On-demand |
| 추가 유료 시트 | — | **$20 / 월 / 시트** |
| Image 변환 | 5K/월 | **$0.05 ~ $0.0812 / 1K** |
| Image 캐시 읽기 | 300K/월 | **$0.40 ~ $0.64 / 100만** |
| Image 캐시 쓰기 | 100K/월 | **$4.00 ~ $6.40 / 100만** |
| Global Config 읽기 | — | **$3.00** (단위: 문서상 미표기 — 100만 기준 추정 `[미검증]`) |
| Web Analytics | 50,000 이벤트/월 | **$0.03 / 1K 이벤트** |
| Observability Plus | — | **$1.20 / 100만 이벤트** |
| Speed Insights | 첫 10,000 이벤트 | **$0.65 / 10,000 이벤트** |
| Builds | — | **$0.0035 / CPU-분** (분 단위 올림 × CPU 수) |
| Static IPs | — | **$100 / 월 / 프로젝트** + Private Data Transfer |

**리전(중요)**: Vercel은 20개 컴퓨트 리전 + 126개 PoP. **`icn1` = ap-northeast-2 = 서울** 존재. 단 **Functions 기본 리전은 `iad1`(워싱턴 D.C.)** → 반드시 `icn1`로 명시 변경해야 한다. 장애 시 failover 우선순위에서 `icn1`은 P14(기본 `iad1` 기준)로 매우 낮다.

### 3.3 Supabase (공식 가격 페이지 확인)

| 항목 | Free | Pro ($25/월) | Team ($599/월) | 초과 요금 |
|---|---|---|---|---|
| DB 용량 | 500 MB | 8 GB | 8 GB | **$0.125 / GB** |
| Egress | 5 GB | 250 GB | 250 GB | **$0.09 / GB** |
| MAU | 50,000 | 100,000 | 100,000 | **$0.00325 / MAU** |
| Edge Function 호출 | 500,000 | 200만 | 200만 | **$2 / 100만** |
| 파일 저장 | 1 GB | 100 GB | 100 GB | **$0.0213 / GB** |

**리전**: 공식 리전 문서에서 **`ap-northeast-2` (Northeast Asia — Seoul) 지원 확인**. Postgres·Auth·Storage가 서울에 놓인다.

### 3.4 AWS Lambda (공식 가격 페이지 확인 — 한계 있음)

| 항목 | 값 (us-east-1 기준, 공식 페이지 명시) |
|---|---|
| 요청 | **$0.20 / 100만** |
| Duration (x86) | **$0.0000166667 / GB-초** |
| Duration (ARM/Graviton) | x86보다 저렴 (페이지에 정확 수치 미기재) |
| Free Tier | 월 100만 요청 + 400,000 GB-초 |

> ⚠ **공식 Lambda 가격 페이지는 리전별 표를 제공하지 않고 "All examples below are based on price in US East (N. Virginia)"로 못박는다.** `ap-northeast-2`(서울) 단가는 AWS Pricing Calculator로 별도 확인이 필요하다. 통상 서울 리전은 버지니아보다 약간 높다고 알려져 있으나 **본 문서에서는 수치 미확정** `[미검증]`.

### 3.5 종합 비교 — 이 프로젝트 기준

| 기준 | Cloudflare Workers | Vercel | Supabase | AWS Lambda |
|---|---|---|---|---|
| 한국 리전/엣지 | 서울 PoP 있음. 단 **D1 primary 리전 힌트에 한국 단독 옵션 없음(apac 수준)** `[미검증]` | **icn1 서울 컴퓨트** ✅ (기본값 iad1이라 반드시 변경) | **ap-northeast-2 서울** ✅ | **ap-northeast-2 서울** ✅ |
| 국내 사용자 RTT 체감 | 엣지 우수, DB 왕복이 병목 | 서울 배치 시 우수 | 서울 배치 시 우수 | 서울 배치 시 우수 |
| 콜드스타트 | 사실상 없음(isolate) | Node 함수 존재 | Edge Function은 Deno, 짧음 | 존재 (프로비저닝 동시성으로 완화, 별도 과금) |
| mTLS 아웃바운드(토스 로그인) | 제약 가능 `[미검증]` | Node 런타임에서 용이 | Deno Edge Function에서 제약 가능 `[미검증]`; Postgres 함수 아님 | 가장 자유로움 |
| Postgres/관계형 DB | D1(SQLite) | 없음(외부 연결) | **내장 Postgres + RLS + Auth** | RDS/Aurora 별도 |
| LLM 장시간 스트리밍 | CPU 최대 5분, I/O 대기는 CPU 미소모 → 유리 | 함수 최대 실행시간 플랜 의존 | Edge Function 타임아웃 존재 | 최대 15분 |
| 무료로 버틸 수 있는 규모 | 일 10만 요청까지 무료 | Hobby 100만 호출/월 | Free 50k MAU | 100만 요청/월 |
| 총평 | 비용 최강·엣지 최강, 관계형 DB 약함 | 프론트 배포+API 일체형, 서울 컴퓨트 | **본 프로젝트 최적** (Auth 불필요하지만 Postgres+Storage+서울) | 유연하나 운영 부담 |

### 권장 아키텍처

> **Vercel(정적 프론트, icn1) + Supabase(ap-northeast-2 Postgres + Storage) + Vercel Functions(icn1, Node 런타임: LLM 프록시/mTLS 토스 API/OG 이미지)**
>
> 비용 최적화 단계에서 LLM 프록시만 Cloudflare Workers로 이관 검토(요청 100만당 $0.30, I/O 대기가 CPU를 안 먹으므로 스트리밍 프록시에 최적). 단 mTLS 호출 경로는 Vercel Node에 남긴다.

```
[토스앱 웹뷰]
   │  (정적 자산: HTML/JS/CSS + 만세력 테이블 ~300KB gzip)
   ├──> Vercel CDN (126 PoP, 서울 PoP)
   │
   ├──> POST /api/report            (Vercel Function, icn1, Node)
   │       ├─ 캐시 키 조회 ──> Supabase Postgres (ap-northeast-2)
   │       ├─ 캐시 히트  ──> 즉시 반환 (LLM 호출 0)
   │       └─ 캐시 미스  ──> Anthropic Messages API (스트리밍) ──> 저장
   │
   ├──> POST /api/auth/toss         (Vercel Function, Node, mTLS)
   │       └─ https://apps-in-toss-api.toss.im/api-partner/v1/...
   │
   └──> GET  /api/og?k=<hash>       (OG/공유카드 PNG, Satori+resvg, CDN 캐시)
```

---

## 4. 만세력: 클라이언트 vs 서버 계산

### 4.1 후보 라이브러리 (실측 확인)

| 라이브러리 | 범위 | 번들 | 라이선스 | 특징 |
|---|---|---|---|---|
| **`@fullstackfamily/manseryeok`** (GitHub: `urstory/manseryeok-js`) | **1900-01-01 ~ 2050-12-31** | **ESM ~290KB / gzip ~95KB** (원본 11.4MB → 225KB, 98% 감소) | **MIT** | KASI(한국천문연구원) 음양력변환 데이터 기반. `solarToLunar()`, `lunarToSolar()`, `getGapja()`, **`calculateSaju()`**, `calculateSajuSimple()`, `getAllSolarTerms()`, `getSolarTermByName()`, `getSolarTermsByYear()`, `getSajuMonth()`. TypeScript, tree-shaking, 24절기 |
| `usingsky/korean_lunar_calendar_js` | 음력 1000-01-01 ~ 2050-11-18 / 양력 1000-02-13 ~ 2050-12-31 | (미확인) | (미확인) | KARI/KASI 기준 변환 전용 |
| `jangjunha/korean-lunar-calendar` | (미확인) | (미확인) | (미확인) | KASI 데이터 기반 음→양 변환 |
| `kahyou22/kor-lunar-js` | (미확인) | (미확인) | (미확인) | 오프라인 환경 사용 가능 |
| `6tail/lunar-javascript` | 광범위 | 큼(전 기능) | (미확인) | 간지·절기·**팔자·오행·십신**까지 포함. 단 중국 기준 로직 → **한국 시간대/진태양시 보정 필요** |

> ⚠ **핵심 갭**: 위 라이브러리 모두 **1900~2050**이 상한이다. 프로젝트 요구인 **1900~2100**을 채우려면 2051~2100 절기·삭일 데이터를 별도 생성해야 한다. 천문 계산(VSOP87/ELP2000 축약 또는 KASI 공개 데이터)으로 자체 산출 필요. `[미검증 — 2051+ 데이터 소스 미확정]`

### 4.2 데이터 용량 추정 (1900~2100)

기간: 201년 × 365.2425일 ≈ **73,414일**

| 방식 | 레코드 구조 | 원시 용량 | gzip 추정 |
|---|---|---|---|
| **(a) 일별 풀 테이블** | 일당 16B 팩킹 (양력키 4B, 음력 y/m/d/윤 4B, 일간지 idx 1B, 월건 1B, 년간지 1B, 절기플래그 1B, 절입분 2B, 예비 2B) | 73,414 × 16B ≈ **1.17 MB** | **~350 KB** |
| (b) 일별 JSON | 일당 ~80B | ≈ **5.9 MB** | ~1.5 MB |
| **(c) 월 단위 압축 테이블 + 절기 테이블** ← manseryeok-js 방식 | 음력 월 대소/윤달 비트맵 + 절입시각 | **~300 KB** (1900~2100 스케일) | **~130 KB** |
| (d) 절기 테이블만 | 201년 × 24절기 = **4,824 엔트리** × 8B(분 단위 epoch) | **~39 KB** | ~12 KB |
| (e) 일주(日柱) 간지 | 60갑자 순환 → **데이터 불필요** (기준일 + 일수 mod 60) | 0 | 0 |

**결론**: (c)+(d) 조합으로 **gzip 130~180KB**. 100MB 번들 제한 대비 0.2% 미만. 클라이언트 내장이 명확히 이득.

### 4.3 클라이언트 vs 서버 트레이드오프

| 축 | 클라이언트 계산 | 서버 계산 |
|---|---|---|
| 첫 진입 페이로드 | **+130~180KB gzip** (초기 로딩 C4 2초 제약에 영향, code-split으로 지연 로드 가능) | 0 |
| 계산 레이턴시 | **0ms** (동일 프레임에서 즉시 표시) | 왕복 RTT (서울 배치 시 20~40ms `[미검증]`) + 함수 실행 |
| 오프라인/네트워크 불안정 | 동작 | 불가 |
| 로직 수정 배포 | **재심사 필요** (영업일 3일~7일+) | 즉시 배포 가능 ✅ |
| 알고리즘 유출 | 번들에서 추출 가능 | 보호됨 ✅ |
| LLM 프롬프트 일관성 | 클라 계산 결과를 서버로 다시 보내야 함 → 위조 가능 | 서버가 단일 진실 원천 ✅ |
| 서버 비용 | 0 | 호출당 CPU (Workers: 만세력 계산 ~1~3ms CPU 추정 `[미검증]`) |
| 캐시 키 안정성 | 클라·서버 버전 불일치 위험 | 안정 ✅ |

### 권장: **하이브리드(양쪽 계산)**

```
① 클라이언트: 즉시 만세력 계산 → 사주 원국(4주 8자) 화면에 0ms로 그린다
              (UX: C4의 "2초 이내 반응" 제약을 확실히 통과)
② 서버:       리포트 생성 시 생년월일시만 받아 서버가 재계산
              → 캐시 키(원국 해시)와 LLM 프롬프트는 100% 서버 계산값 사용
③ 로직 동기:  계산 코어를 별도 워크스페이스 패키지(@saju/core)로 분리하여
              클라이언트 번들과 서버 함수가 동일 코드를 import
              → 버전 스큐 방지, `SAJU_CORE_VERSION`을 캐시 키에 포함
```

`pnpm` 워크스페이스 구조:

```
packages/
  core/            # @saju/core  — 만세력·간지·십성·오행·대운 계산 (순수 TS, 의존성 0)
  data/            # @saju/data  — 1900~2100 압축 테이블(월비트맵 + 절기), gzip ~150KB
  prompt/          # @saju/prompt — 시스템 프롬프트 + Zod 출력 스키마 (클라/서버 공유)
apps/
  miniapp/         # Vite + React 18 (앱인토스 웹뷰)
  api/             # Vercel Functions (Node) — /report, /auth/toss, /og
```

### 4.4 시주(時柱) 계산 시 반드시 반영할 항목

| 항목 | 내용 | 비고 |
|---|---|---|
| 한국 표준시(KST) 변경사 | 1908년 UTC+8:30, 1912년 UTC+9, 1954~1961 UTC+8:30, 1961~ UTC+9 | 1900~2100 테이블에 시간대 오프셋 컬럼 필수 |
| 서머타임 | 1948~1951, 1955~1960, 1987~1988 시행 이력 | 출생시각 보정 |
| 진태양시(균시차 + 경도 보정) | 서울 경도 127°E 기준 UTC+9(135°E) 대비 **약 -32분** | 절입/시주 경계 판정에 결정적 |
| 야자시/조자시 처리 | 23:00~00:59 처리 유파(자시 분할) | **정책 결정 필요 — 유파별 결과 상이** |
| 절입 시각 기준 월주 | 입춘 기준 연주, 절기 기준 월주 | 생일이 절입 당일이면 시·분까지 비교 |

> 위 5개는 **결과가 갈리는 지점**이므로 반드시 문서화된 단일 정책으로 고정해야 한다(캐시 키에 `RULESET_VERSION` 포함).

---

## 5. DB 스키마 개요 (Postgres / Supabase)

```sql
-- ============================================================
-- 5.1 사용자 (토스 userKey 단독 식별)
-- ============================================================
CREATE TABLE app_user (
  id              BIGSERIAL PRIMARY KEY,
  toss_user_key   BIGINT      NOT NULL UNIQUE,       -- 토스 로그인 userKey (정수형)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,                       -- 연결 해제 시 하드삭제 배치 대상(C12)
  referrer        TEXT                               -- 토큰 발급 시 받은 유입 경로
);
CREATE INDEX ON app_user (deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 5.2 프로필 (한 사용자가 본인/가족/친구 여러 명 등록 가능)
-- ============================================================
CREATE TYPE sex_t          AS ENUM ('M','F');
CREATE TYPE blood_t        AS ENUM ('A','B','O','AB');
CREATE TYPE calendar_t     AS ENUM ('solar','lunar','lunar_leap');
CREATE TYPE time_known_t   AS ENUM ('exact','approx','unknown');

CREATE TABLE profile (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  nickname        TEXT        NOT NULL,
  birth_date      DATE        NOT NULL,              -- 입력 원본
  birth_calendar  calendar_t  NOT NULL DEFAULT 'solar',
  birth_time      TIME,                              -- NULL 허용 (시간 모름)
  time_known      time_known_t NOT NULL DEFAULT 'exact',
  birth_place_lon NUMERIC(6,3),                      -- 진태양시 경도 보정용 (기본 126.978 서울)
  sex             sex_t       NOT NULL,
  mbti            CHAR(4),                           -- 'INTJ' 등, NULL 허용
  blood           blood_t,                           -- NULL 허용
  zodiac_sign     SMALLINT,                          -- 1~12, 양력 생일에서 파생(입력 아님)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, nickname)
);
-- MBTI 형식 강제
ALTER TABLE profile ADD CONSTRAINT mbti_fmt
  CHECK (mbti IS NULL OR mbti ~ '^[EI][NS][TF][JP]$');

-- ============================================================
-- 5.3 사주 원국 캐시 (계산 결과 = 결정적, 프로필과 분리하여 재사용)
-- ============================================================
CREATE TABLE saju_chart (
  chart_hash      TEXT        PRIMARY KEY,           -- sha256(normalized_birth || ruleset_ver || core_ver)
  ruleset_version TEXT        NOT NULL,              -- 야자시 정책 등 유파 버전
  core_version    TEXT        NOT NULL,              -- @saju/core 버전
  utc_birth_at    TIMESTAMPTZ NOT NULL,              -- 진태양시/시간대 보정 완료된 절대시각
  year_gz         SMALLINT    NOT NULL,              -- 0~59 (60갑자 인덱스) 연주
  month_gz        SMALLINT    NOT NULL,              -- 월주
  day_gz          SMALLINT    NOT NULL,              -- 일주
  hour_gz         SMALLINT,                          -- 시주 (시간 모름이면 NULL)
  day_stem        SMALLINT    NOT NULL,              -- 일간 0~9 (해석의 축)
  five_elem       JSONB       NOT NULL,              -- {"wood":2,"fire":1,"earth":3,"metal":1,"water":1}
  ten_gods        JSONB       NOT NULL,              -- 십성 분포
  strength_bucket SMALLINT    NOT NULL,              -- 신강/신약 버킷 0~4 (캐시 키 축소용)
  luck_pillars    JSONB       NOT NULL,              -- 대운 목록
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON saju_chart (day_stem, month_gz);

-- 프로필 → 원국 연결 (프로필 수정 시 재계산)
ALTER TABLE profile ADD COLUMN chart_hash TEXT REFERENCES saju_chart(chart_hash);

-- ============================================================
-- 5.4 리포트 (LLM 생성물) — 캐시 테이블 겸용
-- ============================================================
CREATE TYPE report_kind_t AS ENUM (
  'basic_saju',        -- 사주 기본 리포트
  'fusion',            -- 사주+MBTI+혈액형+별자리 융합
  'yearly',            -- 올해 운세
  'daily',             -- 오늘 운세
  'compat'             -- 궁합 (2인)
);
CREATE TYPE report_status_t AS ENUM ('pending','streaming','done','failed');

CREATE TABLE report (
  id              BIGSERIAL PRIMARY KEY,
  cache_key       TEXT        NOT NULL,              -- §6 참조: 조합 정규화 해시
  kind            report_kind_t NOT NULL,
  chart_hash      TEXT        NOT NULL REFERENCES saju_chart(chart_hash),
  peer_chart_hash TEXT        REFERENCES saju_chart(chart_hash),  -- 궁합용
  mbti            CHAR(4),
  blood           blood_t,
  zodiac_sign     SMALLINT,
  period_key      TEXT,                              -- daily='2026-08-11', yearly='2026', 그 외 NULL
  status          report_status_t NOT NULL DEFAULT 'pending',
  body_md         TEXT,                              -- 최종 마크다운/JSON 본문
  body_json       JSONB,                             -- 구조화 출력(섹션별)
  model_id        TEXT        NOT NULL,              -- 'claude-opus-5' 등
  prompt_version  TEXT        NOT NULL,
  usage           JSONB,                             -- {input,output,cache_read,cache_creation}
  cost_usd        NUMERIC(10,6),                     -- 생성 원가 기록 (원가 대시보드용)
  hit_count       INTEGER     NOT NULL DEFAULT 0,    -- 캐시 재사용 횟수
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cache_key, prompt_version)
);
CREATE INDEX ON report (chart_hash, kind);
CREATE INDEX ON report (created_at DESC);

-- 사용자 ↔ 리포트 (다:다, 캐시 재사용 시 여러 사용자가 같은 리포트를 본다)
CREATE TABLE user_report (
  user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  report_id   BIGINT NOT NULL REFERENCES report(id),
  profile_id  BIGINT NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, report_id, profile_id)
);

-- ============================================================
-- 5.5 결제 (토스페이 / IAP)
-- ============================================================
CREATE TYPE pay_channel_t AS ENUM ('toss_pay','iap_google','iap_apple');
CREATE TYPE pay_status_t  AS ENUM ('ready','paid','canceled','partial_canceled','failed','refunded');

CREATE TABLE product (
  code          TEXT PRIMARY KEY,                    -- 'FUSION_FULL_V1'
  name          TEXT NOT NULL,
  price_krw     INTEGER NOT NULL,
  report_kind   report_kind_t NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE payment (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES app_user(id),
  product_code    TEXT   NOT NULL REFERENCES product(code),
  channel         pay_channel_t NOT NULL,
  status          pay_status_t  NOT NULL DEFAULT 'ready',
  amount_krw      INTEGER NOT NULL,
  order_id        TEXT   NOT NULL UNIQUE,            -- 자체 생성 멱등 키
  external_tx_id  TEXT   UNIQUE,                     -- 토스 결제키 / IAP purchaseToken
  idempotency_key TEXT   NOT NULL UNIQUE,
  raw_webhook     JSONB,
  paid_at         TIMESTAMPTZ,
  canceled_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON payment (user_id, created_at DESC);
CREATE INDEX ON payment (status) WHERE status IN ('ready','failed');

-- 결제 → 리포트 열람권
CREATE TABLE entitlement (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  payment_id    BIGINT REFERENCES payment(id),
  report_kind   report_kind_t NOT NULL,
  profile_id    BIGINT REFERENCES profile(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ                          -- NULL = 영구
);
CREATE INDEX ON entitlement (user_id, report_kind);

-- ============================================================
-- 5.6 사전생성 블록 (§6 배치 전략)
-- ============================================================
CREATE TABLE pregen_block (
  block_key     TEXT PRIMARY KEY,                    -- 'DAYSTEM:갑|MBTI:INTJ'
  block_type    TEXT NOT NULL,                       -- 'saju_core','mbti_x_daystem','blood_x_elem','zodiac_x_month'
  body_md       TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  cost_usd      NUMERIC(10,6),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Supabase 운용 주의**: 클라이언트에서 Postgres에 직접 붙지 않는다(anon key 노출 시 RLS 설계 부담 + 앱인토스 인증은 토스 로그인 단독). **모든 DB 접근은 Vercel Function(서버)에서 service_role 키로**, 프론트는 자체 API만 호출.

---

## 6. LLM 비용 산정 (Anthropic 공식 가격 확인)

### 6.1 공식 단가 표 (platform.claude.com/docs/en/about-claude/pricing 확인, 2026-08-11)

| 모델 | Base Input | 5m Cache Write | 1h Cache Write | Cache Hit/Refresh | Output |
|---|---|---|---|---|---|
| **Claude Opus 5** (`claude-opus-5`) | **$5 / MTok** | $6.25 / MTok | $10 / MTok | **$0.50 / MTok** | **$25 / MTok** |
| **Claude Sonnet 5** (`claude-sonnet-5`) — **2026-08-31까지 도입가** | **$2 / MTok** | $2.50 / MTok | $4 / MTok | **$0.20 / MTok** | **$10 / MTok** |
| Claude Sonnet 5 — 2026-09-01부터 정가 | $3 / MTok | $3.75 / MTok | $6 / MTok | $0.30 / MTok | $15 / MTok |
| **Claude Haiku 4.5** (`claude-haiku-4-5`) | **$1 / MTok** | $1.25 / MTok | $2 / MTok | **$0.10 / MTok** | **$5 / MTok** |
| (참고) Claude Fable 5 | $10 / MTok | $12.50 | $20 | $1.00 | $50 / MTok |
| (참고) Claude Opus 4.8 | $5 / MTok | $6.25 | $10 | $0.50 | $25 / MTok |

**Batch API — 입·출력 모두 50% 할인 (공식 표)**

| 모델 | Batch Input | Batch Output |
|---|---|---|
| Claude Opus 5 | **$2.50 / MTok** | **$12.50 / MTok** |
| Claude Sonnet 5 (2026-08-31까지) | **$1 / MTok** | **$5 / MTok** |
| Claude Sonnet 5 (2026-09-01~) | $1.50 / MTok | $7.50 / MTok |
| Claude Haiku 4.5 | **$0.50 / MTok** | **$2.50 / MTok** |

**부가 요금·수치 (공식)**

| 항목 | 값 |
|---|---|
| 프롬프트 캐시 배수 | 5분 쓰기 **1.25×**, 1시간 쓰기 **2×**, 읽기 **0.1×** |
| 캐시 손익분기 | 5분 TTL은 **읽기 1회**부터 이득, 1시간 TTL은 **읽기 2회**부터 이득 |
| **최소 캐시 가능 프리픽스** | **Opus 5 = 512 토큰**, Sonnet 5 = 1,024 토큰, **Haiku 4.5 = 4,096 토큰** |
| 1M 컨텍스트 | Claude 4.6 이상은 **표준 단가에 포함** (long-context 프리미엄 없음) |
| 데이터 레지던시(`inference_geo:"us"`) | 모든 토큰 카테고리에 **1.1× 배수** |
| Fast mode (Opus 5) | $10 / $50 per MTok (Claude API 1st-party 전용, Batch 병행 불가) |
| Web search | $10 / 1,000 검색 |
| Web fetch | 토큰 비용만, 추가 과금 없음 |
| Code execution | 조직당 월 **1,550시간 무료**, 이후 **$0.05 / 컨테이너-시간** (최소 5분) |
| 도구 사용 시스템 프롬프트 오버헤드 | Opus 5: `auto/none` **286토큰**, `any/tool` **406토큰**. Sonnet 5: **354 / 474**. Haiku 4.5: **496 / 588** |
| 토크나이저 주의 | **Claude 4.7 이후 모델(Opus 5, Sonnet 5 포함)은 신규 토크나이저 — 동일 텍스트에서 토큰 약 30% 증가.** Sonnet 4.6 및 이전은 구 토크나이저 |

> ⚠ **본 산정의 가장 큰 리스크**: 위 "약 30% 토큰 증가"는 한국어 사주 텍스트에서 특히 크게 나타날 수 있다. 프로덕션 진입 전 `POST /v1/messages/count_tokens`로 **실제 프롬프트를 모델별로 재측정**해야 한다(`tiktoken` 사용 금지 — Claude 토큰을 15~20% 과소 계산).

### 6.2 리포트 1건 토큰 추정 (융합 리포트 `fusion`)

| 구성 요소 | 추정 토큰 | 성격 |
|---|---|---|
| 시스템 프롬프트 (해석 규범, 유파 정책, 금칙어, 톤&매너, 면책 문구) | 3,000 | **정적 → 캐시 대상** |
| 출력 스키마 정의 (Zod → JSON Schema, 섹션 8개) | 900 | **정적 → 캐시 대상** |
| MBTI 16유형 특성 참조 테이블 | 900 | **정적 → 캐시 대상** |
| 별자리 12 + 혈액형 4 참조 테이블 | 700 | **정적 → 캐시 대상** |
| **정적 프리픽스 소계** | **5,500** | 캐시 |
| 사주 원국 계산 결과 JSON (4주 8자, 십성, 오행, 신살, 대운 10기) | 1,200 | 동적 |
| 사용자 입력 (생년월일시, MBTI, 혈액형, 별자리, 질문 의도) | 300 | 동적 |
| **동적 접미 소계** | **1,500** | 미캐시 |
| **총 입력** | **7,000** | |
| 출력 (한국어 3,200~3,800자 · 8섹션 · 구조화 JSON) | **3,000** | |

> 한국어 3,500자 ≈ 3,000 출력 토큰 가정(신규 토크나이저 기준, 자 대비 약 0.86 tok/char). `[미검증 — count_tokens 실측 필요]`

### 6.3 리포트 1건 원가 계산

**(A) 캐싱 없음 · 실시간**

| 모델 | 입력 비용 | 출력 비용 | **합계 (USD)** | **합계 (KRW)** |
|---|---|---|---|---|
| Claude Opus 5 | 7,000 × $5 / 1M = $0.0350 | 3,000 × $25 / 1M = $0.0750 | **$0.1100** | **약 160원** |
| Claude Sonnet 5 (도입가) | 7,000 × $2 / 1M = $0.0140 | 3,000 × $10 / 1M = $0.0300 | **$0.0440** | **약 64원** |
| Claude Sonnet 5 (정가) | $0.0210 | $0.0450 | **$0.0660** | **약 96원** |
| Claude Haiku 4.5 | 7,000 × $1 / 1M = $0.0070 | 3,000 × $5 / 1M = $0.0150 | **$0.0220** | **약 32원** |

**(B) 프롬프트 캐싱 적용 (5분 TTL, 정적 프리픽스 5,500토큰 캐시 히트)**

| 모델 | 캐시 읽기 5,500 | 미캐시 입력 1,500 | 출력 3,000 | **합계** | vs (A) | 입력측 절감률 |
|---|---|---|---|---|---|---|
| Opus 5 | 5,500 × $0.50/1M = $0.00275 | 1,500 × $5/1M = $0.00750 | $0.07500 | **$0.08525 (124원)** | **-22.5%** | **-70.7%** |
| Sonnet 5 (도입가) | 5,500 × $0.20/1M = $0.00110 | 1,500 × $2/1M = $0.00300 | $0.03000 | **$0.03410 (49원)** | **-22.5%** | **-70.7%** |
| Haiku 4.5 | 5,500 × $0.10/1M = $0.00055 | 1,500 × $1/1M = $0.00150 | $0.01500 | **$0.01705 (25원)** | **-22.5%** | **-70.7%** |

캐시 최초 쓰기 비용(5분 TTL, 1회):

| 모델 | 캐시 쓰기 5,500 토큰 |
|---|---|
| Opus 5 | 5,500 × $6.25 / 1M = **$0.034375** |
| Sonnet 5 (도입가) | 5,500 × $2.50 / 1M = **$0.01375** |
| Haiku 4.5 | 5,500 × $1.25 / 1M = **$0.006875** |

> **캐시 실무 포인트 3가지**
> 1. **Haiku 4.5의 최소 캐시 프리픽스는 4,096토큰**이다. 정적 프리픽스가 5,500토큰이므로 겨우 통과. 프롬프트를 다이어트하다 4,096 아래로 내려가면 **에러 없이 조용히 캐시가 안 걸린다** (`cache_creation_input_tokens: 0`).
> 2. **캐시 무효화 함정**: 시스템 프롬프트에 `new Date()`, 요청 UUID, 사용자 닉네임을 절대 넣지 말 것. `tools` 배열은 이름 기준 정렬로 결정적 직렬화. 렌더 순서는 `tools → system → messages`.
> 3. 검증은 `usage.cache_read_input_tokens` 가 0이 아닌지로 확인. 트래픽이 5분 이상 끊기는 시간대에는 1시간 TTL(2× 쓰기, 읽기 2회부터 이득) 또는 `max_tokens: 0` 프리워밍 검토.

**(C) 캐싱 + Batch API (사전생성 배치, 실시간성 불필요)**

| 모델 | Batch 입력 7,000 | Batch 출력 3,000 | **합계** | vs (A) |
|---|---|---|---|---|
| Opus 5 | 7,000 × $2.50 / 1M = $0.01750 | 3,000 × $12.50 / 1M = $0.03750 | **$0.0550 (80원)** | **-50%** |
| Sonnet 5 (도입가) | $0.00700 | $0.01500 | **$0.0220 (32원)** | -50% |
| Haiku 4.5 | $0.00350 | $0.00750 | **$0.0110 (16원)** | -50% |

> Batch 할인과 캐싱 배수는 **중첩 적용된다**(공식 문서: "Batch API and prompt caching discounts can be combined"). Batch + 캐시 히트 조합 시 Opus 5는 5,500×$0.25/1M + 1,500×$2.50/1M + 3,000×$12.50/1M = **$0.0426 (62원)** `[계산 — Batch 할인이 캐시 단가에도 50% 적용된다는 전제, 미검증]`.

### 6.4 모델 라우팅 권장안

| 리포트 종류 | 권장 모델 | 근거 | 1건 원가(캐싱 적용) |
|---|---|---|---|
| `daily` 오늘 운세 (짧음, 대량) | **Haiku 4.5** | 출력 ~600토큰, 품질 민감도 낮음 | ~$0.004 (6원) |
| `basic_saju` 기본 리포트 | **Sonnet 5** | 가성비, 정형 해석 | ~$0.034 (49원) |
| `fusion` 융합 리포트 (유료 핵심) | **Opus 5** | 4축 교차 추론 = 다단 추론, 품질이 전환율 | **$0.085 (124원)** |
| `compat` 궁합 (2인 원국) | Opus 5 | 입력 2배(+1,200토큰) → ~$0.091 | ~$0.091 (132원) |
| `pregen_block` 사전생성 | **Opus 5 + Batch** | 실시간성 불필요, 최고 품질을 반영구 재사용 | $0.055 (80원) |

**요청 파라미터 권장값 (Claude Opus 5)**

```ts
// @saju/prompt 에서 공용
const req = {
  model: 'claude-opus-5',
  max_tokens: 8000,                       // 출력 3,000 추정 + thinking 여유
  thinking: { type: 'adaptive' },         // Opus 5는 기본 ON. 명시해 의도를 고정
  output_config: { effort: 'high' },      // 융합 추론은 high, daily는 'low'
  cache_control: { type: 'ephemeral' },   // 자동 캐싱(마지막 캐시 가능 블록)
  system: [
    { type: 'text', text: STATIC_PREFIX,  // 5,500 토큰 정적 프리픽스
      cache_control: { type: 'ephemeral' } },
  ],
  messages: [ /* 동적 1,500 토큰만 */ ],
  output_config_format: /* Zod → json_schema (구조화 출력) */,
};
// 주의: temperature / top_p / top_k 는 Opus 5에서 400 에러 → 사용 금지
// 주의: assistant prefill(마지막 assistant 턴)은 400 에러 → 구조화 출력으로 대체
// 주의: max_tokens > ~16000 이면 반드시 스트리밍 (.stream() + .get_final_message())
```

### 6.5 규모별 월 LLM 비용 시뮬레이션

가정: 캐싱 적용, 캐시 히트율 §7 기준, `fusion` = Opus 5, `daily` = Haiku 4.5.

| 시나리오 | MAU | 신규 fusion 생성/월 | daily 조회/월 | fusion 비용 | daily 비용 | **월 LLM 합계** |
|---|---|---|---|---|---|---|
| 출시 초기 | 5,000 | 3,000 | 30,000 | 3,000 × $0.085 = $255 | 30,000 × $0.004 = $120 | **$375 (약 54만원)** |
| 성장기 | 50,000 | 20,000 (캐시히트 40%) | 400,000 | 20,000 × $0.085 = $1,700 | $1,600 | **$3,300 (약 479만원)** |
| 성장기 + 사전생성 블록 조립 | 50,000 | 6,000 (조립으로 60% 절감) | 400,000 | $510 | $1,600 | **$2,110 (약 306만원)** |
| 대규모 | 300,000 | 40,000 | 2,400,000 | $3,400 | $9,600 | **$13,000 (약 1,885만원)** |

> `daily` 비용이 규모가 커지면 지배적이 된다 → **오늘 운세는 반드시 (일간 × 일진 × 대운) 조합으로 사전생성 후 조립**해야 한다(§7.3). 조합 수: 일간 10 × 당일 일진 1(하루 고정) × 신강약 5 = 50건/일 → **일 50건 × $0.004 = $0.20/일 = 월 $6**. 즉 개인화 축을 줄이면 daily는 실질 0원에 수렴.

---

## 7. 캐싱 전략 (3계층)

### 7.1 계층 구조

| 계층 | 저장소 | TTL | 키 | 목적 |
|---|---|---|---|---|
| L0 프롬프트 캐시 | Anthropic 서버 | 5분(기본) / 1시간 | 프롬프트 프리픽스 바이트 | 입력 토큰 90% 절감 |
| L1 리포트 캐시 | Supabase Postgres `report` | 영구 (프롬프트 버전 단위 무효화) | `cache_key` | **동일 조합 재요청 시 LLM 호출 0** |
| L2 CDN 캐시 | Vercel CDN / R2 | 1일~영구 | URL + 해시 | 공유 카드 PNG, 정적 리포트 HTML |

### 7.2 L1 캐시 키 설계 — "동일 사주 + 동일 유형" 재사용

핵심 통찰: **별자리는 양력 생일에서 파생되므로 독립 축이 아니다.** 독립 축은 MBTI(16) × 혈액형(4) = **64배수**뿐이다.

```ts
// @saju/core
function fusionCacheKey(input: FusionInput): string {
  const norm = {
    // 사주 축: 원국 해시가 아니라 "해석 등가 클래스"로 축소
    daySt:   input.chart.day_stem,             // 일간 10
    monthGz: input.chart.month_gz % 12,        // 월지 12 (계절/격국)
    strBkt:  input.chart.strength_bucket,      // 신강약 버킷 5
    elemSig: quantizeFiveElements(input.chart.five_elem), // 오행 분포 서명 (버킷 ~40)
    tenSig:  dominantTenGods(input.chart.ten_gods, 2),    // 상위 십성 2개 (~45)
    // 독립 축
    mbti:  input.mbti  ?? '-',                 // 17 (미입력 포함)
    blood: input.blood ?? '-',                 // 5
    // 파생 축 (키에 포함하지만 엔트로피 기여 낮음)
    zodiac: input.zodiac_sign,                 // 12, 월지와 강한 상관
    sex:   input.sex,                          // 2
    // 버전
    ruleset: RULESET_VERSION,
    prompt:  PROMPT_VERSION,
    model:   MODEL_ID,
  };
  return sha256(canonicalJson(norm));          // 키 정렬 필수 (캐시 안정성)
}
```

**캐시 공간 크기 추정**

| 축 | 카디널리티 | 비고 |
|---|---|---|
| 일간 | 10 | |
| 월지 | 12 | |
| 신강약 버킷 | 5 | |
| 오행 분포 서명 | ~40 | 8자 분포를 버킷화 |
| 상위 십성 2개 | ~45 | 10C2 |
| MBTI | 17 | 미입력 포함 |
| 혈액형 | 5 | 미입력 포함 |
| 성별 | 2 | |
| **곱** | **약 3,672만** | 이론상 상한 |

이론 상한은 크지만 **실제 분포는 극도로 편향**된다(일간·월지·오행은 생일 분포를 따르고, MBTI는 INFP/ENFP/INTP 등 상위 5개가 절반 이상). 실측 히트율 목표:

| 누적 생성 리포트 | 예상 캐시 히트율 | 근거 |
|---|---|---|
| 1,000건 | 10~15% | 롱테일 초기 |
| 10,000건 | 30~40% | 인기 조합 포화 |
| 100,000건 | 55~70% | 지프 분포 상위 포화 |

`[미검증 — 실서비스 로그 기반 재측정 필요]`

### 7.3 사전 생성(pre-generation) 배치 전략 ★ 핵심 절감 수단

전체 조합 사전생성은 불가능하다:
- 1950~2010 출생 × 12시주 ≈ 263,000 원국 × MBTI 16 × 혈액형 4 = **약 1,680만 건** → Opus 5 Batch로도 1,680만 × $0.055 = **$924,000**. 논외.

대신 **리포트를 블록으로 분해하고 블록만 사전생성 후 조립**한다.

| 블록 타입 | 키 | 조합 수 | Opus 5 Batch 원가 |
|---|---|---|---|
| `saju_core` 원국 해석 | 일간 10 × 월지 12 × 신강약 5 | **600** | 600 × $0.055 = **$33** |
| `ten_gods` 십성/격국 해설 | 상위십성 조합 45 × 신강약 5 | **225** | **$12.4** |
| `mbti_x_daystem` MBTI×일간 교차 | 16 × 10 | **160** | **$8.8** |
| `blood_x_elem` 혈액형×오행 | 4 × 5 (주오행) | **20** | **$1.1** |
| `zodiac_x_month` 별자리×월지 | 12 × 12 (실질 ~24 유효) | **144** | **$7.9** |
| `luck_pillar` 대운 기조 | 60갑자 × 일간 10 → 600 | **600** | **$33** |
| **합계** | | **약 1,749 블록** | **약 $96 (14만원) — 1회성** |

조립 방식 2안:

| 안 | 방식 | LLM 호출 | 품질 |
|---|---|---|---|
| (i) 순수 조립 | 서버가 블록 5~6개를 템플릿으로 이어붙임 | **0건** | 문체 이질감, 축 간 상호작용 없음 |
| (ii) **조립 + 접합 리라이트** ← 권장 | 블록들을 컨텍스트로 넣고 Haiku 4.5/Sonnet 5가 1,200토큰만 재작성 | 1건 (입력 6,000 / 출력 1,200) | 자연스러움 + 개인화 |

(ii)안 원가 (Haiku 4.5, 캐싱 적용): 캐시읽기 5,000×$0.10/1M + 미캐시 1,000×$1/1M + 출력 1,200×$5/1M = $0.0005 + $0.0010 + $0.0060 = **$0.0075 (11원)**.
→ Opus 5 직접 생성 $0.085(124원) 대비 **91% 절감**.

**배치 실행 코드 스켈레톤**

```ts
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

// 1,749 블록을 Batch로 (배치당 최대 100,000 요청 / 256MB, 대개 1시간 내 완료, 최대 24시간)
const batch = await client.messages.batches.create({
  requests: blockKeys.map((key) => ({
    custom_id: key,                        // 'DAYSTEM:갑|MONTH:寅|STR:2'
    params: {
      model: 'claude-opus-5',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      system: [{ type: 'text', text: BLOCK_SYSTEM_PROMPT,
                 cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: renderBlockPrompt(key) }],
    },
  })),
});
// 결과는 임의 순서로 도착 → 반드시 custom_id 로 매핑 (인덱스 사용 금지)
// 결과는 생성 후 29일간 보관
```

### 7.4 캐시 무효화 규칙

| 트리거 | 무효화 범위 |
|---|---|
| `PROMPT_VERSION` 변경 | 해당 `kind` 전체 `report` 재생성 대상 (UNIQUE(cache_key, prompt_version) 덕분에 무중단 병행 가능) |
| `RULESET_VERSION` 변경 (야자시 정책 등) | `saju_chart` 전체 + 파생 `report` 전체 |
| `MODEL_ID` 변경 | 모델별 문체 차이 → 신규 키로 취급, 구 캐시는 읽기 전용 유지 |
| `period_key` 만료 | `daily`는 하루, `yearly`는 1년 |

---

## 8. 이미지 / 공유카드 생성

### 8.1 후보 비교

| 방식 | 스택 | 앱인토스 제약 적합성 | 비용 | 비고 |
|---|---|---|---|---|
| **(a) `@vercel/og` (Satori + resvg)** ← 권장 | Vercel Function(Node), HTML/CSS → PNG | 서버 사이드이므로 C1(SSR 금지)과 무관 (미니앱 내부가 아니라 외부 OG 엔드포인트) | Vercel Functions 호출 + CDN 캐시 (자동 캐시 헤더 부여) | **제약: `ttf`/`otf`/`woff`만, flexbox만(`display:grid` 불가), 번들 500KB 상한(JSX+CSS+폰트+이미지 합산)**, 권장 1200×630 |
| (b) 클라이언트 Canvas/`html-to-image` | 웹뷰 내 Canvas API | C2(eval 금지)와 무관, 순수 JS | 0원 | 폰트 로딩·기기별 렌더 차이, 저해상도 문제 |
| (c) Puppeteer/Playwright 스크린샷 | 서버 헤드리스 브라우저 | 가능 | Lambda 콜드스타트·메모리 큼, 컨테이너 비용 | 품질 최상, 비용/지연 최악 |
| (d) 사전 렌더 템플릿 + 텍스트 오버레이 | R2/Storage에 배경 PNG 사전 업로드 + Satori로 텍스트만 합성 | 가능 | R2 저장 $0.015/GB-월, egress 무료 | **번들 500KB 제약 회피에 유효** |

### 8.2 권장 구현

```
GET /api/og?k=<report_cache_key_short>&v=1
  ├─ Vercel Function (icn1, Node 런타임)
  ├─ Supabase에서 리포트 요약 3줄 + 사주 4주 8자 조회
  ├─ ImageResponse(<JSX/>, { width: 1200, height: 630 })
  │    · 한글 폰트: Pretendard subset(.woff → 가능하나 ttf/otf 권장)
  │    · 폰트 서브셋 필수 (전체 한글 ttf는 4~8MB → 500KB 상한 초과)
  │    · 배경 그라디언트/오행 컬러는 CSS로, 복잡 일러스트는 R2 원격 fetch
  └─ Cache-Control: public, max-age=31536000, immutable  (키에 v 포함)
```

**한글 폰트 500KB 제약 대응 (핵심)**

| 대응 | 상세 |
|---|---|
| 서브셋 | 리포트에 등장하는 글자 집합을 미리 산출 → `pyftsubset`으로 2,500자 수준 서브셋 (약 250~400KB ttf) |
| 이중 폰트 | 제목용 1종 + 본문용 1종만. 굵기 2종 이상 금지 |
| 원격 로드 | `fetch`로 R2에서 폰트를 런타임 로드 → 번들 500KB에서 제외 가능 (첫 호출 지연 ↑, CDN 캐시로 상쇄) |
| 카드뉴스 다장 구성 | 1장당 별도 엔드포인트 호출 (`?k=..&page=1..5`) → 각각 독립 CDN 캐시 |

**공유 딥링크**: C9에 따라 `intoss://{appName}?...` 스킴 사용, `intoss-private://` 금지. OG 메타는 미니앱 밖 공개 웹 랜딩(별도 도메인)에서 제공하되 **C8(자사 서비스 유도 금지)** 위반이 되지 않도록 "리포트 미리보기 → 토스에서 열기" 단일 CTA로 제한.

---

## 9. 모니터링 / 분석 도구 — 토스 웹뷰 내 사용 가능성

### 9.1 제약 재확인

앱인토스 비게임 체크리스트: **"외부에서 전달받은 코드를 실행하는 기능은 사용할 수 없어요"** (eval 등). 서드파티 분석 SDK는 대개 (1) 외부 CDN에서 스크립트를 로드하고, (2) 원격 설정으로 동작을 바꾸며, (3) 세션 리플레이는 DOM 전체를 전송한다. → **심사 리스크가 실재한다.**

### 9.2 도구별 판단

| 도구 | 도입 방식 | 웹뷰 적합성 | 판단 | 비용 |
|---|---|---|---|---|
| **GA4 (gtag.js)** | `https://www.googletagmanager.com/gtag/js` 원격 로드 | 원격 스크립트 로드 = C2 해석 여지. GTM **컨테이너** 방식은 원격 설정으로 코드 실행 → **명백히 위험** | ⚠ **gtag 직접 로드도 비권장. GTM 컨테이너는 금지 취급 권장** `[미검증 — 심사팀 확인 필요]` | 무료 (BigQuery export 시 GCP 비용) |
| **GA4 Measurement Protocol** | 자체 서버 → `https://www.google-analytics.com/mp/collect` | 클라이언트에 외부 코드 없음 | ✅ **권장** | 무료 |
| **Amplitude Browser SDK** | npm 패키지 번들 내장 가능 (`@amplitude/analytics-browser`) | **번들에 포함되므로 원격 코드 실행 아님** → C2 회피 | ✅ **npm 번들 내장 방식이면 가능성 높음.** 단 Session Replay 플러그인은 제외 | Starter 무료 티어 존재 `[미검증 — 가격 페이지 미확인]` |
| **Amplitude HTTP V2 API** | 자체 서버 → `api2.amplitude.com/2/httpapi` | 최고 안전 | ✅ **권장** | 위와 동일 |
| **PostHog (posthog-js)** | npm 번들 내장 가능. 단 기본 설정이 원격 config fetch(`/decide`) 수행 | `advanced_disable_decide: true`, `autocapture: false`로 원격 설정·자동캡처 차단 시 가능 | ⚠ 조건부 가능. **Session Replay는 도입 금지 권장**(개인정보 + C2) | **Analytics 100만 이벤트/월 무료**, 이후 **$0.00005/이벤트**(1~2M 구간) → 250M+ 구간 $0.000009. Feature Flags 100만 요청/월 무료 → $0.0001/요청. Session Replay 5K 녹화/월 무료 → $0.005/녹화. 리전: US(버지니아), EU(프랑크푸르트) |
| **Sentry** | npm 번들 내장 | 에러 리포팅은 필수. `tracesSampleRate` 낮게, `replaysSessionSampleRate: 0` | ✅ 가능 | `[미검증 — 가격 미확인]` |
| **Vercel Web Analytics** | Vercel 스크립트 | 원격 스크립트 로드 이슈 동일 | ⚠ 조건부 | Hobby 50,000 이벤트/월, Pro **$0.03 / 1K 이벤트** |
| **Vercel Observability Plus** | 서버 사이드(함수 로그/트레이스) | 클라이언트 무관 → 안전 | ✅ | **$1.20 / 100만 이벤트** |
| **자체 이벤트 파이프라인** | 웹뷰 → `POST /api/track` → Supabase/BigQuery | 완전 통제 | ✅ **가장 안전** | Supabase Edge Function $2/100만 또는 Vercel Function 호출비 |

### 9.3 권장 계측 아키텍처

```
[웹뷰]
  · @amplitude/analytics-browser (npm 번들, autocapture off)  ← 제품 분석
  · @sentry/react (npm 번들, replay off)                      ← 에러
  · 자체 track() → POST /api/track                            ← 원가·전환 핵심 지표
[서버]
  · /api/track → Supabase raw_event 테이블 (파티셔닝)
  · 야간 배치 → GA4 Measurement Protocol 전송 (마케팅 리포팅용)
  · Vercel Observability Plus                                 ← 함수 레이턴시/에러
  · Anthropic usage 기록 → report.usage / report.cost_usd     ← LLM 원가 대시보드
```

**반드시 계측해야 하는 LLM 운영 지표 5개**

| 지표 | 산식 | 목표 |
|---|---|---|
| 캐시 히트율(L1) | `hit_count / (hit_count + generated)` | 6개월 내 55%+ |
| 프롬프트 캐시 히트율(L0) | `cache_read_input_tokens / (input + cache_read)` | 75%+ |
| 리포트 1건 실효 원가 | `SUM(cost_usd) / COUNT(DISTINCT user_report)` | Opus 5 기준 $0.04 이하 |
| 출력 토큰 p95 | `usage->>'output'` p95 | 4,000 이하 (max_tokens 초과 truncation 감시) |
| 조립 대체율 | 조립 생성 / 전체 생성 | 60%+ |

---

## 10. 리스크 · 미확인 사항 정리

| # | 항목 | 영향 | 다음 액션 |
|---|---|---|---|
| R1 | **만세력 2051~2100 데이터 없음** (모든 후보 라이브러리가 2050 상한) | 1900~2100 요구 미충족 | KASI 공개 데이터 확인 또는 천문 알고리즘 자체 구현 검증 |
| R2 | **토크나이저 30% 증가**의 한국어 실측치 미확인 | LLM 원가 최대 30% 상방 오차 | `count_tokens` 로 실제 프롬프트/출력 모델별 측정 |
| R3 | **토스 로그인 mTLS**를 Cloudflare Workers / Supabase Edge에서 처리 가능한지 미확인 | 백엔드 선택 제약 | Node 런타임(Vercel/Lambda)에 인증 경로 고정으로 회피 |
| R4 | **GA4/PostHog 등 서드파티 스크립트가 C2(eval 금지)에 걸리는지** 심사팀 해석 미확인 | 재심사 지연(3~7일) | 채널톡 사전 문의. 최악 대비 자체 파이프라인 우선 구축 |
| R5 | **AWS Lambda ap-northeast-2 단가** 공식 페이지에 미기재 | 비용 비교 불완전 | AWS Pricing Calculator로 확정 |
| R6 | **Vercel Pro의 icn1 Active CPU 단가**가 "리전별 상이"로만 표기 | 비용 비교 불완전 | `/docs/pricing/regional-pricing` 확인 |
| R7 | **한국↔각 리전 실측 RTT** 미측정 | 레이턴시 판단이 정성적 | 실측(서울/도쿄/버지니아 각 10회 p50/p95) |
| R8 | **캐시 히트율 지프 분포 가정** 미검증 | 비용 시뮬레이션 오차 | 클로즈드 베타 1,000건 로그로 재산출 |
| R9 | **야자시/진태양시 유파 정책 미결정** | 결과 신뢰성 · 캐시 키 안정성 | 도메인 리서치 축과 합의하여 `RULESET_VERSION=1` 확정 |
| R10 | Sonnet 5 도입가 **2026-08-31 종료** ($2/$10 → $3/$15, +50%) | 3주 후 비용 상승 | 예산은 정가($3/$15) 기준으로 수립 |

---

## 11. 결정 요약표

| 결정 항목 | 결론 | 확신도 |
|---|---|---|
| 프론트 | 웹뷰 + Vite + React 18 + Emotion + `@toss/tds-mobile` | 높음 (SSR 금지가 결정적) |
| Next.js | **비권장** (SSG-only로 강제되어 이점 소멸) | 높음 |
| 정적 호스팅 | Vercel CDN | 중 |
| API 런타임 | Vercel Functions, **리전 `icn1` 명시 필수** (기본 iad1) | 중상 |
| DB | Supabase Postgres `ap-northeast-2` (서울) Pro $25/월 | 중상 |
| 객체 저장 | Supabase Storage 또는 Cloudflare R2 ($0.015/GB-월, egress 무료) | 중 |
| 만세력 | `@fullstackfamily/manseryeok`(MIT) 포크 + 2051~2100 확장, `@saju/core`로 클라·서버 공유 | 중 (R1 해결 필요) |
| 만세력 위치 | **클라이언트 즉시 표시 + 서버 재계산(단일 진실 원천)** 하이브리드 | 높음 |
| LLM 주력 | `claude-opus-5` (fusion), `claude-sonnet-5` (basic), `claude-haiku-4-5` (daily/조립) | 높음 |
| 캐싱 | L0 프롬프트 캐시 + L1 Postgres report 캐시 + L2 CDN | 높음 |
| 사전생성 | 약 1,749 블록 Opus 5 Batch 1회성 **$96** → Haiku 접합 리라이트 $0.0075/건 | 중상 |
| OG/공유 | `@vercel/og` (Satori+resvg), 폰트 서브셋 필수, 1200×630 | 중상 |
| 분석 | Amplitude npm 번들(autocapture off) + Sentry + 자체 `/api/track` + GA4 Measurement Protocol | 중 (R4) |

---

## 출처

실제로 WebFetch로 열어 확인한 URL만 나열한다.

1. [Pricing — Anthropic Claude Docs](https://platform.claude.com/docs/en/about-claude/pricing.md) — 전 모델 MTok 단가, 캐시 배수(1.25×/2×/0.1×), Batch 50% 할인표, 도구 사용 시스템 프롬프트 토큰 수, code execution 1,550시간 무료/$0.05 컨테이너-시간, web search $10/1,000, Fast mode $10/$50, 신규 토크나이저 ~30% 증가 고지
2. [앱인토스 개발자센터 — 사이트맵](https://developers-apps-in-toss.toss.im/sitemap.md) — 문서 경로 구조 (`.html`은 404, `.md`가 실경로)
3. [앱인토스 — 클라이언트 SDK](https://developers-apps-in-toss.toss.im/documentation/sdk.md) — `@apps-in-toss/web-framework`, 도메인 API 19종, graniteEvent/tdsEvent/appsInTossEvent 이벤트 버스
4. [앱인토스 — React Native 시작하기 (AI 바이브코딩 튜토리얼)](https://developers-apps-in-toss.toss.im/ai-vibe-coding/tutorials/react-native.md) — `npm create granite-app@"^1"`, `@apps-in-toss/framework`, `@toss/tds-react-native`, `npx ait init`, `granite.config.ts` 예시, 네이티브 모듈 제약, TDS 로컬 브라우저 미동작
5. [앱인토스 — 기존 웹 프로젝트에 SDK 연동 (웹뷰)](https://developers-apps-in-toss.toss.im/ai-vibe-coding/tutorials/webview.md) — `@apps-in-toss/web-framework`, `@toss/tds-mobile`/`@toss/tds-mobile-ait`, `@emotion/react@^11`+`react@^18`, `vite dev`/`vite build` 기본값, `appName`이 `intoss://{appName}` 딥링크 키
6. [앱인토스 — 토스 로그인 API](https://developers-apps-in-toss.toss.im/documentation/api/toss-login.md) — 베이스 `https://apps-in-toss-api.toss.im`, OAuth2 엔드포인트 5종, mTLS, accessToken 1시간/refreshToken 14일, 앱당 분당 3,000회, `userKey`/`birthday`/`gender`/`ci`/`di` 필드
7. [앱인토스 — API 개요](https://developers-apps-in-toss.toss.im/documentation/api.md) — 토스 로그인 / 인앱 결제(IAP) / 토스페이 / 푸시·알림 / 프로모션(토스 포인트) 카테고리
8. [앱인토스 — 미니앱 배포와 검토](https://developers-apps-in-toss.toss.im/guide/operation/deploy.md) — 검토 영업일 최대 3일(카테고리별 7일+), QR 테스트 1회 필수, 샌드박스 URL `private-web.tossmini.com`/`private-apps.tossmini.com`, 번들 100MB 이하, 롤백 지원
9. [앱인토스 — 비게임 출시 체크리스트](https://developers-apps-in-toss.toss.im/checklist/app-nongame.md) — **SSR 금지(CSR/SSG만)**, `eval` 등 외부 코드 실행 금지, `wss://`만 허용, 인터랙션 2초, 토스페이 외 결제 금지, 토스 로그인 외 인증 금지, `intoss://` 공유 스킴, 히스토리 조작·자동 바텀시트 금지
10. [앱인토스 — React Native 문서 인덱스](https://developers-apps-in-toss.toss.im/documentation/react-native.md) — 화면&내비게이션 / 노출감지 / 반응처리 / 위치 섹션 구성 (상세 스펙은 하위 페이지)
11. [Cloudflare Workers — Pricing](https://developers.cloudflare.com/workers/platform/pricing/) — Workers Free/Paid($5), 1,000만 요청+$0.30/100만, 3,000만 CPU-ms+$0.02/100만, KV·D1·R2·Durable Objects 전 항목 단가
12. [Vercel — Pricing on Vercel](https://vercel.com/docs/pricing) — Hobby 포함량(Active CPU 4h, 360 GB-hrs, 100만 호출), 시트 $20/월, 이미지 최적화·Web Analytics $0.03/1K·Observability $1.20/100만·Builds $0.0035/CPU-분, Pro 애드온
13. [Vercel — Global network and regions](https://vercel.com/docs/regions) — 20개 컴퓨트 리전 + 126 PoP, **`icn1` = ap-northeast-2 서울**, `hnd1` 도쿄, **기본 함수 리전 `iad1`**, failover 우선순위(icn1 = P14)
14. [Vercel — Open Graph (OG) Image Generation](https://vercel.com/docs/og-image-generation) — `@vercel/og`, Satori + Resvg, 권장 1200×630, **번들 500KB 상한**, `ttf`/`otf`/`woff`만, flexbox만(grid 불가), Node 런타임 지원, CDN 캐시 헤더 자동
15. [Supabase — Pricing](https://supabase.com/pricing) — Free/Pro $25/Team $599, DB 8GB·Egress 250GB·MAU 100k·Edge Function 200만·Storage 100GB, 초과 단가($0.125/GB, $0.09/GB, $0.00325/MAU, $2/100만, $0.0213/GB)
16. [Supabase Docs — Available regions](https://supabase.com/docs/guides/platform/regions) — **`ap-northeast-2` (Northeast Asia — Seoul) 지원 확인**, 전 리전 목록
17. [AWS Lambda — Pricing](https://aws.amazon.com/lambda/pricing/) — $0.20/100만 요청, $0.0000166667/GB-초(x86), Free Tier 100만 요청+400,000 GB-초. **단 "All examples below are based on price in US East (N. Virginia)" — 서울 리전 표 없음**
18. [PostHog — Pricing](https://posthog.com/pricing) — Analytics 100만 이벤트/월 무료 → $0.00005/이벤트(1~2M) ~ $0.000009(250M+), Session Replay 5K/월 무료 → $0.005/녹화, Feature Flags 100만/월 무료 → $0.0001/요청, US(버지니아)/EU(프랑크푸르트) 리전
19. [GitHub — urstory/manseryeok-js](https://github.com/urstory/manseryeok-js) — npm `@fullstackfamily/manseryeok`, **1900-01-01~2050-12-31**, ESM/CJS ~290KB·gzip ~95KB(원본 11.4MB→225KB, 98%↓), KASI 데이터 기반, `solarToLunar`/`lunarToSolar`/`getGapja`/`calculateSaju`/`getAllSolarTerms`/`getSajuMonth`, **MIT 라이선스**
20. [npm/GitHub 검색 결과 — 한국 음력·만세력 JS 라이브러리군](https://github.com/usingsky/korean_lunar_calendar_js) — `usingsky/korean_lunar_calendar_js`(음력 1000-01-01~2050-11-18 / 양력 1000-02-13~2050-12-31), `jangjunha/korean-lunar-calendar`, `kahyou22/kor-lunar-js`, `6tail/lunar-javascript`(간지·절기·팔자·오행·십신 포함, 중국 기준)

### 검색만 하고 개별 확인하지 않은 참고 링크 (인용 근거로 사용하지 않음)

- Amplitude vs GA4 비교 블로그 다수 — 앱인토스 미니앱 관련 구체 정보는 **검색 결과에 존재하지 않음**. §9의 판단은 앱인토스 체크리스트(출처 9)의 C2 조항 해석에 기반한 **추론이며 `[미검증]`**.
