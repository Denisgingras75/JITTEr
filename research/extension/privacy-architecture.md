# Jitter Privacy Architecture — "See Patterns, Never Content"

**Date:** 2026-03-02
**Agent:** my-guy
**Purpose:** Technical privacy design documentation for patent filing — on-device processing model, data minimization, regulatory positioning

---

## 1. Core Principle

Jitter captures HOW you type, never WHAT you type.

The distinction is not semantic — it is architectural. The content script that runs on every page receives keydown and keyup events. It records the key code (e.g., `KeyA`, `Space`, `ShiftLeft`) and the high-resolution timestamp from `performance.now()`. The characters you are typing — the semantic content — are never read, never stored, never transmitted.

Every metric Jitter produces is derived from timing deltas between events. The underlying text is irrelevant and inaccessible to the system by design.

---

## 2. Data Flow — On-Device Pipeline

```
RAW EVENTS (content script)
  keydown: { code: "KeyA", t: 1234567.891 }
  keyup:   { code: "KeyA", t: 1234567.981 }
  keydown: { code: "KeyN", t: 1234568.102 }
  ...
  |
  | [Long-lived chrome.runtime.connect() port — never persisted]
  v

FEATURE EXTRACTION (service worker — background)
  Dwell time per key:   keyup.t - keydown.t
  Digraph DD timing:    keydown[n+1].t - keydown[n].t for pairs
  Flight time (signed): keydown[n+1].t - keyup[n].t
  Negative flights:     overlapping keypresses (subconscious motor pattern)
  Modifier dwell:       Space, Enter, Shift, Backspace hold durations
  |
  | [All computation local — zero network calls]
  v

STATISTICAL AGGREGATION (service worker)
  Per-session rolling statistics:
    mean, std_dev, p25, p75 per metric
    Adaptive template comparison (anchor vs. active)
    Jitter Score: weighted composite (0–100)
  |
  | [Written to chrome.storage.local as computed stats only]
  v

SCORE OUTPUT (side panel / site SDK)
  Confidence score (0.0–1.0)
  Classification: human_confident | human_likely | uncertain | bot_likely
  Session metadata: keystrokes counted, session duration, sample adequacy flag
  |
  | [Raw events never leave service worker memory — GC'd after processing]
  v

SITE RECEIVES (optional integration)
  Confidence score only
  Classification label only
  Session adequacy flag (minimum 140 chars reached?)
  NO raw timing data. NO key codes. NO behavioral vectors.
```

---

## 3. What Is Captured vs. What Is Stored vs. What Leaves the Device

| Layer | Data | Captured | Stored | Leaves Device |
|-------|------|----------|--------|---------------|
| Raw events | Key codes + timestamps | Yes (in-memory only) | Never | Never |
| Raw events | Characters typed | Never | Never | Never |
| Computed metrics | Dwell times per key | Yes | Aggregates only | Never |
| Computed metrics | Digraph timings | Yes | Aggregates only | Never |
| Computed metrics | Flight times | Yes | Aggregates only | Never |
| Profile | Adaptive template vectors | Yes | Yes (local) | Never |
| Output | Confidence score | Derived | No | Only on explicit site integration |
| Output | Classification label | Derived | No | Only on explicit site integration |

The critical distinction: even the `chrome.storage.local` data contains only statistical aggregates (means, standard deviations) — not a log of raw events. A forensic examination of extension storage would reveal a behavioral profile, not a keystroke log.

---

## 4. Password Field Exclusion

The content script inspects the DOM element receiving focus before attaching keystroke listeners.

```javascript
function shouldCapture(element) {
  if (!element) return false;
  if (element.tagName === 'INPUT' && element.type === 'password') return false;
  if (element.getAttribute('autocomplete') === 'current-password') return false;
  if (element.getAttribute('autocomplete') === 'new-password') return false;
  return true;
}

document.addEventListener('focusin', (e) => {
  captureActive = shouldCapture(e.target);
}, true);
```

Password exclusion is enforced at the event-capture layer — no events from password fields enter the pipeline at all. There is no password-related data to strip downstream because it is never collected.

Additional exclusions: `input[type="hidden"]`, elements with `aria-hidden="true"`, and any element with a `data-jitter-exclude` attribute (site opt-out mechanism).

---

## 5. Content Script Privacy Model

The content script is intentionally minimal. Its sole responsibility is forwarding timing signals to the service worker.

What the content script does:
- Listens for `keydown` and `keyup` events in capture phase
- Reads `event.code` (physical key identifier) and `performance.now()` timestamp
- Checks whether capture is active (password exclusion, user pause, per-site blacklist)
- Sends `{ code, t, type }` objects via long-lived port to the service worker

What the content script never does:
- Read `event.key` (the actual character) for storage purposes
- Access `event.target.value` (the field contents)
- Read the page DOM beyond the focused element's type
- Make network requests
- Access `localStorage`, `sessionStorage`, or cookies

The content script has no storage access. It cannot persist anything. All state lives in the service worker.

---

## 6. On-Device Processing — Service Worker Architecture

The service worker performs all computation. It never makes network calls to Jitter servers.

```
chrome.runtime.onConnect listener
  Receives event stream from content script port
  Buffers events in memory (circular buffer, max 500 events)
  Runs metric calculation every 50 keystrokes or every 10 seconds
  Flushes computed stats to chrome.storage.local every 30 seconds
  Pushes live metric updates to side panel port

Metric computation functions (metrics.js):
  calculateDwell(events)         → per-key dwell distribution
  calculateDigraphs(events)      → home-row pair DD timings
  calculateFlightTimes(events)   → signed UD flight distribution
  detectNegativeFlights(events)  → overlap count, frequency, characteristic pairs
  calculateModifierDwell(events) → Space/Enter/Shift hold distribution
  updateAdaptiveTemplate(stats)  → anchor + active template delta comparison
  computeJitterScore(stats)      → weighted composite 0–100
```

