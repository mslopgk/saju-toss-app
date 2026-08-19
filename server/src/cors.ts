/**
 * CORS.
 *
 * 허용 오리진은 미니앱이 실제로 서비스되는 두 곳뿐이다(C00/문서13 확인값, `config.ts` 기본값).
 * `*` 를 지원하지 않는다 — 이 API 는 건당 원가가 있으므로 아무 페이지에서나 부를 수 있으면 안 된다.
 *
 * ⚠ **CORS 는 인증이 아니다.** 브라우저만 지키는 규약이라 `curl` 은 오리진 없이 그냥 부른다.
 *   그래서 오리진 검사는 "브라우저에서 오는 남의 사이트"를 막을 뿐이고, 비용 방어의 본체는
 *   레이트리밋·동시성 상한·캐시다. 오리진이 아예 없는 요청(서버간 호출·헬스체크)은 통과시키되
 *   CORS 헤더를 붙이지 않는다 — 브라우저는 그런 응답을 읽지 못한다.
 */

export type CorsDecision =
  | { readonly kind: 'no-origin' }
  | { readonly kind: 'allowed'; readonly origin: string }
  | { readonly kind: 'denied'; readonly origin: string };

export function decideCors(
  originHeader: string | string[] | undefined,
  allowedOrigins: readonly string[],
): CorsDecision {
  const raw = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (raw === undefined || raw.trim() === '' || raw === 'null') return { kind: 'no-origin' };
  const origin = raw.trim();
  return allowedOrigins.includes(origin) ? { kind: 'allowed', origin } : { kind: 'denied', origin };
}

/**
 * 응답 헤더. 허용된 오리진일 때만 `Access-Control-Allow-Origin` 을 **에코**한다.
 * `Vary: Origin` 이 없으면 중간 캐시가 한 오리진용 응답을 다른 오리진에 재사용해 CORS 가 깨진다.
 */
export function corsHeaders(decision: CorsDecision): Record<string, string> {
  const base: Record<string, string> = { Vary: 'Origin' };
  if (decision.kind !== 'allowed') return base;
  return {
    ...base,
    'Access-Control-Allow-Origin': decision.origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  };
}
