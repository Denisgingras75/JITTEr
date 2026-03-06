/**
 * biometrics-war.js - JitterBio adapter backed by WAR scorer
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * Drop-in replacement for biometrics.js. Same JitterBio interface,
 * powered by jitter-box.js's 9-signal WAR scorer (K-S, Pearson, ramps).
 *
 * content.js calls:
 *   JitterBio.createSession()
 *   JitterBio.handleKeydown(session, key, ctrl, meta, alt) -> 'char'|'edit'|'nav'|'skip'
 *   JitterBio.handleKeyup(session, key, ctrl, meta, alt)
 *   JitterBio.handlePaste(session, textLength)
 *   JitterBio.handleMouseMove(session, x, y)
 *   JitterBio.analyzeLoki(session) -> { cognitiveRatio, entropy, isBot, ... }
 *   JitterBio.getProfile(session) -> profile object | null
 *   JitterBio.getPurity(session) -> { purity, jitter, humanChars, alienChars }
 *
 * Direct session field access in content.js:
 *   bioSession.humanChars, bioSession.backspaceCount, bioSession.pasteCount
 */

// ── Constants (shared with original biometrics.js) ───────────────────

const MAX_FLIGHT_TIMES = 100;
const MAX_DWELL_TIMES = 100;
const MIN_FLIGHT_MS = 20;
const MAX_FLIGHT_MS = 2000;
const MIN_DWELL_MS = 10;
const MAX_DWELL_MS = 500;
const PAUSE_THRESHOLD_MS = 2000;
const FATIGUE_WINDOW_SIZE = 25;
const FATIGUE_WINDOW_COUNT = 4;
const BURST_GAP_MS = 500;
const MIN_BURST_LENGTH = 3;
const MAX_BURSTS = 50;
const MOUSE_SAMPLE_INTERVAL = 50;
const MAX_MOUSE_SAMPLES = 50;
const MIN_CHARS_FOR_SCORE = 20;
const AUTOCORRECT_TOLERANCE = 15;

const TRACKED_KEYS = ['e', 't', 'a', 'o', 'i', 'n', 's', 'r', 'h', 'l'];
const TRACKED_BIGRAMS = new Set([
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
  'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
  'st', 'to', 'nt', 'ng', 'se', 'ha', 'as', 'ou', 'io', 'le',
]);

const EDITING_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
]);

// ── WAR v2: signal ramps and weights (from jitter-box.js) ───────────

const RAMPS = {
  bigram_rhythm:    [0.08, 0.20],
  per_key:          [0.09, 0.25],
  inter_key_var:    [9, 45],
  dwell_std:        [8, 20],
  mean_dwell:       [27, 80],
  edit_ratio:       [0.03, 0.08],
  pause_freq:       [0.4, 1.5],
  purity:           [0, 1],
  ks_shape:         [0.25, 0.08],
};

const WEIGHTS = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.07, purity: 0.05,
};

// ── Math helpers ─────────────────────────────────────────────────────

function calcMean(arr) {
  if (arr.length === 0) return 0;
  var sum = 0;
  for (var i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function calcStd(arr) {
  if (arr.length < 2) return 0;
  var m = calcMean(arr);
  var variance = 0;
  for (var i = 0; i < arr.length; i++) variance += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(variance / arr.length);
}

function calcCV(arr) {
  var m = calcMean(arr);
  if (m === 0) return 0;
  return calcStd(arr) / m;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function rampScore(raw, floor, ceiling) {
  if (floor < ceiling) return clamp01((raw - floor) / (ceiling - floor));
  return clamp01((floor - raw) / (floor - ceiling));
}

// ── Statistical tests (from jitter-box.js) ───────────────────────────

function normalCDF(z) {
  if (z < -6) return 0;
  if (z > 6) return 1;
  var sign = z < 0 ? -1 : 1;
  z = Math.abs(z);
  var t = 1 / (1 + 0.2316419 * z);
  var d = 0.3989422804014327 * Math.exp(-z * z / 2);
  var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))));
  return sign === 1 ? 1 - p : p;
}

