// tests/bot-battery.test.js
// "Send playwright bots to fuck around" — multiple bot attack vectors vs JitterBox.scoreRaw
// in the built SDK bundle. Each bot simulates a different evasion strategy.
// Deterministic: every random draw comes from a seeded PRNG, so a failure is a
// real regression and not an unlucky sample.

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

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
var rng = mulberry32(0x5EED)

// Helper: generate N times with given mean and stddev (Box-Muller, seeded)
function genTimes(n, mean, std) {
  var times = []
  for (var i = 0; i < n; i++) {
    var u1 = rng() || 0.001
    var u2 = rng()
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
assert(bot1.classification === 'bot', 'Metronome bot is classified bot')

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
// This is the hardest — timing looks human but no editing behavior.
assert(bot4.flags.indexOf('no_editing_behavior') >= 0, 'Replay bot should have no_editing_behavior flag')
assert(bot4.classification !== 'verified', 'Replay bot should not be verified, got ' + bot4.classification)
assert(bot4.war < humanResult.war, 'Replay bot WAR=' + bot4.war + ' should be below the human WAR=' + humanResult.war)

// --- Bot 5: Paste flood — 95% pasted (one 380-char paste) ---
// Paste is transparent, not punished (Hard Rule #5): the paste is reported and
// enters the purity signal at full weight (> 300 chars), nothing else changes.
console.log('\n--- Bot 5: Paste flood (95% pasted) ---')
var floodFlights = genTimes(20, 200, 80)
var floodDwells = genTimes(20, 90, 30)
var bot5 = JitterBox.scoreRaw({
  flightTimes: floodFlights,
  dwellTimes: floodDwells,
  humanChars: 20,
  alienChars: 380,
  backspaceCount: 0,
  pauseCount: 0,
  pasteCount: 1,
})
var bot5Typed = JitterBox.scoreRaw({
  flightTimes: floodFlights,
  dwellTimes: floodDwells,
  humanChars: 20,
  alienChars: 0,
  backspaceCount: 0,
  pauseCount: 0,
})
console.log('  WAR:', bot5.war, 'class:', bot5.classification, 'flags:', bot5.flags, 'paste:', JSON.stringify(bot5.paste))
assert(bot5.paste.count === 1 && bot5.paste.chars === 380 && bot5.paste.weightedChars === 380,
  'Paste flood is reported: 380 chars at full weight')
assert(bot5.components.purity < 0.10, 'Paste flood purity component=' + bot5.components.purity + ' should be < 0.10')
assert(bot5.flags.indexOf('paste_flood') < 0 && bot5.flags.indexOf('paste_heavy') < 0, 'No paste_flood / paste_heavy penalty flags')
assert(bot5Typed.war - bot5.war >= 0 && bot5Typed.war - bot5.war <= 0.10,
  'Paste flood changes WAR only through purity: ' + bot5Typed.war + ' -> ' + bot5.war)

// --- Bot 6: Paste heavy — 60% pasted (one 60-char paste, 0.3x) ---
console.log('\n--- Bot 6: Paste heavy (60% pasted) ---')
var heavyFlights = genTimes(40, 200, 80)
var heavyDwells = genTimes(40, 90, 30)
var bot6 = JitterBox.scoreRaw({
  flightTimes: heavyFlights,
  dwellTimes: heavyDwells,
  humanChars: 40,
  alienChars: 60,
  backspaceCount: 2,
  pauseCount: 1,
  pasteCount: 1,
})
var bot6Typed = JitterBox.scoreRaw({
  flightTimes: heavyFlights,
  dwellTimes: heavyDwells,
  humanChars: 40,
  alienChars: 0,
  backspaceCount: 2,
  pauseCount: 1,
})
console.log('  WAR:', bot6.war, 'class:', bot6.classification, 'flags:', bot6.flags, 'paste:', JSON.stringify(bot6.paste))
assert(bot6.paste.count === 1 && bot6.paste.chars === 60 && bot6.paste.weightedChars === 18,
  'A 60-char paste is weighted 0.3x (18 weighted chars)')
assert(bot6Typed.war - bot6.war >= 0 && bot6Typed.war - bot6.war <= 0.03,
  'A 60-char paste moves WAR by at most 0.03: ' + bot6Typed.war + ' -> ' + bot6.war)
assert(bot6.flags.indexOf('paste_heavy') < 0, 'No paste_heavy flag')

// --- Paste volume: three pastes are flagged, not penalized ---
console.log('\n--- Paste volume: three pastes ---')
var volume = JitterBox.scoreRaw({
  flightTimes: heavyFlights,
  dwellTimes: heavyDwells,
  humanChars: 40,
  alienChars: 60,
  backspaceCount: 2,
  pauseCount: 1,
  pasteCount: 3,
  pasteLengths: [20, 20, 20],
})
console.log('  WAR:', volume.war, 'flags:', volume.flags, 'paste:', JSON.stringify(volume.paste))
assert(volume.flags.indexOf('high_paste_volume') >= 0, 'Three pastes set high_paste_volume')
assert(volume.paste.weightedChars === 6, 'Three 20-char pastes weigh 0.1x each (6 weighted chars)')
assert(bot6Typed.war - volume.war >= 0 && bot6Typed.war - volume.war <= 0.02,
  'Three small pastes cost at most 0.02: ' + bot6Typed.war + ' -> ' + volume.war)

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
