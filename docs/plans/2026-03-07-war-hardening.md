# WAR Scorer Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make WAR flags penalize scores, add hard bot floors, add dwell uniformity as 10th signal. Apply to both biometrics.js and jitter-box.js.

**Architecture:** Three-layer hybrid — hard floors (WAR=0 for obvious bots), soft penalties (deduct per flag), new weighted signal (dwell_uniformity). All changes are in the scorer functions, no new files except tests.

**Tech Stack:** Vanilla JS (no build step), Node for unit tests

---

### Task 1: Add unit test file for WAR scorer

**Files:**
- Create: `tests/war-scorer.test.js`

**Step 1: Create test file with require and helper to build mock sessions/profiles**

```js
const bio = require('../extension/src/biometrics.js');

// Helper: build a minimal human-like session
function humanSession() {
  const s = bio.createSession();
  // Simulate 50 human keystrokes with realistic timing
  const flights = [];
  const dwells = [];
  for (let i = 0; i < 50; i++) {
    flights.push(150 + Math.random() * 200); // 150-350ms
    dwells.push(60 + Math.random() * 80);    // 60-140ms
  }
  s.flightTimes = flights;
  s.dwellTimes = dwells;
  s.humanChars = 50;
  s.alienChars = 0;
  s.totalKeystrokes = 50;
  s.backspaceCount = 3;
  s.pauseCount = 2;
  return s;
}

// Helper: build a human-like profile
function humanProfile() {
  return {
    mean_inter_key: 220,
    std_inter_key: 45,
    mean_dwell: 85,
    std_dwell: 18,
    edit_ratio: 0.06,
    pause_freq: 1.2,
    per_key_dwell: { e: 70, t: 82, a: 90, o: 75, i: 68, n: 88 },
    bigram_signatures: {
      th: { mean: 140, std: 30, n: 8 },
      he: { mean: 160, std: 25, n: 7 },
      in: { mean: 180, std: 35, n: 6 },
      er: { mean: 155, std: 28, n: 5 },
    },
  };
}

// Helper: build a bot session (zero delay, no dwell)
function botSession() {
  const s = bio.createSession();
  s.flightTimes = Array(50).fill(5);  // 5ms fixed
  s.dwellTimes = Array(50).fill(1);   // 1ms fixed
  s.humanChars = 50;
  s.alienChars = 0;
  s.totalKeystrokes = 50;
  s.backspaceCount = 0;
  s.pauseCount = 0;
  return s;
}

function botProfile() {
  return {
    mean_inter_key: 5,
    std_inter_key: 0.5,
    mean_dwell: 1,
    std_dwell: 0.2,
    edit_ratio: 0,
    pause_freq: 0,
    per_key_dwell: { e: 1, t: 1, a: 1, o: 1, i: 1, n: 1 },
    bigram_signatures: {
      th: { mean: 5, std: 0.1, n: 8 },
      he: { mean: 5, std: 0.1, n: 7 },
      in: { mean: 5, std: 0.1, n: 6 },
      er: { mean: 5, std: 0.1, n: 5 },
    },
  };
}

// Sophisticated bot: human-like IKI but uniform dwell
function sophisticatedBotProfile() {
  return {
    mean_inter_key: 230,
    std_inter_key: 40,
    mean_dwell: 80,
    std_dwell: 6,   // suspiciously low
    edit_ratio: 0.02,
    pause_freq: 0.3,
    per_key_dwell: { e: 80, t: 80, a: 80, o: 80, i: 80, n: 80 }, // uniform
    bigram_signatures: {
      th: { mean: 200, std: 5, n: 8 },
      he: { mean: 200, std: 5, n: 7 },
      in: { mean: 200, std: 5, n: 6 },
      er: { mean: 200, std: 5, n: 5 },
    },
  };
}

// --- TESTS ---

function assert(condition, msg) {
  if (!condition) { console.error('FAIL:', msg); process.exitCode = 1; return; }
  console.log('PASS:', msg);
}

// Test 1: Human scores above 0.50
const hResult = bio.scoreWAR(humanSession(), humanProfile());
assert(hResult.war >= 0.50, `Human WAR=${hResult.war} should be >= 0.50`);
assert(hResult.tier !== 'Suspicious', `Human tier="${hResult.tier}" should not be Suspicious`);

// Test 2: Obvious bot hits hard floor → WAR = 0
const bResult = bio.scoreWAR(botSession(), botProfile());
assert(bResult.war === 0, `Bot WAR=${bResult.war} should be 0 (hard floor)`);
assert(bResult.tier === 'Suspicious', `Bot tier="${bResult.tier}" should be Suspicious`);
assert(bResult.flags.length > 0, `Bot should have flags, got ${bResult.flags}`);

// Test 3: Sophisticated bot gets penalized below human range
const sSession = humanSession(); // decent session data
const sResult = bio.scoreWAR(sSession, sophisticatedBotProfile());
assert(sResult.war < 0.50, `Sophisticated bot WAR=${sResult.war} should be < 0.50`);
assert(sResult.flags.length >= 2, `Sophisticated bot should have 2+ flags, got ${sResult.flags}`);

// Test 4: dwell_uniformity component exists
assert(hResult.components.dwell_uniformity != null, 'Human should have dwell_uniformity component');
assert(bResult.components.dwell_uniformity != null || bResult.war === 0, 'Bot should have dwell_uniformity or be hard-floored');

// Test 5: Hard floor on mean_dwell < 27
const dwellBot = humanSession();
const dwellProfile = humanProfile();
dwellProfile.mean_dwell = 15;
const dwResult = bio.scoreWAR(dwellBot, dwellProfile);
assert(dwResult.war === 0, `Dwell floor bot WAR=${dwResult.war} should be 0`);

// Test 6: Hard floor on std_inter_key < 9
const varBot = humanSession();
const varProfile = humanProfile();
varProfile.std_inter_key = 3;
const vrResult = bio.scoreWAR(varBot, varProfile);
assert(vrResult.war === 0, `Variance floor bot WAR=${vrResult.war} should be 0`);

// Test 7: Hard floor on mean_inter_key < 54
const ikiBot = humanSession();
const ikiProfile = humanProfile();
ikiProfile.mean_inter_key = 30;
const ikResult = bio.scoreWAR(ikiBot, ikiProfile);
assert(ikResult.war === 0, `IKI floor bot WAR=${ikResult.war} should be 0`);

// Test 8: Weights sum to 1.0
const wSum = Object.values(bio.WAR_WEIGHTS).reduce((a, b) => a + b, 0);
assert(Math.abs(wSum - 1.0) < 0.001, `Weights sum=${wSum} should be 1.0`);

console.log('\nDone.');
```

