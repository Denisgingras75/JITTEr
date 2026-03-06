# Jitter Browser Extension Design — "Typing Passport"

**Date:** 2026-03-01 (updated 2026-03-02 with research findings)
**Agent:** G-p795 (colt)
**Status:** Design approved by Denis — updated with science + competitive research

---

## Overview

Chrome extension that captures keystroke timing metrics across all web pages and visualizes them as a personal biometric identity passport. Privacy-first — all processing local, zero network, no content stored.

Two UI modes auto-toggle based on activity:
- **Live Mode:** Real-time dashboard while typing (fitness tracker for identity)
- **Passport Mode:** Static identity card when idle (digital ID credential)

---

## Architecture

```
Content Script (every page)
  |-- Captures keydown/keyup events (skips password fields)
  |-- Records: key code, timestamp (performance.now()), event type
  '-- Streams via long-lived Port to...

Service Worker (background)
  |-- Buffers raw events, calculates metrics in real-time
  |-- Flushes computed stats to chrome.storage.local every 30s
  '-- Pushes live updates to Side Panel via Port

Side Panel (persistent UI)
  |-- LIVE MODE: Real-time stats while typing (auto-activates on keystrokes)
  '-- PASSPORT MODE: Identity card when idle (>5s no typing)
```

### Communication Flow

1. Content script captures raw `keydown`/`keyup` events with `performance.now()` timestamps
2. Events stream to service worker via `chrome.runtime.connect()` long-lived port
3. Service worker calculates metrics in real-time, batches to storage every 30s
4. Side panel connects to service worker via port, receives live metric updates
5. Side panel auto-toggles between live/passport mode based on typing activity

---

## Metrics Captured

### Tier 1 — Highest Discriminative Power (Passport Headline Stats)

Research confirms these are the strongest identity signals, ranked by discriminative power:

| Metric | Definition | Calculation | Why It Matters |
|--------|-----------|-------------|----------------|
| **Digraph DD (Down-Down)** | Timing between consecutive key presses for letter pairs | `keydown[n+1] - keydown[n]` for home-row pairs (er, th, he, re, in) | #1 discriminator in literature. Home-row digraphs are most stable. |
| **Negative Flight Time** | Key overlap — pressing next key before releasing current | `keydown[n+1] - keyup[n]` when negative | Subconscious motor pattern. Very hard to fake. Highly discriminative. |
| **Punctuation/Modifier Dwell** | Hold time on spacebar, Enter, Shift, period | `keyup - keydown` for modifier keys | #2 most stable signal. Spacebar dwell alone is highly unique. |
| **Dwell Time (H)** | Per-key hold duration | `keyup_timestamp - keydown_timestamp` per key | Core CMU benchmark feature. 31-dimensional vector standard. |
| **Up-Down (UD) Flight** | Signed flight time between key release and next press | `keydown[n+1] - keyup[n]` (signed, can be negative) | Combined with H and DD forms minimum viable feature set. |

### Tier 2 — Behavioral Signatures (Secondary Stats)

| Metric | Definition | Calculation |
|--------|-----------|-------------|
| **Typing Speed + Variance** | WPM with standard deviation over session | `(chars / 5) / (seconds / 60)` + `std_dev(WPM per 30s window)` |
| **Rhythm Profile** | Burst vs. smooth typing ratio | Consecutive flight times < 50ms = burst; > 200ms = pause |
| **Error Rate** | Backspace/delete frequency | `(backspace_count + delete_count) / total_keystrokes` |
| **Shift Hand Preference** | Which hand holds shift for capitalization | Track left-shift vs right-shift usage ratio + overlap timing |
| **Pause Patterns** | Word boundary vs. sentence boundary pauses | Flight times at space/period vs. intra-word |

### Tier 3 — Force Metrics (Hardware Layer — Jitter's Competitive Moat)

**Critical finding:** No competitor captures hardware force data. This is wide open.

