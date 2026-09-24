// tests/wgh-widget.test.js
// Tests scoreRaw integration through the built bundle — human capture, bot
// capture, paste handling, insufficient data. jitter-capture.js (the WGH path)
// calls JitterBox.scoreRaw() at runtime in the browser; this exercises the same
// entry point in sdk/dist/jitter.min.js, so run `node sdk/build.js` first.
// Deterministic: timing arrays come from a seeded PRNG.

var fs = require('fs')
var path = require('path')
var vm = require('vm')

var passed = 0
var failed = 0
function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); failed++; process.exitCode = 1; return }
  console.log('PASS:', msg); passed++
}
function near(a, b, tol) { return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol }

// Load the built bundle into a fake window context
var bundlePath = path.join(__dirname, '..', 'sdk', 'dist', 'jitter.min.js')
if (!fs.existsSync(bundlePath)) {
  console.error('FAIL: sdk/dist/jitter.min.js not found — run `node sdk/build.js` first')
  process.exit(1)
}

var code = fs.readFileSync(bundlePath, 'utf8')
var sandbox = {
  window: {},
  global: {},
  document: { readyState: 'complete', querySelectorAll: function() { return [] } },
  localStorage: { getItem: function() { return null }, setItem: function() {}, removeItem: function() {} },
  console: console,
  performance: { now: Date.now },
  MutationObserver: undefined,
  WeakMap: WeakMap,
  Set: Set,
  Date: Date,
  Math: Math,
  Object: Object,
  Array: Array,
  parseInt: parseInt,
  String: String,
}
sandbox.window.document = sandbox.document
sandbox.window.localStorage = sandbox.localStorage

vm.createContext(sandbox)
vm.runInContext(code, sandbox)

var JitterBox = sandbox.window.JitterBox
var JitterWAR = sandbox.window.JitterWAR

assert(JitterBox != null, 'JitterBox should be exposed on window')
assert(typeof JitterBox.scoreRaw === 'function', 'JitterBox.scoreRaw should be a function')
assert(JitterWAR != null && typeof JitterWAR.scoreProfile === 'function', 'The bundle exposes the shared engine as window.JitterWAR')
assert(JitterBox.WAR === JitterWAR, 'JitterBox.WAR is the same engine object')
var weightSum = Object.keys(JitterWAR.WAR_WEIGHTS).reduce(function (a, k) { return a + JitterWAR.WAR_WEIGHTS[k] }, 0)
assert(near(weightSum, 1, 1e-9) && JitterWAR.WAR_WEIGHTS.purity === 0.05 && JitterWAR.WAR_WEIGHTS.editing === 0.07,
  'Bundled engine carries the plan weights (sum 1.0, purity 0.05, editing 0.07)')

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
var rng = mulberry32(2026)

// --- Test 1: Human-like capture data ---
var humanFlights = []
var humanDwells = []
for (var i = 0; i < 50; i++) {
  humanFlights.push(150 + rng() * 200) // 150-350ms
  humanDwells.push(60 + rng() * 80)    // 60-140ms
}

function humanCapture(overrides) {
  var base = {
    flightTimes: humanFlights,
    dwellTimes: humanDwells,
    humanChars: 50,
    alienChars: 0,
    backspaceCount: 3,
    pauseCount: 2,
  }
  for (var k in overrides) base[k] = overrides[k]
  return base
}

var humanResult = JitterBox.scoreRaw(humanCapture())

assert(humanResult.war != null, 'Human scoreRaw should return a WAR score')
assert(humanResult.war >= 0.30, 'Human WAR=' + humanResult.war + ' should be >= 0.30')
assert(humanResult.classification !== 'bot', 'Human should not be classified as bot, got ' + humanResult.classification)
assert(typeof humanResult.raw_war === 'number' && typeof humanResult.tier === 'string',
  'scoreRaw reports raw_war (' + humanResult.raw_war + ') and tier (' + humanResult.tier + ')')
assert(humanResult.paste && humanResult.paste.count === 0 && humanResult.paste.weightedChars === 0,
  'A typed-only session reports zero paste')
assert(humanResult.components.dwell_uniformity === undefined && typeof humanResult.components.distribution === 'number',
  'Components use the plan names (distribution, no dwell_uniformity)')

// --- Test 2: Bot capture data (fixed timing) ---
var botResult = JitterBox.scoreRaw({
  flightTimes: Array(50).fill(5),
  dwellTimes: Array(50).fill(1),
  humanChars: 50,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 0,
})

assert(botResult.war === 0, 'Bot WAR=' + botResult.war + ' should be 0 (hard floor)')
assert(botResult.flags.length > 0, 'Bot should have flags')

