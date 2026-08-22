import { useState } from 'react'
import { C, GUTTER, S, Sheet, T } from '../../../shared/design'
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
    <Sheet
      open={open}
      onClose={onClose}
      title="몇 시에 태어났나요?"
      cta={{ label: '선택 완료', onClick: () => onConfirm({ hour, minute }) }}
    >
      <div style={{ display: 'flex', gap: S.sm, justifyContent: 'center', padding: `0 ${GUTTER}px` }}>
        <WheelColumn
          label="시 선택"
          options={HOUR_OPTIONS}
          value={hour}
          format={formatHourOption}
          onChange={setHour}
        />
        <WheelColumn
          label="분 선택"
          options={MINUTE_OPTIONS}
          value={minute}
          format={formatMinuteOption}
          onChange={setMinute}
        />
      </div>
      {/*
        "시간을 모르겠어요" 는 남긴다. 이걸 빼면 생시를 모르는 사용자가 막히고, 삼주(三柱)
        경로가 화면에서 닿을 수 없게 된다 — 글자를 줄이는 것과 길을 막는 것은 다르다.
      */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: S.md }}>
        <button
          type="button"
          onClick={onUnknown}
          style={{
            border: 'none',
            background: 'transparent',
            ...T.label,
            color: C.textMuted,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          시간을 모르겠어요
        </button>
      </div>
    </Sheet>
  )
}