function ksStatistic(values) {
  if (values.length < 10) return 0.5;

  var logs = [];
  for (var i = 0; i < values.length; i++) {
    if (values[i] > 0) logs.push(Math.log(values[i]));
  }
  if (logs.length < 10) return 0.5;

  var mu = calcMean(logs);
  var sigma = calcStd(logs);
  if (sigma === 0) return 1.0;

  var sorted = values.slice().sort(function (a, b) { return a - b; });
  var n = sorted.length;
  var maxDiff = 0;

  for (var j = 0; j < n; j++) {
    var empirical = (j + 1) / n;
    var z = (Math.log(sorted[j]) - mu) / sigma;
    var theoretical = normalCDF(z);
    var diff = Math.abs(empirical - theoretical);
    if (diff > maxDiff) maxDiff = diff;
  }

  return round3(maxDiff);
}

function pearsonR(a, b) {
  if (a.length < 3 || a.length !== b.length) return 0;
  var ma = calcMean(a);
  var mb = calcMean(b);
  var num = 0, da = 0, db = 0;
  for (var i = 0; i < a.length; i++) {
    var ai = a[i] - ma;
    var bi = b[i] - mb;
    num += ai * bi;
    da += ai * ai;
    db += bi * bi;
  }
  var denom = Math.sqrt(da * db);
  return denom > 0 ? num / denom : 0;
}

// ── WAR scorer (from jitter-box.js) ──────────────────────────────────

function scoreCrossSignal(captureData) {
  var score = 0;
  var tests = 0;

  if (captureData.flightTimes && captureData.flightTimes.length >= 20) {
    var flights = captureData.flightTimes;
    var avgFlight = calcMean(flights);
    var pauseWarmups = 0;
    var pauseHits = 0;
    for (var i = 1; i < flights.length - 3; i++) {
      if (flights[i] > PAUSE_THRESHOLD_MS * 0.5) {
        pauseHits++;
        var nextAvg = (flights[i + 1] + flights[i + 2] + flights[i + 3]) / 3;
        if (nextAvg > avgFlight) pauseWarmups++;
      }
    }
    score += pauseHits >= 1 ? (pauseWarmups / pauseHits > 0.5 ? 1 : 0) : 0.5;
    tests++;
  }

  if (captureData.flightTimes && captureData.dwellTimes &&
      captureData.flightTimes.length >= 20 && captureData.dwellTimes.length >= 20) {
    var flightW = [];
    var dwellW = [];
    var minLen = Math.min(captureData.flightTimes.length, captureData.dwellTimes.length);
    var ws = 10;
    for (var k = 0; k + ws <= minLen; k += ws) {
      flightW.push(calcMean(captureData.flightTimes.slice(k, k + ws)));
      dwellW.push(calcMean(captureData.dwellTimes.slice(k, k + ws)));
    }
    if (flightW.length >= 3) {
      var r = pearsonR(flightW, dwellW);
      score += r > 0.3 ? 1 : r > 0 ? 0.5 : 0;
    } else {
      score += 0.5;
    }
    tests++;
  }

  if (captureData.fatigueWindows && captureData.fatigueWindows.length >= 3) {
    var fw = captureData.fatigueWindows;
    score += fw[fw.length - 1] - fw[0] > 0 ? 1 : 0;
    tests++;
  }

  return tests > 0 ? round2(score / tests) : 0.5;
}

