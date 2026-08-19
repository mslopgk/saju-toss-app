/**
 * UI 스모크 — **실제 브라우저에서 레이아웃을 보는 유일한 검증.**
 *
 * ## 왜 있는가
 * 나머지 테스트는 전부 `react-dom/server` 정적 렌더다. 트리가 그려지는지와 문구가 들어갔는지는
 * 보지만 **크기·위치는 보지 못한다.** 그 틈으로 날짜/시각 선택 휠이 통째로 깨진 채 나갔다:
 * TDS `Wheel` 은 최상위가 `height:100%` 라 고유 높이가 없고, 부모가 확정 높이를 주지 않으면
 * 선택칸(16%)과 그라데이션(각 42%)이 전부 0 으로 접힌다. 항목은 `position:absolute` +
 * `matrix3d` 라 **접혀도 예외가 나지 않고** 연도 201개가 한 줄에 겹쳐 그려질 뿐이었다.
 * 1,900개 테스트가 전부 초록인 채로.
 *
 * 그래서 이 스크립트는 "예외가 없다"가 아니라 **"높이가 0 이 아니다"** 를 본다.
 *
 * ## 무엇을 보는가
 *   1) 온보딩이 뜨고 날짜 시트가 열린다
 *   2) 세 휠(년·월·일)이 **펼쳐져 있다** — 중앙 항목 높이 > 임계값, 서로 다른 값이 여러 줄 보인다
 *   3) 터치 스와이프로 값이 실제로 바뀌고 폼에 반영된다
 *   4) 홈 화면이 AI 없이도 채워진다
 *   5) 깊이읽기 카드가 접혀 있고 펼쳐진다
 *   6) 뒤로 가기가 홈으로 모인다
 *   5) 출처 표기에 저장소 파일 경로가 없다
 *
 * ## 어떻게 도는가
 * 사용자의 시스템 Chrome 을 Playwright 로 몬다(`channel: 'chrome'`) — 브라우저를 따로
 * 내려받지 않는다. `playwright` 는 **dev 전용 의존**이고 앱 번들에 들어가지 않는다.
 *
 * 휠은 **터치 스와이프로만** 조작한다. 항목 탭은 위아래 그라데이션 오버레이(z-index 10)에 막혀
 * 실사용자가 쓸 수 없고, 히트테스트를 우회해 핸들러를 직접 부르면 목표의 20~27% 지점에서 선다.
 * 즉 탭 경로로 통과하는 스모크는 사용자가 겪는 것을 보지 않는 것이다.
 *
 * ## `--prefill` (토스 프리필 UI 확인)
 * "토스 정보로 채우기" 블록은 **동의 항목 키 + 토스 앱 지원** 둘 다 있어야 그려진다. 그래서
 * 평소 dev·preview 에서는 블록 자체가 존재하지 않고, 아무도 렌더된 모습을 본 적이 없게 된다.
 * SDK 의 `isSupported()` 가 보는 것은 전역 하나뿐이므로(`window.__appsInTossConstants`,
 * `getConstant` 구현), 그것만 심어 주면 **프로덕션 코드를 고치지 않고** 블록을 띄울 수 있다.
 *
 *   VITE_TOSS_CONSENT_KEY=preview npm run build && npm run ui-smoke -- --prefill
 *
 * ⚠ 여기까지가 한계다. 버튼을 **누른 뒤**의 경로(동의 → 생년월일 수신 → "이 날짜가 양력이 맞나요?"
 *   확인 블록)는 호스트 브릿지가 실제로 응답해야 하므로 **토스 앱 안에서만** 확인할 수 있다.
 *   그 분기의 로직 자체는 `tossPrefill.test.ts` 가 전수로 고정한다 — 여기서 못 보는 것은 레이아웃뿐이다.
 *
 * 사용:
 *   npm run build && npm run ui-smoke              # 프로덕션 빌드를 본다(개발 오버레이 없음)
 *   npm run ui-smoke -- --shots out/               # 스토어 스크린샷(636x1048)도 함께 굽는다
 *   npm run ui-smoke -- --url http://localhost:5173  # 이미 떠 있는 서버를 본다
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

/** 조작용 뷰포트. 시트(240px 휠 + 헤더 + CTA)가 들어가는 실제 폰 크기. */
const DRIVE = { width: 390, height: 860 };
/** 스토어 스크린샷 규격 636x1048 을 물리 픽셀로 그대로 만드는 조합. 콘솔은 리사이즈해 주지 않는다. */
const SHOT = { width: 318, height: 524 };