// --- Test 3: Insufficient data ---
var shortResult = JitterBox.scoreRaw({
  flightTimes: [100, 200, 300],
  dwellTimes: [50, 60],
  humanChars: 3,
  alienChars: 0,
})

assert(shortResult.war === null, 'Short capture WAR should be null')
assert(shortResult.classification === 'insufficient_data', 'Short capture should be insufficient_data')

// --- Test 4: Paste-heavy session (10 typed, one 200-char paste) ---
var pasteResult = JitterBox.scoreRaw({
  flightTimes: humanFlights,
  dwellTimes: humanDwells,
  humanChars: 10,
  alienChars: 200,
  backspaceCount: 0,
  pauseCount: 0,
  pasteCount: 1,
})

assert(pasteResult.war != null, 'Paste session should still score')
assert(pasteResult.war < humanResult.war, 'Paste WAR=' + pasteResult.war + ' should be less than human WAR=' + humanResult.war)
assert(pasteResult.paste.chars === 200 && pasteResult.paste.weightedChars === 60,
  'A 200-char paste is reported (200 chars, 0.3x = 60 weighted)')
assert(pasteResult.flags.indexOf('paste_heavy') < 0 && pasteResult.flags.indexOf('paste_flood') < 0,
  'No paste penalty flags')

// --- Test 5: Null/undefined input ---
var nullResult = JitterBox.scoreRaw(null)
assert(nullResult.war === null, 'Null input should return null WAR')
assert(nullResult.classification === 'insufficient_data', 'Null input → insufficient_data')

var emptyResult = JitterBox.scoreRaw({})
assert(emptyResult.war === null, 'Empty input should return null WAR')

var nanResult = JitterBox.scoreRaw(humanCapture({ flightTimes: humanFlights.concat([NaN, undefined]) }))
assert(Number.isFinite(nanResult.war) && nanResult.war === humanResult.war,
  'A NaN flight time is ignored, not propagated (' + nanResult.war + ')')

// --- Test 6: Paste is transparent, not punished (JITTER-PLAN "Paste weighting") ---
// jitter-capture.js sends alienChars + pasteCount (no per-event lengths); the
// engine weights the total as one paste.
var urlResult = JitterBox.scoreRaw(humanCapture({ alienChars: 39, pasteCount: 1 }))
assert(near(urlResult.war, humanResult.war, 0.02),
  'One 39-char URL paste: WAR ' + humanResult.war + ' -> ' + urlResult.war + ' (within 0.02)')
assert(urlResult.classification === humanResult.classification, 'A pasted URL keeps the classification')
assert(urlResult.paste.count === 1 && urlResult.paste.chars === 39 && near(urlResult.paste.weightedChars, 3.9, 1e-9),
  'URL paste reported as ' + JSON.stringify(urlResult.paste))

var paragraphResult = JitterBox.scoreRaw(humanCapture({ alienChars: 445, pasteCount: 1 }))
assert(humanResult.war - paragraphResult.war >= 0 && humanResult.war - paragraphResult.war <= 0.10,
  'One 445-char paragraph: WAR ' + humanResult.war + ' -> ' + paragraphResult.war + ' (drop <= 0.10)')
assert(paragraphResult.raw_war < 0.5 || paragraphResult.classification !== 'bot',
  'A paragraph paste never flips a raw_war >= 0.5 session to bot (' + paragraphResult.classification + ')')
assert(paragraphResult.paste.weightedChars === 445, 'A paragraph counts at full weight')

var threeResult = JitterBox.scoreRaw(humanCapture({ alienChars: 90, pasteCount: 3 }))
assert(threeResult.flags.indexOf('high_paste_volume') >= 0, 'Three pastes set high_paste_volume (pasteCount only)')
assert(near(threeResult.war, humanResult.war, 0.05), 'Three pastes are flagged, not penalized: ' + humanResult.war + ' -> ' + threeResult.war)

var lengthsResult = JitterBox.scoreRaw(humanCapture({ alienChars: 90, pasteCount: 3, pasteLengths: [30, 30, 30] }))
assert(lengthsResult.paste.count === 3 && lengthsResult.paste.weightedChars === 9,
  'Per-event lengths are honoured when present (3 x 30 chars at 0.1x = 9)')
assert(lengthsResult.flags.indexOf('high_paste_volume') >= 0, 'high_paste_volume from pasteLengths')

// --- Test 7: Time cap through the bundle ---
var capped = JitterBox.applyTimeCap(Object.assign({}, humanResult), Date.now())
assert(capped.timeCap === 0.35 && capped.war === Math.min(humanResult.war, 0.35) && capped.raw_war === humanResult.raw_war,
  'applyTimeCap caps war (not raw_war) at 0.35 on day 0')

console.log('\n' + passed + ' passed, ' + failed + ' failed')
console.log('Done.')
