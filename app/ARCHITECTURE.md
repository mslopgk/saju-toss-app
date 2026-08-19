# 아키텍처

## 의존 방향

```text
app / pages
    ↓
features
    ↓
shared/api · shared/lib · shared/ui · shared/knowledge · shared/interpret
    ↓
shared/data
```

- `shared` 는 기능 도메인에 의존하지 않는다.
- `features` 끼리 직접 import 하지 않는다. 연결은 `pages` 또는 `App.tsx` 조합 계층에서 한다.
- 외부 API 응답은 `shared/api` 경계에서 타입 검증한 뒤 내부로 넘긴다. 검증 없이 통과시키지 않는다.
- TDS 에 없는 공용 표현만 `shared/ui` 에 둔다. TDS 컴포넌트를 감싸기만 하는 래퍼는 만들지 않는다.
- `shared/interpret` 은 엔진 타입(`shared/lib/saju/types`)과 지식카드 타입(`shared/knowledge/types`)을
  **재수출**한다. 같은 개념을 두 번 정의하지 않는다.

작은 앱이므로 **빈 폴더를 미리 만들지 않는다.** 첫 기능에 필요한 디렉터리만 생성한다.

## 계층 경계

| 계층 | 책임 | 넣지 말 것 |
|---|---|---|
| `main.tsx` | Provider 래핑, 루트 마운트 | 화면 로직 |
| `App.tsx` | 페이지 조합, 2단계 화면 상태(`onboarding`→`result`), `EngineError` 문구 매핑 | 도메인 계산 |
| `pages/` | 화면 단위 조립, 데이터 요청 트리거 | 재사용 로직 |
| `features/` | 사용자 능력 단위(`onboarding` 입력, `report` 규칙 기반 리포트) | 다른 feature 직접 참조 |
| `shared/api` | 외부 경계 + 타입 검증 | 화면 상태 |
| `shared/lib` | 순수 유틸 · 계산 엔진(`lib/saju`) | React 의존 |
| `shared/data` | 빌드타임 생성 데이터 자산(`tables.json`·`strength-params.json`·절기 팩) | 로직 |
| `shared/knowledge` | 해석용 지식카드 198장 + 결정론적 검색(`cards.json` 단일 산출물) | 계산 규칙 |
| `shared/interpret` | 팩트팩 → 카드 검색 → 프롬프트 조립 → 응답 검증 | 화면 상태 · 계산 규칙 |
| `shared/ui` | TDS 부재 요소만 | TDS 래퍼 |

### `shared/interpret` 의 두 진입점

| 진입점 | 쓰는 쪽 | 담고 있는 것 |
|---|---|---|
| `shared/interpret/ui` | 화면(`pages`·`features`) | `DISCLAIMERS` · `SECTION_TITLES` · `buildFactPack` · `selectKnowledgeCards` · `renderTemplateReport` · 타입 |
| `shared/interpret`(배럴) | 서버·테스트 | 위 + 시스템 프롬프트 전문 · 모델 라우팅 · Anthropic Messages API 매퍼 · 응답 검증기 |

화면이 배럴을 import 하면 시스템 프롬프트가 미니앱 번들에 실려 사용자 단말로 내려간다.

`ui` 가 내보내는 값의 **전이 폐쇄**는 `{ui, copy, factPack, retrieve, template, ../knowledge/types}` 6개이며
`prompt`·`buildRequest`·`client`·`index`·`guard` 를 포함하지 않는다. 회귀는 두 겹으로 막는다:

1. `src/shared/interpret/ui.test.ts` — import 그래프를 정적으로 훑어 폐쇄 집합을 정확히 고정
2. 빌드 후 `grep '사실 규율' dist/assets/*.js` (0 이어야 한다)

## 계산 엔진 배치

사주·별자리·궁합 계산은 **결정론적 순수 함수**여야 한다(같은 입력 → 항상 같은 출력). 따라서:

- 계산 코드는 `shared/lib/saju` 에 두고 React·DOM·`Date.now()`·로컬 타임존에 의존하지 않는다.
- 입력 정규화(한국 표준시 이력·서머타임·진태양시)는 계산의 0단계이며 생략할 수 없다.
- 절기 테이블 등 데이터 자산은 번들 크기에 직접 영향을 준다. 클라이언트/서버 분담은 `C00 §7` 결정을 따른다.

엔진 v1(`SAJU-ENGINE-1.0.0`)이 실제로 내는 것은 S0·S1·S2·S3·S4-1·S6 이다.
**신살(S4-2) · 신강신약(S5) · 별자리(S7) · 캐시키(§7.3)는 아직 없다.** 해석 레이어의 `ChartLike` 에서
해당 섹션이 옵셔널인 이유이고, 팩트팩은 없는 섹션을 `missingSections` 에 명시한다 — 있는 척하지 않는다.

상세는 [../docs/research/calc/C00-계산엔진-통합명세서.md](../docs/research/calc/C00-계산엔진-통합명세서.md).

## 번들 분할

