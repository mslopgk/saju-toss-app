import { useEffect, useReducer, useState } from 'react'
import { Button, Spacing } from '@toss/tds-mobile'
import {
  BottomCTA,
  ChipGroup,
  FieldGroup,
  FieldRow,
  Hint,
  NIGHT,
  Screen,
  ScreenTitle,
  SectionLabel,
} from '../../../shared/design'
import { MOTION, stagger } from '../../../shared/motion'
import { MBTI_AXIS_SPECS } from '../mbtiAxes'
import type { OnboardingDraft } from '../formState'
import {
  INITIAL_DRAFT,
  SEED_DATE,
  SEED_TIME,
  buildBirthInput,
  buildSelfReport,
  onboardingReducer,
} from '../formState'
import { describeBirthDate, formatBirthTime } from '../calendar'
import { findCityOrDefault } from '../cities'
import type { BirthInput } from '../schema'
import type { BloodTypeInput, Gender, SelfReport } from '../types'
import { fetchTossProfile, isPrefillAvailable } from '../../../shared/api/tossUser'
import {
  INITIAL_PREFILL_PHASE,
  PREFILL_BUTTON_LABEL,
  PREFILL_RETRY_LABEL,
  SOLAR_CONFIRM_DESCRIPTION,
  SOLAR_CONFIRM_NO,
  SOLAR_CONFIRM_QUESTION,
  SOLAR_CONFIRM_YES,
  applyTossPrefill,
  blocksSubmit,
  prefillNotice,
  shouldRequestAgreementAgain,
  showsPrefillButton,
  startsAutomatically,
  tossPrefillReducer,
} from '../tossPrefill'
import { BirthDateSheet } from './BirthDateSheet'
import { BirthPlaceSheet } from './BirthPlaceSheet'
import { BirthTimeSheet } from './BirthTimeSheet'

/**
 * 생년월일·출생시각·성별·출생지 입력 폼.
 *
 * 근거: docs/product.md(핵심 흐름 1단계) / C00 §1.2.2 §S0-3 §S0-4 §S0-2.
 * 상태는 이 컴포넌트 안에서 끝난다 — 다음 화면으로 넘길 값은 `onSubmit` 으로만 나간다.
 *
 * 달력(양력/음력·윤달)은 날짜 시트 안에서 고른다. 폼 본문에 토글을 따로 두지 않는 이유는,
 * 달력과 날짜가 **한 값**이기 때문이다 — 따로 두면 "양력을 골라 둔 채 음력 날짜"가 잠깐 존재한다.
 *
 * 엔진은 화면 검증을 통과한 입력도 거절할 수 있다(환산 후 지원 범위 밖 등). 그때는 호출자가
 * `engineError` 로 사용자용 문구를 되돌려 주고, 이 화면이 CTA 위에 인라인으로 보여 준다.
 */
export interface OnboardingFormProps {
  /**
   * 검증을 통과한 입력.
   *
   * 두 번째 인자 `selfReport` 는 **계산에 쓰이지 않는다** — MBTI·혈액형은 해석 문장에만 쓴다.
   * 그래서 엔진 입력(`BirthInput`)과 한 객체로 합치지 않고 따로 넘긴다.
   */
  onSubmit: (input: BirthInput, selfReport: SelfReport) => void
  /** 계산 엔진이 입력을 거절했을 때의 사용자용 문구. */
  engineError?: string | null
}

type SheetKind = 'date' | 'time' | 'place'

const NOT_SELECTED = '선택해 주세요'

const BLOOD_OPTIONS: readonly BloodTypeInput[] = ['A', 'B', 'O', 'AB']

/** 성별 두 값. 대운 방향 판정에 쓰이는 **계산 입력**이라 선택이 아니라 필수다. */
const GENDER_OPTIONS: readonly Gender[] = ['M', 'F']

