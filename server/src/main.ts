/**
 * 진입점.
 *
 * 설정이 잘못됐으면(특히 `ANTHROPIC_API_KEY` 부재) **여기서 죽는다.** 떠 있는 채로 실패하면
 * 클라이언트가 조용히 규칙 기반 폴백으로 돌아가서 아무도 배포 사고를 눈치채지 못한다.
 */

import process from 'node:process';

import { ConfigError, describeKeyPresence, loadConfig } from './config';
import { createLogger } from './log';
import { buildServer } from './server';

function main(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    const message = error instanceof ConfigError ? `[${error.code}] ${error.message}` : String(error);
    // 로거를 만들기 전이라 stderr 로 직접 쓴다. 여기에도 키 값은 없다.
    process.stderr.write(`기동 실패: ${message}\n`);
    process.exitCode = 1;
    return;
  }

  const logger = createLogger({ level: config.logLevel });
  const built = buildServer({ config, logger });
  const server = built.listen();

  server.on('listening', () => {
    logger.info('listening', {
      host: config.host,
      port: config.port,
      // 키에 대해 말할 수 있는 것은 있다/없다와 길이뿐이다.
      // 필드 이름이 `...Key` 가 아닌 이유: 로거의 `redact()` 가 그런 이름을 통째로 `***` 로 지운다
      // (그물이 먼저 걸려서 존재 여부조차 안 보이게 된다). 값은 이미 안전하므로 이름만 비켜 둔다.
      authStatus: describeKeyPresence(config.apiKey),
      allowedOrigins: config.allowedOrigins,
      serverSideFallback: config.serverSideFallback,
      maxInFlight: config.maxInFlight,
      cacheTtlMs: config.cache.ttlMs,
    });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutdown', { signal });
    server.close(() => process.exit(0));
    // 진행 중인 Opus 5 호출이 있으면 최대 이만큼 기다렸다가 강제 종료한다.
    setTimeout(() => process.exit(0), 20_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
