/**
 * 결정론 직렬화 유틸.
 *
 * 근거: C00 §7.3 정규화 규칙 5 — `sort_keys=true, separators=(",",":")`, 유니코드 이스케이프 금지.
 *       C00 §7.4 — Object 키 순서 의존 금지.
 */

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function sortKeys(value: unknown): JsonValue {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of entries) out[k] = sortKeys(v);
    return out;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: 비유한 수는 직렬화할 수 없다');
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  throw new TypeError(`canonicalJson: 직렬화할 수 없는 타입 ${typeof value}`);
}

/** 키를 재귀적으로 정렬해 직렬화한다. 같은 내용이면 항상 같은 문자열이 나온다. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/**
 * FNV-1a 32bit. 캐시 키의 보조 축(카드 집합 식별)용.
 * 암호학적 용도가 아니다 — WebView 에서 sha256(`crypto.subtle`)은 비동기라 순수함수 안에서 쓸 수 없다.
 */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32비트 곱셈을 부호없는 범위로 유지
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
