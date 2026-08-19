/**
 * 서버 설정 — **환경변수 하나가 단일 출처**다.
 *
 * `ANTHROPIC_API_KEY` 는 `process.env` 에서만 읽는다. 코드·번들·설정파일 어디에도 두지 않는다
 * (미니앱 번들은 사용자 단말로 내려가고, 이 저장소는 공개될 수 있다).
 * 키가 없으면 **기동을 거부한다** — 없는 채로 떠 있으면 첫 사용자 요청에서야 알게 되고,
 * 그때는 이미 폴백 리포트가 나가고 있어 아무도 눈치채지 못한다.
 *
 * ⛔ 키 값은 어떤 경로로도 로그·응답·에러 메시지에 넣지 않는다. 이 파일이 키에 대해 말할 수 있는 것은
 *    "있다/없다"와 길이뿐이다(`describeKeyPresence`).
 */

export class ConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  /** ⛔ 로그·응답에 넣지 않는다. */
  readonly apiKey: string;
  readonly allowedOrigins: readonly string[];
  /** 본문 크기 상한(바이트). 넘으면 읽는 도중 끊고 413. */
  readonly maxBodyBytes: number;
  readonly rateLimit: { readonly windowMs: number; readonly max: number };
  /** 업스트림 동시 호출 상한. 원가·레이트리밋 방어의 마지막 선. */
  readonly maxInFlight: number;
  readonly cache: { readonly maxEntries: number; readonly ttlMs: number };
  /** Anthropic SDK 요청 타임아웃(ms). */
  readonly upstreamTimeoutMs: number;
  /** SDK 자동 재시도 횟수(429/5xx/네트워크). */
  readonly upstreamMaxRetries: number;
  /**
   * 검증 실패 시 재시도 포함 최대 시도 횟수. 기본 1 = 재시도 없음.
   * 2 로 올리면 LLM 경로 성공률이 오르는 대신 **원가가 최대 2배**가 된다.
   */
  readonly maxAttempts: number;
  /**
   * Opus 5 서버측 거부 폴백(`fallbacks: "default"`). 조직에 베타가 열려 있지 않으면 400 이 날 수 있어
   * 끄는 스위치를 둔다. 켜져 있어도 400 이 나면 런타임이 자동으로 한 번 더 끄고 재시도한다(anthropic.ts).
   */
  readonly serverSideFallback: boolean;
  /** 리버스 프록시 뒤에 있으면 `x-forwarded-for` 첫 항목을 클라이언트 IP 로 쓴다. */
  readonly trustProxy: boolean;
  readonly logLevel: LogLevel;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * 허용 오리진 기본값 — C00/문서13 확인값.
 * 이 두 곳 말고 다른 오리진에서 브라우저가 호출하면 프리플라이트에서 막힌다.
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://sajuapp.web.tossmini.com',
  'https://sajuapp.private-web.tossmini.com',
];

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

export type EnvLike = Readonly<Record<string, string | undefined>>;

function readInt(env: EnvLike, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError('BAD_ENV', `${name} 은 ${min}~${max} 범위의 정수여야 한다 (받은 값: ${raw})`);
  }
  return n;
}

function readBool(env: EnvLike, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  throw new ConfigError('BAD_ENV', `${name} 은 true/false 여야 한다 (받은 값: ${raw})`);
}

/**
 * 오리진 정규화 — 스킴+호스트(+비기본 포트)까지만 남긴다.
 * 브라우저가 보내는 `Origin` 헤더가 그 모양이라 경로·후행 슬래시가 붙은 설정값과 글자 비교하면
 * **에러 없이 전부 403** 이 된다(가장 흔한 CORS 오설정).
 */
export function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ConfigError('BAD_ENV', `CORS_ORIGINS 항목이 URL 이 아니다: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('BAD_ENV', `CORS_ORIGINS 는 http/https 만 받는다: ${raw}`);
  }
  return url.origin;
}

export function loadConfig(env: EnvLike): ServerConfig {
  const apiKey = (env['ANTHROPIC_API_KEY'] ?? '').trim();
  if (apiKey === '') {
    throw new ConfigError(
      'MISSING_API_KEY',
      'ANTHROPIC_API_KEY 가 비어 있다. 서버는 이 값 없이 기동하지 않는다 — ' +
        '프로세스 환경변수로만 주입한다(파일·코드·번들에 두지 않는다).',
    );
  }

  const originsRaw = env['CORS_ORIGINS'];
  const allowedOrigins =
    originsRaw === undefined || originsRaw.trim() === ''
      ? DEFAULT_ALLOWED_ORIGINS
      : originsRaw
          .split(',')
          .map((s) => normalizeOrigin(s))
          .filter((s) => s !== '');
  if (allowedOrigins.length === 0) {
    throw new ConfigError('BAD_ENV', 'CORS_ORIGINS 를 지정했으면 최소 한 개는 있어야 한다');
  }

  const logLevelRaw = (env['LOG_LEVEL'] ?? 'info').trim().toLowerCase();
  if (!LOG_LEVELS.includes(logLevelRaw as LogLevel)) {
    throw new ConfigError('BAD_ENV', `LOG_LEVEL 은 ${LOG_LEVELS.join('|')} 중 하나여야 한다`);
  }

  return {
    port: readInt(env, 'PORT', 8787, 1, 65535),
    host: (env['HOST'] ?? '127.0.0.1').trim(),
    apiKey,
    allowedOrigins,
    maxBodyBytes: readInt(env, 'MAX_BODY_BYTES', 128 * 1024, 1024, 4 * 1024 * 1024),
    rateLimit: {
      windowMs: readInt(env, 'RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000),
      max: readInt(env, 'RATE_LIMIT_MAX', 20, 1, 100_000),
    },
    maxInFlight: readInt(env, 'MAX_IN_FLIGHT', 4, 1, 256),
    cache: {
      maxEntries: readInt(env, 'CACHE_MAX_ENTRIES', 2_000, 1, 1_000_000),
      ttlMs: readInt(env, 'CACHE_TTL_MS', 24 * 60 * 60_000, 1_000, 30 * 24 * 60 * 60_000),
    },
    upstreamTimeoutMs: readInt(env, 'UPSTREAM_TIMEOUT_MS', 120_000, 1_000, 600_000),
    upstreamMaxRetries: readInt(env, 'UPSTREAM_MAX_RETRIES', 2, 0, 5),
    maxAttempts: readInt(env, 'INTERPRET_MAX_ATTEMPTS', 1, 1, 3),
    serverSideFallback: readBool(env, 'ANTHROPIC_SERVER_SIDE_FALLBACK', true),
    trustProxy: readBool(env, 'TRUST_PROXY', false),
    logLevel: logLevelRaw as LogLevel,
  };
}

/** 기동 로그에 쓸 수 있는 유일한 키 관련 표현. 값도, 접두·접미도 남기지 않는다. */
export function describeKeyPresence(apiKey: string): string {
  return `설정됨(길이 ${apiKey.length})`;
}
