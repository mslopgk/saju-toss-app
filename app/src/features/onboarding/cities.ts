/**
 * 출생지 후보 목록.
 *
 * 근거: C00 §S0-3(출생지 좌표) + C15 §7.2「경도 보정표」.
 * 이 화면이 출생지를 묻는 유일한 이유는 **진태양시 보정용 경도(λ)** 다.
 * 위도는 S7(ASC·하우스)에서만 쓰이므로 함께 보관한다.
 *
 * 좌표 출처는 C15 §7.2 의 **소스 A**(OSM Nominatim 시청 좌표)다.
 * C00 §S0-3 이 이 소스를 채택했고, 소스 B(도시 대표점)와의 차이는 최대 16.2초로
 * 균시차 간이식 오차(65초)보다 작아 시지 판정에 영향이 없다.
 * 서울만 C00 §S0-3 이 명시한 기본값(λ=126.9784204, φ=37.5665)을 그대로 쓴다 —
 * C15 표의 서울시청 값(37.566789 / 126.978420)과 미세하게 다르지만 SSOT 인 C00 이 이긴다.
 */

export interface City {
  /**
   * UI 로컬 식별자.
   *
   * C00 §1.2.2 의 `RawBirthInput.birthPlace.regionCode` 와는 **다른 체계**다.
   * 엔진 쪽 시/군/구 코드표가 확정되기 전에 임의 코드를 넘기면 좌표 룩업이 조용히 빗나가므로,
   * 이 화면은 `regionCode` 를 넘기지 않고 좌표만 넘긴다(C00 §1.2.2: "둘 중 하나 필수").
   */
  id: string;
  /** 목록에 보이는 이름 */
  name: string;
  /** 좌표 취득 기준이 된 관공서 — 사용자에게 "어디 좌표인지" 밝히기 위한 값 */
  source: string;
  latitude: number;
  longitude: number;
}

/**
 * 국내 32개 시청/도청 + 백령도.
 *
 * 백령도는 국토 서쪽 극단점(λ=124.6724)이라 서울 고정 대비 오차가 가장 크게 남는 지점이다
 * (C15 §7.2: 백령도 −41.31분 ↔ 독도 −12.54분, 폭 28.77분). 독도·마라도는 상주 출생지가
 * 아니므로 넣지 않는다.
 */
export const CITIES: readonly City[] = [
  { id: 'seoul', name: '서울', source: '서울특별시청', latitude: 37.5665, longitude: 126.9784204 },
  { id: 'busan', name: '부산', source: '부산광역시청', latitude: 35.179942, longitude: 129.075205 },
  { id: 'daegu', name: '대구', source: '대구광역시청', latitude: 35.871508, longitude: 128.601917 },
  { id: 'incheon', name: '인천', source: '인천광역시청', latitude: 37.456122, longitude: 126.705241 },
  { id: 'gwangju', name: '광주', source: '광주광역시청', latitude: 35.159567, longitude: 126.849407 },
  { id: 'daejeon', name: '대전', source: '대전광역시청', latitude: 36.350551, longitude: 127.384961 },
  { id: 'ulsan', name: '울산', source: '울산광역시청', latitude: 35.539508, longitude: 129.311252 },
  { id: 'sejong', name: '세종', source: '세종특별자치시청', latitude: 36.480114, longitude: 127.288964 },
  { id: 'suwon', name: '수원', source: '수원시청', latitude: 37.261647, longitude: 127.031862 },
  { id: 'goyang', name: '고양', source: '고양시청', latitude: 37.658378, longitude: 126.83194 },
  { id: 'yongin', name: '용인', source: '용인시청', latitude: 37.241063, longitude: 127.177633 },
  { id: 'seongnam', name: '성남', source: '성남시청', latitude: 37.420094, longitude: 127.12661 },
  { id: 'uijeongbu', name: '의정부', source: '의정부시청', latitude: 37.7393, longitude: 127.034873 },
  { id: 'pyeongtaek', name: '평택', source: '평택시청', latitude: 36.9914, longitude: 127.113002 },
  { id: 'chuncheon', name: '춘천', source: '춘천시청', latitude: 37.881383, longitude: 127.730204 },
  { id: 'wonju', name: '원주', source: '원주시청', latitude: 37.340668, longitude: 127.922409 },
  { id: 'gangneung', name: '강릉', source: '강릉시청', latitude: 37.751799, longitude: 128.875862 },
  { id: 'sokcho', name: '속초', source: '속초시청', latitude: 38.207322, longitude: 128.591968 },
  { id: 'cheongju', name: '청주', source: '청주시청', latitude: 36.642459, longitude: 127.489043 },
  { id: 'cheonan', name: '천안', source: '천안시청', latitude: 36.816041, longitude: 127.11454 },
  { id: 'jeonju', name: '전주', source: '전주시청', latitude: 35.824146, longitude: 127.14811 },
  { id: 'gunsan', name: '군산', source: '군산시청', latitude: 35.967604, longitude: 126.736882 },
  { id: 'mokpo', name: '목포', source: '목포시청', latitude: 34.81152, longitude: 126.391794 },
  { id: 'yeosu', name: '여수', source: '여수시청', latitude: 34.762208, longitude: 127.663098 },
  { id: 'pohang', name: '포항', source: '포항시청', latitude: 36.019015, longitude: 129.34323 },
  { id: 'andong', name: '안동', source: '안동시청', latitude: 36.568419, longitude: 128.729608 },
  { id: 'ulleung', name: '울릉', source: '울릉군청', latitude: 37.484425, longitude: 130.905781 },
  { id: 'changwon', name: '창원', source: '창원시청', latitude: 35.227858, longitude: 128.681815 },
  { id: 'jinju', name: '진주', source: '진주시청', latitude: 35.179645, longitude: 128.108564 },
  { id: 'gimhae', name: '김해', source: '김해시청', latitude: 35.227082, longitude: 128.890375 },
  { id: 'jeju', name: '제주', source: '제주특별자치도청', latitude: 33.489046, longitude: 126.498032 },
  { id: 'seogwipo', name: '서귀포', source: '서귀포시청', latitude: 33.255601, longitude: 126.510443 },
  { id: 'baengnyeong', name: '백령도', source: '백령도(국토 서쪽 극단점)', latitude: 37.949803, longitude: 124.67243 },
]

/** 출생지 미선택 시 기본값. C00 §S0-3 이 서울시청으로 못박았다. */
export const DEFAULT_CITY_ID = 'seoul'

export function findCity(id: string): City | undefined {
  return CITIES.find((city) => city.id === id)
}

/**
 * 목록에 없는 값이 들어와도 화면이 비지 않도록 서울로 떨어뜨린다.
 * 기본값이 서울인 것은 UI 편의가 아니라 C00 §S0-3 의 규정이다.
 */
export function findCityOrDefault(id: string): City {
  const city = findCity(id)
  if (city !== undefined) {
    return city
  }
  const seoul = findCity(DEFAULT_CITY_ID)
  if (seoul === undefined) {
    throw new Error('CITIES 에서 기본 도시(서울)가 사라졌다')
  }
  return seoul
}
