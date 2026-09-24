/**
 * biometrics.js - JITTER Shared Biometric Engine
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * Extracts biometric capture logic into a shared module used by:
 * - content.js (Chrome extension content script)
 * - writer.js (Chrome extension writer)
 * - usePurityTracker.js (WGH React hook)
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
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function rampScore(raw, floor, ceiling) {
  if (floor < ceiling) return clamp01((raw - floor) / (ceiling - floor));
  return clamp01((floor - raw) / (floor - ceiling));
}

// Standard normal CDF (Abramowitz & Stegun)
function normalCDF(z) {
  if (z < -6) return 0;
  if (z > 6) return 1;
  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))));
  return sign === 1 ? 1 - p : p;
}

// K-S test: compare flight times to log-normal distribution
function ksStatistic(values) {
  if (values.length < 10) return 0.5;
  const logs = values.filter(v => v > 0).map(v => Math.log(v));
  if (logs.length < 10) return 0.5;
  const mu = calcMean(logs);
  const sigma = calcStd(logs);
  if (sigma === 0) return 1.0;
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  let maxDiff = 0;
  for (let j = 0; j < n; j++) {
    const empirical = (j + 1) / n;
    const z = (Math.log(sorted[j]) - mu) / sigma;
    const diff = Math.abs(empirical - normalCDF(z));
    if (diff > maxDiff) maxDiff = diff;
  }
  return round3(maxDiff);
}

// Pearson correlation
function pearsonR(a, b) {
  if (a.length < 3 || a.length !== b.length) return 0;
  const ma = calcMean(a), mb = calcMean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] - ma, bi = b[i] - mb;
    num += ai * bi;
    da += ai * ai;
    db += bi * bi;
  }
  const denom = Math.sqrt(da * db);
  return denom > 0 ? num / denom : 0;
}

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
function handlePaste(session, textLength) {
  session.pasteCount++;
  session.pastedChars += textLength;
  session.alienChars += textLength;
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

// --- WAR SCORER (9-signal weighted composite) ---
const WAR_RAMPS = {
  bigram_rhythm: [0.08, 0.20],
  per_key:       [0.09, 0.25],
  inter_key_var: [9, 45],
  dwell_std:     [8, 20],
  mean_dwell:    [27, 80],
  edit_ratio:    [0.03, 0.08],
  pause_freq:    [0.4, 1.5],
  purity:        [0, 1],
  ks_shape:         [0.25, 0.08],
  dwell_uniformity: [0.09, 0.25],
};
const WAR_WEIGHTS = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.05,
  dwell_uniformity: 0.04, purity: 0.03,
};
const WAR_TIERS = [
  [0.80, 'Hall of Fame'],
  [0.60, 'All-Star'],
  [0.40, 'Solid'],
  [0.20, 'Rookie'],
  [0,    'Suspicious'],
];

function scoreCrossSignal(session) {
  let score = 0, tests = 0;

  // Sub-test 1: pause-warmup — after a gap, next keystrokes are slower
  if (session.flightTimes.length >= 20) {
    const flights = session.flightTimes;
    const avgFlight = calcMean(flights);
    let pauseHits = 0, pauseWarmups = 0;
    for (let i = 1; i < flights.length - 3; i++) {
      if (flights[i] > PAUSE_THRESHOLD_MS * 0.5) {
        pauseHits++;
        const nextAvg = (flights[i+1] + flights[i+2] + flights[i+3]) / 3;
        if (nextAvg > avgFlight) pauseWarmups++;
      }
    }
    score += pauseHits >= 1 ? (pauseWarmups / pauseHits > 0.5 ? 1 : 0) : 0.5;
    tests++;
  }

  // Sub-test 2: flow coupling — inter-key speed correlates with dwell
  if (session.flightTimes.length >= 20 && session.dwellTimes.length >= 20) {
    const flightW = [], dwellW = [];
    const minLen = Math.min(session.flightTimes.length, session.dwellTimes.length);
    const ws = 10;
    for (let k = 0; k + ws <= minLen; k += ws) {
      flightW.push(calcMean(session.flightTimes.slice(k, k + ws)));
      dwellW.push(calcMean(session.dwellTimes.slice(k, k + ws)));
    }
    if (flightW.length >= 3) {
      const r = pearsonR(flightW, dwellW);
      score += r > 0.3 ? 1 : r > 0 ? 0.5 : 0;
    } else {
      score += 0.5;
    }
    tests++;
  }

  // Sub-test 3: fatigue slope — typing slows over time
  if (session.fatigueWindows.length >= 3) {
    const fw = session.fatigueWindows;
    score += fw[fw.length - 1] - fw[0] > 0 ? 1 : 0;
    tests++;
  }

  return tests > 0 ? round2(score / tests) : 0.5;
}

function scoreWAR(session, profile) {
  if (!profile || session.flightTimes.length < 10) {
    return { war: 0, raw_war: 0, tier: 'Suspicious', components: {}, flags: [] };
  }

  const flags = [];

  // === LAYER 1: Hard floors — instant WAR = 0 ===
  const hasHardFloor =
    (profile.mean_dwell != null && profile.mean_dwell < 27) ||
    (profile.std_inter_key != null && profile.std_inter_key < 9) ||
    (profile.mean_inter_key != null && profile.mean_inter_key < 54);

  if (hasHardFloor) {
    if (profile.mean_dwell < 27) flags.push('dwell_floor');
    if (profile.std_inter_key < 9) flags.push('variance_floor');
    if (profile.mean_inter_key < 54) flags.push('iki_floor');
    return { war: 0, raw_war: 0, tier: 'Suspicious', components: {}, flags };
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

  // 10. Purity — paste detection
  const total = session.humanChars + session.alienChars;
  const pasteRatio = total > 0 ? session.alienChars / total : 0;
  if (total >= 20) {
    components.purity = rampScore(session.humanChars / total, WAR_RAMPS.purity[0], WAR_RAMPS.purity[1]);
    if (pasteRatio > 0.50) flags.push('paste_heavy');
    if (pasteRatio > 0.90) flags.push('paste_flood');
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
    paste_heavy: 0.15,
    no_editing_behavior: 0.05,
    non_lognormal: 0.05,
    paste_flood: 0.30,
  };

  let penalty = 0;
  for (const flag of flags) {
    if (PENALTIES[flag]) penalty += PENALTIES[flag];
  }

  let war = round2(Math.max(0, raw_war - penalty));

  // Purity multiplier — paste ratio directly scales WAR down
  if (total > 0 && pasteRatio > 0.10) {
    var purityMult = Math.max(0, 1 - pasteRatio);
    war = round2(war * purityMult);
  }

  const tier = WAR_TIERS.find(([min]) => war >= min)[1];

  return { war, raw_war, tier, components, flags, timeCap: 1.0 };
}

// Time confidence cap — the economic thesis in code
// Day 0 = max 0.35, scales logarithmically to 1.0 at 180+ days
// Caps `war` (after penalties); `raw_war` stays as the pre-penalty score.
function applyTimeCap(warResult, firstSeenMs) {
  if (!firstSeenMs) {
    warResult.war = Math.min(warResult.war, 0.35);
    warResult.timeCap = 0.35;
    return warResult;
  }
  const days = Math.max(0, (Date.now() - firstSeenMs) / 86400000);
  const cap = Math.min(1.0, round2(0.35 + 0.65 * Math.log(1 + days / 30) / Math.log(7)));
  warResult.war = round2(Math.min(warResult.war, cap));
  warResult.timeCap = cap;
  warResult.tier = WAR_TIERS.find(([min]) => warResult.war >= min)[1];
  return warResult;
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
  ksStatistic, pearsonR,
  EDITING_KEYS, TRACKED_KEYS, TRACKED_BIGRAMS,
  WAR_TIERS, WAR_WEIGHTS, WAR_RAMPS,
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
