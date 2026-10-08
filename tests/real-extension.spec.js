// The real extension in Chromium: capture is opt-in per site.
//
// Loads the unpacked extension into a fresh profile and checks that the
// capture script is not injected on a site until that site is enabled, is
// injected afterwards, stays off other sites, and stops when the site is
// disabled. Run with `npm run test:ext`.
//
// It runs headless (Chromium's headless mode runs extensions); set
// JITTER_HEADED=1 to watch it, for instance under xvfb-run. If the browser
// cannot load extensions at all the tests are skipped with a message.
//
// Chrome's permission prompt cannot be driven from a test, so the test copy
// of the extension declares the two test origins as host permissions: exactly
// what chrome.permissions.request grants when the user clicks Enable in the
// popup. Everything else (registration, messages, popup page, content script)
// is the shipping code, unmodified.
const { test, expect, chromium } = require('@playwright/test');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 54342;
const SITE_A = `http://127.0.0.1:${PORT}`;
const SITE_B = `http://localhost:${PORT}`;
const SOURCE = path.resolve(__dirname, '..', 'extension');
const CAPTURE_FILES = ['src/crypto-utils.js', 'src/passport-utils.js', 'src/war-score.js', 'src/biometrics.js', 'src/content.js'];

test.describe.configure({ mode: 'serial' });

let tmp, extDir, server, context, worker, popupPage;
let skipReason = null;

test.beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jitter-ext-'));
  extDir = path.join(tmp, 'extension');
  fs.cpSync(SOURCE, extDir, { recursive: true, filter: (src) => !src.includes(`${path.sep}old-code`) });
  const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
  manifest.host_permissions = [...(manifest.host_permissions || []), `${SITE_A}/*`, `${SITE_B}/*`];
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!DOCTYPE html><title>capture test</title><textarea id="editor"></textarea>');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, resolve); });

  try {
    const executablePath = process.env.JITTER_CHROME || undefined;
    context = await chromium.launchPersistentContext(path.join(tmp, 'profile'), {
      headless: !process.env.JITTER_HEADED,
      executablePath,
      channel: executablePath ? undefined : 'chromium', // the full browser: headless shell has no extensions
      args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--no-sandbox'],
    });
    worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  } catch (e) {
    skipReason = 'This browser could not load the extension (' + e.message.split('\n')[0] + '). ' +
      'Use Playwright\'s full Chromium (JITTER_CHROME=...) or JITTER_HEADED=1 under xvfb-run.';
  }
});

