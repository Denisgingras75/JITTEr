# Biometric Unification — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract a shared biometric engine from usePurityTracker, port it into the Chrome extension (content.js + writer.js), add burst analysis, cursor tracking, and mouse dynamics. Ship as badge v2.1.

**Architecture:** New `biometrics.js` module contains all biometric capture logic (dwell, flight, DD, bigrams, fatigue, bursts). Both the Chrome extension files and WGH's usePurityTracker import from it. Extension gets new metrics. Badge payload expanded. Loki scoring updated with new signals.

**Tech Stack:** Vanilla JS (Chrome extension), React hooks (WGH). No new dependencies.

**Design doc:** `docs/plans/2026-02-27-biometric-unification-design.md`

**Working directory for all tasks:** `~/Desktop/JITTEr/JITTEr-main 2/`

---

## Task 1: Create biometrics.js — shared capture engine

**Files:**
- Create: `biometrics.js`

**Step 1: Create `biometrics.js` with core data structures and helpers**

```javascript
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
    return { cognitiveRatio: 0, entropy: 100, isBot: false, stdDev: 0 };
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

  return { cognitiveRatio: round2(cognitiveRatio), entropy, isBot, stdDev: round2(stdDev) };
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
// For Chrome extension (non-module script): attach to window
if (typeof window !== 'undefined' && typeof module === 'undefined') {
  window.JitterBio = {
    createSession, handleKeydown, handleKeyup, handlePaste,
    handleMouseMove, handleCursorMove, analyzeLoki, getProfile,
    getPurity, EDITING_KEYS, TRACKED_KEYS, TRACKED_BIGRAMS,
    calcMean, calcStd, calcCV, round2, round3,
  };
}

// For ES module (WGH / Node):
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createSession, handleKeydown, handleKeyup, handlePaste,
    handleMouseMove, handleCursorMove, analyzeLoki, getProfile,
    getPurity, EDITING_KEYS, TRACKED_KEYS, TRACKED_BIGRAMS,
    calcMean, calcStd, calcCV, round2, round3,
  };
}
```

**Step 2: Add `biometrics.js` to manifest.json**

In `manifest.json`, add `biometrics.js` before `content.js` in the content_scripts array, and before `writer.js` in the writer.html script tags.

**Step 3: Commit**

```bash
git add biometrics.js
git commit -m "feat: extract shared biometric engine into biometrics.js"
```

---

## Task 2: Integrate biometrics.js into content.js

**Files:**
- Modify: `content.js`
- Modify: `manifest.json`

**Step 1: Update manifest.json to load biometrics.js before content.js**

In `manifest.json`, find the `content_scripts` section and add `"biometrics.js"` before `"content.js"` in the `js` array.

**Step 2: Replace Loki biometrics in content.js with JitterBio calls**

Replace the `bio` object and all inline biometric logic in `content.js` with calls to `JitterBio`:

- Replace `const bio = { ... }` with `let bioSession = JitterBio.createSession();`
- Replace the `keydown` handler to call `JitterBio.handleKeydown(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey)`
- Add a `keyup` handler: `JitterBio.handleKeyup(bioSession, e.key, e.ctrlKey, e.metaKey, e.altKey)`
- Add a `mousemove` handler: `document.addEventListener('mousemove', (e) => JitterBio.handleMouseMove(bioSession, e.clientX, e.clientY))`
- Replace `analyzeRhythm()` calls with `const loki = JitterBio.analyzeLoki(bioSession);`
- Replace paste handler to call `JitterBio.handlePaste(bioSession, pastedText.length)`
- Keep all UI code, passport code, and badge code — only replace biometric capture logic

**Step 3: Update `calculateStats()` to use bioSession**

```javascript
function calculateStats() {
    // ... existing target detection ...
    const loki = JitterBio.analyzeLoki(bioSession);
    let integrity = 100;
    if (totalCharsInBox > 0) {
        integrity = Math.round((bioSession.humanChars / totalCharsInBox) * 100);
        if (integrity > 100) integrity = 100;
    } else if (bioSession.humanChars > 0) integrity = 100;
    if (loki.isBot) integrity = 0;
    return { typed: bioSession.humanChars, total: totalCharsInBox, integrity, pastes: bioSession.pasteCount };
}
```

