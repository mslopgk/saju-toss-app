import { useReducer, useState } from 'react'
import { BottomSheet, Button, Paragraph, Spacing, TextButton, Wheel } from '@toss/tds-mobile'
import {
  BottomCTA,
  ChipGroup,
  FieldGroup,
  FieldRow,
  Hint,
  C,
  GUTTER,
  Screen,
  ScreenTitle,
  SectionLabel,
  T,
} from '../../../shared/design'
import { MOTION, stagger } from '../../../shared/motion'
import { MBTI_AXIS_SPECS } from '../../../shared/lib/mbti'
import type { CalendarType, RawBirthInput } from '../../../shared/lib/saju/types'
import type { CompatBloodType, CompatProfile } from '../../../shared/lib/compat/types'
import type { PartnerDraft, PartnerMonth } from '../partnerState'
import {
  HOUR_OPTIONS,
  INITIAL_PARTNER_DRAFT,
  MINUTE_OPTIONS,
  SEED_DATE,
  SEED_TIME,
  YEAR_OPTIONS,
  buildPartnerInput,
  describePartnerDate,
  describePartnerTime,
  formatHourOption,
  formatMinuteOption,
  formatMonthOption,
  monthIndexOf,
  monthsOf,
  partnerReducer,
  rangeInclusive,
} from '../partnerState'

/**
 * 상대방 출생 정보 입력.
 *
 * 근거: docs/product.md(궁합 흐름) / C00 §S0-2(음력)·§S0-3(출생지 기본값)·§S0-4(삼주).
 *
 * **첫 사람은 다시 묻지 않는다** — 이미 온보딩에서 받은 차트를 그대로 쓴다. 이 화면은 두 번째
 * 사람만 받고, 토스 프리필 버튼은 **의도적으로 없다**(그 경로가 채우는 것은 사용자 본인의
 * 생년월일이라, 상대방 칸에 넣으면 남의 사주가 아니라 자기 사주를 두 번 보게 된다).
 */
export interface PartnerFormProps {
  onSubmit: (input: RawBirthInput, profile: CompatProfile) => void
  /** 계산 엔진이 입력을 거절했을 때의 사용자용 문구 */
  engineError?: string | null
  onBack?: () => void
}

type SheetKind = 'date' | 'time'

const NOT_SELECTED = '선택해 주세요'
/** 성별 두 값. 대운 방향과 혈액형 남녀 보정에 쓰이는 **계산 입력**이라 필수다. */
const PARTNER_GENDER_OPTIONS = ['M', 'F'] as const

const BLOOD_OPTIONS: readonly CompatBloodType[] = ['A', 'B', 'O', 'AB']

/** 휠 한 칸. TDS `Wheel` 은 비제어라(`initialIndex` 만 읽는다) 되돌리려면 `key` 재마운트가 필요하다 */
function WheelColumn({
  label,
  options,
  value,
  format,
  onChange,
}: {
  label: string
  options: number[]
  value: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  const index = options.indexOf(value)
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <Wheel
        aria-label={label}
        options={options}
        initialIndex={index < 0 ? 0 : index}
        formatValue={format}
        onChange={onChange}
        width="100%"
      />
    </div>
  )
}

