import { useState } from 'react'
import { BottomSheet, Button, Paragraph, Spacing } from '@toss/tds-mobile'
import type { BirthDate } from '../calendar'
import {
  BIRTH_YEAR_OPTIONS,
  clampDay,
  describeBirthDate,
  formatMonthOption,
  isLunarCalendar,
  monthIndexOf,
  monthsOf,
  rangeInclusive,
  toCalendarType,
} from '../calendar'
import type { CalendarType } from '../types'
import { WheelColumn } from './WheelColumn'

/**
 * 생년월일 선택 시트.
 *
 * TDS `WheelDatePicker` 를 쓰지 않는 이유: 그건 `Date` 를 다루므로 그레고리력 대소월을
 * 강제한다. 음력은 대소월이 29/30 으로 갈리고 윤달이 끼어들어 한 해가 13달이 되기도 한다
 * (C00 §S0-2). 그래서 년/월/일 휠 세 칸을 직접 조립한다.
 *
 * ## 윤달을 별도 체크박스로 두지 않는 이유
 * 윤달은 **그 해에 있거나 없다.** 체크박스를 두면 없는 윤달을 고를 수 있고, 사용자는 폼을 다 채운
 * 뒤에야 `INVALID_LUNAR_DATE` 를 만난다. 대신 월 휠이 그 해에 실제로 있는 달만 보여 준다 —
 * 2023년이면 `1월 2월 윤2월 3월 …`. 고를 수 없는 것은 애초에 없다.
 *
 * 그래서 월 휠의 값은 월 번호가 아니라 **시퀀스 인덱스**다(윤2월과 2월이 같은 번호이기 때문).
 *
 * 이 컴포넌트는 열릴 때마다 부모가 `key` 로 재마운트한다 — TDS `Wheel` 이 비제어라
 * 그렇게 해야 초기값이 반영된다.
 */
export interface BirthDateSheetProps {
  open: boolean
  calendarType: CalendarType
  initialDate: BirthDate
  onClose: () => void
  onConfirm: (calendarType: CalendarType, date: BirthDate) => void
}

