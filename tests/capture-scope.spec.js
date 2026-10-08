// Capture scope: the extension's content script records typing rhythm only in
// ordinary text fields. Page-level, with the Chrome API mocked the way the
// Writer specs do: the five capture files are loaded in manifest order into a
// plain page and real keys are typed into each kind of field.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', 'extension');
const CHROME_MOCK = fs.readFileSync(path.join(__dirname, 'chrome-mock.js'), 'utf8');
const CAPTURE_FILES = ['src/crypto-utils.js', 'src/passport-utils.js', 'src/war-score.js', 'src/biometrics.js', 'src/content.js'];

const PAGE = `<!DOCTYPE html><html><body>
  <textarea id="ta"></textarea>
  <div id="ce" contenteditable="true"></div>
  <input id="plain">
  <input id="search" type="search">
  <input id="upper" type="TEXT">
  <input id="pw" type="password">
  <input id="email" type="email">
  <input id="tel" type="tel">
  <input id="number" type="number">
  <input id="url" type="url">
  <input id="cc" type="text" autocomplete="cc-number">
  <input id="billing" type="text" autocomplete="billing cc-name">
  <input id="otp" type="text" autocomplete="one-time-code">
  <input id="newpw" type="text" autocomplete="new-password">
  <input id="curpw" type="text" autocomplete="current-password">
  <textarea id="ignored" data-jitter-ignore></textarea>
  <div id="ignored-ce" contenteditable="true" data-jitter-ignore><p id="ignored-ce-child">x</p></div>
</body></html>`;

// The page is served from a loopback URL that Playwright answers itself (no
// server listens): a secure context, so navigator.clipboard exists for the
// paste test, unlike about:blank.
const PAGE_URL = 'http://127.0.0.1:54342/capture-scope.html';

