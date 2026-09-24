/**
 * biometrics.js - JITTER Shared Biometric Engine
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * Biometric CAPTURE for the Chrome extension (keystroke timing, paste lengths,
 * mouse path, the Loki flow/gap gate) plus getProfile(). Used by:
 * - content.js (Chrome extension content script)
 * - writer.js (Chrome extension writer)
 *
 * The WAR SCORING MATH is not here: scoreWAR() and applyTimeCap() delegate to
 * src/war-score.js (the canonical engine, shared byte-for-byte with the SDK
 * bundle and the lab). manifest.json and writer.html load war-score.js first.
 */

// --- CONSTANTS ---
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

// --- MATH HELPERS ---
function calcMean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calcStd(arr) {
  if (arr.length < 2) return 0;
  const mean = calcMean(arr);
  const variance = arr.reduce((sum, t) => sum + (t - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function calcCV(arr) {
  const mean = calcMean(arr);
  if (mean === 0) return 0;
  return calcStd(arr) / mean;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round3(n) { return Math.round(n * 1000) / 1000; }
// rampScore, normalCDF, ksStatistic and pearsonR live in war-score.js (JitterWAR).

// --- BIOMETRIC SESSION ---
function createSession() {
  return {
    // Timing
    flightTimes: [],
    dwellTimes: [],
    ddTimes: [],
    // Loki (flow/gap distinction)
    flowIntervals: [],
    gapIntervals: [],
    // Fingerprint
    bigramTimings: {},
    perKeyDwells: {},
    // Fatigue
    fatigueWindows: [],
    // Bursts
    bursts: [],
    currentBurst: 0,
    // Counts
    humanChars: 0,
    alienChars: 0,
    totalKeystrokes: 0,
    backspaceCount: 0,
    pauseCount: 0,
    pasteCount: 0,
    pastedChars: 0,
    pasteLengths: [],   // one entry per paste event: its length, never its text
    // Cursor (writer mode only)
    cursorJumps: 0,
    backwardEdits: 0,
    maxCursorPos: 0,
    // Mouse
    mousePositions: [],
    lastMouseSampleTime: 0,
    // Tracking state
    lastKeyTime: 0,
    lastKeyDownTime: 0,
    lastKeyChar: '',
    keyDownTimes: {},
    sessionStartTime: Date.now(),
  };
}

// --- KEYDOWN HANDLER ---
function handleKeydown(session, key, ctrlKey, metaKey, altKey) {
  const now = performance.now();
  if (ctrlKey || metaKey || altKey) return;

  if (key === 'Backspace' || key === 'Delete') {
    session.backspaceCount++;
    return 'edit';
  }

  if (EDITING_KEYS.has(key)) return 'nav';
  if (key.length !== 1) return 'skip';

  session.humanChars++;
  session.totalKeystrokes++;

  const keyLower = key.toLowerCase();
  session.keyDownTimes[keyLower] = now;

  // DD time
  if (session.lastKeyDownTime > 0) {
    const dd = now - session.lastKeyDownTime;
    if (dd >= MIN_FLIGHT_MS && dd <= MAX_FLIGHT_MS) {
      session.ddTimes.push(dd);
      if (session.ddTimes.length > MAX_FLIGHT_TIMES) session.ddTimes.shift();
    }
  }
  session.lastKeyDownTime = now;

  // Flight time + pauses
  if (session.lastKeyTime > 0) {
    const rawFlight = now - session.lastKeyTime;

    if (rawFlight > PAUSE_THRESHOLD_MS) {
      session.pauseCount++;
    }

    if (rawFlight >= MIN_FLIGHT_MS && rawFlight <= MAX_FLIGHT_MS) {
      session.flightTimes.push(rawFlight);
      if (session.flightTimes.length > MAX_FLIGHT_TIMES) session.flightTimes.shift();

      // Bigram timing
      if (session.lastKeyChar) {
        const bigram = session.lastKeyChar + keyLower;
        if (TRACKED_BIGRAMS.has(bigram)) {
          if (!session.bigramTimings[bigram]) session.bigramTimings[bigram] = [];
          session.bigramTimings[bigram].push(rawFlight);
        }
      }

      // Fatigue windows
      if (session.totalKeystrokes > 0 && session.totalKeystrokes % FATIGUE_WINDOW_SIZE === 0) {
        const recent = session.flightTimes.slice(-FATIGUE_WINDOW_SIZE);
        session.fatigueWindows.push(round2(calcMean(recent)));
        if (session.fatigueWindows.length > FATIGUE_WINDOW_COUNT) session.fatigueWindows.shift();
      }
    }

    // Loki flow/gap distinction
    const isGap = /[\s\.\,\;\:\!\?]/.test(session.lastKeyChar);
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
      // End previous burst if long enough
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

// --- KEYUP HANDLER ---
function handleKeyup(session, key, ctrlKey, metaKey, altKey) {
  const now = performance.now();
  if (ctrlKey || metaKey || altKey) return;
  if (EDITING_KEYS.has(key)) return;
  if (key.length !== 1) return;

  const keyLower = key.toLowerCase();
  const downTime = session.keyDownTimes[keyLower];

  if (downTime) {
    const dwell = now - downTime;
    if (dwell >= MIN_DWELL_MS && dwell <= MAX_DWELL_MS) {
      session.dwellTimes.push(dwell);
      if (session.dwellTimes.length > MAX_DWELL_TIMES) session.dwellTimes.shift();

      if (TRACKED_KEYS.includes(keyLower)) {
        if (!session.perKeyDwells[keyLower]) session.perKeyDwells[keyLower] = [];
        session.perKeyDwells[keyLower].push(dwell);
        if (session.perKeyDwells[keyLower].length > 50) session.perKeyDwells[keyLower].shift();
      }
    }
    delete session.keyDownTimes[keyLower];
  }
}

// --- PASTE HANDLER ---
// Records the LENGTH of each paste, never the text. The engine weights every
// event by its length (< 50 chars 0.1x, 50-300 0.3x, > 300 1.0x) inside the
// purity signal: paste is transparent, not punished (Hard Rule #5).
function handlePaste(session, textLength) {
  const len = typeof textLength === 'number' && isFinite(textLength) ? Math.round(textLength) : 0;
  if (len <= 0) return;
  session.pasteCount++;
  session.pastedChars += len;
  session.alienChars += len;
  if (!session.pasteLengths) session.pasteLengths = [];
  session.pasteLengths.push(len);
}

// --- MOUSE HANDLER ---
function handleMouseMove(session, x, y) {
  const now = performance.now();
  if (now - session.lastMouseSampleTime < MOUSE_SAMPLE_INTERVAL) return;
  session.lastMouseSampleTime = now;
  session.mousePositions.push({ x, y, t: now });
  if (session.mousePositions.length > MAX_MOUSE_SAMPLES) session.mousePositions.shift();
}

// --- CURSOR TRACKING (writer mode) ---
function handleCursorMove(session, cursorPos) {
  if (cursorPos < session.maxCursorPos) {
    session.backwardEdits++;
    session.cursorJumps++;
  }
  if (cursorPos > session.maxCursorPos) {
    session.maxCursorPos = cursorPos;
  }
}

// --- LOKI ANALYSIS ---
function analyzeLoki(session) {
  if (session.flowIntervals.length < 10) {
    return { cognitiveRatio: 0, entropy: 100, isBot: false, stdDev: 0, transcriptionFlag: false, suspiciousFatigue: false, noDwellVariance: false };
  }

  const avgFlow = calcMean(session.flowIntervals);
  const avgGap = session.gapIntervals.length > 0 ? calcMean(session.gapIntervals) : avgFlow;
  const cognitiveRatio = avgGap / avgFlow;
  const stdDev = calcStd(session.flowIntervals);

  const botRhythm = stdDev < 8;
  const botSpeed = avgFlow < 35;
  const botLinearity = (cognitiveRatio < 1.2 && session.humanChars > 200);

  const isBot = botRhythm || botSpeed || botLinearity;
  const entropy = isBot ? 0 : Math.min(Math.round(stdDev + (cognitiveRatio * 10)), 100);

  // --- NEW SIGNALS (informational — not bot flags) ---

  // Transcription flag: consistent bursts + pure forward typing + long session
  const totalEdits = session.humanChars + session.backwardEdits;
  const editLin = totalEdits > 0 ? (1 - session.backwardEdits / totalEdits) : 1;
  const transcriptionFlag = session.bursts.length > 5 &&
    calcCV(session.bursts) < 0.15 &&
    editLin > 0.95 &&
    session.humanChars > 500;

  // Suspicious fatigue: typing speed doesn't change across windows (flat = robotic)
  const suspiciousFatigue = session.fatigueWindows.length === FATIGUE_WINDOW_COUNT &&
    session.fatigueWindows.every((w, i, arr) =>
      i === 0 || Math.abs(w - arr[i - 1]) < 0.5
    );

  // No dwell variance: key hold duration is unnaturally consistent
  const noDwellVariance = session.dwellTimes.length > 50 && calcStd(session.dwellTimes) < 5;

  return {
    cognitiveRatio: round2(cognitiveRatio),
    entropy,
    isBot,
    stdDev: round2(stdDev),
    transcriptionFlag,
    suspiciousFatigue,
    noDwellVariance,
  };
}

// --- WAR SCORER ---
// The scoring math lives in war-score.js: the canonical engine shared with the
// SDK bundle and the lab (JITTER-PLAN.md "WAR Formula"). Load src/war-score.js
// before this file; manifest.json and writer.html both do, Node require()s it.
const WarEngine = (function resolveWarEngine() {
  if (typeof JitterWAR !== 'undefined' && JitterWAR) return JitterWAR;
  if (typeof window !== 'undefined' && window.JitterWAR) return window.JitterWAR;
  if (typeof require === 'function') return require('./war-score.js');
  throw new Error('JitterBio: src/war-score.js must be loaded before src/biometrics.js');
})();

function scoreCrossSignal(session) {
  return WarEngine.scoreCrossSignal(session);
}

// scoreWAR(session, profile): `session` is createSession() data (timing arrays,
// character counts, paste lengths), `profile` is getProfile(session).
// Returns { war, raw_war, tier, classification, components, flags, timeCap, paste }.
// Fewer than 10 flight times, or no profile, gives war null / 'insufficient_data'.
function scoreWAR(session, profile) {
  return WarEngine.scoreProfile(profile, session || {});
}

// Time confidence cap — the economic thesis in code. Step table by account age
// (< 1 day 0.35, 1-7 0.50, 7-30 0.65, 30-90 0.80, 90-180 0.92, 180+ 1.00).
// Caps `war` (after penalties); `raw_war` stays the pre-penalty score.
// Never throws on a missing or NaN firstSeen (both count as day 0).
function applyTimeCap(warResult, firstSeenMs) {
  return WarEngine.applyTimeCap(warResult, firstSeenMs);
}

// --- FULL BIOMETRIC PROFILE ---
function getProfile(session) {
  const loki = analyzeLoki(session);
  const { flightTimes, dwellTimes, ddTimes, totalKeystrokes, bursts } = session;

  if (flightTimes.length < 10) return null;

  // Per-key dwell averages
  const perKeyDwell = {};
  for (const key of TRACKED_KEYS) {
    const times = session.perKeyDwells[key];
    if (times && times.length >= 2) {
      perKeyDwell[key] = round2(calcMean(times));
    }
  }

  // Bigram signatures
  const bigramSignatures = {};
  for (const bigram of Object.keys(session.bigramTimings)) {
    const timings = session.bigramTimings[bigram];
    if (timings.length >= 2) {
      bigramSignatures[bigram] = {
        mean: round2(calcMean(timings)),
        std: round2(calcStd(timings)),
        n: timings.length,
      };
    }
  }

  // Edit ratio
  const editRatio = totalKeystrokes > 0
    ? round3(session.backspaceCount / (totalKeystrokes + session.backspaceCount))
    : 0;

  // Pause frequency
  const pauseFreq = totalKeystrokes > 0
    ? round2((session.pauseCount / totalKeystrokes) * 100)
    : 0;

  // Burst analysis
  const avgBurstLength = bursts.length > 0 ? round2(calcMean(bursts)) : 0;
  const burstVariance = bursts.length > 2 ? round2(calcCV(bursts)) : 0;

  // Editing linearity (writer mode — 1.0 = pure forward, 0.0 = constant revision)
  const totalEdits = session.humanChars + session.backwardEdits;
  const editingLinearity = totalEdits > 0
    ? round2(1 - (session.backwardEdits / totalEdits))
    : 1;

  // Mouse path
  const mousePath = computeMousePath(session.mousePositions);

  return {
    // Loki
    cognitive_ratio: loki.cognitiveRatio,
    entropy: loki.entropy,
    is_bot: loki.isBot,
    // Timing
    mean_inter_key: round2(calcMean(flightTimes)),
    std_inter_key: round2(calcStd(flightTimes)),
    mean_dwell: dwellTimes.length > 0 ? round2(calcMean(dwellTimes)) : null,
    std_dwell: dwellTimes.length > 1 ? round2(calcStd(dwellTimes)) : null,
    mean_dd_time: ddTimes.length > 0 ? round2(calcMean(ddTimes)) : null,
    std_dd_time: ddTimes.length > 1 ? round2(calcStd(ddTimes)) : null,
    // Fingerprint
    per_key_dwell: perKeyDwell,
    bigram_signatures: bigramSignatures,
    // Composition
    edit_ratio: editRatio,
    pause_count: session.pauseCount,
    pause_freq: pauseFreq,
    // Bursts
    burst_count: bursts.length,
    avg_burst_length: avgBurstLength,
    burst_variance: burstVariance,
    // Cursor
    cursor_jumps: session.cursorJumps,
    backward_edits: session.backwardEdits,
    editing_linearity: editingLinearity,
    // Fatigue
    fatigue_windows: session.fatigueWindows.slice(),
    // Mouse
    mouse_path: mousePath,
    // Counts
    total_keystrokes: totalKeystrokes,
    sample_size: flightTimes.length,
  };
}

// --- PURITY ---
function getPurity(session) {
  const total = session.humanChars + session.alienChars;
  if (total < 20) return { purity: null, jitter: null, humanChars: session.humanChars, alienChars: session.alienChars };

  const loki = analyzeLoki(session);
  const purity = loki.isBot ? 0 : round2((session.humanChars / total) * 100);
  const jitter = session.flightTimes.length >= 5 ? round2(calcStd(session.flightTimes)) : null;

  return { purity, jitter, humanChars: session.humanChars, alienChars: session.alienChars };
}

// --- MOUSE PATH ---
function computeMousePath(positions) {
  if (positions.length < 5) return null;

  let totalDist = 0;
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x;
    const dy = positions[i].y - positions[i - 1].y;
    totalDist += Math.sqrt(dx * dx + dy * dy);
  }

  const first = positions[0];
  const last = positions[positions.length - 1];
  const straightDist = Math.sqrt(
    (last.x - first.x) ** 2 + (last.y - first.y) ** 2
  );

  const linearity = totalDist > 0 ? round3(straightDist / totalDist) : 1;
  const totalTime = (last.t - first.t) / 1000;
  const avgSpeed = totalTime > 0 ? Math.round(totalDist / totalTime) : 0;

  return { linearity, avgSpeed };
}

// --- EXPORTS ---
const _exports = {
  createSession, handleKeydown, handleKeyup, handlePaste,
  handleMouseMove, handleCursorMove, analyzeLoki, getProfile,
  getPurity, scoreWAR, applyTimeCap, scoreCrossSignal,
  // Engine tables and helpers, re-exported from war-score.js (not copies)
  ksStatistic: WarEngine.ksStatistic, pearsonR: WarEngine.pearsonR,
  weightedPaste: WarEngine.weightedPaste,
  WAR_TIERS: WarEngine.WAR_TIERS, WAR_WEIGHTS: WarEngine.WAR_WEIGHTS, WAR_RAMPS: WarEngine.WAR_RAMPS,
  HARD_FLOORS: WarEngine.HARD_FLOORS, PENALTIES: WarEngine.PENALTIES,
  WAR: WarEngine,
  EDITING_KEYS, TRACKED_KEYS, TRACKED_BIGRAMS,
  calcMean, calcStd, calcCV, round2, round3,
};

// For Chrome extension (non-module script): attach to window
if (typeof window !== 'undefined' && typeof module === 'undefined') {
  window.JitterBio = _exports;
}

// For ES module (WGH / Node):
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _exports;
}
