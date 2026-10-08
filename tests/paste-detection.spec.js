// Paste on the extension's capture: a paste is recorded by its length, never
// its text, it shows in the badge as pasted characters, and it is not
// penalised (Hard Rule: paste is transparent, not punished). Page-level, with
// the Chrome API mocked, against the content script the extension injects on
// enabled sites. Real pastes (Ctrl+V from the clipboard) are used because the
// content script ignores synthetic events.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const EXT = path.resolve(__dirname, '..', 'extension');
const CHROME_MOCK = fs.readFileSync(path.join(__dirname, 'chrome-mock.js'), 'utf8');
const CAPTURE_FILES = ['src/crypto-utils.js', 'src/passport-utils.js', 'src/war-score.js', 'src/biometrics.js', 'src/content.js'];
const PAGE_URL = 'http://127.0.0.1:54342/paste-detection.html'; // answered by page.route, no server listens
const PAGE = '<!DOCTYPE html><html><body><textarea id="editor" rows="10" cols="60"></textarea></body></html>';

const PASTED = 'This block of text was pasted from somewhere else, a quote or a reference the writer did not type here.';

async function loadCapturePage(page, context) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // The attestation server is not part of these tests
  await page.route('https://*.supabase.co/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable in tests"}' }));
  await page.addInitScript(CHROME_MOCK);
  await page.route(PAGE_URL, route => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
  await page.goto(PAGE_URL);
  for (const file of CAPTURE_FILES) await page.addScriptTag({ path: path.join(EXT, file) });
  await page.waitForFunction(() => typeof bioSession !== 'undefined' && typeof copyBadge === 'function');
  // What the shield's START SESSION button does
  await page.evaluate(() => {
    bioSession = JitterBio.createSession();
    project = { isActive: true, humanKeystrokes: 0, pasteCount: 0, pastedChars: 0, startTime: Date.now() };
  });
  await page.click('#editor');
}

async function humanType(page, text) {
  for (let i = 0; i < text.length; i++) {
    const afterPunctuation = /[.,;:!?]/.test(text[i - 1] || '');
    await page.keyboard.type(text[i], { delay: 0 });
    await page.waitForTimeout(afterPunctuation ? 300 : 60 + Math.random() * 80);
  }
}

async function pasteFromClipboard(page, text) {
  await page.evaluate(t => navigator.clipboard.writeText(t), text);
  const before = await page.evaluate(() => bioSession.pasteCount);
  await page.keyboard.press('Control+V');
  await page.waitForFunction(n => bioSession.pasteCount === n + 1, before, { timeout: 5000 });
}

// Mint through the content script's own path, catching what it puts on the clipboard.
async function mintBadge(page) {
  return page.evaluate(async () => {
    const out = {};
    // copyBadge does not await the clipboard write, so wait for the stub itself.
    let done;
    const written = new Promise(resolve => { done = resolve; });
    navigator.clipboard.write = async (items) => {
      try {
        const html = await (await items[0].getType('text/html')).text();
        const m = html.match(/data-jitter-payload="([^"]+)"/);
        out.payload = m ? JSON.parse(atob(m[1])) : null;
        out.html = html;
      } finally { done(); }
    };
    await copyBadge(calculateStats(), false);
    await Promise.race([written, new Promise(resolve => setTimeout(resolve, 3000))]);
    return out;
  });
}

test.describe('Paste on extension capture', () => {
  test('a paste is recorded by length, never by text', async ({ page, context }) => {
    await loadCapturePage(page, context);
    await humanType(page, 'I wrote this. ');
    await pasteFromClipboard(page, PASTED);

    const s = await page.evaluate(() => ({
      pasteCount: bioSession.pasteCount, pastedChars: bioSession.pastedChars, pasteLengths: bioSession.pasteLengths,
      humanChars: bioSession.humanChars, projectPastes: project.pasteCount, projectPasted: project.pastedChars,
      sessionJson: JSON.stringify(bioSession), passportJson: JSON.stringify(passport), projectJson: JSON.stringify(project),
    }));
    expect(s.pasteCount).toBe(1);
    expect(s.pastedChars).toBe(PASTED.length);
    expect(s.pasteLengths).toEqual([PASTED.length]);
    expect(s.humanChars).toBe(14);
    expect(s.projectPastes).toBe(1);
    expect(s.projectPasted).toBe(PASTED.length);
    for (const json of [s.sessionJson, s.passportJson, s.projectJson]) {
      expect(json).not.toContain('pasted from somewhere');
      expect(json).not.toContain('I wrote');
    }
    expect(await page.inputValue('#editor')).toBe('I wrote this. ' + PASTED);
  });

  test('integrity is typed over typed plus pasted, and 100% with no paste', async ({ page, context }) => {
    await loadCapturePage(page, context);
    await humanType(page, 'All of this text is typed by hand.');
    expect((await page.evaluate(() => calculateStats())).integrity).toBe(100);

    await pasteFromClipboard(page, PASTED);
    const stats = await page.evaluate(() => calculateStats());
    const typed = 'All of this text is typed by hand.'.length;
    expect(stats.typed).toBe(typed);
    expect(stats.total).toBe(typed + PASTED.length);
    expect(stats.integrity).toBe(Math.round((typed / (typed + PASTED.length)) * 100));
    expect(stats.integrity).toBeLessThan(50);
  });

  test('the badge carries the paste as counts and is not penalised for it', async ({ page, context }) => {
    await loadCapturePage(page, context);
    const typedText = 'Here is a short paragraph that I typed myself before pasting a quote.';
    await humanType(page, typedText);
    await pasteFromClipboard(page, PASTED);

    const { payload, html } = await mintBadge(page);
    expect(payload).toBeTruthy();
    expect(payload.keys).toBe(typedText.length);
    expect(payload.pastes).toBe(1);
    expect(payload.pastedChars).toBe(PASTED.length);
    expect(payload.integrity).toBe(Math.round((typedText.length / (typedText.length + PASTED.length)) * 100));
    expect(payload.text_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof payload.signature).toBe('string');
    expect(payload.url).toBe('http://127.0.0.1:54342/paste-detection.html');
    // Counts and hashes only: neither the typed text nor the pasted text is in the badge.
    expect(html).not.toContain('pasted from somewhere');
    expect(JSON.stringify(payload)).not.toContain('pasted from somewhere');
    expect(JSON.stringify(payload)).not.toContain('short paragraph');
    // Paste is transparent, not punished: the engine flags nothing about it.
    const pasteFlags = (payload.war_flags || []).filter(f => /paste/i.test(String(f)));
    expect(pasteFlags).toEqual([]);
    expect(payload.suspicionScore).toBeUndefined();
    expect(payload.suspicionSignals).toBeUndefined();
  });

  test('a paste into a password field is not recorded', async ({ page, context }) => {
    await loadCapturePage(page, context);
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<input id="pw" type="password">'));
    await page.evaluate(t => navigator.clipboard.writeText(t), PASTED);
    await page.click('#pw');
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => bioSession.pasteCount)).toBe(0);
    expect(await page.evaluate(() => project.pasteCount)).toBe(0);
  });
});
