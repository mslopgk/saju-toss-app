---
name: apps-in-toss-vibe-starter
description: 바이브 코딩으로 새 Apps in Toss(앱인토스, 토스 미니앱) WebView 프로젝트를 시작할 때 저장소를 준비하고, Vite React TypeScript 기반 앱에 공식 SDK를 설치한 뒤 대화형 `ait init`을 반드시 끝까지 실행하며, TDS Mobile AIT Provider와 에이전트 친화적 폴더·문서 구조를 구성한다. 사용자가 토스 미니앱을 처음 만들기, 프로젝트 초기화, 폴더 구조, ait init, TDS 설정, AI 코딩 환경이나 시작 스캐폴드를 요청하면 반드시 사용한다. 오픈 정책 검토, 샌드박스·테스트앱 연결, 번들 업로드, 검수, 배포만 요청한 경우에는 사용하지 않는다.
compatibility: Apps in Toss MCP 문서 검색 도구와 대화형 터미널(PTY), Node.js 및 npm 필요
---

# Apps in Toss 바이브 코딩 시작 가이드

새 WebView 미니앱을 AI가 읽고 고치기 쉬운 형태로 초기화한다. 이 스킬의 완료 지점은 로컬 프로젝트·TDS·저장소 지식 지도가 준비되고 기본 정적 검증이 통과한 상태다.

## 범위

포함한다.

- 새 Vite React TypeScript 프로젝트 준비
- `@apps-in-toss/web-framework` 설치
- 대화형 `npx ait init` 완주
- CLI가 생성한 설정 보존 및 확인
- TDS WebView 패키지와 `TDSMobileAITProvider` 설정
- 작은 `AGENTS.md`, 아키텍처·제품·디자인 문서와 예측 가능한 소스 구조
- 로컬 타입 검사 또는 빌드 전 단계의 정적 검증

포함하지 않는다.

- 서비스 오픈 정책 재검토: 사용자가 프로젝트 시작 전에 별도 확인한다고 가정한다.
- 샌드박스 앱 설치·연결·실기기 테스트
- `.ait` 번들 업로드, 토스 앱 테스트, 검수, 출시·배포
- 로그인·결제·광고 같은 제품 기능 구현

사용자가 제외 영역도 함께 요청하면 시작 구성을 먼저 완료하고, 제외 영역은 별도 후속 스킬의 범위라고 짧게 알린다. 오픈 정책 스킬을 자동 실행하거나 같은 질문을 반복하지 않는다.

## 문서 우선순위

Apps in Toss SDK와 TDS는 바뀔 수 있으므로 작업 시작 시 MCP로 다음 문서를 검색하고 전체 내용을 읽는다.

1. `ait init 프로젝트 초기화`
2. `기존 웹 프로젝트에 SDK 연동하기`
3. TDS Web 문서에서 `설치 시작하기`
4. 필요할 때 `SDK 3.x` 또는 현재 설치 버전의 설정 문서

검색은 한국어로 하고, 검색 결과 미리보기만으로 패키지·설정 파일 이름을 결정하지 않는다. `get_doc` 또는 `get_tds_web_doc`으로 원문을 읽는다. 설치된 CLI가 만든 결과와 공식 문서가 다르면 CLI 결과를 보존하고 차이를 사용자에게 보고한다.

## 작업 원칙

OpenAI의 Harness Engineering에서 가져온 원칙을 작은 미니앱 규모에 맞게 적용한다.

- 사람은 목표와 제품 의도를 정하고 AI는 실행한다.
- 저장소를 지식의 기준으로 삼는다. 채팅에서 합의한 핵심 결정은 짧은 문서로 남긴다.
- `AGENTS.md`는 백과사전이 아니라 지도다. 세부 내용은 `docs/`로 연결한다.
- 에이전트가 추측하지 않도록 예측 가능한 폴더 경계, 실행 명령, 검증 기준을 둔다.
- 구현을 세세히 통제하기보다 중요한 불변 조건을 명시한다: TDS 우선, 기능 경계, 외부 데이터 파싱, 검증 명령 등.
- 시작 단계에 필요하지 않은 복잡한 추상화·CI·관측성은 만들지 않는다.

자세한 설계 근거와 기본 구조는 [references/harness-and-structure.md](references/harness-and-structure.md)를 읽는다.

## 1. 시작 전 확인

질문은 작업을 막는 정보만 묻는다.

- 새 프로젝트를 만들 경로
- 콘솔의 `appName` 또는 임시 app name
- 사용자에게 보일 앱 이름
- 한 문장의 핵심 사용자 가치
- 브랜드 주색상(없으면 TDS 기본색을 우선하고 임의 브랜드색을 만들지 않음)

