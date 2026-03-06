# Force Curve Biometrics: The Physically Unfakeable Identity Signal
## Jitter Protocol — Patent Filing & Product Design Research
**Date:** 2026-03-02
**Purpose:** Technical case for analog key depth as a biometric signal — what it captures, why it cannot be faked, academic validation, and Jitter patent claims
**Classification:** Confidential IP Research

---

## Table of Contents

1. [What Force Curves Are](#1-what-force-curves-are)
2. [Per-Keystroke Force Features](#2-per-keystroke-force-features)
3. [Why Force Is Harder to Fake Than Timing](#3-why-force-is-harder-to-fake)
4. [Academic Validation](#4-academic-validation)
5. [The Timing + Force Combination](#5-timing-plus-force)
6. [Per-Key Force Fingerprint](#6-per-key-force-fingerprint)
7. [Software Bots Cannot Produce Force Data](#7-bots-cannot-fake-force)
8. [Tiered Architecture: Graceful Upgrade](#8-tiered-architecture)
9. [Patent Claims and Prior Art Analysis](#9-patent-claims)
10. [Open Research Questions](#10-open-questions)

---

## 1. What Force Curves Are

### 1.1 The Shape of a Keypress

A Hall Effect keyboard at 1000 Hz samples every key's depth 1000 times per second. A single keypress — from first finger contact to full key release — takes approximately 80–200ms, yielding 80–200 samples per keystroke.

These samples trace the **force curve**: the complete analog trajectory of a keystroke through its full travel.

```
Depth (0.0 = rest, 1.0 = bottom-out)
1.0 |                    ___________
    |                   /           \
    |                  /             \
0.5 |- - - - - - - - -/- - - - - - - \- - - (actuation threshold)
    |                /                 \
    |               /                   \
0.0 |______________/                     \__________
    0ms         20ms   45ms    80ms    120ms    150ms
                 ^               ^
              keydown          keyup
              event            event
```

**Standard keyboards report:** keydown at ~20ms, keyup at ~120ms. Dwell time = 100ms. That is the entirety of the signal.

**Hall Effect keyboards report:** every sample point in that curve. The shape, velocity, and trajectory of the entire depression and release.

### 1.2 Why the Shape Is Biometric

The force curve shape is determined by:
- **Finger mass:** Heavier fingers carry more momentum, producing a different approach velocity
- **Muscle tone:** Higher tone means faster, more controlled depression; lower tone means softer, less linear curves
- **Joint mechanics:** Finger angle relative to the key changes the mechanical advantage and curve shape
- **Habit-specific motor programs:** The brain has a learned motor program for each key — "how to press F" is different from "how to press spacebar" and varies by typist
- **Fatigue state:** Curves shift predictably as hands tire
- **Emotional state:** Stress increases grip force and bottom-out depth

None of these factors are visible in timing data. They are all encoded in the curve shape.

---

## 2. Per-Keystroke Force Features

### 2.1 Feature Extraction from a Single Keystroke Force Curve

The following features can be computed from a single keystroke's depth-over-time trajectory:

| Feature | Symbol | Definition | Typical Range |
|---|---|---|---|
| Peak depth | D_max | Maximum depth reached (fraction of full travel) | 0.8–1.0 (most typists bottom out) |
| Approach velocity | V_approach | Rate of depth change from first contact to actuation | 10–80 mm/s |
| Ramp rate | R | Slope of depth curve from first contact to actuation threshold (linear approximation) | 0.02–0.20 depth/ms |
| Actuation momentum | M_act | Depth × velocity at the moment of actuation event | Derived |
| Bottom-out duration | T_bo | Time spent at or near maximum depth (depth > 0.95) | 0–60 ms |
| Release slope | S_rel | Rate of depth decrease during key release phase | Negative value, varies by key |
| Release trajectory shape | Curve fit residual vs linear | How non-linear the release curve is | Low (linear) to high (curved) |
| Pre-contact noise | σ_pre | Depth variance in the 10ms window before first contact | Very small; finger approach tremor |
| Post-release oscillation | A_osc | Oscillation amplitude after key returns to rest | Captures key spring dynamics + finger recoil |

### 2.2 Feature Extraction Code Pattern

```javascript
function extractForceCurveFeatures(samples) {
  // samples: Array of { t: number, depth: number }
  // Assumes first sample where depth > 0.02 = contact
  // Assumes actuation at depth = 0.50 (configurable)

  const contactIdx = samples.findIndex(s => s.depth > 0.02);
  const actuationIdx = samples.findIndex(s => s.depth >= 0.50);
  const peakIdx = samples.reduce((maxI, s, i) =>
    s.depth > samples[maxI].depth ? i : maxI, 0);
  const releaseStart = samples.findIndex((s, i) =>
    i > peakIdx && s.depth < samples[peakIdx].depth - 0.05);

  const contactT = samples[contactIdx].t;
  const actuationT = samples[actuationIdx].t;
  const peakT = samples[peakIdx].t;
  const releaseT = samples[releaseStart].t;

  const approachDuration = actuationT - contactT;
  const approachDepth = samples[actuationIdx].depth - samples[contactIdx].depth;
  const rampRate = approachDepth / approachDuration;  // depth/ms

  const peakDepth = samples[peakIdx].depth;
  const boSamples = samples.filter(s => s.depth > 0.95);
  const bottomOutDuration = boSamples.length > 0
    ? boSamples[boSamples.length - 1].t - boSamples[0].t
    : 0;

  const releaseSamples = samples.slice(releaseStart);
  const releaseSlope = releaseSamples.length > 1
    ? (releaseSamples[releaseSamples.length - 1].depth - releaseSamples[0].depth)
      / (releaseSamples[releaseSamples.length - 1].t - releaseSamples[0].t)
    : 0;

  return {
    peakDepth,
    rampRate,
    approachVelocity: approachDepth / (approachDuration / 1000),  // depth/second
    bottomOutDuration,
    releaseSlope,
    actuationToBottomOut: peakT - actuationT,
  };
}
```

### 2.3 Session-Level Aggregation

Per-keystroke features are aggregated across a session to produce stable statistical summaries:

| Aggregate | Description |
|---|---|
| Mean ramp rate per key | Average approach velocity for each specific key |
| Ramp rate coefficient of variation | How consistent approach velocity is across sessions |
| Bottom-out rate | Fraction of keystrokes that reach full depth |
| Per-key peak depth distribution | Each key has a characteristic depth profile |
| Release slope distribution | Shape of release curves across all keys |

A full typing session of 300+ keystrokes produces hundreds of feature values per user. PCA or learned embeddings reduce this to a compact profile vector for comparison.

---

## 3. Why Force Is Harder to Fake Than Timing

### 3.1 The Conscious vs. Subconscious Divide

Timing biometrics (dwell time, flight time) are partially accessible to conscious manipulation. An adversary who knows they are being profiled can deliberately slow down, introduce pauses, or mimic another person's rhythm — to a degree. It is effortful and degrades typing quality.

Force curves operate entirely in the subconscious motor system. The approach velocity of a finger depressing a key is not consciously controlled. It emerges from:
- Finger mass and leverage (anatomical — unchangeable)
- Learned motor programs stored in the cerebellum and basal ganglia (habitual — slow to change)
- Current muscle tone state (physiological — not directly controllable)

**To fake a force curve, an adversary would need to:**
1. Obtain a recording of the target's force curves (requires compromising their HE keyboard's HID output)
2. Train themselves to reproduce those approach velocities and curve shapes for each key
3. Maintain that altered motor behavior consistently for an entire typing session

This is not feasible. The learning required to deliberately alter per-key force curves to match another person would take months and would degrade typing speed dramatically. Unlike timing, which can be consciously adjusted, force curves require relearning the physical motor program for typing — comparable to learning to type with a completely different finger assignment.

### 3.2 The Physical Constraints

| Factor | Timing Biometrics | Force Curve Biometrics |
|---|---|---|
| Conscious access | Partial — timing can be felt | None — approach velocity is not perceptible |
| Training required to fake | Weeks of practice | Months; likely not fully achievable |
| Degrades under training | Minimal | Severe (relearning motor programs) |
| Depends on anatomy | No | Yes (finger mass, length, joint mechanics) |
| Depends on physiology | Partially (muscle tone) | Strongly (muscle tone, fatigue) |
| Requires special hardware to capture | No | Yes (HE keyboard) |
| Can be replayed by software | Timing can be scripted | Cannot — requires physical key depression |

### 3.3 The Anatomical Component

Finger mass and joint geometry create a characteristic mechanical signature. The same neural signal from the motor cortex, sent to a heavier finger, produces a different force curve than sent to a lighter finger. This is biomechanical — not behavioral.

For biometric purposes, this means part of the force curve signal is **anatomical** (like fingerprint ridge spacing) rather than purely behavioral (like signature style). Anatomical signals are harder to change and provide a more stable long-term profile.

---

## 4. Academic Validation

### 4.1 Science Advances 2025: SFIK Self-Powered Keyboard

**Study:** "Self-Powered Flexible Ionic Keyboard for Biometric Authentication" (Science Advances, 2025; referenced as SFIK in this dossier)

**Hardware:** Custom-built flexible keyboard with per-key ionic pressure sensors — distinct from commercial Hall Effect keyboards but conceptually equivalent (analog force measurement per key).

**Results:**

| Test Condition | Accuracy |
|---|---|
| Fixed password, same session | 95.3% |
| Fixed password, cross-session | 91.8% |
| Dynamic text (arbitrary typing) | 100% |

The 100% accuracy on dynamic text is particularly striking. Fixed-password typing allows adversaries to practice the specific phrase; dynamic text is the real-world condition and is harder to spoof. The result suggests that force data, combined with sufficient keystrokes, may be a near-perfect behavioral biometric.

**Limitations for Jitter:**
- Custom hardware, not commercial HE keyboards
- Study participants likely not attempting active evasion (cooperative subjects)
- Sample sizes not reported in summary; exact study methodology not reviewed
- 100% accuracy should be treated with appropriate skepticism until replicated

### 4.2 Nano Energy 2025: Piezoelectric-Triboelectric Coupling

**Study:** Dual-verification keyboard using piezoelectric and triboelectric sensors (Nano Energy, 2025)

**Key finding:** Combining two sensor modalities (force via piezoelectric + contact via triboelectric) with per-key isolation yielded identity verification metrics outperforming either modality alone.

**Relevance to Jitter:** This supports the "timing + force" combination strategy — dual modalities with independent physical bases produce compound accuracy improvements. Jitter's approach of combining standard timing signals (independent of force) with HE force curves follows the same principle.

### 4.3 The Gap: No Academic Work on Commercial HE Keyboards for Biometrics

A systematic review of the academic literature finds **no published studies** using commercially available Hall Effect keyboards (Wooting, Razer Huntsman V3 Pro, SteelSeries Apex Pro) for biometric identity verification.

Existing research uses:
- Custom force-sensing keyboards (SFIK, piezoelectric studies)
- Laboratory instrumentation (capacitive force plates under keys)
- Mouse force sensors
- Mobile touchscreen pressure

**The commercial HE keyboard opportunity is entirely open.** All existing HE biometric analog research requires custom hardware. Wooting, MCHOSE, and SteelSeries have made commercial HE keyboards available to consumers, but no academic or commercial biometric system has studied them for identity verification.

This is Jitter's most defensible patent position: the first use of commercial Hall Effect keyboards (accessible via WebHID and Wooting Analog SDK) for behavioral biometric identity.

---

## 5. The Timing + Force Combination

### 5.1 Why Combining Independent Signals Compounds Accuracy

Timing biometrics (dwell time, flight time) and force curve biometrics are **statistically independent** — they measure different physical processes:

- Timing: output of the motor timing system (basal ganglia, cerebellum timing loops)
- Force: output of the motor force system (motor cortex, muscle force encoding)

Two typists can have nearly identical timing profiles but entirely different force profiles. The combination is therefore not merely additive — it is multiplicative in the identity space it can distinguish.

**Formal argument:** If P(timing match) for a false accept = 0.05 (5% false accept rate on timing alone) and P(force match) for a false accept = 0.10 (10% false accept rate on force alone), and the signals are independent, then P(timing AND force match) = 0.05 × 0.10 = 0.005 (0.5% false accept rate combined).

This is a rough illustration, not a calibrated empirical claim — but the independence argument is valid and supported by the different physiological systems involved.

### 5.2 EER Projections

| Signal Combination | Expected EER | Basis |
|---|---|---|
| Timing only (standard) | 1.5–4% | CMU 2009, Gunetti & Picardi, extensive literature |
| Force only (HE keyboard) | 2–8% (estimated) | SFIK study extrapolated to commercial hardware |
| Timing + force combined | 0.3–0.7% (projected) | Independence assumption applied to above ranges |

**Target:** EER below 0.5% for the timing + force combination. This is approaching fingerprint-level accuracy (fingerprint EER: 0.1–0.5% for high-quality captures). If achievable with a keyboard already on the user's desk, it represents a transformative capability.

These projections require empirical validation. This is a key research priority: run a study using commercial Wooting keyboards, capture timing + force data from diverse typists under adversarial conditions, and measure actual EER.

### 5.3 Feature Independence Verification

Before deploying the combined model, feature independence should be verified empirically. Correlation analysis between:
- Dwell time (timing) vs. bottom-out duration (force) — potentially correlated
- Flight time (timing) vs. approach velocity (force) — likely independent
- Typing speed (timing aggregate) vs. ramp rate (force) — potentially correlated

Features that are highly correlated provide less additional information than assumed. A PCA decomposition of the combined timing + force feature space will reveal the effective dimensionality — the number of truly independent axes of variation.

---

## 6. Per-Key Force Fingerprint

### 6.1 Finger-to-Key Assignment Creates Structural Variation

Each finger has different mass, length, and muscle tone. The typical right-handed typist assigns:
- Left pinky: A, Q, Z, Shift, Caps Lock
- Left ring: S, W, X
- Left middle: D, E, C
- Left index: F, G, R, T, V, B
- Thumbs: Space
- Right index: J, H, U, Y, N, M
- Right middle: K, I, comma
- Right ring: L, O, period
- Right pinky: semicolon, P, slash, Enter, Backspace

Each finger produces a characteristic force signature on "its" keys. The left pinky, typically the weakest and least trained finger, produces softer, shallower curves. The right index finger, heavily used, produces fast, deep, consistent curves.

**This creates a structural force pattern across the keyboard that maps to the user's anatomy.** The force heatmap of a typing session is not random — it reflects the physical capabilities of each finger.

### 6.2 Key-Specific Force Profiles

Beyond the finger assignment pattern, each individual key acquires a characteristic force profile for a given typist:

- Frequently used keys (E, T, A, O, N, S) are typed with more practiced, consistent force
- Infrequently used keys (Q, Z, X) show higher variance — less motor practice
- Keys requiring multi-finger coordination (shift + letter) show different approach dynamics than single-finger presses
- Keys at reach distance (numbers, function keys) show lower force and higher variance — less practiced motor programs

**Per-key force profiles are a 60–100 dimensional feature space** (one force distribution per key on the keyboard). Combined with timing digraphs, the full feature space is extremely high-dimensional and highly individual.

### 6.3 The Force Heatmap Visualization

A useful diagnostic tool for understanding per-key force profiles is a force heatmap — a keyboard image where each key is color-coded by the user's mean bottom-out depth or mean peak force for that key. Two users' force heatmaps are visually distinct and structurally stable across sessions.

This is the biometric equivalent of a fingerprint image — a spatially structured, visually intuitive representation of an individual's physical characteristics, derived from their interaction with a physical surface.

---

## 7. Software Bots Cannot Produce Force Data

### 7.1 The Bot Problem in Current Keystroke Biometrics

A sophisticated bot attacking a timing-only biometric system can:
1. Record a target's timing patterns from a compromised session
2. Replay those patterns with a software keystroke injector
3. Inject synthetic keydown/keyup events with the target's timing profile

This attack is documented in the academic literature and is a known limitation of timing-only keystroke biometrics. Timing can be replayed in software because timing is just timestamps.

### 7.2 Why Force Curves Cannot Be Replayed

Force curve data requires **physical key depression**. It cannot be:

- **Injected via OS APIs:** Standard keyboard injection APIs (SendInput on Windows, CGEvent on macOS) produce digital keypress events with no analog component. Even if a bot injects keystrokes at a specific timing, no force curve is generated because no key is physically depressed.

- **Faked via WebHID spoofing:** Spoofing a WebHID device to emit analog reports requires a physical device or a kernel-level driver that presents as an HID device. This is feasible for sophisticated attackers but requires:
  - A kernel-mode driver (significant expertise, requires signing on Windows 11)
  - A recording of the target's specific force curve data
  - Real-time playback synchronized with the keypress stream

- **Generated by software keystroke simulators:** No commercial keystroke automation tool (AutoHotkey, PyAutoGUI, Selenium) produces HID analog reports. They produce digital keypress events.

### 7.3 The Attack Surface for Force Spoofing

An adversary who wants to bypass Jitter's force curve verification would need to:

1. Obtain a recording of the target's force curve data (requires compromising the target's HE keyboard HID output — significant physical access or kernel-level compromise)
2. Build or purchase a custom hardware device that emulates an HE keyboard HID interface and replays recorded force curves in real-time
3. Use this device without the actual HE keyboard connected (or modify firmware to replay while still functional)

This attack requires physical-world compromise of the target's environment — the same threat model as forging physical fingerprints. It is not scalable for the bot farm operators that current biometric systems must defend against.

**For Jitter's primary use case (bot farm detection, account sharing, boosting):** All of these operate at scale using software automation. Software cannot produce force curves. This is a categorical, not a degree-based, security advantage.

### 7.4 The Hardware Requirement as a Security Property

The requirement for a Hall Effect keyboard to produce force data is not a limitation — it is a security property:

- Bots cannot have HE keyboards (they operate on virtual machines or remote hosts)
- Booster services operate via remote desktop tools (RDP, TeamViewer) which transmit digital inputs, not analog HID data
- Account sharing via credential sale does not transfer the owner's HE keyboard

In each attack scenario, the absence of force curve data is itself a biometric signal: "this session was either operated by someone without an HE keyboard or by someone operating remotely."

A session with valid timing biometrics but no force curves, on an account that has historically produced force curves, is itself an anomaly flag.

---

## 8. Tiered Architecture: Graceful Upgrade

### 8.1 The Deployment Reality

Not every user has a Hall Effect keyboard. Jitter cannot require HE hardware as a prerequisite for participation — this would exclude the majority of users and undermine adoption.

The correct architecture is **tiered capability with graceful upgrade**:

```
TIER 0: No biometric capability
        (User has disabled JavaScript, or using text-based interface)
        → Fallback to traditional auth (password, OTP)
        Coverage: ~2% of users

TIER 1: Standard timing biometrics
        (Any keyboard, any browser)
        EER: ~2–4%
        Coverage: ~98% of users

TIER 2: Enhanced timing + advanced features
        (Mouse dynamics, pause patterns, error rate analysis)
        EER: ~1–2%
        Coverage: ~85% of users (those who also use a mouse)

TIER 3: Timing + HE force curves (WebHID)
        (Hall Effect keyboard + Chrome/Edge)
        EER: ~0.3–0.7% (projected)
        Coverage: ~3–8% of users currently, growing to ~15–20% by 2028

TIER 4: Timing + HE force curves (native companion)
        (Hall Effect keyboard + companion daemon)
        EER: same as Tier 3 (same data quality)
        Coverage: subset of Tier 3 users willing to install companion
```

### 8.2 Upgrade Path UX

The upgrade prompt should appear contextually — not as a signup requirement but as a value proposition:

- **During enrollment:** "We detected a Hall Effect keyboard. Connect it for fingerprint-level identity verification."
- **During a suspicious session:** "Your recent session was flagged as potentially anomalous. Connect your Hall Effect keyboard for enhanced verification."
- **In profile settings:** "Upgrade your identity passport with force curve biometrics — learn more."

The upgrade is always optional. Users on Tier 1 receive a fully functional Jitter identity. Tier 3/4 users receive a materially stronger identity with fewer false positives.

### 8.3 Passport Versioning

Jitter passports should be versioned by capability tier:
- Passport v1: timing-only profile
- Passport v3: timing + force curve profile (when HE data is added, the passport is upgraded, not replaced)

A Tier 3 passport implicitly contains a Tier 1 component — force curve sessions also include timing data, so the timing profile continues to accumulate and improve.

---

## 9. Patent Claims and Prior Art Analysis

### 9.1 Core Novel Claim

**Claim:** A method for behavioral biometric identity verification comprising: (a) receiving, from a Hall Effect analog input device, a time-series of per-key analog depth measurements for each keystroke in a typing session; (b) extracting force curve features from said time-series including ramp rate, peak depth, bottom-out duration, and release trajectory; (c) constructing a per-user force curve profile from said features aggregated across a plurality of keystrokes; (d) comparing a candidate session's force curve profile against the stored user profile to produce an identity match score.

### 9.2 Prior Art Survey

| Prior Art | Description | Why It Does Not Anticipate Jitter's Claim |
|---|---|---|
| SFIK (Science Advances 2025) | Custom ionic pressure keyboard, biometric authentication | Custom hardware only, not commercial HE keyboards; no SDK or deployment system |
| Piezoelectric keyboard studies | Lab instrumentation, not consumer hardware | Same as above — custom hardware |
| wooting-js (GitHub) | TypeScript library reading Wooting analog data | Tool for reading data; no biometric processing or identity system |
| kb-hall (GitHub) | MCHOSE analog heatmap visualization | Visualization only; no biometric processing |
| CMU keystroke dataset / academic timing biometrics | Binary keypress timing analysis | No analog depth; timing only |
| Mouse dynamics biometrics | Force and trajectory analysis for mouse input | Different input device; different motor program; different HID interface |
| Fingerprint biometrics | Physical fingerprint ridge capture | Not behavioral; not keyboard-based |
| Vanguard / EAC anti-cheat behavioral analysis | Game-state behavioral anomaly detection | No analog force data; no identity verification; no keyboard biometrics |

### 9.3 Dependent Claims Worth Filing

1. **Claim: Browser-based force curve capture via WebHID.** Specifically using the WebHID API to access vendor-specific HID usage pages of Hall Effect keyboards for biometric data capture.

2. **Claim: Companion daemon IPC bridge.** A native application that reads HE keyboard analog data via manufacturer SDK and exposes it to a browser-based biometric system via local IPC, enabling cross-browser deployment.

3. **Claim: Tiered capability architecture.** A biometric system that operates at variable accuracy tiers based on available hardware, gracefully upgrading from timing-only to timing+force based on detected keyboard capabilities.

4. **Claim: Absence-of-force-data as anomaly signal.** Using the absence of expected force curve data on an account that has historically produced force curves as an independent anomaly indicator for account sharing or remote access fraud.

5. **Claim: Controller analog trigger biometrics.** Extending the force curve biometric method to analog trigger inputs from gaming controllers accessed via the Gamepad API.

6. **Claim: Per-key force fingerprint mapping.** Constructing a spatially-structured force heatmap of the keyboard that captures per-key force distribution reflecting underlying hand anatomy and motor habits.

### 9.4 No Prior Art on Commercial HE Keyboards for Biometrics

The most defensible statement for patent purposes: **no prior art uses commercially available Hall Effect keyboards (Wooting, SteelSeries Apex Pro, Razer Huntsman V3 Pro, MCHOSE) for biometric identity verification.** All existing force-based keyboard biometric research uses custom laboratory hardware.

This is a strong and specific claim. The existence of wooting-js and kb-hall as open-source tools demonstrates that the data is accessible, but accessing data is not the same as building a biometric system. The biometric processing pipeline — feature extraction, profile construction, matching, anomaly detection — is the novel contribution.

---

## 10. Open Research Questions

### 10.1 Questions That Need Empirical Answers Before Patent Filing

| Question | Priority | Method |
|---|---|---|
| What is the actual EER on commercial Wooting keyboards for force-only biometrics? | Critical | Run study: 20+ participants, 5+ sessions each, timing + force features |
| How stable are force curves across sessions? (days, weeks, months) | High | Longitudinal study: same participants over 30 days |
| How much do force curves change with keyboard model? (Wooting vs SteelSeries vs Razer) | High | Cross-device study: same users on different HE keyboards |
| What is the EER for timing + force combined? | Critical | Same dataset as above |
| Can adversarially trained participants reduce Jitter's accuracy? | High | Active evasion study: inform participants they are being profiled |
| What sampling rate is sufficient for force curves? (4000 Hz vs 1000 Hz vs 500 Hz) | Medium | Downsample existing captures, measure accuracy vs rate |
| Are force curves stable across typing speed variations? (fast vs careful typing) | Medium | Within-session analysis |

### 10.2 The "1000 Hz is Enough" Hypothesis

Jitter's current architecture targets 1000 Hz for force curve sampling. The rationale: a typical keypress takes 80–150ms; at 1000 Hz, this yields 80–150 samples per keypress; this is sufficient to characterize the curve shape with high fidelity.

At 4000 Hz (Wooting 60HE+ maximum), you get 320–600 samples per keypress — more than necessary for biometrics and more data to process. Downsampling to 500 Hz for processing while storing raw data at higher rates may be the right architecture.

This should be empirically verified before committing to infrastructure costs.

### 10.3 The Cross-Keyboard Enrollment Problem

If a user enrolls on a Wooting 60HE and later presents on a SteelSeries Apex Pro, will their force curves still match? The mechanical properties of the switches differ slightly (spring weight, magnetic field geometry, ADC precision). The force curve shapes may shift systematically.

**Options:**
1. Enroll on multiple keyboards (user friction)
2. Build keyboard-model normalization into the pipeline (technical complexity)
3. Treat keyboard model as a feature (the combination of user + keyboard is the identity)

Option 3 is simplest and may actually improve accuracy — a user's force curves on their specific keyboard are more stable and distinctive than a model-normalized profile.
