/**
 * 규칙 기반 리포트를 **먼저 그리고**, 서버 해석이 오면 갈아 끼운다.
 *
 * 순서가 설계의 전부다. 로딩 스피너를 띄우고 기다렸다가 실패하면 빈 화면이 되지만,
 * 이미 완성된 리포트를 띄워 두고 나중에 교체하면 **실패가 사용자에게 보이지 않는다.**
 * 서버가 없거나(주소 미설정) 느리거나 죽어도 화면은 지금까지와 똑같다.
 *
 * ⛔ 이 훅은 프롬프트에 닿지 않는다. `shared/interpret/clientFetch` 는 값 import 가 하나도 없는
 *    잎 모듈이고(회귀: `clientFetch.test.ts`), 나머지는 `shared/interpret/ui` 만 쓴다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { SECTION_TITLES, type Interpretation, type KnowledgeCard } from '../../shared/interpret/ui'
import { resolveCards, type ReportSource, type RuleBasedReport } from './buildReport'

/**
 * 화면이 필요로 하는 클라이언트 표면.
 * `shared/interpret/client` 의 `InterpretationClient` 와 구조적으로 같으며,
 * `ServerInterpretationClient` 가 그대로 대입된다. 이름만 여기서 다시 선언하는 이유는
 * 화면 계층이 목 클라이언트가 사는 모듈을 알 필요가 없기 때문이다.
 */
export interface InterpretationClient {
  interpret(
    input: ReportSource,
    options?: { readonly signal?: AbortSignal },
  ): Promise<InterpretationOutcomeLike>
}

export type InterpretationOutcomeLike =
  | { readonly status: 'ok'; readonly source: string; readonly value: Interpretation }
  | { readonly status: 'rejected' }
  | { readonly status: 'error'; readonly code: string }

/** 지금 화면에 그려지고 있는 문장이 어디서 왔는가. */
export type InterpretationOrigin = 'rule' | 'llm' | 'cache'

/** 서버 시도의 상태. `off` = 서버 주소가 없어 애초에 시도하지 않음. */
export type InterpretationState = 'off' | 'loading' | 'done' | 'fallback'

export interface InterpretationView {
  readonly interpretation: Interpretation
  readonly usedCards: readonly KnowledgeCard[]
  readonly origin: InterpretationOrigin
  readonly state: InterpretationState
}

/**
 * 요청이 달라지는지 판단하는 키.
 *
 * `ResultPage` 는 렌더마다 `buildRuleBasedReport()` 를 다시 부르므로 리포트 객체의 **동일성이
 * 매번 바뀐다**. 그대로 이펙트 의존성에 넣으면 렌더마다 서버를 다시 부른다(원가 직결).
 * 그래서 "요청 내용이 실제로 달라졌는가"만 보는 문자열을 만든다.
 *
 * 전역 유일성이 필요한 캐시 키가 아니다 — 서버측 캐시 키(`narrativeKey`)는 서버가 따로 만든다.
 * 여기서 필요한 것은 "같은 화면에서 같은 요청을 두 번 보내지 않는 것"뿐이라 축이 이 정도면 충분하다.
 */
export function reportRequestKey(source: ReportSource): string {
  const { chart, profile, kind } = source
  return [
    kind,
    chart.engineVersion,
    chart.pillars.gz8,
    chart.pillars.threePillarMode ? '3' : '4',
    chart.luck.daewoon.pillars.map((p) => p.ganji ?? '-').join(','),
    [...chart.warnings].sort().join(','),
    profile.gender,
    profile.mbti ?? '-',
    profile.blood ?? '-',
  ].join('|')
}

/**
 * 서버 해석을 화면에 쓸 수 있는 모양으로 정리한다.
 * 섹션 제목표에 없는 id 는 버린다 — 제목 없이 그리면 본문만 덩그러니 남는다.
 * 남는 섹션이 하나도 없으면 `null` 을 돌려 호출부가 규칙 기반을 유지하게 한다.
 */
export function adoptInterpretation(value: Interpretation): Interpretation | null {
  const sections = value.sections.filter((s) => Object.hasOwn(SECTION_TITLES, s.id))
  if (sections.length === 0) return null
  return { ...value, sections }
}

export type AdoptResult =
  | { readonly kind: 'adopt'; readonly origin: InterpretationOrigin; readonly value: Interpretation }
  | { readonly kind: 'fallback' }

/**
 * 서버 응답 → 채택 여부. **순수함수다.**
 *
 * 이펙트 안에 두지 않고 떼어낸 이유: 이 프로젝트의 컴포넌트 테스트는 `react-dom/server` 정적 렌더라
 * `useEffect` 가 돌지 않는다. 판단이 이펙트 안에만 있으면 어느 테스트도 그 분기를 보지 못한다.
 */
export function adoptOutcome(outcome: InterpretationOutcomeLike): AdoptResult {
  // 어떤 실패든 처리는 하나다 — 규칙 기반 문장을 그대로 둔다. 화면에 오류를 띄우지 않는다.
  if (outcome.status !== 'ok') return { kind: 'fallback' }
  const adopted = adoptInterpretation(outcome.value)
  if (adopted === null) return { kind: 'fallback' }
  return { kind: 'adopt', origin: outcome.source === 'cache' ? 'cache' : 'llm', value: adopted }
}

export interface UseInterpretationOptions {
  readonly client: InterpretationClient | null
}

export function useInterpretation(
  report: RuleBasedReport,
  options: UseInterpretationOptions,
): InterpretationView {
  const { client } = options
  const requestKey = reportRequestKey(report.source)

  // 이펙트가 최신 입력을 보되 의존성은 `requestKey` 하나로 유지한다.
  const sourceRef = useRef(report.source)
  sourceRef.current = report.source

  const [served, setServed] = useState<{
    readonly key: string
    readonly origin: InterpretationOrigin
    readonly value: Interpretation
  } | null>(null)
  const [state, setState] = useState<InterpretationState>(client === null ? 'off' : 'loading')

  useEffect(() => {
    if (client === null) {
      setState('off')
      return
    }
    let cancelled = false
    const controller = new AbortController()
    setState('loading')

    void client
      .interpret(sourceRef.current, { signal: controller.signal })
      .then((outcome) => {
        if (cancelled) return
        const decision = adoptOutcome(outcome)
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
    // 키가 다르면 이전 차트의 서사다. 새 요청이 끝날 때까지 규칙 기반을 보여 준다.
    if (served === null || served.key !== requestKey) {
      return {
        interpretation: report.interpretation,
        usedCards: report.usedCards,
        origin: 'rule',
        state: client === null ? 'off' : state,
      }
    }
    return {
      interpretation: served.value,
      usedCards: resolveCards(served.value.usedCardIds, report.retrievedCards),
      origin: served.origin,
      state: 'done',
    }
  }, [served, requestKey, report, client, state])
}
