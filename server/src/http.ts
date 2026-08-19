/**
 * HTTP 표면 — `node:http` 만 쓴다.
 *
 * 프레임워크를 넣지 않은 이유: 라우트가 넷(`GET /health`, `POST /api/interpret[/summary|/card]`)이고, 필요한 것은
 * 본문 크기 상한 · CORS · 레이트리밋뿐이다. 이 셋은 프레임워크가 없어야 오히려 **어디서 끊기는지**가
 * 코드에 그대로 보인다(특히 크기 상한 — 미들웨어에 맡기면 스트림을 다 읽고 나서 거절하기 쉽다).
 *
 * 응답 모양은 앱의 `InterpretationOutcome` 과 **글자 단위로 맞춘다**. 클라이언트가 변환 없이 쓰도록
 * 하려는 것이고, 필드가 어긋나면 `app/src/shared/interpret/clientFetch.ts` 의 검증이 즉시 잡는다.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import { PROMPT_VERSION } from '../../app/src/shared/interpret';

import { corsHeaders, decideCors, type CorsDecision } from './cors';
import { clientIpOf, type FixedWindowRateLimiter } from './rateLimit';
import { interpret, interpretCard, interpretSummary, type InterpretDeps } from './interpret';
import { parseCardBody, parseInterpretBody, type CardBody } from './requestSchema';
import type { Logger } from './log';
import type { NarrativeCache } from './cache';
import type { Interpretation } from '../../app/src/shared/interpret';

export interface HttpDeps {
  readonly interpretDeps: InterpretDeps;
  readonly cache: NarrativeCache<Interpretation>;
  readonly limiter: FixedWindowRateLimiter;
  readonly allowedOrigins: readonly string[];
  readonly maxBodyBytes: number;
  readonly trustProxy: boolean;
  readonly logger: Logger;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...JSON_HEADERS,
    ...extraHeaders,
    'Content-Length': Buffer.byteLength(payload).toString(),
    // 이 API 의 응답은 개인 서사다. 중간 캐시가 들고 있으면 안 된다(서버 캐시는 키 단위로 따로 한다).
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

/**
 * 본문 읽기.
 *
 * 상한을 넘으면 **버퍼링을 즉시 멈춘다**(메모리 보호가 상한의 본체다). 그렇다고 소켓을 바로 끊지는
 * 않는다 — 끊으면 클라이언트가 413 을 받지 못하고 "네트워크 오류"로 보게 되고, 그러면 클라이언트가
 * 원인을 모른 채 재시도한다. 남은 바이트는 버퍼에 담지 않고 흘려 보낸 뒤 413 을 정상 응답한다.
 * 흘려 보내는 양에도 한도(8배)를 둬서 무한 스트림에는 결국 소켓을 끊는다.
 */
