// Test: Bot detection — simulate fast/consistent typing and verify it gets flagged
const { test, expect } = require('@playwright/test');
const { openWriter, botType, getStats } = require('./helpers');

test.describe('Bot Detection (Loki Biometrics)', () => {
  test('fast consistent typing triggers bot detection', async ({ page }) => {
    await openWriter(page);

    // Simulate bot: type very fast (20ms intervals) with no variance
    // Need 100+ chars and 10+ flow intervals for detection to trigger
    const text = 'The quick brown fox jumps over the lazy dog and then it jumped again and again and again and again over the fence.';
    await botType(page, text);
    await page.waitForTimeout(200);

    const stats = await getStats(page);

    // Bot should be detected — purity shows SYNTHETIC
    expect(stats.purity).toBe('SYNTHETIC');
  });

  test('bot cannot mint a badge', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    const text = 'This is being typed by a bot that types way too fast and too consistently for a human to actually produce.';
    await botType(page, text);
    await page.waitForTimeout(200);

    // Check bio.isBot is true
    const isBot = await page.evaluate(() => bio.isBot);
    expect(isBot).toBe(true);

    // Try to mint — should show alert blocking it
    // Must set up dialog handler BEFORE the click that triggers alert()
    page.on('dialog', dialog => dialog.accept());
    const dialogPromise = page.waitForEvent('dialog');
    // Use page.click (not evaluate) so Playwright can intercept the dialog
    await page.click('#btn-export');
    const dialog = await dialogPromise;
    expect(dialog.message().toLowerCase()).toContain('synthetic');
  });

  test('entropy drops to 0 when bot is detected', async ({ page }) => {
    await openWriter(page);

    const text = 'Typing very fast like a machine that does not pause or think about what it is writing at all just goes goes goes.';
    await botType(page, text);
    await page.waitForTimeout(200);

    const stats = await getStats(page);
    expect(stats.entropy).toBe('0');
  });

  test('human-speed typing does NOT trigger bot detection', async ({ page }) => {
    await openWriter(page);

    // Type with realistic human timing
    const text = 'Typing at a normal human pace. With pauses after sentences. And some variation in speed throughout.';
    const editor = page.locator('#editor');
    await editor.click();

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const isPunct = /[\.\,]/.test(text[i - 1] || '');
      // Human-like: 120-300ms for letters, 400-700ms after punctuation
      const delay = isPunct
        ? 400 + Math.random() * 300
        : 120 + Math.random() * 180;
      await page.keyboard.type(char, { delay: 0 });
      await page.waitForTimeout(delay);
    }
    await page.waitForTimeout(200);

    const isBot = await page.evaluate(() => bio.isBot);
    expect(isBot).toBe(false);

    const stats = await getStats(page);
    expect(stats.purity).not.toBe('SYNTHETIC');
    expect(parseInt(stats.entropy)).toBeGreaterThan(0);
  });
});
