import { Suspense, lazy, useEffect, useState } from 'react'
import { Loader } from '@toss/tds-mobile'
import { OnboardingPage } from './pages/OnboardingPage'
import { EMPTY_SELF_REPORT, type BirthInput, type SelfReport } from './features/onboarding'
import type { Chart, EngineError } from './shared/lib/saju'

/**
 * 화면 조합 계층.
 *
 * 3단계 상태만 둔다: `onboarding` → `home` → `detail`. 라우터를 넣지 않는 이유는 되돌아갈 곳이
 * 언제나 하나뿐이고(깊이읽기에서 뒤로 가면 홈, 홈에서 뒤로 가면 온보딩), 미니앱에서는 URL 이
 * 사용자에게 보이지 않아 경로가 제품 가치를 만들지 않기 때문이다.
 *
 * 계산이 끝나면 **홈으로 간다.** 예전에는 곧장 깊이읽기(옛 `ResultPage`)로 보냈는데, 처음 보는
 * 화면이 여덟 글자 표와 문단 열한 개였다. 홈은 세 덩어리만 보여 주고 나머지는 눌러야 나온다.
 *
 * ## 코드 스플리팅 경계가 여기 있는 이유
 *
 * 초기 화면(온보딩)은 계산 엔진도, 지식카드도, 절기 팩도 쓰지 않는다. 그래서 이 파일이 그 셋을
 * **정적 import 하지 않는다** — 정적으로 한 줄만 걸어도 rolldown 이 전부 초기 청크로 끌어온다.
 *
 * ⚠ 지연되는 것은 **모듈 로딩뿐이다.** 로드된 뒤 `computeChart()` 는 여전히 동기 순수함수이고,
 *   이 파일은 그 결과를 그대로 상태에 넣는다. 엔진을 `async` 로 감싸지 않는다 —
 *   감싸면 "같은 입력 → 같은 출력"을 검증하는 골든셋이 시간 축을 갖게 된다.
 */
type Screen =
  | { readonly name: 'onboarding' }
  /**
   * 자기신고 값을 차트와 함께 들고 간다. 계산 입력이 아니므로 `Chart` 안에 섞지 않는다 —
   * 섞으면 "엔진 출력"과 "사용자가 적은 값"의 경계가 흐려지고 캐시 키에도 새어 든다.
   */
  | { readonly name: 'home'; readonly chart: Chart; readonly selfReport: SelfReport }
  | { readonly name: 'detail'; readonly chart: Chart; readonly selfReport: SelfReport }

/**
 * 결과 쪽 화면 청크. `features/report` → `shared/interpret/ui` → `cards.json`(174 kB)까지 전부
 * 이 경계 뒤로 간다. 화면이 배럴(`shared/interpret`)을 import 하지 않는 규율은 그대로다 —
 * 경계는 **언제 받느냐**만 바꾸고 **무엇을 받느냐**는 바꾸지 않는다.
 *
 * 홈과 깊이읽기를 따로 쪼갠다. 홈만 보고 나가는 사용자에게 대운표·궁합 진입점까지 받게 하지 않는다.
 */
const HomePage = lazy(async () => ({ default: (await import('./pages/HomePage')).HomePage }))
const DetailPage = lazy(async () => ({ default: (await import('./pages/DetailPage')).DetailPage }))

/**
 * 계산 엔진 청크(`tables.json` · 절기 팩 · `strength-params.json` 포함).
 *
 * 모듈 인스턴스를 한 번만 만들도록 프로미스를 캐시한다. 두 번 부르면 `EngineError` 클래스가
 * 두 벌이 되어 `instanceof` 가 조용히 false 가 된다(브라우저는 실제로 한 번만 받지만,
 * 테스트 러너처럼 모듈 그래프가 갈리는 환경에서 그 가정에 기대지 않는다).
 */
type SajuEngine = typeof import('./shared/lib/saju')
let enginePromise: Promise<SajuEngine> | null = null
function loadEngine(): Promise<SajuEngine> {
  enginePromise ??= import('./shared/lib/saju')
  return enginePromise
}

/**
 * `EngineError.code` → 사용자 문구.
 * 화면 검증(zod)을 통과하고도 엔진이 막는 경우가 남아 있어서 필요하다.
 * `INVALID_LUNAR_DATE` 는 화면이 미리 막지 못하는 대표 사례다 — 음력 대소월·윤달 실재 여부는
 * 엔진 음력 표만 알기 때문이다(C00 §S0-2). 코드 유니온이 늘어났을 때 조용히 빠지지 않도록
 * 전부 적어 둔다(누락 시 컴파일 에러).
 */
