# Jitter Biometric Unification — Design Document

**Author:** Denis Gingras
**Date:** 2026-02-27
**Approach:** A (Unify and Ship) → then C (Widget divergence for B2B)

---

## Problem

Jitter has two biometric engines that don't talk to each other:

1. **Chrome Extension (Loki)** — Cognitive ratio, entropy, flow/gap rhythm, passport, suspicion scoring. Runs in `content.js` and `writer.js`. Captures ~30 metrics.
2. **WGH Integration (usePurityTracker)** — Dwell time, flight time, DD time, per-key fingerprinting, bigram signatures, fatigue drift, edit ratio, pause frequency. Runs in `usePurityTracker.js`. Captures ~24 additional metrics.

The WGH version is academically stronger but lives trapped inside a React hook. The extension is the user-facing product but runs the weaker engine.

Meanwhile, academic research identifies three gaps in both engines:
- **Burst pattern analysis** (variable typing runs = composition, even runs = transcription)
- **Cursor position tracking** (non-linear editing = composition, forward-only = transcription)
- **Mouse dynamics** (free bot detection signal, 93-99.8% accuracy in literature)

Turnitin Clarity uses ZERO keystroke biometrics. Their weakness (manual retyping bypass) is exactly what these metrics catch.

---

## Design

### Phase 1: Port usePurityTracker Metrics into Extension

Bring these metrics from `usePurityTracker.js` into `content.js` and `writer.js`:

| Metric | Current Location | Port To |
|---|---|---|
| Dwell time (key hold duration) | usePurityTracker | content.js, writer.js |
| DD time (keydown-to-keydown) | usePurityTracker | content.js, writer.js |
| Per-key dwell (10 common letters) | usePurityTracker | content.js, writer.js |
| Bigram signatures (30 digraphs) | usePurityTracker | content.js, writer.js |
| Fatigue windows (speed drift) | usePurityTracker | content.js, writer.js |
| Edit ratio | usePurityTracker | content.js, writer.js |
| Pause frequency | usePurityTracker | content.js, writer.js |

**Implementation approach:** Extract the biometric capture logic from `usePurityTracker.js` into a shared `biometrics.js` module. Both the extension and WGH import from it. One engine, two consumers.

**Data flow:**
```
keydown/keyup events
    → biometrics.js (shared engine)
        → dwell, flight, DD, bigrams, fatigue, bursts
    → content.js / writer.js (consumer-specific logic)
        → Loki scoring, passport updates, badge minting
    → usePurityTracker.js (React wrapper for WGH)
        → purity score, Supabase submission
```

### Phase 2: Add New Metrics (Gaps from Research)

#### 2a. Burst Pattern Analysis

**What:** Segment typing into bursts (uninterrupted runs of keystrokes) separated by pauses (>500ms gaps).

**Metrics to capture:**
- `burst_count` — number of bursts in session
- `burst_lengths` — array of keystroke counts per burst (rolling window of last 50)
- `avg_burst_length` — mean keystrokes per burst
- `burst_length_variance` — coefficient of variation of burst lengths
- `burst_speed_variance` — how much typing speed varies between bursts

**Why it matters:**
- Composition: variable burst lengths (short = thinking, long = flowing)
- Transcription: long, even bursts (reading a chunk, typing it)
- Paste: zero bursts
- Published accuracy: 72% for cognitive load classification from bursts alone

**Threshold:** Gap > 500ms starts a new burst. Minimum burst length: 3 keystrokes.

#### 2b. Cursor Position Tracking (Writer Mode Only)

**What:** Track where in the document the user is typing over time.

**Metrics to capture:**
- `cursor_jumps` — count of cursor repositioning events (clicking/arrowing to non-adjacent position)
- `backward_edits` — count of edits made before the current end of document
- `editing_linearity` — ratio of forward-only typing vs. total edits (0 = constant revision, 1 = pure forward typing)

**Why it matters:**
- Original composition: non-linear. Writers jump back, revise earlier paragraphs, restructure.
- Transcription: monotonically forward. You read and type left-to-right, top-to-bottom.
- This distinction achieves 99% accuracy in published research.

**Privacy note:** Track cursor POSITION (character index), not content. Metadata only.

