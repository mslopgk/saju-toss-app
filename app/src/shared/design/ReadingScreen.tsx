import { useEffect, useState } from 'react'
import { loadingUrl } from '../assets'
import { MOTION, cx } from '../motion'
import { C, S, T } from './theme'
import { Screen } from './Screen'

/**
 * 계산을 기다리는 화면.
 *
 * 예전에는 흰 바탕에 TDS 스피너 하나였다. 하필 **사용자가 화면을 실제로 응시하는 유일한
 * 순간**이 그것이었고, 앞뒤가 심야 하늘인데 여기만 흰 화면이라 전환이 두 번 튀었다.
 *
 * ## 진행률을 만들지 않는다
 * 남은 시간을 아는 척하는 가짜 막대를 두지 않는다. 사주 계산은 동기 순수함수라 사실상
 * 즉시 끝나고, 기다림의 대부분은 **청크 내려받기**다 — 그 길이는 네트워크가 정하지
 * 우리가 모른다. 대신 무엇을 하고 있는지 문구로 말하고 그림을 천천히 넘긴다.
 *
 * ## 문구가 도는 것은 연출이지 상태가 아니다
 * 세 문구는 실제 계산 단계와 대응하지 않는다. 대응하는 척하면 거짓말이 되므로, 문구는
 * 읽을 거리를 주는 역할만 한다. 계산이 먼저 끝나면 이 화면은 그냥 사라진다.
 */
export interface ReadingScreenProps {
  /** 문구가 바뀌는 간격. 테스트가 기다리지 않도록 열어 둔다. */
  readonly stepMs?: number
}

const STEPS: readonly string[] = [
  '태어난 순간의 하늘을 펼치는 중이에요',
  '여덟 글자에 담긴 기운을 재는 중이에요',
  '당신을 한 단어로 옮기는 중이에요',
]

export function ReadingScreen({ stepMs = 2200 }: ReadingScreenProps) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    // 마지막 문구에서 멈춘다. 계속 돌면 "끝나지 않는다"는 인상을 준다.
    if (step >= STEPS.length - 1) return
    const timer = setTimeout(() => setStep((s) => s + 1), stepMs)
    return () => clearTimeout(timer)
  }, [step, stepMs])

  const art = loadingUrl((step + 1) as 1 | 2 | 3)

  return (
    <Screen>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: S.xxl,
          padding: `0 ${S.xxl}px`,
        }}
        role="status"
        aria-live="polite"
      >
        {art !== null && (
          <div
            className={MOTION.float}
            style={{
              width: '58%',
              maxWidth: 230,
              aspectRatio: '1 / 1',
            }}
          >
            {/* 후광을 두지 않는다 — 홈과 같은 이유로, 움직이는 것은 그림 하나뿐이다. */}
            {/*
              `key` 를 단계로 준다 — 그래야 그림이 바뀔 때 React 가 새 요소로 갈아 끼우고
              등장 애니메이션이 **다시 돈다**. 같은 요소의 src 만 바꾸면 그림이 툭 바뀐다.
            */}
            <img
              key={step}
              src={art}
              alt=""
              aria-hidden
              className={MOTION.pop}
              // 배경 상자는 에셋 자체에 알파로 구워져 있다(`optimize-assets`).
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        )}

        <p
          key={step}
          className={cx(MOTION.rise)}
          style={{
            margin: 0,
            ...T.body,
            fontSize: 16,
            textAlign: 'center',
            color: C.textBody,
          }}
        >
          {STEPS[step]}
        </p>

        {/* 단계 표시. 점 세 개면 "얼마나 남았나"를 숫자 없이 말할 수 있다. */}
        <div style={{ display: 'flex', gap: 7 }} aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: i <= step ? C.text : C.track,
                transition: 'background var(--dur-base) var(--ease-out)',
              }}
            />
          ))}
        </div>
      </div>
    </Screen>
  )
}
