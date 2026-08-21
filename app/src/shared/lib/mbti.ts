/**
 * MBTI 를 네 축으로 나눠 받는 공용 규칙.
 *
 * 16개 목록에서 하나를 고르는 시트였다. 목록은 스크롤이 필요했고, 무엇보다 사용자가
 * **자기 유형을 통째로 외우고 있어야** 답할 수 있었다. 축별로 물으면 "나는 I 쪽이고 T 쪽"
 * 처럼 아는 사람도 답한다.
 *
 * ## 왜 shared 에 있나
 * 온보딩(나)과 궁합(상대방) 두 화면이 같은 규칙으로 물어야 한다. 한쪽 feature 에 두고
 * 다른 feature 가 가져다 쓰면 두 feature 가 서로를 알게 된다(ARCHITECTURE.md) —
 * 그래서 어휘만 담은 이 파일이 아래에 있다. 유형 목록·스키마는 각 feature 가 계속 소유한다.
 *
 * ## 완성 전 상태가 표현돼야 한다
 * 한 축씩 고르므로 4글자 문자열만으로는 "두 축만 고른 상태"를 담을 수 없다. 그래서 축 넷을
 * 저장 상태로 두고 **유형 문자열은 파생값**으로 만든다 — 두 곳에 저장하면 언젠가 어긋난다.
 */

export interface MbtiAxes {
  readonly ei: 'E' | 'I' | null
  readonly sn: 'S' | 'N' | null
  readonly tf: 'T' | 'F' | null
  readonly jp: 'J' | 'P' | null
}

export const EMPTY_MBTI_AXES: MbtiAxes = { ei: null, sn: null, tf: null, jp: null }

/**
 * 네 축 → 유형 문자열. 한 축이라도 비면 `null`.
 *
 * **자리 순서는 표준(E/I · S/N · T/F · J/P)으로 고정한다.** 화면에서 어느 글자를 먼저
 * 보여 주든(표시 순서는 N/S · P/J 다) 코드의 자리는 바뀌지 않는다 — 여기서 순서가 흔들리면
 * `INFP` 가 `IFNP` 가 되고 지식카드 키가 조용히 어긋난다. 예외도 오류도 없이 리포트에서
 * MBTI 항목만 사라진다.
 */
export function composeMbti(axes: MbtiAxes): string | null {
  const { ei, sn, tf, jp } = axes
  if (ei === null || sn === null || tf === null || jp === null) {
    return null
  }
  return `${ei}${sn}${tf}${jp}`
}

/** 유형 문자열 → 네 축. 되돌아온 값을 화면에 되살릴 때 쓴다. 모양이 아니면 빈 축이다. */
export function axesOfMbti(mbti: string | null): MbtiAxes {
  if (mbti === null || !/^[EI][SN][TF][JP]$/.test(mbti)) {
    return EMPTY_MBTI_AXES
  }
  return {
    ei: mbti[0] as 'E' | 'I',
    sn: mbti[1] as 'S' | 'N',
    tf: mbti[2] as 'T' | 'F',
    jp: mbti[3] as 'J' | 'P',
  }
}

export interface MbtiAxisSpec {
  readonly key: keyof MbtiAxes
  readonly title: string
  readonly options: readonly string[]
  readonly label: Readonly<Record<string, string>>
}

/**
 * 화면에 그리는 순서와 문구.
 *
 * 축 안의 순서는 **지정받은 대로** E/I · N/S · T/F · P/J 다. `composeMbti` 가 자리를 따로
 * 잡으므로 이 순서는 표시에만 영향을 준다.
 *
 * 글자 뒤에 우리말을 붙인다 — 글자만 두면 MBTI 를 모르는 사용자에게 아무 단서가 없고,
 * 우리말만 두면 아는 사용자가 자기 유형과 대조할 수 없다.
 */
export const MBTI_AXIS_SPECS: readonly MbtiAxisSpec[] = [
  { key: 'ei', title: '에너지 방향', options: ['E', 'I'], label: { E: 'E 외향', I: 'I 내향' } },
  { key: 'sn', title: '인식 방식', options: ['N', 'S'], label: { N: 'N 직관', S: 'S 감각' } },
  { key: 'tf', title: '판단 기준', options: ['T', 'F'], label: { T: 'T 사고', F: 'F 감정' } },
  { key: 'jp', title: '생활 방식', options: ['P', 'J'], label: { P: 'P 인식', J: 'J 판단' } },
]
