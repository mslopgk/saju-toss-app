/**
 * 엔진 경고(C00 §5.4) → 사용자 문구.
 *
 * 화면 파일이 아니라 이 파일에 두는 이유: TDS 를 import 하지 않아 노드 런타임에서 그대로 테스트할 수 있고,
 * `Record<EngineWarning, …>` 라 엔진이 경고를 하나 추가하면 **컴파일이 깨진다**(조용히 빠지지 않는다).
 *
 * `severity` 규약:
 *   `warn` — 입력이 조금만 달랐으면 **명식 자체가 바뀔 수 있는** 경계 상황. 사용자가 알아야 한다.
 *   `info` — 계산이 보정을 적용했다는 사실 고지. 결과가 갈리지는 않는다.
 */

import type { EngineWarning } from '../shared/lib/saju'

export interface WarningCopy {
  readonly label: string
  readonly detail: string
  readonly severity: 'info' | 'warn'
}

export const ENGINE_WARNING_COPY: Readonly<Record<EngineWarning, WarningCopy>> = {
  JIE_BOUNDARY: {
    label: '절기 경계',
    detail: '절기가 바뀌는 순간과 1분 이내예요. 출생 시각이 조금만 달라도 월주가 바뀔 수 있어요.',
    severity: 'warn',
  },
  JASI_BOUNDARY: {
    label: '자시 경계',
    detail: '밤 11시 전후 구간이에요. 유파에 따라 일주가 하루 차이 날 수 있어요(이 앱은 야자시 기준).',
    severity: 'warn',
  },
  DST_APPLIED: {
    label: '서머타임',
    detail: '태어난 해에 서머타임이 있었어요. 시계 시각에서 되돌려 계산했어요.',
    severity: 'info',
  },
  HISTORICAL_OFFSET: {
    label: '표준시 이력',
    detail: '그때의 한국 표준시가 지금(+09:00)과 달랐어요. 당시 기준으로 계산했어요.',
    severity: 'info',
  },
  TIME_GAP: {
    label: '없던 시각',
    detail: '서머타임 시작으로 존재하지 않던 시계 시각이에요. 다음 유효 시각으로 옮겼어요.',
    severity: 'warn',
  },
  TIME_OVERLAP: {
    label: '두 번 있던 시각',
    detail: '서머타임 종료로 같은 시각이 두 번 있었어요. 앞쪽을 기준으로 계산했어요.',
    severity: 'warn',
  },
  DAY_SHIFTED_BY_TRUE_SOLAR: {
    label: '진태양시 날짜 이동',
    detail: '경도·균시차 보정으로 달력 날짜가 하루 옮겨졌어요. 일주는 보정된 날 기준이에요.',
    severity: 'warn',
  },
  THREE_PILLAR_MODE: {
    label: '삼주 모드',
    detail: '태어난 시각을 몰라 연·월·일 세 기둥만 계산했어요. 시주는 비어 있어요.',
    severity: 'info',
  },
  LOW_PRECISION_SOLAR_TERM: {
    label: '절기 근사',
    detail: '이 연도는 정밀 절기표 범위 밖이라 근사값으로 계산했어요.',
    severity: 'info',
  },
  LUNAR_CONVERTED: {
    label: '음력 환산',
    // 환산된 양력 날짜는 `chart.input.solar`, 원본은 `chart.input.lunarSource` 에 있다.
    // 문구를 정적으로 두고 날짜는 화면이 값에서 만든다 — 이 표는 코드→문구 대응만 담는다.
    detail: '음력으로 입력한 날짜를 양력으로 바꿔서 계산했어요. 윤달 여부가 맞는지 확인해 주세요.',
    severity: 'info',
  },
}

/** 엔진이 낼 수 있는 경고 코드 전량. 테스트가 이 목록과 문구 표를 대조한다. */
export const ALL_ENGINE_WARNINGS = [
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
] as const satisfies readonly EngineWarning[]
