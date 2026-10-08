/**
 * Extension contracts that need no browser: the manifest (capture is opt-in
 * per site, no login), the popup wiring, the background's canonical JSON
 * (must match CryptoUtils'), its origin handling, and the passport helper.
 *
 * Run: node tests/extension.test.js
 * (The browser-level checks are tests/capture-scope.spec.js and
 * tests/real-extension.spec.js.)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT = path.join(__dirname, '..', 'extension');

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exitCode = 1; return; }
  console.log('PASS:', msg);
}

// --- manifest ---
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
assert(manifest.manifest_version === 3, 'manifest: version 3');
assert(!manifest.content_scripts, 'manifest: no static content_scripts (capture is registered per enabled site)');
for (const p of ['storage', 'clipboardWrite', 'scripting', 'activeTab']) {
  assert(manifest.permissions.includes(p), `manifest: permission ${p}`);
}
assert(!manifest.permissions.includes('identity') && !manifest.oauth2, 'manifest: no identity permission, no oauth2 (no login)');
assert(!manifest.permissions.includes('tabs'), 'manifest: no tabs permission (activeTab is enough for the popup)');
assert(JSON.stringify(manifest.optional_host_permissions) === JSON.stringify(['https://*/*', 'http://*/*']),
  'manifest: optional_host_permissions are http(s), granted per site on request');
const hosts = manifest.host_permissions || [];
assert(!hosts.some(h => /firebase|googleapis|gstatic|<all_urls>|^\*|^https?:\/\/\*/.test(h)), 'manifest: no Firebase/Google/wildcard host permissions');
assert(hosts.every(h => h.startsWith('https://fmguuhnustgcqzgjaoil.supabase.co/')), 'manifest: the only fixed host is the attest/erase server');
assert(manifest.action && manifest.action.default_popup === 'popup.html', 'manifest: popup wired');
assert(manifest.background && manifest.background.service_worker === 'src/background.js', 'manifest: service worker');

