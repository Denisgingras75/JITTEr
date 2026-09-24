/**
 * war-score.js — JITTEr WAR scoring engine (Weighted Authenticity Rating)
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 * Patents #63/994,858 + #63/997,498.
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR THE SCORING MATH.
 *
 * It lives under extension/src/ because a Chrome extension can only load files
 * from inside its own folder and has no build step. Every other host reads the
 * very same file from here, so there is exactly one copy of the formula:
 *
 *   extension/src/biometrics.js   scoreWAR()/applyTimeCap() delegate to JitterWAR
 *                                 (manifest.json and writer.html list this file
 *                                 before biometrics.js)
 *   sdk/build.js                  concatenates this file into sdk/dist/jitter.min.js
 *                                 ahead of the SDK core
 *   sdk/src/core/jitter-box.js    imports it when loaded as a module (Node, tests)
 *   lab/jitter-box.js             require()s it, so the lab scores with shipping math
 *
 * Plain script on purpose: no top-level import/export. It runs as a classic
 * <script>, as a CommonJS require(), and as a fragment of a concatenated
 * bundle, and it exposes exactly ONE name: JitterWAR.
 *
 * Capture code (keydown/keyup/paste listeners) is NOT here. Each host keeps its
 * own capture and hands this engine a `profile` (per-session statistics) and a
 * `session` (timing arrays + character counts). Nothing here stores anything
 * and nothing here ever sees typed text (Hard Rule #1: timing metadata only).
 *
 * Formula (JITTER-PLAN.md "WAR Formula"; 0-1 scale, x10 for display):
 *
 *   Layer 1  hard floors      mean dwell < 27 ms, flight std < 9 ms or mean
 *                             flight < 54 ms is a machine: WAR 0, 'bot'.
 *   Layer 2  nine weighted signals (weights sum to 1.0)        -> raw_war
 *   Layer 3  soft penalties for machine tells (uniform bigrams, uniform
 *            per-key dwell, flat dwell, no editing, non-log-normal)  -> war
 *
 *   Paste is transparent, not punished (Hard Rule #5). Pasted characters only
 *   enter the `purity` signal (weight 0.05), weighted by the length of each
 *   paste event: < 50 chars 0.1x (a URL, a name), 50-300 chars 0.3x (a quote),
 *   > 300 chars 1.0x (a paragraph). Three or more pastes set the
 *   `high_paste_volume` flag. There is no paste penalty and no multiplier, and
 *   the raw counts are always reported in result.paste.
 *
 *   Time confidence cap (the economic thesis in code): applyTimeCap() clamps
 *   `war` (never `raw_war`) by account age: < 1 day 0.35, 1-7 days 0.50,
 *   7-30 0.65, 30-90 0.80, 90-180 0.92, 180+ 1.00.
 *
 * Inputs:
 *   profile  { mean_inter_key, std_inter_key, mean_dwell, std_dwell,
 *              edit_ratio, pause_freq,
 *              per_key_dwell: { key: meanDwellMs },
 *              bigram_signatures: { bigram: { mean, std, n } } }
 *   session  { flightTimes: [ms], dwellTimes: [ms], fatigueWindows: [ms],
 *              humanChars, alienChars,
 *              pasteLengths: [chars per paste event],   preferred
 *              pasteCount, pastedChars }                 legacy totals
 *   Any field may be missing: a missing signal scores 0.5 (neutral). NaN never
 *   comes out. Fewer than 10 flight times gives war null / 'insufficient_data'.
 *
 * Output of scoreProfile():
 *   { war, raw_war, tier, classification, components, flags, timeCap,
 *     paste: { count, chars, weightedChars, alienChars } }
 */

