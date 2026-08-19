// 근거: C00 §1.2 (TypeScript 인터페이스 전량). 본 파일은 C00 이 확정한 형(型)의 이식본이며
//       v1 에서 구현된 단계(S0~S4·S6)의 타입만 포함한다. S5/S7/S8 은 담당 영역에서 확장한다.

export type StemIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type BranchIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
/** 60갑자 인덱스 0=甲子 … 59=癸亥 */
export type GanjiIdx = number;

export type Stem = '甲' | '乙' | '丙' | '丁' | '戊' | '己' | '庚' | '辛' | '壬' | '癸';
export type Branch = '子' | '丑' | '寅' | '卯' | '辰' | '巳' | '午' | '未' | '申' | '酉' | '戌' | '亥';
export type Element = '木' | '火' | '土' | '金' | '水';
export type YinYang = '陽' | '陰';

export type TenGod =
  | '비견' | '겁재' | '식신' | '상관' | '편재'
  | '정재' | '편관' | '정관' | '편인' | '정인';
export type TenGodGroup = '비겁' | '식상' | '재성' | '관성' | '인성';

export interface Pillar {
  stem: Stem;
  stemIdx: StemIdx;
  branch: Branch;
  branchIdx: BranchIdx;
  /** "甲子" */
  ganji: string;
  ganjiIdx: GanjiIdx;
  /** "갑자" */
  ganjiKo: string;
  /** 납음오행 */
  naeum: { hanja: string; ko: string; element: Element };
}
export type PillarKey = 'year' | 'month' | 'day' | 'hour';

// ── S0 입력 ──────────────────────────────────────────────────────────────
export type CalendarType = 'solar' | 'lunar' | 'lunar_leap';
/** 명리상 성별. 대운 방향에 필수라 미입력을 허용하지 않는다 */
export type Gender = 'M' | 'F';

export interface BirthPlaceInput {
  latitude?: number;
  longitude?: number;
  /** 표시/감사용 라벨. 단독 제공 시 MISSING_TZ (C00 §3-A14: tzdb 미번들 + Intl 금지) */
  ianaTz?: string;
  /** region='GENERIC' 필수 */
  stdOffsetMinutes?: number;
  /** region='GENERIC' 필수 (0 | 60) */
  dstMinutes?: number;
  region?: PlaceRegion;
}
export type PlaceRegion = 'KR' | 'GENERIC';

export interface RawBirthInput {
  calendarType: CalendarType;
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  timeUnknown: boolean;
  gender: Gender;
  birthPlace: BirthPlaceInput;
}

export interface NormalizedInput {
  v: 1;
  solar: { year: number; month: number; day: number };
  /**
   * 음력으로 입력했을 때만 존재하는 원본 (C00 §1.2.2 `lunarSource`).
   *
   * **표시 전용이다.** 계산은 전부 `solar` 만 본다 — 같은 양력일을 양력으로 넣은 사람과
   * 음력으로 넣은 사람은 같은 사주이므로 캐시 키에도 들어가면 안 된다(C00 §7.3 규칙 1, §S0-2(b)).
   */
  lunarSource?: { year: number; month: number; day: number; leap: boolean };
  /** timeUnknown 이면 {12,0} — 삼주 모드에서도 대운 근사용으로 유지한다 */
  wall: { hour: number; minute: number };
  timeUnknown: boolean;
  gender: Gender;
  place: {
    latitude: number | null;
    /** null = 진태양시 미적용(STANDARD 유파). 기본은 출생지 경도 */
    longitude: number | null;
    region: PlaceRegion;
    ianaTz: string | null;
    stdOffsetMinutes: number | null;
    dstMinutes: number | null;
  };
}

export type EngineErrorCode =
  | 'OUT_OF_RANGE'
  | 'INVALID_DATE'
  | 'INVALID_INPUT'
  | 'INVALID_LUNAR_DATE'
  | 'UNSUPPORTED_CALENDAR'
  | 'MISSING_PLACE'
  | 'MISSING_TZ';

/** `erasableSyntaxOnly` 때문에 파라미터 프로퍼티를 쓸 수 없어 필드를 직접 대입한다 */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