| Metric | Definition | Calculation | Availability |
|--------|-----------|-------------|-------------|
| **Hall Effect Analog Depth** | Continuous key depression depth (0.0–1.0) | Wooting SDK at 4000Hz via native daemon | Wooting/Razer HE keyboards only. Requires native companion app — browsers block WebHID for keyboards. |
| **Touch Pressure** | Normalized strike force on touchscreens | `PointerEvent.pressure` (0.0–1.0) | Touch devices only. Apple killed 3D Touch (iPhone 11+). Android inconsistent across OEMs. |
| **Pressure-Dwell Correlation** | Relationship between strike force and hold time | `corr(peak_pressure, dwell_time)` | Requires force data from either source above. |

**Architecture note:** Force data requires a native companion daemon + IPC bridge (WebSocket or native messaging). The extension gracefully degrades to timing-only when no companion is installed. This is a patentable tiered architecture.

### Adaptive Template System

Research shows profiles drift within **15 months**. The extension uses a **double serial model**:

- **Anchor Template** — stable long-term identity (updated monthly, confidence-gated)
- **Active Template** — short-term adaptive (rolling window of last 50 sessions)
- **Drift Detection** — flags anomalous changes vs. natural evolution (potential health signal)
- **Minimum sample:** 140 characters per session for reliable metrics (not 50–100 as initially estimated)

---

## Side Panel UI

### Live Mode (Typing Detected)

Activates when keystrokes are flowing. Shows:

- **Rhythm Waveform** — real-time visualization of keystroke timing intervals
- **Overlap Indicator** — highlights negative flight times (key overlaps) as they happen — your subconscious signature
- **Current WPM** — live typing speed with session average
- **Digraph Heat Map** — home-row pair latencies (er, th, he, re, in) updating live
- **Per-Key Dwell Bars** — animated bars showing hold time per key, with spacebar/Enter/Shift highlighted
- **Session Progress** — keystroke count with 140-char minimum threshold indicator (reliable sample)
- **Force Gauge** — if companion daemon connected, real-time analog depth visualization

### Passport Mode (Idle > 5 Seconds)

Identity card layout with aggregate stats:

- **Jitter Score** — overall uniqueness confidence (0-100), based on combined H + DD + UD feature vector
- **Identity Tier** — timing-only (standard) vs. timing+force (premium) — shows which tier is active
- **Lifetime Stats** — total keystrokes, sessions, hours tracked, days since enrollment
- **Top 10 Digraph Signatures** — your most distinctive home-row pair timings visualized as a fingerprint
- **Overlap Frequency** — percentage of keystrokes with negative flight time (unique behavioral marker)
- **Stability Trend** — profile consistency over time (anchor vs. active template divergence)
- **Drift Alert** — flags anomalous changes that deviate from natural evolution
- **Per-Key Fingerprint Map** — keyboard heatmap with modifier keys (spacebar, Shift, Enter) emphasized
- **Force Profile** — if available, pressure curve visualization (unique to Jitter — no competitor has this)

---

## Privacy Model

| Rule | Implementation |
|------|---------------|
| **Zero network** | No fetch/XHR/WebSocket calls. Nothing leaves the browser. |
| **Skip passwords** | Content script ignores `input[type="password"]` fields |
| **No content stored** | Only timing deltas stored, never characters or text |
| **User controls** | Pause/resume capture toggle, clear all data button, per-site blacklist |
| **Local storage only** | `chrome.storage.local` — no sync, no cloud, no telemetry |
| **Open source** | Extension code fully auditable |

---

## Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Jitter — Typing Passport",
  "version": "0.1.0",
  "description": "Your keystroke biometric identity. Privacy-first typing passport.",
  "permissions": ["storage", "sidePanel"],
  "host_permissions": ["<all_urls>"],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["capture.js"],
    "run_at": "document_idle"
  }],
  "side_panel": {
    "default_path": "panel.html"
  },
  "background": {
    "service_worker": "worker.js"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

---

## File Structure

```
jitter-extension/
  manifest.json           # Extension manifest (Manifest V3)
  capture.js              # Content script — keydown/keyup event capture (incl. negative flight detection)
  worker.js               # Service worker — metrics engine + adaptive template management
  panel.html              # Side panel HTML shell
  panel.js                # Side panel UI logic (live/passport toggle)
  panel.css               # Passport styling
  metrics.js              # Metric calculation library — H, DD, UD, signed flight, digraph engine
  templates.js            # Double serial adaptive template system (anchor + active)
  storage.js              # Storage abstraction (chrome.storage.local)
  companion.js            # Native messaging bridge for Wooting/HE force data (optional)
  icons/
    icon-16.png
    icon-48.png
    icon-128.png
```

---

## Technical Notes

- `performance.now()` provides microsecond-precision timestamps in content scripts
- Long-lived ports (`chrome.runtime.connect`) preferred over one-shot messages for continuous keystroke streams
- Service worker handles metric computation to keep content script lightweight
- Side panel persists across tab navigation (unlike popups which close on blur)
- `chrome.storage.local` limit is 10MB default, `unlimitedStorage` permission available if needed
- Content script uses capture phase (`addEventListener(..., true)`) for earliest event interception

## Benchmarks (from research)

| Method | EER | Context |
|--------|-----|---------|
| Classical classifiers (CMU fixed password) | 7.5–10% | Baseline |
| Deep learning (CMU fixed password) | 0.65% | Best published, controlled |
| TypeNet (168K users, free text, physical keyboard) | 2.2% | Real-world free text |
| TypeNet (60K users, free text, touchscreen) | 9.2% | Mobile is harder |
| TypeFormer (mobile, 2024) | 3.25% | State-of-art mobile |
| Force-augmented (research hardware) | <0.5% | Approaching fingerprint |
| Fingerprint (comparison) | 0.1–0.5% | Gold standard |

- Minimum sample: **140 characters** per session for reliable metrics
- Profile drift: measurable within **15 months** without adaptive templates
- Adaptive templates reduce FRR by **~50%** vs static
- Top discriminators: **digraph DD (home-row) > punctuation dwell > negative flight time > per-key dwell**
- `performance.now()` has ±0.1ms browser jitter (Spectre mitigation) — averages out across samples

## Competitive Positioning

**Jitter's moat — what NO competitor does:**
1. Hardware force layer (Hall effect analog depth via companion daemon)
2. Portable cross-site typing passport (not locked to one platform)
3. Transparent drift visualization (the "jitter" in the name)
4. Negative flight time as a primary signal (subconscious, unfakeable)
5. Tiered architecture: timing-only (standard) gracefully upgrades to timing+force (premium)

**Closest competitor:** TypingDNA — timing-only, $8.8M raised, no Series B, deprecated free-text mode. Developer API exists but no hardware signal depth.

**Not competitors:** Turnitin Clarity (process provenance, not identity), BioCatch ($1.3B, banking-only, no dev API).

**Market:** $2.9B behavioral biometrics, 26% CAGR to $18B by 2033. Keystroke dynamics = 39% of category.

---

## Sources

- Chrome Extensions Manifest V3 docs
- Chrome Side Panel API
- MDN: Performance.now(), PointerEvent.pressure
- CMU Keystroke Benchmark Dataset
- TypeNet: Deep Learning Keystroke Biometrics (arxiv 2101.05570)
- TypeFormer: Transformers for Mobile Keystroke Biometrics (Springer, 2024)
- Science Advances: Pressure sensor for identity authentication (2025)
- PMC: "A Survey of Keystroke Dynamics Biometrics"
- ACM Computing Surveys: "Keystroke Dynamics: Concepts, Techniques, and Applications"
- Wooting Analog SDK (github.com/WootingKb/wooting-analog-sdk)
- Jitter Protocol provisional patent specification (Denis Gingras, 2026)
- Competitive research: TypingDNA, Turnitin Clarity, BioCatch, BehavioSec/LexisNexis, KeyTrac, Plurilock
