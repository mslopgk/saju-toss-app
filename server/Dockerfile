# 해석 서버 컨테이너.
#
# 이 서버(blend)에는 node 가 설치돼 있지 않고 모든 서비스가 Docker 로 돈다 — 공유 장비에
# 시스템 패키지를 새로 얹지 않고 관례를 따른다.
#
# 소스를 넣지 않는 이유: esbuild 가 앱 코드(`app/src/shared/**`)까지 한 파일로 번들하므로
# 런타임에 필요한 것은 `dist/main.mjs` 와 외부 패키지 둘뿐이다(`--packages=external`).
FROM node:22-alpine

WORKDIR /app

# ── 런타임 전용 의존성 ────────────────────────────────────────────────
# 저장소의 package.json/package-lock.json 을 그대로 쓰지 않는 이유:
# 락파일에 esbuild 의 **플랫폼별 optional 패키지**가 전부 들어 있어(aix-ppc64, darwin-arm64 …)
# `npm ci` 가 `--omit=dev --omit=optional` 을 줘도 그것들의 플랫폼 조건을 검사해 EBADPLATFORM 으로 막는다.
# 번들이 자립적이라 런타임에 실제로 필요한 것은 아래 둘뿐이므로 최소 매니페스트를 만든다.
#
# ⚠ 버전은 저장소 `package-lock.json` 의 값과 **손으로 맞춘 것**이다. 의존성을 올리면 여기도 올린다.
#   어긋나면 로컬 테스트와 프로덕션이 다른 SDK 로 도는 상태가 되고, 그건 조용히 다르게 동작한다.
RUN printf '%s\n' \
      '{' \
      '  "name": "sajumix-interpret-runtime",' \
      '  "private": true,' \
      '  "type": "module",' \
      '  "dependencies": {' \
      '    "@anthropic-ai/sdk": "0.75.0",' \
      '    "zod": "4.4.3"' \
      '  }' \
      '}' > package.json \
 && npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY dist/main.mjs ./dist/main.mjs

# 컨테이너 밖으로 직접 열지 않는다 — compose 가 127.0.0.1 에만 바인딩하고 Caddy 가 앞에 선다.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 TRUST_PROXY=true
EXPOSE 8787

# root 로 돌리지 않는다.
USER node

CMD ["node", "dist/main.mjs"]
