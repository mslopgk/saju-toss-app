/**
 * `POST /api/interpret` 본문 검증.
 *
 * 이 파일이 하는 일은 두 가지이고, 둘째가 더 중요하다.
 *   ① 모양이 맞는지 본다(ARCHITECTURE.md — 외부 데이터는 경계에서 타입 검증).
 *   ② **프롬프트에 들어갈 문자열의 문자 집합을 못 박는다.**
 *
 * ②의 이유: 팩트팩은 차트 필드를 그대로 user 턴에 직렬화해 넣는다. 즉 `mbti`·`geokguk.name`·
 * `sinsal[].name` 같은 자유 문자열은 **클라이언트가 보내는 프롬프트 조각**이다. 길이만 재고 통과시키면
 * "위 지시를 무시하고 …" 를 MBTI 자리에 넣어 보낼 수 있다. 그래서 값마다 열거형이나 문자 클래스까지
 * 좁힌다 — 정상 클라이언트는 어차피 열여섯 유형과 60갑자만 보낸다.
 *
 * zod 의 `z.object()` 는 **선언하지 않은 키를 버린다**(strip). 그래서 검증을 통과한 객체는
 * 이 파일이 선언한 필드만 들고 있고, 엔진 `Chart` 의 나머지(입력 원본·JDN·중간 계산)는 프롬프트에
 * 절대 닿지 않는다. 이것이 세 번째 방어선이다.
 */

import { z } from 'zod';
// 섹션 목록은 앱 스키마가 정본이다 — 서버가 다시 적으면 두 벌이 된다.
import { SECTION_IDS } from '../../app/src/shared/interpret';
// 배럴이 내보내지 않는 타입(`TenGod`·`TenGodGroup`·`Unseong`)이 섞여 있어 계약 파일에서 직접 가져온다.
// 전부 `import type` 이라 런타임 그래프에는 아무것도 더하지 않는다.
import type {
  BloodType,
  ChartLike,
  Element,
  EngineWarning,
  Gender,
  ReportKind,
  SectionId,
  StrengthGrade,
  TenGod,
  TenGodGroup,
  Unseong,
  UserProfile,
  YongsinRoute,
} from '../../app/src/shared/interpret/contracts';

/* ─────────────────────────── 원자 타입 ─────────────────────────── */

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

const ELEMENTS = ['木', '火', '土', '金', '水'] as const satisfies readonly Element[];

const TEN_GODS = [
  '비견', '겁재', '식신', '상관', '편재',
  '정재', '편관', '정관', '편인', '정인',
] as const satisfies readonly TenGod[];

const TEN_GOD_GROUPS = ['비겁', '식상', '재성', '관성', '인성'] as const satisfies readonly TenGodGroup[];

const UNSEONG = [
  '장생', '목욕', '관대', '건록', '제왕', '쇠',
  '병', '사', '묘', '절', '태', '양',
] as const satisfies readonly Unseong[];

const STRENGTH_GRADES = [
  '극신약', '신약', '중화신약', '중화', '중화신강', '신강', '극신강',
] as const satisfies readonly StrengthGrade[];

const YONGSIN_ROUTES = ['從/專旺', '調候', '抑扶+格局', '通關'] as const satisfies readonly YongsinRoute[];

const ENGINE_WARNINGS = [
  'JIE_BOUNDARY',
  'JASI_BOUNDARY',
  'DST_APPLIED',
  'HISTORICAL_OFFSET',
  'TIME_GAP',
  'TIME_OVERLAP',
  'DAY_SHIFTED_BY_TRUE_SOLAR',
  'THREE_PILLAR_MODE',
  'LOW_PRECISION_SOLAR_TERM',
  'LUNAR_CONVERTED',
] as const satisfies readonly EngineWarning[];

const REPORT_KINDS = ['fusion', 'basic_saju'] as const satisfies readonly ReportKind[];
const GENDERS = ['M', 'F'] as const satisfies readonly Gender[];
const BLOOD_TYPES = ['A', 'B', 'O', 'AB'] as const satisfies readonly BloodType[];

/** 한글 한 글자(간지 훈독). 예: "경오" */
const koreanGanji = z.string().regex(/^[가-힣]{2}$/, 'ganjiKo 는 한글 두 글자여야 한다');
/** 한글·한자·괄호만. 신살명·격국명·별자리 한글명이 여기 해당한다. */
const koreanLabel = (max: number) =>
  z.string().regex(new RegExp(`^[가-힣一-龥()·\\s]{1,${max}}$`), '허용되지 않는 문자가 있다');

const stemSchema = z.enum(STEMS);
const branchSchema = z.enum(BRANCHES);
const ganjiSchema = z.string().regex(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/, '60갑자가 아니다');

/** 점수·지수. C00 §7.4 양자화 뒤 값이라 소수 허용, 범위는 넉넉히 잡되 유한해야 한다. */
const score = z.number().finite().min(-1000).max(1000);
const age = z.number().int().min(0).max(200);

/**
 * "키 전부가 있어야 하는 점수 맵". 키 목록을 위의 상수 배열에서 받아 오므로
 * 오행 5개·십신그룹 5개가 **한 곳에만** 적힌다(엔진 타입과 어긋나면 `satisfies` 가 잡는다).
 */
function scoreMap<K extends string>(keys: readonly K[]) {
  return z.object(Object.fromEntries(keys.map((k) => [k, score])) as Record<K, typeof score>);
}

const pillarSchema = z.object({
  stem: stemSchema,
  branch: branchSchema,
  ganji: ganjiSchema,
  ganjiKo: koreanGanji,
});

