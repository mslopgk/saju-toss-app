# 0002. React 18 고정

- 날짜: 2026-08-12
- 상태: 확정 (TDS peer 범위가 넓어지면 재검토)

## 문제

`npm create vite@latest --template react-ts` 는 React **19.2.8** 을 설치한다.
`@toss/tds-mobile` 2.5.1 의 peer 범위는 `^16.8.3 || ^17 || ^18` 로 **React 19 를 포함하지 않는다.**

## 선택지

1. React 19 유지 + peer 경고 무시
2. **React 18 로 내림**
3. TDS 없이 자체 UI 구축

## 결정

**React 18.3.1 로 내린다.** `@types/react` `@types/react-dom` 도 18 로 맞춘다.

## 근거

- 1안은 peer 불일치를 런타임까지 끌고 간다. TDS 는 이 앱 UI 전체의 기반이라 검증되지 않은 조합으로 운영할 수 없다.
- 3안은 토스 앱 안에서의 시각적 일관성을 포기하는 것이라 미니앱 성격에 맞지 않는다.

## 확인

React 18 + `@vitejs/plugin-react` ^6 + Vite 8 조합에서 `tsc -b` 와 `vite build` 모두 통과했다.

## 되돌리는 조건

TDS 가 React 19 를 peer 에 추가하면 되돌린다. 그 전에는 `react` / `react-dom` / `@types/react*` 를 18 에 고정해 둔다.
