# 사주믹스 해석 서버

미니앱(`app/`)이 계산한 차트를 받아 **LLM 해석 문장**을 돌려주는 독립 Node 서버.

프롬프트·지식카드·API 키는 **전부 여기에만** 있다. 클라이언트가 보내는 것은 차트와 자기신고 값뿐이고,
받는 것은 완성된 문장뿐이다. 조립된 프롬프트가 클라이언트 → 서버 방향으로 흐르면 클라이언트가
시스템 프롬프트를 바꿔 보낼 수 있기 때문이다(프롬프트 주입).

```
WebView (sajuapp.web.tossmini.com)          이 서버
  computeChart()  ─ Chart+프로필 ─────────▶  zod 검증(선언 안 한 키는 버림)
                                              → buildFactPack()          ┐
                                              → selectKnowledgeCards()   │ 전부 app/src/shared/interpret
                                              → buildInterpretationRequest()
                                              → [narrativeKey 캐시 조회]  │  (복붙 아님 — 경로 참조)
                                              → Anthropic Messages API   │
                                              → verifyInterpretation()   ┘
  Interpretation  ◀─ 문장 ─────────────────  200 / 422 / 5xx
        └ 실패하면 규칙 기반 리포트 그대로 (화면은 절대 비지 않는다)
```

---

## ⚠️ 실제 API 호출은 아직 한 번도 검증되지 않았다

이 저장소에는 `ANTHROPIC_API_KEY` 가 없다. 그래서 **다음은 전부 미검증**이다.

| 미검증 항목 | 왜 |
|---|---|
| 모델이 구조화 출력 스키마대로 답하는가 | 실호출 필요 |
| `output_config.effort` · `thinking: adaptive` 조합이 400 없이 통과하는가 | 실호출 필요 |
| `fallbacks: "default"` + `server-side-fallback-2026-07-01` 베타가 이 조직에 열려 있는가 | 실호출 필요 (400 이면 런타임이 자동 후퇴한다 — 아래 참조) |
| 프롬프트 캐시가 실제로 걸리는가(`cache_read_input_tokens > 0`) | 실호출 필요 |
| §토큰·원가 표의 **토큰 열** | `count_tokens` 실측 필요 |

단위 테스트 90건이 고정한 것은 **"무엇을 보내는가"와 "무엇을 받았을 때 어떻게 판단하는가"**까지다.
키를 넣은 뒤 `npm run smoke` 를 한 번 돌려 위 표를 닫아야 한다(§스모크).

---

## 빠른 시작

```bash
cd server
npm install
npm run build                      # esbuild → dist/main.mjs · dist/smoke.mjs
ANTHROPIC_API_KEY=sk-ant-... npm start
curl localhost:8787/health
```

키가 없으면 **기동 자체가 실패한다**(exit 1). 떠 있는 채로 실패하면 클라이언트가 조용히 규칙 기반
폴백으로 돌아가서 아무도 배포 사고를 눈치채지 못하기 때문이다.

