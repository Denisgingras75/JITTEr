/**
 * jitter-box.js — Standalone keystroke biometrics widget
 * Zero dependencies. Zero UI. Attach to any textarea, get a WAR badge on submit.
 *
 * Usage:
 *   const jb = JitterBox.attach(document.querySelector('textarea'))
 *   // user types naturally...
 *   const badge = jb.score()   // => { war: 0.92, classification: 'human', ... }
 *   jb.detach()                // cleanup listeners
 */

// ── Constants ──────────────────────────────────────────────────────────

const EDITING_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
])

const MAX_FLIGHT_TIMES = 100
const MAX_DWELL_TIMES = 100
const MIN_FLIGHT_MS = 20
const MAX_FLIGHT_MS = 2000
const MIN_DWELL_MS = 10
const MAX_DWELL_MS = 500
const MIN_CHARS_FOR_SCORE = 20
const AUTOCORRECT_TOLERANCE = 15
const FATIGUE_WINDOW_COUNT = 4
const PAUSE_THRESHOLD_MS = 2000
const TRACKED_KEYS = ['e', 't', 'a', 'o', 'i', 'n', 's', 'r', 'h', 'l']
const MOUSE_SAMPLE_INTERVAL = 50
const MAX_MOUSE_SAMPLES = 50

const TRACKED_BIGRAMS = new Set([
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
  'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
  'st', 'to', 'nt', 'ng', 'se', 'ha', 'as', 'ou', 'io', 'le',
])

// WAR v2: signal ramps [bot_floor, human_zone] and weights
var RAMPS = {
  bigram_rhythm:    [0.08, 0.20],
  per_key:          [0.09, 0.25],
  inter_key_var:    [9, 45],
  dwell_std:        [8, 20],
  mean_dwell:       [27, 80],
  edit_ratio:       [0.03, 0.08],
  pause_freq:       [0.4, 1.5],
  purity:           [0, 1],
  ks_shape:         [0.25, 0.08],
}
var WEIGHTS = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.07, purity: 0.05,
}

// ── Math helpers ───────────────────────────────────────────────────────

function mean(arr) {
  if (arr.length === 0) return 0
  var sum = 0
  for (var i = 0; i < arr.length; i++) sum += arr[i]
  return sum / arr.length
}

function std(arr) {
  if (arr.length < 2) return 0
  var m = mean(arr)
  var variance = 0
  for (var i = 0; i < arr.length; i++) variance += (arr[i] - m) * (arr[i] - m)
  return Math.sqrt(variance / arr.length)
}

function round2(n) { return Math.round(n * 100) / 100 }
function round3(n) { return Math.round(n * 1000) / 1000 }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }

function rampScore(raw, floor, ceiling) {
  if (floor < ceiling) return clamp01((raw - floor) / (ceiling - floor))
  return clamp01((floor - raw) / (floor - ceiling)) // inverted (K-S: lower = better)
}

// ── Statistical tests ──────────────────────────────────────────────────

// Standard normal CDF approximation (Abramowitz & Stegun)
function normalCDF(z) {
  if (z < -6) return 0
  if (z > 6) return 1
  var sign = z < 0 ? -1 : 1
  z = Math.abs(z)
  var t = 1 / (1 + 0.2316419 * z)
  var d = 0.3989422804014327 * Math.exp(-z * z / 2)
  var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))))
  return sign === 1 ? 1 - p : p
}

// Kolmogorov-Smirnov: compare empirical CDF to log-normal fit
function ksStatistic(values) {
  if (values.length < 10) return 0.5

  var logs = []
  for (var i = 0; i < values.length; i++) {
    if (values[i] > 0) logs.push(Math.log(values[i]))
  }
  if (logs.length < 10) return 0.5

  var mu = mean(logs)
  var sigma = std(logs)
  if (sigma === 0) return 1.0

  var sorted = values.slice().sort(function (a, b) { return a - b })
  var n = sorted.length
  var maxDiff = 0

  for (var j = 0; j < n; j++) {
    var empirical = (j + 1) / n
    var z = (Math.log(sorted[j]) - mu) / sigma
    var theoretical = normalCDF(z)
    var diff = Math.abs(empirical - theoretical)
    if (diff > maxDiff) maxDiff = diff
  }

  return round3(maxDiff)
}

// Pearson correlation coefficient
function pearsonR(a, b) {
  if (a.length < 3 || a.length !== b.length) return 0
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
  return denom > 0 ? num / denom : 0
}

// ── Mouse path analysis ────────────────────────────────────────────────