**Step 2: Run test to verify it fails (scoreWAR doesn't have hard floors yet)**

Run: `cd /tmp/jitter-clone && node tests/war-scorer.test.js`
Expected: Tests 2, 5, 6, 7 FAIL (bots get nonzero scores), Test 8 FAIL (weights don't include dwell_uniformity yet)

**Step 3: Commit test file**

```bash
git add tests/war-scorer.test.js
git commit -m "test: add WAR scorer unit tests for hardening"
```

---

### Task 2: Harden biometrics.js — add hard floors, soft penalties, dwell_uniformity

**Files:**
- Modify: `extension/src/biometrics.js:351-528` (WAR_RAMPS, WAR_WEIGHTS, scoreWAR)

**Step 1: Update WAR_RAMPS — add dwell_uniformity ramp**

At line 361, add before the closing brace:
```js
  dwell_uniformity: [0.09, 0.25],
```

**Step 2: Update WAR_WEIGHTS — add dwell_uniformity, rebalance**

Replace WAR_WEIGHTS (line 362-365) with:
```js
const WAR_WEIGHTS = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.05,
  dwell_uniformity: 0.04, purity: 0.03,
};
```

**Step 3: Add hard floors + soft penalties + dwell_uniformity to scoreWAR()**

Replace the scoreWAR function (lines 421-528) with the hardened version:

```js
function scoreWAR(session, profile) {
  if (!profile || session.flightTimes.length < 10) {
    return { war: 0, raw_war: 0, tier: 'Suspicious', components: {}, flags: [] };
  }

  const flags = [];

  // === LAYER 1: Hard floors — instant WAR = 0 ===
  if (profile.mean_dwell != null && profile.mean_dwell < 27) {
    flags.push('dwell_floor');
  }
  if (profile.std_inter_key != null && profile.std_inter_key < 9) {
    flags.push('variance_floor');
  }
  if (profile.mean_inter_key != null && profile.mean_inter_key < 54) {
    flags.push('iki_floor');
  }

  if (flags.length > 0 && (flags.includes('dwell_floor') || flags.includes('variance_floor') || flags.includes('iki_floor'))) {
    // Check if ANY hard floor triggered
    const hasHardFloor = (profile.mean_dwell != null && profile.mean_dwell < 27) ||
      (profile.std_inter_key != null && profile.std_inter_key < 9) ||
      (profile.mean_inter_key != null && profile.mean_inter_key < 54);
    if (hasHardFloor) {
      return { war: 0, raw_war: 0, tier: 'Suspicious', components: {}, flags };
    }
  }

  // === LAYER 3: Weighted signals (including new dwell_uniformity) ===
  const components = {};

  // 1. Bigram rhythm
  const sigs = profile.bigram_signatures || {};
  const bigramKeys = Object.keys(sigs);
  if (bigramKeys.length >= 4) {
    const bigramMeans = bigramKeys.map(k => sigs[k].mean);
    const m = calcMean(bigramMeans);
    const cv = m > 0 ? calcStd(bigramMeans) / m : 0;
    components.bigram_rhythm = rampScore(cv, WAR_RAMPS.bigram_rhythm[0], WAR_RAMPS.bigram_rhythm[1]);
    if (cv < 0.08) flags.push('bigram_uniform');
  } else {
    components.bigram_rhythm = 0.5;
  }

  // 2. Per-key uniqueness
  const pkValues = Object.values(profile.per_key_dwell || {});
  if (pkValues.length >= 3) {
    const m = calcMean(pkValues);
    const cv = m > 0 ? calcStd(pkValues) / m : 0;
    components.per_key = rampScore(cv, WAR_RAMPS.per_key[0], WAR_RAMPS.per_key[1]);
    if (cv < 0.09) flags.push('per_key_uniformity');
  } else {
    components.per_key = 0.5;
  }

  // 3. Cross-signal correlation
  components.cross_signal = scoreCrossSignal(session);

  // 4. Distribution shape (K-S test)
  if (session.flightTimes.length >= 10) {
    const ks = ksStatistic(session.flightTimes);
    components.distribution = rampScore(ks, WAR_RAMPS.ks_shape[0], WAR_RAMPS.ks_shape[1]);
    if (ks > 0.25) flags.push('non_lognormal');
  } else {
    components.distribution = 0.5;
  }

  // 5. Inter-key variance
  if (profile.std_inter_key != null) {
    components.inter_key_var = rampScore(profile.std_inter_key, WAR_RAMPS.inter_key_var[0], WAR_RAMPS.inter_key_var[1]);
  } else {
    components.inter_key_var = 0.5;
  }

  // 6. Dwell std
  if (profile.std_dwell != null) {
    components.dwell_std = rampScore(profile.std_dwell, WAR_RAMPS.dwell_std[0], WAR_RAMPS.dwell_std[1]);
    if (profile.std_dwell < 8) flags.push('dwell_std_hard');
  } else {
    components.dwell_std = 0.5;
  }

  // 7. Mean dwell
  if (profile.mean_dwell != null) {
    components.mean_dwell = rampScore(profile.mean_dwell, WAR_RAMPS.mean_dwell[0], WAR_RAMPS.mean_dwell[1]);
  } else {
    components.mean_dwell = 0.5;
  }

  // 8. Editing behavior
  const editSub = profile.edit_ratio != null
    ? rampScore(profile.edit_ratio, WAR_RAMPS.edit_ratio[0], WAR_RAMPS.edit_ratio[1]) : 0.5;
  const pauseSub = profile.pause_freq != null
    ? rampScore(profile.pause_freq, WAR_RAMPS.pause_freq[0], WAR_RAMPS.pause_freq[1]) : 0.5;
  components.editing = (editSub + pauseSub) / 2;
  if (profile.edit_ratio != null && profile.pause_freq != null &&
      profile.edit_ratio < 0.03 && profile.pause_freq < 0.4) {
    flags.push('no_editing_behavior');
  }

  // 9. Dwell uniformity (NEW — 10th signal)
  if (pkValues.length >= 3) {
    const m = calcMean(pkValues);
    const cv = m > 0 ? calcStd(pkValues) / m : 0;
    components.dwell_uniformity = rampScore(cv, WAR_RAMPS.dwell_uniformity[0], WAR_RAMPS.dwell_uniformity[1]);
  } else {
    components.dwell_uniformity = 0.5;
  }

  // 10. Purity
  const total = session.humanChars + session.alienChars;
  if (total >= 20) {
    components.purity = rampScore(session.humanChars / total, WAR_RAMPS.purity[0], WAR_RAMPS.purity[1]);
  } else {
    components.purity = 0.5;
  }

  // Weighted sum
  let raw_war = 0;
  for (const [key, weight] of Object.entries(WAR_WEIGHTS)) {
    raw_war += weight * (components[key] != null ? components[key] : 0.5);
  }
  raw_war = round2(raw_war);

  // === LAYER 2: Soft penalties ===
  const PENALTIES = {
    bigram_uniform: 0.08,
    per_key_uniformity: 0.08,
    dwell_std_hard: 0.06,
    no_editing_behavior: 0.05,
    non_lognormal: 0.05,
  };

  let penalty = 0;
  for (const flag of flags) {
    if (PENALTIES[flag]) penalty += PENALTIES[flag];
  }

  let war = round2(Math.max(0, raw_war - penalty));
  const tier = WAR_TIERS.find(([min]) => war >= min)[1];

  return { war, raw_war, tier, components, flags, timeCap: 1.0 };
}
```

**Step 4: Run tests**

Run: `cd /tmp/jitter-clone && node tests/war-scorer.test.js`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add extension/src/biometrics.js
git commit -m "feat: harden WAR scorer — hard floors, soft penalties, dwell uniformity"
```

---

### Task 3: Mirror hardening into SDK jitter-box.js

**Files:**
- Modify: `sdk/src/core/jitter-box.js:41-276` (RAMPS, WEIGHTS, scoreProfile)

**Step 1: Update RAMPS — add dwell_uniformity**

At line 51 (before closing brace), add:
```js
  dwell_uniformity: [0.09, 0.25],
```

**Step 2: Update WEIGHTS — rebalance with dwell_uniformity**

Replace WEIGHTS (lines 52-55) with:
```js
var WEIGHTS = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.05,
  dwell_uniformity: 0.04, purity: 0.03,
}
```

**Step 3: Harden scoreProfile() — add hard floors, soft penalties, dwell_uniformity**

Replace scoreProfile function (lines 171-276) with the hardened version matching biometrics.js logic but using `var` syntax and the SDK's `distribution_shape` key name:

```js
function scoreProfile(profile, captureData) {
  if (!profile) return { war: 1.0, classification: 'verified', components: {}, flags: [] }

  var flags = []

  // === LAYER 1: Hard floors — instant WAR = 0 ===
  if (profile.mean_dwell != null && profile.mean_dwell < 27) flags.push('dwell_floor')
  if (profile.std_inter_key != null && profile.std_inter_key < 9) flags.push('variance_floor')
  if (profile.mean_inter_key != null && profile.mean_inter_key < 54) flags.push('iki_floor')

  var hasHardFloor = (profile.mean_dwell != null && profile.mean_dwell < 27) ||
    (profile.std_inter_key != null && profile.std_inter_key < 9) ||
    (profile.mean_inter_key != null && profile.mean_inter_key < 54)

  if (hasHardFloor) {
    return { war: 0, classification: 'bot', components: {}, flags: flags }
  }

  // === LAYER 3: Weighted signals ===
  var components = {}

  // 1. Bigram rhythm
  var sigs = profile.bigram_signatures || {}
  var bigramKeys = Object.keys(sigs)
  if (bigramKeys.length >= 4) {
    var bigramMeans = []
    for (var i = 0; i < bigramKeys.length; i++) bigramMeans.push(sigs[bigramKeys[i]].mean)
    var bigramM = mean(bigramMeans)
    var bigramCv = bigramM > 0 ? std(bigramMeans) / bigramM : 0
    components.bigram_rhythm = rampScore(bigramCv, RAMPS.bigram_rhythm[0], RAMPS.bigram_rhythm[1])
    if (bigramCv < 0.08) flags.push('bigram_uniform')
  } else {
    components.bigram_rhythm = 0.5
  }

  // 2. Per-key uniqueness
  var perKeyValues = []
  var pkd = profile.per_key_dwell || {}
  var pkKeys = Object.keys(pkd)
  for (var j = 0; j < pkKeys.length; j++) perKeyValues.push(pkd[pkKeys[j]])
  if (perKeyValues.length >= 3) {
    var pkMean = mean(perKeyValues)
    var pkCv = pkMean > 0 ? std(perKeyValues) / pkMean : 0
    components.per_key = rampScore(pkCv, RAMPS.per_key[0], RAMPS.per_key[1])
    if (pkCv < 0.09) flags.push('per_key_uniformity')
  } else {
    components.per_key = 0.5
  }

  // 3. Cross-signal
  components.cross_signal = scoreCrossSignal(captureData || {})

  // 4. Distribution shape
  if (captureData && captureData.flightTimes && captureData.flightTimes.length >= 10) {
    var ks = ksStatistic(captureData.flightTimes)
    components.distribution_shape = rampScore(ks, RAMPS.ks_shape[0], RAMPS.ks_shape[1])
    if (ks > 0.25) flags.push('non_lognormal')
  } else {
    components.distribution_shape = 0.5
  }

  // 5. Inter-key variance
  if (profile.std_inter_key != null) {
    components.inter_key_var = rampScore(profile.std_inter_key, RAMPS.inter_key_var[0], RAMPS.inter_key_var[1])
  } else {
    components.inter_key_var = 0.5
  }

  // 6. Dwell std
  if (profile.std_dwell != null) {
    components.dwell_std = rampScore(profile.std_dwell, RAMPS.dwell_std[0], RAMPS.dwell_std[1])
    if (profile.std_dwell < 8) flags.push('dwell_std_hard')
  } else {
    components.dwell_std = 0.5
  }

  // 7. Mean dwell
  if (profile.mean_dwell != null) {
    components.mean_dwell = rampScore(profile.mean_dwell, RAMPS.mean_dwell[0], RAMPS.mean_dwell[1])
  } else {
    components.mean_dwell = 0.5
  }

  // 8. Editing behavior
  var editSub = profile.edit_ratio != null
    ? rampScore(profile.edit_ratio, RAMPS.edit_ratio[0], RAMPS.edit_ratio[1]) : 0.5
  var pauseSub = profile.pause_freq != null
    ? rampScore(profile.pause_freq, RAMPS.pause_freq[0], RAMPS.pause_freq[1]) : 0.5
  components.editing = (editSub + pauseSub) / 2
  if (profile.edit_ratio != null && profile.pause_freq != null &&
      profile.edit_ratio < 0.03 && profile.pause_freq < 0.4) {
    flags.push('no_editing_behavior')
  }

  // 9. Dwell uniformity (NEW)
  if (perKeyValues.length >= 3) {
    var duMean = mean(perKeyValues)
    var duCv = duMean > 0 ? std(perKeyValues) / duMean : 0
    components.dwell_uniformity = rampScore(duCv, RAMPS.dwell_uniformity[0], RAMPS.dwell_uniformity[1])
  } else {
    components.dwell_uniformity = 0.5
  }

  // 10. Purity
  var total = (captureData && (captureData.humanChars + captureData.alienChars)) || 0
  if (total >= 20 && captureData) {
    components.purity = rampScore(captureData.humanChars / total, RAMPS.purity[0], RAMPS.purity[1])
  } else {
    components.purity = 0.5
  }

  // Weighted sum
  var war = 0
  var weightKeys = Object.keys(WEIGHTS)
  for (var w = 0; w < weightKeys.length; w++) {
    var wk = weightKeys[w]
    var comp = wk === 'distribution' ? 'distribution_shape' : wk
    war += WEIGHTS[wk] * (components[comp] != null ? components[comp] : 0.5)
  }
  var raw_war = round2(war)

  // === LAYER 2: Soft penalties ===
  var PENALTIES = {
    bigram_uniform: 0.08,
    per_key_uniformity: 0.08,
    dwell_std_hard: 0.06,
    no_editing_behavior: 0.05,
    non_lognormal: 0.05,
  }

  var penalty = 0
  for (var p = 0; p < flags.length; p++) {
    if (PENALTIES[flags[p]]) penalty += PENALTIES[flags[p]]
  }

  war = round2(Math.max(0, raw_war - penalty))

  var classification
  if (war >= 0.80) classification = 'verified'
  else if (war >= 0.50) classification = 'suspicious'
  else classification = 'bot'

  return { war: war, raw_war: raw_war, classification: classification, components: components, flags: flags }
}
```

**Step 4: Run tests**

Run: `cd /tmp/jitter-clone && node tests/war-scorer.test.js`
Expected: All 8 tests still PASS (tests use biometrics.js)

**Step 5: Commit**

```bash
git add sdk/src/core/jitter-box.js
git commit -m "feat: mirror WAR hardening into SDK jitter-box.js"
```

---

### Task 4: Update Desktop extension copy + push

**Step 1: Copy updated extension to Desktop**

```bash
rm -rf ~/Desktop/jitter-extension
cp -r /tmp/jitter-clone/extension ~/Desktop/jitter-extension
```

**Step 2: Push all commits**

```bash
cd /tmp/jitter-clone && git push origin main
```