const tenGodSlotSchema = z.object({
  stem: z.union([z.enum(TEN_GODS), z.literal('일간')]).nullable(),
  branchMain: z.enum(TEN_GODS).nullable(),
});

const placementSchema = z.object({
  sign: z.number().int().min(0).max(11),
  signKo: koreanLabel(12),
  alsoSignKo: koreanLabel(12).nullable().optional(),
});

const moonPlacementSchema = placementSchema.extend({
  assumedNoon: z.boolean().optional(),
});

/* ─────────────────────────── 차트 ─────────────────────────── */

export const chartSchema = z.object({
  engineVersion: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/),
  pillars: z.object({
    year: pillarSchema,
    month: pillarSchema,
    day: pillarSchema,
    hour: pillarSchema.nullable(),
    threePillarMode: z.boolean(),
    // "庚午 辛巳 丙申 甲午" (삼주면 세 토막). 공백 하나로 이어 붙인 모양을 그대로 고정한다.
    gz8: z
      .string()
      .regex(
        /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥](?: [甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]){2,3}$/,
        'gz8 은 간지 3~4개를 공백으로 이은 문자열이어야 한다',
      ),
  }),
  tenGods: z.object({
    byPillar: z.object({
      year: tenGodSlotSchema,
      month: tenGodSlotSchema,
      day: tenGodSlotSchema,
      hour: tenGodSlotSchema,
    }),
    groupWeights: scoreMap(TEN_GOD_GROUPS),
  }),
  luck: z.object({
    daewoon: z.object({
      forward: z.boolean(),
      pillars: z
        .array(
          z.object({
            index: z.number().int().min(0).max(32),
            ganji: ganjiSchema.nullable(),
            startAgeWestern: age,
            endAgeWestern: age,
          }),
        )
        .max(24),
    }),
  }),
  warnings: z.array(z.enum(ENGINE_WARNINGS)).max(ENGINE_WARNINGS.length),

  sinsal: z
    .object({
      sinsal: z
        .array(
          z.object({
            name: koreanLabel(24),
            pillars: z.array(z.enum(['year', 'month', 'day', 'hour'])).max(4).optional(),
          }),
        )
        .max(64),
    })
    .optional(),

  strength: z
    .object({
      strength: z.object({
        scores: scoreMap(ELEMENTS),
        SI: score,
        grade: z.enum(STRENGTH_GRADES),
        isStrong: z.boolean(),
        deuk: z.object({ unseongIlji: z.enum(UNSEONG) }),
      }),
      geokguk: z.object({ name: koreanLabel(24) }),
      yongsin: z.object({
        primary: z.enum(ELEMENTS),
        favorable: z.array(z.enum(ELEMENTS)).max(5),
        avoid: z.array(z.enum(ELEMENTS)).max(5),
        route: z.enum(YONGSIN_ROUTES),
      }),
    })
    .optional(),

  astro: z
    .object({
      sun: placementSchema,
      moon: moonPlacementSchema.nullable(),
      asc: placementSchema.nullable(),
    })
    .optional(),

  cacheKey: z.string().regex(/^[A-Za-z0-9:_-]{1,64}$/).optional(),
});

/* ─────────────────────────── 프로필 ─────────────────────────── */

export const profileSchema = z.object({
  gender: z.enum(GENDERS),
  // 16유형만. 자유 문자열이면 그대로 프롬프트에 실린다.
  mbti: z.string().regex(/^[EI][NS][TF][JP]$/, 'MBTI 는 16유형 코드여야 한다').nullable(),
  blood: z.enum(BLOOD_TYPES).nullable(),
});

export const interpretBodySchema = z.object({
  kind: z.enum(REPORT_KINDS).default('fusion'),
  chart: chartSchema,
  profile: profileSchema,
});

export type InterpretBody = {
  readonly kind: ReportKind;
  readonly chart: ChartLike;
  readonly profile: UserProfile;
};

export type ParseResult =
  | { readonly ok: true; readonly value: InterpretBody }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * 본문 파싱. 실패 사유는 **경로와 메시지만** 돌려준다 — 받은 값을 에코하지 않는다
 * (에러 응답이 입력 반사 채널이 되면 XSS·로그 오염의 통로가 된다).
 */
export function parseInterpretBody(raw: unknown): ParseResult {
  const parsed = interpretBodySchema.safeParse(raw);
  if (parsed.success) {
    // zod 가 미선언 키를 버린 뒤의 객체다. ChartLike 와 구조가 같다.
    return { ok: true, value: parsed.data as unknown as InterpretBody };
  }
  const issues = parsed.error.issues
    .slice(0, 12)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, issues };
}

/**
 * 카드 한 장 요청 본문.
 *
 * 전체 리포트 본문에 섹션 하나를 더한 모양이다. `SECTION_IDS` 를 정본으로 받으므로
 * 섹션이 늘거나 줄면 여기가 자동으로 따라간다 — 목록을 두 번 적지 않는다.
 */
export const cardBodySchema = interpretBodySchema.extend({
  sectionId: z.enum(SECTION_IDS),
});

export type CardBody = InterpretBody & { readonly sectionId: SectionId };

export type CardParseResult =
  | { readonly ok: true; readonly value: CardBody }
  | { readonly ok: false; readonly issues: readonly string[] };

export function parseCardBody(raw: unknown): CardParseResult {
  const parsed = cardBodySchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data as unknown as CardBody };
  }
  const issues = parsed.error.issues
    .slice(0, 12)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, issues };
}
