/**
 * lab/jitter-box.js — Lab harness over the shipping WAR engine.
 *
 * The scoring math is NOT here any more. It lives in
 * extension/src/war-score.js, the single source of truth shared by the Chrome
 * extension, the SDK bundle and this lab, so every lab experiment scores with
 * exactly the formula that ships. This file keeps only the lab's minimal DOM
 * capture (attach) and re-exports the engine.
 *
 * Node:     const JitterBox = require('./jitter-box.js')
 *           JitterBox.scoreProfile(profile, session)
 *           JitterBox.applyTimeCap(result, firstSeenMs)
 *           JitterBox.WAR            // the whole JitterWAR namespace
 * Browser:  load ../extension/src/war-score.js first, then this file.
 *
 * Usage (browser):
 *   const jb = JitterBox.attach(document.querySelector('textarea'))
 *   const badge = jb.score()   // => { war, raw_war, tier, classification, ... }
 *   jb.detach()
 */

'use strict'

var WAR = (typeof window !== 'undefined' && window.JitterWAR) ||
  (typeof require === 'function' ? require('../extension/src/war-score.js') : null)
if (!WAR) throw new Error('lab/jitter-box.js: load extension/src/war-score.js first')

// ── Capture constants ──────────────────────────────────────────────────

var EDITING_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
])

var MAX_FLIGHT_TIMES = 100
var MAX_DWELL_TIMES = 100
var MIN_FLIGHT_MS = 20
var MAX_FLIGHT_MS = 2000
var MIN_DWELL_MS = 10
var MAX_DWELL_MS = 500
var MIN_CHARS_FOR_SCORE = 20
var AUTOCORRECT_TOLERANCE = 15
var FATIGUE_WINDOW_COUNT = 4
var PAUSE_THRESHOLD_MS = 2000
var TRACKED_KEYS = ['e', 't', 'a', 'o', 'i', 'n', 's', 'r', 'h', 'l']
var MOUSE_SAMPLE_INTERVAL = 50
var MAX_MOUSE_SAMPLES = 50

var TRACKED_BIGRAMS = new Set([
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
  'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
  'st', 'to', 'nt', 'ng', 'se', 'ha', 'as', 'ou', 'io', 'le',
])

var mean = WAR.mean
var std = WAR.std
var round2 = WAR.round2
var round3 = WAR.round3

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

// ── Capture ────────────────────────────────────────────────────────────

