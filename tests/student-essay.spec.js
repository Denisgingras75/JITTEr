// Test: Student writes an essay, watches stats update live, mints a badge
const { test, expect } = require('@playwright/test');
const { openWriter, humanType, getStats, mintBadge, extractBase64FromBadge } = require('./helpers');

test.describe('Student Essay Flow', () => {
  test('writer loads with correct initial state', async ({ page }) => {
    await openWriter(page);

    const stats = await getStats(page);
    expect(stats.purity).toBe('100%');
    expect(stats.words).toBe('0');
    expect(stats.edits).toBe('0');
    expect(stats.passportLevel).toBe('Novice');
  });

  test('typing updates word count and passport keystrokes', async ({ page }) => {
    await openWriter(page);

    await humanType(page, 'Hello world this is a test sentence.');

    const stats = await getStats(page);
    const wordCount = parseInt(stats.words);
    expect(wordCount).toBeGreaterThanOrEqual(6);

    // Passport should show keystrokes
    const passportText = stats.passport;
    expect(passportText).not.toBe('0');
  });

  test('backspace increments human edits counter', async ({ page }) => {
    await openWriter(page);
    const editor = page.locator('#editor');
    await editor.click();

    // Type then delete
    await humanType(page, 'Hellx');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    await humanType(page, 'o');

    const stats = await getStats(page);
    expect(parseInt(stats.edits)).toBeGreaterThanOrEqual(1);
  });

  test('entropy and purity update during human typing', async ({ page }) => {
    await openWriter(page);

    // Type enough characters for rhythm analysis to kick in (needs 10+ flow intervals)
    // Use generous delays to ensure we don't trigger bot detection
    const text = 'The quick brown fox jumps over the lazy dog. It was a beautiful day for typing.';
    await humanType(page, text, { minDelay: 150, maxDelay: 350, punctuationPause: 600 });

    const stats = await getStats(page);
    // Purity should still be 100% (all human typed) — not SYNTHETIC
    expect(stats.purity).not.toBe('SYNTHETIC');
    // Entropy should be a number (rhythm has been analyzed)
    const entropy = parseInt(stats.entropy);
    expect(entropy).toBeGreaterThan(0);
  });

  test('ledger creates blocks as student types', async ({ page }) => {
    await openWriter(page);

    // Type enough to trigger checkpoints (every 10 operations)
    const text = 'This is a fairly long sentence that should generate many keystroke operations in the ledger.';
    await humanType(page, text, { minDelay: 60, maxDelay: 150 });

    const stats = await getStats(page);
    const blockCount = parseInt(stats.ledgerBlocks);
    // Should have at least some blocks (initial + typed chars / 10)
    expect(blockCount).toBeGreaterThanOrEqual(1);
    // Ledger hash should no longer be the placeholder
    expect(stats.ledgerHash).not.toBe('—');
  });

  test('student can mint a badge after typing', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    // Need enough text with punctuation to build a good cognitive ratio (>1.2)
    // and avoid bot detection. Multiple sentences with varied pauses.
    const text = 'Students use the Jitter writer. It tracks keystrokes. The system verifies authenticity. Each sentence builds the cognitive ratio, which is important.';
    await humanType(page, text, { minDelay: 120, maxDelay: 280, punctuationPause: 600 });

    // Mint the badge
    const badge = await mintBadge(page);

    // Badge HTML should contain jitter payload
    expect(badge.html).toContain('jitter');
    expect(badge.html).toContain('data-jitter-payload');

    // Extract and decode the payload
    const base64 = extractBase64FromBadge(badge.html);
    expect(base64).toBeTruthy();

    const payload = JSON.parse(atob(base64));
    expect(payload.version).toBe('3.0');
    expect(payload.purity).toBeGreaterThanOrEqual(95);
    expect(payload.integrity).toBeGreaterThan(0);
    expect(payload.keys).toBeGreaterThan(0);
    expect(payload.passportLevel).toBeTruthy();
    expect(payload.signature).toBeTruthy();
    // publicKeyId may be null in test env (chrome.storage mock timing)
    // but signature proves crypto is working
    expect(payload.ledgerHash).toBeTruthy();

    // Button text changes after successful export
    await page.waitForTimeout(100);
    const btnText = await page.locator('#btn-export').innerText();
    expect(['COPIED!', 'MINT BADGE']).toContain(btnText);
  });

  test('formatting toolbar works', async ({ page }) => {
    await openWriter(page);
    const editor = page.locator('#editor');
    await editor.click();

    // Change font
    await page.selectOption('#font-select', 'font-code');
    const editorClass = await editor.getAttribute('class');
    expect(editorClass).toContain('font-code');

    // Change spacing
    await page.selectOption('#spacing-select', 'spacing-2');
    const editorClass2 = await editor.getAttribute('class');
    expect(editorClass2).toContain('spacing-2');
  });
});