function computeMousePath(positions) {
  if (positions.length < 5) return null

  var totalDist = 0
  for (var i = 1; i < positions.length; i++) {
    var dx = positions[i].x - positions[i - 1].x
    var dy = positions[i].y - positions[i - 1].y
    totalDist += Math.sqrt(dx * dx + dy * dy)
  }

  var first = positions[0]
  var last = positions[positions.length - 1]
  var straightDist = Math.sqrt(
    (last.x - first.x) * (last.x - first.x) +
    (last.y - first.y) * (last.y - first.y)
  )

  var linearity = totalDist > 0 ? round3(straightDist / totalDist) : 1
  var totalTime = (last.t - first.t) / 1000
  var avgSpeed = totalTime > 0 ? Math.round(totalDist / totalTime) : 0

  return { linearity: linearity, avgSpeed: avgSpeed }
}

// ── WAR Scorer (9-signal weighted composite) ───────────────────────────

function scoreProfile(profile, captureData) {
  if (!profile) return { war: 1.0, classification: 'verified', components: {}, flags: [] }

  var components = {}
  var flags = []

  // 1. Bigram rhythm (CV of bigram means)
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

  // 2. Per-key uniqueness (CV of per-key dwells)
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

  // 3. Cross-signal correlation (3 sub-tests)
  components.cross_signal = scoreCrossSignal(captureData || {})

  // 4. Distribution shape (K-S test on flight times)
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
    if (profile.std_inter_key < 9) flags.push('variance_floor')
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
    if (profile.mean_dwell < 27) flags.push('dwell_floor')
  } else {
    components.mean_dwell = 0.5
  }

  // 8. Editing behavior (avg of edit_ratio + pause_freq sub-scores)
  var editSub = profile.edit_ratio != null
    ? rampScore(profile.edit_ratio, RAMPS.edit_ratio[0], RAMPS.edit_ratio[1]) : 0.5
  var pauseSub = profile.pause_freq != null
    ? rampScore(profile.pause_freq, RAMPS.pause_freq[0], RAMPS.pause_freq[1]) : 0.5
  components.editing = (editSub + pauseSub) / 2
  if (profile.edit_ratio != null && profile.pause_freq != null &&
      profile.edit_ratio < 0.03 && profile.pause_freq < 0.4) {
    flags.push('no_editing_behavior')
  }

  // 9. Purity
  var total = (captureData && (captureData.humanChars + captureData.alienChars)) || 0
  if (total >= MIN_CHARS_FOR_SCORE && captureData) {
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
  war = round2(war)

  var classification
  if (war >= 0.80) classification = 'verified'
  else if (war >= 0.50) classification = 'suspicious'
  else classification = 'bot'

  return { war: war, classification: classification, components: components, flags: flags }
}

