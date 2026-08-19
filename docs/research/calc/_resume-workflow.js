// 세션 한도로 중단된 잔여 작업 재개용 워크플로우
// 실행: Workflow({ scriptPath: "C:/Users/user/orca/projects/saju-toss-app/docs/research/calc/_resume-workflow.js" })
// 선행 완료: C01~C09 (C09는 메인루프에서 수동 실측 완료)
// 잔여:     C10 골든셋 / C11 프로토타입 / C00 통합명세 / 적대적검증 3렌즈

export const meta = {
  name: 'saju-calc-resume',
  description: '중단된 계산엔진 리서치 잔여분: 골든셋·프로토타입·통합명세·적대적검증',
  phases: [
    { title: 'Validate', detail: '골든 테스트셋 + 자체 프로토타입 구현·실행' },
    { title: 'Spec', detail: 'C00 계산엔진 통합명세서 작성' },
    { title: 'Adversarial', detail: '3렌즈 반증 후 명세 수정' },
  ],
}

const DIR = 'C:/Users/user/orca/projects/saju-toss-app/docs/research/calc'
const LAB = 'C:/Users/user/AppData/Local/Temp/claude/C--Users-user-orca-projects-saju-toss-app/580e6bb5-351e-4ff9-a1d7-96bfe16ed90a/scratchpad/calc-lab'

const RULES = `
한국어로 작성한다. 대상: 사주+MBTI+혈액형+별자리 토스 미니앱의 계산 엔진.

**"실제로 결과가 어떻게 계산되는가"에 100% 집중.** 서술형 설명 금지. 수식·상수표·룩업테이블·실행가능 코드만.
- URL을 지어내지 마라. 실제로 WebFetch 성공한 것만 인용. 확인 못 한 건 [미검증].
- ⚠️ 웹 검색(WebSearch) 예산이 소진되어 실패할 수 있다. 실패하면 WebFetch로 직접 URL을 열거나, 로컬 실행 결과에 근거해 작성하라.
- 이미 작성된 선행 문서 ${DIR}/C01~C09 를 **반드시 Read로 먼저 읽어라**. 중복 조사하지 말고 그 결론 위에 쌓아라.
- node v24.14.1 / npm 11.11.0 / python 3.12.10 사용 가능. Bash로 실제 실행하라.
`

const VAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' },
    file: { type: 'string' },
    ran_successfully: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'string' }, minItems: 3 },
    disagreements: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'file', 'ran_successfully', 'findings', 'disagreements', 'open_questions'],
}

phase('Validate')

