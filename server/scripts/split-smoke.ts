/**
 * 분할 호출 실측 — **설계 전제를 여기서 검증한다.**
 *
 * 전제는 둘이다.
 *   ① 첫 결과(요약)가 10초 안에 온다        — 분할 전 단일 호출은 93.8초였다
 *   ② 쪼개도 원가가 크게 오르지 않는다       — 프롬프트 캐시가 공통 접두를 먹어 주므로
 *
 * ②가 성립하는 근거는 `buildRequest` 가 팩트팩·지식카드를 **user 턴 앞쪽에 그대로 공유**하고
 * 작업 지시문만 꼬리에 붙인다는 것이다(공통 접두 2,642자 / 95.5%, `split.test.ts` 가 고정).
 * 그 가정이 실제 API 에서도 참인지는 `cacheReadTokens` 로만 확인할 수 있다.
 *
 * ⚠ 이 스크립트는 **호출 7회를 과금한다**(요약 1 + 카드 6).
 *
 * 사용: ANTHROPIC_API_KEY=... npm run build && npm run split-smoke
 */

import process from 'node:process';

import { computeChart } from '../../app/src/shared/lib/saju';
import { CARDS } from '../../app/src/shared/knowledge';
import type { SectionId } from '../../app/src/shared/interpret';

import pricing from '../pricing.json';
import { createCaller } from '../src/anthropic';
import { NarrativeCache } from '../src/cache';
import { createLogger } from '../src/log';
import { interpretCard, interpretCards, interpretSummary, LLM_RETRIEVAL, type InterpretDeps } from '../src/interpret';
import { Semaphore } from '../src/rateLimit';

interface Prices {
  readonly input: number;
  readonly cacheWrite5m: number;
  readonly cacheRead: number;
  readonly output: number;
}
const PRICES = pricing.models as Readonly<Record<string, Prices>>;
const KRW = pricing.krwPerUsd;

/** 분할 전 단일 호출 실측값. 비교 기준선이다(2026-08-16, opus-5 + effort high). */
const BASELINE_KRW = 262;
const BASELINE_SEC = 93.8;

/** 홈 아래 깊이 읽기에 실제로 쓸 카드들. 자기신고까지 있는 사주라 여섯 장이 선다. */
const CARD_SECTIONS: readonly SectionId[] = ['saju', 'sipsin', 'strength', 'luck', 'zodiac', 'mbti'];

interface Row {
  readonly label: string;
  readonly status: string;
  readonly sec: number;
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
  readonly chars: number;
  readonly krw: number;
}

/**
 * 호출 하나의 원가.
 * 캐시 읽기는 입력 단가의 1/10 이라 여기가 분할의 손익을 가른다.
 */
function costKrw(p: Prices, r: { input: number; cacheRead: number; cacheWrite: number; output: number }): number {
  const usd =
    (r.input * p.input) / 1e6 +
    (r.cacheRead * p.cacheRead) / 1e6 +
    (r.cacheWrite * p.cacheWrite5m) / 1e6 +
    (r.output * p.output) / 1e6;
  return Math.round(usd * KRW);
}

function line(label: string, value: string | number): void {
  process.stdout.write(`  ${label.padEnd(26)} ${value}\n`);
}

