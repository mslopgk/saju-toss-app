/**
 * 스모크 — **키가 주입된 뒤에** 한 번 돌려 보는 스크립트.
 *
 * 이 저장소에는 `ANTHROPIC_API_KEY` 가 없다. 그래서 실제 호출 경로(모델이 정말 이 프롬프트를 받고
 * 스키마대로 답하는가, 토큰이 몇 개인가, 캐시가 실제로 걸리는가)는 **한 번도 검증되지 않았다.**
 * 단위 테스트가 고정한 것은 "무엇을 보내는가"와 "무엇을 받았을 때 어떻게 판단하는가"까지다.
 *
 * 하는 일:
 *   1) count_tokens 실측  — docs/interpretation.md I7(토큰 추정치 미검증)을 닫는다. 호출 비용 거의 0.
 *   2) 실제 1건 생성      — 프롬프트 → 모델 → 검증까지 끝까지 통과하는지. **여기서 돈이 든다.**
 *   3) 캐시 확인          — 같은 입력을 한 번 더 넣어 두 번째가 캐시에서 나오는지.
 *
 * 사용:
 *   ANTHROPIC_API_KEY=... npm run build && npm run smoke            # 전부
 *   ANTHROPIC_API_KEY=... npm run smoke -- --tokens-only            # 돈 안 쓰고 토큰만
 *   ANTHROPIC_API_KEY=... npm run smoke -- --kind basic_saju        # Sonnet 라우팅으로
 */

import process from 'node:process';
import Anthropic from '@anthropic-ai/sdk';

import { computeChart } from '../../app/src/shared/lib/saju';
import { CARDS } from '../../app/src/shared/knowledge';
import {
  canonicalJson,
  requestCharCounts,
  staticPrefixLength,
  toMessagesApiParams,
  type ReportKind,
} from '../../app/src/shared/interpret';

import pricing from '../pricing.json';
import { createCaller } from '../src/anthropic';
import { NarrativeCache } from '../src/cache';
import { createLogger } from '../src/log';
import { buildRequestFor, interpret, LLM_RETRIEVAL } from '../src/interpret';
import { Semaphore } from '../src/rateLimit';
import type { Interpretation } from '../../app/src/shared/interpret';

interface Prices {
  readonly input: number;
  readonly cacheWrite5m: number;
  readonly cacheRead: number;
  readonly output: number;
}

const PRICES = pricing.models as Readonly<Record<string, Prices>>;
const KRW = pricing.krwPerUsd;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const has = (name: string): boolean => process.argv.includes(`--${name}`);

function line(label: string, value: string | number): void {
  process.stdout.write(`  ${label.padEnd(28)} ${value}\n`);
}