const VALIDATIONS = [
  {
    key: 'golden-set',
    prompt: `**골든 테스트셋 구축** — 작업 디렉터리 \`${LAB}/golden\`

1. 정답이 알려진 사주 케이스를 **최소 30건** 수집하라: 명리 교재·블로그의 예제 사주(생년월일시 + 사주팔자 + 대운수가 함께 적힌 것), 공개된 유명인 생년월일시. WebFetch로 실제 페이지를 열어 확보하라.
2. \`${DIR}/golden-set.json\` 에 저장:
   \`{id, input:{date,time,gender,calendarType,location}, expected:{yearPillar,monthPillar,dayPillar,hourPillar,daewoonNumber}, source, confidence, label}\`
3. 엣지케이스를 **의도적으로 포함**하고 label 로 무엇을 검증하는지 명시:
   절입 ±1시간, 입춘 경계, 야자시(23시대), 1954~1961 UTC+8:30 구간, 1948~1988 서머타임 구간, 윤달, 자정 경계.
   C09 문서의 BO-1~BO-6 테스트벡터와 C02~C06의 TV-* 벡터를 전부 흡수하라.
4. \`${DIR}/golden-solarterms.json\`: 2020~2030 24절기 시각(KST). C02 문서가 쓴 distbe/holidays CDN(\`https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/<year>.json\`)을 WebFetch 또는 curl로 실제로 받아 파싱하라.
5. **정답을 지어내지 마라.** 못 찾으면 confidence:"low" 로 표시하고 이유를 적어라. 출처 없는 케이스는 넣지 마라.
6. vitest 회귀테스트 코드 예시 포함.

저장: \`${DIR}/C10-골든-테스트셋-구축.md\``,
  },
  {
    key: 'manseryeok-audit',
    prompt: `**\`manseryeok\` 패키지 정밀 감사** — 작업 디렉터리 \`${LAB}/mansaudit\`

C09 §11 에서 이 패키지(v2.0.0, MIT, yhj1024)가 절기를 KASI와 초 단위로 일치시키고 야자시도 한국 주류 규칙과 맞음을 실측했다. **채택 1순위 후보**이므로 프로덕션 투입 전 전수 감사를 하라.

1. \`npm i manseryeok\` 후 \`node_modules/manseryeok/dist/\` **소스를 직접 Read** 하라. 다음을 소스 레벨에서 확정:
   - \`calculateFourPillars\` 의 **전체 옵션 인자** (경도/진태양시/야자시/음력입력 등). \`DEFAULT_LONGITUDE=127.5\` 가 실제로 시주에 적용되는 조건은 무엇인가? C09 §11.5는 기본값에서 미적용으로 보인다고 관찰했다 — 소스로 확정하라.
   - **한국 표준시 이력(1954-03-21~1961-08-09 UTC+8:30)** 처리 여부
   - **서머타임(1948~1951, 1955~1960, 1987~1988)** 처리 여부
   - 야자시 유파 구현 방식
   - 절기 데이터가 **사전계산 테이블인지 런타임 천문계산인지**, 정밀도는 얼마인지
2. \`getTenGodChart\` / \`getLuckPillars\` / \`getVoidBranches\` 의 결과를 **C04·C05·C06이 확정한 유파 선택과 전수 대조**하라. 십신 10×10, 대운수 규칙, 공망 산출이 일치하는가? 불일치 항목을 표로.
3. 절기 2020~2030 전 24절기 × 11년 = 264건을 KASI 값(\`https://cdn.jsdelivr.net/gh/distbe/holidays@gh-pages/<year>.json\`, curl로 직접 받아라)과 **전수 대조**해 편차 통계를 내라.
4. \`npm view manseryeok time.modified dist.unpackedSize dependencies\` 로 유지보수 상태·번들 크기 확인. 클라이언트 번들에 넣을 수 있는 크기인가?
5. 최종 판정: **그대로 채택 / 부분 채택(어느 기능만) / 래핑 필요(무엇을 감쌀 것인가) / 기각**. 근거는 위 실측.

**소스를 실제로 읽고 실제로 실행한 결과만 써라. 추측 금지.**
저장: \`${DIR}/C12-manseryeok-패키지-정밀감사.md\``,
  },
  {
    key: 'prototype',
    prompt: `**독립 검증 오라클 구현** — 작업 디렉터리 \`${LAB}/proto\`

⚠️ **목적 재정의**: C09 §11.6 에 따라 \`manseryeok\` 이 채택 1순위가 되었으므로, 이 프로토타입은 "대체 구현"이 아니라 **manseryeok 을 검증할 독립 오라클**이다. 서로 다른 알고리즘 경로로 같은 답이 나오는지 보는 것이 목적이다.

C01~C06 문서가 확정한 규칙대로 **의존성 없이** JS로 구현하고 실제로 실행하라:
1. 그레고리력 ↔ JD 변환
2. 태양황경(Meeus Ch.25) → 24절기 절입시각 역산(이분법), **KST 출력**
3. 시각 정규화: 한국 표준시 이력(1954-03-21~1961-08-09 UTC+8:30) + 서머타임 전 구간 + 경도보정 + 균시차
4. 연주/월주/일주/시주 (오호둔·오서둔, 야자시 sect=2)
5. 십신 판정
6. 대운 순역·대운수·대운 목록

검증(반드시 실행):
- 2024~2026 입춘/청명/하지 시각을 KASI 공표값과 대조 (C02의 표 활용)
- \`${DIR}/golden-set.json\` 이 있으면 전수 실행해 통과/실패 집계
- \`npm i manseryeok lunar-javascript\` 후 **3자 대조**: 자체구현 vs manseryeok vs lunar-javascript
  - 일주: 1900~2100 전수 대조 (일주는 모든 구현이 일치하므로 신뢰 가능)
  - 절기: 2020~2030 전수 대조, KASI 값 기준 편차 통계
  - ⚠️ lunar-javascript 의 절기는 **UTC+8** 이므로 대조 시 +1h 해야 함 (C09 §3). manseryeok 은 UTC 기반이라 보정 불필요.
- **불일치가 나오면 셋 중 누가 틀렸는지 KASI 값으로 심판하라.** 자체 구현이 틀렸을 가능성을 먼저 의심하라.

**틀린 부분이 나오면 원인을 규명하고 솔직히 적어라. 맞다고 우기지 마라.**
문서에 (a) 소스코드 전문 (b) 실행 명령과 **실제 터미널 출력 원문** (c) 대조표 (d) 발견된 오차·버그 (e) 프로덕션 주의점.
소스는 \`${DIR}/proto/\` 에도 복사.

저장: \`${DIR}/C11-계산엔진-프로토타입-구현결과.md\``,
  },
]

const validations = (await parallel(VALIDATIONS.map((v) => () =>
  agent(`${RULES}\n\n---\n\n${v.prompt}\n\n**조사보다 실행이 우선이다. Bash로 실제 명령을 실행하고 실제 출력을 근거로 써라.**`,
    { label: `validate:${v.key}`, phase: 'Validate', schema: VAL_SCHEMA, effort: 'high' })
))).filter(Boolean)

log(`실측 완료: ${validations.length}/${VALIDATIONS.length}`)

