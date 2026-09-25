// Teacher flow: the verify page checks a receipt's signature and its binding
// to the essay text, then describes what the receipt records in eight
// sections, in the language of the contract (docs/product/PROCESS_RECEIPT.md).
const { test, expect } = require('@playwright/test');
const { openWriter, openVerify, humanType, readReceipt, editorText, forbiddenWord } = require('./helpers');

const SECTIONS = ['Receipt', 'Summary', 'Timeline', 'Pastes', 'Revision', 'Typing rhythm', 'Ledger', 'What a receipt says'];

// A student writes `text` in the Writer and gets a receipt.
async function mintReceipt(page, context, text) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWriter(page);
  await humanType(page, text, { minDelay: 40, maxDelay: 90, punctuationPause: 150 });
  const essay = await editorText(page);
  return Object.assign(await readReceipt(page), { essay });
}

// The teacher pastes the receipt (and optionally the essay) and checks it.
async function check(page, receiptInput, essay) {
  await openVerify(page);
  await page.fill('#badge-input', receiptInput);
  if (essay != null) await page.fill('#text-input', essay);
  await page.click('#verify-btn');
  const result = page.locator('#result');
  await expect(result).toBeVisible();
  return result;
}

test.describe('Teacher Verification Flow', () => {
  test('verify page loads correctly', async ({ page }) => {
    await openVerify(page);

    await expect(page.locator('h1')).toContainText('JITTER RECEIPT CHECK');
    await expect(page.locator('#badge-input')).toBeVisible();
    await expect(page.locator('#text-input')).toBeVisible();
    await expect(page.locator('#ledger-input')).toBeVisible();
    await expect(page.locator('#verify-btn')).toContainText('CHECK RECEIPT');
    await expect(page.locator('#result')).toBeHidden();
  });

  test('shows an error for empty input', async ({ page }) => {
    await openVerify(page);

    await page.click('#verify-btn');
    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result')).toContainText('Paste a receipt first.');
  });

  test('shows an error for input that is not a receipt', async ({ page }) => {
    await openVerify(page);

    await page.fill('#badge-input', 'this is not a valid receipt at all!!!');
    await page.click('#verify-btn');

    await expect(page.locator('#result')).toBeVisible();
    await expect(page.locator('#result')).toContainText('Could not read this receipt');
  });

  test('checks a signed receipt and shows all eight sections', async ({ page, context }) => {
    const text = 'The teacher will check this. The essay was written in the Writer. It is long enough to carry a typing rhythm. Each sentence was typed here.';
    const receipt = await mintReceipt(page, context, text);

    const result = await check(page, receipt.html, null);

    // 1. Receipt: signature, text binding, server record, device key
    await expect(result).toContainText('Signature valid');
    await expect(result).toContainText('Text not provided');
    await expect(result).toContainText('No server record');
    await expect(result).toContainText('Process receipt v4.0');
    await expect(result).toContainText('jitter://writer');
    await expect(result).toContainText(receipt.payload.publicKeyId);
    await expect(result).toContainText('first receipt from this device');

    // The eight sections, in the contract's order
    // (textContent: the titles are set in upper case by CSS, which innerText reflects)
    const titles = (await result.locator('.card-title').allTextContents()).map(t => t.replace(/^\s*\d+\s*/, '').trim());
    expect(titles).toEqual(SECTIONS);

    // 2. Summary: sittings, active time, what was typed / pasted / deleted, the typed share
    await expect(result).toContainText('Written in one sitting');
    await expect(result).toContainText('of active writing');
    await expect(result).toContainText(`${text.length} characters typed, 0 pasted, 0 deleted`);
    await expect(result).toContainText('100% of what was entered was typed here');
    await expect(result).toContainText('Sitting 1');
    await expect(result).toContainText('Never away from the Writer during a sitting');

    // 3. Timeline: inline SVG, no libraries
    await expect(result.locator('svg.timeline')).toHaveCount(1);
    expect(await result.locator('svg.timeline rect.tl-typed').count()).toBeGreaterThanOrEqual(1);

    // 4. Pastes
    await expect(result).toContainText('No pastes recorded');

    // 5. Revision
    await expect(result).toContainText('Revision activity while writing');
    await expect(result).toContainText('Backspaces');
    await expect(result).toContainText('Editing linearity');

    // 6. Typing rhythm: one statistic, not a verdict
    await expect(result).toContainText('Key hold (dwell)');
    await expect(result).toContainText('Between keys (flight)');
    await expect(result).toContainText('one statistic, not a verdict');

    // 7. Ledger (no file given)
    await expect(result).toContainText('No ledger file provided');

    // 8. The fixed note
    await expect(result).toContainText('A process receipt records');
    await expect(result).toContainText('It does not say who was at the keyboard');

    // The language rules: nothing a teacher sees uses the forbidden words
    expect(forbiddenWord(await result.innerText())).toBeNull();
    expect(forbiddenWord(await result.evaluate(el => el.textContent))).toBeNull();
  });

  test('checks a receipt pasted as raw base64', async ({ page, context }) => {
    const receipt = await mintReceipt(page, context, 'Testing raw base64 input for the teacher verification page.');

    const result = await check(page, receipt.base64, null);
    await expect(result).toContainText('Signature valid');
  });

  test('checks a receipt pasted as the #jitter: code', async ({ page, context }) => {
    const receipt = await mintReceipt(page, context, 'Testing the receipt code format for the teacher verification page.');

    const result = await check(page, `#jitter:${receipt.base64}`, null);
    await expect(result).toContainText('Signature valid');
  });

  test('checks a receipt pasted as the contents of the .jitter-receipt.json file', async ({ page, context }) => {
    const receipt = await mintReceipt(page, context, 'Testing the receipt file contents on the teacher verification page.');

    const result = await check(page, JSON.stringify(receipt.payload, null, 2), receipt.essay);
    await expect(result).toContainText('Signature valid');
    await expect(result).toContainText('Text matches');
  });

  test('a tampered receipt shows Signature invalid', async ({ page, context }) => {
    const receipt = await mintReceipt(page, context, 'This receipt will be tampered with after minting.');

    // Decode, tamper, re-encode
    const payload = JSON.parse(receipt.json);
    payload.keys = 99999;
    payload.process.typed_chars = 99999;
    payload.process.pasted_chars = 0;
    const tampered = Buffer.from(JSON.stringify(payload), 'latin1').toString('base64');

    const result = await check(page, tampered, null);
    await expect(result).toContainText('Signature invalid');
    await expect(result).not.toContainText('Signature valid');
    await expect(result).toContainText('changed after it was signed');
  });

  test('a receipt without a signature shows No signature', async ({ page, context }) => {
    const receipt = await mintReceipt(page, context, 'This receipt loses its signature before it is checked.');

    const payload = JSON.parse(receipt.json);
    delete payload.signature;
    const unsigned = Buffer.from(JSON.stringify(payload), 'latin1').toString('base64');

    const result = await check(page, unsigned, null);
    await expect(result).toContainText('No signature');
    await expect(result).not.toContainText('Signature valid');
  });
});