const ENGINE_ERROR_MESSAGE: Readonly<Record<EngineError['code'], string>> = {
  OUT_OF_RANGE: '1900년부터 2100년 사이만 계산할 수 있어요. 태어난 해를 다시 확인해 주세요.',
  INVALID_DATE: '달력에 없는 날짜예요. 태어난 날을 다시 골라 주세요.',
  INVALID_INPUT: '입력을 확인하지 못했어요. 태어난 날과 시각을 다시 골라 주세요.',
  INVALID_LUNAR_DATE: '그 해에는 없는 음력 날짜예요. 윤달 여부와 날짜를 다시 골라 주세요.',
  UNSUPPORTED_CALENDAR: '이 달력 종류는 아직 계산할 수 없어요.',
  MISSING_PLACE: '태어난 곳을 다시 골라 주세요.',
  MISSING_TZ: '해외에서 태어난 경우에는 표준시 정보가 더 필요해요.',
}

const GENERIC_ERROR = '계산 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.'

/**
 * 화면 전체를 덮는 로딩 표시.
 *
 * 온보딩을 **언마운트하지 않고** 위에 얹는다. 언마운트하면 엔진이 입력을 거절했을 때
 * 사용자가 채워 둔 폼이 통째로 날아간다(폼 상태는 `OnboardingForm` 안의 `useReducer` 에 있다).
 */
function LoadingOverlay() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--adaptiveBackground)',
        zIndex: 100,
      }}
    >
      <Loader size="large" type="primary" />
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'onboarding' })
  const [engineError, setEngineError] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)

  // 첫 페인트가 끝난 뒤 뒤 화면 청크를 미리 받아 둔다. 초기 청크에는 들어가지 않으므로
  // 첫 로딩은 그대로 가볍고, CTA 를 누를 때는 이미 손에 있다.
  useEffect(() => {
    void loadEngine()
    void import('./pages/HomePage')
  }, [])

  // 깊이읽기는 **홈이 그려진 뒤에** 받는다. 홈만 보고 나가는 사용자에게 대운표·궁합 진입점까지
  // 내려보내지 않으면서, CTA 를 누를 때는 이미 손에 있게 한다.
  const onHome = screen.name === 'home'
  useEffect(() => {
    if (onHome) void import('./pages/DetailPage')
  }, [onHome])

  const handleComplete = (input: BirthInput, selfReport: SelfReport = EMPTY_SELF_REPORT) => {
    setComputing(true)
    loadEngine().then(
      (engine) => {
        setComputing(false)
        try {
          // BirthInput 은 C00 §1.2.2 RawBirthInput 의 구조적 부분집합이라 그대로 넘긴다.
          // 여기서부터는 전부 동기다 — 엔진은 프로미스를 반환하지 않는다.
          const chart = engine.computeChart(input)
          setEngineError(null)
          setScreen({ name: 'home', chart, selfReport })
        } catch (error) {
          // 엔진이 거절하면 온보딩에 머무르고 이유를 인라인으로 알린다. 화면을 갈아엎지 않는다.
          setEngineError(
            error instanceof engine.EngineError ? ENGINE_ERROR_MESSAGE[error.code] : GENERIC_ERROR,
          )
        }
      },
      () => {
        // 청크를 못 받은 경우(네트워크·캐시 문제). 다음 시도에서 다시 받도록 캐시를 비운다.
        enginePromise = null
        setComputing(false)
        setEngineError(GENERIC_ERROR)
      },
    )
  }

  const handleRestart = () => {
    setEngineError(null)
    setScreen({ name: 'onboarding' })
  }

  if (screen.name === 'home') {
    return (
      <Suspense fallback={<LoadingOverlay />}>
        <HomePage
          chart={screen.chart}
          selfReport={screen.selfReport}
          onOpenDetail={() => setScreen({ ...screen, name: 'detail' })}
          onRestart={handleRestart}
        />
      </Suspense>
    )
  }
  if (screen.name === 'detail') {
    return (
      <Suspense fallback={<LoadingOverlay />}>
        <DetailPage
          chart={screen.chart}
          selfReport={screen.selfReport}
          // 뒤로 가기는 한 칸씩이다. 깊이읽기에서 나가면 온보딩이 아니라 홈으로 모인다.
          onBack={() => setScreen({ ...screen, name: 'home' })}
        />
      </Suspense>
    )
  }
  return (
    <>
      <OnboardingPage onComplete={handleComplete} engineError={engineError} />
      {computing && <LoadingOverlay />}
    </>
  )
}

export default App
