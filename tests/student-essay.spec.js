// Student flow: the Writer records how a text is entered (typed / pasted /
// deleted characters, sittings, active writing time), shows it live in the
// sidebar, autosaves, and issues a signed process receipt on GET RECEIPT.
// Contract: docs/product/PROCESS_RECEIPT.md.
const { test, expect } = require('@playwright/test');
const { openWriter, humanType, typeText, pasteText, getStats, readReceipt, downloadJson, editorText, newDocument } = require('./helpers');

const HEX64 = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PASTED = 'A quotation pasted from a reference the student did not type here.';

test.describe('Student Essay Flow', () => {
  test('writer loads with an empty document in its first sitting', async ({ page }) => {
    await openWriter(page);

    const stats = await getStats(page);
    expect(stats.words).toBe('0');
    expect(stats.typed).toBe('0');
    expect(stats.pasted).toBe('0');
    expect(stats.pasteEvents).toBe('no pastes');
    expect(stats.deleted).toBe('0');
    expect(stats.sittings).toBe('1');
    expect(stats.activeTime).toMatch(/^\d+ s$/);
    // The sitting checkpoint is the first block of the ledger
    expect(stats.ledgerBlocks).toBe('1 blocks');
    expect(stats.ledgerHash).toMatch(/^[0-9A-F]{12}$/);
    expect(stats.passportLine).toContain('Device first used');
    expect(stats.passportLine).toContain('0 receipts');
    // Autosaved on load
    expect(stats.saveState).toMatch(/^saved /);

    await expect(page.locator('#btn-export')).toHaveText('GET RECEIPT');
    await expect(page.locator('#btn-download-receipt')).toBeDisabled();
    await expect(page.locator('#btn-export-ledger')).toBeEnabled();
    await expect(page.locator('#replay-panel')).toBeHidden();
  });

  test('typing updates the word, typed and active-time counters', async ({ page }) => {
    await openWriter(page);

    const text = 'Hello world this is a test sentence.';
    await humanType(page, text, { minDelay: 40, maxDelay: 90, punctuationPause: 150 });

    const stats = await getStats(page);
    expect(stats.words).toBe('7');
    expect(stats.typed).toBe(String(text.length));
    expect(stats.pasted).toBe('0');
    expect(stats.deleted).toBe('0');
    expect(stats.sittings).toBe('1');
    expect(stats.activeTime).not.toBe('0 s');
    expect((await editorText(page)).replace(/ /g, ' ')).toBe(text);
  });

  test('backspace counts the characters deleted', async ({ page }) => {
    await openWriter(page);

    await typeText(page, 'Hellx');
    await page.keyboard.press('Backspace');
    await typeText(page, 'o');

    const stats = await getStats(page);
    expect(stats.deleted).toBe('1');
    // Every key pressed counts as typed, including the one deleted afterwards
    expect(stats.typed).toBe('6');
    expect(stats.words).toBe('1');
    expect(await editorText(page)).toBe('Hello');
  });

  test('a paste is counted by its length and shown as a paste, never penalised', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    const typed = 'Typed by hand. ';
    await typeText(page, typed);
    await pasteText(page, PASTED);

    const stats = await getStats(page);
    expect(stats.typed).toBe(String(typed.length));
    expect(stats.pasted).toBe(String(PASTED.length));
    expect(stats.pasteEvents).toBe('1 paste');
    expect(stats.deleted).toBe('0');
    // A checkpoint is taken after every paste
    await expect(page.locator('#ledger-count')).toHaveText('2 blocks');
    expect((await editorText(page)).replace(/ /g, ' ')).toBe(typed + PASTED);
  });

  test('the ledger has a block and a chain hash as the student writes', async ({ page }) => {
    await openWriter(page);

    const text = 'This is a fairly long sentence that should generate keystroke operations in the ledger.';
    await humanType(page, text, { minDelay: 30, maxDelay: 70, punctuationPause: 100 });

    const stats = await getStats(page);
    expect(parseInt(stats.ledgerBlocks, 10)).toBeGreaterThanOrEqual(1);
    expect(stats.ledgerHash).not.toBe('—');
    expect(stats.ledgerHash).toMatch(/^[0-9A-F]{12}$/);
  });

  test('student can get a receipt after typing', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    const text = 'Students write in the Jitter writer. It records how the text was entered. Each sentence is typed here, one key at a time.';
    await humanType(page, text, { minDelay: 40, maxDelay: 90, punctuationPause: 150 });

    const receipt = await readReceipt(page);
    const p = receipt.payload;

    // What lands on the clipboard: the badge (HTML) and the code (plain text)
    expect(receipt.html).toContain('data-jitter-payload');
    expect(receipt.html).toContain('JITTER RECEIPT');
    expect(receipt.plain).toContain('JITTER RECEIPT');
    expect(receipt.plain).toContain('typed 100%');
    expect(receipt.plain).toContain('1 sitting');
    expect(receipt.plain).toContain('#jitter:' + receipt.base64);

    // The signed payload
    expect(p.version).toBe('4.0');
    expect(p.type).toBe('process-receipt');
    expect(p.title).toBe('Untitled');
    expect(p.url).toBe('jitter://writer');
    expect(p.minted_at).toMatch(ISO);
    expect(p.chars).toBe(text.length);
    expect(p.words).toBe(text.split(/\s+/).length);
    expect(p.keys).toBe(text.length);
    expect(p.process.typed_chars).toBe(text.length);
    expect(p.process.pasted_chars).toBe(0);
    expect(p.process.deleted_chars).toBe(0);
    expect(p.process.typed_share).toBe(1);
    expect(p.process.sessions).toHaveLength(1);
    expect(p.war).toBeGreaterThanOrEqual(0);
    expect(p.war).toBeLessThanOrEqual(1);
    expect(p.war_uncapped).toBe(p.war);
    expect(p.text_hash).toMatch(HEX64);
    expect(p.ledger.hash).toMatch(HEX64);
    expect(p.ledger.checkpoints).toBeGreaterThanOrEqual(2); // the sitting's and the minting's
    expect(p.ledger.ops).toBeGreaterThan(0);
    expect(typeof p.signature).toBe('string');
    expect(p.signature.length).toBeGreaterThan(0);
    expect(p.publicKeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(p.publicKeyId).toMatch(/^[0-9A-F]{12}$/);
    expect(p.previousBadge).toBeNull();
    // A receipt proves process and integrity, nothing else
    for (const legacy of ['purity', 'integrity', 'suspicionScore', 'suspicionSignals', 'passportLevel', 'entropy', 'isBot', 'ledgerHash']) {
      expect(p).not.toHaveProperty(legacy);
    }
    // Counts and hashes only: none of the text is in the receipt
    expect(receipt.json).not.toContain('Students write');
    expect(receipt.html).not.toContain('Students write');

    // Button feedback, the download becomes available, one more receipt on this device
    await expect(page.locator('#btn-export')).toHaveText(/^(COPIED!|RECEIPT READY|GET RECEIPT)$/);
    await expect(page.locator('#btn-download-receipt')).toBeEnabled();
    expect((await getStats(page)).passportLine).toMatch(/· 1 receipt$/);
  });

  test('the receipt download is the signed payload as a .jitter-receipt.json file', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, 'A short essay whose receipt is downloaded as a file.');

    const receipt = await readReceipt(page);
    const file = await downloadJson(page, '#btn-download-receipt');
    expect(file.filename).toMatch(/^untitled-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.jitter-receipt\.json$/);
    expect(file.json).toEqual(receipt.payload);
  });

  test('new document clears the text and the ledger only after confirmation', async ({ page }) => {
    await openWriter(page);
    await typeText(page, 'Draft to be discarded.');

    await newDocument(page, false);
    expect(await editorText(page)).toBe('Draft to be discarded.');
    expect((await getStats(page)).typed).toBe('22');

    await newDocument(page, true);
    expect(await editorText(page)).toBe('');
    const stats = await getStats(page);
    expect(stats.typed).toBe('0');
    expect(stats.words).toBe('0');
    expect(stats.deleted).toBe('0');
    expect(stats.sittings).toBe('1');
    expect(stats.ledgerBlocks).toBe('1 blocks');
    await expect(page.locator('#btn-download-receipt')).toBeDisabled();
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
