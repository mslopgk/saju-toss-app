/**
 * 테스트 전용 픽스처. **프로덕션 코드에서 import 하지 않는다.**
 * 값은 형식만 맞춘 가상의 사주다(정확도 주장 근거로 인용 금지 — C00 §F10 의 "락파일" 취급과 같은 이유).
 *
 * 두 벌을 둔다:
 *   `SAMPLE_CHART`  — 신살·신강신약·별자리·캐시키가 **전부 있는** 미래형 차트(S4-2·S5·S7 구현 후 모양).
 *   `ENGINE_V1_CHART` — 엔진 v1(`computeChart`)이 실제로 내는 모양. 옵셔널 섹션이 전부 없다.
 * 해석 레이어는 두 모양 모두에서 동작해야 한다.
 */

import type { ChartLike, KnowledgeCard, UserProfile } from './contracts';

export const SAMPLE_CHART: ChartLike = {
  engineVersion: 'SAJU-ENGINE-1.0.0',
  pillars: {
    year: { stem: '庚', branch: '午', ganji: '庚午', ganjiKo: '경오' },
    month: { stem: '辛', branch: '巳', ganji: '辛巳', ganjiKo: '신사' },
    day: { stem: '丙', branch: '申', ganji: '丙申', ganjiKo: '병신' },
    hour: { stem: '甲', branch: '午', ganji: '甲午', ganjiKo: '갑오' },
    threePillarMode: false,
    gz8: '庚午 辛巳 丙申 甲午',
  },
  tenGods: {
    // 丙 일간 기준 룩업(C00 §S4-1). 실제 엔진 출력과 같은 모양이며 재성이 두 자리에 앉아 있다.
    byPillar: {
      year: { stem: '편재', branchMain: '겁재' },
      month: { stem: '정재', branchMain: '비견' },
      day: { stem: '일간', branchMain: '편재' },
      hour: { stem: '편인', branchMain: '겁재' },
    },
    groupWeights: { 비겁: 18.5, 식상: 12, 재성: 22.25, 관성: 15.25, 인성: 12 },
  },
  sinsal: {
    sinsal: [{ name: '역마살' }, { name: '천을귀인' }, { name: '천을귀인' }],
  },
  strength: {
    strength: {
      scores: { 木: 10.5, 火: 24.25, 土: 12, 金: 20.25, 水: 13 },
      SI: 58.4,
      grade: '중화신강',
      isStrong: true,
      // 丙 일간 × 일지 申 = 병(病). tables.json > twelveStages 와 같은 표기.
      deuk: { unseongIlji: '병' },
    },
    geokguk: { name: '편재격' },
    yongsin: { primary: '水', favorable: ['水', '金'], avoid: ['火'], route: '抑扶+格局' },
  },
  luck: {
    daewoon: {
      // 연간 庚(陽) × 여성 → 역행. `SAMPLE_PROFILE.gender = 'F'` 와 맞춰 `양녀(陽女)` 가 나온다.
      forward: false,
      pillars: [
        { index: 0, ganji: null, startAgeWestern: 0, endAgeWestern: 2 },
        { index: 1, ganji: '壬午', startAgeWestern: 3, endAgeWestern: 12 },
        { index: 2, ganji: '癸未', startAgeWestern: 13, endAgeWestern: 22 },
      ],
    },
  },
  astro: {
    // idx 1 = taurus(황소자리) → earth
    sun: { sign: 1, signKo: '황소자리' },
    moon: { sign: 5, signKo: '처녀자리' },
    asc: { sign: 4, signKo: '사자자리' },
  },
  warnings: ['JIE_BOUNDARY'],
  cacheKey: 'chartkey-0001',
};

/** 엔진 v1 이 실제로 내는 모양 — 옵셔널 섹션이 하나도 없다. */
export const ENGINE_V1_CHART: ChartLike = {
  engineVersion: SAMPLE_CHART.engineVersion,
  pillars: SAMPLE_CHART.pillars,
  tenGods: SAMPLE_CHART.tenGods,
  luck: SAMPLE_CHART.luck,
  warnings: [],
};

export const SAMPLE_PROFILE: UserProfile = { gender: 'F', mbti: 'ENFP', blood: 'O' };

/**
 * 최소 카드 세트. 실제 지식베이스(`shared/knowledge` CARDS 198장)와 **같은 타입**이며
 * 태그 규약도 같다 — 규약이 어긋나면 이 픽스처가 아니라 `retrieve.test.ts` 의 실카드 검사가 잡는다.
 */