---

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | **필수** | 프로세스 환경변수로만. 코드·번들·설정파일에 두지 않는다. 로그에도 값이 남지 않는다(로거가 `*key*` 필드를 지운다). |
| `PORT` | `8787` | |
| `HOST` | `127.0.0.1` | 리버스 프록시 뒤가 기본 가정. 컨테이너면 `0.0.0.0`. |
| `CORS_ORIGINS` | `https://sajuapp.web.tossmini.com,https://sajuapp.private-web.tossmini.com` | 쉼표 구분. 경로·후행 슬래시는 오리진 형태로 정규화된다. |
| `MAX_BODY_BYTES` | `131072` | 넘으면 버퍼링을 멈추고 413. |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `20` | IP 당 고정 창. |
| `MAX_IN_FLIGHT` | `4` | **업스트림 동시 호출 상한.** 원가·조직 레이트리밋 방어의 마지막 선. |
| `CACHE_MAX_ENTRIES` / `CACHE_TTL_MS` | `2000` / `86400000`(24h) | 서사 캐시(LRU+TTL). |
| `UPSTREAM_TIMEOUT_MS` | `120000` | Opus 5 + effort high 는 1분을 넘길 수 있다. |
| `UPSTREAM_MAX_RETRIES` | `2` | SDK 자동 재시도(429/5xx/네트워크). |
| `INTERPRET_MAX_ATTEMPTS` | `1` | 검증 실패 시 재시도 횟수. **2 로 올리면 원가가 최대 2배**가 된다. |
| `ANTHROPIC_SERVER_SIDE_FALLBACK` | `true` | Opus 5 거부 시 서버측 폴백. 베타 미개방이면 400 → 런타임이 경고를 남기고 자동으로 끈 뒤 재시도한다. |
| `TRUST_PROXY` | `false` | 리버스 프록시 뒤일 때만 `true`. **켜면 `x-forwarded-for` 를 믿으므로**, 프록시가 없으면 레이트리밋이 무력화된다. |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`/`silent` |

`.env` 파일은 읽지 않는다(런타임 의존성을 늘리지 않으려고). 프로세스 매니저나 컨테이너의
환경변수 주입을 쓴다. 견본은 `.env.example`.

---

## API

### `POST /api/interpret`

```jsonc
// 요청 — 계산된 Chart 를 그대로 넣어도 된다(선언하지 않은 키는 서버가 버린다).
{
  "kind": "fusion",              // 또는 "basic_saju". 생략하면 fusion.
  "chart": { /* computeChart() 결과 */ },
  "profile": { "gender": "M", "mbti": "INTJ", "blood": "A" }
}
```

| 상태 | 본문 | 클라이언트가 할 일 |
|---|---|---|
| `200` | `{status:"ok", source:"llm"\|"cache", narrativeKey, value}` | 문장을 갈아 끼운다 |
| `422` | `{status:"rejected", narrativeKey, failures}` | 규칙 기반 유지 |
| `400` | `{status:"error", code:"BAD_REQUEST"\|"BAD_JSON", issues}` | 규칙 기반 유지 |
| `403` | 허용되지 않은 오리진 | — |
| `413` | 본문 초과 | — |
| `429` | 레이트리밋 (`Retry-After`) | 규칙 기반 유지 |
| `502` / `504` | 업스트림 오류 / 시간 초과 | 규칙 기반 유지 |

**어떤 실패든 클라이언트의 처리는 하나다 — 규칙 기반 리포트를 그대로 둔다.**

### `GET /health`

```json
{ "status": "ok", "promptVersion": "SAJU-PROMPT-1.2.0", "cache": { "size": 12, "hits": 40, "misses": 12, "evictions": 0, "coalesced": 3 } }
```

비밀값·개인정보를 담지 않는다. 배포 확인과 캐시 히트율 관찰용.

---

## 캐시 (원가와 직결)

키는 앱이 만드는 `narrativeKey` 를 **그대로** 쓴다.

```
PROMPT_VERSION | engineVersion | kind | 차트정체성 | 성별 | MBTI | 혈액형 | fnv1a32(카드 id 목록)
```

- 같은 차트·같은 프로필·같은 지식베이스 → 반드시 같은 키
- 프롬프트·엔진·카드 중 하나라도 바뀌면 키가 달라진다 → **수동 무효화가 필요 없다**
- PII 가 없다(이름·기기 식별자를 프로필에 두지 않았다) → 로그에 남겨도 된다

같은 키의 **동시** 요청은 단일 비행(single-flight)으로 합친다. 캐시가 아직 비어 있는 사이 두 요청이
들어오면 둘 다 Opus 5 를 부르는데, 그것만으로 건당 원가가 두 배가 된다.

메모리 캐시라 **재시작하면 사라진다.** 인스턴스가 여러 대면 히트율이 대수만큼 나뉜다.
Redis 로 옮기는 것이 다음 단계이고, 그때 `NarrativeCache` 인터페이스(`get`/`set`/`singleFlight`)만
맞추면 된다.

---

## 원가 (실측 문자 수 기준)

문자 수는 **이 구현으로 실측**했다(`npm run smoke -- --tokens-only`). 토큰은 아직 0.86 tok/char 환산
추정이며, `count_tokens` 를 돌리기 전까지 **`[미검증]`** 이다.

### 프롬프트 크기 (fusion · 카드 14장 기준)

| 구성 | 문자 | 토큰(추정) | 캐시 |
|---|---:|---:|---|
| 정적 프리픽스 (system 7블록) | **2,735** | ≈ 2,350 | ✅ |
| fact_pack JSON | **2,363** | ≈ 2,030 | ❌ |
| 지식 카드 14장 + 섹션 지시 | **4,958** | ≈ 4,260 | ❌ |
| **입력 합계** | **10,056** | **≈ 8,650** | |
| 출력(6섹션 한국어 ≈ 3,200자) | | ≈ 2,800 | |

> ⚠️ `docs/interpretation.md` §4.2 의 추정(입력 6,500 토큰)보다 **약 33% 크다.**
> 원인은 두 가지다 — ① 카드 한 장이 250자가 아니라 **354자**다 ② 팩트팩이 1,600자가 아니라 **2,363자**다
> (S5·신살·대운이 실제로 채워지면서 늘었다). 아래 표는 실측 문자 수로 다시 계산한 값이다.

### 리포트 1건 (환율 1,455원/USD)

| 시나리오 | 계산 | USD | KRW |
|---|---|---:|---:|
| **fusion / 캐시 미스** (Opus 5) | 8,650×$5 + 2,800×$25 /1M | $0.1133 | **약 165원** |
| **fusion / 프리픽스 캐시 히트** | 2,350×$0.50 + 6,300×$5 + 2,800×$25 /1M | $0.1027 | **약 149원** |
| **fusion / 서사 캐시 히트** | — | $0 | **0원** |
| **basic_saju** (Sonnet 5 도입가) | 2,350×$0.20 + 6,250×$2 + 1,800×$10 /1M | $0.0310 | **약 45원** |
| **basic_saju** (Sonnet 5 정가, 2026-09-01~) | 2,350×$0.30 + 6,250×$3 + 1,800×$15 /1M | $0.0465 | **약 68원** |

단가는 `pricing.json` 한 곳에 있다(출처: claude-api 스킬 2026-08-12).

### 원가 구조에서 읽히는 것

- **출력이 원가의 68%** ($0.070 / $0.1027). 프롬프트 캐싱은 입력측을 크게 줄이지만 총원가는 −9% 뿐이다.
  가장 강한 레버는 순서대로 ① **서사 캐시 히트율** ② **출력 길이** ③ 사전생성 배치다.
- **카드 수가 곧 원가**다. `LLM_RETRIEVAL.maxCards` 를 14 → 10 으로 줄이면 입력이 1,400자쯤 줄어 건당
  약 6원 내려간다. 대신 근거가 얇아진다 — 규칙 기반 경로(64장)와 값이 다른 이유가 이것이다.
- `INTERPRET_MAX_ATTEMPTS=2` 는 **최악의 경우 원가를 2배**로 만든다. 기본이 1인 이유.

---

## 배포

### 프로세스 매니저 (systemd)

```ini
# /etc/systemd/system/sajumix-interpret.service
[Unit]
Description=sajumix interpret server
After=network.target