function createData() {
  return {
    humanChars: 0,
    alienChars: 0,
    pasteCount: 0,
    pasteLengths: [],
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

  function onKeydown(e) {
    var now = performance.now()
    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (e.key === 'Backspace' || e.key === 'Delete') {
      data.backspaceCount++
      return
    }

    if (EDITING_KEYS.has(e.key)) return
    if (typeof e.key !== 'string' || e.key.length !== 1) return

    data.humanChars++
    data.totalKeystrokes++

    var keyLower = e.key.toLowerCase()
    data.keyDownTimes[keyLower] = now

    if (data.lastKeyDownTime > 0) {
      var dd = now - data.lastKeyDownTime
      if (dd >= MIN_FLIGHT_MS && dd <= MAX_FLIGHT_MS) {
        data.ddTimes.push(dd)
        if (data.ddTimes.length > MAX_FLIGHT_TIMES) data.ddTimes.shift()
      }
    }
    data.lastKeyDownTime = now

    if (data.lastKeyTime > 0) {
      var rawFlight = now - data.lastKeyTime

      if (rawFlight > PAUSE_THRESHOLD_MS) data.pauseCount++

      if (rawFlight >= MIN_FLIGHT_MS && rawFlight <= MAX_FLIGHT_MS) {
        data.flightTimes.push(rawFlight)
        if (data.flightTimes.length > MAX_FLIGHT_TIMES) data.flightTimes.shift()

        if (data.lastKeyChar) {
          var bigram = data.lastKeyChar + keyLower
          if (TRACKED_BIGRAMS.has(bigram)) {
            if (!data.bigramTimings[bigram]) data.bigramTimings[bigram] = []
            data.bigramTimings[bigram].push(rawFlight)
          }
        }

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
    if (typeof e.key !== 'string' || e.key.length !== 1) return

    var keyLower = e.key.toLowerCase()
    var downTime = data.keyDownTimes[keyLower]

    if (downTime) {
      var dwell = now - downTime
      if (dwell >= MIN_DWELL_MS && dwell <= MAX_DWELL_MS) {
        data.dwellTimes.push(dwell)
        if (data.dwellTimes.length > MAX_DWELL_TIMES) data.dwellTimes.shift()

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
    if (pasted.length > 0) {
      data.alienChars += pasted.length
      data.pasteCount++
      data.pasteLengths.push(pasted.length)   // length only, never the text
    }
  }

  function onMouseMove(e) {
    var now = performance.now()
    if (now - data.lastMouseSampleTime < MOUSE_SAMPLE_INTERVAL) return
    data.lastMouseSampleTime = now
    data.mousePositions.push({ x: e.clientX, y: e.clientY, t: now })
    if (data.mousePositions.length > MAX_MOUSE_SAMPLES) data.mousePositions.shift()
  }

  el.addEventListener('keydown', onKeydown)
  el.addEventListener('keyup', onKeyup)
  el.addEventListener('paste', onPaste)
  document.addEventListener('mousemove', onMouseMove)

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
    observer.observe(el, { characterData: true, characterDataOldValue: true, subtree: true })
  }

  return {
    score: function () {
      if (data.flightTimes.length < 10) return null

      var total = data.humanChars + data.alienChars
      var purity = total >= MIN_CHARS_FOR_SCORE ? round2(data.humanChars / total * 100) : null

      var perKeyDwell = {}
      for (var i = 0; i < TRACKED_KEYS.length; i++) {
        var k = TRACKED_KEYS[i]
        var times = data.perKeyDwells[k]
        if (times && times.length >= 2) perKeyDwell[k] = round2(mean(times))
      }

      var bigramSignatures = {}
      var bigramKeys = Object.keys(data.bigramTimings)
      for (var j = 0; j < bigramKeys.length; j++) {
        var timings = data.bigramTimings[bigramKeys[j]]
        if (timings.length >= 2) {
          bigramSignatures[bigramKeys[j]] = {
            mean: round2(mean(timings)), std: round2(std(timings)), n: timings.length,
          }
        }
      }

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
        edit_ratio: data.totalKeystrokes > 0
          ? round3(data.backspaceCount / (data.totalKeystrokes + data.backspaceCount)) : 0,
        pause_freq: data.totalKeystrokes > 0
          ? round2(data.pauseCount / data.totalKeystrokes * 100) : 0,
        mouse_path: computeMousePath(data.mousePositions),
        sample_size: data.flightTimes.length,
      }

      var result = WAR.scoreProfile(profile, data)
      var duration = Math.round((Date.now() - data.sessionStartTime) / 1000)
      var minutes = duration / 60
      var wpm = minutes > 0 && data.totalKeystrokes > 0
        ? Math.round((data.totalKeystrokes / 5) / minutes) : 0

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

    reset: function () { data = createData() },

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

var JitterBox = {
  attach: attach,
  scoreProfile: WAR.scoreProfile,
  applyTimeCap: WAR.applyTimeCap,
  weightedPaste: WAR.weightedPaste,
  WAR: WAR,
}

var _testExports = {
  ksStatistic: WAR.ksStatistic, pearsonR: WAR.pearsonR, normalCDF: WAR.normalCDF,
  scoreProfile: WAR.scoreProfile, scoreCrossSignal: WAR.scoreCrossSignal,
  rampScore: WAR.rampScore,
}

if (typeof window !== 'undefined') {
  window.JitterBox = JitterBox
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = JitterBox
  module.exports.default = JitterBox
  module.exports.attach = attach
  module.exports._testExports = _testExports
}