export function OnboardingForm({ onSubmit, engineError = null }: OnboardingFormProps) {
  const [draft, dispatch] = useReducer(onboardingReducer, INITIAL_DRAFT)
  const [openSheet, setOpenSheet] = useState<SheetKind | null>(null)
  // 시트를 열 때마다 값을 올린다. TDS Wheel 이 비제어라 재마운트해야 초기값이 반영된다.
  const [sheetSession, setSheetSession] = useState(0)

  /**
   * 프리필 가능 여부는 **환경 상수**다(토스 앱 버전 · 동의 항목 키). 렌더마다 다시 물으면
   * WebView 밖에서 던지는 SDK 호출을 렌더마다 반복하게 되므로 마운트 때 한 번만 판정한다.
   * 불가능하면 버튼을 아예 그리지 않는다 — 눌러야 알 수 있는 실패를 만들지 않는다.
   */
  const [prefillAvailable] = useState(isPrefillAvailable)
  const [prefillPhase, dispatchPrefill] = useReducer(tossPrefillReducer, INITIAL_PREFILL_PHASE)

  const city = findCityOrDefault(draft.cityId)
  const built = buildBirthInput(draft)
  const notice = prefillNotice(prefillPhase)

  const openSheetOf = (kind: SheetKind) => {
    setSheetSession((session) => session + 1)
    setOpenSheet(kind)
  }
  const closeSheet = () => setOpenSheet(null)

  const handleGender = (gender: Gender) => {
    dispatch({ type: 'setGender', gender })
  }

  const handleBlood = (blood: BloodTypeInput) => {
    /*
      재탭 해제를 없앴다. 예전에는 같은 칩을 다시 누르면 "모름"으로 돌아갔는데, 혈액형이
      필수가 된 뒤로 그 동작은 **방금 열린 CTA 를 다시 잠그는 일**이 된다.
      잘못 골랐으면 다른 칩을 누르면 되고, 넷 중 하나는 반드시 참이다.
    */
    dispatch({ type: 'setBlood', blood })
  }

  const handleSubmit = () => {
    if (built.ok && !blocksSubmit(prefillPhase)) {
      onSubmit(built.value, buildSelfReport(draft))
    }
  }

  /**
   * 토스 동의 데이터로 생년월일·성별을 채운다.
   *
   * `fetchTossProfile` 은 throw 하지 않기로 되어 있지만(경계 모듈), 거부 핸들러를 그래도 단다 —
   * 여기서 프로미스가 깨지면 화면이 `loading` 에 영원히 갇힌다.
   */
  const handlePrefill = () => {
    if (prefillPhase === 'loading') {
      return
    }
    const requestAgreementAgain = shouldRequestAgreementAgain(prefillPhase)
    dispatchPrefill({ type: 'start' })
    void fetchTossProfile(undefined, { requestAgreementAgain }).then(
      (result) => {
        const applied = applyTossPrefill(result)
        // 값 적용과 단계 전이는 같은 결과에서 나온다(`applyTossPrefill` 은 순수함수다).
        // 프리필 값은 **양력 전제**다(토스에 달력 종류 필드가 없다). 그 전제를 사용자에게 확인받는
        // 것이 아래 `solarConfirm` 이고, 확인 전에는 `blocksSubmit` 이 제출을 막는다.
        if (applied.date !== null) {
          dispatch({ type: 'setDate', calendarType: 'solar', date: applied.date })
        }
        if (applied.gender !== null) {
          dispatch({ type: 'setGender', gender: applied.gender })
        }
        dispatchPrefill({ type: 'resolve', result })
      },
      () => {
        dispatchPrefill({ type: 'resolve', result: { ok: false, reason: 'FAILED' } })
      },
    )
  }

  /**
   * 화면이 뜨면 **버튼을 누르지 않아도** 한 번 불러온다.
   *
   * 의존성 배열이 비어 있는 것은 의도다 — `prefillPhase` 를 넣으면 단계가 바뀔 때마다 다시 부르고,
   * `handlePrefill` 은 렌더마다 새로 만들어지므로 넣으면 무한 루프가 된다. 마운트 때 한 번이면 충분하다.
   *
   * 이 시점의 단계는 항상 `idle` 이라 `shouldRequestAgreementAgain` 이 false 다 —
   * 즉 **이전에 거부한 사용자에게는 동의 화면을 다시 띄우지 않는다**(startsAutomatically 주석).
   */
  useEffect(() => {
    if (startsAutomatically(INITIAL_PREFILL_PHASE, prefillAvailable)) {
      handlePrefill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 프리필된 날짜가 음력이었다는 답.
   *
   * 날짜를 **버리지 않는다** — 사용자가 "음력이에요"라고 답했다는 것은 그 세 숫자가 음력 날짜라는
   * 뜻이므로, 버리면 같은 값을 다시 입력하게 만드는 셈이다. 윤달은 토스 데이터로 알 수 없어 평달로
   * 두고, 안내 문구가 확인을 요청한다. 음력에 없는 날짜(31일 등)면 리듀서가 비운다.
   */
  const handleLunarRejected = () => {
    dispatch({ type: 'setCalendarType', calendarType: 'lunar' })
    dispatchPrefill({ type: 'rejectSolar' })
  }

  const dateRow = (
    <FieldRow
      index={2}
      label="태어난 날"
      value={draft.date === null ? NOT_SELECTED : describeBirthDate(draft.calendarType, draft.date)}
      muted={draft.date === null}
      onClick={() => openSheetOf('date')}
    />
  )

  const timeRow = (
    <FieldRow
      index={3}
      label="태어난 시각"
      value={describeTime(draft)}
      muted={draft.time === null && !draft.timeUnknown}
      onClick={() => openSheetOf('time')}
    />
  )

  const placeRow = (
    <FieldRow
      index={4}
      label="태어난 곳"
      value={`${city.name} · ${city.source}`}
      onClick={() => openSheetOf('place')}
    />
  )

  /**
   * 양력 확인. **프리필된 날짜에만** 붙인다 — 사용자가 시트에서 직접 고른 날짜는 이미 "양력"이라고
   * 적힌 화면을 보고 고른 값이라 물을 것이 없다. 확인 중일 때만 유리판을 둘로 나눠 날짜 줄 바로 아래에 끼운다.
   */
  const solarConfirm = (
    <div style={{ padding: '12px 24px 4px' }} role="group" aria-label={SOLAR_CONFIRM_QUESTION}>
      <SectionLabel>{SOLAR_CONFIRM_QUESTION}</SectionLabel>
      <Spacing size={6} />
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: NIGHT.textDim }}>
        {SOLAR_CONFIRM_DESCRIPTION}
      </p>
      <Spacing size={10} />
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Button
            display="block"
            size="medium"
            color="primary"
            variant="fill"
            onClick={() => dispatchPrefill({ type: 'confirmSolar' })}
          >
            {SOLAR_CONFIRM_YES}
          </Button>
        </div>
        <div style={{ flex: 1 }}>
          <Button display="block" size="medium" color="dark" variant="weak" onClick={handleLunarRejected}>
            {SOLAR_CONFIRM_NO}
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <Screen bottomInset={150}>
      <Spacing size={20} />

      <ScreenTitle
        index={0}
        title="언제 태어났는지 알려주세요"
        subtitle="사주 네 기둥을 계산하는 데만 써요. 양력·음력 모두 괜찮아요."
      />

      <Spacing size={20} />

      {/* 원터치 경로. 미지원·미설정이면 이 블록은 존재하지 않는다 — 실패를 토스트로 알리지 않는다. */}
      {prefillAvailable && showsPrefillButton(prefillPhase) && (
        <div className={MOTION.rise} {...stagger(1)} style={{ padding: '0 20px 12px' }}>
          <Button
            display="block"
            size="large"
            color="primary"
            variant="weak"
            className={MOTION.press}
            loading={prefillPhase === 'loading'}
            onClick={handlePrefill}
          >
            {prefillPhase === 'declined' || prefillPhase === 'failed'
              ? PREFILL_RETRY_LABEL
              : PREFILL_BUTTON_LABEL}
          </Button>
          <Spacing size={8} />
          <Hint>생년월일과 성별만 가져와요. 이름·연락처·주소는 가져오지 않아요.</Hint>
        </div>
      )}

      {notice !== null && (
        <>
          <Hint>{notice}</Hint>
          <Spacing size={12} />
        </>
      )}

      {prefillPhase === 'confirmingSolar' ? (
        <>
          <FieldGroup index={2}>{dateRow}</FieldGroup>
          {solarConfirm}
          <Spacing size={10} />
          <FieldGroup index={3}>
            {timeRow}
            {placeRow}
          </FieldGroup>
        </>
      ) : (
        <FieldGroup index={2}>
          {dateRow}
          {timeRow}
          {placeRow}
        </FieldGroup>
      )}

      {draft.timeUnknown && (
        <>
          <Spacing size={10} />
          <Hint>
            시각을 몰라도 사주 세 기둥(연·월·일)은 그대로 나와요. 시주와 상승궁만 빼고 계산해요.
          </Hint>
        </>
      )}

      <Spacing size={26} />

      <div style={{ padding: '0 24px' }}>
        <SectionLabel index={5}>성별</SectionLabel>
        <Spacing size={10} />
        <ChipGroup
          index={5}
          options={GENDER_OPTIONS}
          value={draft.gender}
          onChange={handleGender}
          label={(g) => (g === 'M' ? '남성' : '여성')}
        />
      </div>
      <Spacing size={10} />
      <Hint>대운(大運)이 순행인지 역행인지를 성별로 판정해서 꼭 필요해요.</Hint>

      <Spacing size={26} />

      {/*
        자기신고 값. 사주 계산에는 전혀 쓰이지 않고 리포트 문장에만 쓴다.
        그래도 **필수 입력**이다 — 비운 채로 넘기면 리포트에서 두 항목이 조용히 빠지고,
        사용자는 자기 리포트가 왜 짧은지 알 길이 없다.
      */}
      <div style={{ padding: '0 24px' }}>
        <SectionLabel index={6}>MBTI와 혈액형</SectionLabel>
      </div>
      <Spacing size={6} />
      <Hint>사주 계산에는 쓰지 않고, 리포트의 두 항목을 만드는 데 써요. 네 줄에서 하나씩 골라 주세요.</Hint>

      <Spacing size={14} />

      {/*
        16개 목록 시트를 네 축 이지선다로 바꿨다. 목록은 스크롤이 필요했고 무엇보다
        **자기 유형을 통째로 외우고 있어야** 답할 수 있었다. 축별로 물으면 "나는 I 쪽이고
        T 쪽" 처럼 아는 사람도 답한다. 시트가 사라져 탭도 한 번 줄었다.
      */}
      <div style={{ padding: '0 24px' }}>
        {MBTI_AXIS_SPECS.map((axis, i) => (
          <div key={axis.key} style={{ paddingBottom: i === MBTI_AXIS_SPECS.length - 1 ? 0 : 12 }}>
            <p
              className={MOTION.rise}
              {...stagger(6 + i)}
              style={{ margin: '0 0 6px', fontSize: 13, color: NIGHT.textDim }}
            >
              {axis.title}
            </p>
            <ChipGroup
              index={6 + i}
              options={axis.options}
              value={draft.mbtiAxes[axis.key]}
              onChange={(value) => dispatch({ type: 'setMbtiAxis', patch: { [axis.key]: value } })}
              label={(option) => axis.label[option] ?? option}
            />
          </div>
        ))}
      </div>

      <Spacing size={18} />

      <div style={{ padding: '0 24px' }}>
        <SectionLabel index={7}>혈액형</SectionLabel>
        <Spacing size={10} />
        <ChipGroup index={7} options={BLOOD_OPTIONS} value={draft.blood} onChange={handleBlood} />
      </div>
      <Spacing size={10} />
      {/* 문서06 §A-2 / C18(縄田健悟 2014, n=11,729)이 반증을 확정했다. 입력 단계에서 미리 밝힌다. */}
      <Hint>혈액형과 성격의 관계는 확인된 근거가 없어요. 이 앱에서 혈액형은 문장의 말투만 정해요.</Hint>

      {!built.ok && built.reason === 'invalid' && (
        <>
          <Spacing size={16} />
          {built.messages.map((message) => (
            <Hint key={message} tone="warn">
              {message}
            </Hint>
          ))}
        </>
      )}

      {/* 계산 엔진이 거절한 경우. 화면 검증을 통과했는데도 엔진이 막는 경우가 남아 있다
          (지원 범위 밖 연도·해외 출생 표준시 누락 등) — 그때 사용자를 빈 화면에 두지 않는다. */}
      {engineError !== null && (
        <div role="alert">
          <Spacing size={16} />
          <Hint tone="warn">{engineError}</Hint>
        </div>
      )}

      {/* 양력 확인이 끝나지 않은 상태에서 제출을 막는 것이 이 기능의 안전장치다.
          여기서 막지 않으면 확인 문구만 있고 아무도 확인하지 않은 채 음력 생일이 엔진으로 넘어간다. */}
      <BottomCTA
        disabled={!built.ok || blocksSubmit(prefillPhase)}
        onClick={handleSubmit}
        caption="운세 콘텐츠예요. 과학적 예측이 아니에요."
      >
        결과 보기
      </BottomCTA>

      <BirthDateSheet
        key={`date-${sheetSession}`}
        open={openSheet === 'date'}
        calendarType={draft.calendarType}
        initialDate={draft.date ?? SEED_DATE}
        onClose={closeSheet}
        onConfirm={(calendarType, date) => {
          dispatch({ type: 'setDate', calendarType, date })
          // 시트에서는 달력까지 사용자가 직접 고른다 — 확인 대기 중이었다면 물을 것이 없어진다.
          dispatchPrefill({ type: 'pickedManually' })
          closeSheet()
        }}
      />

      <BirthTimeSheet
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

      <BirthPlaceSheet
        key={`place-${sheetSession}`}
        open={openSheet === 'place'}
        selectedCityId={draft.cityId}
        onClose={closeSheet}
        onSelect={(cityId) => {
          dispatch({ type: 'setCity', cityId })
          closeSheet()
        }}
      />

    </Screen>
  )
}

function describeTime(draft: OnboardingDraft): string {
  if (draft.timeUnknown) {
    return '모름 · 삼주(三柱)로 계산'
  }
  return draft.time === null ? NOT_SELECTED : formatBirthTime(draft.time)
}