async function main(): Promise<void> {
  const apiKey = (process.env['ANTHROPIC_API_KEY'] ?? '').trim();
  if (apiKey === '') {
    process.stderr.write('ANTHROPIC_API_KEY 가 없다.\n');
    process.exitCode = 1;
    return;
  }

  // 생년을 바꾸면 팩트팩이 통째로 달라져 **캐시 접두가 확실히 콜드**가 된다.
  // 실사용자는 항상 이 상태이므로, 워밍 전략을 재려면 매번 다른 해로 돌려야 한다.
  const yearArg = process.argv.indexOf('--year');
  const year = yearArg >= 0 ? Number(process.argv[yearArg + 1]) : 1990;
  const chart = computeChart({
    calendarType: 'solar',
    year,
    month: 5,
    day: 15,
    hour: 14,
    minute: 30,
    gender: 'M',
    timeUnknown: false,
    birthPlace: { longitude: 126.9784204, latitude: 37.5665, region: 'KR' },
  });
  const input = {
    kind: 'fusion' as const,
    chart,
    profile: { gender: 'M' as const, mbti: 'INTJ', blood: 'A' as const },
  };

  const logger = createLogger({ level: 'warn' });
  const deps: InterpretDeps = {
    knowledge: CARDS,
    call: createCaller({ apiKey, timeoutMs: 180_000, maxRetries: 1, serverSideFallback: true, logger }),
    cache: new NarrativeCache<unknown>({ maxEntries: 50, ttlMs: 600_000 }),
    logger,
    // 카드를 실제로 병렬로 돌린다 — 이 값이 1 이면 분할의 지연 이점이 사라진다.
    semaphore: new Semaphore(6),
    maxAttempts: 1,
    retrieval: LLM_RETRIEVAL,
  };

  const usage: Record<string, { input: number; cacheRead: number; cacheWrite: number; output: number }> = {};
  const originalCall = deps.call;
  const recording = Object.assign(
    async (req: Parameters<typeof originalCall>[0], signal?: AbortSignal) => {
      const out = await originalCall(req, signal);
      if (out.ok) {
        usage[req.narrativeKey] = {
          input: out.usage.inputTokens,
          cacheRead: out.usage.cacheReadTokens,
          cacheWrite: out.usage.cacheWriteTokens,
          output: out.usage.outputTokens,
        };
      }
      return out;
    },
    {},
  );
  const recordingDeps: InterpretDeps = { ...deps, call: recording };

  const rows: Row[] = [];
  const prices = PRICES['claude-opus-5'];
  if (prices === undefined) throw new Error('pricing.json 에 claude-opus-5 가 없다');

  /* ── ① 요약 — 첫 결과까지의 시간 ── */
  process.stdout.write('\n[1] 요약 (첫 결과까지의 시간)\n');
  const t0 = Date.now();
  const summary = await interpretSummary(input, recordingDeps);
  const summarySec = (Date.now() - t0) / 1000;

  if (summary.status === 'ok') {
    line('word', summary.value.word);
    line('sentence', summary.value.sentence);
  } else {
    line('실패', summary.status === 'rejected' ? summary.failures.map((f) => f.code).join(',') : summary.message);
  }
  {
    const key = Object.keys(usage).find((k) => k.endsWith('|summary')) ?? '';
    const u = usage[key] ?? { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
    rows.push({
      label: 'summary',
      status: summary.status,
      sec: summarySec,
      ...u,
      chars: summary.status === 'ok' ? summary.value.word.length + summary.value.sentence.length : 0,
      krw: costKrw(prices, u),
    });
  }

  /* ── ② 카드 병렬 ── */
  process.stdout.write(`\n[2] 카드 ${CARD_SECTIONS.length}장 (병렬)\n`);
  // 첫 장으로 캐시를 데운 뒤 나머지를 병렬로 — 이유는 `interpretCards` 주석.
  const t1 = Date.now();
  const results = await interpretCards(input, CARD_SECTIONS, recordingDeps);
  const cardsWallSec = (Date.now() - t1) / 1000;
  const cards = CARD_SECTIONS.map((id, i) => ({ id, result: results[i]!, sec: 0 }));

  for (const { id, result, sec } of cards) {
    const key = Object.keys(usage).find((k) => k.endsWith(`|card:${id}`)) ?? '';
    const u = usage[key] ?? { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
    rows.push({
      label: `card:${id}`,
      status: result.status,
      sec,
      ...u,
      chars: result.status === 'ok' ? result.value.body.length : 0,
      krw: costKrw(prices, u),
    });
  }

  /* ── ③ 표 ── */
  const head = [
    '작업'.padEnd(16),
    '결과'.padEnd(9),
    '초'.padStart(6),
    '입력'.padStart(7),
    '캐시읽기'.padStart(8),
    '캐시쓰기'.padStart(8),
    '출력'.padStart(6),
    '글자'.padStart(6),
    '원'.padStart(5),
  ].join(' ');
  process.stdout.write(`\n[3] 상세\n${head}\n${'-'.repeat(head.length)}\n`);
  for (const r of rows) {
    process.stdout.write(
      [
        r.label.padEnd(16),
        r.status.padEnd(9),
        r.sec.toFixed(1).padStart(6),
        String(r.input).padStart(7),
        String(r.cacheRead).padStart(8),
        String(r.cacheWrite).padStart(8),
        String(r.output).padStart(6),
        String(r.chars).padStart(6),
        String(r.krw).padStart(5),
      ].join(' ') + '\n',
    );
  }

  /* ── ④ 판정 ── */
  const totalKrw = rows.reduce((n, r) => n + r.krw, 0);
  const totalCacheRead = rows.reduce((n, r) => n + r.cacheRead, 0);
  const firstResultSec = summarySec;
  const allSec = summarySec + cardsWallSec;

  process.stdout.write('\n[4] 판정\n');
  line('첫 결과까지', `${firstResultSec.toFixed(1)}초  (분할 전 ${BASELINE_SEC}초)`);
  line('전부 도착까지', `${allSec.toFixed(1)}초`);
  line('총 원가', `${totalKrw}원  (분할 전 ${BASELINE_KRW}원)`);
  line('캐시 읽기 총합', `${totalCacheRead} 토큰`);
  line('본문 총 글자', rows.reduce((n, r) => n + r.chars, 0));

  const verdicts: string[] = [];
  if (firstResultSec > 10) verdicts.push(`✗ 첫 결과가 ${firstResultSec.toFixed(1)}초 — 목표 10초 초과`);
  else verdicts.push(`✓ 첫 결과 ${firstResultSec.toFixed(1)}초`);

  if (totalCacheRead === 0) verdicts.push('✗ 캐시 읽기 0 — 공통 접두가 캐시되지 않았다. 설계 전제 붕괴');
  else verdicts.push(`✓ 캐시 읽기 ${totalCacheRead} 토큰`);

  const limit = Math.round(BASELINE_KRW * 1.5);
  if (totalKrw > limit) verdicts.push(`✗ 원가 ${totalKrw}원 — 중단 기준(${limit}원) 초과`);
  else verdicts.push(`✓ 원가 ${totalKrw}원 (기준선의 ${(totalKrw / BASELINE_KRW).toFixed(2)}배)`);

  process.stdout.write(`\n${verdicts.map((v) => `  ${v}`).join('\n')}\n`);
  if (verdicts.some((v) => v.startsWith('✗'))) {
    process.stdout.write('\n중단 기준에 걸렸다. 설계를 재검토해야 한다.\n');
    process.exitCode = 1;
  }
}

void main();
