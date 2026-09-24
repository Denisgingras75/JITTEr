// jitter-capture.js (the WGH integration path): device key, signed badge,
// text binding and the attest contract, against a mocked attestation server.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { webcrypto } = require('crypto');

const DIST = path.resolve(__dirname, '..', 'sdk', 'dist', 'jitter.min.js');
const CAPTURE = path.resolve(__dirname, '..', 'sdk', 'src', 'jitter-capture.js');
const ATTEST_URL = 'https://attest.test/functions/v1/attest';
const TEXT = 'A review typed by hand, with a pause or two. Long enough to score properly.';

// The server's canonical form (the extension's crypto-utils implements the same one).
const cryptoUtilsSrc = fs.readFileSync(path.resolve(__dirname, '..', 'extension', 'src', 'crypto-utils.js'), 'utf8');
const CryptoUtils = new Function('chrome', 'window', cryptoUtilsSrc + '\nreturn CryptoUtils;')({}, {});

async function humanType(page, selector, text) {
  await page.click(selector);
  for (const ch of text) {
    await page.keyboard.down(ch);
    await page.waitForTimeout(45 + Math.random() * 70);
    await page.keyboard.up(ch);
    await page.waitForTimeout(/[.,]/.test(ch) ? 300 + Math.random() * 200 : 50 + Math.random() * 130);
  }
}

async function sha256Hex(s) {
  const d = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyDeviceSignature(badge, signatureB64) {
  const key = await webcrypto.subtle.importKey('jwk', badge.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const sig = Uint8Array.from(Buffer.from(signatureB64, 'base64'));
  return webcrypto.subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, key, sig, new TextEncoder().encode(CryptoUtils.canonicalJson(badge)));
}

async function setup(page, attestHandler) {
  const requests = [];
  await page.route(ATTEST_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') { // CORS preflight for the JSON POST
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
    }
    const body = JSON.parse(route.request().postData());
    requests.push(body);
    const reply = await attestHandler(body, requests.length);
    await route.fulfill({ status: reply.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply.body) });
  });
  // A real origin: IndexedDB (where the device key lives) is unavailable on about:blank.
  await page.route('https://site.test/', route => route.fulfill({ contentType: 'text/html', body: '<form><textarea id="review" data-jitter="true"></textarea></form>' }));
  await page.goto('https://site.test/');
  await page.addScriptTag({ path: DIST });
  await page.addScriptTag({ path: CAPTURE });
  await page.evaluate((url) => JitterCapture.init({ siteKey: 'wgh', attestUrl: url }), ATTEST_URL);
  return requests;
}

const okReply = (body, n) => ({ status: 200, body: {
  badge_hash: 'ab'.repeat(32),
  attestation: { badge_hash: 'ab'.repeat(32), device_id: 'dev', war: Math.min(body.badge.war, 0.35), war_client: body.badge.war, time_cap: 0.35, age_days: 0, classification: 'building', flags: ['new_device'], attested_at: new Date().toISOString() },
  server_signature: 'sig', server_key_id: 'KEYID',
} });

test.describe('jitter-capture', () => {
  test('signs a badge with a device key, binds it to the text, and attests', async ({ page }) => {
    const requests = await setup(page, okReply);
    await humanType(page, '#review', TEXT);
    const result = await page.evaluate(async () => {
      const r = await JitterCapture.scoreAndAttest('review', 'wgh-user-42');
      delete r.badge; // DOM node
      return r;
    });

    expect(typeof result.war).toBe('number');
    expect(requests.length).toBe(1);
    const { site_key, badge, signature } = requests[0];
    expect(site_key).toBe('wgh');
    expect(badge.publicKeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(badge.keys).toBe(TEXT.length);
    expect(badge.war).toBe(result.war);
    expect(badge.war_uncapped).toBe(result.war);
    expect(badge.site_user).toBe('wgh-user-42');
    expect(badge.text_hash).toBe(await sha256Hex(TEXT));
    expect(badge.url).toBe('https://site.test/');
    expect(badge.signature).toBeUndefined();
    expect(await verifyDeviceSignature(badge, signature)).toBe(true);

    expect(result.badge_hash).toBe('ab'.repeat(32));
    expect(result.attestation.classification).toBe('building');
    expect(result.classification).toBe('building');
    expect(result.verifyUrl).toBe('https://attest.test/functions/v1/verify?hash=' + 'ab'.repeat(32));
    expect(result.attestError).toBeUndefined();
  });

  test('the same device key is used across attestations; tampering breaks the signature', async ({ page }) => {
    const requests = await setup(page, okReply);
    await humanType(page, '#review', TEXT);
    await page.evaluate(() => JitterCapture.scoreAndAttest('review'));
    await page.evaluate(() => JitterCapture.scoreAndAttest('review'));
    expect(requests.length).toBe(2);
    expect(requests[0].badge.publicKeyJwk.x).toBe(requests[1].badge.publicKeyJwk.x);
    expect(requests[0].signature).not.toBe(requests[1].signature); // minted_at differs
    const tampered = { ...requests[0].badge, war: 0.99 };
    expect(await verifyDeviceSignature(tampered, requests[0].signature)).toBe(false);
    expect(requests[0].badge.site_user).toBeNull();
  });

  test('server errors are reported, never thrown, and the local score survives', async ({ page }) => {
    await setup(page, () => ({ status: 429, body: { error: 'rate_limited' } }));
    await humanType(page, '#review', TEXT);
    const result = await page.evaluate(async () => { const r = await JitterCapture.scoreAndAttest('review'); delete r.badge; return r; });
    expect(typeof result.war).toBe('number');
    expect(result.attestError).toEqual({ status: 429, error: 'rate_limited' });
    expect(result.badge_hash).toBeUndefined();
  });

  test('synthetic key events are ignored', async ({ page }) => {
    const requests = await setup(page, okReply);
    await page.evaluate(async (text) => {
      const el = document.getElementById('review');
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      for (const ch of text) {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        await sleep(40 + Math.random() * 40);
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
        await sleep(60 + Math.random() * 80);
      }
    }, TEXT);
    const result = await page.evaluate(async () => { const r = await JitterCapture.scoreAndAttest('review'); delete r.badge; return r; });
    expect(result.classification).toBe('insufficient_data');
    expect(requests.length).toBe(0);
  });

  test('dwell time is measured per key, not against the last keydown', async ({ page }) => {
    await setup(page, okReply);
    await page.click('#review');
    // Rollover: "b" goes down while "a" is still held. a's dwell is ~170 ms; measured
    // from the last keydown (the old bug) it would read ~20 ms.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.down('a');
      await page.waitForTimeout(150);
      await page.keyboard.down('b');
      await page.waitForTimeout(20);
      await page.keyboard.up('a');
      await page.waitForTimeout(130);
      await page.keyboard.up('b');
      await page.waitForTimeout(160);
    }
    const session = await page.evaluate(() => JitterCapture.score('review').session);
    expect(session.keys).toBe(24);
    expect(session.meanDwell).toBeGreaterThan(120); // ~160 correct vs ~85 with the bug
  });
});
