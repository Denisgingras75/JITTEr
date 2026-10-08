// The process receipt end to end: what the Writer records for an essay with
// a paste and a few deletions, the receipt it signs and binds to the text,
// the receipt's size, the autosave across sittings, and the verify page
// reading the receipt with the essay, with the ledger file, and an older v3
// badge. Contract: docs/product/PROCESS_RECEIPT.md.
const { test, expect } = require('@playwright/test');
const {
  openWriter, openVerify, typeText, pasteText, readReceipt, downloadJson, readStorage, waitForAutosave,
  editorText, normalizeText, textHash, forbiddenWord, getStats,
} = require('./helpers');

const HEX64 = /^[0-9a-f]{64}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const TYPED_1 = 'The essay opens with a sentence typed by hand, one key at a time. ';
const PASTED = 'This passage was pasted from another document; the Writer records only its length.';
const TYPED_2 = ' A closing sentence follows the paste and ends the essaxyz';
const BACKSPACES = 3;
const FIX = 'y.';
const FINAL_TEXT = TYPED_1 + PASTED + TYPED_2.slice(0, -BACKSPACES) + FIX;
const TYPED = TYPED_1.length + TYPED_2.length + FIX.length;
const TYPED_SHARE = Math.round((TYPED / (TYPED + PASTED.length)) * 100) / 100;

// Typed, one paste in the middle, three characters deleted, typed again.
async function writeEssay(page, context) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWriter(page);
  await typeText(page, TYPED_1);
  await pasteText(page, PASTED);
  await typeText(page, TYPED_2);
  for (let i = 0; i < BACKSPACES; i++) await page.keyboard.press('Backspace');
  await typeText(page, FIX);
}

const visible = text => text.replace(/ /g, ' ').trim();
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);

// The device signature, checked here with Node WebCrypto and the contract's
// canonical JSON (keys sorted at every depth, no whitespace, undefined
// dropped), over everything but the unsigned fields.
function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined)
    .map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
