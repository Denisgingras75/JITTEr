/**
 * jitter-box.js — Standalone keystroke biometrics widget (SDK core)
 * Zero dependencies. Zero UI. Attach to any textarea, get a WAR badge on submit.
 *
 * CAPTURE lives here. The SCORING MATH lives in extension/src/war-score.js,
 * the one canonical engine shared with the Chrome extension and the lab.
 * sdk/build.js concatenates that file ahead of this one, so inside the bundle
 * `JitterWAR` is already in scope; loaded as a module (Node, tests) it is
 * imported below. Change the formula there, never here.
 *
 * Usage:
 *   const jb = JitterBox.attach(document.querySelector('textarea'))
 *   // user types naturally...
 *   const badge = jb.score()   // => { war: 0.92, classification: 'verified', ... }
 *   jb.detach()                // cleanup listeners
 */

import JitterWAR from '../../../extension/src/war-score.js'

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

// ── Math helpers (shared with the engine) ──────────────────────────────

var mean = JitterWAR.mean
var std = JitterWAR.std
var round2 = JitterWAR.round2
var round3 = JitterWAR.round3

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

// ── JitterBox ──────────────────────────────────────────────────────────

function createData() {
  return {
    humanChars: 0,
    alienChars: 0,
    pasteCount: 0,
    pasteLengths: [],      // one entry per paste event: the engine weights by length
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

    // Page scripts can dispatch KeyboardEvents; only real input counts.
    if (!e.isTrusted || e.repeat || typeof e.key !== 'string') return
    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (e.key === 'Backspace' || e.key === 'Delete') {
      data.backspaceCount++
      lastDeleteKeyTime = now
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

    if (!e.isTrusted || typeof e.key !== 'string') return
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
    if (!e.isTrusted) return
    var pasted = e.clipboardData ? e.clipboardData.getData('text') : ''
    if (pasted.length > 0) {
      // Length only, never the text (Hard Rule #1). One entry per event so the
      // engine can weight a pasted URL differently from a pasted paragraph.
      data.alienChars += pasted.length
      data.pasteCount++
      data.pasteLengths.push(pasted.length)
    }
  }

  function onMouseMove(e) {
    if (!e.isTrusted) return
    var now = performance.now()
    if (now - data.lastMouseSampleTime < MOUSE_SAMPLE_INTERVAL) return
    data.lastMouseSampleTime = now
    data.mousePositions.push({ x: e.clientX, y: e.clientY, t: now })
    if (data.mousePositions.length > MAX_MOUSE_SAMPLES) data.mousePositions.shift()
  }

  // ── Mobile fallback (input event) ──────────────────────────────
  // Mobile soft keyboards often send keydown with key='Unidentified'
  // or 'Process', which fails the key.length check. The input event
  // fires reliably on all platforms when text actually changes.

  var lastInputTime = 0
  var lastInputLength = 0
  var lastDeleteKeyTime = 0

  function onInput(e) {
    if (e && !e.isTrusted) return
    var now = performance.now()
    var currentLength = el.value ? el.value.length : 0

    // Deletion (onKeydown already counted it when a Backspace/Delete key fired)
    if (currentLength < lastInputLength) {
      if (!(lastDeleteKeyTime > 0 && now - lastDeleteKeyTime < 50)) {
        data.backspaceCount += (lastInputLength - currentLength)
      }
      lastInputLength = currentLength
      lastInputTime = now
      return
    }

    var charsAdded = currentLength - lastInputLength
    lastInputLength = currentLength

    // Skip large insertions (paste, autocomplete) — onPaste handles those
    if (charsAdded > 5) return
    if (charsAdded === 0) return

    // Only use input fallback if keydown didn't already capture this
    // Check: if keydown fired recently (within 50ms), it already counted
    if (data.lastKeyDownTime > 0 && (now - data.lastKeyDownTime) < 50) return

    // Input event fallback — count as human input
    for (var i = 0; i < charsAdded; i++) {
      data.humanChars++
      data.totalKeystrokes++
    }

    // Flight time from input events
    if (lastInputTime > 0) {
      var flight = now - lastInputTime
      if (flight >= MIN_FLIGHT_MS && flight <= MAX_FLIGHT_MS) {
        data.flightTimes.push(flight)
        if (data.flightTimes.length > MAX_FLIGHT_TIMES) data.flightTimes.shift()

        // Fatigue windows
        if (data.totalKeystrokes > 0 && data.totalKeystrokes % 25 === 0) {
          var recent = data.flightTimes.slice(-25)
          data.fatigueWindows.push(round2(mean(recent)))
          if (data.fatigueWindows.length > FATIGUE_WINDOW_COUNT) data.fatigueWindows.shift()
        }
      }
    }

    lastInputTime = now
  }

  // ── Attach ───────────────────────────────────────────────────────

  el.addEventListener('keydown', onKeydown)
  el.addEventListener('keyup', onKeyup)
  el.addEventListener('input', onInput)
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
     *   { war, raw_war, tier, classification, flags, components, paste,
     *     purity, profile: { ... }, session }
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

      var result = JitterWAR.scoreProfile(profile, data)

      var duration = Math.round((Date.now() - data.sessionStartTime) / 1000)
      var minutes = duration / 60
      var wpm = minutes > 0 && data.totalKeystrokes > 0
        ? Math.round((data.totalKeystrokes / 5) / minutes)
        : 0

      return {
        war: result.war,
        raw_war: result.raw_war,
        tier: result.tier,
        classification: result.classification,
        flags: result.flags,
        components: result.components,
        paste: result.paste,
        purity: purity,
        profile: profile,
        session: {
          keystrokes: data.totalKeystrokes,
          duration: duration,
          wpm: wpm,
          human_chars: data.humanChars,
          alien_chars: data.alienChars,
          paste_count: data.pasteCount,
        },
      }
    },

    /**
     * Reset all captured data (e.g., when textarea is cleared).
     */
    reset: function () {
      data = createData()
      lastInputLength = el.value ? el.value.length : 0
      lastInputTime = 0
      lastDeleteKeyTime = 0
    },

    /**
     * Remove all event listeners. Call on teardown.
     */
    detach: function () {
      el.removeEventListener('keydown', onKeydown)
      el.removeEventListener('keyup', onKeyup)
      el.removeEventListener('input', onInput)
      el.removeEventListener('paste', onPaste)
      document.removeEventListener('mousemove', onMouseMove)
      if (observer) observer.disconnect()
    },
  }
}

