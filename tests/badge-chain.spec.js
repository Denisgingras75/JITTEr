// Receipt chain: every receipt a device issues carries the hash of the
// previous one (previousBadge), null for the first.
const { test, expect } = require('@playwright/test');
const { createHash } = require('crypto');
const { openWriter, typeText, readReceipt, newDocument, getStats } = require('./helpers');

// What the Writer stores after a receipt (CryptoUtils.storeBadgeHash): the
// first 16 hex characters of sha256 over the base64 payload.
function receiptHash(base64) {
  return createHash('sha256').update(base64).digest('hex').slice(0, 16);
}

test.describe('Receipt Chain', () => {
  test('the first receipt from a device has no previous receipt', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, 'First document in the chain. No previous receipt exists.');

    const { payload } = await readReceipt(page);
    expect(payload.previousBadge).toBeNull();
    expect(payload.signature).toBeTruthy();
    expect(payload.publicKeyId).toMatch(/^[0-9A-F]{12}$/);
    expect((await getStats(page)).passportLine).toMatch(/· 1 receipt$/);
  });

  test('the receipt for the next document references the previous receipt', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    await typeText(page, 'First document. This establishes the start of the chain.');
    const first = await readReceipt(page);

    await newDocument(page, true);
    await typeText(page, 'Second document. This should reference the first receipt.');
    const second = await readReceipt(page);

    expect(second.payload.previousBadge).toBe(receiptHash(first.base64));
    expect(second.payload.previousBadge).toMatch(/^[0-9a-f]{16}$/);
    // Same device key, different text
    expect(second.payload.publicKeyId).toBe(first.payload.publicKeyId);
    expect(second.payload.publicKeyJwk).toEqual(first.payload.publicKeyJwk);
    expect(second.payload.text_hash).not.toBe(first.payload.text_hash);
    expect(second.payload.ledger.hash).not.toBe(first.payload.ledger.hash);
    expect(second.payload.process.sessions).toHaveLength(1);
    expect((await getStats(page)).passportLine).toMatch(/· 2 receipts$/);
  });

  test('a later receipt for the same document, after more writing, chains too', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    await typeText(page, 'The draft gets a receipt, ');
    const first = await readReceipt(page);
    await typeText(page, 'then more writing, then another receipt.');
    const second = await readReceipt(page);

    expect(second.payload.previousBadge).toBe(receiptHash(first.base64));
    expect(second.payload.process.typed_chars).toBeGreaterThan(first.payload.process.typed_chars);
    expect(second.payload.ledger.checkpoints).toBe(first.payload.ledger.checkpoints + 1);
    expect(second.payload.ledger.ops).toBeGreaterThan(first.payload.ledger.ops);
    expect(second.payload.text_hash).not.toBe(first.payload.text_hash);
    expect(second.payload.signature).not.toBe(first.payload.signature);
  });
});