async function signatureVerifies(payload) {
  const { signature, attestation, server_signature, server_key_id, ...signed } = payload;
  const { kty, crv, x, y } = payload.publicKeyJwk;
  const key = await globalThis.crypto.subtle.importKey('jwk', { kty, crv, x, y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return globalThis.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(signature, 'base64'), new TextEncoder().encode(canonicalJson(signed)));
}

test.describe('Process receipt', () => {
  test('the receipt records what was typed, pasted and deleted, and binds the text', async ({ page, context }) => {
    await writeEssay(page, context);
    const essay = await editorText(page);
    expect(visible(essay)).toBe(FINAL_TEXT);

    const receipt = await readReceipt(page);
    const p = receipt.payload;

    expect(p.version).toBe('4.0');
    expect(p.type).toBe('process-receipt');
    expect(p.url).toBe('jitter://writer');
    expect(p.minted_at).toMatch(ISO);

    // Counts: what was entered, not the final text
    expect(p.process.typed_chars).toBe(TYPED);
    expect(p.keys).toBe(TYPED);
    expect(p.process.pasted_chars).toBe(PASTED.length);
    expect(p.process.paste_events).toHaveLength(1);
    expect(p.process.paste_events[0].len).toBe(PASTED.length);
    expect(p.process.paste_events[0].t).toMatch(ISO);
    expect(p.process.deleted_chars).toBeGreaterThanOrEqual(BACKSPACES);
    expect(p.process.deleted_chars).toBe(BACKSPACES);
    expect(p.process.typed_share).toBe(TYPED_SHARE);

    // Sittings and active time
    expect(p.process.started_at).toMatch(ISO);
    expect(p.process.finished_at).toMatch(ISO);
    expect(p.process.sessions.length).toBeGreaterThanOrEqual(1);
    expect(sum(p.process.sessions, 'typed')).toBe(TYPED);
    expect(sum(p.process.sessions, 'pasted')).toBe(PASTED.length);
    expect(sum(p.process.sessions, 'deleted')).toBe(p.process.deleted_chars);
    expect(p.process.active_ms).toBe(sum(p.process.sessions, 'active_ms'));
    expect(p.process.active_ms).toBeGreaterThan(0);
    expect(p.process.away).toEqual({ events: expect.any(Number), total_ms: expect.any(Number) });

    // Timeline: one-minute buckets whose counts add up to the totals
    expect(p.process.timeline.bucket_ms).toBe(60000);
    expect(p.process.timeline.buckets.length).toBeGreaterThanOrEqual(1);
    expect(p.process.timeline.buckets.length).toBeLessThanOrEqual(240);
    expect(sum(p.process.timeline.buckets, 'typed')).toBe(TYPED);
    expect(sum(p.process.timeline.buckets, 'pasted')).toBe(PASTED.length);
    expect(sum(p.process.timeline.buckets, 'deleted')).toBe(p.process.deleted_chars);

    // Revision and typing statistics
    expect(p.process.revision.backspaces).toBeGreaterThanOrEqual(BACKSPACES);
    expect(p.process.revision.editing_linearity).toBeGreaterThanOrEqual(0);
    expect(p.process.revision.editing_linearity).toBeLessThanOrEqual(1);
    expect(Object.keys(p.typing).sort()).toEqual(['keys', 'mean_dwell', 'mean_flight', 'std_dwell', 'std_flight']);
    expect(p.typing.keys).toBe(TYPED);
    expect(p.war).toBeGreaterThanOrEqual(0);
    expect(p.war).toBeLessThanOrEqual(1);
    expect(p.war_uncapped).toBe(p.war);

    // Ledger, device key and signature
    expect(p.ledger.hash).toMatch(HEX64);
    expect(p.ledger.checkpoints).toBeGreaterThanOrEqual(3); // sitting, paste, minting
    expect(p.ledger.ops).toBeGreaterThan(0);
    expect(p.publicKeyJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(p.publicKeyId).toMatch(/^[0-9A-F]{12}$/);
    expect(p.previousBadge).toBeNull();
    expect(typeof p.signature).toBe('string');
    expect(p.signature.length).toBeGreaterThan(0);
    expect(await signatureVerifies(p)).toBe(true);

    // Bound to the final text
    expect(p.text_hash).toBe(await textHash(essay));
    expect(p.chars).toBe(normalizeText(essay).length);
    expect(p.words).toBe(normalizeText(essay).split(/\s+/).length);

    // Never characters: none of the text is in the receipt
    for (const fragment of ['typed by hand', 'pasted from another', 'closing sentence']) {
      expect(receipt.json).not.toContain(fragment);
      expect(receipt.html).not.toContain(fragment);
      expect(receipt.plain).not.toContain(fragment);
    }
    for (const legacy of ['purity', 'integrity', 'suspicionScore', 'suspicionSignals', 'passportLevel', 'entropy']) {
      expect(p).not.toHaveProperty(legacy);
    }
  });

  test('a 1,500-character essay yields a receipt under 16 KB', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    const long = 'Long essays are typed one key at a time and the receipt stays small because it holds counts, not characters. '.repeat(20).slice(0, 1500);
    expect(long).toHaveLength(1500);
    await typeText(page, long, { delay: 3 });

    const receipt = await readReceipt(page);
    const bytes = Buffer.byteLength(receipt.json, 'utf8');
    console.log(`Receipt for ${long.length} typed characters: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB), `
      + `${receipt.payload.ledger.ops} ledger operations, ${receipt.payload.process.timeline.buckets.length} timeline buckets`);

    expect(receipt.payload.process.typed_chars).toBe(1500);
    expect(receipt.payload.keys).toBe(1500);
    expect(receipt.payload.process.timeline.buckets.length).toBeLessThanOrEqual(240);
    expect(bytes).toBeLessThan(16 * 1024);
  });

  test('reopening the Writer restores the document and starts a new sitting', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    const text = 'Written in the first sitting and saved on this device.';
    await typeText(page, text);
    await waitForAutosave(page, text.length);

    const saved = (await readStorage(page)).writerDoc;
    expect(saved.version).toBe('4.0');
    expect(saved.html).toContain('Written in the first sitting');
    expect(saved.sessionCount).toBe(1);
    const savedOps = saved.ledger.ops;
    expect(savedOps[0]).toMatchObject({ op: 'session', k: 1 });
    expect(savedOps.filter(op => op.op === 'session')).toHaveLength(1);
    expect(saved.ledger.checkpoints.length).toBeGreaterThanOrEqual(1);

    // Second sitting: the Writer opened again on the same device (the mock
    // keeps chrome.storage.local in localStorage, which survives the reload)
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#editor[data-ready="1"]');

    expect(visible(await editorText(page))).toBe(text);
    const stats = await getStats(page);
    expect(stats.sittings).toBe('2');
    expect(stats.typed).toBe(String(text.length));
    expect(stats.words).toBe(String(text.split(' ').length));
    expect(stats.ledgerBlocks).toBe(`${saved.ledger.checkpoints.length + 1} blocks`);

    const ops = await page.evaluate(() => ledger.ops);
    expect(ops.slice(0, savedOps.length)).toEqual(savedOps);
    const sessions = ops.filter(op => op.op === 'session');
    expect(sessions).toHaveLength(2);
    expect(sessions[1].k).toBe(2);
    expect(ops[ops.length - 1]).toMatchObject({ op: 'session', k: 2 });
    expect(ops.filter(op => op.op === 'type').reduce((total, op) => total + op.n, 0)).toBe(text.length);

    // The receipt reports the two sittings and the whole record
    const { payload } = await readReceipt(page);
    expect(payload.process.sessions).toHaveLength(2);
    expect(payload.process.typed_chars).toBe(text.length);
    expect(payload.process.sessions[0].typed).toBe(text.length);
    expect(payload.process.sessions[1].typed).toBe(0);
    expect(payload.text_hash).toBe(await textHash(text));
  });

  test('the verify page reads the receipt with the essay: signature, text, timeline, summary, note', async ({ page, context }) => {
    await writeEssay(page, context);
    const essay = await editorText(page);
    const receipt = await readReceipt(page);
    const p = receipt.payload;

    await openVerify(page);
    await page.fill('#badge-input', receipt.html);
    await page.fill('#text-input', essay);
    await page.click('#verify-btn');
    const result = page.locator('#result');
    await expect(result).toBeVisible();

    await expect(result).toContainText('Signature valid');
    await expect(result).toContainText('Text matches');
    await expect(result).toContainText('No server record');

    // Timeline: inline SVG with typed / pasted bars and the paste marked
    await expect(result.locator('svg.timeline')).toHaveCount(1);
    expect(await result.locator('svg.timeline rect.tl-typed').count()).toBeGreaterThanOrEqual(1);
    expect(await result.locator('svg.timeline rect.tl-pasted').count()).toBeGreaterThanOrEqual(1);
    await expect(result.locator('svg.timeline .tl-paste')).toHaveCount(1);

    // Summary headline
    const headline = result.locator('.card').nth(1).locator('.headline');
    await expect(headline).toContainText('Written in one sitting');
    await expect(headline).toContainText('of active writing');
    await expect(headline).toContainText('characters typed');
    await expect(headline).toContainText(`${TYPED} characters typed, ${PASTED.length} pasted in 1 paste, ${p.process.deleted_chars} deleted`);
    await expect(headline).toContainText(`${Math.min(99, Math.round(TYPED_SHARE * 100))}% of what was entered was typed here`);

    // Pastes: when, size, share of the final text
    await expect(result).toContainText('Paste 1');
    await expect(result).toContainText(`${PASTED.length} characters`);
    await expect(result).toContainText(`${Math.round((PASTED.length / p.chars) * 100)}% of the final text length`);

    // Revision, rhythm, the fixed note
    await expect(result).toContainText(`Characters deleted${p.process.deleted_chars}`);
    await expect(result).toContainText('one statistic, not a verdict');
    await expect(result).toContainText('A process receipt records');

    // The language rules: nothing a teacher sees uses the forbidden words
    expect(forbiddenWord(await result.innerText())).toBeNull();
    expect(forbiddenWord(await result.evaluate(el => el.textContent))).toBeNull();

    // The wrong essay: the receipt was issued for a different text
    await page.fill('#text-input', essay + ' One more sentence the receipt was not issued for.');
    await page.click('#verify-btn');
    await expect(result).toContainText('Text does not match');
    await expect(result).toContainText('Signature valid');
    await expect(result).not.toContainText('Text matches');
  });

  test('the verify page recomputes the ledger file chain and matches it to the receipt', async ({ page, context }) => {
    await writeEssay(page, context);
    const essay = await editorText(page);
    const receipt = await readReceipt(page);
    const download = await downloadJson(page, '#btn-export-ledger');
    expect(download.filename).toMatch(/\.jitter-ledger\.json$/);
    const file = download.json;
    expect(file.final_hash).toBe(receipt.payload.ledger.hash);
    const n = file.checkpoints.length;

    const ledgerFile = text => ({ name: download.filename, mimeType: 'application/json', buffer: Buffer.from(text) });
    await openVerify(page);
    await page.fill('#badge-input', receipt.base64);
    await page.fill('#text-input', essay);
    await page.setInputFiles('#ledger-input', ledgerFile(download.text));
    await page.click('#verify-btn');
    const result = page.locator('#result');
    await expect(result).toBeVisible();

    await expect(result).toContainText('Signature valid');
    await expect(result).toContainText('Text matches');
    await expect(result).toContainText('Chain recomputed ✓');
    await expect(result).toContainText('Matches this receipt ✓');
    await expect(result).toContainText('Operations add up ✓');
    await expect(result).toContainText(`${n} blocks, ${file.ops.length} operations`);

    // The replay over the snapshots: the last block is the essay, the block after the paste is marked
    const scrubber = page.locator('#ledger-scrubber');
    await expect(scrubber).toHaveAttribute('max', String(n - 1));
    await scrubber.fill(String(n - 1));
    expect(visible(await page.locator('#ledger-replay-content').innerText())).toBe(FINAL_TEXT);
    await expect(page.locator('#ledger-replay-label')).toContainText(`block ${n}/${n}`);

    const pasteBlock = file.checkpoints.findIndex((cp, i) => {
      const from = i > 0 ? file.checkpoints[i - 1].op_index : 0;
      return file.ops.slice(from, cp.op_index).some(op => op.op === 'paste');
    });
    expect(pasteBlock).toBeGreaterThan(0);
    await scrubber.fill(String(pasteBlock));
    await expect(page.locator('#ledger-replay-paste')).toBeVisible();
    await expect(page.locator('#ledger-replay-paste')).toContainText(`This block follows a paste of ${PASTED.length} characters.`);
    await expect(page.locator('#ledger-replay-content')).toHaveClass(/pasted/);
    expect(visible(await page.locator('#ledger-replay-content').innerText())).toBe(visible(TYPED_1 + PASTED));

    await scrubber.fill('0');
    await expect(page.locator('#ledger-replay-paste')).toBeHidden();
    expect(visible(await page.locator('#ledger-replay-content').innerText())).toBe('');

    // One snapshot edited after the fact: the chain no longer recomputes
    const tampered = JSON.parse(download.text);
    tampered.checkpoints[n - 1].content += ' (edited after the fact)';
    await page.setInputFiles('#ledger-input', ledgerFile(JSON.stringify(tampered)));
    await page.click('#verify-btn');
    await expect(result).toContainText('Chain does not recompute ✗');
    await expect(result).toContainText(`Block ${n} of ${n} does not recompute`);
    await expect(result).toContainText('its content does not match its content hash');
    await expect(result).not.toContainText('Chain recomputed ✓');
    expect(forbiddenWord(await result.evaluate(el => el.textContent))).toBeNull();
  });

  test('an older v3 badge still verifies: signature, text binding and basic counts', async ({ page }) => {
    await openWriter(page);
    const essay = 'An essay certified by the previous extension badge.';

    // A v3 badge as the old extension issued it, signed with this device's key
    const v3 = await page.evaluate(async (text) => {
      await CryptoUtils.getOrCreateKeyPair();
      const payload = {
        version: '3.0',
        keys: 120, edits: 3, pastes: 1, pastedChars: 40, purity: 100, integrity: 75, entropy: 61,
        passportLevel: 'Novice', sessions: 1, date: '2026-09-01',
        text_hash: await CryptoUtils.textHash(text),
        url: 'jitter://writer',
        minted_at: new Date().toISOString(),
        publicKeyJwk: await CryptoUtils.getPublicKeyJwk(),
        publicKeyId: await CryptoUtils.getPublicKeyFingerprint(),
        previousBadge: null,
        war: 0.66, war_uncapped: 0.66,
        meanDwell: 88.5, stdDwell: 20.1, meanFlight: 190.2, stdFlight: 80.4, editingLinearity: 0.95,
      };
      payload.signature = await CryptoUtils.signBadge(payload);
      return { payload, base64: btoa(JSON.stringify(payload)) };
    }, essay);
    expect(v3.payload.signature).toBeTruthy();

    await openVerify(page);
    await page.fill('#badge-input', `#jitter:${v3.base64}`);
    await page.fill('#text-input', essay);
    await page.click('#verify-btn');
    const result = page.locator('#result');
    await expect(result).toBeVisible();

    await expect(result).toContainText('Signature valid');
    await expect(result).toContainText('Text matches');
    await expect(result).toContainText('Older badge v3.0 (counts only)');
    const summary = result.locator('.card').nth(1);
    await expect(summary).toContainText('Older badge (version 3.0)');
    await expect(summary).toContainText('120 keystrokes typed');
    await expect(summary).toContainText('40 characters pasted in 1 paste');
    await expect(summary).toContainText('3 backspaces');
    await expect(result).toContainText('No timeline: this receipt carries no process record.');
    await expect(result).toContainText('one statistic, not a verdict');
    await expect(result).toContainText('A process receipt records');
    expect(forbiddenWord(await result.innerText())).toBeNull();
    expect(forbiddenWord(await result.evaluate(el => el.textContent))).toBeNull();
  });
});