async function loadCapturePage(page) {
  await page.addInitScript(CHROME_MOCK);
  await page.route(PAGE_URL, route => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await page.goto(PAGE_URL);
  for (const file of CAPTURE_FILES) await page.addScriptTag({ path: path.join(EXT, file) });
  await page.waitForFunction(() => typeof bioSession !== 'undefined' && typeof isCapturable === 'function');
}

function snapshot(page) {
  return page.evaluate(() => ({
    humanChars: bioSession.humanChars,
    totalKeystrokes: bioSession.totalKeystrokes,
    backspaces: bioSession.backspaceCount,
    dwell: bioSession.dwellTimes.length,
    flight: bioSession.flightTimes.length,
    pendingDown: Object.keys(bioSession.keyDownTimes).length,
    pastes: bioSession.pasteCount,
    pastedChars: bioSession.pastedChars,
    passportKeys: passport.totalKeystrokes,
  }));
}

const NOTHING = { humanChars: 0, totalKeystrokes: 0, backspaces: 0, dwell: 0, flight: 0, pendingDown: 0, pastes: 0, pastedChars: 0, passportKeys: 0 };

async function typeInto(page, selector, text) {
  await page.click(selector);
  await page.type(selector, text, { delay: 45 }); // the delay is the key's hold time: real dwell
  await page.keyboard.press('Backspace', { delay: 30 });
}

test.describe('Capture scope', () => {
  test('typing into a textarea is counted', async ({ page }) => {
    await loadCapturePage(page);
    await typeInto(page, '#ta', 'hello there');
    const s = await snapshot(page);
    expect(s.humanChars).toBe(11);
    expect(s.passportKeys).toBe(11);
    expect(s.backspaces).toBe(1);
    expect(s.dwell).toBeGreaterThan(0);
    expect(s.flight).toBeGreaterThan(0);
  });

  test('typing into a contenteditable is counted', async ({ page }) => {
    await loadCapturePage(page);
    await typeInto(page, '#ce', 'edited here');
    const s = await snapshot(page);
    expect(s.humanChars).toBe(11);
    expect(s.passportKeys).toBe(11);
    expect(s.dwell).toBeGreaterThan(0);
  });

  test('inputs of type text, search, TEXT and no type are counted', async ({ page }) => {
    await loadCapturePage(page);
    await typeInto(page, '#plain', 'abc');
    await typeInto(page, '#search', 'def');
    await typeInto(page, '#upper', 'ghi');
    const s = await snapshot(page);
    expect(s.humanChars).toBe(9);
    expect(s.passportKeys).toBe(9);
  });

  test('typing into <input type="password"> records nothing', async ({ page }) => {
    await loadCapturePage(page);
    await typeInto(page, '#pw', 'hunter2 secret');
    expect(await snapshot(page)).toEqual(NOTHING);
    expect(await page.evaluate(() => JSON.stringify(bioSession.perKeyDwells) + JSON.stringify(bioSession.bigramTimings))).toBe('{}{}');
  });

  test('typing into <input autocomplete="cc-number"> records nothing', async ({ page }) => {
    await loadCapturePage(page);
    await typeInto(page, '#cc', '4111111111111111');
    await typeInto(page, '#billing', 'Card Holder');
    expect(await snapshot(page)).toEqual(NOTHING);
  });

  test('email, tel, number and url inputs record nothing', async ({ page }) => {
    await loadCapturePage(page);
    for (const sel of ['#email', '#tel', '#number', '#url']) await typeInto(page, sel, 'a1b2');
    expect(await snapshot(page)).toEqual(NOTHING);
  });

  test('one-time-code, new-password and current-password fields record nothing', async ({ page }) => {
    await loadCapturePage(page);
    for (const sel of ['#otp', '#newpw', '#curpw']) await typeInto(page, sel, 'code12');
    expect(await snapshot(page)).toEqual(NOTHING);
  });

  test('data-jitter-ignore fields record nothing', async ({ page }) => {
    await loadCapturePage(page);
    await typeInto(page, '#ignored', 'skip me');
    await typeInto(page, '#ignored-ce-child', 'skip me too');
    expect(await snapshot(page)).toEqual(NOTHING);
  });

  test('a paste is recorded by length in a textarea and not at all in a password field', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loadCapturePage(page);
    await page.evaluate(() => navigator.clipboard.writeText('twenty characters!!!'));

    await page.click('#pw');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(200);
    expect(await snapshot(page)).toEqual(NOTHING);

    await page.click('#ta');
    await page.keyboard.press('Control+V');
    await page.waitForFunction(() => bioSession.pasteCount === 1, null, { timeout: 5000 });
    const s = await snapshot(page);
    expect(s.pastes).toBe(1);
    expect(s.pastedChars).toBe(20);
    expect(s.humanChars).toBe(0);
    expect(await page.inputValue('#ta')).toBe('twenty characters!!!');
  });

  test('mouse sampling does not depend on the field', async ({ page }) => {
    await loadCapturePage(page);
    await page.click('#pw');
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(50 + i * 20, 60 + i * 10);
      await page.waitForTimeout(60);
    }
    expect(await page.evaluate(() => bioSession.mousePositions.length)).toBeGreaterThan(3);
    expect(await snapshot(page)).toEqual(NOTHING);
  });

  test('capture stops on captureOff and resumes on captureOn', async ({ page }) => {
    await loadCapturePage(page);
    await page.evaluate(() => stopCapture());
    await typeInto(page, '#ta', 'unseen');
    expect(await snapshot(page)).toEqual(NOTHING);
    expect(await page.$('#jitter-shield')).toBeNull();

    await page.evaluate(() => resumeCapture());
    await typeInto(page, '#ta', 'seen');
    const s = await snapshot(page);
    expect(s.humanChars).toBe(4);
    expect(await page.$('#jitter-shield')).not.toBeNull();
  });

  test('the certified field is never an excluded one', async ({ page }) => {
    await loadCapturePage(page);
    await typeInto(page, '#ta', 'my essay');
    await page.click('#pw');
    await page.type('#pw', 'secret', { delay: 20 });
    // The password field has focus, but the field a badge would certify is the textarea.
    expect(await page.evaluate(() => certifiedField() && certifiedField().id)).toBe('ta');
    expect(await page.evaluate(() => certifiedText())).toBe('my essa');
  });
});