현재 디렉터리에 파일이 있으면 먼저 읽는다. 사용자 파일을 덮어쓸 가능성이 있으면 중단하고 새 하위 폴더 또는 기존 프로젝트 연동 중 무엇을 원하는지 묻는다.

Node와 npm을 확인한다.

```bash
node -v
npm -v
```

없으면 설치가 필요하다고 알리고 초기화를 진행하지 않는다.

## 2. 웹 프로젝트 준비

빈 대상 폴더에서 Vite React TypeScript 프로젝트를 만든다. 사용자가 다른 웹 스택을 명시하지 않은 새 프로젝트는 공식 가이드와 잘 맞는 WebView + React + TypeScript를 기본으로 한다.

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install @apps-in-toss/web-framework
```

이미 Vite React TypeScript 프로젝트가 있으면 재생성하지 않고 SDK만 설치한다. 다른 기존 프로젝트라면 공식 WebView 연동 문서를 확인하고 최소 변경으로 준비한다.

## 3. `ait init`을 반드시 실행

SDK 설정 파일을 직접 작성하거나 복사해서 `ait init`을 대체하지 않는다. AI가 템플릿 선택 프롬프트에서 멈추더라도 초기화 파일을 손으로 만드는 것은 이 스킬의 실패다.

대화형 터미널(PTY/TTY)에서 실행한다.

```bash
npx ait init
```

프롬프트를 실제로 읽고 한 단계씩 응답한다.

1. 템플릿: `웹 프레임워크`
2. app name: 사용자가 준 `appName`
3. dev 명령: `vite --host 0.0.0.0`
4. build 명령: `tsc -b && vite build`
5. web port: 기존 Vite 설정과 충돌이 없다면 `5173`

선택 UI에서는 방향키와 Enter를 사용한다. 입력을 한꺼번에 pipe하지 않는다. 각 프롬프트가 나타난 뒤 답하고, `✨ 초기화가 완료되었습니다!` 또는 현재 CLI의 동등한 성공 메시지와 종료 코드 0을 확인한다.

CLI가 다른 질문을 하면 추측으로 파일을 만들지 말고 화면을 읽어 가장 가까운 WebView 선택을 한다. app name처럼 제품 정체성을 바꾸는 질문의 답을 모르면 사용자에게 묻는다.

### 멈춤·실패 처리

- 60초 이상 새 출력이 없으면 같은 세션을 poll하고 프롬프트가 화면 밖에 있는지 확인한다.
- TTY 문제면 PTY가 활성화된 새 세션에서 `npx ait init`을 다시 실행한다.
- 부분 생성물이 있으면 내용을 확인한 후 같은 CLI를 재실행하거나 사용자에게 충돌을 보고한다.
- 직접 `granite.config.ts`, `apps-in-toss.config.ts` 또는 동등한 초기화 파일을 만들어 우회하지 않는다.
- 세 번의 정상적인 PTY 재시도 후에도 CLI 자체 오류가 반복되면 로그와 시도 내용을 보고하고 멈춘다.

정상 로그 예시는 [references/ait-init.md](references/ait-init.md)를 참조한다.

## 4. CLI 결과 확인

초기화 뒤 다음을 확인한다.

- CLI가 생성한 Apps in Toss 설정 파일
- appName, dev 명령, build 명령, port
- `package.json` scripts와 실제 설정의 일치
- `.gitignore` 업데이트

SDK 버전에 따라 설정 파일이 `granite.config.ts` 또는 `apps-in-toss.config.ts`일 수 있다. 특정 이름을 강제하지 말고 현재 CLI 산출물을 기준으로 한다. `ait init` 결과를 최신 공식 문서와 대조해 필요한 최소 수정만 한다.

## 5. TDS를 기본 디자인 언어로 설정

TDS Web 문서의 최신 Start 원문을 다시 조회한 뒤 그 명령을 따른다. 2026-07-10 조회 기준 예시는 다음과 같지만, 버전이 달라질 수 있으므로 고정값처럼 사용하지 않는다.

```bash
npm install @toss/tds-mobile @toss/tds-mobile-ait @emotion/react@^11 react@^18 react-dom@^18
```

앱 루트에서 `TDSMobileAITProvider`로 전체 UI를 감싼다.

```tsx
import { TDSMobileAITProvider } from '@toss/tds-mobile-ait';

<TDSMobileAITProvider>
  <App />
