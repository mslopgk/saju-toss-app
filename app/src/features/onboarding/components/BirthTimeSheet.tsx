import { useState } from 'react'
import { BottomSheet, TextButton } from '@toss/tds-mobile'
import type { BirthTime } from '../calendar'
import { HOUR_OPTIONS, MINUTE_OPTIONS, formatHourOption, formatMinuteOption } from '../calendar'
import { WheelColumn } from './WheelColumn'

/**
 * 출생시각 선택 시트.
 *
 * 24시간제로 고르게 한다. 사주는 자시(23~01시) 경계를 다루므로 오전/오후 표기는
 * "오전 12시"가 자정인지 정오인지에서 오해가 생긴다.
 *
 * "시간을 모르겠어요" 는 부가 기능이 아니라 **정식 경로**다(C00 §S0-4).
 * 시주를 찍어서 맞출 확률은 1/12 이고, 상승궁은 시각 미상이면 무작위와 같다(C19).
 */
export interface BirthTimeSheetProps {
  open: boolean
  initialTime: BirthTime
  onClose: () => void
  onConfirm: (time: BirthTime) => void
  onUnknown: () => void
}

export function BirthTimeSheet({ open, initialTime, onClose, onConfirm, onUnknown }: BirthTimeSheetProps) {
  const [hour, setHour] = useState(initialTime.hour)
  const [minute, setMinute] = useState(initialTime.minute)

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDimmerClick={onClose}
      // TDS 휠 시트와 맞춘다. 근거와 미검증 범위는 BirthDateSheet 의 같은 줄 주석 참고.
      disableChildrenDragging
      header={<BottomSheet.Header>몇 시에 태어났나요?</BottomSheet.Header>}
      headerDescription={
        <BottomSheet.HeaderDescription>
          24시간제로 골라 주세요. 시각이 정확할수록 시주(時柱)와 상승궁이 정확해져요.
        </BottomSheet.HeaderDescription>
      }
      cta={<BottomSheet.CTA onClick={() => onConfirm({ hour, minute })}>선택 완료</BottomSheet.CTA>}
    >
      {/* 높이는 WheelColumn 이 들고 있다. `alignItems: center` 를 주면 휠이 접힌다(WheelColumn 주석). */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <WheelColumn
          label="시 선택"
          options={HOUR_OPTIONS}
          value={hour}
          format={formatHourOption}
          onChange={setHour}
          perspective="right"
        />
        <WheelColumn
          label="분 선택"
          options={MINUTE_OPTIONS}
          value={minute}
          format={formatMinuteOption}
          onChange={setMinute}
          perspective="left"
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        <TextButton size="medium" variant="underline" onClick={onUnknown}>
          시간을 모르겠어요
        </TextButton>
      </div>
    </BottomSheet>
  )
}
