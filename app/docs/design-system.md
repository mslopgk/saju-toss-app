# 디자인 시스템

## 패키지

| 패키지 | 버전 | 역할 |
|---|---|---|
| `@toss/tds-mobile` | 2.5.1 | 컴포넌트·토큰 본체 |
| `@toss/tds-mobile-ait` | 2.5.1 | 앱인토스 WebView 어댑터 (Provider) |
| `@emotion/react` | ^11 | TDS 스타일 런타임 (peer) |

React 는 18 고정. TDS peer 범위가 `^16.8.3 || ^17 || ^18` 이다.

## Provider 위치

`src/main.tsx` 에서 **한 번만** 감싼다.

```tsx
<TDSMobileAITProvider>
  <App />
</TDSMobileAITProvider>
```

- `TDSMobileAITProvider` 는 내부에서 `GlobalCSSVariables` 와 `SafeAreaInsets` 를 렌더한다. **둘을 따로 감싸면 중복이다.**
- `brandPrimaryColor` 를 넘기지 않으면 TDS 기본색(`blue500`)을 쓴다. 현재는 넘기지 않는다.
- Provider 가 `colorPreference: 'light'` 를 고정하므로 다크모드는 동작하지 않는다.
- `apps-in-toss.config.ts` 의 `brand.primaryColor` 는 `#3182F6` (토스 블루). TDS 기본색과 같은 계열이라 그대로 둔다.

## 전역 스타일 규칙

`src/index.css` 는 **박스모델·마진 리셋과 탭 하이라이트 제거만** 담는다. 색·폰트·간격·다크모드를 여기서 정의하면 TDS 시각 언어를 덮어쓴다.

Vite 스캐폴딩이 넣은 데모 스타일(보라색 accent, 18px system-ui 등 111줄)은 교체했다. `src/App.css` 는 Vite 산출물이라 파일은 남겨두되 import 하지 않는다.

## 사용 중인 컴포넌트

props 는 전부 `node_modules/@toss/tds-mobile/dist/esm/index.d.ts` 에서 확인한 것만 적는다.

| 컴포넌트 | 사용처 | 확인한 props |
|---|---|---|
| `Top` | `ResultPage`, `OnboardingForm` | `title` (필수, ReactNode), `subtitleTop`, `subtitleBottom`, `upper`, `lower`, `right`, `rightVerticalAlign?: 'center' \| 'end'`, `upperGap`, `lowerGap` |
| `List` | `ResultPage`, `OnboardingForm`, `ReportView` | `typography?: MobileTypography` (기본 `t5`), `paddingBottom?: number \| string`, + `ul`/`ol` 속성 |
| `ListRow` | `ResultPage`, `OnboardingForm`, `ReportView` | `contents?`, `left?`, `right?`, `arrowType?: 'right' \| 'up' \| 'down'`, `withTouchEffect?`, `border?`, `verticalPadding?: 'small' \| 'medium' \| 'large' \| 'xlarge'`(8/12/16/24px), `horizontalPadding?: 'small' \| 'medium'`, `disabled?`, `disabledStyle?: 'type1' \| 'type2'` (`onClick` 은 `li` 속성으로 전달) |
| `ListRow.Texts` | 같음 | `type` 판별 유니온 — `'2RowTypeA'` 는 `top` + `bottom` (`ReactElement \| string`), `topProps`/`bottomProps` |
| `Paragraph` | `ResultPage`, `OnboardingForm`, `ReportView` | `typography` (필수, `t1`~`t7`/`st1`~`st13`), `fontWeight?`, `textAlign?`, `color?: string` (**CSS 색상 문자열**이지 토큰명이 아니다 → `var(--adaptiveGrey700)` 처럼 쓴다), `display?`, `ellipsisAfterLines?` |
| `Badge` | `ResultPage` (경고 배지) | `size: 'large' \| 'medium' \| 'small' \| 'xsmall'`, `variant: 'fill' \| 'weak'`, `color: 'blue' \| 'teal' \| 'green' \| 'red' \| 'yellow' \| 'elephant'`, `children?` |
| `Spacing` | 전역 | `size` |
| `Button` | `OnboardingForm` (성별·혈액형 선택) | `display?: 'inline' \| 'block' \| 'full'`, `size?: 'small' \| 'medium' \| 'large' \| 'xlarge'`, `color?: 'primary' \| 'danger' \| 'light' \| 'dark'`, `variant?: 'fill' \| 'weak'`, + button 속성(`onClick`·`aria-pressed`) |
| `FixedBottomCTA` | `ResultPage`, `OnboardingForm` | `children` (필수), `topAccessory?`, `bottomAccessory?`, `background?: 'default' \| 'none'`, `hasSafeAreaPadding?`, + `CTAButtonProps`(`disabled`·`onClick` 등 button 속성) |
| `BottomSheet` | `BirthDateSheet` 외 시트 4종 | `open` (필수), `onClose`, `onDimmerClick?: () => void`, `maxHeight?: number \| \`${number}vh\``, `expandedMaxHeight?`, `header?: ReactNode`, `headerDescription?: ReactNode`, `children?` |
| `BottomSheet.Select` | `BirthPlaceSheet`, `MbtiSheet` | `options: { name: string; value: string; className?; disabled?; hideUnCheckedCheckBox? }[]` (필수), `value?: string`, `onChange: (e: ChangeEvent<HTMLInputElement>) => void` (필수), `animation?`, `animationDelay?` |
| `BottomSheet.Header` / `.HeaderDescription` | 시트 4종 | `children` (라디오 목록 위 제목·설명) |

