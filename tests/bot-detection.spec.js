// Loki gate on the extension's capture: typing at machine speed and rhythm is
// flagged by the shared engine, typing at a human pace is not. Page-level,
// with the Chrome API mocked, against the content script (content.js) and the
// capture engine (biometrics.js) that the extension injects on enabled sites.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', 'extension');
const CHROME_MOCK = fs.readFileSync(path.join(__dirname, 'chrome-mock.js'), 'utf8');
const CAPTURE_FILES = ['src/crypto-utils.js', 'src/passport-utils.js', 'src/war-score.js', 'src/biometrics.js', 'src/content.js'];
const PAGE_URL = 'http://127.0.0.1:54342/bot-detection.html'; // answered by page.route, no server listens
const PAGE = '<!DOCTYPE html><html><body><textarea id="editor" rows="10" cols="60"></textarea></body></html>';

async function loadCapturePage(page) {
  await page.addInitScript(CHROME_MOCK);
  await page.route(PAGE_URL, route => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await page.goto(PAGE_URL);
  for (const file of CAPTURE_FILES) await page.addScriptTag({ path: path.join(EXT, file) });
  await page.waitForFunction(() => typeof bioSession !== 'undefined' && typeof JitterBio !== 'undefined');
  await page.click('#editor');
}

// Machine typing: 20 ms apart, no variation. A human cannot do this.
async function botType(page, text) {
  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    await page.waitForTimeout(20);
  }
}

// Human typing: 120-300 ms per key, longer after punctuation.
async function humanType(page, text) {
  for (let i = 0; i < text.length; i++) {
    const afterPunctuation = /[.,;:!?]/.test(text[i - 1] || '');
    const delay = afterPunctuation ? 400 + Math.random() * 300 : 120 + Math.random() * 180;
    await page.keyboard.type(text[i], { delay: 0 });
    await page.waitForTimeout(delay);
  }
}

function loki(page) {
  return page.evaluate(() => JitterBio.analyzeLoki(bioSession));
}

test.describe('Loki gate on extension capture', () => {
  test('machine-speed, machine-rhythm typing is flagged', async ({ page }) => {
    await loadCapturePage(page);
    await botType(page, 'The quick brown fox jumps over the lazy dog and then it jumped again and again and again and again over the fence.');
    const result = await loki(page);
    expect(result.isBot).toBe(true);
    expect(result.entropy).toBe(0);
    expect(await page.evaluate(() => bioSession.humanChars)).toBeGreaterThan(100);
  });

  test('a flagged session still mints a badge, and the badge carries the flags', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loadCapturePage(page);
    await botType(page, 'This is being typed by a machine that types far too fast and too evenly for a person to produce it.');
    expect((await loki(page)).isBot).toBe(true);

    // The capture records; it never refuses. The engine's hard floors travel
    // inside the badge for the server and the verifier to weigh.
    const dialogs = [];
    page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.dismiss(); });
    const out = await page.evaluate(async () => {
      const res = { calls: 0, payload: null };
      let done;
      const written = new Promise(resolve => { done = resolve; });
      navigator.clipboard.write = async (items) => {
        res.calls++;
        try {
          const html = await (await items[0].getType('text/html')).text();
          const m = html.match(/data-jitter-payload="([^"]+)"/);
          res.payload = m ? JSON.parse(atob(m[1])) : null;
        } finally { done(); }
      };
      await copyBadge(calculateStats(), false);
      // copyBadge does not await the clipboard write: wait for the stub itself
      await Promise.race([written, new Promise(resolve => setTimeout(resolve, 3000))]);
      return res;
    });
    expect(dialogs).toEqual([]);
    expect(out.calls).toBe(1);
    expect(out.payload).toBeTruthy();
    expect(out.payload.war).toBe(0); // machine-speed typing hits a hard floor
    expect((out.payload.war_flags || []).some(f => /_floor$/.test(f))).toBe(true);
  });

  test('human-pace typing is not flagged', async ({ page }) => {
    test.setTimeout(90000);
    await loadCapturePage(page);
    await humanType(page, 'Typing at a normal human pace. With pauses after sentences. And some variation in speed throughout.');
    const result = await loki(page);
    expect(result.isBot).toBe(false);
    expect(result.entropy).toBeGreaterThan(0);
    expect(result.cognitiveRatio).toBeGreaterThan(0);
    expect(await page.evaluate(() => bioSession.flightTimes.length)).toBeGreaterThanOrEqual(10);
  });

  test('synthetic key events (isTrusted=false) are never counted', async ({ page }) => {
    await loadCapturePage(page);
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      for (const key of 'fake typing from a page script') {
        editor.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        editor.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      }
    });
    expect(await page.evaluate(() => bioSession.humanChars)).toBe(0);
    expect(await page.evaluate(() => passport.totalKeystrokes)).toBe(0);
  });
});