// ── S1 시각 정규화 ────────────────────────────────────────────────────────
export type EotAlgorithm = 'NOAA_MEEUS';
export type TrueSolarMode = 'TRUE_SOLAR' | 'STANDARD';
export type GapPolicy = 'SHIFT_FORWARD';
export type OverlapPolicy = 'FIRST';

export interface TimeFlags {
  /** 존재하지 않는 벽시계였다 */
  gap: boolean;
  /** 두 번 존재하는 벽시계였다 */
  overlap: boolean;
  dstApplied: boolean;
  /** 표준시가 +09:00 이 아니었다 (+08:30 / LMT) */
  historicalOffset: boolean;
  /** 진태양시 보정으로 달력 날짜가 이동했다 */
  dayShiftedByTrueSolar: boolean;
  /** effectiveWall 이 22:45~00:45 구간 (C00 §S1-6 c-2 — 판정 프레임은 벽시계다) */
  nearJasiBoundary: boolean;
}

export interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface NormalizedTime {
  /** 절대순간. 절기 비교·대운수 계산의 유일한 기준 (F3) */
  instantUtcMs: number;
  /** 실제 시계 판독값(갭 보정 반영). 표시용 */
  effectiveWall: CivilDateTime;
  /** 진태양시. 일주 경계 + 시주 판정의 기준 (C00 §S1-1 (5)) */
  apparent: CivilDateTime & { ms: number };
  /** 표준시 벽시계(서머타임 해제). longitude=null 유파의 명식 프레임 */
  standard: CivilDateTime & { ms: number };
  corrections: {
    stdOffsetMinutes: number;
    standardMeridianDeg: number;
    dstMinutes: number;
    /** 4 × (λ − λ_std) */
    longitudeMinutes: number;
    eotMinutes: number;
    /** −dst + L + E (벽시계 기준 총이동) */
    totalMinutes: number;
    eotAlgorithm: EotAlgorithm;
    mode: TrueSolarMode;
  };
  flags: TimeFlags;
}

// ── S2 절기 ───────────────────────────────────────────────────────────────
/** 0=입춘 … 11=소한 */
export type JieIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface JieDef {
  jieIndex: JieIndex;
  /** 태양 겉보기 황경 (deg) */
  lambda: number;
  ko: string;
  hanja: string;
  /** 월지 인덱스 (0=子) */
  monthBranchIdx: BranchIdx;
  /** 寅 기준 순번 (0=寅월) */
  monthOrder: JieIndex;
}

export interface JieHit extends JieDef {
  /** 초 정밀 원값 */
  utcMs: number;
  /** 테이블에서 이 절기가 속한 그레고리 연도 키 */
  gregYear: number;
}

export interface JieContext {
  prev: JieHit;
  next: JieHit;
  /** 입춘 경계로 확정한 사주년 */
  sajuYear: number;
  monthOrder: JieIndex;
  monthBranchIdx: BranchIdx;
  minutesFromPrevJie: number;
  minutesToNextJie: number;
  /** |절입 − 출생| < 60초 (C00 §5.4) */
  boundaryWarning: boolean;
}

// ── S3 네 기둥 ────────────────────────────────────────────────────────────
export type JasiRule = 'yajasi' | 'johjasi' | 'yajasi-nextstem';

export interface FourPillars {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  /** 삼주 모드면 null */
  hour: Pillar | null;
  threePillarMode: boolean;
  sajuYear: number;
  monthOrder: JieIndex;
  /** 정오 기준 정수 JDN */
  dayJdn: number;
  calendarUsedForJdn: 'gregorian' | 'julian';
  jasiRule: JasiRule;
  /** 야자시(23시대)에 해당했다 */
  isYajasi: boolean;
  /** "甲子 丙寅 戊辰 壬子" (삼주면 3항) */
  gz8: string;
  jie: { ko: string; hanja: string; enteredUtcMs: number };
  boundaryWarning: boolean;
}

// ── S4 십신 ───────────────────────────────────────────────────────────────
export interface HiddenStemEntry {
  stem: Stem;
  role: '여기' | '중기' | '정기';
  /** strength-params.json > scoreModel.hiddenStemRatio 가 유일한 출처 (C00 §S4-2) */
  ratio: number;
  tenGod: TenGod;
}