// ── scoreRaw: build profile from raw capture arrays and score ────────
// Used by jitter-capture.js (the WGH path). Accepts { flightTimes, dwellTimes,
// humanChars, alienChars, backspaceCount, pauseCount, pasteCount,
// pasteLengths? } and returns the engine result.

function insufficientData(captureData) {
  return {
    war: null, raw_war: null, tier: null, classification: 'insufficient_data',
    components: {}, flags: ['too_short'], timeCap: 1.0,
    paste: JitterWAR.summarizePaste(captureData && typeof captureData === 'object' ? captureData : {}),
  }
}

function scoreRaw(captureData) {
  if (!captureData || typeof captureData !== 'object') return insufficientData(captureData)

  var ft = JitterWAR.finiteNumbers(captureData.flightTimes)
  if (ft.length < 10) return insufficientData(captureData)

  var dt = JitterWAR.finiteNumbers(captureData.dwellTimes)
  var humanChars = Math.max(0, JitterWAR.finiteOrNull(captureData.humanChars) || 0)
  var backspaces = Math.max(0, JitterWAR.finiteOrNull(captureData.backspaceCount) || 0)
  var pauses = Math.max(0, JitterWAR.finiteOrNull(captureData.pauseCount) || 0)

  var profile = {
    mean_inter_key: mean(ft),
    std_inter_key: std(ft),
    mean_dwell: dt.length > 0 ? mean(dt) : null,
    std_dwell: dt.length > 0 ? std(dt) : null,
    // Typed characters only: pasted text must not dilute the edit ratio,
    // paste is transparent (Hard Rule #5).
    edit_ratio: humanChars > 0 ? backspaces / humanChars : 0,
    pause_freq: ft.length > 0 ? pauses / (ft.length / 10) : 0,
    per_key_dwell: {},
    bigram_signatures: {},
  }

  return JitterWAR.scoreProfile(profile, captureData)
}

// ── Export ──────────────────────────────────────────────────────────────

var JitterBox = {
  attach: attach,
  scoreRaw: scoreRaw,
  scoreProfile: JitterWAR.scoreProfile,
  applyTimeCap: JitterWAR.applyTimeCap,
  WAR: JitterWAR,
}

if (typeof window !== 'undefined') {
  window.JitterBox = JitterBox
}

// Test-only exports (tree-shaken in prod)
var _testExports = {
  ksStatistic: JitterWAR.ksStatistic, pearsonR: JitterWAR.pearsonR, normalCDF: JitterWAR.normalCDF,
  scoreProfile: JitterWAR.scoreProfile, scoreCrossSignal: JitterWAR.scoreCrossSignal,
  rampScore: JitterWAR.rampScore, scoreRaw: scoreRaw, JitterWAR: JitterWAR,
}

export default JitterBox
export { attach, scoreRaw, _testExports }
