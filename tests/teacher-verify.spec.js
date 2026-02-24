// Test: Teacher receives a badge and verifies it through the dashboard
const { test, expect } = require('@playwright/test');
const { openWriter, openVerify, humanType, mintBadge, extractBase64FromBadge } = require('./helpers');

test.describe('Teacher Verification Flow', () => {
  test('verify page loads correctly', async ({ page }) => {
    await openVerify(page);

    await expect(page.locator('h1')).toContainText('JITTER VERIFICATION');
    await expect(page.locator('#badge-input')).toBeVisible();
    await expect(page.locator('.btn')).toContainText('VERIFY BADGE');
  });

  test('shows error for empty input', async ({ page }) => {
    await openVerify(page);

    await page.click('.btn');
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result')).toContainText('Please paste a badge first');
  });

  test('shows error for invalid badge data', async ({ page }) => {
    await openVerify(page);

    await page.fill('#badge-input', 'this is not a valid badge at all!!!');
    await page.click('.btn');

    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result')).toContainText('Invalid Badge');
  });

  test('verifies a valid signed badge with all sections', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Step 1: Student writes and mints a badge
    // Need many sentences to build cognitive ratio > 1.2 (avoids botLinearity check)
    await openWriter(page);
    const text = 'The teacher will verify. This essay was written by a student. It should be long enough. The biometrics need many sentence breaks. Each period creates a gap interval.';
    await humanType(page, text, { minDelay: 120, maxDelay: 280, punctuationPause: 600 });

    const badge = await mintBadge(page);
    const base64 = extractBase64FromBadge(badge.html);
    expect(base64).toBeTruthy();

    // Step 2: Teacher opens verify page and pastes the badge
    await openVerify(page);
    await page.fill('#badge-input', badge.html);
    await page.click('.btn');

    // Step 3: Verify all result sections appear
    const result = page.locator('#result');
    await expect(result).toBeVisible();

    // Crypto status banner — should show VALID since we signed it
    await expect(result).toContainText('SIGNATURE VALID');
    await expect(result).toContainText('ECDSA P-256');

    // Risk badge should be LOW (honest student)
    await expect(result).toContainText('LOW RISK');

    // Session metrics grid
    await expect(result).toContainText('Session Integrity');
    await expect(result).toContainText('Cognitive Ratio');
    await expect(result).toContainText('Total Keystrokes');
    await expect(result).toContainText('Account Age');

    // Session details section
    await expect(result).toContainText('SESSION DETAILS');
    await expect(result).toContainText('Session Keys');
    await expect(result).toContainText('Human Edits');
    await expect(result).toContainText('Entropy Score');

    // Passport profile section
    await expect(result).toContainText('PASSPORT PROFILE');
    await expect(result).toContainText('Lifetime Keystrokes');
    await expect(result).toContainText('Level');
    await expect(result).toContainText('Sessions Completed');
    await expect(result).toContainText('Avg Daily Output');
  });

  test('verifies badge from raw base64 input', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Mint a badge
    await openWriter(page);
    await humanType(page, 'Testing raw base64 input for the teacher verification dashboard.', { minDelay: 80, maxDelay: 200 });
    const badge = await mintBadge(page);
    const base64 = extractBase64FromBadge(badge.html);

    // Teacher pastes just the raw base64
    await openVerify(page);
    await page.fill('#badge-input', base64);
    await page.click('.btn');

    await expect(page.locator('#result')).toContainText('SIGNATURE VALID');
  });

  test('verifies badge from URL-style input', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Mint a badge
    await openWriter(page);
    await humanType(page, 'Testing URL hash input format for teacher verification.', { minDelay: 80, maxDelay: 200 });
    const badge = await mintBadge(page);
    const base64 = extractBase64FromBadge(badge.html);

    // Teacher pastes the URL format
    await openVerify(page);
    await page.fill('#badge-input', `#jitter:${base64}`);
    await page.click('.btn');

    await expect(page.locator('#result')).toContainText('SIGNATURE VALID');
  });

  test('detects tampered badge as INVALID', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Mint a legit badge
    await openWriter(page);
    await humanType(page, 'This badge will be tampered with after minting.', { minDelay: 80, maxDelay: 200 });
    const badge = await mintBadge(page);
    const base64 = extractBase64FromBadge(badge.html);

    // Decode, tamper, re-encode
    const payload = JSON.parse(atob(base64));
    payload.integrity = 100;
    payload.purity = 100;
    payload.keys = 99999; // Tampered!
    const tamperedBase64 = btoa(JSON.stringify(payload));

    // Teacher verifies the tampered badge
    await openVerify(page);
    await page.fill('#badge-input', tamperedBase64);
    await page.click('.btn');

    // Should detect invalid signature
    await expect(page.locator('#result')).toContainText('SIGNATURE INVALID');
  });
});
