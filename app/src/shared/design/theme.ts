/**
 * 세계관 토큰.
 *
 * 재설계 전에는 홈만 심야 하늘이었고 온보딩·깊이읽기·궁합은 흰 바탕 목록이었다. 화면을
 * 넘길 때마다 **다른 앱으로 들어간 것처럼** 보였고, 그 단절이 "딱딱하다"의 큰 몫이었다.
 * 여기 값들이 네 화면을 한 세계로 묶는다.
 *
 * ## TDS 토큰을 덮어쓰는 것이 아니다
 * 버튼·시트·리스트는 그대로 TDS 다. 여기서 정하는 것은 **바탕과 그 위에 얹는 유리판**이고,
 * 그 위에서 TDS 컴포넌트가 자기 색을 그대로 쓴다. 두 체계를 섞지 않으려면 경계가 필요한데,
 * 그 경계가 `Screen` 컴포넌트다.
 *
 * ## 어두운 쪽으로 고정한다
 * 시스템 라이트/다크를 따라가지 않는다. 사주는 밤의 이미지를 갖고 있고, 오행 오브젝트 에셋이
 * 전부 어두운 배경 위에서 생성됐다. 밝은 바탕에 얹으면 네모 이미지 티가 난다.
 */

import type { Element } from '../lib/saju/types'

export const NIGHT = {
  /** 가장 아래 바탕. 이 위에 오행 그라디언트가 얹힌다. */
  ground: '#0B1026',
  /** 유리판. 바탕 위에 뜬 카드. */
  glass: 'rgba(255, 255, 255, 0.07)',
  glassStrong: 'rgba(255, 255, 255, 0.12)',
  /** 유리판 테두리. 없으면 어두운 바탕에서 카드 경계가 사라진다. */
  glassBorder: 'rgba(255, 255, 255, 0.12)',

  text: '#FFFFFF',
  textSub: 'rgba(255, 255, 255, 0.72)',
  textDim: 'rgba(255, 255, 255, 0.48)',

  /** 막대·구분선처럼 값이 아닌 것. */
  track: 'rgba(255, 255, 255, 0.14)',
} as const

/**
 * 오행별 강조색.
 *
 * 에셋(`assets/generated/elements`)의 주조색에서 뽑았다. 오브젝트와 막대가 같은 색을 쓰면
 * 화면이 "이 사람은 火다"를 두 번 말하게 되고, 그 반복이 기억에 남는다.
 */
export const ELEMENT_ACCENT: Readonly<Record<Element, string>> = {
  木: '#4ADE80',
  火: '#FB923C',
  土: '#FBBF24',
  金: '#CBD5E1',
  水: '#38BDF8',
}

/**
 * 오행별 바탕 그라디언트.
 *
 * backdrop 에셋이 있으면 그 위에 얹고, 없으면 이것만으로도 화면이 선다 —
 * 에셋 한 장 없다고 흰 화면이 되지 않는다.
 */
export const ELEMENT_GROUND: Readonly<Record<Element, string>> = {
  木: 'radial-gradient(120% 80% at 50% 0%, #10331F 0%, #0B1026 62%)',
  火: 'radial-gradient(120% 80% at 50% 0%, #3A1B14 0%, #0B1026 62%)',
  土: 'radial-gradient(120% 80% at 50% 0%, #35280F 0%, #0B1026 62%)',
  金: 'radial-gradient(120% 80% at 50% 0%, #26303D 0%, #0B1026 62%)',
  水: 'radial-gradient(120% 80% at 50% 0%, #0E2A44 0%, #0B1026 62%)',
}

/** 오행 한자 → 화면 표기. 한글을 앞에 둔다 — 첫 화면에서 한자가 벽이 되지 않게 한다. */
export const ELEMENT_LABEL: Readonly<Record<Element, string>> = {
  木: '나무',
  火: '불',
  土: '흙',
  金: '쇠',
  水: '물',
}

export const ELEMENT_ORDER: readonly Element[] = ['木', '火', '土', '金', '水']

/** 유리판 하나. 화면들이 같은 모양의 카드를 쓰도록 한곳에서 정한다. */
export const glassCard = (strong = false): React.CSSProperties => ({
  background: strong ? NIGHT.glassStrong : NIGHT.glass,
  border: `1px solid ${NIGHT.glassBorder}`,
  borderRadius: 18,
  // WebView 에서 backdrop-filter 는 스크롤 중 비용이 크다. 반투명만으로 충분히 떠 보인다.
  padding: '16px 18px',
})
