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

// Test 5: recordReview sets count and timestamp
resetStorage()
initModule.recordReview()
assert(storage.jitter_review_count === '1', 'First review → count = 1')
assert(storage.jitter_first_review != null, 'First review → timestamp set')

// Test 6: recordReview increments
storage.jitter_review_count = '2'
initModule.recordReview()
assert(storage.jitter_review_count === '3', 'Third review → count = 3')

// Test 7: recordReview preserves first_review
var originalTs = storage.jitter_first_review
initModule.recordReview()
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

console.log('\nDone.')