**Step 4: Update UI to show new metrics**

In the `updateUI()` function, add dwell time and burst info to the LOKI BIOMETRICS section:

```javascript
const loki = JitterBio.analyzeLoki(bioSession);
const profile = JitterBio.getProfile(bioSession);
// Add to menu HTML:
// <div class="jitter-row"><span>Dwell</span><span class="jitter-val">${profile?.mean_dwell || '—'}ms</span></div>
// <div class="jitter-row"><span>Bursts</span><span class="jitter-val">${profile?.burst_count || 0}</span></div>
```

**Step 5: Update badge payload to v2.1**

In `copyBadge()`, add the new metrics from `JitterBio.getProfile(bioSession)`:

```javascript
const profile = JitterBio.getProfile(bioSession);
const p = {
    version: '2.1',
    type: 'content',
    // ... existing fields ...
    // NEW biometric fields:
    meanDwell: profile?.mean_dwell,
    stdDwell: profile?.std_dwell,
    meanFlight: profile?.mean_inter_key,
    stdFlight: profile?.std_inter_key,
    meanDd: profile?.mean_dd_time,
    stdDd: profile?.std_dd_time,
    editRatio: profile?.edit_ratio,
    pauseCount: profile?.pause_count,
    pauseFreq: profile?.pause_freq,
    avgBurstLength: profile?.avg_burst_length,
    burstVariance: profile?.burst_variance,
    burstCount: profile?.burst_count,
    fatigueWindows: profile?.fatigue_windows,
    mousePath: profile?.mouse_path,
    // ... existing passport + crypto fields ...
};
```

**Step 6: Update btn-start reset to use JitterBio**

```javascript
'btn-start': () => {
    bioSession = JitterBio.createSession();
    project = { isActive: true, humanKeystrokes: 0, pasteCount: 0, pastedChars: 0, startTime: Date.now() };
    saveData(); updateUI();
},
```

**Step 7: Test manually**

