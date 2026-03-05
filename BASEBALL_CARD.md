# ⚡ The Jitter Baseball Card
### Career Stats for the Human Writing Process

**Version:** 1.0
**Author:** Denis Gingras
**Copyright © 2025-2026 Denis Gingras. All Rights Reserved.**

---

## THE SPORTS ANALOGY (Why This Works)

Baseball doesn't tell you if a player is "good" with one number. It tells a story across dozens of stats that accumulate over a career. A .320 batting average means nothing without context: how many at-bats? Against what pitchers? In what situations? Over how many seasons?

Jitter works the same way. Not one "integrity score" — a full stat sheet that tells the story of how this person writes.

---

## THE JITTER STAT SHEET

### Career Stats (Passport-Level — Accumulated Over Time)

These are the "career batting average" numbers. They only get meaningful with volume.

| Stat | Baseball Equivalent | What It Measures | How It's Calculated |
|---|---|---|---|
| **Career Keystrokes (CK)** | Career At-Bats | Total volume of typing across all sessions | Sum of all keydown events across lifetime |
| **Account Age (AA)** | Seasons Played | How long the passport has existed | Days since first session |
| **Sessions Played (SP)** | Games Played | Total writing sessions completed | Count of all completed sessions |
| **Typing Speed (TS)** | Sprint Speed | Average words per minute across career | (Total chars / 5) / total active minutes |
| **Rhythm Signature (RS)** | Batting Stance | Personal typing fingerprint stability | How consistent your digraph patterns are session-to-session (0-100) |
| **Daily Average (DA)** | Season Average | Average keystrokes per active day | Total keystrokes / days with activity |
| **Streak (STK)** | Hit Streak | Consecutive days with writing activity | Current/longest run of active days |

### Per-Session Stats (Single Game Numbers)

These are the "box score" for each writing session.

| Stat | Baseball Equivalent | What It Measures | How It's Calculated |
|---|---|---|---|
| **Session Purity (SP)** | Batting Average | Ratio of typed vs total content | typed_chars / (typed_chars + pasted_chars) × 1.000 |
| **Cognitive Ratio (CR)** | On-Base Percentage | Thinking pauses vs flow typing | avg_gap_after_punctuation / avg_flow_between_letters |
| **Rhythm Entropy (RE)** | Exit Velocity | Variance in keystroke timing | Statistical entropy of interval distribution (0-100) |
| **Edit Rate (ER)** | Fielding Percentage | How much revision happened | backspaces / total_keystrokes |
| **Burst Rate (BR)** | Pitch Count | Typing speed consistency | StdDev of WPM across 60-second windows |
| **Focus Time (FT)** | Time of Possession | Active writing vs elapsed time | active_typing_minutes / total_session_minutes |
| **Paste Events (PE)** | Errors | Number of paste operations | Count of clipboard paste events |
| **Paste Volume (PV)** | Error Impact | Characters pasted vs typed | pasted_chars / total_chars |

### Advanced Metrics (Sabermetrics — The Deep Stats)

These require multiple sessions to calculate.

| Stat | Baseball Equivalent | What It Measures | How It's Calculated |
|---|---|---|---|
| **WAR (Writer Authenticity Rating)** | WAR | Overall composite authenticity score | Weighted combination of career + session metrics (0-10 scale) |
| **Dwell Signature (DS)** | Spin Rate | How long keys are held down | Mean + StdDev of key hold durations |
| **Digraph DNA (DD)** | Spray Chart | Your unique letter-pair timing patterns | Timing matrix of top 20 most common digraphs (th, he, in, er, an...) |
| **Correction Speed (CS)** | Recovery Time | How fast you fix mistakes | Average time between error and backspace |
| **Flow State Index (FSI)** | Hot Streak | Extended periods of uninterrupted typing | Longest run of keystrokes without pause >3 seconds |
| **Consistency Index (CI)** | Contact Rate | Session-to-session stability of your stats | Coefficient of variation of key metrics across last 10 sessions |
| **Night Owl Index (NOI)** | Day/Night Splits | When you write | Distribution of activity across 24-hour clock |
| **Warm-Up Curve (WUC)** | First Inning Splits | Speed change from session start to peak | WPM in first 2 min vs minutes 5-10 |
| **Fatigue Curve (FC)** | Late Innings | Speed/accuracy decline over long sessions | WPM/error rate in last 10 min vs session average |