function scoreProfile(profile, captureData) {
  if (!profile) return { war: 1.0, classification: 'verified', components: {}, flags: [] };

  var components = {};
  var flags = [];

  // 1. Bigram rhythm
  var sigs = profile.bigram_signatures || {};
  var bigramKeys = Object.keys(sigs);
  if (bigramKeys.length >= 4) {
    var bigramMeans = [];
    for (var i = 0; i < bigramKeys.length; i++) bigramMeans.push(sigs[bigramKeys[i]].mean);
    var bigramM = calcMean(bigramMeans);
    var bigramCv = bigramM > 0 ? calcStd(bigramMeans) / bigramM : 0;
    components.bigram_rhythm = rampScore(bigramCv, RAMPS.bigram_rhythm[0], RAMPS.bigram_rhythm[1]);
    if (bigramCv < 0.08) flags.push('bigram_uniform');
  } else {
    components.bigram_rhythm = 0.5;
  }

  // 2. Per-key uniqueness
  var perKeyValues = [];
  var pkd = profile.per_key_dwell || {};
  var pkKeys = Object.keys(pkd);
  for (var j = 0; j < pkKeys.length; j++) perKeyValues.push(pkd[pkKeys[j]]);
  if (perKeyValues.length >= 3) {
    var pkMean = calcMean(perKeyValues);
    var pkCv = pkMean > 0 ? calcStd(perKeyValues) / pkMean : 0;
    components.per_key = rampScore(pkCv, RAMPS.per_key[0], RAMPS.per_key[1]);
    if (pkCv < 0.09) flags.push('per_key_uniformity');
  } else {
    components.per_key = 0.5;
  }

  // 3. Cross-signal correlation
  components.cross_signal = scoreCrossSignal(captureData || {});

  // 4. Distribution shape (K-S)
  if (captureData && captureData.flightTimes && captureData.flightTimes.length >= 10) {
    var ks = ksStatistic(captureData.flightTimes);
    components.distribution_shape = rampScore(ks, RAMPS.ks_shape[0], RAMPS.ks_shape[1]);
    if (ks > 0.25) flags.push('non_lognormal');
  } else {
    components.distribution_shape = 0.5;
  }

  // 5. Inter-key variance
  if (profile.std_inter_key != null) {
    components.inter_key_var = rampScore(profile.std_inter_key, RAMPS.inter_key_var[0], RAMPS.inter_key_var[1]);
    if (profile.std_inter_key < 9) flags.push('variance_floor');
  } else {
    components.inter_key_var = 0.5;
  }

  // 6. Dwell std
  if (profile.std_dwell != null) {
    components.dwell_std = rampScore(profile.std_dwell, RAMPS.dwell_std[0], RAMPS.dwell_std[1]);
    if (profile.std_dwell < 8) flags.push('dwell_std_hard');
  } else {
    components.dwell_std = 0.5;
  }

  // 7. Mean dwell
  if (profile.mean_dwell != null) {
    components.mean_dwell = rampScore(profile.mean_dwell, RAMPS.mean_dwell[0], RAMPS.mean_dwell[1]);
    if (profile.mean_dwell < 27) flags.push('dwell_floor');
  } else {
    components.mean_dwell = 0.5;
  }

  // 8. Editing behavior
  var editSub = profile.edit_ratio != null
    ? rampScore(profile.edit_ratio, RAMPS.edit_ratio[0], RAMPS.edit_ratio[1]) : 0.5;
  var pauseSub = profile.pause_freq != null
    ? rampScore(profile.pause_freq, RAMPS.pause_freq[0], RAMPS.pause_freq[1]) : 0.5;
  components.editing = (editSub + pauseSub) / 2;
  if (profile.edit_ratio != null && profile.pause_freq != null &&
      profile.edit_ratio < 0.03 && profile.pause_freq < 0.4) {
    flags.push('no_editing_behavior');
  }

  // 9. Purity
  var total = (captureData && (captureData.humanChars + captureData.alienChars)) || 0;
  if (total >= MIN_CHARS_FOR_SCORE && captureData) {
    components.purity = rampScore(captureData.humanChars / total, RAMPS.purity[0], RAMPS.purity[1]);
  } else {
    components.purity = 0.5;
  }

  // Weighted sum
  var war = 0;
  var weightKeys = Object.keys(WEIGHTS);
  for (var w = 0; w < weightKeys.length; w++) {
    var wk = weightKeys[w];
    var comp = wk === 'distribution' ? 'distribution_shape' : wk;
    war += WEIGHTS[wk] * (components[comp] != null ? components[comp] : 0.5);
  }
  war = round2(war);

  var classification;
  if (war >= 0.80) classification = 'verified';
  else if (war >= 0.50) classification = 'suspicious';
  else classification = 'bot';

  return { war: war, classification: classification, components: components, flags: flags };
}

