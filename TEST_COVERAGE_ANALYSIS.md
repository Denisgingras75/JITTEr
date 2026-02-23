# Test Coverage Analysis

**Date:** February 2026
**Scope:** Full codebase — crypto-utils.js, passport-utils.js, auth-utils.js, writer.js, content.js, background.js

---

## Current State

**Test coverage: 0%.** There are no test files, no test framework, and no `package.json` in the project. All 6 source files (~3,000 lines) are completely untested.

Both `crypto-utils.js` and `passport-utils.js` already export via CommonJS guards (`if (typeof module !== 'undefined' && module.exports)`), which means they're ready to be imported by a test runner without modification.

---

## Recommended Test Infrastructure

Since the codebase is vanilla JavaScript with no build system, a lightweight setup is appropriate:

```
npm init -y
npm install --save-dev vitest jsdom
```

**Why vitest:** Fast, zero-config for JS projects, built-in jsdom support for DOM-dependent code, and it's what the planned platform project already specifies.

**Mocking requirements:**
- `chrome.storage.local` — needed by every file
- `chrome.runtime` — needed by background.js, content.js
- `crypto.subtle` — needed by crypto-utils.js (or use Node's `webcrypto`)
- `firebase` — needed by auth-utils.js
- DOM elements — needed by writer.js, content.js, verify.html

---

## Priority Areas for Testing

Ranked by risk and impact. Each area includes the specific functions to test, why they matter, and example test cases.

---

### Priority 1: Passport Suspicion Scoring (passport-utils.js)

**Risk: HIGH** — This is the bot detection engine. If thresholds are wrong, bots pass or humans get flagged. No tests means no confidence that the scoring logic works across edge cases.

**Functions to test:**

| Function | Lines | Why it matters |
|---|---|---|
| `calculateSuspicionScore(passport)` | 132-187 | Core bot detection — 6 independent signals combining into a 0-100 score |
| `calculateSessionAverages(passport)` | 59-88 | Variance calculation feeds suspicion scoring; math errors silently corrupt risk levels |
| `calculateDailyAverages(passport)` | 91-116 | Daily variance is a key anti-bot signal; coefficient of variation math must be correct |
| `getNightActivityPercent(passport)` | 119-129 | Night activity (2am-6am) is a strong bot indicator; off-by-one in slice range would break it |
| `getRiskLevel(suspicionScore)` | 199-203 | Boundary conditions (39 vs 40, 69 vs 70) determine LOW/MEDIUM/HIGH classification |
| `updateDailyStats(passport, keystrokeCount)` | 5-18 | 90-day retention window; cleanOldStats must not delete recent data |
| `recordSession(passport, sessionKeys)` | 35-56 | 100-session cap; FIFO eviction must be correct |
| `cleanOldStats(dailyStats, maxDays)` | 190-196 | Date sorting must be lexicographic (YYYY-MM-DD); wrong sort order deletes recent data |

**Example test cases:**

```javascript
// Signal 1: Superhuman daily output
test('flags high daily output above 5000 keys/day', () => {
  const passport = makePassport({ avgDailyKeys: 6000, dailyVariance: 0.5 });
  const result = PassportUtils.calculateSuspicionScore(passport);
  expect(result.suspicionScore).toBeGreaterThanOrEqual(30);
  expect(result.suspicionSignals).toContain('High daily output');
});

// Signal 2: Too consistent (bot-like regularity)
test('flags unnaturally consistent output', () => {
  const passport = makePassport({ dailyVariance: 0.1, avgDailyKeys: 1000 });
  const result = PassportUtils.calculateSuspicionScore(passport);
  expect(result.suspicionSignals).toContain('Unnaturally consistent');
});

// Edge case: score capped at 100
test('suspicion score never exceeds 100', () => {
  const passport = makePassport({
    avgDailyKeys: 8000, dailyVariance: 0.1,
    sessionsCompleted: 500, firstUsed: Date.now() - 86400000,
    totalKeystrokes: 50000, longestSession: 15000
  });
  const result = PassportUtils.calculateSuspicionScore(passport);
  expect(result.suspicionScore).toBeLessThanOrEqual(100);
});

// Edge case: completely clean passport
test('new passport with no activity has zero suspicion', () => {
  const passport = makePassport({ avgDailyKeys: 0, sessionsCompleted: 0 });
  const result = PassportUtils.calculateSuspicionScore(passport);
  expect(result.suspicionScore).toBe(0);
  expect(result.suspicionSignals).toHaveLength(0);
});

// Boundary: night activity percentage
test('night activity correctly slices hours 2-5', () => {
  const hourly = new Array(24).fill(0);
  hourly[3] = 50; // 3am
  const passport = makePassport({ hourlyPattern: hourly });
  // 50 out of 50 total = 100%
  expect(PassportUtils.getNightActivityPercent(passport)).toBe(100);
});

// Risk level boundaries
test('score 39 is LOW, score 40 is MEDIUM', () => {
  expect(PassportUtils.getRiskLevel(39).level).toBe('LOW');
  expect(PassportUtils.getRiskLevel(40).level).toBe('MEDIUM');
});

test('score 69 is MEDIUM, score 70 is HIGH', () => {
  expect(PassportUtils.getRiskLevel(69).level).toBe('MEDIUM');
  expect(PassportUtils.getRiskLevel(70).level).toBe('HIGH');
});
```

---

### Priority 2: Cryptographic Operations (crypto-utils.js)

**Risk: HIGH** — Badge signing and verification is the foundation of the trust model. The CODE_REVIEW.md already identifies that verify.html never calls `verifyBadge()`. When that's fixed, the crypto functions must actually work correctly.

**Functions to test:**

| Function | Lines | Why it matters |
|---|---|---|
| `signBadge(badgeData)` + `verifyBadge(badgeData, sig, pubKey)` | 95-166 | Round-trip: sign then verify must return true; tampered data must return false |
| `verifyBadge()` with wrong key | 127-166 | Must reject signatures from a different key pair |
| `hashBadge(badgeBase64)` | 169-182 | Deterministic: same input must produce same hash; different inputs must differ |
| `getPublicKeyFingerprint()` | 71-92 | Must be deterministic for the same key; 12-char uppercase hex output format |
| `getOrCreateKeyPair()` | 6-57 | Idempotent: calling twice returns the same keys; first call generates new ones |

**Example test cases:**

```javascript
// Note: Node.js has globalThis.crypto via 'webcrypto', no polyfill needed

test('sign then verify round-trip succeeds', async () => {
  const badge = { integrity: 95, cr: 2.5, keys: 1200 };
  const signature = await CryptoUtils.signBadge(badge);
  const pubKey = await CryptoUtils.getPublicKeyJwk();
  const isValid = await CryptoUtils.verifyBadge(badge, signature, pubKey);
  expect(isValid).toBe(true);
});

test('tampered badge fails verification', async () => {
  const badge = { integrity: 95, cr: 2.5, keys: 1200 };
  const signature = await CryptoUtils.signBadge(badge);
  const pubKey = await CryptoUtils.getPublicKeyJwk();
  const tampered = { ...badge, integrity: 100 }; // changed
  const isValid = await CryptoUtils.verifyBadge(tampered, signature, pubKey);
  expect(isValid).toBe(false);
});

test('verification fails with wrong public key', async () => {
  // Generate a second key pair, sign with first, verify with second
  // Should return false
});

test('hashBadge is deterministic', async () => {
  const input = btoa('test-badge-data');
  const hash1 = await CryptoUtils.hashBadge(input);
  const hash2 = await CryptoUtils.hashBadge(input);
  expect(hash1).toBe(hash2);
  expect(hash1).toHaveLength(16); // first 16 hex chars
});

test('signBadge uses canonical key ordering', async () => {
  // { b: 1, a: 2 } and { a: 2, b: 1 } should produce the same signature
  // because signBadge sorts keys before stringifying
  const badge1 = { b: 1, a: 2 };
  const badge2 = { a: 2, b: 1 };
  const sig1 = await CryptoUtils.signBadge(badge1);
  const sig2 = await CryptoUtils.signBadge(badge2);
  // ECDSA signatures are non-deterministic, so we verify instead
  const pubKey = await CryptoUtils.getPublicKeyJwk();
  expect(await CryptoUtils.verifyBadge(badge2, sig1, pubKey)).toBe(true);
});
```

---

### Priority 3: Loki Biometric Analysis (writer.js `analyzeRhythm()`, content.js `analyzeRhythm()`)

**Risk: HIGH** — The biometric analysis determines whether a user is flagged as a bot. False positives (humans flagged as bots) would block legitimate students from submitting work. False negatives (bots passing as human) would defeat the system's purpose.

**Note:** `analyzeRhythm()` is duplicated in both `writer.js:210-240` and `content.js:129-151`. This duplication itself is a testing concern — changes to one copy but not the other would cause inconsistent behavior.

**Logic to test (extract into a testable module):**

| Logic | Location | Why it matters |
|---|---|---|
| Bot detection: stdDev < 8 | writer.js:228, content.js:140 | Threshold determines rhythm-based bot flag |
| Bot detection: avgFlow < 35ms | writer.js:229, content.js:141 | Speed threshold — too fast = bot |
| Bot detection: cognitive ratio < 1.2 with enough keys | writer.js:230, content.js:142 | Linear typing = no thinking pauses = bot |
| Entropy calculation: `stdDev + (cognitiveRatio * 10)` | writer.js:238, content.js:149 | Capped at 100; determines entropy display |
| Flow vs gap classification: `isGap` regex | writer.js:170, content.js:91 | Punctuation/space detection must match expected chars |

**Example test cases:**

```javascript
// These require extracting analyzeRhythm into a pure function
// Input: flowIntervals[], gapIntervals[], humanChars
// Output: { isBot, entropy, cognitiveRatio }

test('human-like typing is not flagged as bot', () => {
  // Simulate natural typing: ~150ms avg, stdDev ~30ms
  const flow = [120, 160, 140, 180, 130, 170, 150, 190, 110, 155];
  const gap = [350, 420, 380, 450];
  const result = analyzeRhythm(flow, gap, 200);
  expect(result.isBot).toBe(false);
  expect(result.entropy).toBeGreaterThan(0);
});

test('perfectly regular timing triggers bot detection', () => {
  // stdDev < 8: nearly identical intervals
  const flow = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101];
  const gap = [100, 101];
  const result = analyzeRhythm(flow, gap, 200);
  expect(result.isBot).toBe(true);
  expect(result.entropy).toBe(0);
});

test('superhuman speed triggers bot detection', () => {
  // avgFlow < 35ms
  const flow = [20, 25, 30, 22, 28, 33, 21, 27, 24, 31];
  const gap = [25, 30];
  const result = analyzeRhythm(flow, gap, 200);
  expect(result.isBot).toBe(true);
});

test('no cognitive pauses triggers bot detection after enough keys', () => {
  // cognitiveRatio < 1.2 with humanChars > 100 (writer) or > 200 (content)
  const flow = [100, 110, 105, 95, 115, 90, 120, 108, 102, 98];
  const gap = [105, 110]; // gap ~= flow, ratio ~1.0
  const result = analyzeRhythm(flow, gap, 200);
  expect(result.isBot).toBe(true);
});

test('entropy is capped at 100', () => {
  // High stdDev + high cognitive ratio could exceed 100
  const flow = [50, 200, 60, 250, 70, 300, 55, 220, 65, 280];
  const gap = [800, 900, 1000];
  const result = analyzeRhythm(flow, gap, 200);
  expect(result.entropy).toBeLessThanOrEqual(100);
});

test('insufficient data skips analysis', () => {
  const flow = [100, 110, 105]; // only 3, need 10
  const result = analyzeRhythm(flow, [], 50);
  expect(result).toBeNull(); // should return early
});
```

---

### Priority 4: Passport Merge Logic (auth-utils.js `mergePassports()`)

**Risk: MEDIUM** — Incorrect merging silently corrupts the passport, losing anti-bot signals accumulated across devices. The CODE_REVIEW.md originally flagged `mergePassports()` as lossy. The current implementation has a deep merge, but it has subtle edge cases that need testing.

**Function to test:** `mergePassports(local, cloud)` at auth-utils.js:250-299

**Example test cases:**

```javascript
test('totalKeystrokes takes the maximum', () => {
  const local = makePassport({ totalKeystrokes: 5000 });
  const cloud = makePassport({ totalKeystrokes: 8000 });
  const merged = mergePassports(local, cloud);
  expect(merged.totalKeystrokes).toBe(8000);
});

test('firstUsed takes the earliest timestamp', () => {
  const local = makePassport({ firstUsed: 1000 });
  const cloud = makePassport({ firstUsed: 500 });
  const merged = mergePassports(local, cloud);
  expect(merged.firstUsed).toBe(500);
});

test('dailyStats takes max per day, preserves unique days', () => {
  const local = makePassport({
    dailyStats: { '2026-01-01': 100, '2026-01-02': 200 }
  });
  const cloud = makePassport({
    dailyStats: { '2026-01-01': 150, '2026-01-03': 300 }
  });
  const merged = mergePassports(local, cloud);
  expect(merged.dailyStats['2026-01-01']).toBe(150); // cloud had more
  expect(merged.dailyStats['2026-01-02']).toBe(200); // local-only day
  expect(merged.dailyStats['2026-01-03']).toBe(300); // cloud-only day
});

test('hourlyPattern sums both passports', () => {
  const local = makePassport({ hourlyPattern: [10, 0, ...new Array(22).fill(0)] });
  const cloud = makePassport({ hourlyPattern: [5, 3, ...new Array(22).fill(0)] });
  const merged = mergePassports(local, cloud);
  expect(merged.hourlyPattern[0]).toBe(15);
  expect(merged.hourlyPattern[1]).toBe(3);
});

test('sessionHistory deduplicates by timestamp', () => {
  const local = makePassport({
    sessionHistory: { timestamps: [1000, 2000], lengths: [100, 200] }
  });
  const cloud = makePassport({
    sessionHistory: { timestamps: [2000, 3000], lengths: [200, 300] }
  });
  const merged = mergePassports(local, cloud);
  expect(merged.sessionHistory.timestamps).toEqual([1000, 2000, 3000]);
  expect(merged.sessionHistory.lengths).toEqual([100, 200, 300]);
});

test('merge with empty passport preserves data', () => {
  const real = makePassport({
    totalKeystrokes: 5000,
    dailyStats: { '2026-01-01': 500 },
    hourlyPattern: new Array(24).fill(10)
  });
  const empty = makePassport({});
  const merged = mergePassports(real, empty);
  expect(merged.totalKeystrokes).toBe(5000);
  expect(merged.dailyStats['2026-01-01']).toBe(500);
});
```

---

### Priority 5: Badge Payload Construction & Integrity Calculation

**Risk: MEDIUM** — Badge payloads are the data artifact that teachers verify. If the integrity percentage or passport data is wrong in the payload, the entire verification chain is compromised.

**Functions to test:**

| Function | File | Why it matters |
|---|---|---|
| `exportBadge()` | writer.js:330-438 | Builds the badge payload; integrity calculation: `humanChars / textLength` |
| `copyBadge(stats, isCommit)` | content.js:326-402 | Builds the content-mode badge; integrity: `typed / (typed + pasted)` |
| `calculateStats()` | content.js:163-183 | Calculates typed/total/integrity/pastes from current project state |
| `updatePassportLevel()` | writer.js:252-260, content.js:119-127 | Level thresholds (duplicated — another testing concern) |

**Example test cases:**

```javascript
// updatePassportLevel (both files have identical logic)
test('level thresholds are correct', () => {
  expect(getLevel(0)).toBe('Novice');
  expect(getLevel(999)).toBe('Novice');
  expect(getLevel(1000)).toBe('Beginner');
  expect(getLevel(4999)).toBe('Beginner');
  expect(getLevel(5000)).toBe('Intermediate');
  expect(getLevel(14999)).toBe('Intermediate');
  expect(getLevel(15000)).toBe('Advanced');
  expect(getLevel(49999)).toBe('Advanced');
  expect(getLevel(50000)).toBe('Expert');
  expect(getLevel(149999)).toBe('Expert');
  expect(getLevel(150000)).toBe('Master');
});

// Integrity calculation (content.js formula)
test('integrity is typed / (typed + pasted) percentage', () => {
  expect(calcIntegrity(400, 0)).toBe(100);    // all typed
  expect(calcIntegrity(400, 400)).toBe(50);    // half and half
  expect(calcIntegrity(0, 500)).toBe(0);        // all pasted
  expect(calcIntegrity(0, 0)).toBe(100);        // empty doc
});

// Integrity with bot flag
test('integrity is 0 when bot is detected', () => {
  // bio.isBot = true should force integrity to 0
});
```

---

### Priority 6: Ledger System (writer.js)

**Risk: MEDIUM** — The writing ledger is the append-only operation timeline that enables teacher replay. Corrupted ledger data would undermine the most forensic verification feature.

**Functions to test:**

| Function | Lines | Why it matters |
|---|---|---|
| `recordOp(op)` | 48-55 | Triggers checkpoint every 10 ops; must not skip or double-checkpoint |
| `takeCheckpoint(hasPaste)` | 29-45 | Hash chain: prevHash \| content \| timestamp; genesis case must work |
| `sha256hex(str)` | 24-27 | Must match expected SHA-256 output; deterministic |
| `renderReplay(checkpointIdx)` | 504-555 | Edge cases: empty ledger, index past end, blur detection in range |

**Example test cases:**

```javascript
test('checkpoint is taken every 10 operations', async () => {
  for (let i = 0; i < 10; i++) {
    await recordOp({ op: 'key', char: 'a' });
  }
  expect(ledger.checkpoints.length).toBe(1); // initial + 1 from 10th op
});

test('checkpoint hash chains from genesis', async () => {
  await takeCheckpoint(false);
  expect(ledger.checkpoints[0].hash).toBeTruthy();
  // Second checkpoint references first
  await takeCheckpoint(false);
  expect(ledger.checkpoints[1].hash).not.toBe(ledger.checkpoints[0].hash);
});

test('paste flag propagates to checkpoint', async () => {
  await recordOp({ op: 'paste', text: 'hello', len: 5 });
  // Force checkpoint
  for (let i = 0; i < 9; i++) {
    await recordOp({ op: 'key', char: 'a' });
  }
  // The checkpoint should have hasPaste = true
  const lastCP = ledger.checkpoints[ledger.checkpoints.length - 1];
  expect(lastCP.hasPaste).toBe(true);
});
```

---

## Code Architecture Issues That Affect Testability

### 1. Duplicated logic across files

`analyzeRhythm()` and `updatePassportLevel()` are copy-pasted between `writer.js` and `content.js`. If one is updated and the other isn't, behavior diverges. Extract these into a shared module (e.g., `biometrics.js` and `levels.js`) that both files import.

### 2. Tight DOM coupling in writer.js

Most functions in `writer.js` read from and write to DOM elements inline (`document.getElementById('editor')`). This makes unit testing impossible without a full jsdom setup. Consider separating:
- **Pure logic** (rhythm analysis, integrity calculation, level computation) into standalone functions that take inputs and return outputs
- **DOM side effects** (updating UI elements) into separate wiring code

### 3. Chrome API dependency everywhere

Every file depends on `chrome.storage.local`, `chrome.runtime`, or `chrome.tabs`. Tests need a mock Chrome API. A thin wrapper module (e.g., `storage.js`) would let you swap the real Chrome API for a test double.

### 4. auth-utils.js is an IIFE with closure state

`AuthUtils` is an IIFE that captures `auth`, `db`, `currentUser`, and `lastSyncTime` in closure scope. The `mergePassports()` function is internal and not exposed. To test it, either:
- Export it (add `mergePassports` to the returned public API), or
- Extract it into its own module

### 5. No module system

The codebase uses script tags and global objects (`CryptoUtils`, `PassportUtils`, `AuthUtils`). The existing CommonJS export guards on `crypto-utils.js` and `passport-utils.js` are a good start. Extend this pattern to all files so they can be imported by a test runner.

---

## Suggested Implementation Order

### Phase 1: Foundation (test infra + pure logic)

1. Add `package.json` with vitest
2. Create `tests/` directory
3. Add CommonJS export guards to `auth-utils.js` (expose `mergePassports`)
4. Extract `analyzeRhythm()` into a shared `biometrics.js` module
5. Write tests for:
   - `PassportUtils.calculateSuspicionScore()` — all 6 signals + edge cases
   - `PassportUtils.getRiskLevel()` — boundary conditions
   - `PassportUtils.calculateSessionAverages()` — variance math
   - `PassportUtils.calculateDailyAverages()` — coefficient of variation
   - `PassportUtils.getNightActivityPercent()` — slice boundaries
   - `PassportUtils.cleanOldStats()` — retention window
   - `analyzeRhythm()` — bot detection thresholds
   - `updatePassportLevel()` — level thresholds
   - Integrity calculation — typed/pasted ratios

### Phase 2: Crypto (mock chrome.storage, use Node webcrypto)

6. Mock `chrome.storage.local` for tests
7. Write tests for:
   - `CryptoUtils.signBadge()` + `verifyBadge()` round-trip
   - Tampered data rejection
   - Wrong key rejection
   - `hashBadge()` determinism
   - Key fingerprint format

### Phase 3: Merge logic + integration

8. Expose and test `mergePassports()`
   - Max keystrokes, earliest firstUsed, latest lastUsed
   - DailyStats max-per-day merge
   - HourlyPattern sum merge
   - SessionHistory deduplication
9. Integration tests for badge payload construction
   - Badge includes all required fields
   - Signature verifies against embedded public key
   - Badge chain references previous hash

### Phase 4: DOM-dependent tests (jsdom)

10. Writer ledger checkpoint chain
11. Badge export flow (with mocked DOM + clipboard)
12. Content script UI state management

---

## Summary Table

| Module | Lines | Current Coverage | Priority | Estimated Tests Needed |
|---|---|---|---|---|
| passport-utils.js | 229 | 0% | **P1 — Critical** | ~25 tests |
| crypto-utils.js | 211 | 0% | **P2 — Critical** | ~15 tests |
| analyzeRhythm() (shared) | ~30 | 0% | **P3 — Critical** | ~12 tests |
| auth-utils.js (mergePassports) | 50 | 0% | **P4 — Medium** | ~10 tests |
| writer.js (badge/ledger) | 644 | 0% | **P5 — Medium** | ~15 tests |
| content.js (stats/badges) | 404 | 0% | **P6 — Medium** | ~10 tests |
| background.js | 30 | 0% | **P7 — Low** | ~3 tests |
| **Total** | **~3,000** | **0%** | | **~90 tests** |

The highest-value investment is testing `passport-utils.js` and the `analyzeRhythm()` biometric logic. These are pure functions with well-defined inputs and outputs, no DOM dependency, and they form the core of the bot detection system. Getting ~40 tests across these two areas would cover the most critical business logic with the least setup effort.
