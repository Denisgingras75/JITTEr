const path = require('path');
const fs = require('fs');

const PROJECT_DIR = path.resolve(__dirname, '..', 'extension');
const CHROME_MOCK = fs.readFileSync(path.join(__dirname, 'chrome-mock.js'), 'utf8');

/**
 * Open writer.html with Chrome APIs mocked.
 * Firebase scripts are blocked (not needed for tests).
 */
async function openWriter(page) {
  // Block Firebase CDN — not needed for tests and would hang
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

  // Inject Chrome mock before any script runs
  await page.addInitScript(CHROME_MOCK);

  await page.goto(`file://${path.join(PROJECT_DIR, 'writer.html')}`, {
    waitUntil: 'load',
    timeout: 15000,
  });
  // Wait for the editor to be ready
  await page.waitForSelector('#editor[contenteditable="true"]');
}

/**
 * Open verify.html with Chrome APIs mocked.
 */
async function openVerify(page) {
  await page.addInitScript(CHROME_MOCK);
  await page.goto(`file://${path.join(PROJECT_DIR, 'verify.html')}`);
  await page.waitForSelector('#badge-input');
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
 * Get all sidebar stats as an object.
 */
async function getStats(page) {
  return page.evaluate(() => ({
    purity: document.getElementById('purity-display')?.innerText,
    entropy: document.getElementById('entropy-display')?.innerText,
    edits: document.getElementById('edits-display')?.innerText,
    words: document.getElementById('word-count')?.innerText,
    passport: document.getElementById('passport-display')?.innerText,
    passportLevel: document.getElementById('passport-level')?.innerText,
    ledgerBlocks: document.getElementById('ledger-count')?.innerText,
    ledgerHash: document.getElementById('ledger-hash')?.innerText,
  }));
}

/**
 * Mint a badge and return the badge data.
 * We intercept navigator.clipboard.write since it may not work in headless.
 */
async function mintBadge(page) {
  // Intercept clipboard.write by injecting into the page context
  // Use addInitScript-style approach for reliability
  const badgeData = await page.evaluate(async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('mintBadge timeout')), 14000);

      // Monkey-patch clipboard.write
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

      // Trigger the export
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

module.exports = {
  PROJECT_DIR,
  openWriter,
  openVerify,
  humanType,
  botType,
  getStats,
  mintBadge,
  extractBase64FromBadge,
};