// Cross-signal correlation scorer (3 sub-tests)
function scoreCrossSignal(captureData) {
  var score = 0
  var tests = 0

  // Sub-test 1: Pause-warmup — after gap, next keystrokes slower?
  if (captureData.flightTimes && captureData.flightTimes.length >= 20) {
    var flights = captureData.flightTimes
    var avgFlight = mean(flights)
    var pauseWarmups = 0
    var pauseHits = 0
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

  // Sub-test 2: Flow coupling — inter-key speed correlates with dwell
  if (captureData.flightTimes && captureData.dwellTimes &&
      captureData.flightTimes.length >= 20 && captureData.dwellTimes.length >= 20) {
    var flightW = []
    var dwellW = []
    var minLen = Math.min(captureData.flightTimes.length, captureData.dwellTimes.length)
    var ws = 10
    for (var k = 0; k + ws <= minLen; k += ws) {
      flightW.push(mean(captureData.flightTimes.slice(k, k + ws)))
      dwellW.push(mean(captureData.dwellTimes.slice(k, k + ws)))
    }
    if (flightW.length >= 3) {
      var r = pearsonR(flightW, dwellW)
      score += r > 0.3 ? 1 : r > 0 ? 0.5 : 0
    } else {
      score += 0.5
    }
    tests++
  }

  // Sub-test 3: Fatigue slope — typing slows over time
  if (captureData.fatigueWindows && captureData.fatigueWindows.length >= 3) {
    var fw = captureData.fatigueWindows
    score += fw[fw.length - 1] - fw[0] > 0 ? 1 : 0
    tests++
  }

  return tests > 0 ? round2(score / tests) : 0.5
}

// ── JitterBox ──────────────────────────────────────────────────────────

function createData() {
  return {
    humanChars: 0,
    alienChars: 0,
    flightTimes: [],
    dwellTimes: [],
    ddTimes: [],
    bigramTimings: {},
    fatigueWindows: [],
    lastKeyTime: 0,
    lastKeyChar: '',
    lastKeyDownTime: 0,
    keyDownTimes: {},
    perKeyDwells: {},
    totalKeystrokes: 0,
    backspaceCount: 0,
    pauseCount: 0,
    mousePositions: [],
    lastMouseSampleTime: 0,
    sessionStartTime: Date.now(),
  }
}

function attach(el) {
  if (!el || typeof el.addEventListener !== 'function') {
    throw new Error('JitterBox.attach() requires a DOM element')
  }

  var data = createData()
  var observer = null

  // ── Handlers ─────────────────────────────────────────────────────

  function onKeydown(e) {
    var now = performance.now()

    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (e.key === 'Backspace' || e.key === 'Delete') {
      data.backspaceCount++
      return
    }

    if (EDITING_KEYS.has(e.key)) return
    if (e.key.length !== 1) return

    data.humanChars++
    data.totalKeystrokes++

    var keyLower = e.key.toLowerCase()
    data.keyDownTimes[keyLower] = now

    // DD time (keydown-to-keydown)
    if (data.lastKeyDownTime > 0) {
      var dd = now - data.lastKeyDownTime
      if (dd >= MIN_FLIGHT_MS && dd <= MAX_FLIGHT_MS) {
        data.ddTimes.push(dd)
        if (data.ddTimes.length > MAX_FLIGHT_TIMES) data.ddTimes.shift()
      }
    }
    data.lastKeyDownTime = now

    // Flight time + pauses + bigrams
    if (data.lastKeyTime > 0) {
      var rawFlight = now - data.lastKeyTime

      if (rawFlight > PAUSE_THRESHOLD_MS) data.pauseCount++

      if (rawFlight >= MIN_FLIGHT_MS && rawFlight <= MAX_FLIGHT_MS) {
        data.flightTimes.push(rawFlight)
        if (data.flightTimes.length > MAX_FLIGHT_TIMES) data.flightTimes.shift()

        // Bigram timing
        if (data.lastKeyChar) {
          var bigram = data.lastKeyChar + keyLower
          if (TRACKED_BIGRAMS.has(bigram)) {
            if (!data.bigramTimings[bigram]) data.bigramTimings[bigram] = []
            data.bigramTimings[bigram].push(rawFlight)
          }
        }

        // Fatigue windows — every 25 keystrokes
        if (data.totalKeystrokes > 0 && data.totalKeystrokes % 25 === 0) {
          var recent = data.flightTimes.slice(-25)
          data.fatigueWindows.push(round2(mean(recent)))
          if (data.fatigueWindows.length > FATIGUE_WINDOW_COUNT) data.fatigueWindows.shift()
        }
      }
    }

    data.lastKeyTime = now
    data.lastKeyChar = keyLower
  }

  function onKeyup(e) {
    var now = performance.now()

    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (EDITING_KEYS.has(e.key)) return
    if (e.key.length !== 1) return

    var keyLower = e.key.toLowerCase()
    var downTime = data.keyDownTimes[keyLower]

    if (downTime) {
      var dwell = now - downTime
      if (dwell >= MIN_DWELL_MS && dwell <= MAX_DWELL_MS) {
        data.dwellTimes.push(dwell)
        if (data.dwellTimes.length > MAX_DWELL_TIMES) data.dwellTimes.shift()

        // Per-key dwell for fingerprint keys
        if (TRACKED_KEYS.indexOf(keyLower) !== -1) {
          if (!data.perKeyDwells[keyLower]) data.perKeyDwells[keyLower] = []
          data.perKeyDwells[keyLower].push(dwell)
          if (data.perKeyDwells[keyLower].length > 50) data.perKeyDwells[keyLower].shift()
        }
      }
      delete data.keyDownTimes[keyLower]
    }
  }

  function onPaste(e) {
    var pasted = e.clipboardData ? e.clipboardData.getData('text') : ''
    if (pasted.length > 0) data.alienChars += pasted.length
  }

  function onMouseMove(e) {
    var now = performance.now()
    if (now - data.lastMouseSampleTime < MOUSE_SAMPLE_INTERVAL) return
    data.lastMouseSampleTime = now
    data.mousePositions.push({ x: e.clientX, y: e.clientY, t: now })
    if (data.mousePositions.length > MAX_MOUSE_SAMPLES) data.mousePositions.shift()
  }

  // ── Attach ───────────────────────────────────────────────────────

  el.addEventListener('keydown', onKeydown)
  el.addEventListener('keyup', onKeyup)
  el.addEventListener('paste', onPaste)
  document.addEventListener('mousemove', onMouseMove)

  // MutationObserver for voice input, drag-drop, etc.
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === 'characterData') {
          var added = (mutations[i].target.textContent || '').length -
            (mutations[i].oldValue || '').length
          if (added > AUTOCORRECT_TOLERANCE) data.alienChars += added
        }
      }
    })
    observer.observe(el, {
      characterData: true,
      characterDataOldValue: true,
      subtree: true,
    })
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    /**
     * Generate the full biometric profile + WAR score.
     * Call this on form submit. Returns the badge payload.
     *
     * @returns {Object|null} badge payload, or null if insufficient data
     *   { war, classification, flags, profile: { ... }, purity, session }
     */
    score: function () {
      if (data.flightTimes.length < 10) return null

      var total = data.humanChars + data.alienChars
      var purity = total >= MIN_CHARS_FOR_SCORE
        ? round2(data.humanChars / total * 100)
        : null

      // Build profile (same shape as getJitterProfile)
      var perKeyDwell = {}
      for (var i = 0; i < TRACKED_KEYS.length; i++) {
        var k = TRACKED_KEYS[i]
        var times = data.perKeyDwells[k]
        if (times && times.length >= 2) perKeyDwell[k] = round2(mean(times))
      }

      var bigramSignatures = {}
      var bigramKeys = Object.keys(data.bigramTimings)
      for (var j = 0; j < bigramKeys.length; j++) {
        var bg = bigramKeys[j]
        var timings = data.bigramTimings[bg]
        if (timings.length >= 2) {
          bigramSignatures[bg] = {
            mean: round2(mean(timings)),
            std: round2(std(timings)),
            n: timings.length,
          }
        }
      }

      var editRatio = data.totalKeystrokes > 0
        ? round3(data.backspaceCount / (data.totalKeystrokes + data.backspaceCount))
        : 0

      var pauseFreq = data.totalKeystrokes > 0
        ? round2(data.pauseCount / data.totalKeystrokes * 100)
        : 0

      var profile = {
        total_keystrokes: data.totalKeystrokes,
        mean_inter_key: round2(mean(data.flightTimes)),
        std_inter_key: round2(std(data.flightTimes)),
        mean_dwell: data.dwellTimes.length > 0 ? round2(mean(data.dwellTimes)) : null,
        std_dwell: data.dwellTimes.length > 1 ? round2(std(data.dwellTimes)) : null,
        mean_dd_time: data.ddTimes.length > 0 ? round2(mean(data.ddTimes)) : null,
        std_dd_time: data.ddTimes.length > 1 ? round2(std(data.ddTimes)) : null,
        per_key_dwell: perKeyDwell,
        bigram_signatures: bigramSignatures,
        edit_ratio: editRatio,
        pause_freq: pauseFreq,
        mouse_path: computeMousePath(data.mousePositions),
        sample_size: data.flightTimes.length,
      }

      var result = scoreProfile(profile, data)

      var duration = Math.round((Date.now() - data.sessionStartTime) / 1000)
      var minutes = duration / 60
      var wpm = minutes > 0 && data.totalKeystrokes > 0
        ? Math.round((data.totalKeystrokes / 5) / minutes)
        : 0

      return {
        war: result.war,
        classification: result.classification,
        flags: result.flags,
        components: result.components,
        purity: purity,
        profile: profile,
        session: {
          keystrokes: data.totalKeystrokes,
          duration: duration,
          wpm: wpm,
          human_chars: data.humanChars,
          alien_chars: data.alienChars,
        },
      }
    },

    /**
     * Reset all captured data (e.g., when textarea is cleared).
     */
    reset: function () {
      data = createData()
    },

    /**
     * Remove all event listeners. Call on teardown.
     */
    detach: function () {
      el.removeEventListener('keydown', onKeydown)
      el.removeEventListener('keyup', onKeyup)
      el.removeEventListener('paste', onPaste)
      document.removeEventListener('mousemove', onMouseMove)
      if (observer) observer.disconnect()
    },
  }
}

// ── Export ──────────────────────────────────────────────────────────────

var JitterBox = { attach: attach }

if (typeof window !== 'undefined') {
  window.JitterBox = JitterBox
}

// Test-only exports (tree-shaken in prod)
var _testExports = {
  ksStatistic: ksStatistic, pearsonR: pearsonR, normalCDF: normalCDF,
  scoreProfile: scoreProfile, scoreCrossSignal: scoreCrossSignal,
  rampScore: rampScore,
}

export default JitterBox
export { attach, _testExports }