export function BirthDateSheet({
  open,
  calendarType: initialCalendarType,
  initialDate,
  onClose,
  onConfirm,
}: BirthDateSheetProps) {
  const [lunar, setLunar] = useState(isLunarCalendar(initialCalendarType))
  const [year, setYear] = useState(initialDate.year)
  const [monthSeq, setMonthSeq] = useState(() =>
    monthIndexOf(initialCalendarType, initialDate.year, initialDate.month, initialCalendarType === 'lunar_leap'),
  )
  const [day, setDay] = useState(initialDate.day)

  const calendarType = toCalendarType(lunar, false)
  const months = monthsOf(calendarType, year)
  // 달력·연도를 바꾸면 달 수가 12↔13 으로 달라진다. 인덱스가 넘치면 마지막 달로 당긴다.
  const seq = months.length === 0 ? 0 : Math.min(Math.max(monthSeq, 0), months.length - 1)
  const picked = months[seq]
  const selected = toCalendarType(lunar, picked?.leap ?? false)
  const maxDay = picked?.days ?? 0
  const boundedDay = maxDay === 0 ? day : Math.min(Math.max(day, 1), maxDay)

  const monthOptions = months.map((_, index) => index)
  const dayOptions = rangeInclusive(1, maxDay)

  const switchCalendar = (nextLunar: boolean) => {
    setLunar(nextLunar)
    // 달 번호는 유지하고 시퀀스만 다시 잡는다 — 음력 5월을 고르던 사람이 양력으로 바꾸면 5월에 선다.
    const next = toCalendarType(nextLunar, false)
    const nextSeq = monthIndexOf(next, year, picked?.month ?? 1, false)
    setMonthSeq(nextSeq)
    setDay((current) => clampDay(next, year, monthsOf(next, year)[nextSeq]?.month ?? 1, current))
  }

  const handleYear = (next: number) => {
    setYear(next)
    // 윤달은 해마다 자리가 다르다. 연도를 바꾸면 같은 시퀀스 칸이 다른 달이 되므로 월 번호로 다시 잡는다.
    const nextSeq = monthIndexOf(calendarType, next, picked?.month ?? 1, picked?.leap ?? false)
    setMonthSeq(nextSeq)
    const nextMonth = monthsOf(calendarType, next)[nextSeq]
    setDay((current) => Math.min(current, nextMonth?.days ?? current))
  }

  const handleMonth = (nextSeq: number) => {
    setMonthSeq(nextSeq)
    const nextMonth = months[nextSeq]
    setDay((current) => Math.min(current, nextMonth?.days ?? current))
  }

  const value: BirthDate = { year, month: picked?.month ?? 1, day: boundedDay }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDimmerClick={onClose}
      // TDS 자체 `WheelDateSheet` 가 휠을 담을 때 켜는 값과 맞춘다(번들의 `disableChildrenDragging:!0`).
      // 휠을 아래로 쓰는 동작과 시트를 아래로 내려 닫는 동작이 같은 방향이라, 이 둘이 겹치면
      // "과거 연도를 고르려다 시트가 닫힌다"가 된다.
      // ⚠ 근거는 TDS 선례뿐이다 — 헤드리스 Chrome 의 터치 시뮬레이션에서는 이 값이 없어도 닫히지
      //   않았다(마우스 드래그로는 닫혔지만 그건 실사용 경로가 아니다). 실기기에서 확인할 항목.
      disableChildrenDragging
      header={<BottomSheet.Header>태어난 날이 언제인가요?</BottomSheet.Header>}
      headerDescription={
        <BottomSheet.HeaderDescription>
          주민등록상 날짜가 아니라 실제로 태어난 날짜를 골라 주세요.
        </BottomSheet.HeaderDescription>
      }
      cta={
        <BottomSheet.CTA disabled={maxDay === 0} onClick={() => onConfirm(selected, value)}>
          선택 완료
        </BottomSheet.CTA>
      }
    >
      <div style={{ display: 'flex', gap: 8, padding: '0 0 12px' }} role="group" aria-label="달력 종류">
        <div style={{ flex: 1 }}>
          <Button
            display="block"
            size="medium"
            color={lunar ? 'dark' : 'primary'}
            variant={lunar ? 'weak' : 'fill'}
            aria-pressed={!lunar}
            onClick={() => switchCalendar(false)}
          >
            양력
          </Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button
            display="block"
            size="medium"
            color={lunar ? 'primary' : 'dark'}
            variant={lunar ? 'fill' : 'weak'}
            aria-pressed={lunar}
            onClick={() => switchCalendar(true)}
          >
            음력
          </Button>
        </div>
      </div>

      {/* 높이는 WheelColumn 이 들고 있다. 여기서 `alignItems: center` 를 주면 안 된다 —
          휠은 행 높이만큼 늘어나야 원통이 성립한다(WheelColumn 주석). */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <WheelColumn
          label="년도 선택"
          options={BIRTH_YEAR_OPTIONS}
          value={year}
          format={(v) => `${v}년`}
          onChange={handleYear}
          perspective="right"
        />
        {/* 연도·달력이 바뀌면 달 목록 자체가 바뀐다(윤달). 비제어 휠이라 재마운트로만 되돌릴 수 있다. */}
        <WheelColumn
          key={`month-${calendarType}-${months.length}-${year}`}
          label="월 선택"
          options={monthOptions}
          value={seq}
          format={(index) => {
            const m = months[index]
            return m === undefined ? '' : formatMonthOption(m)
          }}
          onChange={handleMonth}
        />
        {/* 달이 바뀌면 고를 수 있는 일수가 달라진다. */}
        <WheelColumn
          key={`day-${maxDay}`}
          label="일 선택"
          options={dayOptions}
          value={boundedDay}
          format={(v) => `${v}일`}
          onChange={setDay}
          perspective="left"
        />
      </div>

      {lunar && (
        <>
          <Spacing size={8} />
          {/* 음력 입력자가 윤달을 잘못 골랐는지 확인할 수 있는 유일한 값이 환산된 양력 날짜다. */}
          <Paragraph typography="st12">{describeBirthDate(selected, value)}</Paragraph>
        </>
      )}
    </BottomSheet>
  )
}
