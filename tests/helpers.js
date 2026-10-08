// Shared helpers for the Writer and verify-page specs. Both pages are opened
// from file:// with chrome.* mocked (tests/chrome-mock.js); the attestation
// server is answered with a 503, so every receipt is minted offline.
// Contract under test: docs/product/PROCESS_RECEIPT.md.
const path = require('path');
const fs = require('fs');

const PROJECT_DIR = path.resolve(__dirname, '..', 'extension');
const CHROME_MOCK = fs.readFileSync(path.join(__dirname, 'chrome-mock.js'), 'utf8');

// Words that never appear in anything a student or teacher sees
// (PROCESS_RECEIPT.md). "verdict" is allowed only inside the fixed rhythm
// label "one statistic, not a verdict".
const RHYTHM_LABEL = 'one statistic, not a verdict';
const FORBIDDEN = /\b(risk|risks|risky|suspicious|bot|bots|human-like|authentic|authenticity|verdict|detected|synthetic|denied)\b/i;
const FORBIDDEN_AI = /\bAI\b/;

/** The first forbidden word in `text`, or null. */
function forbiddenWord(text) {
  const t = String(text).split(RHYTHM_LABEL).join(' ');
  const m = t.match(FORBIDDEN) || t.match(FORBIDDEN_AI);
  return m ? m[0] : null;
}

async function blockNetwork(page) {
  // Firebase CDN and googleapis: not needed for tests and would hang
  await page.route('https://www.gstatic.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '// Firebase mock - blocked for testing',
  }));
  await page.route('https://*.googleapis.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: '// googleapis mock',
  }));
  // The attestation server is not part of these tests: the receipt is minted offline
  await page.route('https://*.supabase.co/**', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: '{"error":"unavailable in tests"}',
  }));
}

/**
 * Open writer.html with Chrome APIs mocked and wait for the editor to be
 * initialised (the Writer sets data-ready="1" once the document is restored,
 * the sitting is recorded and the first checkpoint is taken).
 */
async function openWriter(page) {
  await blockNetwork(page);
  await page.addInitScript(CHROME_MOCK);
  await page.goto(`file://${path.join(PROJECT_DIR, 'writer.html')}`, {
    waitUntil: 'load',
    timeout: 15000,
  });
  await page.waitForSelector('#editor[data-ready="1"]');
}

/**
 * Open verify.html with Chrome APIs mocked.
 */
async function openVerify(page) {
  await page.addInitScript(CHROME_MOCK);
  await page.goto(`file://${path.join(PROJECT_DIR, 'verify.html')}`);
  await page.waitForSelector('#verify-btn');
}

/** Focus the editor with the caret at the end, so keys and pastes land there. */
async function focusEditor(page) {
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

/**
 * Type text into the Writer key by key (real keydown / input / keyup events
 * through page.keyboard.type) with a fixed pause between keys. Long texts go
 * in chunks so no single action runs for very long. The caret is placed at
 * the end of the document first.
 */
async function typeText(page, text, options = {}) {
  const { delay = 30, chunk = 300 } = options;
  await focusEditor(page);
  for (let i = 0; i < text.length; i += chunk) {
    await page.keyboard.type(text.slice(i, i + chunk), { delay });
  }
}

/**
 * Paste text into the Writer the way a student does: through the clipboard
 * with Ctrl+V. Resolves once the sidebar's pasted count has moved. The test
 * must have granted clipboard-read / clipboard-write on the context.
 */
async function pasteText(page, text) {
  const before = await page.evaluate(() => document.getElementById('pasted-count').innerText);
  await focusEditor(page);
  await page.evaluate(t => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('Control+V');
  await page.waitForFunction(prev => document.getElementById('pasted-count').innerText !== prev, before, { timeout: 5000 });
}

/** The editor's text as the Writer hashes it (innerText, not normalised). */
async function editorText(page) {
  return page.evaluate(() => document.getElementById('editor').innerText);
}

/** Text normalised as CryptoUtils.textHash does before hashing. */
function normalizeText(text) {
  return String(text).replace(/\r\n?/g, '\n').trim();
}

async function sha256Hex(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Buffer.from(digest).toString('hex');
}

/** What the receipt's text_hash must be for `text` (Node WebCrypto, independent of the product code). */
async function textHash(text) {
  return sha256Hex(normalizeText(text));
}

/**
 * Simulate human typing in the editor — types each character with realistic
 * inter-keystroke delays (80-250ms) and longer pauses after punctuation.
 */
async function humanType(page, text, options = {}) {
  const { minDelay = 80, maxDelay = 250, punctuationPause = 400 } = options;
  const editor = page.locator('#editor');
  await editor.click();

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isPunctuation = /[\.\,\;\:\!\?]/.test(text[i - 1] || '');
    const delay = isPunctuation
      ? punctuationPause + Math.random() * 200
      : minDelay + Math.random() * (maxDelay - minDelay);

    await page.keyboard.type(char, { delay: 0 });
    await page.waitForTimeout(delay);
  }
}

/**
 * Simulate bot-like typing — very fast, very consistent.
 */
async function botType(page, text) {
  const editor = page.locator('#editor');
  await editor.click();
  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    await page.waitForTimeout(20); // 20ms = way too fast for human
  }
}

