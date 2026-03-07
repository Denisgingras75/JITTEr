# Jitter SDK — Generic Widget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a single `jitter.min.js` that any site can drop in with `<script>` + `Jitter.init()` to get silent keystroke capture, WAR scoring, and badge rendering. Verification threshold: 3 reviews over 3 calendar days.

**Architecture:** Capture engine already exists in `jitter-box.js`. Main work is wiring verification threshold into `init.js`, exposing badge API, building the dist, and testing end-to-end.

**Tech Stack:** Vanilla JS (`var` syntax), no dependencies, no build tools beyond `build.js` concatenator

---

### Task 1: Add SDK integration tests

**Files:**
- Create: `tests/sdk.test.js`

**Step 1: Write test file**

This tests the built dist file end-to-end in Node (with jsdom-like mocking for DOM).

```js
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

// Inject before requiring
if (typeof global !== 'undefined') {
  global.localStorage = mockLocalStorage
}

// We test init.js functions directly
var initModule = require('../sdk/src/init.js')

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exitCode = 1; return }
  console.log('PASS:', msg)
}

// --- Test helpers ---

function resetStorage() {
  storage = {}
}

// --- Tests ---

// Test 1: getVerificationStatus returns not eligible with no history
resetStorage()
var status = initModule.getVerificationStatus()
assert(status.eligible === false, 'No history → not eligible')
assert(status.reviewCount === 0, 'No history → 0 reviews')

// Test 2: getVerificationStatus with 2 reviews (not enough)
resetStorage()
storage.jitter_review_count = '2'
storage.jitter_first_review = String(Date.now())
var status2 = initModule.getVerificationStatus()
assert(status2.eligible === false, '2 reviews → not eligible')

// Test 3: getVerificationStatus with 3 reviews but same day (not enough time)
resetStorage()
storage.jitter_review_count = '3'
storage.jitter_first_review = String(Date.now())
var status3 = initModule.getVerificationStatus()
assert(status3.eligible === false, '3 reviews same day → not eligible')

// Test 4: getVerificationStatus with 3 reviews and 4 days ago (eligible)
resetStorage()
storage.jitter_review_count = '3'
storage.jitter_first_review = String(Date.now() - 4 * 24 * 60 * 60 * 1000)
var status4 = initModule.getVerificationStatus()
assert(status4.eligible === true, '3 reviews + 4 days → eligible')

// Test 5: recordReview increments count and sets first_review
resetStorage()
initModule.recordReview()
assert(storage.jitter_review_count === '1', 'First review → count = 1')
assert(storage.jitter_first_review != null, 'First review → timestamp set')

// Test 6: recordReview increments existing count
storage.jitter_review_count = '2'
initModule.recordReview()
assert(storage.jitter_review_count === '3', 'Third review → count = 3')

// Test 7: recordReview does not overwrite first_review timestamp
var originalTs = storage.jitter_first_review
initModule.recordReview()
assert(storage.jitter_first_review === originalTs, 'first_review timestamp preserved')

// Test 8: applyVerification overrides classification when not eligible
var fakeResult = { war: 0.85, classification: 'verified', flags: [] }
resetStorage()
var modified = initModule.applyVerification(fakeResult)
assert(modified.classification === 'building', 'Not eligible → classification = building')
assert(modified.eligible === false, 'Not eligible → eligible = false')

// Test 9: applyVerification keeps classification when eligible
resetStorage()
storage.jitter_review_count = '5'
storage.jitter_first_review = String(Date.now() - 10 * 24 * 60 * 60 * 1000)
var fakeResult2 = { war: 0.85, classification: 'verified', flags: [] }
var kept = initModule.applyVerification(fakeResult2)
assert(kept.classification === 'verified', 'Eligible → classification preserved')
assert(kept.eligible === true, 'Eligible → eligible = true')

// Test 10: applyVerification still returns bot for hard-floored results even if eligible
resetStorage()
storage.jitter_review_count = '5'
storage.jitter_first_review = String(Date.now() - 10 * 24 * 60 * 60 * 1000)
var botResult = { war: 0, classification: 'bot', flags: ['dwell_floor'] }
var stillBot = initModule.applyVerification(botResult)
assert(stillBot.classification === 'bot', 'Bot stays bot even if eligible')

console.log('\nDone.')
```