// ── Session object (same shape as original biometrics.js) ────────────

function createSession() {
  return {
    flightTimes: [],
    dwellTimes: [],
    ddTimes: [],
    flowIntervals: [],
    gapIntervals: [],
    bigramTimings: {},
    perKeyDwells: {},
    fatigueWindows: [],
    bursts: [],
    currentBurst: 0,
    humanChars: 0,
    alienChars: 0,
    totalKeystrokes: 0,
    backspaceCount: 0,
    pauseCount: 0,
    pasteCount: 0,
    pastedChars: 0,
    cursorJumps: 0,
    backwardEdits: 0,
    maxCursorPos: 0,
    mousePositions: [],
    lastMouseSampleTime: 0,
    lastKeyTime: 0,
    lastKeyDownTime: 0,
    lastKeyChar: '',
    keyDownTimes: {},
    sessionStartTime: Date.now(),
  };
}

// ── Event handlers (identical to original biometrics.js) ─────────────

function handleKeydown(session, key, ctrlKey, metaKey, altKey) {
  var now = performance.now();
  if (ctrlKey || metaKey || altKey) return;

  if (key === 'Backspace' || key === 'Delete') {
    session.backspaceCount++;
    return 'edit';
  }

  if (EDITING_KEYS.has(key)) return 'nav';
  if (key.length !== 1) return 'skip';

  session.humanChars++;
  session.totalKeystrokes++;

  var keyLower = key.toLowerCase();
  session.keyDownTimes[keyLower] = now;

  // DD time
  if (session.lastKeyDownTime > 0) {
    var dd = now - session.lastKeyDownTime;
    if (dd >= MIN_FLIGHT_MS && dd <= MAX_FLIGHT_MS) {
      session.ddTimes.push(dd);
      if (session.ddTimes.length > MAX_FLIGHT_TIMES) session.ddTimes.shift();
    }
  }
  session.lastKeyDownTime = now;

  // Flight time + pauses
  if (session.lastKeyTime > 0) {
    var rawFlight = now - session.lastKeyTime;

    if (rawFlight > PAUSE_THRESHOLD_MS) {
      session.pauseCount++;
    }

    if (rawFlight >= MIN_FLIGHT_MS && rawFlight <= MAX_FLIGHT_MS) {
      session.flightTimes.push(rawFlight);
      if (session.flightTimes.length > MAX_FLIGHT_TIMES) session.flightTimes.shift();

      // Bigram timing
      if (session.lastKeyChar) {
        var bigram = session.lastKeyChar + keyLower;
        if (TRACKED_BIGRAMS.has(bigram)) {
          if (!session.bigramTimings[bigram]) session.bigramTimings[bigram] = [];
          session.bigramTimings[bigram].push(rawFlight);
        }
      }

      // Fatigue windows
      if (session.totalKeystrokes > 0 && session.totalKeystrokes % FATIGUE_WINDOW_SIZE === 0) {
        var recent = session.flightTimes.slice(-FATIGUE_WINDOW_SIZE);
        session.fatigueWindows.push(round2(calcMean(recent)));
        if (session.fatigueWindows.length > FATIGUE_WINDOW_COUNT) session.fatigueWindows.shift();
      }
    }

    // Loki flow/gap distinction (kept for backward compat)
    var isGap = /[\s\.\,\;\:\!\?]/.test(session.lastKeyChar);
    if (rawFlight < 2000) {
      if (isGap) {
        session.gapIntervals.push(rawFlight);
        if (session.gapIntervals.length > 20) session.gapIntervals.shift();
      } else {
        session.flowIntervals.push(rawFlight);
        if (session.flowIntervals.length > 50) session.flowIntervals.shift();
      }
    }

    // Burst tracking
    if (rawFlight > BURST_GAP_MS) {
      if (session.currentBurst >= MIN_BURST_LENGTH) {
        session.bursts.push(session.currentBurst);
        if (session.bursts.length > MAX_BURSTS) session.bursts.shift();
      }
      session.currentBurst = 1;
    } else {
      session.currentBurst++;
    }
  } else {
    session.currentBurst = 1;
  }

  session.lastKeyTime = now;
  session.lastKeyChar = keyLower;

  return 'char';
}