export interface TenGodChart {
  byPillar: Record<PillarKey, {
    stem: TenGod | '일간' | null;
    /** 지지 정기 기준 (표시용) */
    branchMain: TenGod | null;
    /** 지장간 전체 (점수용) */
    branchAll: HiddenStemEntry[];
  }>;
  /**
   * 십신 그룹별 점수 = **S5 오행 점수(C05-STD)를 일간 기준 그룹으로 접은 것**.
   * 합 = `strength.strength.total` (사주 80.00 / 삼주 62.00) 이며 `StrengthResult.scores` 와
   * 항상 같은 체계다. 배점 체계를 두 벌 두면 리포트에 서로 다른 숫자가 나가므로
   * v1 의 「임시 정의(합 7.0)」는 폐기했다 (C00 §S5-1).
   */
  groupWeights: Record<TenGodGroup, number>;
}

// ── S5 신강신약 · 격국 · 용신 ─────────────────────────────────────────────
export type StrengthGrade =
  | '극신약' | '신약' | '중화신약' | '중화' | '중화신강' | '신강' | '극신강';
/** C00 §1.2.7. v1 파이프라인(五道关)은 앞의 3개만 낸다 — §S5-4 에 通關 관문이 없다 */
export type YongsinRoute = '從/專旺' | '調候' | '抑扶+格局' | '通關';
/** 旺相休囚死 (C00 §S5-2 c: 월지 **지지 오행** 기준) */
export type WangSang = '旺' | '相' | '休' | '囚' | '死';
/** 십이운성 — tables.json > twelveStages 의 표기(한글)를 그대로 쓴다 */
export type Unseong =
  | '장생' | '목욕' | '관대' | '건록' | '제왕' | '쇠'
  | '병' | '사' | '묘' | '절' | '태' | '양';

export interface StrengthResult {
  /** 오행 5개 점수. 합 = total */
  scores: Record<Element, number>;
  /** 사주 80.00 / 삼주 62.00 (C00 §S5-1) */
  total: number;
  /** 십신 그룹 점수. 합 = total */
  groupScores: Record<TenGodGroup, number>;
  /** 비겁 + 인성 */
  ally: number;
  /** 식상 + 재성 + 관성 = total − ally */
  foe: number;
  /** ally / total */
  R: number;
  /** 백분위 신강지수 0~100 (소수 1자리로 양자화) */
  SI: number;
  grade: StrengthGrade;
  /** SI >= threshold.isStrongCut_SI */
  isStrong: boolean;
  /** 중립 밴드(45 ≤ SI < 55) 안인가 — 용신 3관 분기용 */
  isNeutralBand: boolean;
  deuk: {
    deukryeong: boolean;
    wangsang: WangSang;
    deukji: boolean;
    unseongIlji: Unseong;
    deukse: boolean;
    allyCount: number;
    condCount: 0 | 1 | 2 | 3;
  };
  root: { hasRoot: boolean; strongRoot: boolean; rootScore: number; roots: string[] };
}

export interface GeokgukResult {
  /** "정관격" "칠살격" "건록격" "양인격" "종세격" "전왕격" … (지식카드 `geokguk:` 태그와 같은 표기) */
  name: string;
  /** 종격 / 전왕격 */
  special: boolean;
  /** 판정 근거 문자열 */
  basis: string;
  /** 8격일 때 그 격의 십신 (특수격이면 null) */
  tenGod: TenGod | null;
}

export interface YongsinResult {
  primary: Element;
  /** 우선순위 배열. primary 가 항상 [0] */
  favorable: Element[];
  avoid: Element[];
  route: YongsinRoute;
  /** 조후지수 ci (월지 ×2) */
  climateIndex: number;
  /** 조후 제1용신 1글자 (strength-params > tiaohouPrimary, 3표 다수결) */
  tiaohouChars: string;
  /** 五道关 통과 기록 */
  steps: string[];
}

export interface StrengthChart {
  strength: StrengthResult;
  geokguk: GeokgukResult;
  yongsin: YongsinResult;
}

// ── S6 대운 ───────────────────────────────────────────────────────────────
export interface DaewoonEntry {
  /** 0 = 교운 전 */
  index: number;
  ganji: string | null;
  ganjiIdx: GanjiIdx | null;
  startYear: number;
  endYear: number;
  startAgeWestern: number;
  endAgeWestern: number;
  startAgeKorean: number;
  endAgeKorean: number;
}

