// tests/sdk.test.js
// Tests init.js logic: verification threshold, score wrapping, badge exposure

// Mock localStorage
var storage = {}
var mockLocalStorage = {
  getItem: function (k) { return storage[k] || null },
  setItem: function (k, v) { storage[k] = String(v) },
  removeItem: function (k) { delete storage[k] },
  clear: function () { storage = {} },
}

if (typeof global !== 'undefined') {
  global.localStorage = mockLocalStorage
}

var initModule = require('../sdk/src/init.js')

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exitCode = 1; return }
  console.log('PASS:', msg)
}

function resetStorage() {
  storage = {}
}

// Test 1: No history → not eligible
resetStorage()
var status = initModule.getVerificationStatus()
assert(status.eligible === false, 'No history → not eligible')
assert(status.reviewCount === 0, 'No history → 0 reviews')

// Test 2: 2 reviews → not enough
resetStorage()
storage.jitter_review_count = '2'
storage.jitter_first_review = String(Date.now())
var status2 = initModule.getVerificationStatus()
assert(status2.eligible === false, '2 reviews → not eligible')

// Test 3: 3 reviews same day → not enough time
resetStorage()
storage.jitter_review_count = '3'
storage.jitter_first_review = String(Date.now())
var status3 = initModule.getVerificationStatus()
assert(status3.eligible === false, '3 reviews same day → not eligible')

// Test 4: 3 reviews + 4 days → eligible
resetStorage()
storage.jitter_review_count = '3'
storage.jitter_first_review = String(Date.now() - 4 * 24 * 60 * 60 * 1000)
var status4 = initModule.getVerificationStatus()
assert(status4.eligible === true, '3 reviews + 4 days → eligible')

// Helper: fake result with text signal
function textResult() {
  return { war: 0.7, classification: 'verified', flags: [], session: { keystrokes: 50 } }
}

// Test 5: recordReview with text signal sets count and timestamp
resetStorage()
initModule.recordReview(textResult())
assert(storage.jitter_review_count === '1', 'First review → count = 1')
assert(storage.jitter_first_review != null, 'First review → timestamp set')

// Test 6: recordReview increments
storage.jitter_review_count = '2'
initModule.recordReview(textResult())
assert(storage.jitter_review_count === '3', 'Third review → count = 3')

// Test 7: recordReview preserves first_review
var originalTs = storage.jitter_first_review
initModule.recordReview(textResult())
assert(storage.jitter_first_review === originalTs, 'first_review timestamp preserved')

// Test 8: Not eligible → classification = building
var fakeResult = { war: 0.85, classification: 'verified', flags: [] }
resetStorage()
var modified = initModule.applyVerification(fakeResult)
assert(modified.classification === 'building', 'Not eligible → classification = building')
assert(modified.eligible === false, 'Not eligible → eligible = false')

// Test 9: Eligible → classification preserved
resetStorage()
storage.jitter_review_count = '5'
storage.jitter_first_review = String(Date.now() - 10 * 24 * 60 * 60 * 1000)
var fakeResult2 = { war: 0.85, classification: 'verified', flags: [] }
var kept = initModule.applyVerification(fakeResult2)
assert(kept.classification === 'verified', 'Eligible → classification preserved')
assert(kept.eligible === true, 'Eligible → eligible = true')

// Test 10: Bot stays bot even if eligible
resetStorage()
storage.jitter_review_count = '5'
storage.jitter_first_review = String(Date.now() - 10 * 24 * 60 * 60 * 1000)
var botResult = { war: 0, classification: 'bot', flags: ['dwell_floor'] }
var stillBot = initModule.applyVerification(botResult)
assert(stillBot.classification === 'bot', 'Bot stays bot even if eligible')

// --- Slider Bot Mitigation Tests ---

// Test 11: hasTextSignal rejects slider-only sessions
assert(!initModule.hasTextSignal(null), 'null result → no text signal')
assert(!initModule.hasTextSignal({ war: null, session: { keystrokes: 0 } }), 'Slider-only → no text signal')
assert(!initModule.hasTextSignal({ war: 0.5, session: { keystrokes: 5 } }), '<10 keystrokes → no text signal')
assert(initModule.hasTextSignal({ war: 0.7, session: { keystrokes: 50 } }), 'Typed review → has text signal')

// Test 12: recordReview rejects slider-only (no text signal)
resetStorage()
var sliderResult = { war: null, session: { keystrokes: 0 } }
var counted = initModule.recordReview(sliderResult)
assert(counted === false, 'Slider-only review should not count')
assert(storage.jitter_review_count == null, 'Slider-only should not increment count')

// Test 13: recordReview accepts typed review
resetStorage()
var typedCounted = initModule.recordReview(textResult())
assert(typedCounted === true, 'Typed review should count')
assert(storage.jitter_review_count === '1', 'Typed review increments count')

// --- Velocity Pattern Tests ---

// Test 14: same_day_same_site flagged
var manipReviews = [
  { timestamp: '2026-03-01T10:00:00Z', siteKey: 'restaurant_a', war: 0.6 },
  { timestamp: '2026-03-01T10:05:00Z', siteKey: 'restaurant_a', war: 0.6 },
  { timestamp: '2026-03-01T10:10:00Z', siteKey: 'restaurant_a', war: 0.6 },
]
var vFlags = initModule.checkVelocityPatterns(manipReviews)
assert(vFlags.indexOf('same_day_same_site') !== -1, 'Should flag same-day same-site pattern')
assert(vFlags.indexOf('compressed_verification') !== -1, 'Should flag compressed verification')

// Test 15: normal reviews across days — no flags
var normalReviews = [
  { timestamp: '2026-03-01T10:00:00Z', siteKey: 'restaurant_a', war: 0.7 },
  { timestamp: '2026-03-03T14:00:00Z', siteKey: 'restaurant_b', war: 0.8 },
  { timestamp: '2026-03-05T09:00:00Z', siteKey: 'restaurant_c', war: 0.6 },
]
var nFlags = initModule.checkVelocityPatterns(normalReviews)
assert(nFlags.length === 0, 'Normal reviews across days → no flags')

console.log('\nDone.')
