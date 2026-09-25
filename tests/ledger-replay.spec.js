// The writing ledger: operations (never characters) and hash-chained
// checkpoints over content snapshots, taken at a sitting boundary, after
// every paste, after 60 s of activity and at minting. The replay panel scrubs
// through the checkpoints; the ledger file exports as v4 with a chain any
// verifier can recompute. Contract: docs/product/PROCESS_RECEIPT.md.
const { test, expect } = require('@playwright/test');
const { openWriter, typeText, pasteText, getStats, readReceipt, downloadJson, editorText, sha256Hex } = require('./helpers');

const PASTED = 'Pasted paragraph: recorded by its length, shown in the replay.';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OP_FIELDS = { type: ['op', 't', 'n', 'ms'], delete: ['op', 't', 'n'], paste: ['op', 't', 'len'], blur: ['op', 't'], focus: ['op', 't'], session: ['op', 't', 'k'] };

function scrub(page, selector, idx) {
  return page.locator(selector).fill(String(idx));
}

test.describe('Writing Ledger & Replay', () => {
  test('ledger starts with one block: the sitting checkpoint', async ({ page }) => {
    await openWriter(page);

    const stats = await getStats(page);
    expect(stats.ledgerBlocks).toBe('1 blocks');
    expect(stats.ledgerHash).toMatch(/^[0-9A-F]{12}$/);

    const file = (await downloadJson(page, '#btn-export-ledger')).json;
    expect(file.ops).toEqual([expect.objectContaining({ op: 'session', k: 1 })]);
    expect(file.checkpoints).toHaveLength(1);
    expect(file.checkpoints[0]).toMatchObject({ i: 0, op_index: 1, content: '' });
    expect(file.checkpoints[0].hash.slice(0, 12).toUpperCase()).toBe(stats.ledgerHash);
  });

  test('getting a receipt adds a block and moves the chain hash', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, 'Hello world.');

    const before = await getStats(page);
    const receipt = await readReceipt(page);
    const after = await getStats(page);

    expect(after.ledgerBlocks).toBe('2 blocks');
    expect(after.ledgerHash).not.toBe(before.ledgerHash);
    expect(receipt.payload.ledger.checkpoints).toBe(2);
    expect(receipt.payload.ledger.hash.slice(0, 12).toUpperCase()).toBe(after.ledgerHash);
  });

  test('a checkpoint is taken after every paste', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, 'Typed first. ');

    await pasteText(page, PASTED);
    await expect(page.locator('#ledger-count')).toHaveText('2 blocks');

    await pasteText(page, ' And again.');
    await expect(page.locator('#ledger-count')).toHaveText('3 blocks');
  });

  test('a checkpoint is taken after 60 s of activity', async ({ page }) => {
    await openWriter(page);
    // Sixty seconds of typing do not fit in a test: the time of the last
    // checkpoint is moved 61 s into the past instead, so the typing run that
    // ends next is past the limit.
    await page.evaluate(() => { doc.lastCheckpointAt -= 61000; });
    await typeText(page, 'Written for a while.');
    // The run ends 2 s after the last key; the checkpoint follows
    await expect(page.locator('#ledger-count')).toHaveText('2 blocks', { timeout: 8000 });
  });

  test('replay panel opens over the checkpoints', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, 'This text will appear in the replay panel when we scrub through.');
    await readReceipt(page); // a second block

    await page.click('#btn-replay');
    const replayPanel = page.locator('#replay-panel');
    await expect(replayPanel).toBeVisible();

    await expect(page.locator('#replay-scrubber')).toHaveAttribute('max', '1');
    await expect(page.locator('#replay-time')).toContainText('T+');
    await expect(page.locator('#replay-time')).toContainText('block 1/2');
    await expect(page.locator('#replay-paste-indicator')).toBeHidden();
  });

  test('scrubbing shows the document at each block', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);

    await typeText(page, 'First chunk. ');
    await readReceipt(page);
    await typeText(page, 'Second chunk.');
    await readReceipt(page);
    expect((await getStats(page)).ledgerBlocks).toBe('3 blocks');

    await page.click('#btn-replay');
    await expect(page.locator('#replay-panel')).toBeVisible();
    const shown = async () => (await page.locator('#replay-editor').innerText()).replace(/ /g, ' ').trim();

    await scrub(page, '#replay-scrubber', 0);
    expect(await shown()).toBe('');
    await expect(page.locator('#replay-time')).toContainText('block 1/3');

    await scrub(page, '#replay-scrubber', 1);
    expect(await shown()).toBe('First chunk.');
    await expect(page.locator('#replay-time')).toContainText('block 2/3');

    await scrub(page, '#replay-scrubber', 2);
    expect(await shown()).toBe('First chunk. Second chunk.');
    await expect(page.locator('#replay-time')).toContainText('block 3/3');
  });

  test('the replay marks the block that follows a paste', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    await typeText(page, 'Intro. ');
    await pasteText(page, PASTED);
    await expect(page.locator('#ledger-count')).toHaveText('2 blocks');

    await page.click('#btn-replay');
    await scrub(page, '#replay-scrubber', 1);
    await expect(page.locator('#replay-paste-indicator')).toBeVisible();
    await expect(page.locator('#replay-paste-indicator')).toContainText(`PASTE OF ${PASTED.length} CHARACTERS`);
    expect((await page.locator('#replay-editor').innerText()).replace(/ /g, ' ').trim()).toBe('Intro. ' + PASTED);

    await scrub(page, '#replay-scrubber', 0);
    await expect(page.locator('#replay-paste-indicator')).toBeHidden();
  });

  test('replay close button works', async ({ page }) => {
    await openWriter(page);
    await typeText(page, 'Quick typing.');

    await page.click('#btn-replay');
    await expect(page.locator('#replay-panel')).toBeVisible();

    await page.click('#replay-close-btn');
    await expect(page.locator('#replay-panel')).toBeHidden();
  });

  test('ledger export downloads a v4 ledger file whose chain recomputes', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWriter(page);
    const typed1 = 'Content for the ledger export test. ';
    await typeText(page, typed1);
    await pasteText(page, PASTED);
    await typeText(page, ' The endd');
    await page.keyboard.press('Backspace');
    const receipt = await readReceipt(page);
    const text = await editorText(page);

    const download = await downloadJson(page, '#btn-export-ledger');
    expect(download.filename).toMatch(/^untitled-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.jitter-ledger\.json$/);
    const file = download.json;

    expect(file.version).toBe('4.0');
    expect(file.type).toBe('jitter-ledger');
    expect(file.started_at).toMatch(ISO);
    expect(file.exported_at).toMatch(ISO);
    expect(file.started_at).toBe(file.ops[0].t);

    // Operations: counts and timestamps only, never characters
    expect(file.ops.length).toBeGreaterThan(0);
    expect(file.ops[0]).toMatchObject({ op: 'session', k: 1 });
    for (const op of file.ops) {
      expect(Object.keys(OP_FIELDS)).toContain(op.op);
      expect(Object.keys(op).sort()).toEqual(OP_FIELDS[op.op].slice().sort());
      expect(op.t).toMatch(ISO);
    }
    const typedOps = file.ops.filter(op => op.op === 'type');
    expect(typedOps.reduce((sum, op) => sum + op.n, 0)).toBe(typed1.length + ' The endd'.length);
    expect(typedOps.every(op => op.n >= 1 && op.n <= 50 && op.ms >= 0)).toBe(true);
    expect(file.ops.filter(op => op.op === 'paste')).toEqual([expect.objectContaining({ len: PASTED.length })]);
    expect(file.ops.filter(op => op.op === 'delete')).toEqual([expect.objectContaining({ n: 1 })]);
    expect(JSON.stringify(file.ops)).not.toContain('ledger export');
    expect(JSON.stringify(file.ops)).not.toContain('Pasted paragraph');

    // Checkpoints: the student's replay, hash-chained
    expect(file.checkpoints.length).toBeGreaterThanOrEqual(3); // sitting, paste, minting
    let prev = 'genesis';
    for (let i = 0; i < file.checkpoints.length; i++) {
      const cp = file.checkpoints[i];
      expect(Object.keys(cp).sort()).toEqual(['content', 'content_hash', 'hash', 'i', 'op_index', 't']);
      expect(cp.i).toBe(i);
      expect(cp.t).toMatch(ISO);
      expect(cp.op_index).toBeLessThanOrEqual(file.ops.length);
      if (i > 0) expect(cp.op_index).toBeGreaterThanOrEqual(file.checkpoints[i - 1].op_index);
      expect(cp.content_hash).toBe(await sha256Hex(cp.content));
      expect(cp.hash).toBe(await sha256Hex(`${prev}|${cp.op_index}|${cp.t}|${cp.content_hash}`));
      prev = cp.hash;
    }
    const last = file.checkpoints[file.checkpoints.length - 1];
    expect(file.final_hash).toBe(last.hash);
    expect(last.content).toBe(text);
    expect(last.op_index).toBe(file.ops.length);

    // The receipt was issued on this chain
    expect(receipt.payload.ledger.hash).toBe(file.final_hash);
    expect(receipt.payload.ledger.checkpoints).toBe(file.checkpoints.length);
    expect(receipt.payload.ledger.ops).toBe(file.ops.length);
  });
});