export interface DaewoonResult {
  forward: boolean;
  /** max(1, round(floor(Δ일)/3)) — 표기 전용 (C00 §S6-2) */
  daewoonNumber: number;
  /** 표시 전용 분해. 교운 순간을 만드는 데 쓰지 않는다 */
  exact: { years: number; months: number; days: number; hours: number };
  /** 교운 절대순간 (정수 ms) */
  changeoverUtcMs: number;
  deltaMinutes: number;
  /** 생시 모름 → 12:00 가정 */
  approx: boolean;
  pillars: DaewoonEntry[];
}

// ── S4-2 신살 · 십이운성 · 관계 ────────────────────────────────────────────
/** 십이신살 — tables.json > twelveSinsal 의 표기(한글)를 그대로 쓴다 (C00 §S4-4) */
export type Sinsal12 =
  | '겁살' | '재살' | '천살' | '지살' | '연살' | '월살'
  | '망신살' | '장성살' | '반안살' | '역마살' | '육해살' | '화개살';

/**
 * 신살 판정의 기준축. C00 §1.2.6 SinsalHit.basis 에 `지지쌍` 을 **추가**했다 —
 * 원진·귀문관살은 두 지지의 관계라서 기존 6종 어디에도 들어가지 않는데,
 * C04 §12-1 배점표가 둘을 신살로 채점하고 지식카드도 `sinsal:원진`·`sinsal:귀문관살` 로 존재한다.
 * 유니온을 넓히는 방향이라 기존 소비자는 깨지지 않는다.
 */
export type SinsalBasis = '일간' | '연지' | '일지' | '월지' | '간지' | '일주' | '지지쌍';

export interface SinsalHit {
  /** 지식카드 `sinsal:*` 의 key 와 글자 단위로 같다 */
  name: string;
  /** 히트한 기둥 (연→월→일→시 고정 순서) */
  pillars: PillarKey[];
  basis: SinsalBasis;
  /** 공망 지지 등 부가 정보 */
  detail?: string[];
  /** sinsal-params.json > sinsalScore. 목록에 없으면 0 */
  score: number;
}

export type BranchRelationType =
  | '육합' | '육충' | '육해' | '육파' | '원진' | '귀문'
  | '형' | '자형' | '삼합' | '반합' | '공합' | '방합' | '삼형';

export interface BranchRelation {
  type: BranchRelationType;
  pair?: [Branch, Branch];
  branches?: Branch[];
  /** "연-월" 등. 기둥 순서는 연→월→일→시 */
  at: string;
  /** 합화 오행 (합 계열만) */
  hwa?: Element;
  /** 삼형 "무은지형" 등 원전 명칭 */
  name?: string;
  /** sinsal-params.json > relationStrength */
  strength: number;
}

export type StemRelationType = '천간합' | '천간충' | '천간극';

export interface StemRelation {
  type: StemRelationType;
  pair: [Stem, Stem];
  at: string;
  /** 합화 오행. **`hwa` 는 라벨일 뿐 오행 점수에 반영하지 않는다** (C00 §3-D17) */
  hwa?: Element;
  name?: string;
}

export interface SinsalChart {
  /** 십이운성 — 일간 거법 (C00 §3-D2) */
  unseong: Record<PillarKey, Unseong | null>;
  /** 십이운성 — 봉법(각 기둥 천간 기준). 상세보기 부기용 */
  unseongByPillarStem: Record<PillarKey, Unseong | null>;
  /** 십이신살 — 연지·일지 둘 다 (C00 §3-D12) */
  sinsal12: Record<PillarKey, { byYear: Sinsal12; byDay: Sinsal12 } | null>;
  sinsal: SinsalHit[];
  /** 공망 — 일주 기준 1개만 (C00 §3-D13) */
  gongmang: { basis: string; voidBranches: [Branch, Branch]; hits: PillarKey[] };
  /** 연지 → 삼재 3년 지지 */
  samjae: [Branch, Branch, Branch];
  branchRelations: BranchRelation[];
  stemRelations: StemRelation[];
  /** 0..100 (C00 §S4-7) */
  sinsalScore: number;
  /** 0..100 (C00 §S4-7) */
  unseongEnergy: number;
}

