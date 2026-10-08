// Text that enters the Writer without counted keystrokes or a paste (receipt
// v4.1): a script's insertText, a change with no input event at all, an input
// method's composition, a drag-and-drop. Every character in the document is
// accounted for, so a receipt can never read "all typed" when it was not.
// Contract: docs/product/PROCESS_RECEIPT.md.
const { test, expect } = require('@playwright/test');
const {
  openWriter, openVerify, typeText, readReceipt, downloadJson, readStorage, waitForAutosave,
  editorText, forbiddenWord,
} = require('./helpers');

const TYPED = 'A first sentence typed key by key in the Writer. ';
const sum = (items, key) => items.reduce((total, item) => total + (item[key] || 0), 0);
const visible = text => text.replace(/ /g, ' ').trim();

async function caretAtEnd(page) {
  await page.evaluate(() => {
    const ed = document.getElementById('editor');
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

test.describe('Text entered another way', () => {
  test('text a script inserts is recorded as entered another way, never as typed', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, TYPED);
    const INSERTED = 'This whole paragraph arrived without a single keystroke or a paste event.';
    await caretAtEnd(page);
    await page.evaluate(t => document.execCommand('insertText', false, t), INSERTED);
    await expect(page.locator('#inserted-count')).toHaveText(String(INSERTED.length));

    const { payload: p } = await readReceipt(page);
    expect(p.version).toBe('4.1');
    expect(p.process.typed_chars).toBe(TYPED.length);
    expect(p.process.pasted_chars).toBe(0);
    expect(p.process.inserted_chars).toBe(INSERTED.length);
    expect(p.process.inserted_by).toEqual({ other: INSERTED.length });
    expect(p.process.typed_share).toBe(Math.round((TYPED.length / (TYPED.length + INSERTED.length)) * 100) / 100);
    expect(sum(p.process.sessions, 'inserted')).toBe(INSERTED.length);
    expect(sum(p.process.timeline.buckets, 'inserted')).toBe(INSERTED.length);
    expect(JSON.stringify(p)).not.toContain('without a single keystroke'); // a length, never the text
  });

  test('text that appears with no input event at all is caught when the receipt is made', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, TYPED);
    const SILENT = 'Added straight into the page, no event fired.';
    await page.evaluate(t => document.getElementById('editor').appendChild(document.createTextNode(t)), SILENT);

    const receipt = await readReceipt(page);
    const p = receipt.payload;
    expect(p.process.typed_chars).toBe(TYPED.length);
    expect(p.process.inserted_chars).toBe(SILENT.length);
    expect(p.process.inserted_by).toEqual({ other: SILENT.length });

    // The ledger file accounts for it too, and the teacher sees it
    const download = await downloadJson(page, '#btn-export-ledger');
    expect(download.json.final_hash).toBe(p.ledger.hash);
    expect(download.json.ops.filter(op => op.op === 'insert')).toEqual([expect.objectContaining({ op: 'insert', len: SILENT.length, via: 'other' })]);

    await openVerify(page);
    await page.fill('#badge-input', receipt.base64);
    await page.setInputFiles('#ledger-input', { name: download.filename, mimeType: 'application/json', buffer: Buffer.from(download.text) });
    await page.click('#verify-btn');
    const result = page.locator('#result');
    await expect(result).toContainText('Signature valid');
    await expect(result).toContainText(`${TYPED.length} characters typed, 0 pasted, ${SILENT.length} entered another way, 0 deleted`);
    await expect(result).toContainText(`${SILENT.length} characters entered without counted keystrokes or a paste: other`);
    await expect(result).not.toContainText('100% of what was entered was typed here');
    await expect(result).toContainText('Operations add up ✓');
    await expect(result.locator('svg.timeline rect.tl-inserted')).toHaveCount(1);
    expect(forbiddenWord(await result.evaluate(el => el.textContent))).toBeNull();

    // The replay marks the block the text arrived in
    const n = download.json.checkpoints.length;
    await page.locator('#ledger-scrubber').fill(String(n - 1));
    await expect(page.locator('#ledger-replay-insert')).toBeVisible();
    await expect(page.locator('#ledger-replay-insert')).toContainText(`This block follows ${SILENT.length} characters entered without counted keystrokes or a paste.`);
  });

  test('an input method composition is recorded as entered through an input method', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, TYPED);
    await caretAtEnd(page);
    // Compose 日本語 the way an input method does, then commit it
    const cdp = await context.newCDPSession(page);
    for (const step of ['に', 'にほ', 'にほん', 'にほんご', '日本語']) {
      await cdp.send('Input.imeSetComposition', { text: step, selectionStart: step.length, selectionEnd: step.length });
    }
    await cdp.send('Input.insertText', { text: '日本語' });
    await expect(page.locator('#editor')).toContainText('日本語');

    const { payload: p } = await readReceipt(page);
    expect(p.process.typed_chars).toBe(TYPED.length);
    expect(p.process.deleted_chars).toBe(0);
    expect(p.process.inserted_chars).toBe(3);
    expect(p.process.inserted_by).toEqual({ 'input-method': 3 });
  });

  test('a drag-and-drop into the editor is recorded as drag-and-drop', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, TYPED);
    const DROPPED = 'Dragged in from another window.';
    await page.evaluate(t => {
      const src = document.createElement('div');
      src.id = 'drag-source';
      src.draggable = true;
      src.textContent = 'drag me';
      src.style.cssText = 'position:fixed;top:4px;right:4px;padding:6px;background:#333;color:#fff;z-index:9999';
      src.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', t));
      document.body.appendChild(src);
    }, DROPPED);
    await page.dragAndDrop('#drag-source', '#editor');
    await expect(page.locator('#editor')).toContainText(DROPPED);

    const { payload: p } = await readReceipt(page);
    expect(p.process.typed_chars).toBe(TYPED.length);
    expect(p.process.pasted_chars).toBe(0);
    expect(p.process.inserted_by).toEqual({ drop: DROPPED.length });
  });

  test('script-made key events count as nothing typed', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, TYPED);
    await page.evaluate(() => {
      const ed = document.getElementById('editor');
      for (const key of 'fake keys') {
        ed.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        ed.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      }
    });
    await expect(page.locator('#typed-count')).toHaveText(String(TYPED.length));
    const { payload: p } = await readReceipt(page);
    expect(p.process.typed_chars).toBe(TYPED.length);
    expect(p.process.inserted_chars).toBe(0);
  });

  test('a draft autosaved by the 4.0 Writer still opens', async ({ page }) => {
    await openWriter(page);
    const text = 'A draft saved before the update.';
    await typeText(page, text);
    await waitForAutosave(page, text.length);
    // Make the saved draft look exactly as the 4.0 Writer left it
    await page.evaluate(async () => {
      const { writerDoc } = await chrome.storage.local.get('writerDoc');
      writerDoc.version = '4.0';
      await chrome.storage.local.set({ writerDoc });
    });
    expect((await readStorage(page)).writerDoc.version).toBe('4.0');

    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#editor[data-ready="1"]');
    expect(visible(await editorText(page))).toBe(text);
    await expect(page.locator('#typed-count')).toHaveText(String(text.length));
    await expect(page.locator('#sittings-count')).toHaveText('2');
  });
});
