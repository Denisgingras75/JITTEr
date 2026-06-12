// Test: Paste detection — paste content and verify purity drops.
//
// NOTE: pastes use REAL clipboard + Ctrl/Meta+V (trusted events). Synthetic
// `dispatchEvent(new ClipboardEvent('paste'))` is now rejected by the capture
// path's event-provenance guard (isTrusted check), so it cannot be used to
// simulate paste — which is the whole point: production drops synthetic events.
const { test, expect } = require('@playwright/test');
const { openWriter, humanType, realPaste, getStats } = require('./helpers');

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.describe('Paste Detection', () => {
  test('pasting text drops session purity below 100%', async ({ page }) => {
    await openWriter(page);

    // Type a little bit first
    await humanType(page, 'I wrote this. ', { minDelay: 80, maxDelay: 200 });

    // Now paste a large chunk (simulates student pasting from ChatGPT)
    const pastedText = 'This is a large block of text that was pasted from an external source like ChatGPT or another document that the student did not write themselves.';
    await realPaste(page, pastedText);
    await page.waitForTimeout(200);

    const stats = await getStats(page);
    const purity = parseInt(stats.purity);
    // Purity should have dropped significantly (large paste vs small typing)
    expect(purity).toBeLessThan(50);
  });

  test('100% typed content shows 100% purity', async ({ page }) => {
    await openWriter(page);

    await humanType(page, 'All of this text is typed by hand with no pasting at all.', { minDelay: 80, maxDelay: 200 });

    const stats = await getStats(page);
    expect(stats.purity).toBe('100%');
  });

  test('paste event is recorded in the ledger', async ({ page }) => {
    await openWriter(page);

    // Type enough to get past genesis
    await humanType(page, 'Some typed text. ', { minDelay: 40, maxDelay: 80 });

    // Paste something (real, trusted)
    await realPaste(page, 'pasted content here');
    await page.waitForTimeout(200);

    // Check ledger has paste operation
    const hasPasteOp = await page.evaluate(() => {
      return ledger.ops.some(op => op.op === 'paste');
    });
    expect(hasPasteOp).toBe(true);
  });

  test('pasted badge shows low integrity on teacher verify', async ({ page }) => {
    await openWriter(page);

    // Type just a little
    await humanType(page, 'Hi. ', { minDelay: 80, maxDelay: 200 });

    // Paste a lot (real, trusted)
    await realPaste(page, 'A'.repeat(500));
    await page.waitForTimeout(200);

    // Mint the badge — purity will be low
    const badge = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const origWrite = navigator.clipboard.write.bind(navigator.clipboard);
        navigator.clipboard.write = async function(data) {
          const htmlBlob = await data[0].getType('text/html');
          const html = await htmlBlob.text();
          navigator.clipboard.write = origWrite;
          resolve({ html });
        };
        document.getElementById('btn-export').click();
      });
    });

    // Extract and check the badge payload. The payload carries the transparency
    // 'purity' stat (and a classification LABEL) — never the detector WAR/score.
    const match = badge.html.match(/data-jitter-payload="([^"]+)"/);
    expect(match).toBeTruthy();
    const payload = JSON.parse(atob(match[1]));

    // Integrity should be very low (few typed chars vs lots of pasted content)
    expect(payload.purity).toBeLessThan(20);
    // And the score must NOT be present in the payload (score secrecy).
    expect(payload.war).toBeUndefined();
    expect(payload.war_components).toBeUndefined();
  });
});
