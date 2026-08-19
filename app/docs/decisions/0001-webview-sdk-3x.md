# 0001. WebView SDK 3.x 채택

- 날짜: 2026-08-12
- 상태: 확정

## 선택지

1. **WebView SDK** `@apps-in-toss/web-framework` — 웹 프로젝트를 토스 앱에서 실행
2. React Native 기반 (`react-native-bedrock` / granite 계열) — 네이티브 성능

## 결정

**WebView SDK 3.0.3** (BSD-3-Clause).

## 근거

- 사주·MBTI·별자리 서비스는 텍스트·표·차트 위주라 RN 네이티브 성능이 불필요하다.
- 웹 스택(Vite + React + TS)이 공식 가이드와 잘 맞고, 계산 엔진을 순수 JS 모듈로 유지하기 쉽다.
- 근거 조사: `../../../docs/research/01-토스-앱인토스-플랫폼-기술.md`

## 부수 효과

- 설정 파일이 **`apps-in-toss.config.ts`** 다. SDK 2.x 의 `granite.config.ts` 에서 이름이 바뀌었다. 2.x 기준으로 작성된 자료(스킬 참조 문서 포함)를 그대로 따르면 안 된다.
- `ait init` 3.x 흐름에는 템플릿 선택·dev/build 명령·포트 프롬프트가 없다. 물어보는 것은 **번들 결과물 디렉토리**(기본 `dist`) 하나뿐이고, dev 명령의 `--host` 는 `package.json` scripts 에서 직접 설정해야 한다.
- 리서치 문서 11·12 가 `granite.config.ts` 를 전제로 쓴 부분은 이 결정과 어긋난다. 해당 문서를 참조할 때 주의한다.