function handleKeyup(session, key, ctrlKey, metaKey, altKey) {
  var now = performance.now();
  if (ctrlKey || metaKey || altKey) return;
  if (EDITING_KEYS.has(key)) return;
  if (key.length !== 1) return;

  var keyLower = key.toLowerCase();
  var downTime = session.keyDownTimes[keyLower];

  if (downTime) {
    var dwell = now - downTime;
    if (dwell >= MIN_DWELL_MS && dwell <= MAX_DWELL_MS) {
      session.dwellTimes.push(dwell);
      if (session.dwellTimes.length > MAX_DWELL_TIMES) session.dwellTimes.shift();

      if (TRACKED_KEYS.indexOf(keyLower) !== -1) {
        if (!session.perKeyDwells[keyLower]) session.perKeyDwells[keyLower] = [];
        session.perKeyDwells[keyLower].push(dwell);
        if (session.perKeyDwells[keyLower].length > 50) session.perKeyDwells[keyLower].shift();
      }
    }
    delete session.keyDownTimes[keyLower];
  }
}

function handlePaste(session, textLength) {
  session.pasteCount++;
  session.pastedChars += textLength;
  session.alienChars += textLength;
}

function handleMouseMove(session, x, y) {
  var now = performance.now();
  if (now - session.lastMouseSampleTime < MOUSE_SAMPLE_INTERVAL) return;
  session.lastMouseSampleTime = now;
  session.mousePositions.push({ x: x, y: y, t: now });
  if (session.mousePositions.length > MAX_MOUSE_SAMPLES) session.mousePositions.shift();
}

function handleCursorMove(session, cursorPos) {
  if (cursorPos < session.maxCursorPos) {
    session.backwardEdits++;
    session.cursorJumps++;
  }
  if (cursorPos > session.maxCursorPos) {
    session.maxCursorPos = cursorPos;
  }
}

// ── Mouse path ───────────────────────────────────────────────────────

function computeMousePath(positions) {
  if (positions.length < 5) return null;

  var totalDist = 0;
  for (var i = 1; i < positions.length; i++) {
    var dx = positions[i].x - positions[i - 1].x;
    var dy = positions[i].y - positions[i - 1].y;
    totalDist += Math.sqrt(dx * dx + dy * dy);
  }

  var first = positions[0];
  var last = positions[positions.length - 1];
  var straightDist = Math.sqrt(
    (last.x - first.x) * (last.x - first.x) +
    (last.y - first.y) * (last.y - first.y)
  );

  var linearity = totalDist > 0 ? round3(straightDist / totalDist) : 1;
  var totalTime = (last.t - first.t) / 1000;
  var avgSpeed = totalTime > 0 ? Math.round(totalDist / totalTime) : 0;

  return { linearity: linearity, avgSpeed: avgSpeed };
}

// ── analyzeLoki — WAR-backed replacement ─────────────────────────────
// Returns same shape as original for backward compatibility.
// isBot now means WAR < 0.50 (was: 3 simple threshold checks).
// entropy mapped from WAR score (0-100 scale).