#### 2c. Mouse Dynamics (Extension Content Script Only)

**What:** Capture mouse movement patterns on pages where Jitter is active.

**Metrics to capture:**
- `mouse_path_curvature` — ratio of actual path length to straight-line distance (humans: >1.3, bots: ~1.0)
- `mouse_speed_variance` — coefficient of variation in mouse movement speed
- `micro_corrections` — count of small directional changes (<5px, <100ms apart)
- `click_precision` — distance from click target center (measured by proximity to clickable elements)

**Why it matters:** 93-99.8% bot detection in literature. Free signal — content.js already runs on every page.

**Privacy note:** No coordinates stored. Only computed ratios and variances. Metadata only.

**Scope limit:** Capture and store in passport. Do NOT use for Loki bot detection in v1 — just accumulate the data. We can add it to scoring later once we see real distributions.

### Phase 3: Badge v2.1

Add new metrics to the badge payload:

```json
{
  "version": "2.1",
  "session": {
    "typed_chars": 891,
    "pasted_chars": 0,
    "backspaces": 47,
    "cognitive_ratio": 2.68,
    "entropy": 74,
    "duration_sec": 847,
    "bot_detected": false,
    "mean_dwell": 112,
    "std_dwell": 34,
    "mean_flight": 148,
    "std_flight": 42,
    "mean_dd": 187,
    "std_dd": 51,
    "edit_ratio": 0.052,
    "pause_count": 14,
    "pause_freq": 1.57,
    "avg_burst_length": 23.4,
    "burst_variance": 0.68,
    "cursor_jumps": 7,
    "editing_linearity": 0.34,
    "fatigue_windows": [142, 148, 155, 163]
  },
  "biometrics": {
    "per_key_dwell": { "e": 98, "t": 105, "a": 112 },
    "bigram_signatures": { "th": { "mean": 134, "std": 28 }, "he": { "mean": 141, "std": 31 } }
  },
  "passport": { },
  "crypto": { }
}
```

### Phase 4: Updated Loki Scoring

Add new bot detection signals using the new metrics:

| Signal | Condition | Points |
|---|---|---|
| No dwell variance | std_dwell < 5 AND totalKeys > 100 | botDwell = true |
| No burst variance | burst_variance < 0.15 AND bursts > 5 | botBurst = true |
| Pure forward typing | editing_linearity > 0.95 AND totalKeys > 500 | transcription_flag = true |
| Flat fatigue | fatigue slope < 0.5ms/window AND windows = 4 | suspicious_fatigue = true |

**transcription_flag is NOT a bot flag.** It's a separate signal: "this was probably typed from another source." Different from "this was typed by a machine." Both are useful, different severity.

---

## What This Does NOT Include (Deferred)

- Advanced pause classification (sentence vs. paragraph vs. cognitive) — needs NLP, too heavy for v1
- Semantic revision detection (meaning-change vs. typo-correction) — requires content analysis, violates locked box
- Full mouse dynamics scoring — accumulate data first, score later
- Mobile touch/pressure biometrics — extension is desktop-only for now
- Composition coherence scoring — future widget feature for B2B

---

## Files Affected

| File | Change |
|---|---|
| `biometrics.js` (NEW) | Shared biometric capture engine extracted from usePurityTracker |
| `content.js` | Import biometrics.js, add mouse dynamics listener, update badge payload |
| `writer.js` | Import biometrics.js, add cursor tracking, update badge payload |
| `passport-utils.js` | Add new metrics to passport accumulation |
| `verify.html` | Display new metrics in teacher dashboard |
| `usePurityTracker.js` (WGH) | Refactor to import from biometrics.js instead of inline |

---

## Success Criteria

- [ ] Extension captures all metrics that usePurityTracker currently captures
- [ ] Burst analysis produces meaningful distributions on real typing
- [ ] Writer mode tracks cursor position and reports editing linearity
- [ ] Mouse dynamics data accumulates in passport (no scoring yet)
- [ ] Badge v2.1 includes all new fields
- [ ] Existing Loki detection still works (no regressions)
- [ ] Zero content captured — locked box principle maintained
- [ ] verify.html displays new metrics in a readable format