**Step 2: Run test — expect failures (functions don't exist yet)**

Run: `cd /tmp/jitter-clone && node tests/sdk.test.js`
Expected: TypeError — `initModule.getVerificationStatus is not a function`

**Step 3: Commit**

```bash
git add tests/sdk.test.js && git commit -m "test: add SDK verification threshold tests"
```

---

### Task 2: Add verification threshold logic to init.js

**Files:**
- Modify: `sdk/src/init.js`

**Step 1: Add verification functions**

After the `var config = { ... }` block (line 22), add:

```js
// ── Verification Threshold ──────────────────────────────────────────

function getVerificationStatus() {
  var count = 0
  var firstReview = null
  try {
    count = parseInt(localStorage.getItem('jitter_review_count') || '0', 10)
    var ts = localStorage.getItem('jitter_first_review')
    if (ts) firstReview = parseInt(ts, 10)
  } catch (e) {}

  var daysSinceFirst = 0
  if (firstReview) {
    daysSinceFirst = Math.floor((Date.now() - firstReview) / (1000 * 60 * 60 * 24))
  }

  return {
    eligible: count >= 3 && daysSinceFirst >= 3,
    reviewCount: count,
    daysSinceFirst: daysSinceFirst,
  }
}

function recordReview() {
  try {
    var count = parseInt(localStorage.getItem('jitter_review_count') || '0', 10)
    localStorage.setItem('jitter_review_count', String(count + 1))
    if (!localStorage.getItem('jitter_first_review')) {
      localStorage.setItem('jitter_first_review', String(Date.now()))
    }
  } catch (e) {}
}

function applyVerification(result) {
  var status = getVerificationStatus()
  result.eligible = status.eligible
  result.reviewCount = status.reviewCount

  // Bot classification overrides everything — even eligible users
  if (result.classification === 'bot') return result

  // If not yet eligible, force 'building' regardless of WAR score
  if (!status.eligible) {
    result.classification = 'building'
  }

  return result
}
```

**Step 2: Wire verification into `score()` function**

Replace the `score()` function (lines 101-124) with:

```js
function score(el) {
  var instance = null

  if (el) {
    instance = instances.get(el)
  } else {
    // Find the most recently active instance
    instances.forEach(function (inst) {
      instance = inst
    })
  }

  if (!instance) return null

  var result = instance.score()
  if (!result) return null

  // Record this review and apply verification threshold
  recordReview()
  result = applyVerification(result)

  // Generate session token for server-side verification
  result.session_token = generateSessionToken(result)

  if (config.onScore) config.onScore(result)

  return result
}
```

**Step 3: Expose badge API and verification functions**

Replace the Jitter export object (lines 175-182) with:

```js
var Jitter = {
  init: init,
  attach: attach,
  score: score,
  detach: detach,
  detachAll: detachAll,
  createBadge: typeof createBadge !== 'undefined' ? createBadge : null,
  insertBadge: typeof insertBadge !== 'undefined' ? insertBadge : null,
  getVerificationStatus: getVerificationStatus,
  version: '1.0.0',
}
```

Also add to the module.exports guard at bottom — export the test-accessible functions:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Jitter
  module.exports.getVerificationStatus = getVerificationStatus
  module.exports.recordReview = recordReview
  module.exports.applyVerification = applyVerification
}
```

**Step 4: Run tests**

Run: `cd /tmp/jitter-clone && node tests/sdk.test.js`
Expected: All 10 PASS

**Step 5: Commit**

```bash
git add sdk/src/init.js && git commit -m "feat: add verification threshold — 3 reviews, 3 days"
```

---

### Task 3: Fix build.js strip patterns and build dist

**Files:**
- Modify: `sdk/build.js` (if needed)
- Create: `sdk/dist/jitter.min.js` (generated)

**Step 1: Run the build**

```bash
cd /tmp/jitter-clone/sdk && node build.js
```

Check the output for errors. If it fails, likely cause is the `export default` / `export { }` ES module syntax in jitter-box.js — the regex strip `^export .+$` should handle it.

**Step 2: Verify the dist file is valid JS**

```bash
node -e "var fs = require('fs'); var code = fs.readFileSync('/tmp/jitter-clone/sdk/dist/jitter.min.js', 'utf8'); console.log('Size:', Math.round(code.length/1024) + 'KB'); try { new Function(code); console.log('PASS: Valid JS') } catch(e) { console.error('FAIL:', e.message) }"
```

Expected: Valid JS, ~25KB

**Step 3: Verify Jitter and JitterBox are exposed in the IIFE**

```bash
grep -c "window.Jitter" /tmp/jitter-clone/sdk/dist/jitter.min.js
grep -c "window.JitterBox" /tmp/jitter-clone/sdk/dist/jitter.min.js
```

Expected: 1 match each

**Step 4: Check that createBadge is available in the bundle**

The build concatenates badge.js between core and init. In the IIFE scope, `createBadge` and `insertBadge` from badge.js are available when init.js references them via `typeof createBadge !== 'undefined'`.

```bash
grep -n "createBadge" /tmp/jitter-clone/sdk/dist/jitter.min.js | head -5
```

Expected: function definition from badge.js AND reference from init.js both present.

**Step 5: Commit**

```bash
git add sdk/dist/jitter.min.js sdk/build.js && git commit -m "build: generate jitter.min.js dist bundle"
```

---

### Task 4: Run all tests, copy to Desktop, push

**Step 1: Run both test files**

```bash
cd /tmp/jitter-clone && node tests/war-scorer.test.js && node tests/sdk.test.js
```

Expected: All tests pass in both files.

**Step 2: Copy updated extension to Desktop**

```bash
rm -rf ~/Desktop/jitter-extension
cp -r /tmp/jitter-clone/extension ~/Desktop/jitter-extension
```

**Step 3: Copy SDK dist to Desktop for easy access**

```bash
mkdir -p ~/Desktop/jitter-sdk
cp /tmp/jitter-clone/sdk/dist/jitter.min.js ~/Desktop/jitter-sdk/
```

**Step 4: Push**

```bash
cd /tmp/jitter-clone && git push origin main
```

**Step 5: Copy plans to permanent location**

```bash
cp /tmp/jitter-clone/docs/plans/2026-03-07-jitter-sdk-design.md ~/Documents/jitter-patent-filing/docs/plans/
cp /tmp/jitter-clone/docs/plans/2026-03-07-jitter-sdk-impl.md ~/Documents/jitter-patent-filing/docs/plans/
```

---

## Definition of Done

- [ ] All 10 tests in `sdk.test.js` PASS
- [ ] All 13 tests in `war-scorer.test.js` PASS
- [ ] `getVerificationStatus()` returns `{ eligible, reviewCount, daysSinceFirst }`
- [ ] `score()` calls `recordReview()` and `applyVerification()`
- [ ] `Jitter.createBadge` is exposed in public API
- [ ] `jitter.min.js` is valid JS, ~25KB, exposes `window.Jitter` and `window.JitterBox`
- [ ] Classification = 'building' until 3 reviews + 3 days
- [ ] Bot classification overrides eligible status
- [ ] All committed and pushed
- [ ] Dist file on Desktop at `~/Desktop/jitter-sdk/jitter.min.js`
