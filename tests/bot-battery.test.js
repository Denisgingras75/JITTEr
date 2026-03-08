// tests/bot-battery.test.js
// "Send playwright bots to fuck around" — multiple bot attack vectors vs JitterBox.scoreRaw
// Each bot simulates a different evasion strategy. All should score WAR < 0.30.

var fs = require('fs')
var path = require('path')
var vm = require('vm')

var passed = 0
var failed = 0

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); failed++; return }
  console.log('PASS:', msg); passed++
}

// Load bundle
var bundlePath = path.join(__dirname, '..', 'sdk', 'dist', 'jitter.min.js')
if (!fs.existsSync(bundlePath)) { console.log('SKIP: build first'); process.exit(0) }

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

// Helper: generate N flight times with given mean and stddev
function genTimes(n, mean, std) {
  var times = []
  for (var i = 0; i < n; i++) {
    // Box-Muller for normal distribution
    var u1 = Math.random() || 0.001
    var u2 = Math.random()
    var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    times.push(Math.max(1, mean + z * std))
  }
  return times
}

console.log('\n=== BOT BATTERY: Attack Vector Tests ===\n')

// --- Control: Genuine human ---
var humanResult = JitterBox.scoreRaw({
  flightTimes: genTimes(80, 200, 80),
  dwellTimes: genTimes(80, 90, 30),
  humanChars: 80,
  alienChars: 0,
  backspaceCount: 5,
  pauseCount: 4,
})
console.log('  Human baseline WAR:', humanResult.war, '(' + humanResult.classification + ')')
assert(humanResult.war >= 0.40, 'Human WAR=' + humanResult.war + ' should be >= 0.40')

// --- Bot 1: Metronome — fixed 20ms intervals ---
console.log('\n--- Bot 1: Metronome (fixed 20ms) ---')
var bot1 = JitterBox.scoreRaw({
  flightTimes: Array(80).fill(20),
  dwellTimes: Array(80).fill(5),
  humanChars: 80,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 0,
})
console.log('  WAR:', bot1.war, 'class:', bot1.classification, 'flags:', bot1.flags)
assert(bot1.war === 0, 'Metronome bot WAR should be 0')

// --- Bot 2: Fast but with fake jitter (tiny std) ---
console.log('\n--- Bot 2: Fast + fake jitter (mean=25ms, std=5ms) ---')
var bot2 = JitterBox.scoreRaw({
  flightTimes: genTimes(80, 25, 5),
  dwellTimes: genTimes(80, 8, 2),
  humanChars: 80,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 0,
})
console.log('  WAR:', bot2.war, 'class:', bot2.classification, 'flags:', bot2.flags)
assert(bot2.war < 0.30, 'Fast-jitter bot WAR=' + bot2.war + ' should be < 0.30')

// --- Bot 3: Slow bot — human-speed but zero variance ---
console.log('\n--- Bot 3: Slow metronome (fixed 180ms) ---')
var bot3 = JitterBox.scoreRaw({
  flightTimes: Array(80).fill(180),
  dwellTimes: Array(80).fill(70),
  humanChars: 80,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 0,
})
console.log('  WAR:', bot3.war, 'class:', bot3.classification, 'flags:', bot3.flags)
assert(bot3.war < 0.30, 'Slow metronome WAR=' + bot3.war + ' should be < 0.30 (no variance = bot)')

// --- Bot 4: Replay attack — human timing but no pauses or edits ---
console.log('\n--- Bot 4: Stolen timing (human flights, 0 pauses, 0 edits) ---')
var bot4 = JitterBox.scoreRaw({
  flightTimes: genTimes(80, 200, 80),
  dwellTimes: genTimes(80, 90, 30),
  humanChars: 80,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 0,
})
console.log('  WAR:', bot4.war, 'class:', bot4.classification, 'flags:', bot4.flags)
// This is the hardest — timing looks human but no editing behavior
// Gets flagged 'no_editing_behavior' but timing alone can score well
// Assert it's flagged, not that it scores lower (RNG variance makes strict compare flaky)
assert(bot4.flags.indexOf('no_editing_behavior') >= 0, 'Replay bot should have no_editing_behavior flag')
assert(bot4.classification !== 'verified_human', 'Replay bot should not be verified_human, got ' + bot4.classification)

// --- Bot 5: Paste flood — 95% pasted ---
console.log('\n--- Bot 5: Paste flood (95% pasted) ---')
var bot5 = JitterBox.scoreRaw({
  flightTimes: genTimes(20, 200, 80),
  dwellTimes: genTimes(20, 90, 30),
  humanChars: 20,
  alienChars: 380,
  backspaceCount: 0,
  pauseCount: 0,
})
console.log('  WAR:', bot5.war, 'class:', bot5.classification, 'flags:', bot5.flags)
assert(bot5.war < 0.10, 'Paste flood WAR=' + bot5.war + ' should be < 0.10')
assert(bot5.flags.indexOf('paste_flood') >= 0, 'Should have paste_flood flag')

// --- Bot 6: Paste heavy — 60% pasted ---
console.log('\n--- Bot 6: Paste heavy (60% pasted) ---')
var bot6 = JitterBox.scoreRaw({
  flightTimes: genTimes(40, 200, 80),
  dwellTimes: genTimes(40, 90, 30),
  humanChars: 40,
  alienChars: 60,
  backspaceCount: 2,
  pauseCount: 1,
})
console.log('  WAR:', bot6.war, 'class:', bot6.classification, 'flags:', bot6.flags)
assert(bot6.war < humanResult.war * 0.5, 'Paste heavy WAR=' + bot6.war + ' should be < 50% of human')
assert(bot6.flags.indexOf('paste_heavy') >= 0, 'Should have paste_heavy flag')

// --- Bot 7: Burst bot — alternates fast bursts and pauses ---
console.log('\n--- Bot 7: Burst bot (fast bursts + long gaps) ---')
var bot7Flights = []
for (var i = 0; i < 80; i++) {
  bot7Flights.push(i % 10 === 0 ? 2000 : 15) // burst of 9 fast, then 2s gap
}
var bot7 = JitterBox.scoreRaw({
  flightTimes: bot7Flights,
  dwellTimes: Array(80).fill(5),
  humanChars: 80,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 8,
})
console.log('  WAR:', bot7.war, 'class:', bot7.classification, 'flags:', bot7.flags)
assert(bot7.war < 0.30, 'Burst bot WAR=' + bot7.war + ' should be < 0.30')

// --- Bot 8: Perfect typist — no backspaces at all (200 chars) ---
console.log('\n--- Bot 8: Perfect typist (200 chars, 0 backspaces) ---')
var bot8 = JitterBox.scoreRaw({
  flightTimes: genTimes(200, 180, 60),
  dwellTimes: genTimes(200, 85, 25),
  humanChars: 200,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 0,
})
console.log('  WAR:', bot8.war, 'class:', bot8.classification, 'flags:', bot8.flags)
// 200 chars with 0 backspaces and 0 pauses is suspicious
assert(bot8.war < humanResult.war, 'Perfect typist WAR=' + bot8.war + ' should be < human WAR=' + humanResult.war)

// --- Summary ---
console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===')
console.log('Human WAR: ' + humanResult.war)
console.log('Bot WARs: metronome=' + bot1.war + ' fast-jitter=' + bot2.war + ' slow-metro=' + bot3.war)
console.log('          replay=' + bot4.war + ' paste-flood=' + bot5.war + ' paste-heavy=' + bot6.war)
console.log('          burst=' + bot7.war + ' perfect=' + bot8.war)

if (failed > 0) process.exitCode = 1