async function main(): Promise<void> {
  const apiKey = (process.env['ANTHROPIC_API_KEY'] ?? '').trim();
  if (apiKey === '') {
    process.stderr.write(
      'ANTHROPIC_API_KEY 가 없다. 이 스크립트는 실제 API 를 부르므로 키 없이는 아무것도 확인할 수 없다.\n' +
        '  예: ANTHROPIC_API_KEY=sk-ant-... npm run smoke\n',
    );
    process.exitCode = 1;
    return;
  }

  const kind = (arg('kind') ?? 'fusion') as ReportKind;
  const chart = computeChart({
    calendarType: 'solar',
    year: 1990,
    month: 5,
    day: 15,
    hour: 14,
    minute: 30,
    gender: 'M',
    timeUnknown: false,
    birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
  });
  const input = { kind, chart, profile: { gender: 'M' as const, mbti: 'INTJ', blood: 'A' as const } };

  const built = buildRequestFor(input, CARDS, LLM_RETRIEVAL);
  if (!built.ok) {
    process.stderr.write(`프롬프트 조립 실패: ${built.message}\n`);
    process.exitCode = 1;
    return;
  }
  const req = built.request;
  const chars = requestCharCounts(req);

  process.stdout.write(`\n[1] 프롬프트 크기 (${kind} · ${req.routing.model})\n`);
  line('정적 프리픽스(문자)', staticPrefixLength());
  line('system 전체(문자)', chars.systemTotal);
  line('user 턴(문자)', chars.user);
  // user 턴의 내역. 카드가 늘면 여기가 늘고, 그게 곧 건당 원가다.
  const factPackChars = canonicalJson(req.factPack).length;
  line('└ fact_pack(문자)', factPackChars);
  line('└ 카드+지시(문자)', chars.user - factPackChars);
  line('지식 카드', `${req.knowledgeCardIds.length}장`);
  line('카드당 평균(문자)', Math.round((chars.user - factPackChars) / req.knowledgeCardIds.length));
  line('섹션', req.sections.join(', '));
  line('narrativeKey', req.narrativeKey);

  /* ── count_tokens 실측 ── */
  const client = new Anthropic({ apiKey });
  const params = toMessagesApiParams(req);
  let inputTokens = 0;
  try {
    const counted = await client.messages.countTokens({
      model: params['model'] as string,
      system: params['system'] as never,
      messages: params['messages'] as never,
    });
    inputTokens = counted.input_tokens;
    process.stdout.write('\n[2] count_tokens 실측\n');
    line('입력 토큰(전체)', inputTokens);
    line('문자당 토큰', (inputTokens / (chars.systemTotal + chars.user)).toFixed(3));
  } catch (error) {
    process.stdout.write('\n[2] count_tokens 실패\n');
    line('사유', String(error));
  }

  if (has('tokens-only')) {
    process.stdout.write('\n--tokens-only 라서 여기서 멈춘다(모델 호출 없음).\n');
    return;
  }

  /* ── 실제 1건 생성 ── */
  process.stdout.write('\n[3] 실제 호출 (여기서부터 과금)\n');
  const cache = new NarrativeCache<Interpretation>({ maxEntries: 10, ttlMs: 600_000 });
  const logger = createLogger({ level: 'info' });
  const deps = {
    knowledge: CARDS,
    call: createCaller({
      apiKey,
      timeoutMs: 180_000,
      maxRetries: 1,
      serverSideFallback: !has('no-fallback'),
      logger,
    }),
    cache,
    logger,
    semaphore: new Semaphore(1),
    maxAttempts: 1,
    retrieval: LLM_RETRIEVAL,
  };

  const startedAt = Date.now();
  const first = await interpret(input, deps);
  const elapsedMs = Date.now() - startedAt;

  line('status', first.status);
  line('소요(ms)', elapsedMs);
  if (first.status === 'ok') {
    line('source', first.source);
    line('headline', first.value.headline);
    line('섹션 수', first.value.sections.length);
    line('본문 총 길이', first.value.sections.reduce((n, s) => n + s.body.length, 0));
    line('인용 카드', first.value.usedCardIds.length);
  } else if (first.status === 'rejected') {
    process.stdout.write('  검증에서 거부됐다. 프롬프트나 가드 규칙을 손봐야 한다:\n');
    for (const f of first.failures) line(`  ${f.code}`, f.detail);
  } else {
    line('code', first.code);
    line('message', first.message);
  }

  /* ── 캐시 확인 ── */
  process.stdout.write('\n[4] 캐시 확인 (같은 입력 재요청)\n');
  const second = await interpret(input, deps);
  line('source', second.status === 'ok' ? second.source : second.status);
  line('기대값', 'cache');

  /* ── 원가 ── */
  const prices = PRICES[req.routing.model];
  if (prices !== undefined && first.status === 'ok') {
    // 출력 토큰은 응답 문자 수로 어림한다(usage 는 오케스트레이터가 로그로만 남긴다).
    const outputChars = first.value.sections.reduce((n, s) => n + s.body.length, 0) + 200;
    const outputTokens = Math.round(outputChars * 0.86);
    const usd =
      (inputTokens * prices.input) / 1e6 + (outputTokens * prices.output) / 1e6;
    process.stdout.write('\n[5] 원가 어림 (캐시 미스 기준)\n');
    line('입력 토큰', inputTokens);
    line('출력 토큰(어림)', outputTokens);
    line('USD', usd.toFixed(4));
    line('KRW', Math.round(usd * KRW));
    process.stdout.write(
      '  ※ 실제 usage 는 서버 로그의 `llm ok` 줄(inputTokens/outputTokens/cacheReadTokens)이 정본이다.\n',
    );
  }

  process.stdout.write('\n끝.\n');
}

void main();
