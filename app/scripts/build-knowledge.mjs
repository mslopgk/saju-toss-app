#!/usr/bin/env node
/**
 * 지식카드 빌드 — 리서치 문서에서 "해석 생성용" 카드를 추출해 JSON/TS 로 굽는다.
 *
 * 근거 문서: docs/research/calc/C03 §1.1 §1.2 §8.1 / C04 §4 §5-4 §6-4 §7 §12 /
 *           C05 §4.3 §5.1 §5.2 §6.3 / C06 §3 §5.2 §5.3 §7.3 §7.4 / C07 §0.1 /
 *           docs/research/05 §1-1 §1-2 §2-1 / 06 §A-2 §A-5 §B-5 / 10 §2.1 §2.2 §2.4 §3.1 §3.2 §3.3 §6.2 §6.3 §6.4 /
 *           calc/personality-data.json, calc/tables.json
 *
 * 왜 "추출 + 단언" 방식인가:
 *   카드 본문을 이 스크립트에 직접 적으면 원문과 조용히 어긋난다. 그래서 모든 사실값은
 *   문서에서 파싱하고, 파싱 결과가 기대 행수/키셋과 다르면 즉시 죽인다(silent drift 차단).
 *   요약문(summary)만 추출값을 끼워넣는 결정론적 템플릿으로 만든다 — 새로운 주장을 만들지 않는다.
 *
 * ⚠️ 이 지식베이스는 사주 "계산"에 쓰지 않는다. 계산은 결정론적 엔진 코드가 담당한다.
 *    여기 있는 카드는 계산 결과를 사람이 읽을 문장으로 바꿀 때의 근거 재료다.
 *
 * 사용: node scripts/build-knowledge.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const RESEARCH = resolve(APP_ROOT, '..', 'docs', 'research');
const OUT_DIR = join(APP_ROOT, 'src', 'shared', 'knowledge');

/* ────────────────────────────── 문서 로더 / 파서 ────────────────────────────── */

const DOCS = {
  C03: 'calc/C03-사주-네기둥-산출-공식.md',
  C04: 'calc/C04-십신-십이운성-신살-판정-룩업테이블.md',
  C05: 'calc/C05-신강신약-오행점수-용신도출-정량알고리즘.md',
  C06: 'calc/C06-대운-세운-월운-계산.md',
  C07: 'calc/C07-별자리-태양궁-달별자리-ASC-계산.md',
  R05: '05-MBTI-데이터와-상표권-리스크.md',
  R06: '06-혈액형-성격론과-서양점성술-별자리-데이터.md',
  R10: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
};

const cache = new Map();
function doc(id) {
  if (!cache.has(id)) {
    const rel = DOCS[id];
    if (!rel) throw new Error(`unknown doc id: ${id}`);
    cache.set(id, readFileSync(join(RESEARCH, rel), 'utf8'));
  }
  return cache.get(id);
}

function fail(msg) {
  throw new Error(`[build-knowledge] ${msg}`);
}

