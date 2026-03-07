// tests/wgh-widget.test.js
// Tests scoreRaw integration — human capture, bot capture, paste-heavy, insufficient data

// scoreRaw lives in jitter-box.js but is not a CommonJS module.
// We test via the built bundle or by shimming. For now, inline the logic test
// against the export from jitter-box.js test exports.

// Since jitter-box.js uses ES module syntax, we need to test scoreRaw
// by loading the built bundle or duplicating the call path.
// The real integration test: wgh-widget.js calls JitterBox.scoreRaw()
// at runtime in the browser. Here we test scoreRaw's profile-building logic.

var fs = require('fs')
var path = require('path')
var vm = require('vm')

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exitCode = 1; return }
  console.log('PASS:', msg)
}

// Load the built bundle into a fake window context
var bundlePath = path.join(__dirname, '..', 'sdk', 'dist', 'jitter.min.js')
var bundleExists = fs.existsSync(bundlePath)

if (!bundleExists) {
  console.log('SKIP: sdk/dist/jitter.min.js not found — run build first')
  process.exit(0)
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

assert(JitterBox != null, 'JitterBox should be exposed on window')
assert(typeof JitterBox.scoreRaw === 'function', 'JitterBox.scoreRaw should be a function')

// --- Test 1: Human-like capture data ---
var humanFlights = []
var humanDwells = []
for (var i = 0; i < 50; i++) {
  humanFlights.push(150 + Math.random() * 200) // 150-350ms
  humanDwells.push(60 + Math.random() * 80)    // 60-140ms
}

var humanResult = JitterBox.scoreRaw({
  flightTimes: humanFlights,
  dwellTimes: humanDwells,
  humanChars: 50,
  alienChars: 0,
  backspaceCount: 3,
  pauseCount: 2,
})

assert(humanResult.war != null, 'Human scoreRaw should return a WAR score')
assert(humanResult.war >= 0.30, 'Human WAR=' + humanResult.war + ' should be >= 0.30')
assert(humanResult.classification !== 'bot', 'Human should not be classified as bot, got ' + humanResult.classification)

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

// --- Test 4: Paste-heavy session ---
var pasteResult = JitterBox.scoreRaw({
  flightTimes: humanFlights,
  dwellTimes: humanDwells,
  humanChars: 10,
  alienChars: 200,
  backspaceCount: 0,
  pauseCount: 0,
})

assert(pasteResult.war != null, 'Paste session should still score')
assert(pasteResult.war < humanResult.war, 'Paste WAR=' + pasteResult.war + ' should be less than human WAR=' + humanResult.war)

// --- Test 5: Null/undefined input ---
var nullResult = JitterBox.scoreRaw(null)
assert(nullResult.war === null, 'Null input should return null WAR')
assert(nullResult.classification === 'insufficient_data', 'Null input → insufficient_data')

var emptyResult = JitterBox.scoreRaw({})
assert(emptyResult.war === null, 'Empty input should return null WAR')

console.log('\nDone.')