export const SAMPLE_CARDS: readonly KnowledgeCard[] = [
  {
    id: 'ilgan:丙',
    kind: 'ilgan',
    key: '丙',
    title: '병화 일간',
    summary: '병화는 드러나는 불이다.',
    keywords: ['병화', '丙'],
    detail: '병화는 드러나는 불이다. 시작이 빠르고 주변을 밝히지만 지속에는 연료가 필요하다.',
    tags: ['dayStem:丙'],
    source: { doc: 'C04-십신-십이운성-신살-판정-룩업테이블.md', section: '§1' },
    confidence: 'A',
  },
  {
    id: 'yongsin:신강지수:중화신강',
    kind: 'yongsin',
    key: '신강지수:중화신강',
    title: '중화신강',
    summary: '중화신강은 자기 힘이 조금 앞서는 상태다.',
    keywords: ['중화신강', '신강'],
    detail: '중화신강은 자기 힘이 조금 앞서는 상태로, 덜어 내는 방향의 운에서 편해진다.',
    tags: ['strengthGrade:중화신강'],
    source: { doc: 'C05-신강신약-오행점수-용신도출-정량알고리즘.md', section: '§4.3' },
    confidence: 'B',
  },
  {
    id: 'yongsin:용신5법:억부(抑扶)',
    kind: 'yongsin',
    key: '용신5법:억부(抑扶)',
    title: '억부 용신',
    summary: '억부는 넘치면 덜고 모자라면 보태는 도출법이다.',
    keywords: ['억부', '용신'],
    detail: '억부는 넘치면 덜고 모자라면 보태는 도출법이다. 속도를 늦추고 흐름을 잇는 역할을 한다.',
    tags: ['yongsinRoute:抑扶+格局'],
    source: { doc: 'C05-신강신약-오행점수-용신도출-정량알고리즘.md', section: '§5.1' },
    confidence: 'B',
  },
  {
    id: 'sinsal:역마살',
    kind: 'sinsal',
    key: '역마살',
    title: '역마살',
    summary: '역마는 이동과 변화의 상징이다.',
    keywords: ['역마살', '이동'],
    detail: '역마는 이동과 변화의 상징으로, 자리보다 동선에서 기회가 생긴다.',
    tags: ['sinsal:역마살'],
    source: { doc: 'C04-십신-십이운성-신살-판정-룩업테이블.md', section: '§7' },
    confidence: 'C',
  },
  {
    id: 'sinsal:천을귀인',
    kind: 'sinsal',
    key: '천을귀인',
    title: '천을귀인',
    summary: '천을귀인은 곤경에서 도움을 얻는 상징이다.',
    keywords: ['천을귀인', '귀인'],
    detail: '천을귀인은 곤경에서 도움을 얻는 상징으로 읽힌다.',
    tags: ['sinsal:천을귀인'],
    source: { doc: 'C04-십신-십이운성-신살-판정-룩업테이블.md', section: '§7' },
    confidence: 'C',
  },
  {
    id: 'zodiac:taurus',
    kind: 'zodiac',
    key: 'taurus',
    title: '황소자리',
    summary: '황소자리는 속도보다 밀도를 택한다.',
    keywords: ['황소자리', 'taurus'],
    detail: '황소자리는 속도보다 밀도를 택한다. 한번 자리를 잡으면 잘 바꾸지 않는다.',
    tags: ['zodiac:taurus'],
    source: { doc: '06-혈액형-성격론과-서양점성술-별자리-데이터.md', section: '§B-5' },
    confidence: 'B',
  },
  {
    id: 'zodiac:원소:earth',
    kind: 'zodiac',
    key: '원소:earth',
    title: '흙 원소',
    summary: '흙 원소는 형태로 남는 것을 좋아한다.',
    keywords: ['흙', 'earth'],
    detail: '흙 원소는 형태로 남는 것을 좋아한다. 손에 잡히는 결과에서 안심한다.',
    tags: ['zodiacElement:earth'],
    source: { doc: '06-혈액형-성격론과-서양점성술-별자리-데이터.md', section: '§B-5' },
    confidence: 'B',
  },
  {
    id: 'mbti:ENFP',
    kind: 'mbti',
    key: 'ENFP',
    title: 'ENFP',
    summary: 'ENFP 는 가능성을 먼저 본다.',
    keywords: ['ENFP'],
    detail: '가능성을 먼저 보고 사람에게서 에너지를 얻는 자기신고 유형이다.',
    tags: ['mbti:ENFP'],
    source: { doc: '05-MBTI-데이터와-상표권-리스크.md', section: '§1-1' },
    confidence: 'B',
  },
  {
    id: 'blood:문체:O',
    kind: 'blood',
    key: '문체:O',
    title: 'O형 말투',
    summary: 'O형 말투는 결론을 먼저 말한다.',
    keywords: ['O형', '말투'],
    detail: '결론을 먼저 말하고 이유를 뒤에 붙이는 말투를 쓴다. 성격 판정에는 쓰지 않는다.',
    tags: ['blood:O'],
    source: { doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md', section: '§2.5' },
    confidence: 'D',
  },
  {
    id: 'zodiac:pisces',
    kind: 'zodiac',
    key: 'pisces',
    title: '물고기자리',
    summary: '이 차트와 무관한 카드.',
    keywords: ['물고기자리', 'pisces'],
    detail: '이 차트와 무관한 카드. 검색에서 걸리면 안 된다.',
    tags: ['zodiac:pisces'],
    source: { doc: '06-혈액형-성격론과-서양점성술-별자리-데이터.md', section: '§B-5' },
    confidence: 'B',
  },
];