// ── S7 별자리 ─────────────────────────────────────────────────────────────
/** 0=Aries … 11=Pisces (C00 §1.2.9) */
export type SignIdx = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type ZodiacElement = 'fire' | 'earth' | 'air' | 'water';

export interface Placement {
  /** 황경 (도, 0~360) */
  lon: number;
  sign: SignIdx;
  /** 지식카드 `zodiac:*` 의 key (`leo`) */
  signId: string;
  signKo: string;
  element: ZodiacElement;
  /** 궁 안에서의 도·분 */
  deg: number;
  min: number;
}

/** 생시 모름 시 "두 궁 병기" 를 실은 배치 */
export interface AmbiguousPlacement extends Placement {
  /** 병기할 다른 궁. 생시를 알면 항상 null */
  alsoSign: SignIdx | null;
  alsoSignKo: string | null;
}

export interface MoonPlacement extends AmbiguousPlacement {
  /** 황위 (도) */
  lat: number;
  /** 지심 거리 (km) */
  distKm: number;
  /** 생시 모름 → 12:00 가정 (C00 §3-G15). 오답률 실측 10.826% */
  assumedNoon: boolean;
}

export interface AstroChart {
  /** C00 §3-G1 확정 */
  zodiac: 'tropical';
  jdUt: number;
  deltaTSeconds: number;
  sun: AmbiguousPlacement;
  moon: MoonPlacement;
  /** C00 §3-G15 — v1 은 항상 null (정보량 0) */
  asc: Placement | null;
  ascOmittedReason: string;
  /** C00 §3-G13 — 별자리에는 진태양시를 적용하지 않는다. 항상 false */
  trueSolarApplied: false;
}

// ── S9 출력 ───────────────────────────────────────────────────────────────
export interface Chart {
  engineVersion: string;
  input: NormalizedInput;
  time: NormalizedTime;
  jie: JieContext;
  pillars: FourPillars;
  tenGods: TenGodChart;
  /** S5. 옵셔널이 아니다 — v1 엔진이 항상 채운다 (C00 §S5) */
  strength: StrengthChart;
  /**
   * S4-2. 옵셔널이 아니다.
   *
   * C00 §1.2.6 의 `SinsalChart` 는 `tenGods` 를 안에 품고 있지만 **여기서는 뺐다** —
   * 엔진 v1 이 이미 `chart.tenGods` 를 최상위에 두고 있고(해석 레이어 계약도 그 모양이다),
   * 같은 값을 두 곳에 두면 직렬화·캐시키에서 갈린다.
   */
  sinsal: SinsalChart;
  /** S7. 옵셔널이 아니다 */
  astro: AstroChart;
  luck: { daewoon: DaewoonResult };
  warnings: EngineWarning[];
}

export type EngineWarning =
  | 'JIE_BOUNDARY'
  | 'JASI_BOUNDARY'
  | 'DST_APPLIED'
  | 'HISTORICAL_OFFSET'
  | 'TIME_GAP'
  | 'TIME_OVERLAP'
  | 'DAY_SHIFTED_BY_TRUE_SOLAR'
  | 'THREE_PILLAR_MODE'
  | 'LOW_PRECISION_SOLAR_TERM'
  /**
   * 음력으로 입력해서 양력으로 환산했다 (C00 §5.4 배지 `LUNAR_CONVERTED`).
   *
   * `alsoSign` 과 달리 **경고 코드로 낸다.** 사용자가 "내가 넣은 날짜와 다른 날짜로 계산됐다"는
   * 사실을 알아야 잘못 고른 윤달을 되돌릴 수 있고, 그건 값이 아니라 고지의 문제이기 때문이다.
   * 환산된 원본은 `input.lunarSource` 에 있다.
   */
  | 'LUNAR_CONVERTED';
// 별자리 "두 궁 병기" 배지(C00 §3-G15b)는 **경고 코드로 내보내지 않는다**.
// `astro.sun.alsoSign` / `astro.moon.alsoSign` 이 이미 그 사실을 값으로 들고 있고,
// EngineWarning 을 늘리면 화면 문구표(`pages/engineWarningCopy.ts`)까지 동시에 고쳐야 해서
// 엔진 영역 밖으로 변경이 번진다. 배지 문구는 표시 레이어가 alsoSign 을 보고 만든다.
