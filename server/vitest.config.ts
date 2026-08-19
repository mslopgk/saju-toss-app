/**
 * 서버 테스트 설정.
 *
 * `test/**` 만 본다 — 앱 소스가 상대경로로 딸려 들어오지만 앱 테스트를 여기서 다시 돌리지 않는다
 * (앱 테스트는 `app/` 의 vitest 가 소유한다. 두 곳에서 돌리면 실패 위치가 흐려진다).
 *
 * 실제 Anthropic 호출은 **한 건도 하지 않는다.** 업스트림은 전부 `RawTransport`/`Caller` 주입으로 대체한다.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