/** 지정한 heading 줄부터 동급 이상 heading 직전까지 잘라낸다. */
function section(docId, headingPrefix) {
  const text = doc(docId);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (start < 0) fail(`${docId}: heading not found → ${headingPrefix}`);
  const level = (lines[start].match(/^#+/) ?? ['#'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** ```json / ```js 펜스 본문 추출 */
function fences(text, lang) {
  const out = [];
  const re = new RegExp('```' + lang + '\\r?\\n([\\s\\S]*?)```', 'g');
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

function jsonFence(text, index = 0) {
  const blocks = fences(text, 'json');
  if (blocks.length <= index) fail(`json fence #${index} not found`);
  try {
    return JSON.parse(blocks[index]);
  } catch (e) {
    fail(`json fence #${index} parse error: ${e.message}`);
  }
}

const clean = (s) =>
  String(s)
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** 마크다운 파이프 테이블 전부를 {header, rows} 로 파싱 */
function tables(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      const header = splitRow(lines[i]);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      out.push({ header, rows });
    } else i++;
  }
  return out;
}

function splitRow(line) {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return t.split('|').map(clean);
}

/** header 에 특정 문자열들이 모두 들어있는 첫 테이블 */
function tableWith(text, ...needles) {
  const all = tables(text);
  const hit = all.find((t) => needles.every((n) => t.header.some((h) => h.includes(n))));
  if (!hit) fail(`table not found (header needs ${needles.join(', ')})`);
  return hit;
}

function expect(cond, msg) {
  if (!cond) fail(msg);
}

const dataJson = (name) => JSON.parse(readFileSync(join(RESEARCH, 'calc', name), 'utf8'));

/* ────────────────────────────── 카드 유틸 ────────────────────────────── */

const cards = [];

/* ─────────────────────────── 검색 태그 (해석 레이어 규약) ───────────────────────────
 *
 * ⚠️ 이 블록이 태그 규약의 **유일한 출처**다. `src/shared/interpret/retrieve.ts` 의
 *    `queryTagsOf()` 가 만드는 문자열과 글자 단위로 같아야 카드가 검색된다.
 *    (어긋나면 `selectKnowledgeCards()` 가 조용히 빈 배열을 낸다 →
 *     `src/shared/interpret/retrieve.test.ts` 가 그 상태를 실패로 고정한다.)
 *
 * 표기 정본은 언제나 **계산 엔진 출력**이다. 카드 key 의 한국어 표기를 태그에 그대로 쓰지 않는다:
 *   - 별자리: 카드 key `leo` = 엔진 sign id. 팩트팩의 한글명(`사자자리`)은 태그로 쓰지 않는다.
 *   - 용신 도출 경로: 카드 key `용신5법:억부(抑扶)` → 엔진 유니온 `抑扶+格局`.
 *   - 십신: 카드 key 는 10신(`비견`), 팩트팩이 주는 건 5그룹(`비겁`) → 그룹 태그를 함께 단다.
 */

/** 십신 10종 → 그룹 5종 (C00 §S4-1). 팩트팩의 dominantTenGod 는 그룹 단위다. */
const TEN_GOD_GROUP = {
  비견: '비겁', 겁재: '비겁',
  식신: '식상', 상관: '식상',
  편재: '재성', 정재: '재성',
  편관: '관성', 정관: '관성',
  편인: '인성', 정인: '인성',
};

/** 카드 표기(용신5법) → 엔진 `YongsinRoute` 유니온. 병약(病藥)은 유니온에 없어 라우트 태그를 만들지 않는다. */
const YONGSIN_ROUTE = {
  '억부(抑扶)': '抑扶+格局',
  '격국(格局)': '抑扶+格局',
  '조후(調候)': '調候',
  '종격/전왕': '從/專旺',
};

/** MBTI 축 카드가 덮는 글자 위치. `queryTagsOf` 는 `mbtiAxis:{위치}{글자}` 를 낸다. */
const MBTI_AXIS = { EI: 0, SN: 1, TF: 2, JP: 3 };

/**
 * 인지기능 → 그 기능을 스택에 가진 16유형 코드. `buildMbti()` 가 personality-data.json 의
 * `mbti.types[].stack` 에서 채운다(스택은 저 파일이 단일 출처다 — 여기서 규칙을 다시 구현하지 않는다).
 *
 * 왜 필요한가: 인지기능 카드 8장에는 `mbtiFunction:Ni` 태그밖에 없어서 **영구 미도달**이었다.
 * 팩트팩은 4글자 코드만 들고 있고 스택을 계산하지 않기 때문이다(계산하면 그 표가 두 벌이 된다).
 * 대신 카드 쪽에 `mbti:INTJ` 를 함께 달면 이미 있는 16유형 축으로 그대로 닿는다.
 */
const MBTI_TYPES_BY_FUNCTION = new Map();

/** 카드 key 의 `접두:나머지` 를 분해한다. 접두가 없으면 prefix=null. */
function splitKey(key) {
  const i = key.indexOf(':');
  return i < 0 ? { prefix: null, rest: key } : { prefix: key.slice(0, i), rest: key.slice(i + 1) };
}

/**
 * kind + key → 검색 태그 배열. 결정론적(입력이 같으면 배열까지 동일).
 * 조회 축이 아직 없는 카드(대운 관계·인지기능·융합 서술 등)에도 네임스페이스 태그를 달아 둔다 —
 * 지금은 매칭되지 않지만, 태그 형식이 통일돼 있어야 축을 나중에 붙일 때 카드를 다시 굽지 않아도 된다.
 */
function tagsOf(kind, key) {
  const { prefix, rest } = splitKey(key);
  switch (kind) {
    case 'ilgan':
      return [`dayStem:${key}`];
    // 지지 카드 하나가 일지·월지 두 축의 근거가 된다.
    case 'jiji':
      return [`dayBranch:${key}`, `monthBranch:${key}`];
    case 'sipsin': {
      const group = TEN_GOD_GROUP[key];
      return group === undefined ? [`sipsin:${key}`] : [`sipsin:${key}`, `tenGod:${group}`];
    }
    case 'unseong':
      return [`unseong:${key}`];
    case 'sinsal':
      return [`sinsal:${key}`];
    case 'yongsin':
      if (prefix === '격국') return [`geokguk:${rest}`];
      if (prefix === '신강지수') return [`strengthGrade:${rest}`];
      // `억부:木:신강` — 일간 오행 × 신강신약 조합. 엔진 v1 은 신강신약을 내지 않아 아직 조회되지 않는다.
      if (prefix === '억부') return [`yongsinBufu:${rest}`];
      if (prefix === '용신5법') {
        const route = YONGSIN_ROUTE[rest];
        return route === undefined ? [`yongsinMethod:${rest}`] : [`yongsinRoute:${route}`];
      }
      return [`yongsin:${key}`];
    case 'daewoon':
      if (prefix === '관계') return [`ganjiRelation:${rest}`];
      if (prefix === '방향') return [`daewoonDirection:${rest}`];
      return [`daewoonNote:${rest}`];
    case 'zodiac':
      if (prefix === '원소') return [`zodiacElement:${rest}`];
      return [`zodiac:${key}`];
    case 'mbti': {
      if (prefix === '인지기능') {
        const types = MBTI_TYPES_BY_FUNCTION.get(rest);
        expect(types !== undefined && types.length > 0, `인지기능 ${rest} 을 스택에 가진 유형이 없다`);
        return [`mbtiFunction:${rest}`, ...types.map((code) => `mbti:${code}`)];
      }
      if (prefix === '축') {
        const pos = MBTI_AXIS[rest];
        if (pos === undefined) fail(`알 수 없는 MBTI 축: ${key}`);
        return [...rest].map((letter) => `mbtiAxis:${pos}${letter}`);
      }
      return [`mbti:${key}`];
    }
    case 'blood':
      // 혈액형 본카드와 문체 카드는 같은 축을 쓴다 — 둘 다 그 혈액형일 때 근거가 된다.
      if (prefix === '문체') return [`blood:${rest}`];
      if (key === '면책') return ['bloodDisclaimer:all'];
      return [`blood:${key}`];
    case 'fusion':
      if (prefix === '오행MBTI') {
        // 카드 key 는 문서10 §2.1 표기(`목(木)`)지만 태그 값은 **엔진 표기**(`木`)다.
        // 팩트팩이 주는 오행은 엔진 유니온 `Element` 라, 한글 라벨을 태그로 쓰면 질의가 영영 안 맞는다.
        const hanja = /\(([木火土金水])\)$/.exec(rest)?.[1];
        expect(hanja !== undefined, `오행MBTI key 에서 오행 한자를 못 읽음: ${rest}`);
        return [`fusionElement:${hanja}`];
      }
      if (prefix === '일치도') return [`fusionShape:${rest}`];
      if (prefix === '충돌') return [`fusionConflict:${rest}`];
      if (prefix === '카피') return [`fusionCopy:${rest}`];
      return [`fusionNote:${rest}`];
    default:
      return fail(`태그 규칙이 없는 kind: ${kind}`);
  }
}

/**
 * @param {{kind:string,key:string,title:string,summary:string,keywords:string[],
 *          detail:string,doc:string,section:string,confidence:'A'|'B'|'C'|'D'}} c
 */
function add(c) {
  const id = `${c.kind}:${c.key}`;
  if (cards.some((x) => x.id === id)) fail(`duplicate card id: ${id}`);
  const keywords = [...new Set(c.keywords.map((k) => clean(k)).filter(Boolean))];
  const tags = [...new Set(tagsOf(c.kind, c.key))].sort();
  expect(tags.length > 0, `태그가 없는 카드: ${id}`);
  for (const t of tags) expect(/^[A-Za-z]+:.+$/.test(t), `태그 형식 위반(축:값): ${id} → ${t}`);
  cards.push({
    id,
    kind: c.kind,
    key: c.key,
    title: c.title,
    summary: c.summary,
    keywords,
    detail: c.detail.trim(),
    tags,
    source: { doc: c.doc, section: c.section },
    confidence: c.confidence,
  });
}

const L = (...xs) => xs.filter(Boolean).join('\n');
const splitList = (s) =>
  String(s)
    .split(/[,·、/]/)
    .map((x) => clean(x))
    .filter(Boolean);

/* ══════════════════════════════ 1. 일간 (10) ══════════════════════════════ */

function buildIlgan() {
  const s11 = section('C03', '### 1.1 천간(天干)');
  const gan = tableWith(s11, 'idx', '한자', '오행').rows;
  expect(gan.length === 10, `C03 §1.1 천간 10행이어야 함 (got ${gan.length})`);

  const sinsalJson = jsonFence(section('C04', '### 7-13.'), 0);
  const byStem = sinsalJson.byDayStem;
  expect(byStem && Object.keys(byStem).length === 9, 'C04 §7-13 byDayStem 9종이어야 함');

  const eokbu = tableWith(section('C05', '### 5.2 억부용신 결정표'), '일간오행', '인성').rows;
  expect(eokbu.length === 5, `C05 §5.2 5행이어야 함 (got ${eokbu.length})`);
  const eokbuBy = new Map(eokbu.map((r) => [r[0], r]));

  // doc10 §2.2 — 대중 매핑(학술 근거 없음). 톤 재료로만 쓴다.
  const mbtiMap = tableWith(section('R10', '### 2.2 일간(日干)'), '일간', 'MBTI').rows;
  expect(mbtiMap.length === 10, `10 §2.2 10행이어야 함 (got ${mbtiMap.length})`);

  const ELEM_KO = { 木: '목', 火: '화', 土: '토', 金: '금', 水: '수' };

  gan.forEach((row, i) => {
    const [, hanja, ko, element, yinyang, direction] = row;
    const label = mbtiMap[i][0]; // "갑목 🍀"
    const mbtiList = splitList(mbtiMap[i][1]);
    expect(mbtiList.length === 6, `10 §2.2 ${hanja} MBTI 6종이어야 함`);

    const er = eokbuBy.get(element);
    const [, inseong, bigyeop, siksang, jaeseong, gwanseong, weakOrder, strongOrder] = er;

    const hits = Object.entries(byStem)
      .map(([name, m]) => (m[hanja]?.length ? `${name} ${m[hanja].join('·')}` : null))
      .filter(Boolean);

    add({
      kind: 'ilgan',
      key: hanja,
      title: `${hanja}(${ko}) — ${ELEM_KO[element]}${yinyang === '陽' ? '(양)' : '(음)'}`,
      summary: `${hanja}(${ko}) 일간은 ${element}(${ELEM_KO[element]}) 기운의 ${yinyang} 천간이고 방위는 ${direction}이다.`,
      keywords: [hanja, ko, `${ko}${ELEM_KO[element]}`, element, ELEM_KO[element], yinyang, '일간', '일주', label.replace(/[^가-힣]/g, '')],
      detail: L(
        `오행 ${element} / 음양 ${yinyang} / 방위 ${direction} (C03 §1.1).`,
        `오행 역할 — 인성 ${inseong}, 비겁 ${bigyeop}, 식상 ${siksang}, 재성 ${jaeseong}, 관성 ${gwanseong} (C05 §5.2).`,
        `억부 방향 — 신약(SI<45)이면 ${weakOrder}, 신강(SI≥55)이면 ${strongOrder} 순으로 용신을 잡는다 (C05 §5.2).`,
        `일간 기준 신살 자리 — ${hits.join(' / ')} (C04 §7-13).`,
        `[대중 매핑·학술 근거 없음] 일간-MBTI 통용 배정: ${mbtiList.join(', ')} (10 §2.2). 부스트 가점 재료로만 쓰고 "연구 결과"로 표기하지 말 것.`,
      ),
      doc: 'C03-사주-네기둥-산출-공식.md',
      section: '§1.1 (+ C04 §7-13, C05 §5.2, 10 §2.2)',
      confidence: 'B',
    });
  });
}

/* ══════════════════════════════ 2. 지지 (12) ══════════════════════════════ */

function buildJiji() {
  const zhi = tableWith(section('C03', '### 1.2 지지(地支)'), 'idx', '띠').rows;
  expect(zhi.length === 12, `C03 §1.2 12행이어야 함 (got ${zhi.length})`);

  const hidden = tableWith(section('C03', '### 8.1 인원사령분야표'), '여기(餘氣)', '정기(正氣)').rows;
  expect(hidden.length === 12, `C03 §8.1 12행이어야 함 (got ${hidden.length})`);

  const gung = jsonFence(section('R06', '## B-5. 서양 12궁'), 0).zodiacToEarthlyBranch;
  const byBranch = new Map(gung.map.map((m) => [m.branch, m]));

  zhi.forEach((row, i) => {
    const [, hanja, ko, element, yinyang, ddi, hourRange, monthCol] = row;
    const h = hidden[i];
    expect(h[1] === hanja, `C03 §8.1 순서 불일치: ${h[1]} !== ${hanja}`);
    const parts = [];
    if (h[2] !== '—') parts.push(`여기 ${h[2]} ${h[3]}일`);
    if (h[4] !== '—') parts.push(`중기 ${h[4]} ${h[5]}일`);
    parts.push(`정기 ${h[6]} ${h[7]}일`);

    const g = byBranch.get(hanja);
    add({
      kind: 'jiji',
      key: hanja,
      title: `${hanja}(${ko}) — ${ddi}띠`,
      summary: `${hanja}(${ko})는 ${element} 기운의 ${yinyang} 지지이고 ${ddi}띠, 절기월로 ${monthCol}에 해당한다.`,
      keywords: [hanja, ko, ddi, `${ddi}띠`, element, yinyang, '지지', '띠'],
      detail: L(
        `오행 ${element} / 음양 ${yinyang}(순서 기준) / 띠 ${ddi} / 진태양시 ${hourRange} / 절기월 ${monthCol} (C03 §1.2).`,
        `지장간 — ${parts.join(', ')} (C03 §8.1 인원사령분야). 亥의 戊는 유파 편차가 커서 표시만 하고 오행 점수에서는 제외한다.`,
        g ? `전통 천문 방위 대응 서양 12궁 — ${g.hanja} ${g.sign} (06 §B-5). 방위 대응이며 "띠=별자리" 대응이 아니다.` : '',
      ),
      doc: 'C03-사주-네기둥-산출-공식.md',
      section: '§1.2 §8.1 (+ 06 §B-5)',
      confidence: 'A',
    });
  });
}

/* ══════════════════════════════ 3. 십신 (10) ══════════════════════════════ */

function buildSipsin() {
  const data = jsonFence(section('C04', '## 4. 십신 해석 데이터'), 0);
  const names = Object.keys(data);
  expect(names.length === 10, `C04 §4 십신 10종이어야 함 (got ${names.length})`);

  // 10 §2.3 — 한국어 위키 「십성」 서술. 정의 근거로 병기한다.
  const wiki = tableWith(section('R10', '### 2.3 십신(十神)'), '십성', '위키 서술').rows;
  const wikiBy = new Map(wiki.map((r) => [r[0], r]));

  for (const name of names) {
    const d = data[name];
    const w = wikiBy.get(name);
    const axis = Object.entries(d.score_axis ?? {})
      .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
      .join(', ');
    add({
      kind: 'sipsin',
      key: name,
      title: `${name}(${d.hanja})${d.alias ? ` · ${d.alias}` : ''} — ${d.group}`,
      summary: `${name}은 ${d.group} 그룹의 ${d.polarity} 십신으로, ${d.keywords.slice(0, 3).join('·')}의 성향을 나타낸다.`,
      keywords: [name, d.hanja, d.group, ...(d.alias ? [d.alias] : []), ...d.keywords],
      detail: L(
        `성격 — ${d.personality.join(' / ')}`,
        `강점 — ${d.positive.join(', ')} · 주의 — ${d.negative.join(', ')}`,
        `육친 — 남 ${d['육친']['남']} / 여 ${d['육친']['여']}`,
        `직업 재료 — ${d['직업'].join(', ')}`,
        axis ? `점수 축 — ${axis}` : '',
        w ? `[위키 정의] ${w[1]} · 오행관계 ${w[2]} · 음양 ${w[3]} — "${w[4]}" (10 §2.3).` : '',
      ),
      doc: 'C04-십신-십이운성-신살-판정-룩업테이블.md',
      section: '§4 (+ 10 §2.3)',
      confidence: 'C',
    });
  }
}

/* ══════════════════════════════ 4. 십이운성 (12) ══════════════════════════════ */

function buildUnseong() {
  const data = jsonFence(section('C04', '### 5-4. 십이운성 해석 데이터'), 0);
  const names = Object.keys(data);
  expect(names.length === 12, `C04 §5-4 12종이어야 함 (got ${names.length})`);
  const TONE_KO = { positive: '상승', mixed: '혼재', negative: '하강' };

  for (const name of names) {
    const d = data[name];
    add({
      kind: 'unseong',
      key: name,
      title: `${name} — ${d.stage}단계 (에너지 ${d.energy})`,
      summary: `${name}은 십이운성 ${d.stage}번째 자리로 에너지 ${d.energy}/100, 기운 흐름은 ${TONE_KO[d.tone]}이다.`,
      keywords: [name, '십이운성', '십이장생', TONE_KO[d.tone], ...d.keywords],
      detail: L(
        `키워드 — ${d.keywords.join(', ')}`,
        `에너지 ${d.energy}/100 (C04 §12-4 unseongEnergy 가중: 연 0.8 / 월 1.2 / 일 1.5 / 시 1.0).`,
        `본 앱은 거법(일간 기준)으로 4지지의 십이운성을 산출하고 봉법(각주 천간 기준)은 상세보기에 부기한다 (C04 §5-5). 음간 역행(A안) 채택.`,
      ),
      doc: 'C04-십신-십이운성-신살-판정-룩업테이블.md',
      section: '§5-4 §5-5 §12-4',
      confidence: 'C',
    });
  }
}

/* ══════════════════════════════ 5. 신살 (12 + 길신/흉신) ══════════════════════════════ */

/** C04 §12-1 SINSAL_SCORE — 신살별 길흉 가중치(원문 파싱) */
function sinsalScores() {
  const js = fences(section('C04', '## 12. 앱 점수화 연결 규격'), 'js')[0] ?? fail('C04 §12 js fence 없음');
  const body = js.match(/const SINSAL_SCORE = \{([\s\S]*?)\};/);
  if (!body) fail('C04 §12-1 SINSAL_SCORE 블록을 찾지 못함');
  const map = new Map();
  for (const m of body[1].matchAll(/([가-힣]+)\s*:\s*([+-]?\d+)/g)) map.set(m[1], Number(m[2]));
  expect(map.size === 30, `C04 §12-1 신살 30종이어야 함 (got ${map.size})`);
  return map;
}

const toneOf = (score) => (score > 0 ? '길신' : score < 0 ? '흉신' : '중립');

function buildSinsal12(scores) {
  const data = jsonFence(section('C04', '### 6-4. 12신살 해석 데이터'), 0);
  const names = Object.keys(data);
  expect(names.length === 12, `C04 §6-4 12종이어야 함 (got ${names.length})`);

  for (const name of names) {
    const d = data[name];
    const score = scores.get(name);
    expect(score !== undefined, `C04 §12-1 에 ${name} 점수 없음`);
    add({
      kind: 'sinsal',
      key: name,
      title: `${name}(${d.hanja})${d.alias ? ` · ${d.alias}` : ''} — 십이신살`,
      summary: `${name}은 십이신살 중 ${d.tone}에 속하며 ${d.keywords.slice(0, 3).join('·')}를 뜻한다.`,
      keywords: [name, d.hanja, ...(d.alias ? d.alias.split('/') : []), '십이신살', toneOf(score), ...d.keywords],
      detail: L(
        `키워드 — ${d.keywords.join(', ')}`,
        `길흉 ${d.tone} / 점수 ${score > 0 ? '+' : ''}${score} (C04 §6-4, §12-1). 기둥 가중 연 0.8 · 월 1.2 · 일 1.5 · 시 1.0.`,
        `판정 — 삼합국 墓地 다음 지지에서 시작하는 12칸 순환. 연지 기준·일지 기준 둘 다 산출한다 (C04 §6-1, tables.json twelveSinsal).`,
      ),
      doc: 'C04-십신-십이운성-신살-판정-룩업테이블.md',
      section: '§6-4 §12-1',
      confidence: 'C',
    });
  }
}

/** 길신/흉신 — 이름·한자·문서 절은 C04 heading 으로 검증하고, 규칙/유파는 tables.json 에서 가져온다. */
const GILSIN_HYUNGSIN = [
  { name: '천을귀인', hanja: '天乙貴人', c04: '### 7-1.', tbl: 'cheoneulGwiin' },
  { name: '문창귀인', hanja: '文昌貴人', c04: '### 7-2.', tbl: 'munchangGwiin' },
  { name: '학당귀인', hanja: '學堂貴人', c04: '### 7-3.', tbl: 'hakdangGwiin' },
  { name: '건록', hanja: '建祿', c04: '### 7-4.', tbl: 'geonrok' },
  { name: '금여', hanja: '金輿', c04: '### 7-4.', tbl: 'geumyeo' },
  { name: '암록', hanja: '暗祿', c04: '### 7-4.', tbl: 'amrok' },
  { name: '홍염살', hanja: '紅艷煞', c04: '### 7-5.', tbl: 'hongyeom' },
  { name: '양인살', hanja: '羊刃', c04: '### 7-7.', tbl: 'yangin' },
  { name: '비인살', hanja: '飛刃', c04: '### 7-7.', tbl: 'biin' },
  { name: '백호대살', hanja: '白虎大殺', c04: '### 7-8.', tbl: 'baekhoDaesal' },
  { name: '괴강', hanja: '魁罡', c04: '### 7-8.', tbl: 'goegang' },
  { name: '공망', hanja: '空亡', c04: '### 7-9.', tbl: 'gongmang' },
  { name: '원진', hanja: '元嗔', c04: '### 7-10.', tbl: 'branchRelations' },
  { name: '귀문관살', hanja: '鬼門關殺', c04: '### 7-10.', tbl: 'branchRelations' },
  { name: '고신', hanja: '孤辰', c04: '### 7-12.', tbl: 'gosinGwasuk' },
  { name: '과숙', hanja: '寡宿', c04: '### 7-12.', tbl: 'gosinGwasuk' },
  { name: '천덕귀인', hanja: '天德貴人', c04: '### 7-13.', tbl: 'cheondeokGwiin' },
  { name: '월덕귀인', hanja: '月德貴人', c04: '### 7-13.', tbl: 'woldeokGwiin' },
];

function buildGilsinHyungsin(scores, tbls) {
  for (const g of GILSIN_HYUNGSIN) {
    const head = section('C04', g.c04).split('\n')[0];
    expect(head.includes(g.hanja) || g.c04 === '### 7-13.', `C04 ${g.c04} 제목에 ${g.hanja} 없음: ${head}`);
    const t = tbls[g.tbl] ?? fail(`tables.json 에 ${g.tbl} 없음`);
    const score = scores.get(g.name);
    expect(score !== undefined, `C04 §12-1 에 ${g.name} 점수 없음`);
    const tone = toneOf(score);

    add({
      kind: 'sinsal',
      key: g.name,
      title: `${g.name}(${g.hanja}) — ${tone}`,
      summary: `${g.name}은 ${tone}으로 분류되며 점수 가중은 ${score > 0 ? '+' : ''}${score}이다.`,
      keywords: [g.name, g.hanja, tone, '신살', ...(tone === '길신' ? ['길운', '귀인'] : tone === '흉신' ? ['주의', '살'] : [])],
      detail: L(
        t._rule ? `판정 규칙 — ${clean(t._rule)}` : '',
        `근거 — ${clean(String(t._source)).slice(0, 320)}`,
        `근거 등급(tables.json) — ${t._confidence}`,
        t._diff ? `⚠️유파차이 — ${clean(t._diff)}` : '',
        `점수 ${score > 0 ? '+' : ''}${score}, 기둥 가중 연 0.8 · 월 1.2 · 일 1.5 · 시 1.0 (C04 §12).`,
        `해석 문구는 이 카드의 길흉·규칙만 근거로 쓰고, 원문에 없는 구체 사건(질병·사고 등) 단정은 금지한다.`,
      ),
      doc: 'C04-십신-십이운성-신살-판정-룩업테이블.md',
      section: `${g.c04.replace(/[#\s.]/g, '').replace('7-', '§7-')} §12-1 (+ tables.json ${g.tbl})`,
      confidence: 'B',
    });
  }
}

/* ══════════════════════════════ 6. 용신·격국·신강신약 ══════════════════════════════ */

function buildYongsin() {
  // 6-1. SI 등급 7
  const s43 = section('C05', '### 4.3 C05-STD 확정');
  const grades = tableWith(s43, '등급', '인구 비중').rows;
  expect(grades.length === 7, `C05 §4.3 등급 7행이어야 함 (got ${grades.length})`);
  for (const [range, grade, share] of grades) {
    add({
      kind: 'yongsin',
      key: `신강지수:${grade}`,
      title: `신강지수 ${grade} (${range})`,
      summary: `신강지수(SI) ${range} 구간은 ${grade}이며 설계상 전 인구의 ${share}에 해당한다.`,
      keywords: [grade, '신강', '신약', '신강지수', 'SI', '중화'],
      detail: L(
        `SI 구간 ${range} / 등급 ${grade} / 설계 인구 비중 ${share} (C05 §4.3).`,
        `SI 는 오행 점수비 R 의 전수분포 백분위이므로 "상위 N%" 서술이 실제로 참이 된다. 0~100 게이지 UI 로 그대로 쓸 수 있다.`,
        `용신 분기는 isStrong = (SI ≥ 55), 억부 중립 밴드는 45 ≤ SI < 55.`,
      ),
      doc: 'C05-신강신약-오행점수-용신도출-정량알고리즘.md',
      section: '§4.3',
      confidence: 'A',
    });
  }

  // 6-2. 억부용신 방향 (5오행 × 신약/신강)
  const eokbu = tableWith(section('C05', '### 5.2 억부용신 결정표'), '일간오행', '인성').rows;
  const ELEM_KO = { 木: '목', 火: '화', 土: '토', 金: '금', 水: '수' };
  for (const r of eokbu) {
    const [el, inseong, bigyeop, siksang, jaeseong, gwanseong, weak, strong] = r;
    for (const [mode, order, gisin] of [
      ['신약', weak, `관성 ${gwanseong}·재성 ${jaeseong}`],
      ['신강', strong, `인성 ${inseong}·비겁 ${bigyeop}`],
    ]) {
      add({
        kind: 'yongsin',
        key: `억부:${el}:${mode}`,
        title: `${el}(${ELEM_KO[el]}) 일간 · ${mode} — 용신 ${order}`,
        summary: `${el} 일간이 ${mode}이면 억부용신은 ${order} 순이고, 기신은 ${gisin}이다.`,
        keywords: [el, ELEM_KO[el], mode, '억부', '용신', '기신', '희신'],
        detail: L(
          `오행 역할 — 인성 ${inseong} / 비겁 ${bigyeop} / 식상 ${siksang} / 재성 ${jaeseong} / 관성 ${gwanseong}.`,
          `${mode} 용신 순서 — ${order}. 기신 — ${gisin}.`,
          `중립 밴드(45 ≤ SI < 55)에서는 조후표 1순위 글자의 오행을 용신으로 삼아 교착을 푼다 (C05 §5.2).`,
        ),
        doc: 'C05-신강신약-오행점수-용신도출-정량알고리즘.md',
        section: '§5.2',
        confidence: 'B',
      });
    }
  }

  // 6-3. 용신 5법(五道關)
  const gates = tableWith(section('C05', '### 5.1 5법 우선순위'), '관', '발동 조건').rows;
  expect(gates.length === 5, `C05 §5.1 5행이어야 함 (got ${gates.length})`);
  for (const [gate, name, cond, result] of gates) {
    add({
      kind: 'yongsin',
      key: `용신5법:${name}`,
      title: `용신 5법 ${gate} — ${name}`,
      summary: `${name}은 용신 도출 ${gate}로, ${cond}일 때 발동해 ${result}가 된다.`,
      keywords: [name, '용신', '5법', '五道關', gate],
      detail: L(
        `발동 조건 — ${cond}`,
        `결과 — ${result}`,
        `C05-STD 순서: 종격 > 조후(급증 시만) > 억부 > 격국 > 병약. 상위 관문이 정해지면 하위는 세부화만 하고 뒤집지 않는다.`,
      ),
      doc: 'C05-신강신약-오행점수-용신도출-정량알고리즘.md',
      section: '§5.1',
      confidence: 'B',
    });
  }

  // 6-4. 격국 순용/역용
  const geok = tableWith(section('C05', '### 6.3 격국별 순용/역용'), '격', '유형').rows;
  expect(geok.length === 10, `C05 §6.3 10행이어야 함 (got ${geok.length})`);
  for (const [name, type, hui, gi] of geok) {
    add({
      kind: 'yongsin',
      key: `격국:${name}`,
      title: `${name} — ${type === '—' ? '중립' : type}`,
      summary: `${name}은 ${type === '—' ? '순용/역용 구분 없이 국중 타신을 취용하는 격' : `${type} 격`}이며, 희신은 ${hui}이다.`,
      keywords: [name, '격국', type === '—' ? '건록양인' : type, '상신'],
      detail: L(
        `유형 — ${type}`,
        `희(喜)=상신 — ${hui}`,
        `기(忌) — ${gi}`,
        `격 판정은 월지 지장간의 투출(본기>중기>여기 → 투출 횟수 → 월간>시간>년간)로 결정한다. 일간은 투출 대상에서 제외 (C05 §6.1).`,
      ),
      doc: 'C05-신강신약-오행점수-용신도출-정량알고리즘.md',
      section: '§6.3 (+ §6.1)',
      confidence: 'B',
    });
  }
}

/* ══════════════════════════════ 7. 대운·세운 ══════════════════════════════ */

function buildDaewoon() {
  // 7-1. 순행/역행 4조합
  const dir = tableWith(section('C06', '## 3. 대운 순행/역행 판정표'), '연간 음양', '통칭').rows;
  expect(dir.length === 4, `C06 §3 4행이어야 함 (got ${dir.length})`);
  for (const [, yy, gender, label, direction, progress, gate] of dir) {
    add({
      kind: 'daewoon',
      key: `방향:${label}`,
      title: `${label} — 대운 ${direction}`,
      summary: `${label}(연간 ${yy}, ${gender})은 대운이 ${direction}하며 대운수는 ${gate} 기준으로 잡는다.`,
      keywords: [label, direction, gender, '대운', '순행', '역행', '대운수'],
      detail: L(
        `판정 기준은 연간(年干)의 음양 × 성별이다. 연지가 아니다. 그 연간은 입춘으로 확정된 사주년의 것이다.`,
        `간지 진행 — ${progress} / 절기 기준 — ${gate}.`,
        `방향이 뒤집히면 대운 간지 전체가 완전히 달라지므로 성별 입력은 필수다 (C06 §3).`,
      ),
      doc: 'C06-대운-세운-월운-계산.md',
      section: '§3',
      confidence: 'A',
    });
  }

  // 7-2. 합충 이벤트 가중치 (C06 §7.3 원문 파싱)
  const js = fences(section('C06', '### 7.3 판정 알고리즘'), 'js')[0] ?? fail('C06 §7.3 js fence 없음');
  const evts = [];
  for (const m of js.matchAll(/type:\s*'([^']+)'[^}]*?weight:\s*([+-]?\d+)/g)) {
    if (!evts.some((e) => e.type === m[1])) evts.push({ type: m[1], weight: Number(m[2]) });
  }
  expect(evts.length === 15, `C06 §7.3 이벤트 15종이어야 함 (got ${evts.length}: ${evts.map((e) => e.type)})`);
  for (const e of evts) {
    const tone = e.weight > 0 ? '순(順)' : '역(逆)';
    add({
      kind: 'daewoon',
      key: `관계:${e.type}`,
      title: `${e.type} — 가중 ${e.weight > 0 ? '+' : ''}${e.weight}`,
      summary: `${e.type}은 운과 원국 사이의 ${tone} 작용으로 합충 점수에 ${e.weight > 0 ? '+' : ''}${e.weight}만큼 기여한다.`,
      keywords: [e.type, '합충', '대운', '세운', tone, e.weight > 0 ? '길' : '흉'],
      detail: L(
        `가중치 ${e.weight > 0 ? '+' : ''}${e.weight} (C06 §7.3). 합충 합계는 ±25 로 클램프된다.`,
        `운 점수 = clamp(0,100, 50 + 용신부합(천간 ±12 / 지지 ±18) + clamp(-25,+25, Σ합충)) (C06 §7.4).`,
        `지지 가중이 천간의 1.5배인 것은 "지지 중심" 유파를 수치로 반영한 것이다.`,
      ),
      doc: 'C06-대운-세운-월운-계산.md',
      section: '§7.3 §7.4',
      confidence: 'B',
    });
  }

  // 7-3. 서술 규칙 카드 2장 (나이 기준 / 5년 분할)
  add({
    kind: 'daewoon',
    key: '서술:나이기준',
    title: '대운 나이 표기 — 만나이 기본 + 연도 병기',
    summary: '대운 구간은 만나이(周歲)를 기본으로 표기하고 세는나이(虛歲)와 연도 범위를 함께 보관한다.',
    keywords: ['대운', '나이', '만나이', '세는나이', '연도', '교운'],
    detail: L(
      `만나이(출생 시 0세)와 세는나이(출생 시 1세)는 유파가 갈린다. 대운수 3인 사람의 첫 대운이 3~12세 / 4~13세로 달라진다.`,
      `본 앱 결정 — 내부에는 startAgeWestern·startAgeKorean 둘 다 보관, UI 기본은 만나이 + 연도 범위 병기. 연도 범위는 두 유파가 동일해 분쟁 소지가 없다 (C06 §5.2).`,
      `index 0(교운 전 구간)은 대운 미도래 구간이다. 표기 방식이 유파별로 셋(미표기 / 월주 / 소운)이다.`,
    ),
    doc: 'C06-대운-세운-월운-계산.md',
    section: '§5.2',
    confidence: 'B',
  });
  add({
    kind: 'daewoon',
    key: '서술:5년분할',
    title: '대운 5년 분할 — 텍스트 뉘앙스로만',
    summary: '앞 5년 천간 / 뒤 5년 지지 분할은 점수에 반영하지 않고 서술 뉘앙스로만 쓴다.',
    keywords: ['대운', '5년', '천간', '지지', '개두', '절각'],
    detail: L(
      `본 앱은 지지 가중 0.6 / 천간 가중 0.4 로 10년 전체를 단일 점수화하고, 5년 분할은 텍스트 뉘앙스로만 처리해 점수를 흔들지 않는다 (C06 §5.3).`,
      `"기계적인 앞5년=천간" 규칙은 실측 자료에서 4대 오류 중 하나로 지목된다. 단정적 서술을 피할 것.`,
    ),
    doc: 'C06-대운-세운-월운-계산.md',
    section: '§5.3',
    confidence: 'B',
  });
}

/* ══════════════════════════════ 8. 별자리 ══════════════════════════════ */

function buildZodiac(pd) {
  const t = tableWith(section('C07', '### 0.1 12궁 매핑 테이블'), '황경 구간', '지배성').rows;
  expect(t.length === 12, `C07 §0.1 12행이어야 함 (got ${t.length})`);
  expect(pd.zodiacSigns.length === 12, 'personality-data zodiacSigns 12개여야 함');

  // 방위 대응표는 branchKo 까지 실린 06 §B-5 JSON 을 정본으로 쓴다(personality-data 판은 branchKo 없음).
  const branchMap = new Map(
    jsonFence(section('R06', '## B-5. 서양 12궁'), 0).zodiacToEarthlyBranch.map.map((m) => [m.sign, m]),
  );
  expect(branchMap.size === 12, '06 §B-5 방위 대응 12행이어야 함');
  expect(
    pd.zodiacToEarthlyBranch.map[[...branchMap.keys()][0]].branch === branchMap.get([...branchMap.keys()][0]).branch,
    '06 §B-5 와 personality-data.json 의 방위 대응이 어긋난다',
  );
  const ELEM_KO = { fire: '불', earth: '흙', air: '공기', water: '물' };
  const MODAL_KO = { cardinal: '활동(Cardinal)', fixed: '고정(Fixed)', mutable: '변통(Mutable)' };

  pd.zodiacSigns.forEach((z, i) => {
    const row = t[i];
    expect(row[3] === z.ko, `C07 §0.1 순서 불일치: ${row[3]} !== ${z.ko}`);
    const g = branchMap.get(z.id);
    add({
      kind: 'zodiac',
      key: z.id,
      title: `${z.ko} ${z.glyph} (${z.en})`,
      summary: `${z.ko}는 황경 ${z.lonStart}°~${z.lonEnd}° 구간의 ${ELEM_KO[z.element]} 원소 · ${MODAL_KO[z.modality]} 사인이며 지배행성은 ${row[6]}이다.`,
      keywords: [z.ko, z.en, z.id, ELEM_KO[z.element], z.element, z.modality, z.symbolKo, '별자리', '태양궁'],
      detail: L(
        `황경 [${z.lonStart}°, ${z.lonEnd}°) · 통용 날짜 ${z.startMMDD} ~ ${z.endMMDD} (경계일은 해마다 최대 ±1일 흔들린다. 실제 판정은 황경 계산으로 한다).`,
        `원소 ${ELEM_KO[z.element]} / 특질 ${MODAL_KO[z.modality]} / 극성 ${z.polarity} / 지배행성 ${row[6]} (현대 ${z.rulerModern} · 전통 ${z.rulerTraditional}) / 상징 ${z.symbolKo}.`,
        g ? `전통 천문 방위 대응 — ${g.hanja}, 12지 ${g.branch}(${g.branchKo}). 방위 대응이며 띠 대응이 아니다 (06 §B-5).` : '',
        `별자리는 사주 월지를 약 15일 시프트한 동일 12분할이다. "새로운 정보"가 아니라 서양식 어휘 레이어로 쓴다 (10 §2.6).`,
      ),
      doc: 'calc/personality-data.json',
      section: 'zodiacSigns (+ C07 §0.1, 06 §B-5, 10 §2.6)',
      confidence: 'B',
    });
  });

  // 4원소 카드 — 융 4기능 매핑(10 §2.4 (가))
  const s24 = section('R10', '### 2.4 별자리 4원소');
  const mapT = tableWith(s24, '매핑 출처', '불(Fire)');
  const jung = mapT.rows.find((r) => r[0].includes('(가)')) ?? fail('10 §2.4 (가) 행 없음');
  const ELEMS = [
    ['fire', '불', jung[1]],
    ['earth', '흙', jung[2]],
    ['air', '공기', jung[3]],
    ['water', '물', jung[4]],
  ];
  for (const [id, ko, mbtiFn] of ELEMS) {
    const signs = pd.zodiacSigns.filter((z) => z.element === id).map((z) => z.ko);
    add({
      kind: 'zodiac',
      key: `원소:${id}`,
      title: `${ko} 원소(${id}) — MBTI ${mbtiFn}`,
      summary: `${ko} 원소 사인은 ${signs.join('·')}이며 융 4기능 매핑으로는 ${mbtiFn}에 대응한다.`,
      keywords: [ko, id, '원소', ...signs, mbtiFn.replace(/[^A-Z]/g, '')],
      detail: L(
        `소속 사인 — ${signs.join(', ')} (같은 원소끼리는 정확히 120° 트라인).`,
        `채택 매핑 — (가) 융 4기능 기반: 불=N, 흙=S, 공기=T, 물=F. MBTI 중간 두 글자와 바로 비교할 수 있어 충돌 서사를 만들기 쉽다 (10 §2.4).`,
        `⚠️ 4원소↔기질(Keirsey/히포크라테스) 대응은 권위 있는 원전이 없고 2차 자료끼리 서로 모순한다. 그 계열 매핑은 쓰지 않는다.`,
      ),
      doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
      section: '§2.4',
      confidence: 'C',
    });
  }
}

/* ══════════════════════════════ 9. MBTI ══════════════════════════════ */

function buildMbti(pd) {
  const t = tableWith(section('R05', '### 1-2. 16유형 통합 데이터 표'), '코드', '핵심 특성 키워드');
  const rows = t.rows.filter((r) => /^[A-Z]{4}$/.test(r[0]));
  expect(rows.length === 16, `05 §1-2 16행이어야 함 (got ${rows.length})`);
  const pdBy = new Map(pd.mbti.types.map((x) => [x.code, x]));

  for (const r of rows) {
    const [code, , alias, krPct, , usRange, usPoint, kw, strong, weak, jobs, love] = r;
    const p = pdBy.get(code) ?? fail(`personality-data 에 ${code} 없음`);
    add({
      kind: 'mbti',
      key: code,
      title: `${code} — ${p.aliasKo}`,
      summary: `${code}는 ${kw}를 핵심 특성으로 하며 인지기능 스택은 ${p.stack.join('-')}이다.`,
      keywords: [code, p.aliasKo, alias, p.temperament, ...splitList(kw), ...p.stack],
      detail: L(
        `인지기능 스택 — 주 ${p.stack[0]} / 부 ${p.stack[1]} / 3차 ${p.stack[2]} / 열등 ${p.stack[3]} (기질 ${p.temperament}).`,
        `강점 — ${strong} · 약점 — ${weak}`,
        `직무 재료 — ${jobs}`,
        `연애 성향 — ${love}`,
        `빈도 — 국내 자가선택 표본 ${krPct} (n=${pd.mbti.krSampleN}, 인구 대표성 없음) / 미국 추정 ${usPoint} (범위 ${usRange}, 원출처 합 100.3%로 불정합 → 정규화 금지).`,
        `⚠️ 16Personalities 별칭("${alias}")은 NERIS 저작물이다. 제품에는 자체 별칭 "${p.aliasKo}"만 노출한다. 본 서비스는 공인 검사를 제공하지 않는다.`,
      ),
      doc: '05-MBTI-데이터와-상표권-리스크.md',
      section: '§1-2 (+ calc/personality-data.json mbti.types)',
      confidence: 'C',
    });
  }

  // 8 인지기능
  const fn = tableWith(section('R05', '### 2-1. 8개 인지기능'), '코드', '한 줄 정의').rows;
  expect(fn.length === 8, `05 §2-1 8행이어야 함 (got ${fn.length})`);

  // 인지기능 → 그 기능이 스택에 들어 있는 16유형. 카드를 굽기 **전에** 채워야 tagsOf 가 읽는다.
  for (const t of pd.mbti.types) {
    for (const f of t.stack) {
      if (!MBTI_TYPES_BY_FUNCTION.has(f)) MBTI_TYPES_BY_FUNCTION.set(f, []);
      MBTI_TYPES_BY_FUNCTION.get(f).push(t.code);
    }
  }
  for (const [f, codes] of MBTI_TYPES_BY_FUNCTION) {
    codes.sort();
    // 16유형 × 4슬롯 = 64, 기능 8종 → 기능마다 정확히 8유형. 어긋나면 스택 데이터가 깨진 것이다.
    expect(codes.length === 8, `인지기능 ${f} 을 스택에 가진 유형이 8개여야 함 (got ${codes.length})`);
  }
  for (const [codeRaw, full, ko, def] of fn) {
    const code = clean(codeRaw);
    add({
      kind: 'mbti',
      key: `인지기능:${code}`,
      title: `${code} ${ko} (${full})`,
      summary: `${code}(${ko})는 ${def}`,
      keywords: [code, ko, full, '인지기능'],
      detail: L(
        `${full} / ${ko} — ${def}`,
        `주기능 판별: E 로 시작하면 마지막 글자(J/P)가 가리키는 기능이 주기능, I 로 시작하면 그 반대쪽이 주기능이다 (05 §2-2).`,
      ),
      doc: '05-MBTI-데이터와-상표권-리스크.md',
      section: '§2-1 §2-2',
      confidence: 'B',
    });
  }

  // 4축
  const ax = tableWith(section('R05', '### 1-1. 4개 지표'), '축', '코드').rows;
  expect(ax.length === 4, `05 §1-1 4행이어야 함 (got ${ax.length})`);
  for (const [axis, code, def] of ax) {
    const letters = code.match(/\b[EISNTFJP]\b/g) ?? [];
    add({
      kind: 'mbti',
      key: `축:${letters.join('')}`,
      title: `${axis} — ${code}`,
      summary: `${axis} 축은 ${def}를 가른다.`,
      keywords: [...letters, axis, '지표', '축'],
      detail: `${code} — ${def} (05 §1-1). 16Personalities 의 5번째 축(A/T)과 축 명칭 매핑은 MBTI 와 다르므로 그대로 베끼지 않는다.`,
      doc: '05-MBTI-데이터와-상표권-리스크.md',
      section: '§1-1',
      confidence: 'B',
    });
  }
}

/* ══════════════════════════════ 10. 혈액형 ══════════════════════════════ */

function buildBlood(pd) {
  const ext = jsonFence(section('R06', '### 앱 투입용 확장 특성 세트'), 0).bloodTypes;
  expect(ext.length === 4, `06 §A-2 4종이어야 함 (got ${ext.length})`);
  const pdBy = new Map(pd.bloodTypes.map((b) => [b.code, b]));

  for (const b of ext) {
    const p = pdBy.get(b.code) ?? fail(`personality-data 에 혈액형 ${b.code} 없음`);
    add({
      kind: 'blood',
      key: b.code,
      title: `${b.labelKo} — ${b.keywords.slice(0, 3).join('·')}`,
      summary: `${b.labelKo}은 한국 통용 서술에서 ${b.keywords.join('·')}으로 표현되며 국내 인구 비중은 약 ${p.krPopulationPct}%다.`,
      keywords: [b.code, b.labelKo, '혈액형', ...b.keywords],
      detail: L(
        `강점 — ${b.strengths.join(', ')} · 약점 — ${b.weaknesses.join(', ')}`,
        `연애 — ${b.loveStyle}`,
        `일 — ${b.workStyle}`,
        `스트레스 — ${b.stressResponse}`,
        `국내 분포 — 대한적십자사 ${p.krPopulationPct}% / 갤럽 자기응답 ${p.krSelfReportedPct}%.`,
        `⚠️ 혈액형 성격론은 대규모 연구(縄田健悟 2014, n=11,729)로 반증됐다. 설계 원칙상 혈액형은 "무엇을 말하는가"가 아니라 "어떻게 말하는가"(문체)만 결정한다 (10 §2.5).`,
      ),
      doc: '06-혈액형-성격론과-서양점성술-별자리-데이터.md',
      section: '§A-2 (+ calc/personality-data.json bloodTypes, 10 §2.5)',
      confidence: 'D',
    });
  }

  // 문체 매핑 (10 §2.5)
  const tone = tableWith(section('R10', '### 2.5 혈액형'), '혈액형', '제품 활용').rows;
  expect(tone.length === 4, `10 §2.5 4행이어야 함 (got ${tone.length})`);
  for (const [code, common, , usage] of tone) {
    add({
      kind: 'blood',
      key: `문체:${code}`,
      title: `${code}형 문체 파라미터`,
      summary: `${code}형 사용자에게는 ${usage.replace(/^문체를?\s*/, '')} 톤으로 서술한다.`,
      keywords: [code, '문체', '톤', '카피', ...splitList(common)],
      detail: L(
        `대중 통념 — ${common} [창작 필요 / 학술 근거 없음]`,
        `제품 활용 — ${usage}`,
        `혈액형은 공통 6축 벡터에 기여하지 않는다(가중치 0). 문체 템플릿 4종으로만 소비해 조합 폭발을 막는다 (10 §3.1).`,
      ),
      doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
      section: '§2.5 §3.1',
      confidence: 'D',
    });
  }

  add({
    kind: 'blood',
    key: '면책',
    title: '혈액형·MBTI·별자리 면책 문구',
    summary: '혈액형 성격론은 반증된 이론이고 MBTI 는 권리자와 무관하며 별자리는 엔터테인먼트 목적임을 명시한다.',
    keywords: ['면책', '디스클레이머', '반증', '주의', '법적'],
    detail: L(
      `혈액형 — ${pd.disclaimer.blood}`,
      `MBTI — ${pd.disclaimer.mbti}`,
      `별자리 — ${pd.disclaimer.zodiac}`,
    ),
    doc: 'calc/personality-data.json',
    section: 'disclaimer',
    confidence: 'A',
  });
}

/* ══════════════════════════════ 11. 융합 서술 전략 ══════════════════════════════ */

function buildFusion() {
  // 11-1. 오행 ↔ MBTI 축
  const ohaeng = tableWith(section('R10', '### 2.1 오행(五行)'), '오행', '학술 근거 매핑').rows;
  expect(ohaeng.length === 5, `10 §2.1 5행이어야 함 (got ${ohaeng.length})`);
  for (const [el, academic, basis, ext, grade] of ohaeng) {
    add({
      kind: 'fusion',
      key: `오행MBTI:${el}`,
      title: `${el} ↔ MBTI 축`,
      summary: `${el} 기운은 ${academic} 경향과 연결되며, 제품에서는 ${ext}로 확장해 서술한다.`,
      keywords: [el, el.replace(/[()]/g, '').slice(1, 2), 'MBTI', '오행', '축', '사영'],
      detail: L(
        `학술 근거 매핑 — ${academic} (근거: ${basis})`,
        `확장 매핑(제품용) — ${ext}`,
        `근거 구분 — ${grade}`,
        `정규화 공식 — E_score=(목+화)/8, I_score=(금+수)/8, S_score=(화+금)/8, EI_saju=E_score−I_score. 자기신고 MBTI 와의 일치/불일치가 서사 재료다 (10 §2.1).`,
      ),
      doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
      section: '§2.1',
      confidence: 'C',
    });
  }

  // 11-2. 일치도 라벨
  const coh = tableWith(section('R10', '### 3.2 일치도 점수'), '구간', '라벨').rows;
  expect(coh.length === 4, `10 §3.2 4행이어야 함 (got ${coh.length})`);
  for (const [range, label, strategy] of coh) {
    add({
      kind: 'fusion',
      key: `일치도:${label.replace(/"/g, '')}`,
      title: `일치도 ${range} — ${label}`,
      summary: `4체계 일치도 ${range} 구간은 ${label}으로 라벨링하고 ${strategy} 전략으로 서술한다.`,
      keywords: [label.replace(/"/g, ''), '일치도', 'coherence', '히어로', range],
      detail: L(
        `서사 전략 — ${strategy}`,
        `Coherence = round(100 × mean(axis_agreement)) — axis_agreement(a) = 1 − 표준편차(saju_a, mbti_a, zodiac_a)/최대표준편차, a ∈ {EI, SN, TF, JP}.`,
        `핵심 원칙: 일치도가 낮아도 부정적으로 읽히지 않게 라벨링한다. 낮은 점수를 "희소하다"로 번역하면 공유 유인이 커진다.`,
      ),
      doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
      section: '§3.2',
      confidence: 'D',
    });
  }

  // 11-3. 충돌 서술 패턴
  const conf = tableWith(section('R10', '### 3.3 충돌(Conflict)'), '충돌 패턴', '문장 템플릿').rows;
  expect(conf.length === 4, `10 §3.3 4행이어야 함 (got ${conf.length})`);
  for (const [pattern, example, strategy, template] of conf) {
    add({
      kind: 'fusion',
      key: `충돌:${pattern}`,
      title: `충돌 서술 — ${pattern}`,
      summary: `${pattern} 충돌은 ${strategy} 프레임으로 번역해 서술한다.`,
      keywords: [pattern, '충돌', '상충', '서사', ...splitList(strategy.replace(/[*"]/g, ''))],
      detail: L(
        `예시 상황 — ${example}`,
        `서술 전략 — ${strategy}`,
        `문장 템플릿 — ${template}`,
        `3원칙: (1) 모순을 결함이 아니라 "층(layer)"으로 번역 (2) 시간축 분리 (3) 상황축 분리. Forer 진술문 구조와 같아 바넘 효과가 가장 강하게 작동하는 형식이다.`,
      ),
      doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
      section: '§3.3',
      confidence: 'D',
    });
  }

  // 11-4. 카피 금지어
  const ban = tableWith(section('R10', '### 6.3 카피 금지어'), '금지', '대체').rows;
  expect(ban.length >= 5, `10 §6.3 5행 이상이어야 함 (got ${ban.length})`);
  add({
    kind: 'fusion',
    key: '카피:금지어',
    title: '카피 금지어 / 대체 표현',
    summary: '단정 예언·의료 유사 표현·과학 참칭·관계 낙인 표현을 금지하고 지정된 대체 표현을 쓴다.',
    keywords: ['금지어', '카피', '가드레일', '규제', '표현', '대체'],
    detail: L(
      ...ban.map(([b, why, alt]) => `"${b}" (${why}) → "${alt}"`),
    ),
    doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
    section: '§6.3',
    confidence: 'B',
  });

  // 11-5. 바넘 4단 구조
  const s62 = section('R10', '### 6.2 좋은 운세 문구의 4단 구조');
  const struct = (fences(s62, '')[0] ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[①②③④]/.test(l));
  expect(struct.length === 4, `10 §6.2 4단 구조를 못 읽음 (got ${struct.length})`);
  add({
    kind: 'fusion',
    key: '카피:4단구조',
    title: '운세 문구 4단 구조',
    summary: '구체적 관찰 → 양가 서술 → 긍정 재해석 → 행동 제안 순으로 문장을 만든다.',
    keywords: ['4단', '구조', '카피', '바넘', 'Forer', '템플릿', '문구'],
    detail: L(
      ...struct,
      `근거 — Forer(1948) n=39, 동일 진술 13개, 정확도 4.30/5.0. 효과 강화 3조건: 개인화 믿음 / 평가자 권위 / 긍정 특성 비율. "at times" 류 양가 표현이 효과를 키운다.`,
      `리포트 전체 긍정:중립:주의 = 6:3:1. "주의" 1할은 반드시 ④ 행동 제안과 세트로 배치한다 (10 §6.4).`,
    ),
    doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
    section: '§6.2 §6.1 §6.4',
    confidence: 'B',
  });

  // 11-6. 가중치
  const w = tableWith(section('R10', '### 3.1 공통 잠재 축'), '축', '가중치').rows;
  expect(w.length === 4, `10 §3.1 4행이어야 함 (got ${w.length})`);
  add({
    kind: 'fusion',
    key: '통합:가중치',
    title: '4체계 통합 가중치와 공통 6축',
    summary: '사주·MBTI·별자리·혈액형을 공통 6축으로 사영한 뒤 정해진 가중치로 합산한다.',
    keywords: ['가중치', '통합', '공통축', '6축', '사영', '융합'],
    detail: L(
      `공통 축 — [EI, SN, TF, JP, 활력(Yang), 안정(Stability)], 각 −1.0 ~ +1.0.`,
      ...w.map(([axis, weight, basis]) => `${axis} — ${weight} (${basis})`),
      `MBTI 가중치를 낮추면 안 되는 이유: 사용자가 스스로 입력한 값과 결과가 어긋나면 즉시 이탈한다. 자기신고 축이 정확도 체감의 앵커다.`,
    ),
    doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
    section: '§3.1',
    confidence: 'D',
  });

  // 11-7. 교집합 배지
  add({
    kind: 'fusion',
    key: '통합:교집합',
    title: '4체계 공통 키워드 배지',
    summary: '각 체계에서 키워드 3개씩 뽑아 클러스터링하고, 2개 이상 체계에 등장한 태그만 N/4 배지로 노출한다.',
    keywords: ['교집합', '공통키워드', '배지', 'intersection', '신뢰'],
    detail: L(
      `각 체계에서 키워드 3개씩(총 12개) 추출 → 사전 정의 태그 온톨로지로 클러스터링 → 2개 이상 체계에서 등장한 태그만 노출, 등장 체계 수를 배지로 표시.`,
      `예) #추진력 [사주·MBTI·별자리 3/4] · #신중함 [사주·혈액형 2/4].`,
      `사용자가 가장 놀라는 지점은 "서로 다른 4개가 같은 말을 했다"는 부분이다. N/4 배지는 근거의 중첩을 시각화한다 (10 §3.4).`,
    ),
    doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
    section: '§3.4',
    confidence: 'D',
  });

  // 11-8. 별자리 중복성 경고
  add({
    kind: 'fusion',
    key: '통합:별자리중복',
    title: '별자리 ↔ 사주 월지 중복성 경고',
    summary: '별자리는 월지를 약 15일 시프트한 동일 12분할이므로 새로운 정보로 광고하면 안 된다.',
    keywords: ['별자리', '월지', '중복', '상관', '어휘레이어'],
    detail: L(
      `사주 월지(절기 기준 12분할)와 태양궁(황경 12분할)은 약 15일 위상차의 같은 분할이다. 상관계수로 치면 거의 1에 가깝다.`,
      `→ 별자리는 서양식 어휘 레이어(불/흙/공기/물, 수호행성, 심볼)로 써서 비주얼·어휘 다양성을 얻는 데 쓴다. 정보량 추가로 홍보하지 않는다 (10 §2.6).`,
    ),
    doc: '10-4개-체계-융합-콘텐츠-설계-레퍼런스.md',
    section: '§2.6',
    confidence: 'C',
  });
}

/* ══════════════════════════════ 실행 ══════════════════════════════ */

function main() {
  const pd = dataJson('personality-data.json');
  const tbls = dataJson('tables.json');
  const scores = sinsalScores();

  buildIlgan();
  buildJiji();
  buildSipsin();
  buildUnseong();
  buildSinsal12(scores);
  buildGilsinHyungsin(scores, tbls);
  buildYongsin();
  buildDaewoon();
  buildZodiac(pd);
  buildMbti(pd);
  buildBlood(pd);
  buildFusion();

  // 결정론: id 사전순 고정 정렬 (문서 순서가 바뀌어도 산출물이 흔들리지 않게)
  cards.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  /*
   * ── 태그 규약 잠금 ────────────────────────────────────────────────────────
   * 아래 태그는 `src/shared/interpret/retrieve.ts` 의 `queryTagsOf()` 가 **문자 단위로 같은 값**을
   * 만들어 조회한다. 그런데 값의 출처는 리서치 문서의 표 셀(예: 10 §3.3 「충돌 패턴」 열)이라,
   * 문서에서 라벨을 한 글자만 고쳐도 카드 태그가 조용히 달라지고 질의는 영영 빈손이 된다.
   * 검색이 빈손이 되면 에러가 아니라 "그 섹션이 사라지는" 형태로 나타나므로 여기서 즉시 죽인다.
   */
  const REQUIRED_TAGS = [
    'bloodDisclaimer:all',
    'daewoonNote:나이기준',
    'daewoonNote:5년분할',
    'fusionConflict:사주 vs MBTI 상충',
    'fusionConflict:별자리 원소 vs MBTI',
    'fusionConflict:사주 내부 상충',
    'fusionConflict:혈액형 통념 vs 결과',
    // 저작 규칙 2장. `ALWAYS_TAGS` 가 조건 없이 조회하므로 라벨이 한 글자만 바뀌어도 영구 미도달이 된다.
    'fusionCopy:4단구조',
    'fusionCopy:금지어',
    'fusionElement:木',
    'fusionElement:火',
    'fusionElement:土',
    'fusionElement:金',
    'fusionElement:水',
    'fusionNote:교집합',
    'fusionNote:가중치',
    'fusionNote:별자리중복',
  ];
  const allTags = new Set(cards.flatMap((c) => c.tags));
  for (const t of REQUIRED_TAGS) expect(allTags.has(t), `질의 축이 기대하는 태그가 없다: ${t}`);

  const byKind = {};
  for (const c of cards) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  expect(cards.length >= 150, `카드 수가 너무 적다 (${cards.length})`);

  mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(cards, null, 0);
  // 산출물은 cards.json **하나**다. `index.ts` 가 이 파일을 직접 import 한다
  // (`moduleResolution: bundler` 에서 resolveJsonModule 이 기본 ON — 엔진 constants.ts 가 tables.json 에 쓰는 것과 같은 방식).
  // 예전에는 같은 내용을 cards.generated.ts 로도 구웠는데, 같은 데이터가 두 벌이면 한쪽만 갱신되는 사고가 난다.
  writeFileSync(join(OUT_DIR, 'cards.json'), json + '\n', 'utf8');

  const axes = new Set();
  for (const c of cards) for (const t of c.tags) axes.add(t.slice(0, t.indexOf(':')));

  const bytes = Buffer.byteLength(json, 'utf8');
  process.stdout.write(
    [
      `cards        : ${cards.length}`,
      `cards.json   : ${bytes} B (${(bytes / 1024).toFixed(1)} KB)`,
      `by kind      : ${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(' ')}`,
      `by confidence: ${['A', 'B', 'C', 'D'].map((g) => `${g}=${cards.filter((c) => c.confidence === g).length}`).join(' ')}`,
      `tag axes     : ${[...axes].sort().join(' ')}`,
      '',
    ].join('\n'),
  );
}

main();