export async function readBody(req: IncomingMessage, maxBytes: number): Promise<
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: 'too-large' | 'aborted' }
> {
  const drainLimit = maxBytes * 8;
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflowed = false;
    let settled = false;

    const finish = (value: { ok: true; text: string } | { ok: false; reason: 'too-large' | 'aborted' }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (overflowed) {
        if (size > drainLimit) req.destroy();
        return;
      }
      if (size > maxBytes) {
        overflowed = true;
        chunks.length = 0;
        finish({ ok: false, reason: 'too-large' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', () => finish({ ok: false, reason: 'aborted' }));
    req.on('aborted', () => finish({ ok: false, reason: 'aborted' }));
  });
}

export function createHandler(deps: HttpDeps): Handler {
  return (req, res) => {
    void handle(req, res, deps).catch((error: unknown) => {
      deps.logger.error('처리되지 않은 예외', { error: String(error) });
      if (!res.headersSent) send(res, 500, { status: 'error', code: 'INTERNAL', message: '서버 오류' }, {});
      else res.end();
    });
  };
}

async function handle(req: IncomingMessage, res: ServerResponse, deps: HttpDeps): Promise<void> {
  const decision: CorsDecision = decideCors(req.headers.origin, deps.allowedOrigins);
  const headers = corsHeaders(decision);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    if (decision.kind === 'denied') {
      send(res, 403, { status: 'error', code: 'ORIGIN_NOT_ALLOWED', message: '허용되지 않은 오리진' }, headers);
      return;
    }
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (decision.kind === 'denied') {
    deps.logger.warn('오리진 거부', { origin: decision.origin, path });
    send(res, 403, { status: 'error', code: 'ORIGIN_NOT_ALLOWED', message: '허용되지 않은 오리진' }, headers);
    return;
  }

  if (path === '/health' && req.method === 'GET') {
    // 비밀값·개인정보를 담지 않는다. 배포 확인과 캐시 히트율 관찰용이다.
    send(
      res,
      200,
      { status: 'ok', promptVersion: PROMPT_VERSION, cache: deps.cache.stats() },
      headers,
    );
    return;
  }

  /**
   * 해석 라우트 셋.
   *
   * `/api/interpret` 은 전체 리포트(폴백 겸 회귀 기준선)이고, 나머지 둘이 분할 경로다.
   * 앞의 공통 처리(레이트리밋·본문 읽기·파싱)를 그대로 나눠 쓰므로 여기서 갈래만 정한다.
   */
  const interpretPath =
    path === '/api/interpret' ? 'full'
      : path === '/api/interpret/summary' ? 'summary'
      : path === '/api/interpret/card' ? 'card'
      : null;

  if (interpretPath === null) {
    send(res, 404, { status: 'error', code: 'NOT_FOUND', message: '없는 경로' }, headers);
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, { status: 'error', code: 'METHOD_NOT_ALLOWED', message: 'POST 만 받는다' }, {
      ...headers,
      Allow: 'POST, OPTIONS',
    });
    return;
  }

  const ip = clientIpOf(req.headers['x-forwarded-for'], req.socket.remoteAddress ?? undefined, deps.trustProxy);
  const verdict = deps.limiter.check(ip);
  if (!verdict.allowed) {
    send(res, 429, { status: 'error', code: 'RATE_LIMITED', message: '요청이 너무 잦다' }, {
      ...headers,
      'Retry-After': verdict.retryAfterSec.toString(),
    });
    return;
  }

  const body = await readBody(req, deps.maxBodyBytes);
  if (!body.ok) {
    if (body.reason === 'too-large') {
      // 남은 본문을 다 받을 이유가 없으므로 연결을 닫는다(응답은 먼저 나간다).
      send(res, 413, { status: 'error', code: 'BODY_TOO_LARGE', message: '본문이 너무 크다' }, {
        ...headers,
        Connection: 'close',
      });
    }
    return;
  }

  let json: unknown;
  try {
    json = JSON.parse(body.text);
  } catch {
    send(res, 400, { status: 'error', code: 'BAD_JSON', message: 'JSON 이 아니다' }, headers);
    return;
  }

  // 카드 요청만 `sectionId` 를 더 받는다. 나머지는 같은 본문이다.
  const parsed = interpretPath === 'card' ? parseCardBody(json) : parseInterpretBody(json);
  if (!parsed.ok) {
    send(
      res,
      400,
      { status: 'error', code: 'BAD_REQUEST', message: '본문 형식이 맞지 않다', issues: parsed.issues },
      headers,
    );
    return;
  }

  // 클라이언트가 연결을 끊으면 업스트림 호출도 끊는다 — 아무도 안 볼 응답에 돈을 쓰지 않는다.
  // (단, 이미 시작한 호출의 결과는 캐시에 남으므로 재방문 시 즉시 히트한다.)
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const started = Date.now();
  let result;
  if (interpretPath === 'summary') {
    result = await interpretSummary(parsed.value, deps.interpretDeps, controller.signal);
  } else if (interpretPath === 'card') {
    // 이 갈래는 `parseCardBody` 를 통과했으므로 `sectionId` 가 반드시 있다.
    const body = parsed.value as CardBody;
    result = await interpretCard(body, body.sectionId, deps.interpretDeps, controller.signal);
  } else {
    result = await interpret(parsed.value, deps.interpretDeps, controller.signal);
  }
  const elapsedMs = Date.now() - started;

  if (result.status === 'ok') {
    deps.logger.info('응답', { route: interpretPath, source: result.source, elapsedMs, narrativeKey: result.narrativeKey });
    send(res, 200, result, headers);
    return;
  }
  if (result.status === 'rejected') {
    // 200 이 아니라 422 다. 클라이언트는 이 상태를 "폴백해라"로 읽는다.
    deps.logger.warn('검증 거부 응답', { elapsedMs, narrativeKey: result.narrativeKey });
    send(res, 422, result, headers);
    return;
  }

  const status =
    result.code === 'AUTH' ? 502
      : result.code === 'RATE_LIMITED' ? 429
      : result.code === 'TIMEOUT' ? 504
      : result.code === 'BUILD' ? 422
      : result.code === 'ABORTED' ? 499
      : 502;
  deps.logger.warn('오류 응답', { code: result.code, status, elapsedMs });
  if (status === 499) {
    // 클라이언트가 이미 끊었다. 쓸 곳이 없다.
    res.end();
    return;
  }
  send(res, status, { status: 'error', code: result.code, message: result.message }, headers);
}