export function PartnerForm({ onSubmit, engineError = null, onBack }: PartnerFormProps) {
  const [draft, dispatch] = useReducer(partnerReducer, INITIAL_PARTNER_DRAFT)
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null)
  const [sheetSession, setSheetSession] = useState(0)

  const built = buildPartnerInput(draft)

  const openSheetOf = (kind: SheetKind) => {
    setSheetSession((s) => s + 1)
    setOpenSheet(kind)
  }
  const closeSheet = () => setOpenSheet(null)

  const handleSubmit = () => {
    if (built.ok) onSubmit(built.input, built.profile)
  }

  return (
    <Screen bottomInset={168}>
      <Spacing size={20} />

      <ScreenTitle
        index={0}
        title="상대방은 언제 태어났나요?"
        subtitle="두 사람의 사주를 나란히 놓고 궁합을 봐요. 내 정보는 이미 받았으니 다시 묻지 않아요."
      />

      <Spacing size={20} />

      <FieldGroup index={1}>
        <FieldRow
          index={1}
          label="태어난 날"
          value={
            draft.date === null ? NOT_SELECTED : describePartnerDate(draft.calendarType, draft.date)
          }
          muted={draft.date === null}
          onClick={() => openSheetOf('date')}
        />
        <FieldRow
          index={2}
          label="태어난 시각"
          value={describePartnerTime(draft)}
          muted={draft.time === null && !draft.timeUnknown}
          onClick={() => openSheetOf('time')}
        />
      </FieldGroup>

      {draft.timeUnknown && (
        <>
          <Spacing size={10} />
          <Hint>시각을 몰라도 연·월·일 세 기둥은 그대로 나와요. 시주만 빼고 계산해요.</Hint>
        </>
      )}

      <Spacing size={10} />
      <Hint>
        태어난 곳은 서울 기준으로 계산해요. 국내에서는 진태양시 보정 차이가 최대 8분대라 시주
        경계에 걸리지 않는 한 결과가 달라지지 않아요.
      </Hint>

      <Spacing size={26} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel index={3}>성별</SectionLabel>
        <Spacing size={10} />
        <ChipGroup
          index={3}
          options={PARTNER_GENDER_OPTIONS}
          value={draft.gender}
          onChange={(gender) => dispatch({ type: 'setGender', gender })}
          label={(g) => (g === 'M' ? '남성' : '여성')}
        />
      </div>
      <Spacing size={10} />
      <Hint>대운 방향 판정에 필요하고, 혈액형 궁합의 남녀 보정에도 써요.</Hint>

      <Spacing size={26} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel index={4}>상대방의 MBTI와 혈액형</SectionLabel>
      </div>
      <Spacing size={6} />
      <Hint>MBTI·혈액형 궁합도 배점에 들어가요. 네 줄에서 하나씩 골라 주세요.</Hint>

      <Spacing size={14} />

      {/* 온보딩과 같은 네 축 이지선다. 두 화면이 같은 방식으로 물어야 사용자가 헷갈리지 않는다. */}
      <div style={{ padding: `0 ${GUTTER}px` }}>
        {MBTI_AXIS_SPECS.map((axis, i) => (
          <div key={axis.key} style={{ paddingBottom: i === MBTI_AXIS_SPECS.length - 1 ? 0 : 12 }}>
            <p
              className={MOTION.rise}
              {...stagger(4 + i)}
              style={{ margin: '0 0 6px', ...T.label, color: C.textMuted }}
            >
              {axis.title}
            </p>
            <ChipGroup
              index={4 + i}
              options={axis.options}
              value={draft.mbtiAxes[axis.key]}
              onChange={(value) => dispatch({ type: 'setMbtiAxis', patch: { [axis.key]: value } })}
              label={(option) => axis.label[option] ?? option}
            />
          </div>
        ))}
      </div>

      <Spacing size={18} />

      <div style={{ padding: `0 ${GUTTER}px` }}>
        <SectionLabel index={5}>혈액형</SectionLabel>
        <Spacing size={10} />
        {/*
          재탭 해제를 없앴다. 예전에는 같은 칩을 다시 누르면 "모름"으로 돌아갔는데, 혈액형이
          필수가 된 뒤로 그 동작은 **방금 열린 CTA 를 다시 잠그는 일**이 된다.
          잘못 골랐으면 다른 칩을 누르면 되고, 넷 중 하나는 반드시 참이다.
        */}
        <ChipGroup
          index={5}
          options={BLOOD_OPTIONS}
          value={draft.blood}
          onChange={(blood) => dispatch({ type: 'setBlood', blood })}
        />
      </div>
      <Spacing size={10} />
      <Hint>
        혈액형 궁합은 과학적 근거가 없어요. 배점에는 넣되 비중을 10%로 두고, 결과 화면에서 그
        사실을 다시 밝혀요.
      </Hint>

      {engineError !== null && (
        <div role="alert">
          <Spacing size={16} />
          <Hint tone="warn">{engineError}</Hint>
        </div>
      )}

      {onBack !== undefined && (
        <div
          className={MOTION.rise}
          {...stagger(6)}
          style={{ display: 'flex', justifyContent: 'center', padding: '22px 24px 0' }}
        >
          <TextButton size="medium" variant="underline" onClick={onBack}>
            내 결과로 돌아가기
          </TextButton>
        </div>
      )}

      <BottomCTA disabled={!built.ok} onClick={handleSubmit} caption="운세 콘텐츠예요. 두 사람의 관계를 예측하지 않아요.">
        궁합 보기
      </BottomCTA>

      <PartnerDateSheet
        key={`date-${sheetSession}`}
        open={openSheet === 'date'}
        calendarType={draft.calendarType}
        initialDate={draft.date ?? SEED_DATE}
        onClose={closeSheet}
        onConfirm={(calendarType, date) => {
          dispatch({ type: 'setDate', calendarType, date })
          closeSheet()
        }}
      />

      <PartnerTimeSheet
        key={`time-${sheetSession}`}
        open={openSheet === 'time'}
        initialTime={draft.time ?? SEED_TIME}
        onClose={closeSheet}
        onConfirm={(time) => {
          dispatch({ type: 'setTime', time })
          closeSheet()
        }}
        onUnknown={() => {
          dispatch({ type: 'setTimeUnknown' })
          closeSheet()
        }}
      />

    </Screen>
  )
}

/**
 * 생년월일 시트.
 *
 * TDS `WheelDatePicker` 를 쓰지 않는 이유는 온보딩과 같다 — 그건 `Date` 를 다뤄 그레고리력
 * 대소월을 강제하는데, 음력은 대소월이 29/30 으로 갈리고 윤달이 끼어 한 해가 13달이 된다.
 * 그래서 월 휠의 값은 월 번호가 아니라 **시퀀스 인덱스**다(윤2월과 2월이 같은 번호이기 때문).
 */