### 색 토큰

`Paragraph`/인라인 스타일에 쓰는 색은 `TDSMobileAITProvider` 가 렌더하는 `GlobalCSSVariables` 의
CSS 변수로 참조한다. 실제로 정의돼 있는 이름만 쓴다(확인: `grep -oE "\-\-adaptive[A-Za-z0-9]+" node_modules/@toss/tds-mobile/dist/esm/index.js | sort -u`).

현재 쓰는 것: `--adaptiveGrey50`(카드 배경), `--adaptiveGrey700`(보조 텍스트), `--adaptiveRed500`(오류 텍스트).

## 로컬 UI 예외

없음. TDS 에 없는 표현이 필요해질 때만 `src/shared/ui` 에 만든다.

## API 확인 방법

MCP 문서 도구가 없을 때는 설치된 패키지의 타입 정의를 직접 읽는다. **기억으로 props 를 추측하지 않는다.**

```bash
# 전체 컴포넌트 목록
grep -oE "^export declare (const|function) [A-Z][A-Za-z0-9_]*" \
  node_modules/@toss/tds-mobile/dist/esm/index.d.ts

# 특정 컴포넌트의 props 타입 — `type` / `interface` 어느 쪽인지 모르므로 둘 다 잡는다
grep -nE "declare (type|interface) ButtonProps" node_modules/@toss/tds-mobile/dist/esm/index.d.ts

# props 값의 유니온은 별칭으로 한 번 더 숨어 있다(`size?: TDSButtonSize`)
grep -n "declare type TDSButton" node_modules/@toss/tds-mobile/dist/esm/index.d.ts
```

> 실측 주의: `Button` 의 props 는 `ButtonProps`(interface)이고 값 유니온은 `TDSButtonSize` /
> `TDSButtonColor` / `TDSButtonVariant` / `TDSButtonDisplay` 로 분리돼 있다. `ButtonProps` 만 grep 하면
> `size?: TDSButtonSize` 까지만 보이고 실제 허용값을 못 본다 — 별칭을 한 번 더 따라가야 한다.

확인된 컴포넌트 목록에는 `Button` `CTAButton` `FixedBottomCTA` `BottomSheet` `DatePicker` `List` `ListRow` `Badge` `Chip` `Checkbox` `AlertDialog` `ConfirmDialog` `Loader` `BarChart` `DoughnutChart` `Menu` `Modal` 등이 있다. 필요할 때 위 방법으로 props 를 확인해 쓴다.