</TDSMobileAITProvider>
```

구체적인 import 위치는 생성된 Vite 구조를 먼저 읽고 결정한다. Provider를 중복으로 감싸지 않는다.

디자인 구현 규칙:

- 버튼, 리스트, 배지, CTA, 타이포그래피, 색상 등은 TDS 컴포넌트·토큰을 먼저 검색한다.
- 존재하는 TDS 컴포넌트를 일반 HTML/CSS로 재현하지 않는다.
- TDS API 이름이나 props를 기억으로 추측하지 않고 `search_tds_web_docs` 후 전체 문서를 읽는다.
- 필요한 컴포넌트가 없을 때만 작은 로컬 컴포넌트를 만들고 `src/shared/ui`에 둔다.
- 앱 전용 레이아웃 CSS와 도메인 표현은 허용하되 TDS의 시각 언어를 덮어쓰는 전역 스타일은 피한다.

## 6. 에이전트 친화적 구조 만들기

Vite와 `ait init`이 만든 파일을 이동·삭제하지 않고 아래 구조를 필요한 만큼 추가한다.

```text
.
├── AGENTS.md
├── ARCHITECTURE.md
├── docs/
│   ├── product.md
│   ├── design-system.md
│   └── decisions/
├── src/
│   ├── app/          # provider, router, global composition
│   ├── pages/        # route-level screens
│   ├── features/     # user capabilities by domain
│   └── shared/
│       ├── api/      # external boundaries and typed clients
│       ├── lib/      # small reusable utilities
│       └── ui/       # TDS 조합 또는 없는 요소만
└── [CLI가 생성한 Apps in Toss 설정 파일]
```

작은 앱은 빈 폴더를 미리 만들지 않는다. 첫 기능에 필요한 디렉터리만 생성한다.

문서 내용:

- `AGENTS.md`: 프로젝트 목적, 핵심 명령, 구조 지도, TDS 우선 규칙, 상세 문서 링크. 짧게 유지한다.
- `ARCHITECTURE.md`: 의존 방향 `app/pages → features → shared`, 외부 데이터는 `shared/api` 경계에서 검증한다는 규칙.
- `docs/product.md`: 대상 사용자, 문제, 핵심 흐름, 이번 MVP와 제외 범위.
- `docs/design-system.md`: TDS 패키지, Provider 위치, 사용한 컴포넌트 목록, 로컬 UI 예외.
- `docs/decisions/`: 실제로 선택지가 있었던 중요한 결정만 한 파일씩 기록한다.

대화에서 합의하지 않은 제품 요구사항을 문서에 지어내지 않는다. 미정 값은 `미정`으로 표시한다.

## 7. 시작 화면과 정적 검증

사용자가 시작 화면 구현을 요청했거나 빈 화면 검증이 필요하면 TDS의 실제 문서를 조회해 작은 화면 하나만 만든다. 제품 기능을 앞서 구현하지 않는다.

다음 검증을 실행한다.

```bash
npm run build --if-present
```

단, build script가 `ait build`까지 포함해 이 스킬의 범위를 넘어서는 번들 생성을 수행하더라도 로컬 검증 목적의 실행은 허용된다. 업로드·샌드박스 연결·배포는 하지 않는다. 더 가벼운 `typecheck` 또는 `lint` 스크립트가 있으면 함께 실행한다.

오류가 나면 로그를 읽고 코드·의존성·설정을 수정한 뒤 다시 검증한다. 검증을 통과하기 위해 TDS Provider나 `ait init` 산출물을 제거하지 않는다.

## 완료 보고

짧게 다음을 보고한다.

- 프로젝트 경로와 선택한 WebView 스택
- `ait init` 성공 여부 및 생성된 설정 파일 이름
- TDS 설치·Provider 위치
- 만든 구조와 문서
- 실행한 검증과 결과
- 의도적으로 하지 않은 것: 오픈 정책 재확인, 샌드박스 테스트, 업로드·배포
- 사용자가 바로 이어서 요청할 수 있는 첫 제품 기능 한 가지

## 완료 체크리스트

- [ ] SDK 설치 후 실제 `npx ait init`을 PTY에서 완료했다.
- [ ] 초기화 설정 파일을 수동 생성해 우회하지 않았다.
- [ ] CLI 성공 메시지와 종료 코드 0을 확인했다.
- [ ] TDS 최신 Start 문서를 조회하고 Provider를 한 번 설정했다.
- [ ] UI 기본값이 TDS 우선으로 문서화됐다.
- [ ] `AGENTS.md`는 짧은 지도이며 세부 문서는 `docs/`에 있다.
- [ ] 폴더 경계와 검증 명령이 저장소에서 발견 가능하다.
- [ ] 오픈 정책, 샌드박스, 업로드, 배포 작업을 수행하지 않았다.

