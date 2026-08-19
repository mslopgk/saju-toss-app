/**
 * 구조화 로그.
 *
 * ⛔ **비밀값을 로그에 넣지 않는다.** `redact()` 가 `sk-ant-` 로 시작하는 토큰과 Authorization 류
 *    필드명을 지우지만, 그건 마지막 그물일 뿐이다 — 애초에 키를 로그 인자로 넘기지 않는 것이 규칙이다.
 *
 * ⛔ **사주 원문(팩트팩·프롬프트·응답 본문)을 로그에 넣지 않는다.** 생년월일시는 개인정보이고,
 *    서사 본문은 캐시 키만 있으면 되짚을 수 있다. 로그에 남기는 것은 키·토큰수·소요시간뿐이다.
 */

import type { LogLevel } from './config';

const RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
}

/** `sk-ant-...` 형태의 토큰과 비밀값스러운 키 이름을 지운다. */
const SECRET_VALUE_RE = /sk-ant-[A-Za-z0-9_\-]+/g;
const SECRET_KEY_RE = /(key|token|secret|authorization|password|credential)/i;

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET_VALUE_RE, 'sk-ant-***');
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // `narrativeKey` 는 이름에 key 가 들어가지만 비밀값이 아니다(PII 도 없다) — 디버깅의 핵심이라 남긴다.
      out[k] = SECRET_KEY_RE.test(k) && k !== 'narrativeKey' && k !== 'cacheKey' ? '***' : redact(v);
    }
    return out;
  }
  return value;
}

export interface LoggerOptions {
  readonly level: LogLevel;
  /** 테스트에서 갈아 끼운다. 기본은 stdout/stderr. */
  readonly sink?: (line: string) => void;
  /** 결정론 테스트용 시계. 기본은 벽시계(로그는 계산 경로가 아니라 허용된다). */
  readonly now?: () => number;
}

export function createLogger(options: LoggerOptions): Logger {
  const threshold = RANK[options.level];
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => Date.now());

  const emit = (level: LogLevel, msg: string, fields?: LogFields): void => {
    if (RANK[level] < threshold) return;
    const payload = {
      t: new Date(now()).toISOString(),
      level,
      msg,
      ...(fields === undefined ? {} : (redact(fields) as LogFields)),
    };
    sink(JSON.stringify(payload));
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

/** 아무것도 쓰지 않는 로거. 테스트 기본값. */
export const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