초기 청크에는 **온보딩 화면을 그리는 데 필요한 것만** 둔다. 계산 엔진·지식카드·리포트 렌더러는
결과 화면 진입 시점으로 미룬다. 경계는 `App.tsx` 한 곳에만 있다.

| 청크 | 경계 | 담고 있는 것 |
|---|---|---|
| `index-*.js` (초기) | — | React · TDS · AIT Provider · zod · 온보딩 화면 |
| `saju-*.js` | `import('./shared/lib/saju')` | 계산 엔진 · 절기 팩 · `strength-params.json` |
| `ResultPage-*.js` | `lazy(() => import('./pages/ResultPage'))` | 결과 화면 · 리포트 렌더러 · `cards.json` |
| `tables-*.js` | (rolldown 자동 공유) | `tables.json` — 엔진과 `factPack` 이 같이 쓴다 |

측정(`npx vite build`, gzip 은 vite 리포터 값):

| | raw | gzip |
|---|---|---|
| 분할 전 단일 청크 | 1,669.98 kB | 526.54 kB |
| 분할 후 **초기 청크** | **1,336.37 kB** | **421.05 kB** |
| 차이 | **−339.56 kB (−20.3%)** | **−107.30 kB (−20.4%)** |

지연 청크는 첫 페인트 뒤 `useEffect` 에서 미리 받아 둔다(`saju` 83.27 kB / gzip 50.51,
`ResultPage` 201.27 kB / gzip 42.19, `tables` 58.63 kB / gzip 17.18). 그래서 CTA 응답은 그대로다.

⚠ **지연되는 것은 모듈 로딩뿐이다.** 로드된 뒤 `computeChart()` 는 여전히 동기 순수함수이고,
`App.tsx` 는 모듈 프로미스를 캐시해 `EngineError` 클래스가 두 벌이 되지 않게 한다.
경계가 조용히 무너지는 것(정적 import 한 줄이 돌아오는 것)은 `src/App.split.test.ts` 가 막는다.

## 알려진 제약

- **번들 크기의 바닥은 TDS 다**: 초기 청크 1,330 kB 중 **`@toss/tds-mobile` 이 1,384 kB(rendered)**,
  즉 gzip 419 kB 의 대부분이다. 이 패키지는 `dist/esm/index.js` **단일 모듈**이고 내부가
  `Object.defineProperty` 네임스페이스 게터로 묶여 있어, 컴포넌트를 **하나만 import 해도 전부 들어온다**.

  | 실측(lib 모드, react external) | raw | gzip |
  |---|---|---|
  | `import { Paragraph }` 1개 | 1,294.71 kB | 359.66 kB |
  | 컴포넌트 11개 | 1,294.76 kB | 359.63 kB |
  | `import '@toss/tds-mobile'` (미사용) | 0.06 kB | 0.08 kB |

  `sideEffects: false` 는 지켜지므로 **안 쓰면 통째로 빠지지만, 쓰면 통째로 들어온다.**
  루트에 `TDSMobileAITProvider` 가 있는 한 초기 청크에서 뺄 방법이 없다(그리고 빼면 안 된다).
  서브패스 export 는 `package.json` 에 없다 — 벤더 쪽 패키징 문제라 앱에서 고칠 수 없다.
- **다음 축소 여지**(초기 청크 기준, TDS 를 뺀 나머지 ~60 kB gzip 중):
  - `zod` ~113 kB(rendered). `OnboardingForm` 이 렌더마다 `buildBirthInput(draft)` 를 부르므로
    현재는 초기 렌더 경로다. 빼려면 CTA 활성 판정을 zod 밖으로 옮겨야 한다(온보딩 로직 변경).
  - `cards.json` 198장 중 도달 가능한 것은 **60장뿐**이다. 도달 가능분만 굽는 것이
    `ResultPage` 청크를 42 kB gzip → 대략 그 1/3 로 줄인다(`scripts/build-knowledge.mjs` 영역).
    다만 이건 **초기 청크에 영향이 없다** — 이미 경계 뒤로 나갔다.
- **음력 표는 초기 청크에 있다**: `src/shared/data/lunar-table.packed.ts`(576 B base64, gzip 기여 **0.55 kB** 실측).
  온보딩 날짜 시트가 "그 해에 실제로 있는 달"을 그리려면 표가 필요하고, 온보딩은 초기 화면이기 때문이다.
  그래서 `shared/lib/saju/lunar.ts` 는 **배럴이 아니라 딥 임포트**로만 쓰고, 그 파일은 데이터 파일 말고
  아무것도 import 하지 않는다 — `./pillars` 한 줄이면 간지·납음 상수가 따라 들어온다.
  회귀는 `test/saju/lunar.test.ts`「번들 경계」가 소스의 import 목록을 고정해서 막는다.
- **다크모드**: `TDSMobileAITProvider` 가 `colorPreference: 'light'` 를 고정한다. 다크모드는 현재 지원 대상이 아니다.
- **React 18 고정**: TDS peer 범위가 `^16.8.3 || ^17 || ^18` 이라 React 19 를 쓸 수 없다. [docs/decisions/0002-react-18-pin.md](./docs/decisions/0002-react-18-pin.md)