- Load the extension in Chrome (chrome://extensions → Load unpacked)
- Visit any page with a text input
- Start a session, type text, observe that Loki metrics display correctly
- Verify that typing produces entropy and cognitive ratio values
- Paste text, verify paste count increments
- Click MINT BADGE, verify badge contains new v2.1 fields

**Step 8: Commit**

```bash
git add content.js manifest.json
git commit -m "feat: integrate biometrics.js into content.js — badge v2.1"
```

---

## Task 3: Integrate biometrics.js into writer.js

**Files:**
- Modify: `writer.js`
- Modify: `writer.html`

**Step 1: Add biometrics.js script tag to writer.html**

Add `<script src="biometrics.js"></script>` before the `<script src="writer.js"></script>` tag.

**Step 2: Replace biometric logic in writer.js with JitterBio calls**

Same pattern as content.js:
- Replace `const bio = { ... }` with `let bioSession = JitterBio.createSession();`
- Replace `handleKey()` to use `JitterBio.handleKeydown()` for biometrics, keeping ledger recording logic
- Add keyup handler for dwell tracking
- Replace `analyzeRhythm()` with `JitterBio.analyzeLoki(bioSession)`
- Replace paste handler to call `JitterBio.handlePaste()`

**Step 3: Add cursor tracking to writer.js**

In the editor's `click` handler and after arrow key navigation, call:
```javascript
const sel = window.getSelection();
if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const cursorPos = range.startOffset;
    JitterBio.handleCursorMove(bioSession, cursorPos);
}
```

For more accurate position tracking, compute the full text offset:
```javascript
function getCursorOffset() {
    const editor = document.getElementById('editor');
    const sel = window.getSelection();
    if (!sel.rangeCount || !editor.contains(sel.anchorNode)) return 0;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString().length;
}
```

Call `JitterBio.handleCursorMove(bioSession, getCursorOffset())` on each keystroke and click.

**Step 4: Update dashboard to show new metrics**

Add burst count, cursor jumps, and editing linearity to the writer dashboard UI.

**Step 5: Update exportBadge() to include new metrics**

Same v2.1 badge payload as content.js, plus writer-specific fields:
```javascript
const profile = JitterBio.getProfile(bioSession);
// Add to payload:
cursorJumps: profile?.cursor_jumps,
backwardEdits: profile?.backward_edits,
editingLinearity: profile?.editing_linearity,
```

**Step 6: Update resetSession()**

```javascript
function resetSession() {
    if(confirm("Reset Session?")) {
        session = { humanChars: 0, alienChars: 0, startTime: Date.now() };
        bioSession = JitterBio.createSession();
        document.getElementById('editor').innerHTML = '';
        updateDashboard();
    }
}
```

**Step 7: Test manually**

- Open the writer (click OPEN WRITER in the extension)
- Type a paragraph, observe metrics updating
- Click in the middle of text (cursor jump), verify backward edit tracking
- Export badge, verify it contains cursor_jumps, editing_linearity, burst data

**Step 8: Commit**

```bash
git add writer.js writer.html
git commit -m "feat: integrate biometrics.js into writer.js — cursor tracking + bursts"
```

---

## Task 4: Update verify.html to display new metrics

**Files:**
- Modify: `verify.html`

**Step 1: Read current verify.html**

Understand the current badge certificate display layout.

**Step 2: Add new metric rows to the certificate display**

Add sections for the new biometric data in badge v2.1:

```html
<!-- After existing Session Metrics section -->
<div style="border-top:1px solid #333;margin:15px 0;"></div>
<div style="font-size:11px;color:#666;text-transform:uppercase;margin-bottom:8px;letter-spacing:1px;">Biometric Profile</div>
<div class="jitter-row"><span>Dwell Time</span><span class="jitter-val">${d.meanDwell || '—'}ms</span></div>
<div class="jitter-row"><span>Flight Time</span><span class="jitter-val">${d.meanFlight || '—'}ms</span></div>
<div class="jitter-row"><span>Edit Ratio</span><span class="jitter-val">${d.editRatio || '—'}</span></div>
<div class="jitter-row"><span>Pause Freq</span><span class="jitter-val">${d.pauseFreq || '—'}/100</span></div>

<div style="border-top:1px solid #333;margin:15px 0;"></div>
<div style="font-size:11px;color:#666;text-transform:uppercase;margin-bottom:8px;letter-spacing:1px;">Composition Analysis</div>
<div class="jitter-row"><span>Burst Count</span><span class="jitter-val">${d.burstCount || '—'}</span></div>
<div class="jitter-row"><span>Burst Variance</span><span class="jitter-val">${d.burstVariance || '—'}</span></div>
<div class="jitter-row"><span>Linearity</span><span class="jitter-val">${d.editingLinearity != null ? (d.editingLinearity * 100).toFixed(0) + '%' : '—'}</span></div>
<div class="jitter-row"><span>Cursor Jumps</span><span class="jitter-val">${d.cursorJumps || '—'}</span></div>
```

**Step 3: Add fatigue trend display**

If fatigue windows are present, show a mini sparkline or trend:
```javascript
if (d.fatigueWindows && d.fatigueWindows.length > 1) {
    const trend = d.fatigueWindows[d.fatigueWindows.length - 1] > d.fatigueWindows[0] ? '↗ slowing' : '↘ speeding up';
    // Display: "Fatigue: 142 → 163 (↗ slowing)"
}
```

**Step 4: Color code composition analysis**

- Editing linearity > 95% = yellow warning ("Pure forward — possible transcription")
- Burst variance < 0.15 = yellow warning ("Unnaturally consistent")
- Both together = red flag

**Step 5: Test**

Load a badge with v2.1 data, verify all new fields display correctly. Load an old v2.0 badge, verify graceful fallback (shows "—" for missing fields).

**Step 6: Commit**

```bash
git add verify.html
git commit -m "feat: display biometric profile + composition analysis in verify.html"
```

---

## Task 5: Update Loki scoring with new detection signals

**Files:**
- Modify: `biometrics.js`

**Step 1: Add new detection signals to analyzeLoki()**

Add after existing bot detection logic:

```javascript
// New signals (informational — not bot flags)
const transcriptionFlag = session.bursts.length > 5 &&
    calcCV(session.bursts) < 0.15 &&
    (totalEdits > 0 ? (1 - session.backwardEdits / totalEdits) : 1) > 0.95 &&
    session.humanChars > 500;

const suspiciousFatigue = session.fatigueWindows.length === FATIGUE_WINDOW_COUNT &&
    session.fatigueWindows.every((w, i, arr) =>
        i === 0 || Math.abs(w - arr[i-1]) < 0.5
    );

const noDwellVariance = session.dwellTimes.length > 50 && calcStd(session.dwellTimes) < 5;
```

**Step 2: Return new signals from analyzeLoki()**

```javascript
return {
    cognitiveRatio: round2(cognitiveRatio),
    entropy,
    isBot,
    stdDev: round2(stdDev),
    transcriptionFlag,
    suspiciousFatigue,
    noDwellVariance,
};
```

**Step 3: Add transcription flag to badge and UI**

Add `transcriptionFlag` to badge payload. In verify.html, show a warning if true:
```
⚠️ Writing pattern suggests transcription (pure forward, low burst variance)
```

This is NOT a bot flag — it's an integrity signal. "This was probably typed from another source."

**Step 4: Commit**

```bash
git add biometrics.js
git commit -m "feat: add transcription detection + fatigue/dwell signals to Loki"
```

---

## Task 6: Update JITTER_FOUNDATIONS.md

**Files:**
- Modify: `JITTER_FOUNDATIONS.md`

**Step 1: Update section 9 (Badge v2.0 → v2.1)**

Update the badge JSON structure to show all new fields.

**Step 2: Add section on Composition Analysis**

Between sections 7 and 8, add a new section explaining burst analysis, cursor tracking, and editing linearity. Explain how these signals distinguish original composition from transcription.

**Step 3: Update the comparison table (section 8)**

Add a row for Turnitin Clarity and update the "What Makes Jitter Different" positioning.

**Step 4: Commit**

```bash
git add JITTER_FOUNDATIONS.md
git commit -m "docs: update foundations for badge v2.1 + composition analysis"
```

---

## Task 7: Refactor WGH usePurityTracker to use biometrics.js

**Files:**
- Modify: `/Users/denisgingras/whats-good-here/src/hooks/usePurityTracker.js`

This task is DEFERRED until after the extension is working. The WGH hook already has most of the biometric logic — refactoring it to import from a shared module is a code quality improvement, not a feature requirement.

**When done:** Replace inline math/tracking in usePurityTracker with imports from a biometrics module. The module would be copied (not linked) since WGH uses ES modules and the extension uses script tags.

---

## Summary: What Ships

After tasks 1-6:
- **`biometrics.js`** — shared engine with 69+ metrics including bursts, cursor tracking, mouse dynamics
- **`content.js`** — upgraded to use JitterBio, captures dwell/flight/DD/bigrams/fatigue/bursts/mouse
- **`writer.js`** — same + cursor position tracking for composition vs. transcription detection
- **`verify.html`** — displays full biometric profile + composition analysis + transcription warnings
- **Badge v2.1** — contains all new fields, backward-compatible with v2.0 readers
- **Loki v2** — new detection signals: transcription flag, flat fatigue, no dwell variance
- **JITTER_FOUNDATIONS.md** — updated with new architecture and positioning vs. Turnitin Clarity

**What does NOT ship (deferred):**
- WGH usePurityTracker refactor (Task 7)
- Advanced pause classification
- Semantic revision detection
- Mouse dynamics scoring (data accumulation only)
