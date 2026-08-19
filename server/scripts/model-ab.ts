/**
 * 모델 A/B — **같은 프롬프트**를 모델·effort 만 바꿔 실호출하고 나란히 찍는다.
 *
 * 왜 필요한가: `smoke.ts` 는 라우팅표(`ROUTING`)가 정한 한 조합만 본다. "Opus 를 Sonnet 으로
 * 낮춰도 되는가" 는 원가·소요·**검증 통과 여부**를 같은 입력에서 비교해야 답할 수 있는 질문이고,
 * 그 비교를 눈대중으로 하면 라우팅표를 근거 없이 고치게 된다.
 *
 * 이 스크립트는 요청을 **한 번만** 조립하고 `routing` 만 갈아 끼운다. 프롬프트·카드·팩트팩이
 * 문자 단위로 동일해야 비교가 성립하기 때문이다. 캐시는 타지 않는다(`call` 을 직접 부른다).
 *
 * 사용:
 *   ANTHROPIC_API_KEY=... npm run build && npm run model-ab
 *   ANTHROPIC_API_KEY=... npm run model-ab -- --only claude-sonnet-5
 *
 * ⚠ 변형 하나당 한 번 과금된다. 기본 4변형이면 대략 400원 안팎.
 */

import process from 'node:process';

import { computeChart } from '../../app/src/shared/lib/saju';
import { CARDS } from '../../app/src/shared/knowledge';
import {
  verifyInterpretation,
  type Effort,
  type InterpretationRequest,
  type ModelId,
} from '../../app/src/shared/interpret';

import pricing from '../pricing.json';
import { createCaller } from '../src/anthropic';
import { createLogger } from '../src/log';
import { buildRequestFor, LLM_RETRIEVAL } from '../src/interpret';

interface Prices {
  readonly input: number;
  readonly cacheWrite5m: number;
  readonly cacheRead: number;
  readonly output: number;
}
const PRICES = pricing.models as Readonly<Record<string, Prices>>;
const KRW = pricing.krwPerUsd;

interface Variant {
  readonly model: ModelId;
  readonly effort: Effort | null;
  /** 단가표 키. sonnet-5 는 도입가/정가가 따로라 최악값(정가)으로도 같이 본다. */
  readonly listPriceKey?: string;
}

/**
 * Opus/high 가 기준선이다. Sonnet 은 effort 를 같이 흔든다 — 소요의 대부분이 사고 시간이라
 * 모델만 바꾸고 effort 를 그대로 두면 "Sonnet 도 느리다" 는 잘못된 결론이 나온다.
 */
const VARIANTS: readonly Variant[] = [
  { model: 'claude-opus-5', effort: 'high' },
  { model: 'claude-sonnet-5', effort: 'high', listPriceKey: 'claude-sonnet-5-list' },
  { model: 'claude-sonnet-5', effort: 'medium', listPriceKey: 'claude-sonnet-5-list' },
  { model: 'claude-sonnet-5', effort: 'low', listPriceKey: 'claude-sonnet-5-list' },
];