var JitterWAR = (function () {
  'use strict'

  var ENGINE_VERSION = '3.1.0'

  // ── Tables ───────────────────────────────────────────────────────────

  // Signal weights (JITTER-PLAN.md). They sum to 1.0.
  var WAR_WEIGHTS = {
    bigram_rhythm: 0.18,   // CV of bigram means: finger patterns
    per_key:       0.15,   // CV of per-key dwells: the fingerprint
    cross_signal:  0.15,   // flow coupling + pause warm-up + fatigue
    distribution:  0.12,   // K-S test: human flights fit a log-normal
    inter_key_var: 0.10,   // std of flight times (bots are flat)
    dwell_std:     0.10,   // std of key hold duration
    mean_dwell:    0.08,   // average key hold time (bots < 27 ms)
    editing:       0.07,   // edit ratio + pause frequency (bots never edit)
    purity:        0.05,   // typed vs weighted paste
  }

  // Ramps [bot_floor, human_zone]: a signal scores 0 at the floor and 1 in the
  // human zone. ks_shape is inverted (a lower K-S distance is a better fit).
  var WAR_RAMPS = {
    bigram_rhythm: [0.08, 0.20],
    per_key:       [0.09, 0.25],
    inter_key_var: [9, 45],
    dwell_std:     [8, 20],
    mean_dwell:    [27, 80],
    edit_ratio:    [0.03, 0.08],
    pause_freq:    [0.4, 1.5],
    purity:        [0, 1],
    ks_shape:      [0.25, 0.08],
  }

  // Hard floors: a session below any of these is a machine. WAR = 0.
  var HARD_FLOORS = {
    mean_dwell:     27,   // ms
    std_inter_key:  9,    // ms
    mean_inter_key: 54,   // ms
  }

  // Soft penalties subtracted from raw_war. Deliberately none for paste.
  var PENALTIES = {
    bigram_uniform:      0.08,
    per_key_uniformity:  0.08,
    dwell_std_hard:      0.06,
    no_editing_behavior: 0.05,
    non_lognormal:       0.05,
  }

  // Paste weighting (JITTER-PLAN.md "Paste weighting"): the characters of one
  // paste event count against purity at this fraction of a typed character.
  var PASTE_WEIGHTS = [
    { below: 50,       weight: 0.1 },   // URL, name: noise
    { below: 301,      weight: 0.3 },   // 50-300: a quote, mild impact
    { below: Infinity, weight: 1.0 },   // > 300: a paragraph, shown prominently
  ]
  var HIGH_PASTE_VOLUME_COUNT = 3

  var WAR_TIERS = [
    [0.80, 'Hall of Fame'],
    [0.60, 'All-Star'],
    [0.40, 'Solid'],
    [0.20, 'Rookie'],
    [0,    'Suspicious'],
  ]

  var CLASSIFICATION = { verified: 0.80, suspicious: 0.50 }   // else 'bot'

  // Time confidence cap: [account age in days (exclusive upper bound), max war]
  var TIME_CAPS = [
    [1,   0.35],
    [7,   0.50],
    [30,  0.65],
    [90,  0.80],
    [180, 0.92],
  ]
  var TIME_CAP_MAX = 1.0

  var MIN_FLIGHTS = 10            // fewer flight times: insufficient_data
  var MIN_CHARS_FOR_PURITY = 20   // fewer typed+pasted chars: purity is neutral
  var PAUSE_THRESHOLD_MS = 2000
  var CROSS_WINDOW = 10

  // ── Numeric helpers (every one of them is NaN-safe) ──────────────────

  function isNum(v) { return typeof v === 'number' && isFinite(v) }
  function finiteOrNull(v) { return isNum(v) ? v : null }

  function finiteNumbers(arr) {
    var out = []
    if (!arr || typeof arr.length !== 'number') return out
    for (var i = 0; i < arr.length; i++) if (isNum(arr[i])) out.push(arr[i])
    return out
  }

  function mean(arr) {
    if (!arr || arr.length === 0) return 0
    var sum = 0
    for (var i = 0; i < arr.length; i++) sum += arr[i]
    return sum / arr.length
  }

  // Population standard deviation (what every host has always used).
  function std(arr) {
    if (!arr || arr.length < 2) return 0
    var m = mean(arr)
    var variance = 0
    for (var i = 0; i < arr.length; i++) variance += (arr[i] - m) * (arr[i] - m)
    return Math.sqrt(variance / arr.length)
  }

  function cv(arr) {
    var m = mean(arr)
    return m > 0 ? std(arr) / m : 0
  }

  function round2(n) { return Math.round(n * 100) / 100 }
  function round3(n) { return Math.round(n * 1000) / 1000 }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }

  function rampScore(raw, floor, ceiling) {
    if (!isNum(raw)) return 0.5
    if (floor < ceiling) return clamp01((raw - floor) / (ceiling - floor))
    return clamp01((floor - raw) / (floor - ceiling))   // inverted ramp
  }
  function ramp(raw, pair) { return rampScore(raw, pair[0], pair[1]) }

  // ── Statistics ───────────────────────────────────────────────────────

  // Standard normal CDF (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8)
  function normalCDF(z) {
    if (!isNum(z)) return 0.5
    if (z < -6) return 0
    if (z > 6) return 1
    var sign = z < 0 ? -1 : 1
    z = Math.abs(z)
    var t = 1 / (1 + 0.2316419 * z)
    var d = 0.3989422804014327 * Math.exp(-z * z / 2)
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))))
    return sign === 1 ? 1 - p : p
  }

  // Kolmogorov-Smirnov distance between the sample and a log-normal fitted to
  // it. Two-sided: D = max(D+, D-) with D+ = max((j+1)/n - F(x_j)) and
  // D- = max(F(x_j) - j/n). Returns 0.5 (neutral) with fewer than 10 positive
  // values and 1.0 when every value is identical.
  function ksStatistic(values) {
    var positive = []
    var clean = finiteNumbers(values)
    for (var i = 0; i < clean.length; i++) if (clean[i] > 0) positive.push(clean[i])
    if (positive.length < MIN_FLIGHTS) return 0.5

    var logs = []
    for (var k = 0; k < positive.length; k++) logs.push(Math.log(positive[k]))
    var mu = mean(logs)
    var sigma = std(logs)
    // Identical values: no spread to fit (float rounding can leave sigma ~1e-16)
    if (sigma <= 1e-12 * Math.max(1, Math.abs(mu))) return 1.0

    logs.sort(function (a, b) { return a - b })
    var n = logs.length
    var dPlus = 0
    var dMinus = 0
    for (var j = 0; j < n; j++) {
      var F = normalCDF((logs[j] - mu) / sigma)
      var up = (j + 1) / n - F
      var down = F - j / n
      if (up > dPlus) dPlus = up
      if (down > dMinus) dMinus = down
    }
    return round3(Math.max(dPlus, dMinus))
  }

  // Pearson correlation coefficient of two equal-length series
  function pearsonR(a, b) {
    if (!a || !b || a.length < 3 || a.length !== b.length) return 0
    var ma = mean(a)
    var mb = mean(b)
    var num = 0, da = 0, db = 0
    for (var i = 0; i < a.length; i++) {
      var ai = a[i] - ma
      var bi = b[i] - mb
      num += ai * bi
      da += ai * ai
      db += bi * bi
    }
    var denom = Math.sqrt(da * db)
    return denom > 0 && isFinite(denom) ? num / denom : 0
  }

  // ── Paste weighting ──────────────────────────────────────────────────

  function pasteWeight(length) {
    if (!isNum(length) || length <= 0) return 0
    for (var i = 0; i < PASTE_WEIGHTS.length; i++) {
      if (length < PASTE_WEIGHTS[i].below) return PASTE_WEIGHTS[i].weight
    }
    return 1.0
  }

  // Weight a list of paste lengths (one entry per paste event).
  // Returns { count, chars, weightedChars }.
  function weightedPaste(pasteLengths) {
    var count = 0, chars = 0, weighted = 0
    if (pasteLengths && typeof pasteLengths.length === 'number') {
      for (var i = 0; i < pasteLengths.length; i++) {
        var len = finiteOrNull(pasteLengths[i])
        if (len === null || len <= 0) continue
        count++
        chars += len
        weighted += len * pasteWeight(len)
      }
    }
    return { count: count, chars: chars, weightedChars: round2(weighted) }
  }

  // Everything the purity signal needs to know about foreign text in a session.
  // Prefers per-event lengths (session.pasteLengths). With legacy totals only
  // (pastedChars/alienChars + pasteCount) the whole total is weighted as ONE
  // paste: the weight never decreases with length, so this can over-weight
  // several small pastes but can never under-weight a big one. Alien text that
  // no paste event accounts for (drag-drop, voice, script insertion) counts at
  // full weight.
  function summarizePaste(session) {
    session = session || {}
    var alien = Math.max(0, finiteOrNull(session.alienChars) || 0)
    var lengths = session.pasteLengths
    var wp, count

    if (lengths && typeof lengths.length === 'number') {
      wp = weightedPaste(lengths)
      var declared = finiteOrNull(session.pasteCount)
      count = Math.max(wp.count, declared !== null ? Math.max(0, Math.round(declared)) : 0)
    } else {
      var total = finiteOrNull(session.pastedChars)
      if (total === null) total = alien
      total = Math.max(0, total)
      wp = total > 0 ? weightedPaste([total]) : { count: 0, chars: 0, weightedChars: 0 }
      var pc = finiteOrNull(session.pasteCount)
      count = pc !== null ? Math.max(0, Math.round(pc)) : wp.count
      if (count === 0 && total > 0) count = 1
    }

    var unattributed = Math.max(0, alien - wp.chars)
    return {
      count: count,
      chars: wp.chars,
      weightedChars: round2(wp.weightedChars + unattributed),
      alienChars: alien,
    }
  }

  // ── Cross-signal correlation (3 sub-tests) ───────────────────────────

  function scoreCrossSignal(session) {
    session = session || {}
    var flights = finiteNumbers(session.flightTimes)
    var dwells = finiteNumbers(session.dwellTimes)
    var fatigue = finiteNumbers(session.fatigueWindows)
    var score = 0
    var tests = 0

    // Sub-test 1: pause warm-up. After a gap, are the next keystrokes slower?
    if (flights.length >= 20) {
      var avgFlight = mean(flights)
      var pauseHits = 0
      var pauseWarmups = 0
      for (var i = 1; i < flights.length - 3; i++) {
        if (flights[i] > PAUSE_THRESHOLD_MS * 0.5) {
          pauseHits++
          var nextAvg = (flights[i + 1] + flights[i + 2] + flights[i + 3]) / 3
          if (nextAvg > avgFlight) pauseWarmups++
        }
      }
      score += pauseHits >= 1 ? (pauseWarmups / pauseHits > 0.5 ? 1 : 0) : 0.5
      tests++
    }

    // Sub-test 2: flow coupling. Does inter-key speed move with dwell?
    if (flights.length >= 20 && dwells.length >= 20) {
      var flightW = []
      var dwellW = []
      var minLen = Math.min(flights.length, dwells.length)
      for (var k = 0; k + CROSS_WINDOW <= minLen; k += CROSS_WINDOW) {
        flightW.push(mean(flights.slice(k, k + CROSS_WINDOW)))
        dwellW.push(mean(dwells.slice(k, k + CROSS_WINDOW)))
      }
      if (flightW.length >= 3) {
        var r = pearsonR(flightW, dwellW)
        score += r > 0.3 ? 1 : r > 0 ? 0.5 : 0
      } else {
        score += 0.5
      }
      tests++
    }

    // Sub-test 3: fatigue slope. Does typing slow down over the session?
    if (fatigue.length >= 3) {
      score += fatigue[fatigue.length - 1] - fatigue[0] > 0 ? 1 : 0
      tests++
    }

    return tests > 0 ? round2(score / tests) : 0.5
  }

  // ── Labels ───────────────────────────────────────────────────────────

  function tierFor(war) {
    if (!isNum(war)) return null
    for (var i = 0; i < WAR_TIERS.length; i++) {
      if (war >= WAR_TIERS[i][0]) return WAR_TIERS[i][1]
    }
    return WAR_TIERS[WAR_TIERS.length - 1][1]
  }

  function classify(war) {
    if (!isNum(war)) return 'insufficient_data'
    if (war >= CLASSIFICATION.verified) return 'verified'
    if (war >= CLASSIFICATION.suspicious) return 'suspicious'
    return 'bot'
  }

  // ── The scorer ───────────────────────────────────────────────────────

  function scoreProfile(profile, session) {
    session = session || {}
    var flights = finiteNumbers(session.flightTimes)
    var paste = summarizePaste(session)

    if (!profile || typeof profile !== 'object' || flights.length < MIN_FLIGHTS) {
      return {
        war: null, raw_war: null, tier: null, classification: 'insufficient_data',
        components: {}, flags: ['too_short'], timeCap: TIME_CAP_MAX, paste: paste,
      }
    }

    var flags = []
    var meanIKI = finiteOrNull(profile.mean_inter_key)
    var stdIKI = finiteOrNull(profile.std_inter_key)
    var meanDwell = finiteOrNull(profile.mean_dwell)
    var stdDwell = finiteOrNull(profile.std_dwell)
    var editRatio = finiteOrNull(profile.edit_ratio)
    var pauseFreq = finiteOrNull(profile.pause_freq)

    // === LAYER 1: hard floors. Cheap bots stop here with WAR 0. ===
    if (meanDwell !== null && meanDwell < HARD_FLOORS.mean_dwell) flags.push('dwell_floor')
    if (stdIKI !== null && stdIKI < HARD_FLOORS.std_inter_key) flags.push('variance_floor')
    if (meanIKI !== null && meanIKI < HARD_FLOORS.mean_inter_key) flags.push('iki_floor')
    if (flags.length > 0) {
      return {
        war: 0, raw_war: 0, tier: tierFor(0), classification: 'bot',
        components: {}, flags: flags, timeCap: TIME_CAP_MAX, paste: paste,
      }
    }

    // === LAYER 2: nine weighted signals ===
    var c = {}

    // 1. Bigram rhythm: CV of the mean timing of common letter pairs
    var bigramMeans = []
    var sigs = profile.bigram_signatures
    if (sigs && typeof sigs === 'object') {
      var bgKeys = Object.keys(sigs)
      for (var b = 0; b < bgKeys.length; b++) {
        var sig = sigs[bgKeys[b]]
        var bm = finiteOrNull(sig && typeof sig === 'object' ? sig.mean : sig)
        if (bm !== null) bigramMeans.push(bm)
      }
    }
    if (bigramMeans.length >= 4) {
      var bigramCv = cv(bigramMeans)
      c.bigram_rhythm = ramp(bigramCv, WAR_RAMPS.bigram_rhythm)
      if (bigramCv < WAR_RAMPS.bigram_rhythm[0]) flags.push('bigram_uniform')
    } else {
      c.bigram_rhythm = 0.5
    }

    // 2. Per-key uniqueness: CV of the mean dwell of the tracked keys
    var perKey = []
    var pkd = profile.per_key_dwell
    if (pkd && typeof pkd === 'object') {
      var pkKeys = Object.keys(pkd)
      for (var p = 0; p < pkKeys.length; p++) {
        var pv = finiteOrNull(pkd[pkKeys[p]])
        if (pv !== null) perKey.push(pv)
      }
    }
    if (perKey.length >= 3) {
      var pkCv = cv(perKey)
      c.per_key = ramp(pkCv, WAR_RAMPS.per_key)
      if (pkCv < WAR_RAMPS.per_key[0]) flags.push('per_key_uniformity')
    } else {
      c.per_key = 0.5
    }

    // 3. Cross-signal correlation
    c.cross_signal = scoreCrossSignal(session)

    // 4. Distribution shape: K-S distance from a log-normal fit
    var ks = ksStatistic(flights)
    c.distribution = ramp(ks, WAR_RAMPS.ks_shape)
    if (ks > WAR_RAMPS.ks_shape[0]) flags.push('non_lognormal')

    // 5. Inter-key variance
    c.inter_key_var = stdIKI !== null ? ramp(stdIKI, WAR_RAMPS.inter_key_var) : 0.5

    // 6. Dwell std
    if (stdDwell !== null) {
      c.dwell_std = ramp(stdDwell, WAR_RAMPS.dwell_std)
      if (stdDwell < WAR_RAMPS.dwell_std[0]) flags.push('dwell_std_hard')
    } else {
      c.dwell_std = 0.5
    }

    // 7. Mean dwell
    c.mean_dwell = meanDwell !== null ? ramp(meanDwell, WAR_RAMPS.mean_dwell) : 0.5

    // 8. Editing behaviour: average of edit-ratio and pause-frequency sub-scores
    var editSub = editRatio !== null ? ramp(editRatio, WAR_RAMPS.edit_ratio) : 0.5
    var pauseSub = pauseFreq !== null ? ramp(pauseFreq, WAR_RAMPS.pause_freq) : 0.5
    c.editing = (editSub + pauseSub) / 2
    if (editRatio !== null && pauseFreq !== null &&
        editRatio < WAR_RAMPS.edit_ratio[0] && pauseFreq < WAR_RAMPS.pause_freq[0]) {
      flags.push('no_editing_behavior')
    }

    // 9. Purity: typed characters against length-weighted foreign characters.
    //    Transparent, not punished: this is the only place paste enters WAR.
    var human = Math.max(0, finiteOrNull(session.humanChars) || 0)
    if (human + paste.alienChars >= MIN_CHARS_FOR_PURITY) {
      var denom = human + paste.weightedChars
      c.purity = denom > 0 ? ramp(human / denom, WAR_RAMPS.purity) : 0
    } else {
      c.purity = 0.5
    }
    if (paste.count >= HIGH_PASTE_VOLUME_COUNT) flags.push('high_paste_volume')

    // Weighted sum -> raw_war
    var raw = 0
    var wk = Object.keys(WAR_WEIGHTS)
    for (var w = 0; w < wk.length; w++) {
      var value = c[wk[w]]
      raw += WAR_WEIGHTS[wk[w]] * (isNum(value) ? value : 0.5)
    }
    raw = round2(raw)

    // === LAYER 3: soft penalties -> war ===
    var penalty = 0
    for (var f = 0; f < flags.length; f++) {
      if (PENALTIES[flags[f]]) penalty += PENALTIES[flags[f]]
    }
    var war = round2(Math.max(0, raw - penalty))

    return {
      war: war,
      raw_war: raw,
      tier: tierFor(war),
      classification: classify(war),
      components: c,
      flags: flags,
      timeCap: TIME_CAP_MAX,
      paste: paste,
    }
  }

  // ── Time confidence cap ──────────────────────────────────────────────

  function timeCapFor(days) {
    if (!isNum(days) || days < 0) days = 0
    for (var i = 0; i < TIME_CAPS.length; i++) {
      if (days < TIME_CAPS[i][0]) return TIME_CAPS[i][1]
    }
    return TIME_CAP_MAX
  }

  function accountAgeDays(firstSeenMs, nowMs) {
    var first = finiteOrNull(firstSeenMs)
    if (first === null || first <= 0) return 0
    var now = finiteOrNull(nowMs)
    if (now === null) now = Date.now()
    return Math.max(0, (now - first) / 86400000)
  }

  // Caps `war` (after penalties) by account age. `raw_war` is never touched:
  // it stays the pre-penalty, pre-cap session score. The tier follows the
  // capped war; the classification keeps describing the session evidence.
  // Never throws: a missing, NaN or future firstSeen counts as day 0.
  function applyTimeCap(result, firstSeenMs, nowMs) {
    if (!result || typeof result !== 'object') {
      result = {
        war: null, raw_war: null, tier: null, classification: 'insufficient_data',
        components: {}, flags: [], paste: summarizePaste(null),
      }
    }
    var cap = timeCapFor(accountAgeDays(firstSeenMs, nowMs))
    result.timeCap = cap
    var war = finiteOrNull(result.war)
    if (war === null) {
      result.war = null
      result.tier = null
    } else {
      result.war = round2(Math.min(war, cap))
      result.tier = tierFor(result.war)
    }
    return result
  }

  // ── Namespace ────────────────────────────────────────────────────────

  return {
    version: ENGINE_VERSION,
    WAR_WEIGHTS: WAR_WEIGHTS,
    WAR_RAMPS: WAR_RAMPS,
    WAR_TIERS: WAR_TIERS,
    HARD_FLOORS: HARD_FLOORS,
    PENALTIES: PENALTIES,
    PASTE_WEIGHTS: PASTE_WEIGHTS,
    HIGH_PASTE_VOLUME_COUNT: HIGH_PASTE_VOLUME_COUNT,
    CLASSIFICATION: CLASSIFICATION,
    TIME_CAPS: TIME_CAPS,
    MIN_FLIGHTS: MIN_FLIGHTS,
    scoreProfile: scoreProfile,
    scoreCrossSignal: scoreCrossSignal,
    applyTimeCap: applyTimeCap,
    timeCapFor: timeCapFor,
    accountAgeDays: accountAgeDays,
    weightedPaste: weightedPaste,
    pasteWeight: pasteWeight,
    summarizePaste: summarizePaste,
    tierFor: tierFor,
    classify: classify,
    ksStatistic: ksStatistic,
    pearsonR: pearsonR,
    normalCDF: normalCDF,
    rampScore: rampScore,
    mean: mean,
    std: std,
    round2: round2,
    round3: round3,
    clamp01: clamp01,
    finiteNumbers: finiteNumbers,
    finiteOrNull: finiteOrNull,
  }
})()

// Classic <script> (extension content script, extension pages): global name.
if (typeof window !== 'undefined') {
  window.JitterWAR = JitterWAR
}

// CommonJS (Node tests, lab, SDK core when run as a module).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JitterWAR
}