---

## DATA CAPTURE

### Dwell Time (keydown → keyup on same key)

Tracks how long each key is held. Combined with flight time (between keys), this roughly doubles biometric signal quality.

**Implementation:** `keyup` event listener in writer.js and content.js. Stores dwell time per keystroke. Aggregates into mean, stddev, and per-key averages.

```javascript
// writer.js: bio.keydownTimes tracks keydown timestamps by e.code
// handleKeyUp() calculates dwell = performance.now() - keydownTimes[e.code]
// Stored in bio.dwellTimes (max 200 samples)
```

### Digraph Timing

Tracks timing between specific two-letter combinations. The top 20 English digraphs (th, he, in, er, an, re, on, at, en, nd, ti, es, or, te, of, ed, is, it, al, ar) account for ~40% of all letter pairs. Your timing pattern across these is a fingerprint.

```javascript
// writer.js: bio.digraphs = { "th": [intervals], "he": [intervals], ... }
// Max 20 samples per pair. Aggregated into digraphDNA on session end.
```

### WPM Windows (Burst Rate)

Tracks WPM in rolling 60-second windows. Provides:
- **Warm-up curve** — most humans start slow and speed up
- **Fatigue curve** — long sessions show declining speed
- **Burst patterns** — think-then-type cycles
- **Consistency** — bots are unnaturally steady

```javascript
// writer.js: bio.wpmWindows = [wpm1, wpm2, ...]
// New window every 60 seconds. Max 60 windows (1 hour).
```

### Error Pattern Tracking

When someone hits backspace, records:
- Time between the error keystroke and the correction (`bio.correctionSpeeds`)
- Which keys are most commonly corrected (`bio.typoKeys`)
- Error rate per 100 keystrokes (`bio.errorsPerWindow`)

---

## THE WAR FORMULA (Writer Authenticity Rating)

Scale: 0-10. Each component is 0-10.

```
WAR = (
    accountAge_score     × 0.20  +   // Time dimension (hardest to fake)
    careerVolume_score   × 0.15  +   // Total keystrokes (effort over time)
    sessionPurity_score  × 0.15  +   // This session's typed vs pasted
    cognitiveRatio_score × 0.10  +   // Thinking pattern naturalness
    rhythmMatch_score    × 0.15  +   // Does this session match career profile?
    consistencyIndex     × 0.10  +   // How stable are metrics across sessions?
    editBehavior_score   × 0.10  +   // Natural revision patterns
    focusTime_score      × 0.05      // Active engagement during session
)
```

**WAR Tiers:**
- 8.0-10.0: ⭐ **Hall of Fame** — Established writer, high confidence
- 6.0-7.9: ✅ **All-Star** — Strong profile, trustworthy
- 4.0-5.9: 🔷 **Solid** — Developing history, reasonable confidence
- 2.0-3.9: ⚠️ **Rookie** — New account or limited data
- 0.0-1.9: 🚩 **Suspicious** — Red flags present

---

## THE MULTI-YEAR SCHOOL PASSPORT

A student's typing biometrics evolve predictably over their school years:
- **Middle school (11-13):** 20-40 WPM, high error rate, developing rhythm
- **High school (14-18):** 40-60 WPM, improving consistency, personal style emerging
- **College (18-22):** 50-80 WPM, stable signature, mature patterns

The passport captures this TRAJECTORY. After 4 years of data, manufacturing a fake passport would require thousands of dollars and 4 years of patience per student. The economics don't work.

### What the Teacher Dashboard Shows