/**
 * 휠이 "펼쳐졌다"고 볼 최소 높이(px).
 * 정상이면 중앙 항목이 30px 안팎이고, 접히면 0~5px 다. 그 사이 어디를 잘라도 되지만
 * 너무 크게 잡으면 폰트 스케일 설정에 따라 흔들리므로 접힘만 확실히 잡는 값으로 둔다.
 */
const MIN_CENTERED_HEIGHT = 14;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const failures = [];
const notes = [];
function check(ok, label, detail = '') {
  if (ok) notes.push(`  ok   ${label}`);
  else failures.push(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
}

/** `vite preview` 를 띄우고 주소를 돌려준다. `--url` 이 주어지면 아무것도 띄우지 않는다. */
async function serve() {
  const given = arg('url');
  if (given !== undefined) return { url: given, stop: () => {} };
  if (!existsSync('dist/index.html')) {
    throw new Error('dist/index.html 이 없다. `npm run build` 를 먼저 돌려야 한다.');
  }
  const port = 4183;
  // `npx` 를 쓰지 않고 로컬 vite 진입점을 직접 부른다 — shell 을 켜지 않으므로 인자 이스케이프
  // 문제(DEP0190)가 없고, 윈도우/유닉스에서 같은 코드로 돈다.
  const child = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--host', '127.0.0.1'],
    { stdio: 'ignore' },
  );
  const url = `http://127.0.0.1:${port}/`;
  // 포트가 열릴 때까지 기다린다(고정 sleep 대신 실제로 응답하는지 본다).
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) break;
    } catch {
      /* 아직 안 떴다 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { url, stop: () => child.kill() };
}

async function main() {
  const shotsDir = arg('shots');
  if (shotsDir !== undefined) mkdirSync(shotsDir, { recursive: true });

  const server = await serve();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({
    viewport: DRIVE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const cdp = await page.context().newCDPSession(page);

  // `--prefill` 일 때만 토스 WebView 인 척한다. 자세한 이유는 파일 상단 주석.
  if (process.argv.includes('--prefill')) {
    await page.addInitScript(() => {
      window.__appsInTossConstants = { isGetConsentedUserDataSupported: true };
    });
  }

  const swipe = async (x, y, dy, steps = 14) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= steps; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + (dy * i) / steps, id: 1 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1400);
  };

  /** 휠 한 칸의 실제 상태. 접혔는지 판정하는 데 필요한 값만 재서 돌려준다. */
  const wheelState = (label) =>
    page.evaluate((l) => {
      const rg = document.querySelector(`[role=radiogroup][aria-label="${l}"]`);
      if (rg === null) return null;
      const items = [...rg.querySelectorAll('[role=radio]')];
      let best = { h: 0, t: '' };
      let visible = 0;
      const texts = new Set();
      for (const el of items) {
        const r = el.getBoundingClientRect();
        if (r.height > best.h) best = { h: r.height, t: el.textContent.trim() };
        if (r.height > 6) {
          visible += 1;
          texts.add(el.textContent.trim());
        }
      }
      return { total: items.length, centered: best.t, centeredHeight: best.h, visible, distinct: texts.size };
    }, label);

  const shot = async (name) => {
    if (shotsDir === undefined) return;
    await page.setViewportSize(SHOT);
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
    await page.setViewportSize(DRIVE);
    await page.waitForTimeout(300);
  };

  try {
    await page.goto(server.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    /* 1) 온보딩 */
    const bodyText = await page.locator('body').innerText();
    check(bodyText.includes('언제 태어났는지'), '온보딩이 렌더된다');

    if (process.argv.includes('--prefill')) {
      check(
        bodyText.includes('이름·연락처·주소는 가져오지 않아요'),
        '프리필 블록이 렌더된다',
        '동의 항목 키가 빌드에 없다 — VITE_TOSS_CONSENT_KEY 를 주고 다시 빌드해야 한다',
      );
      // 프리필은 **버튼을 누르지 않아도** 마운트 때 스스로 부른다. 여기(브릿지 없는 데스크톱)에서는
      // 그 호출이 실패로 끝나는 것이 정상이고, 그 흔적이 보이면 자동 호출이 실제로 돌았다는 뜻이다.
      // 안내 문구가 붙거나, 버튼 라벨이 '다시 시도' 로 바뀌거나 둘 중 하나다.
      const autoRan =
        /불러오지 못했어요|취소했어요|가져올 생년월일/.test(bodyText) ||
        bodyText.includes('다시 시도');
      check(
        autoRan,
        '버튼을 누르지 않아도 자동으로 불러온다',
        '자동 호출 흔적이 없다 — OnboardingForm 의 마운트 useEffect(startsAutomatically)를 확인할 것',
      );
      // 자동 호출이 실패해도 수동 입력 폼은 그대로 있어야 한다. 이게 무너지면 사용자가 갇힌다.
      check(
        bodyText.includes('태어난 날') && bodyText.includes('성별') && bodyText.includes('결과 보기'),
        '자동 호출이 실패해도 수동 입력 폼이 남아 있다',
      );
      await shot('shot-0-prefill');
    }

    /* 2) 날짜 시트 — 휠이 펼쳐져 있는가 (이 스크립트의 존재 이유) */
    await page.getByText('태어난 날').click();
    await page.waitForTimeout(1100);
    for (const label of ['년도 선택', '월 선택', '일 선택']) {
      const s = await wheelState(label);
      if (s === null) {
        check(false, `${label} 휠이 있다`, '요소를 못 찾았다');
        continue;
      }
      check(
        s.centeredHeight >= MIN_CENTERED_HEIGHT,
        `${label} 휠이 접히지 않았다`,
        `중앙 항목 높이 ${s.centeredHeight.toFixed(1)}px (최소 ${MIN_CENTERED_HEIGHT}px). ` +
          'TDS Wheel 은 부모 확정 높이가 없으면 0 으로 접힌다 — WheelColumn 의 height 를 확인할 것',
      );
      check(
        s.distinct >= 3,
        `${label} 휠에 여러 항목이 보인다`,
        `서로 다른 값 ${s.distinct}개만 보인다(접히면 전부 한 줄에 겹친다)`,
      );
    }

    /* 3) 스와이프로 값이 바뀌는가 */
    const before = (await wheelState('년도 선택'))?.centered ?? '';
    const box = await page.locator('[role=radiogroup][aria-label="년도 선택"]').boundingBox();
    if (box !== null) {
      await swipe(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), 120);
    }
    const after = (await wheelState('년도 선택'))?.centered ?? '';
    check(before !== '' && after !== '' && before !== after, '스와이프로 연도가 바뀐다', `${before} → ${after}`);
    check(
      (await page.locator('body').innerText()).includes('태어난 날이 언제인가요?'),
      '휠을 쓸어도 시트가 닫히지 않는다',
    );

    await page.getByRole('button', { name: '선택 완료' }).click();
    await page.waitForTimeout(800);
    check(
      !(await page.locator('body').innerText()).includes('태어난 날\n선택해 주세요'),
      '고른 날짜가 폼에 반영된다',
    );

    /* 시각 시트도 같은 구조다 — 휠이 두 칸뿐이라 따로 본다 */
    await page.getByText('태어난 시각').click();
    await page.waitForTimeout(1100);
    for (const label of ['시 선택', '분 선택']) {
      const s = await wheelState(label);
      check(
        s !== null && s.centeredHeight >= MIN_CENTERED_HEIGHT,
        `${label} 휠이 접히지 않았다`,
        `중앙 항목 높이 ${(s?.centeredHeight ?? 0).toFixed(1)}px`,
      );
    }
    await page.getByRole('button', { name: '선택 완료' }).click();
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: '남성', exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'A', exact: true }).click();
    await page.waitForTimeout(200);
    await shot('shot-1-onboarding');

    /* 4) 홈 화면 — AI 서버 없이도 채워진다 */
    await page.getByRole('button', { name: '결과 보기' }).click();
    await page.waitForTimeout(2800);
    const home = await page.locator('body').innerText();

    // 번들에는 해석 서버 주소가 들어 있지만, 이 스모크는 localhost 에서 띄우므로 서버가
    // 오리진을 거부한다(403). 즉 여기 보이는 글은 **전부 규칙 기반**이고, 이 검사는
    // "서버가 요청을 거절해도 홈이 비지 않는다"를 고정한다 — 폴백 경로 그 자체다.
    check(home.includes('한 단어로 말하면'), '홈이 뜬다');
    check(/(뻗는|밝히는|품는|벼리는|스미는)\s(결|사람|힘)/.test(home), 'AI 없이 한 단어가 채워진다');
    check(home.includes('타고난 기운의 분포'), '오행 분포가 나온다');
    for (const label of ['나무', '불', '흙', '쇠', '물']) {
      check(home.includes(label), `오행 막대 ${label} 가 있다`);
    }

    // 퍼센트 다섯 개가 실제 숫자로 나온다. `{percent}%` 를 SSR 이 쪼개던 종류의 사고를
    // 실브라우저에서도 한 번 더 막는다.
    const percents = home.match(/\d+%/g) ?? [];
    check(percents.length >= 5, '오행 퍼센트 다섯 개가 찍힌다', percents.join(' '));

    // 오브젝트 그림. 없으면 텍스트만 그리는 것이 정상이므로 실패가 아니라 기록만 남긴다.
    const objectCount = await page.locator('img[alt*="오브젝트"]').count();
    notes.push(`   · 오행 오브젝트 이미지 ${objectCount}장`);

    await shot('shot-2-home');
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(700);
    await shot('shot-3-home-bars');

    /*
      본문 마지막 줄이 하단 CTA 바 뒤에 깔리지 않는가.

      CTA 바는 `position: fixed` 라 문서 흐름에서 빠져 있어 아무리 스크롤해도 그 뒤의 내용은
      드러나지 않는다 — 본문 아래 패딩(`Screen` 의 `bottomInset`)으로만 피할 수 있다.
      깨져도 예외가 나지 않고 마지막 줄만 조용히 사라지므로 여기서 잡는다.

      **작은 화면에서, 문서 맨 아래까지 내린 뒤에** 잰다. 조작용 뷰포트(390×860)는 세로가
      넉넉하고 `scrollIntoViewIfNeeded()` 는 요소를 화면 가운데로 가져오므로, 둘 중 하나라도
      빠지면 패딩이 모자라도 통과하는 헛검사가 된다(실제로 두 번 그렇게 썼다).
    */
    /*
      스크롤 최상단에서도 CTA 가 바닥에 붙어 있는가.

      `position: fixed` 는 조상의 transform 아래에서 absolute 처럼 굴기 때문에, 화면 전환
      애니메이션이 도는 동안·직후에 자리가 어긋날 수 있다. 맨 아래에서만 재면 그 순간을 놓친다.
    */
    await page.setViewportSize(SHOT);
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.waitForTimeout(400);
    const atTop = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('자세히 보기'),
      );
      if (btn === undefined) return null;
      const r = btn.getBoundingClientRect();
      return { bottom: r.bottom, top: r.top, viewport: window.innerHeight };
    });
    check(
      atTop !== null && atTop.viewport - atTop.bottom < 40 && atTop.top < atTop.viewport,
      '최상단에서도 CTA 가 화면 안에 있다',
      atTop === null
        ? '버튼을 못 찾았다'
        : `버튼 ${Math.round(atTop.top)}~${Math.round(atTop.bottom)} / 뷰포트 ${atTop.viewport}`,
    );

    const lastLine = page.getByText('다섯을 합치면 80점이 됩니다', { exact: false });
    await page.evaluate(() => { window.scrollTo(0, document.documentElement.scrollHeight); });
    await page.waitForTimeout(600);
    const lastBox = await lastLine.boundingBox();
    const ctaBox = await page.getByRole('button', { name: '자세히 보기' }).boundingBox();

    /*
      CTA 바가 뷰포트 바닥에 붙어 있는가.

      `position: fixed` 는 조상에 `transform`·`filter`·`perspective` 가 걸리면 **조용히
      absolute 처럼** 동작한다. 화면 전환 애니메이션(`m-screen`)이 `<main>` 에 transform 을
      쓰므로 이 함정이 실재하고, 걸리면 CTA 가 화면 밖으로 밀려 눌리지 않는다.
    */
    const anchored = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('자세히 보기'),
      );
      if (btn === undefined) return null;
      return { bottom: btn.getBoundingClientRect().bottom, viewport: window.innerHeight };
    });
    check(
      anchored !== null && anchored.viewport - anchored.bottom < 40,
      'CTA 바가 뷰포트 바닥에 붙어 있다',
      anchored === null
        ? '버튼을 못 찾았다'
        : `버튼 하단 ${Math.round(anchored.bottom)} / 뷰포트 ${anchored.viewport}`,
    );
    check(
      lastBox !== null && ctaBox !== null && lastBox.y + lastBox.height <= ctaBox.y,
      '본문 마지막 줄이 하단 CTA 에 가리지 않는다',
      lastBox === null || ctaBox === null
        ? '요소를 못 찾았다'
        : `본문 하단 ${Math.round(lastBox.y + lastBox.height)} / CTA 상단 ${Math.round(ctaBox.y)}`,
    );
    await shot('shot-3b-home-bottom');
    await page.setViewportSize(DRIVE);
    await page.waitForTimeout(300);

    /*
      모션이 콘텐츠를 가두지 않는가.

      진입 애니메이션은 전부 `from`-only 키프레임이라 종료 상태가 요소의 제 모습이다.
      누군가 `to { opacity: 1 }` 이나 기본 스타일 `opacity: 0` 을 적으면 그 규칙이 깨지고,
      모션을 끈 사용자에게는 **화면이 통째로 투명해진다.**

      `emulateMedia` 는 즉시 반영된다 — 리로드하면 온보딩으로 돌아가 이후 단계가 전부 깨진다.
    */
    const readOpacity = () =>
      page.evaluate(() => {
        // 장식(aria-hidden)은 뺀다. 후광·배경은 일부러 반투명이라 여기 섞이면 헛경보가 난다.
        const nodes = [
          ...document.querySelectorAll('.m-rise, .m-pop, .m-fade, .m-screen'),
        ].filter((n) => n.closest('[aria-hidden="true"]') === null);
        return nodes.map((n) => Number(getComputedStyle(n).opacity));
      });

    /*
      **값을 비교하지 않고 절대값을 본다.**
      처음에는 "모션 켰을 때와 껐을 때가 같은가"로 짰는데, 기본 스타일에 `opacity: 0` 을 두는
      실수는 **양쪽 모드 모두** 0 이라 비교로는 걸리지 않는다(실제로 그 실수를 심어 확인했다).
      그 실수야말로 잡아야 할 것이므로, 내용을 가진 요소는 두 모드 모두에서 불투명해야 한다.

      innerText 검사로는 못 잡는다 — `opacity: 0` 은 텍스트를 DOM 에서 지우지 않는다.
    */
    const settled = await readOpacity();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(400);
    const reduced = await readOpacity();
    await page.emulateMedia({ reducedMotion: null });

    const faded = [...settled, ...reduced].filter((o) => o < 0.9);
    check(
      settled.length > 0 && reduced.length === settled.length && faded.length === 0,
      '모션이 콘텐츠를 투명하게 가두지 않는다',
      faded.length === 0
        ? `${settled.length}개 × 2모드 검사`
        : `투명한 요소 ${faded.length}개 (최소 ${Math.min(...faded)})`,
    );

    /* 5) 깊이읽기 — 카드가 접혀 있고 펼치면 본문이 나온다 */
    await page.getByRole('button', { name: '자세히 보기' }).click();
    await page.waitForTimeout(2500);
    const detail = await page.locator('body').innerText();
    check(detail.includes('깊이 읽기'), '깊이읽기가 뜬다');
    // 읽을 거리가 표보다 위에 있어야 한다. 위치로 확인한다 — 둘 다 존재하는 것만으로는
    // 예전처럼 표가 맨 위에 있는 상태와 구분되지 않는다.
    check(
      detail.indexOf('이 리포트가 참고한 자료') > 0 &&
        detail.indexOf('사주 네 기둥') > detail.indexOf('오늘 해볼 만한 한 가지'),
      '깊이읽기는 읽을 거리로 시작한다',
    );
    check(/[甲乙丙丁戊己庚辛壬癸]/.test(detail), '계산된 천간이 화면에 있다');
    check(detail.includes('이 리포트가 참고한 자료'), '근거 목록이 나온다');

    /* 6) 출처 표기에 저장소 경로가 없다 */
    check(!/\.md\b/.test(detail), '출처에 .md 파일명이 없다');
    check(!/tables\.json|personality-data\.json/.test(detail), '출처에 데이터 파일명이 없다');

    await shot('shot-4-detail-top');

    /*
      카드 펼치기.

      **위치로 집는다(nth), 문구로 집지 않는다.** `getByRole({name:/더 보기/}).first()` 를 쓰면
      클릭 뒤 그 카드의 문구가 "접기"로 바뀌면서 `.first()` 가 **다음 카드로 옮겨간다** —
      그러면 길이 비교가 서로 다른 두 카드를 재게 되고, 실제로 그렇게 해서 "52자 → 34자"라는
      거짓 실패를 봤다. 아래 로케이터는 DOM 순서에 묶여 있어 클릭 뒤에도 같은 카드를 가리킨다.
    */
    const toggles = page.locator('button[aria-expanded]');
    const cardCount = await toggles.count();
    check(cardCount > 1, '섹션이 카드로 쪼개져 있다', `카드 ${cardCount}개`);

    // 첫 장은 펼쳐 둔다(defaultOpen). 전부 접혀 있으면 읽을 것이 없어 보인다.
    check(
      (await toggles.first().getAttribute('aria-expanded')) === 'true',
      '첫 카드는 펼쳐진 채로 시작한다',
    );

    if (cardCount > 1) {
      const target = toggles.nth(1);
      const card = target.locator('xpath=..');
      check(
        (await target.getAttribute('aria-expanded')) === 'false',
        '둘째 카드부터는 접혀 있다',
      );
      /*
        **글자 수가 아니라 높이로 잰다.**
        펼침을 grid(`0fr → 1fr`)로 하기 때문에 본문은 접혀 있어도 DOM 에 남고 `innerText` 에
        잡힌다. 글자 수로 짰더니 오히려 줄었다(525→482) — 펼치면 미리보기 문단이 사라지기
        때문이다. 실제로 변하는 값은 카드의 렌더 높이다.
      */
      const cardHeight = async () => (await card.boundingBox())?.height ?? 0;
      const beforeOpen = await cardHeight();
      await target.click();
      await page.waitForTimeout(600);
      const afterOpen = await cardHeight();
      check(
        afterOpen > beforeOpen + 8,
        '카드를 누르면 본문이 펼쳐진다',
        `${Math.round(beforeOpen)}px → ${Math.round(afterOpen)}px`,
      );
      check(
        (await target.getAttribute('aria-expanded')) === 'true',
        '펼친 카드는 aria-expanded 가 true 다',
      );
      await shot('shot-5-detail-expanded');
    }

    for (const [n, dy] of [[6, 950], [7, 950]]) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(900);
      await shot(`shot-${n}-detail`);
    }

    /* 7) 뒤로 가기는 한 칸씩이다 */
    await page.getByRole('button', { name: '홈으로' }).click();
    await page.waitForTimeout(1200);
    const back = await page.locator('body').innerText();
    check(back.includes('한 단어로 말하면'), '깊이읽기에서 나오면 홈으로 온다');
    check(!back.includes('언제 태어났는지'), '온보딩까지 되돌아가지 않는다');

    /*
      8) 궁합 — 지금까지 스모크가 한 번도 들어가 보지 않은 화면이다.

      궁합은 지연 청크(`CompatPage`) 뒤에 있고 상대방 입력 폼을 한 번 더 거친다.
      여기가 비어 있었다는 것은 그 경로 전체가 실브라우저에서 검증된 적이 없었다는 뜻이다.
    */
    await page.getByRole('button', { name: '자세히 보기' }).click();
    await page.waitForTimeout(1800);
    await page.getByRole('button', { name: '궁합 보기' }).click();
    await page.waitForTimeout(2200);

    const partner = await page.locator('body').innerText();
    check(partner.includes('상대방은 언제 태어났나요'), '상대방 입력 화면이 뜬다');
    await shot('shot-8-partner');

    // 날짜·성별 둘 다 계산 입력이라 없으면 제출이 잠긴다. 잠금이 실제로 걸리는지도 함께 본다.
    const submit = page.getByRole('button', { name: '궁합 보기' });
    check(await submit.isDisabled(), '입력 전에는 제출이 잠긴다');

    /*
      상대방 폼은 온보딩과 달리 날짜·시각이 **비어서 시작한다**(`missingPartnerFields`:
      date / time / gender 셋). 시트를 두 번 거쳐야 제출이 열린다 — 시각을 빼먹었더니
      "제출이 열린다" 검사가 조용히 실패하고 그 다음 클릭이 30초를 기다리다 죽었다.
    */
    await page.getByRole('button', { name: /태어난 날/ }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: '선택 완료' }).click();
    await page.waitForTimeout(700);

    await page.getByRole('button', { name: /태어난 시각/ }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: '선택 완료' }).click();
    await page.waitForTimeout(700);

    await page.getByRole('button', { name: '여성', exact: true }).click();
    await page.waitForTimeout(400);
    check(!(await submit.isDisabled()), '날짜·시각·성별을 채우면 제출이 열린다');

    await submit.click();
    await page.waitForTimeout(2500);
    const compat = await page.locator('body').innerText();
    check(/\d+점/.test(compat), '궁합 점수가 나온다', (compat.match(/\d+점/) ?? [''])[0]);
    check(compat.includes('사주 궁합'), '항목별 배점이 나온다');
    check(compat.includes('이 리포트가 참고한 자료'), '궁합 근거 목록이 나온다');
    check(!/\.md/.test(compat), '궁합 출처에 .md 파일명이 없다');
    await shot('shot-9-compat');
  } catch (error) {
    /*
      여기까지 통과한 검사를 **버리지 않는다.**
      예전에는 예외가 나면 `notes` 를 출력하기 전에 스택만 뱉고 끝나서, 어느 단계에서
      멈췄는지 알 수 없었다 — 궁합 단계를 추가하다 실제로 그 벽에 부딪혔다.
    */
    for (const line of notes) console.log(line);
    // 실패한 검사는 notes 에 들어가지 않는다. 중단 시에도 함께 보여야 원인이 보인다.
    for (const line of failures) console.log(line);
    // 첫 줄만 찍으면 '무엇을 기다리다 멈췄는지'가 사라진다. 앞 세 줄을 남긴다.
    const first = error instanceof Error ? error.message.split(String.fromCharCode(10)).slice(0, 3).join(' | ') : String(error);
    console.log('');
    console.log('  중단: ' + first);
    process.exitCode = 1;
    return;
  } finally {
    await browser.close();
    server.stop();
  }

  for (const line of notes) process.stdout.write(`${line}\n`);
  if (failures.length > 0) {
    process.stdout.write(`\n${failures.join('\n')}\n\nUI 스모크 실패 ${failures.length}건\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`\nUI 스모크 통과 (${notes.length}건)\n`);
}

await main();