phase('Spec')
const spec = await agent(
  `너는 계산 엔진 아키텍트다. Glob으로 \`${DIR}\` 의 모든 .md/.json 파일 목록을 뽑고 **전부 Read** 하라 (C01~C11).

실측 검증 요약: ${JSON.stringify(validations, null, 2)}

\`${DIR}/C00-계산엔진-통합명세서.md\` 에 Write하라. 이 문서 하나로 엔지니어가 계산 엔진을 처음부터 끝까지 구현할 수 있어야 한다.

1. **파이프라인 개요** — 입력→정규화→절기→4기둥→십신/신살→신강신약/용신→대운→별자리→통합점수→출력. 각 단계 입출력을 TypeScript 인터페이스로 전부 정의
2. **단계별 확정 알고리즘** — (a)채택 공식 (b)왜 이 선택인가 (c)대안과 결과 차이 (d)참조 문서 링크
3. **⚠️ 유파 분기 결정표** — 결과가 갈리는 모든 지점(입춘기준/야자시/진태양시/음간 역행/대운수 반올림/신강신약 임계값/천을귀인 庚일간/괴강 범위/귀문관살 조합 등)을 표로 모으고 **우리 제품의 확정 선택과 근거**를 못박아라. C01~C08의 ambiguities 를 하나도 빠뜨리지 마라. 사용자 설정으로 열어둘 항목은 별도 표시.
4. **데이터 자산 목록** — 필요한 상수 테이블 전부와 예상 크기·생성방법·저장위치
5. **정확도 예산** — 단계별 허용 오차와 근거(C09의 0.137% 같은 수치 활용)
6. **검증 전략** — 골든셋 회귀테스트, 크로스체크 오라클, CI 구성
7. **성능·캐싱** — 계산비용, 클라이언트/서버 분담, 캐시키 설계
8. **구현 순서 로드맵**
9. **미해결 항목**

애매한 표현 금지. 모든 선택은 단정적으로. 근거 약한 곳은 [미검증].
반환: (a)확정한 유파 분기 선택 목록 (b)아직 위험한 항목만 간결히.`,
  { label: 'engine-spec', phase: 'Spec', effort: 'max' }
)

phase('Adversarial')
const REFUTE = {
  type: 'object', additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['sound', 'flawed', 'severely-flawed'] },
    defects: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          where: { type: 'string' },
          claim: { type: 'string' },
          why_wrong: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          fix: { type: 'string' },
        },
        required: ['where', 'claim', 'why_wrong', 'severity', 'fix'],
      },
    },
  },
  required: ['verdict', 'defects'],
}

const LENSES = [
  { k: 'math', p: '**수학·천문 계산 정확성**. 공식의 부호/단위/좌표계/시간계(UT vs TT vs LST)/윤년/JD 오프셋/모듈로 음수 처리를 하나씩 검산하라. Bash로 직접 계산해 반증하라.' },
  { k: 'domain', p: '**명리학 도메인 타당성**. 채택 규칙이 전통과 어긋나는 곳, 유파 선택이 서로 모순되는 곳(예: 진태양시는 적용하면서 야자시는 무시), 룩업테이블 누락·오기를 찾아라.' },
  { k: 'engineering', p: '**엔지니어링 실현성**. 타입 정의 구멍, 타임존/DST 경계 버그, 부동소수점 누적오차, 캐시키 충돌, 번들 크기 초과, 결정론성이 깨지는 지점(Date.now/로컬 타임존 의존)을 찾아라.' },
]

const refutations = (await parallel(LENSES.map((l) => () =>
  agent(`너는 적대적 검증자다. \`${DIR}/C00-계산엔진-통합명세서.md\` 를 Read하고, 필요하면 ${DIR} 의 다른 문서와 ${LAB} 의 코드도 읽어라.

검증 렌즈: ${l.p}

목표는 **명세를 반증하는 것**이다. 칭찬하지 마라. 확실하지 않으면 올리지 말고, 올릴 때는 **구체적 반례(입력값과 잘못된 출력)** 를 제시하라.
결함이 없으면 defects 빈 배열 + verdict 'sound'.`,
    { label: `refute:${l.k}`, phase: 'Adversarial', schema: REFUTE, effort: 'high' })
))).filter(Boolean)

const defects = refutations.flatMap(r => r.defects || [])
const blockers = defects.filter(d => d.severity === 'blocker')

if (defects.length) {
  log(`결함 ${defects.length}건(blocker ${blockers.length}) → 명세 수정`)
  await agent(
    `\`${DIR}/C00-계산엔진-통합명세서.md\` 를 Read하고 아래 적대적 검증 결과를 반영해 **Edit으로 수정**하라.

${JSON.stringify(defects, null, 2)}

- 각 결함을 실제로 확인한 뒤 고쳐라. 검증자가 틀렸으면 고치지 말고 "검토됨: <주장> → 반박근거" 로 남겨라.
- 문서 끝에 \`## 적대적 검증 이력\` 표 추가: [결함/심각도/조치(수정됨·반박됨)/근거]
- blocker 최우선.
반환: 수정 항목과 반박 항목 각 한 줄씩.`,
    { label: 'spec-fix', phase: 'Adversarial', effort: 'high' }
  )
}

return {
  validations: validations.map(v => ({ title: v.title, ran: v.ran_successfully, findings: v.findings, disagreements: v.disagreements })),
  spec_summary: spec,
  adversarial: { verdicts: refutations.map(r => r.verdict), blockers, total_defects: defects.length },
}