function analyzeLoki(session) {
  if (session.flowIntervals.length < 10) {
    return {
      cognitiveRatio: 0, entropy: 100, isBot: false, stdDev: 0,
      transcriptionFlag: false, suspiciousFatigue: false, noDwellVariance: false,
      war: null, warClassification: null, warComponents: null, warFlags: null,
    };
  }

  var avgFlow = calcMean(session.flowIntervals);
  var avgGap = session.gapIntervals.length > 0 ? calcMean(session.gapIntervals) : avgFlow;
  var cognitiveRatio = avgGap / avgFlow;
  var stdDev = calcStd(session.flowIntervals);

  // Build profile for WAR scorer
  var profile = buildProfile(session);
  var warResult = scoreProfile(profile, session);

  // Map WAR to legacy fields
  var isBot = warResult.classification === 'bot';
  var entropy = isBot ? 0 : Math.min(Math.round(warResult.war * 100), 100);

  // Informational signals (kept from original)
  var totalEdits = session.humanChars + session.backwardEdits;
  var editLin = totalEdits > 0 ? (1 - session.backwardEdits / totalEdits) : 1;
  var transcriptionFlag = session.bursts.length > 5 &&
    calcCV(session.bursts) < 0.15 &&
    editLin > 0.95 &&
    session.humanChars > 500;

  var suspiciousFatigue = session.fatigueWindows.length === FATIGUE_WINDOW_COUNT &&
    session.fatigueWindows.every(function (w, i, arr) {
      return i === 0 || Math.abs(w - arr[i - 1]) < 0.5;
    });

  var noDwellVariance = session.dwellTimes.length > 50 && calcStd(session.dwellTimes) < 5;

  return {
    // Legacy fields (backward compat)
    cognitiveRatio: round2(cognitiveRatio),
    entropy: entropy,
    isBot: isBot,
    stdDev: round2(stdDev),
    transcriptionFlag: transcriptionFlag,
    suspiciousFatigue: suspiciousFatigue,
    noDwellVariance: noDwellVariance,
    // WAR fields (new)
    war: warResult.war,
    warClassification: warResult.classification,
    warComponents: warResult.components,
    warFlags: warResult.flags,
  };
}

// ── Internal profile builder ─────────────────────────────────────────

function buildProfile(session) {
  if (session.flightTimes.length < 10) return null;

  var perKeyDwell = {};
  for (var i = 0; i < TRACKED_KEYS.length; i++) {
    var k = TRACKED_KEYS[i];
    var times = session.perKeyDwells[k];
    if (times && times.length >= 2) {
      perKeyDwell[k] = round2(calcMean(times));
    }
  }

  var bigramSignatures = {};
  var bigramKeys = Object.keys(session.bigramTimings);
  for (var j = 0; j < bigramKeys.length; j++) {
    var bg = bigramKeys[j];
    var timings = session.bigramTimings[bg];
    if (timings.length >= 2) {
      bigramSignatures[bg] = {
        mean: round2(calcMean(timings)),
        std: round2(calcStd(timings)),
        n: timings.length,
      };
    }
  }

  var editRatio = session.totalKeystrokes > 0
    ? round3(session.backspaceCount / (session.totalKeystrokes + session.backspaceCount))
    : 0;

  var pauseFreq = session.totalKeystrokes > 0
    ? round2((session.pauseCount / session.totalKeystrokes) * 100)
    : 0;

  var avgBurstLength = session.bursts.length > 0 ? round2(calcMean(session.bursts)) : 0;
  var burstVariance = session.bursts.length > 2 ? round2(calcCV(session.bursts)) : 0;

  var totalEdits = session.humanChars + session.backwardEdits;
  var editingLinearity = totalEdits > 0
    ? round2(1 - (session.backwardEdits / totalEdits))
    : 1;

  var mousePath = computeMousePath(session.mousePositions);

  return {
    total_keystrokes: session.totalKeystrokes,
    mean_inter_key: round2(calcMean(session.flightTimes)),
    std_inter_key: round2(calcStd(session.flightTimes)),
    mean_dwell: session.dwellTimes.length > 0 ? round2(calcMean(session.dwellTimes)) : null,
    std_dwell: session.dwellTimes.length > 1 ? round2(calcStd(session.dwellTimes)) : null,
    mean_dd_time: session.ddTimes.length > 0 ? round2(calcMean(session.ddTimes)) : null,
    std_dd_time: session.ddTimes.length > 1 ? round2(calcStd(session.ddTimes)) : null,
    per_key_dwell: perKeyDwell,
    bigram_signatures: bigramSignatures,
    edit_ratio: editRatio,
    pause_count: session.pauseCount,
    pause_freq: pauseFreq,
    burst_count: session.bursts.length,
    avg_burst_length: avgBurstLength,
    burst_variance: burstVariance,
    cursor_jumps: session.cursorJumps,
    backward_edits: session.backwardEdits,
    editing_linearity: editingLinearity,
    fatigue_windows: session.fatigueWindows.slice(),
    mouse_path: mousePath,
    sample_size: session.flightTimes.length,
  };
}

