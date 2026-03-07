# JITTER IDEAS

Parked ideas and future directions. Items here are NOT built unless explicitly noted. Review before promoting to implementation.

---

# PART 32: SESSION HAPTICS — MOBILE BIOMETRICS BEYOND THE TEXT BOX

Date added: 2026-03-07

## The Problem This Solves

Slider-only reviews (WGH review bar, no text field) give JITTEr zero keystroke signal. A bot that skips the text box entirely has no WAR score to fake. Session haptics extends biometric capture to the whole app session — not just the text box.

## Signals Available Without a Keyboard (Standard Touch Events)

- **Slider drag behavior** — velocity, overshoot-correct, hold duration before release. Unique per user. Hard to fake consistently across months.
- **Scroll velocity + deceleration** — flick vs. drag, inertia profile, stop patterns.
- **Touch area (radiusX, radiusY)** — finger contact size. Consistent per user, varies by finger.
- **Touch force (iOS only)** — `touch.force` 0.0–1.0. Available on some iPhones. DO NOT build primary signal here — 3D Touch abandoned after iPhone XS, Android support is fragmented. Use as supplementary only where available.
- **Tap rhythm** — inter-tap timing on navigation elements. Similar to inter-key interval.
- **Session duration + scroll depth** — how long they stayed, how far they read before reviewing.

## Architecture

Separate signal module, WGH-specific first. DO NOT merge into JITTEr core until signal is validated on real data. If scroll/haptic WAR improves detection on real WGH sessions, then promote to core.

```js
// Sketch only — not built yet
JitterSession.init({ siteKey: 'wgh' }); // attach to whole page, not just textarea
JitterSession.score(); // returns haptic WAR in addition to typing WAR
```

## Status

**Not built. Parked until WGH is live and we have real typing data first.**
Priority: after attestation server, after first real WGH reviews, not before.

## Why This Matters for the Pitch

A bot that fakes the text box still has to fake the slider drag and scroll pattern — consistently, over months. The time wall gets harder to climb when the signals extend beyond typing. Session haptics is the answer to slider-only bot mitigation long-term.

---

# PARKED: ESSAY MODE (EssayMode)

Date added: 2026-03-07
Status: **Not built. Parked.**

Long-form writing mode with writing ledger, checkpoints, and replay. Currently exists as extension-only (`writer.js`). Future: standalone EssayMode component for education/essay verification use case.

---

# PARKED: HALL EFFECT KEYBOARD SUPPORT (WebHID)

Date added: 2026-03-07
Status: **Not built. Parked.**

Analog keyboards (Wooting, etc.) provide continuous key travel depth via WebHID API. Pressure curves are unique per-user biometric signal. `wooting-analog.js` exists as prototype in extension. Future: integrate as supplementary WAR signal if analog keyboards reach meaningful market share.

---