// --- popup wiring ---
const popupHtml = fs.readFileSync(path.join(EXT, 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(EXT, 'src', 'popup.js'), 'utf8');
assert(/<script src="src\/popup\.js"><\/script>/.test(popupHtml), 'popup: popup.html loads src/popup.js');
assert(!fs.existsSync(path.join(EXT, 'popup.js')), 'popup: no stale extension/popup.js');
assert(!/<script>/.test(popupHtml), 'popup: no inline script (MV3 CSP)');
const htmlIds = [...popupHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const usedIds = [...popupJs.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
const missingIds = usedIds.filter(id => !htmlIds.includes(id));
assert(usedIds.length >= 10 && missingIds.length === 0, 'popup: every element id popup.js uses exists in popup.html' + (missingIds.length ? ' (missing: ' + missingIds.join(', ') + ')' : ''));
assert(!/signIn|signOut|getUser|chrome\.identity/.test(popupJs) && !/sign in/i.test(popupHtml), 'popup: no sign-in of any kind');
assert(/chrome\.permissions\.request\(/.test(popupJs), 'popup: requests the host permission itself (user gesture)');
for (const action of ['siteStatus', 'enableSite', 'disableSite', 'erase']) {
  assert(popupJs.includes(`action: '${action}'`), `popup: sends ${action} to the background`);
}
assert(/confirm\(/.test(popupJs), 'popup: erase asks for confirmation');
assert(popupHtml.includes('JITTEr records typing rhythm only, never text, and only on sites you enable'), 'popup: states what is recorded');
assert(!/\b(risk|suspicious|bot|AI detector|human-like|authentic|verdict|detected)\b/i.test(popupHtml + popupJs), 'popup: none of the forbidden words');

// --- background ---
global.chrome = {
  runtime: {
    onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} },
    getURL: p => p,
  },
  permissions: { onRemoved: { addListener() {} } },
  storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
};
global.window = global;
const cryptoSrc = fs.readFileSync(path.join(EXT, 'src', 'crypto-utils.js'), 'utf8');
vm.runInThisContext(cryptoSrc + '\n;globalThis.CryptoUtils = CryptoUtils;');
const CryptoUtils = globalThis.CryptoUtils;
const backgroundSrc = fs.readFileSync(path.join(EXT, 'src', 'background.js'), 'utf8');
const background = require(path.join(EXT, 'src', 'background.js'));

assert(!/chrome\.identity|getAuthToken|SUPABASE_ANON_KEY|signInWithGoogle/.test(backgroundSrc), 'background: no identity / Supabase auth code');
for (const action of ['deviceKey', 'sign', 'openWriter', 'siteStatus', 'enableSite', 'disableSite', 'listSites', 'erase']) {
  assert(backgroundSrc.includes(`request.action === '${action}'`), `background: handles ${action}`);
}
assert(/registerContentScripts|updateContentScripts/.test(backgroundSrc) && /unregisterContentScripts/.test(backgroundSrc), 'background: registers and unregisters the capture script');
assert(backgroundSrc.includes("chrome.runtime.onInstalled.addListener") && backgroundSrc.includes("chrome.runtime.onStartup.addListener"), 'background: re-syncs registration on install and on startup');

const samples = [
  { b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' }, u: undefined },
  { action: 'erase', publicKeyJwk: { y: 'Y', x: 'X', kty: 'EC', crv: 'P-256' }, requested_at: '2026-09-25T00:00:00.000Z' },
  [1, 'a', null, { k: undefined, j: [] }, undefined],
  'str', 42, null, true, {},
];
assert(samples.every(s => background.canonicalJson(s) === CryptoUtils.canonicalJson(s)), 'background: canonicalJson is identical to CryptoUtils.canonicalJson');
assert(background.canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' }, u: undefined }) === '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}',
  'background: canonicalJson sorts keys at every depth, no whitespace, undefined dropped');
assert(background.ERASE_URL === 'https://fmguuhnustgcqzgjaoil.supabase.co/functions/v1/erase', 'background: erase endpoint');
assert(backgroundSrc.includes("canonicalJson({ action: 'erase', publicKeyJwk, requested_at })") && backgroundSrc.includes('JSON.stringify({ publicKeyJwk, requested_at, signature })'),
  'background: erase signs {action, publicKeyJwk, requested_at} and posts {publicKeyJwk, requested_at, signature}');
assert(backgroundSrc.includes('res.status !== 200') && backgroundSrc.includes("chrome.storage.local.remove(['passport'"), 'background: local data is cleared only on HTTP 200');

assert(background.CAPTURE_SCRIPT_ID === 'jitter-capture', 'background: content script id');
assert(JSON.stringify(background.CAPTURE_FILES) === JSON.stringify(['src/crypto-utils.js', 'src/passport-utils.js', 'src/war-score.js', 'src/biometrics.js', 'src/content.js']),
  'background: capture files in load order');
assert(background.CAPTURE_FILES.every(f => fs.existsSync(path.join(EXT, f))), 'background: every capture file exists');

assert(background.normaliseOrigin('https://Example.com/path?x=1#y') === 'https://example.com', 'origin: normalised to scheme + host');
assert(background.normaliseOrigin('http://127.0.0.1:54342/a.html') === 'http://127.0.0.1:54342', 'origin: port kept');
assert(background.normaliseOrigin('chrome://extensions') === null && background.normaliseOrigin('file:///tmp/a.html') === null
  && background.normaliseOrigin('chrome-extension://abc/popup.html') === null && background.normaliseOrigin('nonsense') === null && background.normaliseOrigin(undefined) === null,
  'origin: only http(s) can be enabled');
assert(background.originPattern('https://example.com') === 'https://example.com/*', 'origin: match pattern is origin/*');
assert(background.patternCoversOrigin('<all_urls>', 'https://a.com') && background.patternCoversOrigin('https://*/*', 'https://a.com')
  && !background.patternCoversOrigin('http://*/*', 'https://a.com') && background.patternCoversOrigin('*://*.example.com/*', 'https://docs.example.com')
  && background.patternCoversOrigin('https://example.com/*', 'https://example.com') && !background.patternCoversOrigin('https://other.com/*', 'https://example.com'),
  'origin: a removed permission pattern is matched against enabled origins');

// --- content script (static) ---
const contentSrc = fs.readFileSync(path.join(EXT, 'src', 'content.js'), 'utf8');
assert(/function isCapturable\(/.test(contentSrc), 'content: has the capturable-field gate');
assert(!/suspicion|hourlyPattern|updatePassportLevel/.test(contentSrc), 'content: no suspicion score or hourly pattern left');
assert(contentSrc.includes("msg.action === 'captureOff'") && contentSrc.includes("msg.action === 'captureOn'"), 'content: obeys captureOff/captureOn from the background');

// --- passport ---
const PassportUtils = require(path.join(EXT, 'src', 'passport-utils.js'));
const passportSrc = fs.readFileSync(path.join(EXT, 'src', 'passport-utils.js'), 'utf8');
for (const gone of ['updateHourlyPattern', 'getNightActivityPercent', 'calculateSuspicionScore', 'getRiskLevel', 'calculateDailyAverages', 'calculateSessionAverages']) {
  assert(typeof PassportUtils[gone] === 'undefined', `passport: ${gone} removed`);
}
const passportCode = passportSrc.replace(/\/\/.*$/gm, '').replace(/LEGACY_FIELDS:\s*\[[^\]]*\]/, ''); // the names survive only as the list of fields to drop
assert(!/suspicion|night|risk|hourly/i.test(passportCode), 'passport: no suspicion / night-hours / hourly-pattern / risk code');
assert(typeof PassportUtils.updatePassport === 'function' && PassportUtils.updatePassport.length >= 1, 'passport: updatePassport(passport, keys, isSessionEnd) kept');

const today = new Date().toISOString().split('T')[0];
const legacy = {
  totalKeystrokes: 999, level: 'Novice', firstUsed: null, lastUsed: null, sessionsCompleted: 0,
  hourlyPattern: new Array(24).fill(0), suspicionScore: 40, suspicionSignals: ['High night activity'],
  avgDailyKeys: 5, dailyVariance: 0.1, avgSessionLength: 1, longestSession: 1, sessionLengthVariance: 0,
};
const p = PassportUtils.updatePassport(legacy, 1, false);
assert(p === legacy, 'passport: updates in place and returns the passport');
assert(typeof p.firstUsed === 'number' && typeof p.lastUsed === 'number', 'passport: firstUsed/lastUsed stamped');
assert(['hourlyPattern', 'suspicionScore', 'suspicionSignals', 'avgDailyKeys', 'dailyVariance', 'avgSessionLength', 'longestSession', 'sessionLengthVariance']
  .every(f => !(f in p)), 'passport: legacy fields dropped from a stored passport');
assert(p.dailyStats && p.dailyStats[today] === 1, 'passport: a keystroke is added to today');
assert(p.level === 'Novice', 'passport: level from totalKeystrokes (999 = Novice)');
p.totalKeystrokes = 1000;
PassportUtils.updatePassport(p, 1, false);
assert(p.level === 'Beginner' && p.dailyStats[today] === 2, 'passport: 1000 keys = Beginner, daily count accumulates');
PassportUtils.updatePassport(p, 500, true);
assert(p.sessionHistory && p.sessionHistory.lengths.length === 1 && p.sessionHistory.lengths[0] === 500 && p.sessionHistory.timestamps.length === 1,
  'passport: session end records the session length');
assert(p.dailyStats[today] === 2, 'passport: session end does not count the keys a second time');
PassportUtils.updatePassport(p, 0, true);
assert(p.sessionHistory.lengths.length === 1, 'passport: an empty session is not recorded');
assert(JSON.stringify(Object.keys(p).sort()) === JSON.stringify(['dailyStats', 'firstUsed', 'lastUsed', 'level', 'sessionHistory', 'sessionsCompleted', 'totalKeystrokes']),
  'passport: exactly the kept fields');

const levels = [[0, 'Novice'], [999, 'Novice'], [1000, 'Beginner'], [4999, 'Beginner'], [5000, 'Intermediate'], [14999, 'Intermediate'],
  [15000, 'Advanced'], [49999, 'Advanced'], [50000, 'Expert'], [149999, 'Expert'], [150000, 'Master'], [10000000, 'Master']];
assert(levels.every(([k, name]) => PassportUtils.level(k) === name), 'passport: level thresholds 1K/5K/15K/50K/150K');

const stats = {};
for (let i = 0; i < 95; i++) stats[new Date(Date.UTC(2026, 0, 1 + i)).toISOString().split('T')[0]] = 1;
PassportUtils.cleanOldStats(stats, 90);
assert(Object.keys(stats).length === 90 && !('2026-01-01' in stats), 'passport: daily stats keep the last 90 days');

const many = { totalKeystrokes: 0, sessionsCompleted: 0 };
for (let i = 0; i < 105; i++) PassportUtils.updatePassport(many, 10 + i, true);
assert(many.sessionHistory.lengths.length === 100 && many.sessionHistory.lengths[0] === 15, 'passport: session history keeps the last 100 sessions');

console.log(process.exitCode ? '\nextension.test.js: FAILURES' : '\nextension.test.js: all passed');
