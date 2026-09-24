// Browser smoke test for the built SDK bundle: does the widget attach, capture
// real typing, and ignore scripted input? Loads sdk/dist/jitter.min.js, so run
// `node sdk/build.js` after changing the SDK sources.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const DIST = path.resolve(__dirname, '..', 'sdk', 'dist', 'jitter.min.js');
const BUNDLE = fs.readFileSync(DIST, 'utf8');
const TEXT = 'Typing this by hand, with a few pauses. It should be enough to score.';

// Real keyboard input with human-ish dwell and flight times.
async function humanType(page, selector, text) {
  await page.click(selector);
  for (const ch of text) {
    await page.keyboard.down(ch);
    await page.waitForTimeout(45 + Math.random() * 70);
    await page.keyboard.up(ch);
    await page.waitForTimeout(/[.,]/.test(ch) ? 300 + Math.random() * 200 : 50 + Math.random() * 130);
  }
}

async function loadSdk(page, html) {
  await page.setContent(html);
  await page.addScriptTag({ path: DIST });
}

test.describe('SDK widget', () => {
  test('init attaches and real typing produces a score', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await loadSdk(page, '<form><textarea id="t"></textarea></form>');

    await page.evaluate(() => Jitter.init({ siteKey: 'test' }));
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => JitterBox.attach === Jitter.attach)).toBe(false);
    expect(await page.evaluate(() => document.getElementById('t').getAttribute('data-jitter-sdk'))).toBe('active');
    expect(await page.evaluate(() => Jitter.score(document.getElementById('t')))).toBeNull();

    await humanType(page, '#t', TEXT);
    const result = await page.evaluate(() => Jitter.score(document.getElementById('t')));
    expect(result).not.toBeNull();
    expect(typeof result.war).toBe('number');
    expect(result.war).toBeGreaterThan(0);
    expect(result.session.human_chars).toBe(TEXT.length);
    expect(result.session_token).toMatch(/^jtok_/);
  });

  test('textareas added after init are attached', async ({ page }) => {
    await loadSdk(page, '<div id="host"></div>');
    await page.evaluate(() => Jitter.init({ siteKey: 'test' }));
    await page.evaluate(() => {
      const ta = document.createElement('textarea');
      ta.id = 'later';
      document.getElementById('host').appendChild(ta);
    });
    await page.waitForFunction(() => document.getElementById('later').getAttribute('data-jitter-sdk') === 'active');
    await humanType(page, '#later', TEXT);
    const result = await page.evaluate(() => Jitter.score(document.getElementById('later')));
    expect(result).not.toBeNull();
    expect(result.session.human_chars).toBe(TEXT.length);
  });

  test('synthetic key events from page script are ignored', async ({ page }) => {
    await loadSdk(page, '<textarea id="t"></textarea>');
    await page.evaluate(() => Jitter.init({ siteKey: 'test' }));
    await page.evaluate(async (text) => {
      const el = document.getElementById('t');
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (const ch of text) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        await sleep(40 + Math.random() * 40);
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
        await sleep(60 + Math.random() * 80);
      }
    }, TEXT);
    expect(await page.evaluate(() => Jitter.score(document.getElementById('t')))).toBeNull();
  });

  test('backspace is counted once', async ({ page }) => {
    await loadSdk(page, '<textarea id="t"></textarea>');
    await page.evaluate(() => Jitter.init({ siteKey: 'test' }));
    await humanType(page, '#t', TEXT);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(120);
    }
    const result = await page.evaluate(() => Jitter.score(document.getElementById('t')));
    // edit_ratio = backspaces / keystrokes: 5 / 69 is about 0.07; double-counting gave about 0.14.
    expect(result.profile.edit_ratio).toBeGreaterThan(0.05);
    expect(result.profile.edit_ratio).toBeLessThan(0.1);
  });

  test('init from <head> waits for the body', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/jitter.min.js', route => route.fulfill({ contentType: 'application/javascript', body: BUNDLE }));
    await page.setContent(`<!DOCTYPE html><html><head>
      <script src="http://sdk.test/jitter.min.js"></script>
      <script>Jitter.init({ siteKey: 'test' })</script>
      </head><body><textarea id="t"></textarea></body></html>`);
    expect(errors).toEqual([]);
    await page.waitForFunction(() => document.getElementById('t').getAttribute('data-jitter-sdk') === 'active');
  });

  test('leaves the data-jitter="true" marker used by jitter-capture alone', async ({ page }) => {
    await loadSdk(page, '<textarea id="t" data-jitter="true"></textarea>');
    await page.evaluate(() => Jitter.init({ siteKey: 'test' }));
    expect(await page.evaluate(() => document.getElementById('t').getAttribute('data-jitter'))).toBe('true');
  });

  test('the vanilla example scores typed text', async ({ page }) => {
    await page.route('**/jitter.min.js', route => route.fulfill({ contentType: 'application/javascript', body: BUNDLE }));
    await page.goto(`file://${path.resolve(__dirname, '..', 'sdk', 'examples', 'vanilla.html')}`);
    expect(await page.locator('#error').innerText()).toBe('');
    await humanType(page, '#review', TEXT);
    await page.click('#score-btn');
    await expect(page.locator('#result')).toContainText('"war"');
    await expect(page.locator('#badges')).toContainText('WAR');
  });
});