test.afterAll(async () => {
  if (context) await context.close().catch(() => {});
  if (server) await new Promise(resolve => server.close(resolve));
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

test.beforeEach(() => { test.skip(!!skipReason, skipReason || ''); });

// Messages go through the popup page: the same path the popup's buttons use.
function ask(message) {
  return popupPage.evaluate(m => new Promise(resolve => chrome.runtime.sendMessage(m, resolve)), message);
}

function registered() {
  return worker.evaluate(() => chrome.scripting.getRegisteredContentScripts());
}

async function shieldAppears(page, timeout = 10000) {
  try { await page.waitForSelector('#jitter-shield', { timeout }); return true; } catch (e) { return false; }
}

async function openAndCheck(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  return shieldAppears(page, 1500);
}

test('nothing is registered and nothing runs on a site that was not enabled', async () => {
  expect((await ask({ action: 'listSites' })).sites).toEqual([]);
  expect((await ask({ action: 'siteStatus', origin: SITE_A })).enabled).toBe(false);
  expect(await registered()).toEqual([]);

  const page = await context.newPage();
  expect(await openAndCheck(page, `${SITE_A}/a.html`)).toBe(false);
  await page.close();
});

test('enabling a site registers the capture script and it runs on that site only', async () => {
  const res = await ask({ action: 'enableSite', origin: SITE_A });
  expect(res.ok).toBe(true);
  expect(res.enabled).toBe(true);

  const scripts = await registered();
  expect(scripts.length).toBe(1);
  expect(scripts[0].id).toBe('jitter-capture');
  expect(scripts[0].matches).toEqual([`${SITE_A}/*`]);
  expect(scripts[0].js).toEqual(CAPTURE_FILES);
  expect(scripts[0].allFrames).toBe(true);
  expect(scripts[0].persistAcrossSessions).toBe(true);
  expect(scripts[0].runAt).toBe('document_idle');

  expect((await ask({ action: 'siteStatus', origin: SITE_A })).enabled).toBe(true);
  expect((await ask({ action: 'listSites' })).sites).toEqual([SITE_A]);

  const page = await context.newPage();
  expect(await openAndCheck(page, `${SITE_A}/a.html`)).toBe(true);
  // Typing there is captured (isolated world: read the counter through the shield's menu).
  await page.click('#editor');
  await page.type('#editor', 'typed on an enabled site', { delay: 30 });
  await page.close();

  const other = await context.newPage();
  expect(await openAndCheck(other, `${SITE_B}/b.html`)).toBe(false);
  expect((await ask({ action: 'siteStatus', origin: SITE_B })).enabled).toBe(false);
  await other.close();
});

test('unsupported origins are refused', async () => {
  expect((await ask({ action: 'enableSite', origin: 'chrome://extensions' })).ok).toBe(false);
  expect((await ask({ action: 'enableSite', origin: 'file:///tmp/x.html' })).ok).toBe(false);
  expect((await ask({ action: 'siteStatus', origin: 'about:blank' })).supported).toBe(false);
  expect((await ask({ action: 'listSites' })).sites).toEqual([SITE_A]);
});

test('disabling stops capture in open pages, unregisters, and the site stays off after reload', async () => {
  const page = await context.newPage();
  expect(await openAndCheck(page, `${SITE_A}/a.html`)).toBe(true);

  const res = await ask({ action: 'disableSite', origin: SITE_A });
  expect(res.ok).toBe(true);
  expect(res.enabled).toBe(false);
  await page.waitForSelector('#jitter-shield', { state: 'detached', timeout: 5000 });

  expect(await registered()).toEqual([]);
  expect((await ask({ action: 'listSites' })).sites).toEqual([]);
  expect((await ask({ action: 'siteStatus', origin: SITE_A })).enabled).toBe(false);

  expect(await openAndCheck(page, `${SITE_A}/a.html`)).toBe(false);
  await page.close();
});

test('enabling with the tab id starts capture in the open tab without a reload, and re-enabling resumes it', async () => {
  const page = await context.newPage();
  expect(await openAndCheck(page, `${SITE_A}/a.html`)).toBe(false);
  const [tab] = await popupPage.evaluate(pattern => chrome.tabs.query({ url: pattern }), `${SITE_A}/a.html`);
  expect(tab && Number.isInteger(tab.id)).toBe(true);

  let res = await ask({ action: 'enableSite', origin: SITE_A, tabId: tab.id });
  expect(res.ok).toBe(true);
  expect(res.injected).toBe(true);
  expect(await shieldAppears(page)).toBe(true);

  res = await ask({ action: 'disableSite', origin: SITE_A });
  expect(res.ok).toBe(true);
  await page.waitForSelector('#jitter-shield', { state: 'detached', timeout: 5000 });

  res = await ask({ action: 'enableSite', origin: SITE_A, tabId: tab.id });
  expect(res.ok).toBe(true);
  expect(res.injected).toBe(true);
  expect(await shieldAppears(page)).toBe(true);
  expect(await page.evaluate(() => document.querySelectorAll('#jitter-shield').length)).toBe(1);

  await ask({ action: 'disableSite', origin: SITE_A });
  await page.close();
});

test('the device key and signing still work', async () => {
  const info = await ask({ action: 'deviceKey' });
  expect(info && info.jwk && info.jwk.kty).toBe('EC');
  expect(info.jwk.crv).toBe('P-256');
  expect(info.keyId).toMatch(/^[0-9A-F]{12}$/);
  const signed = await ask({ action: 'sign', data: '{"a":1}' });
  expect(typeof signed.signature).toBe('string');
  expect(signed.signature.length).toBeGreaterThan(40);
});

test('erase keeps local data unless the server confirmed the deletion', async () => {
  await popupPage.evaluate(() => chrome.storage.local.set({ passport: { totalKeystrokes: 5, firstUsed: 1, sessionsCompleted: 1 } }));
  const before = await ask({ action: 'deviceKey' });
  const res = await ask({ action: 'erase' });
  const stored = await popupPage.evaluate(() => chrome.storage.local.get('passport'));
  const after = await ask({ action: 'deviceKey' });
  if (res.ok) {
    // A live server answered 200: local identity and passport are gone.
    expect(stored.passport).toBeUndefined();
    expect(after.deviceId).not.toBe(before.deviceId);
  } else {
    expect(typeof res.status).toBe('number');
    expect(typeof res.error).toBe('string');
    expect(stored.passport && stored.passport.totalKeystrokes).toBe(5);
    expect(after.deviceId).toBe(before.deviceId);
  }
});
