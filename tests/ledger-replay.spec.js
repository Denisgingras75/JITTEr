// Test: Writing Ledger and Replay — type, open replay, scrub through checkpoints
const { test, expect } = require('@playwright/test');
const { openWriter, humanType, getStats } = require('./helpers');

test.describe('Writing Ledger & Replay', () => {
  test('ledger starts with genesis checkpoint', async ({ page }) => {
    await openWriter(page);

    // Should have 1 block (genesis/initial checkpoint)
    const stats = await getStats(page);
    expect(stats.ledgerBlocks).toBe('1 blocks');
  });

  test('typing creates ledger checkpoints every 10 ops', async ({ page }) => {
    await openWriter(page);

    // Type 25+ characters to get at least 2-3 checkpoints after genesis
    const text = 'abcdefghijklmnopqrstuvwxyz';
    await humanType(page, text, { minDelay: 40, maxDelay: 80 });
    await page.waitForTimeout(500);

    const stats = await getStats(page);
    const blocks = parseInt(stats.ledgerBlocks);
    // genesis + at least 2 typing checkpoints (26 chars / 10 = 2.6)
    expect(blocks).toBeGreaterThanOrEqual(3);
  });

  test('ledger hash updates with each checkpoint', async ({ page }) => {
    await openWriter(page);

    // Get initial hash
    const stats1 = await getStats(page);
    const hash1 = stats1.ledgerHash;

    // Type enough for a new checkpoint
    await humanType(page, 'Hello world.', { minDelay: 40, maxDelay: 80 });
    await page.waitForTimeout(500);

    const stats2 = await getStats(page);
    const hash2 = stats2.ledgerHash;

    // Hash should have changed
    expect(hash2).not.toBe(hash1);
  });

  test('replay panel opens and shows content', async ({ page }) => {
    await openWriter(page);

    // Type content
    await humanType(page, 'This text will appear in the replay panel when we scrub through.', { minDelay: 40, maxDelay: 80 });
    await page.waitForTimeout(300);

    // Open replay
    await page.click('#btn-replay');
    const replayPanel = page.locator('#replay-panel');
    await expect(replayPanel).toBeVisible();

    // Scrubber should have max > 0
    const scrubberMax = await page.locator('#replay-scrubber').getAttribute('max');
    expect(parseInt(scrubberMax)).toBeGreaterThan(0);

    // Replay should show time
    await expect(page.locator('#replay-time')).toContainText('T+');
  });

  test('scrubbing through replay shows document at different points', async ({ page }) => {
    await openWriter(page);

    // Type in two distinct chunks with a pause
    await humanType(page, 'First chunk. ', { minDelay: 40, maxDelay: 80 });
    await page.waitForTimeout(500);
    await humanType(page, 'Second chunk.', { minDelay: 40, maxDelay: 80 });
    await page.waitForTimeout(500);

    // Open replay
    await page.click('#btn-replay');
    await expect(page.locator('#replay-panel')).toBeVisible();

    // Get content at beginning (checkpoint 0)
    const contentAtStart = await page.evaluate(() => {
      renderReplay(0);
      return document.getElementById('replay-editor').innerText;
    });

    // Get content at latest checkpoint
    const maxIdx = await page.evaluate(() => ledger.checkpoints.length - 1);
    const contentAtEnd = await page.evaluate((idx) => {
      renderReplay(idx);
      return document.getElementById('replay-editor').innerText;
    }, maxIdx);

    // Start should have less content than end
    expect(contentAtEnd.length).toBeGreaterThan(contentAtStart.length);
  });

  test('replay close button works', async ({ page }) => {
    await openWriter(page);
    await humanType(page, 'Quick typing.', { minDelay: 40, maxDelay: 80 });

    await page.click('#btn-replay');
    await expect(page.locator('#replay-panel')).toBeVisible();

    await page.click('#replay-close-btn');
    await expect(page.locator('#replay-panel')).toBeHidden();
  });

  test('ledger export downloads a JSON file', async ({ page }) => {
    await openWriter(page);
    await humanType(page, 'Content for ledger export test.', { minDelay: 40, maxDelay: 80 });
    await page.waitForTimeout(300);

    // Listen for download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#btn-export-ledger'),
    ]);

    expect(download.suggestedFilename()).toMatch(/^jitter-ledger-\d+\.json$/);

    // Read and validate the downloaded file
    const path = await download.path();
    const fs = require('fs');
    const content = JSON.parse(fs.readFileSync(path, 'utf8'));

    expect(content.version).toBe('3.0');
    expect(content.type).toBe('jitter-ledger');
    expect(content.meta.ledgerHash).toBeTruthy();
    expect(content.meta.totalOps).toBeGreaterThan(0);
    expect(content.checkpoints.length).toBeGreaterThan(0);
    expect(content.ops.length).toBeGreaterThan(0);
  });
});