[Service]
Type=simple
User=sajumix
WorkingDirectory=/srv/sajumix/server
ExecStart=/usr/bin/node dist/main.mjs
Restart=always
RestartSec=3
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=8787
Environment=TRUST_PROXY=true
# 키는 파일 권한으로 가린다(0600, root:sajumix). 유닛 파일에 직접 쓰지 않는다 —
# `systemctl show` 가 유닛의 Environment= 를 그대로 뱉는다.
EnvironmentFile=/etc/sajumix/interpret.env
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

```bash
# /etc/sajumix/interpret.env  (chmod 600)
ANTHROPIC_API_KEY=sk-ant-...
```

### 리버스 프록시 (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name api.example.com;

  # 인증서 설정 생략

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Opus 5 + effort high 는 1분을 넘길 수 있다. 기본 60초면 프록시가 먼저 끊는다.
    proxy_read_timeout    180s;
    proxy_send_timeout    180s;
    proxy_connect_timeout 10s;

    # CORS 는 애플리케이션이 처리한다. 여기서 헤더를 또 붙이면 중복돼서 브라우저가 거부한다.
    proxy_buffering off;
  }
}
```

**프록시를 쓰면 `TRUST_PROXY=true` 를 켜야** 레이트리밋이 실제 클라이언트 IP 로 걸린다.
반대로 프록시가 없는데 켜면 헤더를 위조해 레이트리밋을 무한 우회할 수 있다.

### 클라이언트 쪽 설정

미니앱은 정적 번들이라 런타임 설정 주입 경로가 없다. 빌드 시 주소를 넣는다.

```bash
cd app
VITE_INTERPRET_API_BASE=https://api.example.com npm run build
```

**비워 두면 LLM 경로가 아예 꺼진다**(네트워크 시도조차 하지 않고 규칙 기반 리포트만 나온다).
그것이 서버 미배포 상태의 정상 동작이다.

### 배포 순서

1. 서버 먼저 올리고 `GET /health` 확인
2. `npm run smoke` 로 실호출 1건 확인(§스모크)
3. 그 다음에 `VITE_INTERPRET_API_BASE` 를 넣어 앱을 다시 빌드·검수
4. 롤백은 반대로 — 앱을 주소 없이 다시 빌드하면 서버를 내리지 않고도 LLM 경로만 끌 수 있다

---

## 스모크 (키 주입 후 1회)

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run build && npm run smoke

# 돈을 쓰지 않고 토큰만 재고 싶을 때
ANTHROPIC_API_KEY=sk-ant-... npm run smoke -- --tokens-only

# Sonnet 라우팅으로
ANTHROPIC_API_KEY=sk-ant-... npm run smoke -- --kind basic_saju

# 서버측 폴백 베타를 빼고
ANTHROPIC_API_KEY=sk-ant-... npm run smoke -- --no-fallback
```