Network isolation is enforced by omitting the `webRequest` permission from the manifest and including no fetch/XHR calls in any extension script. The Chrome Web Store's automated review detects outbound network calls — absence of them is independently verifiable.

---

## 7. What Sites Receive

Sites that integrate the optional Jitter SDK receive only derived scores, never behavioral vectors.

The site SDK pattern:

```javascript
// Site integration (optional)
const result = await JitterSDK.getScore({ minSamples: 140 });
// Returns:
{
  score: 0.87,                    // 0.0–1.0 confidence of human authorship
  classification: "human_likely", // human_confident | human_likely | uncertain | bot_likely
  adequate: true,                 // minimum sample threshold met
  session_chars: 312              // chars counted (not content)
}
// Does NOT return:
// - Raw timing data
// - Key codes
// - Digraph vectors
// - Template data
```

The site receives a confidence score equivalent in information density to a reCAPTCHA v3 score. The underlying biometric computation is opaque to the site by design.

---

## 8. Comparison to Worldcoin — Less Invasive by Every Measure

| Dimension | Worldcoin (Iris Scan) | Jitter (Keystroke Timing) |
|-----------|----------------------|--------------------------|
| Data collected | Iris biometric (permanent, immutable) | Behavioral timing patterns (can change) |
| Collection context | Requires explicit orb scan, in-person | Passive during normal typing |
| Reversibility | Iris cannot be changed if compromised | Behavioral profiles can be reset/cleared |
| Body part captured | Eye (organ) | Finger movement timing (behavioral) |
| Uniqueness persistence | Lifetime | Degrades over ~15 months without adaptation |
| On-device processing | No — iris image sent to Worldcoin servers | Yes — all computation local |
| What operator receives | Verified unique-human credential | Confidence score |
| User control | Cannot "un-scan" | Can delete profile, pause capture |
| GDPR category | Special category (biometric for unique ID) | Behavioral analytics (less restrictive) |
| Revocability | Cannot revoke iris data | Can clear all Jitter data |

Jitter's privacy posture is meaningfully weaker than Worldcoin by every classification axis. This matters for patent framing and regulatory positioning.

---

## 9. GDPR and CCPA Compliance Considerations

**GDPR — Behavioral Biometrics Classification:**

Article 9 covers "biometric data for the purpose of uniquely identifying a natural person." Regulators have increasingly treated behavioral biometrics as potentially falling under Article 9 when used for authentication. Jitter's processing model reduces exposure:

- All processing on-device: no data controller receives biometric data
- User is both data subject and the sole party with access to their profile
- When Jitter is used as a passive human-verification signal (not identity), Article 9 likely does not apply
- Consent mechanism: user installs extension voluntarily; install constitutes consent for personal use

**CCPA — Sensitive Personal Information:**

California's CPRA (effective 2023) added biometric data to the sensitive personal information category. Same analysis applies: because data never leaves the device, there is no "business" collecting it in the CCPA sense for personal extension use. Site integration (SDK) would trigger CCPA obligations for the site, not for Jitter.

**Privacy by Architecture:**

The strongest GDPR/CCPA defense is that raw biometric data never exists in a form accessible to any party other than the user. This is architectural privacy, not policy privacy. Architecturally, Jitter more closely resembles a local password manager (data on device, user controls) than a behavioral analytics vendor (data in cloud, vendor controls).

---

## 10. User Controls

| Control | Implementation | Access Point |
|---------|---------------|-------------|
| Pause/resume capture | Toggle in side panel; sets `captureActive` flag | Side panel UI |
| Clear all data | Deletes `chrome.storage.local` profile | Side panel settings |
| Per-site blacklist | Domain stored in exclusion list; content script checks on focus | Side panel settings |
| Data export | Exports stored stats as JSON (no raw events — none stored) | Side panel settings |
| Exclude field | `data-jitter-exclude` attribute on any element | Site developer option |
| Uninstall | Removes all stored data via `chrome.storage.local.clear()` on uninstall event | Standard uninstall |

The data export feature is important for GDPR Article 20 (right to data portability). The exported JSON contains only the statistical profile, not a raw keystroke log.

---

## 11. Privacy as Competitive Moat

BioCatch — the market leader in behavioral biometrics for banking — operates by collecting approximately 3,000 behavioral signals per session, transmitting them all to BioCatch servers, and running analysis in their cloud. Their model requires banks to send raw behavioral telemetry to a third-party vendor.

Jitter's on-device architecture is the inverse. This creates a durable competitive moat:

- Enterprises that cannot send behavioral data to third parties (regulated industries, government) can use Jitter
- Sites can surface Jitter confidence scores without ever handling biometric data themselves
- Users trust Jitter more because the architecture makes misuse impossible, not just policy-prohibited
- Privacy-first positioning differentiates from every existing behavioral biometrics vendor

The privacy architecture is not a compliance checkbox. It is the product.

---

## Sources

- Chrome Extensions Content Script documentation (developer.chrome.com)
- GDPR Article 9: Special categories of personal data (gdpr-info.eu)
- CPRA (California Privacy Rights Act) — sensitive personal information definition
- BioCatch architecture overview (biocatch.com/technology)
- Worldcoin World ID documentation (worldcoin.org/world-id)
- ICO (UK): Guidance on biometric data (ico.org.uk, 2023)
- CNIL (France): Biometric data and behavioral analytics guidance (2022)
- Condrey 2026: arXiv:2601.17280 — Insecurity of Keystroke-Based AI Authorship Detection
- Jitter Protocol provisional patent specification (Denis Gingras, 2026)
