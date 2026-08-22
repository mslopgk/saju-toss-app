import { useState } from 'react'
import { ChipGroup, GUTTER, S, Sheet } from '../../../shared/design'
import type { BirthDate } from '../calendar'
import {
  BIRTH_YEAR_OPTIONS,
  clampDay,
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

/** 달력 두 종류. 칩으로 고르므로 목록이 필요하다. */
const CALENDAR_OPTIONS = ['양력', '음력'] as const

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
    <Sheet
      open={open}
      onClose={onClose}
      title="언제 태어났나요?"
      cta={{ label: '선택 완료', onClick: () => onConfirm(selected, value) }}
    >
      <div style={{ padding: `0 ${GUTTER}px ${S.md}px` }}>
        {/*
          달력 종류. 예전에는 시트 설명문("주민등록상 날짜가 아니라 실제로 태어난 날짜를
          골라 주세요")이 함께 있었는데, 이 시트가 하는 일은 날짜를 고르는 것 하나뿐이라
          제목만으로 충분하다 — 글자를 줄이라는 방향에 맞춰 뺐다.
        */}
        <ChipGroup
          options={CALENDAR_OPTIONS}
          value={lunar ? '음력' : '양력'}
          onChange={(next) => switchCalendar(next === '음력')}
        />
      </div>

      <div style={{ display: 'flex', gap: S.sm, justifyContent: 'center', padding: `0 ${GUTTER}px` }}>
        <WheelColumn
          label="년도 선택"
          options={BIRTH_YEAR_OPTIONS}
          value={year}
          format={(v) => `${v}년`}
          onChange={handleYear}
        />
        {/* 연도·달력이 바뀌면 달 목록 자체가 바뀐다(윤달). 항목 수가 달라지면 휠이 경계를 다시 잡는다. */}
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
        />
      </div>
    </Sheet>
  )
}