interface Row {
  readonly label: string;
  readonly status: string;
  readonly elapsedMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly sections: number;
  readonly bodyChars: number;
  readonly usedCards: number;
  readonly krw: number;
  readonly krwList: number;
  readonly note: string;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function costKrw(key: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[key];
  if (p === undefined) return 0;
  return Math.round(((inputTokens * p.input) / 1e6 + (outputTokens * p.output) / 1e6) * KRW);
}

async function main(): Promise<void> {
  const apiKey = (process.env['ANTHROPIC_API_KEY'] ?? '').trim();
  if (apiKey === '') {
    process.stderr.write('ANTHROPIC_API_KEY 가 없다.\n');
    process.exitCode = 1;
    return;
  }

  const only = arg('only');
  const variants = only === undefined ? VARIANTS : VARIANTS.filter((v) => v.model === only);

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
  const input = {
    kind: 'fusion' as const,
    chart,
    profile: { gender: 'M' as const, mbti: 'INTJ', blood: 'A' as const },
  };

  const built = buildRequestFor(input, CARDS, LLM_RETRIEVAL);
  if (!built.ok) {
    process.stderr.write(`프롬프트 조립 실패: ${built.message}\n`);
    process.exitCode = 1;
    return;
  }
  const base = built.request;

  const logger = createLogger({ level: 'warn' });
  const call = createCaller({
    apiKey,
    timeoutMs: 300_000,
    maxRetries: 1,
    serverSideFallback: true,
    logger,
  });

  process.stdout.write(
    `\n동일 프롬프트 · fusion · 카드 ${base.knowledgeCardIds.length}장 · 섹션 ${base.sections.length}개\n`,
  );

  const rows: Row[] = [];
  for (const v of variants) {
    const label = `${v.model} / effort ${v.effort ?? '-'}`;
    process.stdout.write(`\n▶ ${label}\n`);

    // 요청은 그대로 두고 라우팅만 갈아 끼운다 — 프롬프트가 달라지면 비교가 성립하지 않는다.
    const req: InterpretationRequest = {
      ...base,
      routing: { ...base.routing, model: v.model, effort: v.effort },
    };

    const startedAt = Date.now();
    const upstream = await call(req);
    const elapsedMs = Date.now() - startedAt;

    if (!upstream.ok) {
      process.stdout.write(`  실패 ${upstream.code}: ${upstream.message}\n`);
      rows.push({
        label,
        status: upstream.code,
        elapsedMs,
        inputTokens: 0,
        outputTokens: 0,
        sections: 0,
        bodyChars: 0,
        usedCards: 0,
        krw: 0,
        krwList: 0,
        note: upstream.message.slice(0, 60),
      });
      continue;
    }

    const verified = verifyInterpretation(upstream.raw, req);
    const u = upstream.usage;
    const krw = costKrw(v.model, u.inputTokens + u.cacheWriteTokens, u.outputTokens);
    const krwList = costKrw(
      v.listPriceKey ?? v.model,
      u.inputTokens + u.cacheWriteTokens,
      u.outputTokens,
    );

    if (!verified.ok) {
      const codes = verified.failures.map((f) => `${f.code}:${f.detail}`).slice(0, 4);
      process.stdout.write(`  검증 거부 — ${codes.join(' / ')}\n`);
      rows.push({
        label,
        status: 'rejected',
        elapsedMs,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        sections: 0,
        bodyChars: 0,
        usedCards: 0,
        krw,
        krwList,
        note: codes.join(' / ').slice(0, 60),
      });
      continue;
    }

    const value = verified.value;
    const bodyChars = value.sections.reduce((n, s) => n + s.body.length, 0);
    process.stdout.write(`  ok · ${elapsedMs}ms · ${value.sections.length}섹션 · ${bodyChars}자\n`);
    process.stdout.write(`  headline: ${value.headline}\n`);
    const first = value.sections[0];
    if (first !== undefined) {
      process.stdout.write(`  ${first.id}: ${first.body.slice(0, 120)}…\n`);
    }
    rows.push({
      label,
      status: 'ok',
      elapsedMs,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      sections: value.sections.length,
      bodyChars,
      usedCards: value.usedCardIds.length,
      krw,
      krwList,
      note: upstream.fellBack ? `폴백 발생 → ${upstream.model}` : '',
    });
  }

  process.stdout.write('\n\n요약\n');
  const head = [
    '모델 / effort'.padEnd(34),
    '결과'.padEnd(10),
    '소요s'.padStart(7),
    '입력'.padStart(7),
    '출력'.padStart(7),
    '섹션'.padStart(5),
    '본문자'.padStart(7),
    '카드'.padStart(5),
    '원'.padStart(6),
    '원(정가)'.padStart(8),
  ].join(' ');
  process.stdout.write(`${head}\n${'─'.repeat(head.length)}\n`);
  for (const r of rows) {
    process.stdout.write(
      [
        r.label.padEnd(34),
        r.status.padEnd(10),
        (r.elapsedMs / 1000).toFixed(1).padStart(7),
        String(r.inputTokens).padStart(7),
        String(r.outputTokens).padStart(7),
        String(r.sections).padStart(5),
        String(r.bodyChars).padStart(7),
        String(r.usedCards).padStart(5),
        String(r.krw).padStart(6),
        String(r.krwList).padStart(8),
      ].join(' ') + (r.note === '' ? '' : `  ${r.note}`) + '\n',
    );
  }
  process.stdout.write(
    '\n※ 원가는 캐시 미스 기준(입력 = input + cacheWrite). 캐시 히트는 0원이다.\n' +
      '※ 원(정가) 는 sonnet-5 도입가가 끝난 뒤(2026-09-01~) 기준.\n',
  );
}

void main();