function PartnerDateSheet({
  open,
  calendarType: initialCalendarType,
  initialDate,
  onClose,
  onConfirm,
}: {
  open: boolean
  calendarType: CalendarType
  initialDate: { year: number; month: number; day: number }
  onClose: () => void
  onConfirm: (calendarType: CalendarType, date: { year: number; month: number; day: number }) => void
}) {
  const [lunar, setLunar] = useState(initialCalendarType !== 'solar')
  const [year, setYear] = useState(initialDate.year)
  const [monthSeq, setMonthSeq] = useState(() =>
    monthIndexOf(initialCalendarType, initialDate.year, initialDate.month, initialCalendarType === 'lunar_leap'),
  )
  const [day, setDay] = useState(initialDate.day)

  const calendarType: CalendarType = lunar ? 'lunar' : 'solar'
  const months = monthsOf(calendarType, year)
  const seq = months.length === 0 ? 0 : Math.min(Math.max(monthSeq, 0), months.length - 1)
  const picked: PartnerMonth | undefined = months[seq]
  const selected: CalendarType = lunar ? (picked?.leap === true ? 'lunar_leap' : 'lunar') : 'solar'
  const maxDay = picked?.days ?? 0
  const boundedDay = maxDay === 0 ? day : Math.min(Math.max(day, 1), maxDay)
  const value = { year, month: picked?.month ?? 1, day: boundedDay }

  const switchCalendar = (nextLunar: boolean) => {
    setLunar(nextLunar)
    const next: CalendarType = nextLunar ? 'lunar' : 'solar'
    setMonthSeq(monthIndexOf(next, year, picked?.month ?? 1, false))
  }

  const handleYear = (nextYear: number) => {
    setYear(nextYear)
    // 윤달은 해마다 자리가 다르다. 연도를 바꾸면 같은 시퀀스 칸이 다른 달이 되므로 월 번호로 다시 잡는다.
    const nextSeq = monthIndexOf(calendarType, nextYear, picked?.month ?? 1, picked?.leap ?? false)
    setMonthSeq(nextSeq)
    const nextMonth = monthsOf(calendarType, nextYear)[nextSeq]
    setDay((current) => Math.min(current, nextMonth?.days ?? current))
  }

  const handleMonth = (nextSeq: number) => {
    setMonthSeq(nextSeq)
    setDay((current) => Math.min(current, months[nextSeq]?.days ?? current))
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDimmerClick={onClose}
      header={<BottomSheet.Header>상대방이 태어난 날은요?</BottomSheet.Header>}
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
        {[false, true].map((isLunar) => (
          <div key={String(isLunar)} style={{ flex: 1 }}>
            <Button
              display="block"
              size="medium"
              color={lunar === isLunar ? 'primary' : 'dark'}
              variant={lunar === isLunar ? 'fill' : 'weak'}
              aria-pressed={lunar === isLunar}
              onClick={() => switchCalendar(isLunar)}
            >
              {isLunar ? '음력' : '양력'}
            </Button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <WheelColumn
          label="년도 선택"
          options={YEAR_OPTIONS}
          value={year}
          format={(v) => `${v}년`}
          onChange={handleYear}
        />
        <WheelColumn
          key={`month-${calendarType}-${months.length}-${year}`}
          label="월 선택"
          options={months.map((_, i) => i)}
          value={seq}
          format={(i) => {
            const m = months[i]
            return m === undefined ? '' : formatMonthOption(m)
          }}
          onChange={handleMonth}
        />
        <WheelColumn
          key={`day-${maxDay}`}
          label="일 선택"
          options={rangeInclusive(1, maxDay)}
          value={boundedDay}
          format={(v) => `${v}일`}
          onChange={setDay}
        />
      </div>

      {lunar && (
        <>
          <Spacing size={8} />
          <Paragraph typography="st12">{describePartnerDate(selected, value)}</Paragraph>
        </>
      )}
    </BottomSheet>
  )
}

function PartnerTimeSheet({
  open,
  initialTime,
  onClose,
  onConfirm,
  onUnknown,
}: {
  open: boolean
  initialTime: { hour: number; minute: number }
  onClose: () => void
  onConfirm: (time: { hour: number; minute: number }) => void
  onUnknown: () => void
}) {
  const [hour, setHour] = useState(initialTime.hour)
  const [minute, setMinute] = useState(initialTime.minute)

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      onDimmerClick={onClose}
      header={<BottomSheet.Header>상대방은 몇 시에 태어났나요?</BottomSheet.Header>}
      headerDescription={
        <BottomSheet.HeaderDescription>
          24시간제로 골라 주세요. 모르면 아래에서 넘어갈 수 있어요.
        </BottomSheet.HeaderDescription>
      }
      cta={<BottomSheet.CTA onClick={() => onConfirm({ hour, minute })}>선택 완료</BottomSheet.CTA>}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
        <TextButton size="medium" variant="underline" onClick={onUnknown}>
          시간을 모르겠어요
        </TextButton>
      </div>
    </BottomSheet>
  )
}

export type { PartnerDraft }
