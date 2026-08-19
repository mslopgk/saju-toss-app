/**
 * LLM 해석 서버를 쓸지, 안 쓸지 정하는 곳.
 *
 * 기본은 **안 쓴다.** `VITE_INTERPRET_API_BASE` 가 비어 있으면 클라이언트를 만들지 않고,
 * 화면은 지금까지와 똑같이 규칙 기반 리포트만 그린다(네트워크 시도조차 하지 않는다).
 * 서버 주소를 빌드에 넣지 않은 배포는 "LLM 없이 동작하는 앱"으로 그대로 남는다 — 이것이
 * 서버 장애·미배포 상황의 기본 상태이고, 그래서 사고가 나도 화면이 비지 않는다.
 *
 * ⛔ **API 키는 여기에 없다.** 이 값은 서버의 공개 주소일 뿐이다. 키는 서버 프로세스 환경변수에만 있다.
 *
 * 왜 `import.meta.env` 인가: 미니앱은 정적 번들이라 런타임 설정 주입 경로가 없다.
 * 주소가 바뀌면 다시 빌드해야 한다(그리고 그것이 심사 대상 번들의 사실과도 맞는다).
 */

import { ServerInterpretationClient } from '../../shared/interpret/clientFetch'
import type { InterpretationClient } from './useInterpretation'

/** 빈 문자열·`undefined`·공백은 전부 "서버 없음"이다. */
export function resolveApiBase(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  // 잘못 넣은 값으로 매 리포트마다 실패 요청을 날리지 않도록 여기서 한 번 막는다.
  if (!/^https?:\/\/[^\s]+$/.test(trimmed)) return null
  return trimmed.replace(/\/+$/, '')
}

let cached: InterpretationClient | null | undefined

/**
 * 기본 클라이언트. 모듈 수명 동안 한 번만 만든다 —
 * 렌더마다 새로 만들면 `ReportView` 의 이펙트가 매번 다시 돌아 같은 요청을 반복한다.
 */
export function defaultInterpretationClient(): InterpretationClient | null {
  if (cached !== undefined) return cached
  const base = resolveApiBase(import.meta.env['VITE_INTERPRET_API_BASE'])
  cached = base === null ? null : new ServerInterpretationClient({ baseUrl: base })
  return cached
}