/**
 * The Writer's sidebar, as the student sees it.
 */
async function getStats(page) {
  return page.evaluate(() => {
    const text = id => { const el = document.getElementById(id); return el ? el.innerText : undefined; };
    return {
      words: text('word-count'),
      typed: text('typed-count'),
      pasted: text('pasted-count'),
      pasteEvents: text('paste-events'),
      deleted: text('deleted-count'),
      sittings: text('sittings-count'),
      activeTime: text('active-time'),
      ledgerBlocks: text('ledger-count'),
      ledgerHash: text('ledger-hash'),
      passportLine: text('passport-line'),
      saveState: text('save-state'),
    };
  });
}

/**
 * Click GET RECEIPT and capture what the Writer copies to the clipboard.
 * navigator.clipboard.write is intercepted in the page since the clipboard
 * may not be readable in headless mode.
 */
async function mintBadge(page) {
  const badgeData = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('mintBadge timeout: the Writer did not copy a receipt within 14 s')), 14000);

      navigator.clipboard.write = async function(data) {
        clearTimeout(timeout);
        try {
          const item = data[0];
          const types = Array.from(item.types);
          let html = '', plain = '';
          if (types.indexOf('text/html') >= 0) {
            const blob = await item.getType('text/html');
            html = await blob.text();
          }
          if (types.indexOf('text/plain') >= 0) {
            const blob = await item.getType('text/plain');
            plain = await blob.text();
          }
          resolve({ html, plain });
        } catch (e) {
          resolve({ html: '', plain: '', error: e.message });
        }
      };

      document.getElementById('btn-export').click();
    });
  });
  return badgeData;
}

/**
 * Extract the base64 payload from badge HTML.
 */
function extractBase64FromBadge(html) {
  const match = html.match(/data-jitter-payload="([^"]+)"/);
  if (match) return match[1];
  const urlMatch = html.match(/#jitter:([A-Za-z0-9+/=]+)/);
  if (urlMatch) return urlMatch[1];
  return null;
}

/**
 * Click GET RECEIPT and return the receipt: the badge HTML, the plain-text
 * code, the base64 payload, its JSON and the decoded payload.
 */
async function readReceipt(page) {
  const badge = await mintBadge(page);
  const base64 = extractBase64FromBadge(badge.html);
  if (!base64) throw new Error('No receipt payload in the copied badge' + (badge.error ? ': ' + badge.error : ''));
  // The Writer encodes with btoa: one byte per character
  const json = Buffer.from(base64, 'base64').toString('latin1');
  return { html: badge.html, plain: badge.plain, base64, json, payload: JSON.parse(json) };
}

/**
 * Click a download button (the receipt or the ledger file) and return the
 * file it produced.
 */
async function downloadJson(page, selector) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click(selector),
  ]);
  const text = fs.readFileSync(await download.path(), 'utf8');
  return { filename: download.suggestedFilename(), text, json: JSON.parse(text) };
}

/** Everything the Writer has autosaved (chrome.storage.local, mocked). */
async function readStorage(page) {
  return page.evaluate(() => chrome.storage.local.get(null));
}

/**
 * Wait until the autosaved document holds `typed` typed keystrokes (a pending
 * typing run counts), i.e. the last typing has landed in storage.
 */
async function waitForAutosave(page, typed, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const saved = await page.evaluate(async () => {
      const stored = await chrome.storage.local.get('writerDoc');
      const d = stored && stored.writerDoc;
      if (!d || !d.ledger || !Array.isArray(d.ledger.ops)) return null;
      const runs = d.ledger.ops.filter(o => o.op === 'type').reduce((sum, o) => sum + o.n, 0);
      return runs + (d.pendingRun ? d.pendingRun.n : 0);
    });
    if (saved === typed) return;
    if (Date.now() > deadline) throw new Error(`The autosave holds ${saved} typed keystrokes, not ${typed}, after ${timeoutMs} ms`);
    await page.waitForTimeout(200);
  }
}

/**
 * Click NEW DOCUMENT and answer its confirmation. Accepting clears the text
 * and the ledger and starts sitting 1 again; dismissing changes nothing.
 */
async function newDocument(page, accept = true) {
  page.once('dialog', dialog => (accept ? dialog.accept() : dialog.dismiss()));
  await page.click('#btn-new-doc');
  if (accept) {
    await page.waitForFunction(() =>
      document.getElementById('editor').innerText.trim() === ''
      && document.getElementById('typed-count').innerText === '0'
      && document.getElementById('ledger-count').innerText === '1 blocks'
      && document.getElementById('ledger-hash').innerText !== '—');
  } else {
    await page.waitForTimeout(200);
  }
}

module.exports = {
  PROJECT_DIR,
  RHYTHM_LABEL,
  forbiddenWord,
  openWriter,
  openVerify,
  focusEditor,
  typeText,
  pasteText,
  editorText,
  normalizeText,
  sha256Hex,
  textHash,
  humanType,
  botType,
  getStats,
  mintBadge,
  extractBase64FromBadge,
  readReceipt,
  downloadJson,
  readStorage,
  waitForAutosave,
  newDocument,
};