// ── getProfile — now includes WAR score ──────────────────────────────

function getProfile(session) {
  var profile = buildProfile(session);
  if (!profile) return null;

  // Run WAR scorer and attach results
  var warResult = scoreProfile(profile, session);
  profile.war = warResult.war;
  profile.war_classification = warResult.classification;
  profile.war_components = warResult.components;
  profile.war_flags = warResult.flags;

  // Legacy Loki fields for backward compat
  var avgFlow = calcMean(session.flowIntervals);
  var avgGap = session.gapIntervals.length > 0 ? calcMean(session.gapIntervals) : avgFlow;
  profile.cognitive_ratio = round2(avgGap / avgFlow);
  profile.entropy = warResult.classification === 'bot' ? 0 : Math.min(Math.round(warResult.war * 100), 100);
  profile.is_bot = warResult.classification === 'bot';

  return profile;
}

// ── getPurity — WAR-backed ───────────────────────────────────────────

function getPurity(session) {
  var total = session.humanChars + session.alienChars;
  if (total < 20) return { purity: null, jitter: null, humanChars: session.humanChars, alienChars: session.alienChars };

  var profile = buildProfile(session);
  var warResult = scoreProfile(profile, session);
  var isBot = warResult.classification === 'bot';

  var purity = isBot ? 0 : round2((session.humanChars / total) * 100);
  var jitter = session.flightTimes.length >= 5 ? round2(calcStd(session.flightTimes)) : null;

  return {
    purity: purity,
    jitter: jitter,
    humanChars: session.humanChars,
    alienChars: session.alienChars,
    war: warResult.war,
    warClassification: warResult.classification,
  };
}

// ── Exports ──────────────────────────────────────────────────────────

if (typeof window !== 'undefined' && typeof module === 'undefined') {
  window.JitterBio = {
    createSession: createSession,
    handleKeydown: handleKeydown,
    handleKeyup: handleKeyup,
    handlePaste: handlePaste,
    handleMouseMove: handleMouseMove,
    handleCursorMove: handleCursorMove,
    analyzeLoki: analyzeLoki,
    getProfile: getProfile,
    getPurity: getPurity,
    EDITING_KEYS: EDITING_KEYS,
    TRACKED_KEYS: TRACKED_KEYS,
    TRACKED_BIGRAMS: TRACKED_BIGRAMS,
    calcMean: calcMean,
    calcStd: calcStd,
    calcCV: calcCV,
    round2: round2,
    round3: round3,
    // WAR internals (exposed for testing/debugging)
    scoreProfile: scoreProfile,
    ksStatistic: ksStatistic,
    pearsonR: pearsonR,
    RAMPS: RAMPS,
    WEIGHTS: WEIGHTS,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createSession: createSession,
    handleKeydown: handleKeydown,
    handleKeyup: handleKeyup,
    handlePaste: handlePaste,
    handleMouseMove: handleMouseMove,
    handleCursorMove: handleCursorMove,
    analyzeLoki: analyzeLoki,
    getProfile: getProfile,
    getPurity: getPurity,
    EDITING_KEYS: EDITING_KEYS,
    TRACKED_KEYS: TRACKED_KEYS,
    TRACKED_BIGRAMS: TRACKED_BIGRAMS,
    calcMean: calcMean,
    calcStd: calcStd,
    calcCV: calcCV,
    round2: round2,
    round3: round3,
    scoreProfile: scoreProfile,
    ksStatistic: ksStatistic,
    pearsonR: pearsonR,
    RAMPS: RAMPS,
    WEIGHTS: WEIGHTS,
  };
}
