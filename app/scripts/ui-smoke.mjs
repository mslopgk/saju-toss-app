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
 *   4) 결과 화면이 계산 결과로 채워진다
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

    /* 4) 결과 화면 */
    await page.getByRole('button', { name: '결과 보기' }).click();
    await page.waitForTimeout(2800);
    const report = await page.locator('body').innerText();
    check(report.includes('당신의 사주 네 기둥'), '결과 화면이 뜬다');
    check(/[甲乙丙丁戊己庚辛壬癸]/.test(report), '계산된 천간이 화면에 있다');
    check(report.includes('이 리포트가 참고한 자료'), '근거 목록이 나온다');

    /* 5) 출처 표기에 저장소 경로가 없다 */
    check(!/\.md\b/.test(report), '출처에 .md 파일명이 없다');
    check(!/tables\.json|personality-data\.json/.test(report), '출처에 데이터 파일명이 없다');

    await shot('shot-2-report-top');
    for (const [n, dy] of [[3, 850], [4, 950], [5, 950]]) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(900);
      await shot(`shot-${n}-report`);
    }
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
