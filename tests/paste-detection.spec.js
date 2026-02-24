// Test: Paste detection — paste content and verify purity drops
const { test, expect } = require('@playwright/test');
const { openWriter, humanType, getStats } = require('./helpers');

test.describe('Paste Detection', () => {
  test('pasting text drops session purity below 100%', async ({ page }) => {
    await openWriter(page);

    // Type a little bit first
    await humanType(page, 'I wrote this. ', { minDelay: 80, maxDelay: 200 });

    // Now paste a large chunk (simulates student pasting from ChatGPT)
    const pastedText = 'This is a large block of text that was pasted from an external source like ChatGPT or another document that the student did not write themselves.';

    await page.evaluate((text) => {
      const editor = document.getElementById('editor');
      editor.focus();

      // Create a synthetic paste event
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      });
      pasteEvent.clipboardData.setData('text/plain', text);
      editor.dispatchEvent(pasteEvent);

      // Actually insert the text (since we prevented default behavior)
      document.execCommand('insertText', false, text);
    }, pastedText);

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

    // Paste something
    await page.evaluate(() => {
      const editor = document.getElementById('editor');
      editor.focus();
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      });
      pasteEvent.clipboardData.setData('text/plain', 'pasted content here');
      editor.dispatchEvent(pasteEvent);
    });

    await page.waitForTimeout(200);

    // Check ledger has paste operation
    const hasPasteOp = await page.evaluate(() => {
      return ledger.ops.some(op => op.op === 'paste');
    });
    expect(hasPasteOp).toBe(true);
  });

  test('pasted badge shows low integrity on teacher verify', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    // Type just a little
    await humanType(page, 'Hi. ', { minDelay: 80, maxDelay: 200 });

    // Paste a lot
    const bigPaste = 'A'.repeat(500);
    await page.evaluate((text) => {
      const editor = document.getElementById('editor');
      editor.focus();
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer()
      });
      pasteEvent.clipboardData.setData('text/plain', text);
      editor.dispatchEvent(pasteEvent);
      document.execCommand('insertText', false, text);
    }, bigPaste);
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

    // Extract and check the badge payload
    const match = badge.html.match(/data-jitter-payload="([^"]+)"/);
    expect(match).toBeTruthy();
    const payload = JSON.parse(atob(match[1]));

    // Integrity should be very low (few typed chars vs lots of pasted + typed content)
    expect(payload.purity).toBeLessThan(20);
  });
});
