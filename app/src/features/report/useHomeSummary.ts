/**
 * 홈의 한 단어·한 문장을 서버에서 받아 온다.
 *
 * `useInterpretation` 과 **같은 순서**를 지킨다: 규칙 기반 값을 먼저 그려 두고, 서버 값이 오면
 * 갈아 끼운다. 로딩 스피너를 띄우고 기다렸다가 실패하면 홈 첫 화면이 비지만, 이미 채워 둔 값을
 * 교체하는 방식이면 **실패가 사용자에게 보이지 않는다.**
 *
 * 요약만 부르고 섹션 카드는 부르지 않는다. 홈만 보고 나가는 사용자에게 여섯 번 과금하지 않는다 —
 * 깊이읽기에 들어갈 때 그쪽이 자기 몫을 부른다.
 *
 * ⛔ 이 훅은 프롬프트에 닿지 않는다. `shared/interpret/clientFetch` 는 값 import 가 하나도 없는
 *    잎 모듈이고(회귀: `clientFetch.test.ts`), 나머지는 `shared/interpret/ui` 만 쓴다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import type { SummaryValue } from '../../shared/interpret/ui'
import type { ReportSource } from './buildReport'
import { reportRequestKey } from './useInterpretation'

/**
 * 화면이 필요로 하는 클라이언트 표면.
 * `ServerInterpretationClient` 가 구조적으로 그대로 대입된다. 이름을 여기서 다시 선언하는 이유는
 * 화면 계층이 구현 모듈을 알 필요가 없기 때문이다(`InterpretationClient` 와 같은 이유).
 */
export interface SummaryClient {
  summary(
    input: ReportSource,
    options?: { readonly signal?: AbortSignal },
  ): Promise<SummaryOutcomeLike>
}

export type SummaryOutcomeLike =
  | { readonly status: 'ok'; readonly source: string; readonly value: SummaryValue }
  | { readonly status: 'rejected' }
  | { readonly status: 'error'; readonly code: string }

/** 지금 화면에 그려지고 있는 요약이 어디서 왔는가. */
export type SummaryOrigin = 'rule' | 'llm' | 'cache'

/** 서버 시도의 상태. `off` = 서버 주소가 없어 애초에 시도하지 않음. */
export type SummaryState = 'off' | 'loading' | 'done' | 'fallback'

export interface HomeSummaryView {
  readonly summary: SummaryValue
  readonly origin: SummaryOrigin
  readonly state: SummaryState
}

export type AdoptSummaryResult =
  | { readonly kind: 'adopt'; readonly origin: SummaryOrigin; readonly value: SummaryValue }
  | { readonly kind: 'fallback' }

/**
 * 서버 응답 → 채택 여부. **순수함수다.**
 *
 * 이펙트 안에 두지 않고 떼어낸 이유는 `adoptOutcome` 과 같다 — 이 프로젝트의 컴포넌트 테스트는
 * `react-dom/server` 정적 렌더라 `useEffect` 가 돌지 않는다. 판단이 이펙트 안에만 있으면
 * 어느 테스트도 그 분기를 보지 못한다.
 *
 * 빈 단어·빈 문장은 거부한다. 서버 검증(`verifySummary`)을 이미 통과한 값이지만, 그 사이에
 * 무엇이 끼어들든 **홈 첫 화면이 비는 것보다는 규칙 기반 값이 낫다.**
 */
export function adoptSummary(outcome: SummaryOutcomeLike): AdoptSummaryResult {
  // 어떤 실패든 처리는 하나다 — 규칙 기반 요약을 그대로 둔다. 화면에 오류를 띄우지 않는다.
  if (outcome.status !== 'ok') return { kind: 'fallback' }
  const { word, sentence } = outcome.value
  if (word.trim() === '' || sentence.trim() === '') return { kind: 'fallback' }
  return {
    kind: 'adopt',
    origin: outcome.source === 'cache' ? 'cache' : 'llm',
    value: outcome.value,
  }
}

export interface UseHomeSummaryOptions {
  readonly client: SummaryClient | null
}

/**
 * @param fallback 규칙 기반 요약(`renderTemplateSummary`). 서버가 없거나 실패하면 이 값이 남는다.
 * @param source   서버에 보낼 입력. 차트와 자기신고 값뿐이며 프롬프트는 서버에서 만든다.
 */
export function useHomeSummary(
  fallback: SummaryValue,
  source: ReportSource,
  options: UseHomeSummaryOptions,
): HomeSummaryView {
  const { client } = options
  // 홈은 렌더마다 팩트팩을 다시 만들므로 객체 동일성이 매번 바뀐다. 이펙트 의존성은
  // "요청 내용이 실제로 달라졌는가"만 보는 문자열 하나로 유지한다(원가 직결).
  const requestKey = reportRequestKey(source)

  const sourceRef = useRef(source)
  sourceRef.current = source

  const [served, setServed] = useState<{
    readonly key: string
    readonly origin: SummaryOrigin
    readonly value: SummaryValue
  } | null>(null)
  const [state, setState] = useState<SummaryState>(client === null ? 'off' : 'loading')

  useEffect(() => {
    if (client === null) {
      setState('off')
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setState('loading')

    void client
      .summary(sourceRef.current, { signal: controller.signal })
      .then((outcome) => {
        if (cancelled) return
        const decision = adoptSummary(outcome)
        if (decision.kind === 'fallback') {
          setState('fallback')
          return
        }
        setServed({ key: requestKey, origin: decision.origin, value: decision.value })
        setState('done')
      })
      .catch(() => {
        // 클라이언트는 예외를 던지지 않도록 만들었지만, 던지더라도 화면은 폴백으로 남는다.
        if (!cancelled) setState('fallback')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [client, requestKey])

  return useMemo(() => {
    // 키가 다르면 이전 차트의 요약이다. 새 요청이 끝날 때까지 규칙 기반을 보여 준다.
    if (served === null || served.key !== requestKey) {
      return { summary: fallback, origin: 'rule', state: client === null ? 'off' : state }
    }
    return { summary: served.value, origin: served.origin, state: 'done' }
  }, [served, requestKey, fallback, client, state])
}
