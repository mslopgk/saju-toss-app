// AUTO-GENERATED — 수정 금지. 재생성: node src/shared/data/tools/gen-lunar-table.mjs
// 출처: npm manseryeok@2.0.0 (MIT) — 1391~2049 KASI 음양력 API / 2050~2100 천문계산
// 근거: C00 §4.1 자산 A7, §S0-2. 런타임은 이 표만 읽는다(manseryeok 프로덕션 의존 없음).
//
// 포맷: 연도당 17비트를 MSB-first 로 이어 붙인 뒤 base64.
//   상위 4비트 = 윤달 위치(0 = 없음, 1~12)
//   하위 13비트 = 그 해 월 시퀀스(윤달 포함, 0-base)의 대월(30일) 비트. 0 이면 소월(29일).
// 각 연도의 정월 초하루 JDN 은 저장하지 않는다 — LUNAR_BASE_JDN 에서 누적하면 나온다.
//
// 검증(생성 시점, 전부 통과):
//   음→양 73,767건 · 양→음 73,414건 manseryeok 전수 일치
//   연 총일수 게이트(평년 353~355 / 윤년 383~385) 202년 통과
//   정월 초하루 누적합 = 실제값 202년 일치

/** 표 첫 해. 양력 1900-01-01 이 음력 1899-12-01 이라 1899 부터 담는다 */
export const LUNAR_BASE_YEAR = 1899;
/** 표 마지막 해 (manseryeok LUNAR_MAX_YEAR) */
export const LUNAR_MAX_YEAR = 2100;
/** 수록 연수 */
export const LUNAR_YEAR_COUNT = 202;
/** 연도당 비트 수 (윤달 4 + 대소월 13) */
export const LUNAR_BITS_PER_YEAR = 17;
/** 음력 1899-01-01 의 그레고리력 JDN (= 양력 1899-02-10) */
export const LUNAR_BASE_JDN = 2414696;
/** 윤달이 있는 해의 수 */
export const LUNAR_LEAP_YEAR_COUNT = 74;
/** 17비트 × 202년 비트스트림 base64 (raw 430 B / base64 576 B) */
export const LUNAR_TABLE_PACKED =
  'BWrFtIDqQOpVslAZLBU2lVYCtQLWSupAdSbZKCyUFJaymwVWgVqJbSC6l9qQNkgaSrpNBKsArVK1oG1AbUl2SB0kzSYCk4KV1lbAraA2obqkDpL2kwVJgUrZS2CW0FtSbVAXSAtJLUmCpV6lYFLQVWrVqBtkDaQ+pINSo1KgqWAqsyrUFaoG0kdSg6lByUbJYFTb1VgK1AtZW6kB1IDkqWSwUlxKrAVaBWtltINqQbJJslBpLWk0FKwCtmrWgbUBtSvZIHSQNJjUrApXiVsC1oDaiuyQOkgaTSpOBSsFLZVWgG1PtVBdIC0ldSYKlQKWmpdBVbNaoC6QNpV6lA1KBUqlS0CqwKtSrVAbSZ1KDqUHJSslgZNgVaNWqC2m7qQHUgWStZLBSWBKtSrYFbQW0ltSBsk/SUGkoKTVpWgK2AtqbaoHZMekgdJA0mZSsClcCayG1QOqgdJN0mBpN6lYFKwUtrVaArUC2VLpQLSo1KgqVApayq0FWoFqkXSg2lBqUfJUGSz5TgKrAq1WtkBtIHUqOSgNFwyXAlWBVtlawLagOpJclBaKCosqTYEqwA==';