출력 5단계: ① 프롬프트 크기 ② `count_tokens` 실측 ③ 실제 1건 생성 ④ 캐시 확인 ⑤ 원가 어림.

**보는 곳**

- `[2]` 의 토큰 수 → 이 README 의 토큰 열에서 `[미검증]` 을 뗄 근거. `docs/interpretation.md` I7 종료.
- `[3] status` 가 `rejected` 면 프롬프트나 가드 규칙 문제다. 실패 코드가 그대로 찍힌다.
- `[3]` 로그의 `cacheReadTokens` 가 0 이면 **프롬프트 캐시가 안 걸린 것**이다(에러 없이 조용히 실패한다).
  두 번째 호출부터 0 이 아니어야 한다.
- `[4] source` 가 `cache` 가 아니면 캐시 키가 흔들리는 것이다.

---

## 개발

```bash
npm run typecheck   # tsc --noEmit (앱 소스까지 함께 검사한다)
npm test            # vitest — 실제 API 호출 0건
npm run build       # esbuild 번들
```

### 구조

| 파일 | 하는 일 |
|---|---|
| `src/main.ts` | 진입점. 설정이 잘못되면 여기서 죽는다. |
| `src/config.ts` | env 파싱. 키에 대해 말할 수 있는 것은 "있다/없다"와 길이뿐. |
| `src/http.ts` | 라우팅·CORS·본문 크기 상한·레이트리밋. `node:http` 만 쓴다. |
| `src/requestSchema.ts` | zod 검증. **문자 집합까지 좁혀 프롬프트 주입을 막는다.** |
| `src/interpret.ts` | 조립 → 캐시 → 호출 → 검증 오케스트레이션. |
| `src/anthropic.ts` | SDK 호출·거부/절단 판정·서버측 폴백 후퇴. |
| `src/cache.ts` | LRU+TTL + 단일 비행. |
| `src/rateLimit.ts` | 고정 창 레이트리밋 + 동시성 세마포어. |

### 앱 코드는 참조한다 — 복붙하지 않는다

프롬프트(`prompt.ts`)·조립기(`buildRequest.ts`)·검색(`retrieve.ts`)·검증(`guard.ts`)·지식카드
(`cards.json`)는 전부 `../app/src/shared/` 를 상대경로로 import 한다. esbuild 가 번들에 넣는다.

두 벌이 되면 한쪽만 고쳐지고, 그 결과는 에러가 아니라 **다른 문장이 조용히 나가는 것**이라 아무도
못 잡는다. `test/reuse.test.ts` 가 세 방향으로 고정한다:
서버 소스에 프롬프트 문구가 없을 것 · 앱을 실제로 import 할 것 · 번들에는 프롬프트가 들어 있을 것.

> 앱 번들은 정반대다 — `grep '사실 규율' app/dist/assets/*.js` 는 **0** 이어야 한다.

### 보안 경계 요약

| 무엇 | 어디서 막는가 |
|---|---|
| API 키 유출 | 서버 env 전용 · 로거가 `*key*` 필드와 `sk-ant-*` 패턴을 지움 · 에러 메시지에 키를 넣지 않음 |
| 프롬프트 유출 | 클라이언트는 `clientFetch.ts`(값 import 0개)만 씀 · 앱 dist grep · `ui.test.ts` |
| 프롬프트 주입 | zod 가 미선언 키를 버리고, 자유 문자열(MBTI·신살명·격국명)의 **문자 집합까지** 제한 |
| 비용 폭주 | 서사 캐시 · 단일 비행 · IP 레이트리밋 · 동시 호출 세마포어 · 재시도 기본 1회 |
| 환각 | `verifyInterpretation()` 5단(스키마·섹션·카드 id·금지어·지어낸 간지/수치) |
