// 골든셋 회귀 하네스 — 근거: C00 §6.3, docs/research/calc/proto/{golden,prod}.test.mjs
//
// 골든셋 JSON 은 앱 번들에 넣지 않는다(CI 전용 자산 V1/V1b). 리서치 워크스페이스에서 직접 읽는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDaewoon } from '../../src/shared/lib/saju/luck';
import { computeFourPillars } from '../../src/shared/lib/saju/pillars';
import { buildJieContext } from '../../src/shared/lib/saju/solar-terms';
import { normalizeTime } from '../../src/shared/lib/saju/time';
import type {
  DaewoonResult,
  FourPillars,
  Gender,
  JasiRule,
  PlaceRegion,
} from '../../src/shared/lib/saju/types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CALC_DIR = path.resolve(HERE, '../../../docs/research/calc');

export function readCalcJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(CALC_DIR, file), 'utf8')) as T;
}

export interface GoldenInput {
  date: string;
  time: string;
  gender: Gender;
  calendarType: string;
  longitude: number | null;
  latitude?: number;
  tzMode: 'raw_kst' | 'historical';
  jasiRule: JasiRule;
  region?: PlaceRegion;
  ianaTz?: string;
  stdOffsetMinutes?: number;
  dstMinutes?: number;
  utcOffsetMinutes?: number;
  trueSolarMode?: string;
}

export interface GoldenExpected {
  yearPillar?: string;
  monthPillar?: string;
  dayPillar?: string;
  hourPillar?: string;
  tenGods?: Record<string, string>;
  daewoonNumber?: number;
  daewoonDirection?: 'forward' | 'reverse';
  changeoverUtcMs?: number;
  sajuYear?: number;
  dayJdn?: number;
  pillarsOmitted?: boolean;
  pillarsOmittedReason?: string;
}

export interface GoldenCase {
  id: string;
  input: GoldenInput;
  expected: GoldenExpected | null;
  label?: string;
  confidence?: string;
  family?: string;
  gate?: boolean;
  excludeFromMergeGate?: boolean;
  needsReCollection?: boolean;
  referenceAxis?: { confidence: string };
  f3Discriminator?: { violatingImpl: string; correct: string };
  diag?: Record<string, number | string | boolean | null>;
}

export interface Computed {
  pillars: FourPillars;
  daewoon: DaewoonResult;
  instantUtcMs: number;
}

/**
 * 골든셋 케이스 1건을 **케이스에 기록된 규약 그대로** 재현한다.
 * region='GENERIC' 은 stdOffsetMinutes/dstMinutes 를 반드시 넘겨야 한다 —
 * 안 넘기면 KR 표준시 이력이 오적용돼 4기둥 4건이 통째로 깨진다(C00 적대검증 「반박된 정정 4」).
 */
export function computeCase(input: GoldenInput): Computed {
  const [year, month, day] = input.date.split('-').map(Number);
  const [hour, minute] = input.time.split(':').map(Number);
  const region: PlaceRegion = input.region ?? 'KR';
  const std = input.stdOffsetMinutes ?? input.utcOffsetMinutes;
  if (region === 'GENERIC' && typeof std !== 'number') {
    throw new Error(`${input.date} ${input.time}: region=GENERIC 인데 stdOffsetMinutes 가 없다`);
  }

  const time = normalizeTime(
    { year, month, day, hour, minute },
    {
      region,
      longitude: input.longitude,
      applyTz: input.tzMode === 'historical',
      stdOffsetMinutes: std,
      dstMinutes: input.dstMinutes ?? 0,
    },
  );
  const jie = buildJieContext(time.instantUtcMs);
  const pillars = computeFourPillars(time, jie, {
    jasiRule: input.jasiRule,
    applyTrueSolarToDayBoundary: true, // C00 §3-A2 확정값
    threePillarMode: false,
  });
  const daewoon = computeDaewoon(time.instantUtcMs, pillars, input.gender, year);
  return { pillars, daewoon, instantUtcMs: time.instantUtcMs };
}

export const quadOf = (p: FourPillars): string[] => [
  p.year.ganji,
  p.month.ganji,
  p.day.ganji,
  p.hour === null ? '' : p.hour.ganji,
];

export const expectedQuad = (e: GoldenExpected): string[] => [
  e.yearPillar ?? '',
  e.monthPillar ?? '',
  e.dayPillar ?? '',
  e.hourPillar ?? '',
];

export const directionOf = (d: DaewoonResult): 'forward' | 'reverse' =>
  d.forward ? 'forward' : 'reverse';
