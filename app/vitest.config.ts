// 앱 전체 테스트 설정. **vite.config.ts 를 건드리지 않는다** —
// AIT devtools 플러그인은 노드 테스트 런타임에 필요 없고, 앱 빌드 설정과 분리해야
// 계산 엔진 회귀가 UI 빌드 변경에 영향을 받지 않는다.
//
// include 는 두 갈래다:
//   test/**   — 계산 엔진 골든셋 회귀(축별 600+ 케이스)
//   src/**    — 각 영역(온보딩·지식베이스·해석 레이어) 단위 테스트
// 영역별 vitest.config.ts 를 src 안에 두면 tsconfig.app.json 의 타입체크 대상에 끌려들어오므로
// 설정 파일은 이 루트 하나만 둔다.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // .tsx 도 포함한다 — 화면이 실제로 렌더되는지(스모크)를 검증하려면 컴포넌트 테스트가 필요하다.
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    // 골든셋 2축(총 600+ 케이스)을 케이스별 it() 으로 돌리므로 여유를 준다
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/shared/lib/saju/**',
        'src/shared/interpret/**',
        'src/shared/knowledge/**',
        'src/features/onboarding/**',
      ],
    },
  },
});