The verify.html Baseball Card displays:
1. **WAR Hero Section** — Large WAR number with tier badge and risk level
2. **Career Overview Grid** — Career keys, account age, sessions, career purity, career WPM, career CR, streak, error rate
3. **Consistency Checks** — Rhythm Signature bar + Consistency Index bar
4. **Session Box Score** — All per-session stats (purity, CR, entropy, WPM, edit rate, focus time, paste events, burst rate)
5. **Advanced Metrics** — Dwell signature, correction speed, flow state index, error rate, warm-up curve, paste volume
6. **Digraph DNA** — Visual display of letter-pair timing fingerprint
7. **Passport Profile** — Lifetime stats and badge chain
8. **Suspicious Pattern Alerts** — Enhanced with error rate and rhythm mismatch detection

---

## PASSPORT SCHEMA (chrome.storage)

### Career Stats Fields (added to passport object)
```javascript
{
    // ... existing passport fields ...
    careerWpm: 0,                    // Average WPM across career
    careerPurity: 1.000,             // Career purity average (.000 format)
    careerCognitiveRatio: 0,         // Career average cognitive ratio
    careerErrorRate: 0,              // Errors per 100 keys (career)
    streak: { current: 0, longest: 0, lastActiveDate: null },
    digraphProfile: {},              // Career average digraph timings
    dwellProfile: { mean: 0, stdDev: 0 },
    rhythmSignature: 0,              // 0-100
    sessionStats: [],                // Last 20 sessions
    consistencyIndex: 0,             // 0-100
    war: 0                           // 0-10
}
```

### Bio Object Fields (per-session, in-memory only)
```javascript
{
    // ... existing bio fields ...
    keydownTimes: {},      // Dwell tracking
    dwellTimes: [],        // Dwell durations (max 200)
    digraphs: {},          // Digraph intervals
    wpmWindows: [],        // 60s WPM snapshots
    wpmWindowStart: null,
    wpmWindowChars: 0,
    correctionSpeeds: [],  // Error→backspace timing
    typoKeys: {},          // Typo fingerprint
    errorsPerWindow: [],   // Error rate per 100 keys
    sessionActiveMs: 0,    // Active typing time
    peakWpm: 0,
    flowStateMax: 0,       // Flow State Index
    flowStateCurrent: 0
}
```

### Badge Payload (v3.0)

Badges now include all session stats + career stats + WAR. See the `exportBadge()` function in writer.js for the full payload structure.

---

## IMPLEMENTATION STATUS

### Phase 1 — Data Capture ✅
- [x] Dwell time tracking (keyup listener) — writer.js + content.js
- [x] Digraph timing for top 20 letter pairs
- [x] WPM windowing (60-second rolling averages)
- [x] Error pattern tracking (correction speed, typo fingerprint)
- [x] Flow state tracking
- [x] Active time / focus time tracking

### Phase 2 — Stat Engine ✅
- [x] Per-session box score calculator (`calculateSessionStats()`)
- [x] Career stats running averages (`updateCareerStats()`)
- [x] Rhythm Signature calculation (`calculateRhythmSignature()`)
- [x] Consistency Index calculation (`calculateConsistencyIndex()`)
- [x] WAR composite formula (`calculateWAR()`)
- [x] Badge payload v3.0 with all stats

### Phase 3 — UI ✅
- [x] Student-facing: WAR card + live WPM/focus + career stats in sidebar
- [x] Teacher-facing: Full baseball card in verify.html
- [x] Digraph DNA visualization
- [x] Enhanced suspicious pattern detection

### Phase 4 — Multi-Year Passport Infrastructure (Future)
- [ ] Server-side passport storage (Firebase) with server-verified timestamps
- [ ] Passport export/import for school transitions
- [ ] Career progression visualization (the development curve)
- [ ] Cohort comparison (class averages)
- [ ] Night Owl Index implementation
- [ ] Fatigue Curve implementation

---

## KEY FILES

| File | What Changed |
|---|---|
| `writer.js` | Bio object expansion, handleKey/handleKeyUp, stat engine (calculateSessionStats, updateCareerStats, WAR formula), updateDashboard with live stats |
| `writer.html` | WAR card, WPM/focus displays, career stats section in sidebar |
| `verify.html` | Full baseball card UI with WAR hero, career grid, consistency bars, box score, advanced metrics, digraph DNA |
| `content.js` | Dwell time tracking (keyup), digraph tracking |
| `passport-utils.js` | Unchanged (career stats managed in writer.js) |
