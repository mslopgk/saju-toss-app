/**
 * 부품 조립. `main.ts` 는 이 파일을 부르고 포트만 연다 — 테스트가 프로세스 없이 같은 서버를 만들 수 있게.
 */

import { createServer, type Server } from 'node:http';

import { CARDS } from '../../app/src/shared/knowledge';
import type { Interpretation, KnowledgeCard } from '../../app/src/shared/interpret';

import { createCaller, type Caller } from './anthropic';
import { NarrativeCache } from './cache';
import type { ServerConfig } from './config';
import { createHandler, type Handler } from './http';
import { createLogger, type Logger } from './log';
import { FixedWindowRateLimiter, Semaphore } from './rateLimit';
import { LLM_RETRIEVAL } from './interpret';

export interface BuildOptions {
  readonly config: ServerConfig;
  /** 테스트가 SDK 대신 끼워 넣는 호출기. */
  readonly caller?: Caller;
  readonly knowledge?: readonly KnowledgeCard[];
  readonly logger?: Logger;
  readonly now?: () => number;
}

export interface BuiltServer {
  readonly handler: Handler;
  readonly cache: NarrativeCache<Interpretation>;
  readonly logger: Logger;
  listen(): Server;
}

export function buildServer(options: BuildOptions): BuiltServer {
  const { config } = options;
  const logger = options.logger ?? createLogger({ level: config.logLevel });
  const cache = new NarrativeCache<Interpretation>({
    maxEntries: config.cache.maxEntries,
    ttlMs: config.cache.ttlMs,
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  const limiter = new FixedWindowRateLimiter({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  const call =
    options.caller ??
    createCaller({
      apiKey: config.apiKey,
      timeoutMs: config.upstreamTimeoutMs,
      maxRetries: config.upstreamMaxRetries,
      serverSideFallback: config.serverSideFallback,
      logger,
    });

  const handler = createHandler({
    interpretDeps: {
      knowledge: options.knowledge ?? CARDS,
      call,
      cache,
      logger,
      semaphore: new Semaphore(config.maxInFlight),
      maxAttempts: config.maxAttempts,
      retrieval: LLM_RETRIEVAL,
    },
    cache,
    limiter,
    allowedOrigins: config.allowedOrigins,
    maxBodyBytes: config.maxBodyBytes,
    trustProxy: config.trustProxy,
    logger,
  });

  return {
    handler,
    cache,
    logger,
    listen(): Server {
      const server = createServer(handler);
      // 프록시 뒤에서 흔한 소켓 조기 종료를 피한다(프록시 keep-alive 보다 길게).
      server.keepAliveTimeout = 65_000;
      server.headersTimeout = 70_000;
      // Opus 5 + effort high 는 1분을 넘길 수 있다. 기본 requestTimeout(300s)로 두고 명시한다.
      server.requestTimeout = Math.max(300_000, config.upstreamTimeoutMs + 30_000);
      server.listen(config.port, config.host);
      return server;
    },
  };
}
