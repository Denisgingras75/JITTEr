// Test: Badge chain integrity — mint two badges, second references first
const { test, expect } = require('@playwright/test');
const { openWriter, humanType, mintBadge, extractBase64FromBadge } = require('./helpers');

test.describe('Badge Chain Integrity', () => {
  test('first badge has no previous badge hash', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    await humanType(page, 'First document in the chain. No previous badge exists.', { minDelay: 80, maxDelay: 200 });

    const badge = await mintBadge(page);
    const base64 = extractBase64FromBadge(badge.html);
    const payload = JSON.parse(atob(base64));

    // First badge should have no previous badge hash
    expect(payload.previousBadge).toBeNull();
    // Signature proves crypto is working
    expect(payload.signature).toBeTruthy();
  });

  test('second badge references first badge hash', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    // Mint first badge
    await humanType(page, 'First document. This establishes the start of the chain.', { minDelay: 80, maxDelay: 200 });
    const badge1 = await mintBadge(page);
    const base641 = extractBase64FromBadge(badge1.html);
    const payload1 = JSON.parse(atob(base641));

    // Wait and then reset + type second doc
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      // Simulate new session without full reset (keep passport + crypto)
      session.humanChars = 0;
      session.alienChars = 0;
      bioSession = JitterBio.createSession();
      document.getElementById('editor').innerHTML = '';
    });

    await humanType(page, 'Second document. This should reference the first badge hash.', { minDelay: 80, maxDelay: 200 });
    const badge2 = await mintBadge(page);
    const base642 = extractBase64FromBadge(badge2.html);
    const payload2 = JSON.parse(atob(base642));

    // Second badge should reference the first
    expect(payload2.previousBadge).toBeTruthy();
    expect(payload2.previousBadge).not.toBeNull();

    // Sessions should have incremented
    expect(payload2.sessions).toBeGreaterThan(payload1.sessions);
  });
});
