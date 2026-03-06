# Keystroke Biometrics: Deep-Dive Science Reference
## Jitter Protocol — Patent Filing & Product Design Research
**Date:** 2026-03-01
**Purpose:** Technical foundation for patent claims and product architecture
**Classification:** Confidential IP Research

---

## Table of Contents

1. [Core Signals — What Is Actually Measured](#1-core-signals)
2. [Force Sensors in Consumer Hardware](#2-force-sensors)
3. [Temporal Drift — How Profiles Change Over Time](#3-temporal-drift)
4. [Academic Benchmarks — FAR / FRR / EER Numbers](#4-academic-benchmarks)
5. [Feature Discriminative Power Rankings](#5-feature-rankings)
6. [Mobile Keystroke Biometrics](#6-mobile)
7. [Adversarial Robustness](#7-adversarial)
8. [Commercial Landscape](#8-commercial)
9. [Implications for Jitter Protocol Design](#9-jitter-implications)
10. [Key Citations](#10-citations)

---

## 1. Core Signals — What Is Actually Measured

### 1.1 The Fundamental Measurable Events

Every keystroke generates two hardware events: **keydown** (key depression) and **keyup** (key release). From these two primitive events, all timing biometric signals are derived. Modern keyboards report these events with OS-level timestamps that typically resolve to 1–4 ms precision on Windows, and 1 ms precision on Linux. macOS falls in the 4–8 ms range due to event coalescing.

### 1.2 Primary Timing Features

| Feature | Symbol | Definition | Typical Range |
|---------|--------|------------|---------------|
| **Dwell Time** (Hold Time) | H | Time from keydown to keyup for a single key | 50–150 ms |
| **Flight Time** (Up-Down Time) | UD | Time from keyup of key N to keydown of key N+1 | −100 to +300 ms |
| **Down-Down Time** | DD | Time from keydown of key N to keydown of key N+1 | 80–250 ms |
| **Up-Up Time** | UU | Time from keyup of key N to keyup of key N+1 | 80–250 ms |
| **Latency** | L | General term for inter-key interval; often used interchangeably with DD | same as DD |
| **Digraph Latency** | DG | Any timing metric computed for consecutive key pairs (bi-grams) | context-dependent |
| **Typing Speed** | WPM | Words per minute; aggregate rhythm indicator | 30–120 WPM |

**Critical note on Flight Time:** Flight time can be **negative**. This occurs when a user begins pressing the next key before fully releasing the current key — common in fast typists and particularly prevalent in home-row sequences (e.g., "th", "er", "re"). Negative flight times are highly discriminative and should not be discarded as noise.

### 1.3 N-Graph Features (Digraphs, Trigraphs, and Beyond)

An **n-graph** is a timing sequence computed across n consecutive keys:

- **Monograph (1-gram):** Single key dwell time — H(k)
- **Digraph (2-gram):** Timing metrics between two consecutive keys — the backbone of most research
- **Trigraph (3-gram):** Spans three consecutive keystrokes; richer but requires more data
- **Tetragraph / higher-order:** Less commonly used; data sparsity becomes problematic

**Key research finding (ResearchGate, Gunetti & Picardi 2005):** Word-specific digraphs are significantly more discriminative than position-agnostic digraphs. A digraph measured for "th" in the word "the" captures a different motor program than "th" appearing at a word boundary. Systems that ignore word context sacrifice discriminability.

**CMU 2009 benchmark (Killourhy & Maxion):** The standard dataset uses the password `.tie5Roanl` and captures 31 features per typing sample:
- 11 Hold times (H)
- 10 Down-Down intervals (DD)
- 10 Up-Down intervals (UD)

This 31-dimensional feature vector has become the de facto standard for comparing classifiers, though it is fixed-text only.

### 1.4 Aggregate / Higher-Level Features

Beyond raw timing, researchers compute derived statistics that increase robustness to noise:

- **Mean dwell time per key** — user's average hold duration for specific keys
- **Variance of dwell time** — consistency indicator; expert typists show lower variance
- **Coefficient of variation (CV)** — normalized variability; more comparable across users than raw variance
- **Digraph histogram** — distribution of inter-key times across all digraph pairs observed in a session
- **Rhythm autocorrelation** — captures periodic timing patterns in fast typists
- **Error and correction rate** — frequency of backspace, delete; editing behavior is individually characteristic
- **Shift key usage patterns** — which hand is used for capitalization; timing of modifier keys
- **Pause distribution** — histogram of pauses >500ms; reflects cognitive load and planning

### 1.5 What JavaScript Can Capture in a Browser

Standard browser APIs expose:

```javascript
document.addEventListener('keydown', (e) => {
  // e.timeStamp — DOMHighResTimeStamp, sub-millisecond resolution
  // e.code — physical key position (KeyA, KeyS, etc.)
  // e.key — logical character ('a', 'A', etc.)
  // e.location — distinguishes left vs. right Shift, Ctrl, Alt
});

document.addEventListener('keyup', (e) => {
  // Same fields — compute dwell = keyup.timeStamp - keydown.timeStamp
});
```

`e.timeStamp` uses `performance.now()` internally, providing **microsecond precision** before browser fingerprinting mitigations reduced it. As of 2024, Chrome and Firefox apply jitter of ±0.1ms to `performance.now()` to mitigate timing side-channel attacks. This affects keystroke biometric precision slightly but does not eliminate usability — the jitter is random and averages out across many samples.

**What is NOT accessible via browser:**
- Actual key force / pressure (no API exists for standard keyboards)
- Key travel depth
- Key contact surface area
- Hardware-level scan timing (OS adds processing latency)

---

## 2. Force Sensors in Consumer Hardware

### 2.1 Hall Effect Keyboards

Hall effect keyboards use **magnetic field sensing** rather than mechanical contact. Each key switch contains a magnet; as the key is pressed, it moves closer to a Hall effect sensor, which measures the changing magnetic field intensity and converts it to an **analog position value** — continuous key travel depth.

**Key vendors and specifications:**

**Wooting (Lekker switches):**
- 0.1 mm resolution on key travel (4mm total travel)
- Reports analog value from 0.0 to 1.0 per key
- Polling rate: up to 4000 Hz on Wooting 60HE+
- Open-source **Wooting Analog SDK** (Rust-based, cross-platform: Windows/Mac/Linux)
- SDK functions: `read_analog(keycode)` — returns float 0.0–1.0; `read_full_buffer(device_id)` — returns all active key values simultaneously
- Developer portal: dev.wooting.io
- SDK repo: github.com/WootingKb/wooting-analog-sdk

**Razer (optical analog switches, Analog OptoSwitch):**
- Optical sensing; reports analog depth values
- Razer SDK / Synapse provides some developer access, though less open than Wooting
- Targeted primarily at gaming; biometric potential unexploited commercially

**What force data enables for biometrics:**
- **Peak force** — maximum pressure applied during a keystroke
- **Force ramp rate** — how quickly force builds (sharp punch vs. slow press)
- **Force profile shape** — temporal shape of the force curve throughout the keystroke
- **Release trajectory** — rate of force removal on keyup
- **Force variance per key** — whether the user applies consistent force or variable pressure

**Browser access limitation:** The WebHID API (`navigator.hid.requestDevice()`) can technically communicate with HID devices. However, Chrome explicitly **blocks** access to top-level collections declared as generic keyboard usage (Usage Page 0x01, Usage 0x06). This means a web page or browser extension cannot read raw analog values from a Wooting keyboard directly. A **native desktop application** or **OS-level daemon** with an IPC bridge to the browser extension is required for force data.

### 2.2 Apple Force Touch / 3D Touch

**MacBook trackpad (Force Touch, 2015–present):**
- Four capacitive pressure sensors at trackpad corners
- Pressure value: `NSEvent.pressure` (0.0 to 1.0) in AppKit
- Web API: `webkitmouseforcechanged` event with `event.webkitForce` (1.0 = normal click, 2.0 = force click threshold)
- **Only available on macOS Safari** via the non-standard Force Touch Events API
- Not available in Chrome or Firefox on macOS

**iPhone 3D Touch (iPhone 6s – iPhone XS):**
- Three-axis capacitive pressure sensing beneath the display
- API: `UITouch.force` (0.0 to maximumPossibleForce)
- **Discontinued in iPhone 11 and all subsequent models** (2019)
- Replaced by "Haptic Touch" (duration-based, no pressure sensing)

**Implication:** Force data from Apple hardware is inaccessible in cross-browser environments. It is accessible in native iOS/macOS apps and in Safari-only web experiences on macOS. Apple's removal of 3D Touch from iPhone eliminates pressure sensing on the dominant consumer mobile platform.

### 2.3 Android Touch Pressure

Android's `MotionEvent` API exposes `getSize()` and `getPressure()`:
- `getPressure()` — normalized pressure value, 0.0 to 1.0 (but calibration varies wildly by manufacturer)
- `getSize()` — contact area (finger spread)
- `getToolMajor()` / `getToolMinor()` — axis dimensions of the touch ellipse

These are accessible in:
- Native Android apps (Java/Kotlin)
- React Native via native modules
- **Not accessible via mobile browser JavaScript** — `Touch.force` is not implemented in Android browsers

**Reliability problem:** Android pressure sensors are highly inconsistent across devices. Samsung, Google Pixel, and OnePlus devices report very different raw values for equivalent physical force. Cross-device normalization is unsolved in the literature.

### 2.4 Research-Grade Sensor Systems (Not Consumer)

**Science Advances, March 2025 (Zhang et al., doi: 10.1126/sciadv.ads2297):**
A self-powered flexible intelligent keyboard (SFIK) using the **giant magnetoelastic effect** converts key-press mechanical pressure into electrical signals. Specifications:
- Sensing range: 35 to 600 kPa
- Response time: ~300 ms
- Authentication of 8-character fixed password: **95.3% success rate**
- Dynamic text (14 double-key sets): **100% accuracy**
- Self-powered (no external power source required)

**Piezoelectric-triboelectric coupling sensor array (PTCSA):**
Published in Nano Energy, 2025. Dual-verification: password + biometric. Crosstalk-free sensor isolation per key. Demonstrates that force adds a dimension that timing alone cannot provide.

**Research conclusion:** Force-augmented keyboards outperform timing-only systems significantly (100% vs. 95.3% on short passwords), but consumer hardware delivering force data remains limited to Hall effect gaming keyboards. The mass market does not yet have accessible force APIs.

---

## 3. Temporal Drift — How Profiles Change Over Time

### 3.1 The Core Problem

Keystroke biometrics face a fundamental tension: **identity must be stable, but behavior changes**. Unlike fingerprints or irises — which change very slowly over decades — typing patterns respond to many short-term and long-term variables. A system that does not account for drift will experience monotonically increasing false rejection rates over time.

### 3.2 Sources of Temporal Variation

**Short-term (minutes to hours):**
- Fatigue — typing slows and becomes less precise as the session progresses
- Emotional state — stress measurably increases inter-key timing variability (Epp et al., 2011)
- Alcohol/medication — motor control degradation
- Hand temperature — cold hands slow mechanical response
- Input device change — switching from a laptop keyboard to a mechanical keyboard changes timing profiles significantly

**Medium-term (days to weeks):**
- Skill learning — new typists improve rapidly; typing speed and consistency change measurably week to week
- Injury recovery — wrist injury or repetitive strain changes grip and finger usage patterns
- Software/OS changes — new keyboard layouts, autocorrect behavior

**Long-term (months to years):**
- Natural aging — motor speed typically decreases after age 60; fine motor coordination peaks in the 20s-30s
- Neurological conditions — Parkinson's disease is detectable via keystroke metrics with 83–96% sensitivity (Science Advances, 2025)
- Established typing habit consolidation — expert typists in their "learned" phase show higher intra-person stability

**Landmark quantitative finding:** A study measuring genuine score distributions over **15 months** found statistically significant drift in behavioral biometric templates within that window (Impedovo & Pirlo, ACM Computing Surveys, 2019). Systems tested at enrollment vs. 15 months later showed degraded accuracy without template update.

### 3.3 Template Aging and Profile Update Strategies

The literature on adaptive biometric systems (Rattani et al., ACM Computing Surveys 2019; "Adaptive Biometric Systems: Review and Perspectives") defines three main update strategies:

**1. Supervised template update:**
- After successful authentication (high confidence match), append the new sample to the enrollment template
- Risk: "poisoning" — if an imposter successfully authenticates, their data corrupts the template
- Mitigation: score-gated update (only update if match score exceeds a high secondary threshold)

**2. Unsupervised / self-updating:**
- System automatically adapts based on recent samples without requiring explicit verification event
- Suitable for continuous authentication scenarios
- Risk: unconstrained drift — the template may gradually migrate to an imposter's pattern

**3. Hybrid / double serial adaptation:**
Published by Coli et al. (2019, Computers & Security): A "double serial" mechanism that maintains two templates — a stable long-term template and a short-term adaptive template. Authentication succeeds if either template matches. The long-term template provides security anchor; the short-term adapts to drift.

**Quantitative improvement from adaptation:** Studies report that inclusion of a template update module delivers approximately **50% reduction in false rejection rate** over 6–12 month periods compared to static templates.

### 3.4 Practical Protocol for Temporal Robustness

For Jitter Protocol design:

1. **Enrollment phase:** Collect minimum 5–10 sessions over 2–7 days, not a single sitting
2. **Confidence-gated update:** Only incorporate new samples into profile when match confidence exceeds 85th percentile of enrollment distribution
3. **Anchor sample preservation:** Never discard enrollment samples — maintain a fixed anchor template that cannot be updated, used to detect extreme drift
4. **Drift alarm:** If current-session match score consistently falls below enrollment match score by >30%, flag for re-enrollment prompt
5. **Seasonal anchor points:** Periodically (e.g., every 90 days) request a deliberate re-enrollment session

---

## 4. Academic Benchmarks — FAR / FRR / EER Numbers

### 4.1 Definitions

- **FAR (False Acceptance Rate):** Probability that an imposter is incorrectly accepted as the genuine user. Security failure.
- **FRR (False Rejection Rate):** Probability that the genuine user is incorrectly rejected. Usability failure.
- **EER (Equal Error Rate):** The operating point where FAR = FRR. Lower EER = better system. The standard single-number benchmark.
- **Half Total Error Rate (HTER):** (FAR + FRR) / 2 at a fixed operating threshold — more practically meaningful than EER.

### 4.2 Baseline Results — CMU Benchmark (Killourhy & Maxion 2009)

The CMU benchmark remains the canonical reference. 51 users, password `.tie5Roanl`, 400 samples per user (50 samples × 8 sessions). Best results from their comparison of 14 algorithms:

| Detector | EER |
|----------|-----|
| Nearest Neighbor (Manhattan) | 9.6% |
| Mahalanobis distance | 8.0% |
| SVM (RBF kernel) | 7.8% |
| Outlier detection (z-score) | 10.4% |
| **Best performing (Scaled Manhattan)** | **~7.5%** |

The CMU benchmark represents the **timing-only, fixed-text, small-vocabulary** condition with classical classifiers.

### 4.3 Deep Learning Era Results

**Deep Belief Networks (DBN):**
A 20-30-20 neural network configuration reported EER ~4.9% and identification accuracy 94.7% on the CMU dataset.

**CNN-based systems (2023):**
- Efficient CNN (PMC 10220835, 2023): EER improvement to ~3.5–4.5% range on CMU
- CNN + RNN hybrid: EER ~2.46% with FAR 0.015% on fixed-text datasets

**Siamese LSTM / Metric Learning (best published fixed-text):**
Data fusion with Siamese neural network + triplet loss function achieved **EER 0.11–0.13** (approximately 11–13%) on certain configurations, but note these figures are dataset-specific. The headline "0.11 EER" from Computer Standards & Interfaces 2024 refers to a specific operating configuration, not raw percentage.

**Best published EER on CMU (recent):** Multiple 2024 studies report ~0.65% EER using advanced ML on CMU — but this represents near-perfect conditions (well-controlled fixed password, 400 samples per user). Real-world performance degrades significantly.

### 4.4 Free-Text Results — More Realistic

**TypeNet (Acien et al., IEEE Transactions on Biometrics 2021):**
- Dataset: 136 million keystrokes, 168,000 subjects (Aalto University dataset)
- Architecture: Siamese LSTM, triplet loss
- Fixed sequences of 50 keystrokes for enrollment (5 sequences)
- **EER: 2.2% (physical keyboard), 9.2% (touchscreen)**
- Scalability: Performance degrades by less than 5% relative when scaling from 1K to 100K subjects

**TypeFormer (Transformer-based, 2024):**
- Gaussian range encoding for position-aware key representation
- 5 enrollment sessions of 50 keystrokes each
- **EER: 3.25% (mobile touchscreen)** — competitive with TypeNet for mobile

**Continuous free-text (CNN + RNN, 2020):**
- Average EER ~2% for continuous authentication (the system monitors ongoing typing during a session)

### 4.5 Comparative Context — Keystroke vs. Other Biometrics

| Modality | Typical EER |
|----------|-------------|
| Fingerprint (commercial) | 0.1–0.5% |
| Iris recognition | 0.08–0.3% |
| Face recognition (controlled) | 0.3–2% |
| Voice recognition | 1–5% |
| Signature dynamics | 2–4% |
| **Keystroke (timing only, fixed text, DL)** | **0.65–3%** |
| **Keystroke (timing only, free text, DL)** | **2.2–4.7%** |
| **Keystroke (timing+force, research hardware)** | **<0.5% (experimental)** |
| Keystroke (baseline, classical classifier) | 7–12% |

### 4.6 Sample Size Requirements

| Scenario | Minimum Enrollment Samples | Notes |
|----------|---------------------------|-------|
| Fixed password, classical classifier | 5–10 samples | Acceptable but brittle |
| Fixed password, SVM | 10–50 samples | Good starting point |
| Free text, LSTM (TypeNet) | 5 sequences × 50 keystrokes = 250 keystrokes | State of the art |
| Production continuous auth | 900 keystrokes enrollment | Recommended for low EER |
| High-security fixed text | 400 samples (CMU protocol) | Lab benchmark |

**For Jitter Protocol:** Targeting 200–500 keystrokes for initial enrollment across multiple days appears to be the minimum for sub-5% EER. The 50-keystroke TypeNet result (3.25% EER) is promising for frictionless enrollment but likely requires 5 sessions spread over time to capture natural variation.

---

## 5. Feature Discriminative Power Rankings

### 5.1 Evidence-Based Feature Ranking

The following ranking synthesizes findings across CMU benchmark analyses, feature importance studies (MDPI Sensors 2022, PMC 9105156), and the TypeNet architecture design choices:

**Tier 1 — Highest discriminative power, highest stability:**

1. **Digraph Down-Down time (DD) for frequent pairs** — especially home-row combinations (e.g., "er", "re", "th", "he", "in", "an"). These represent deeply ingrained motor programs. High discriminability, moderate-high stability across months.

2. **Dwell time per key (H) — for punctuation and modifier keys** — Spacebar, Enter, Backspace, Shift dwell times are particularly discriminative because they reflect individual habits (do you tap or press?), not practiced speed optimization.

3. **Negative flight time frequency and magnitude** — How often and how far a typist overlaps consecutive keystrokes. Highly individual, not easily mimicked.

4. **Up-Down (UD) time for common digraphs** — Captures the finger-lift-and-press motor sequence; complements DD.

**Tier 2 — Good discriminability, moderate stability:**

5. **Typing speed consistency (coefficient of variation of WPM across sentences)** — Overall speed varies, but the *consistency* of speed is more stable.

6. **Error and correction patterns** — Backspace frequency, delete behavior, typo correction style. Very individual but sensitive to task/content.

7. **Shift key hand preference and timing** — Left vs. right shift usage for capital letters. Highly habitual.

8. **Pause distribution (inter-word and between clauses)** — The timing of cognitive pauses reflects individual planning patterns.

9. **Trigraph latencies for common letter sequences** — More discriminative than digraphs but requires more data due to sequence sparsity.

**Tier 3 — Meaningful but lower stability or discriminability:**

10. **Mean overall typing speed (WPM)** — Too variable with context (task difficulty, content familiarity) to be reliable alone; useful as context normalization.

11. **Key hold time variance** — Individual but sensitive to fatigue and task state.

12. **Up-Up (UU) intervals** — Redundant with DD in most implementations; some studies find marginal additional information.

### 5.2 The Combination Principle

**Critical finding from multiple studies:** No single feature achieves competitive EER. The combination of dwell time (H) and flight time (UD/DD) consistently outperforms either alone. Specifically:

- H alone: EER approximately 12–15%
- DD alone: EER approximately 10–13%
- H + DD + UD (full CMU feature set): EER drops to 7–10% with classical methods
- H + DD + UD + deep learned representations: EER 2–5%

**Force adds a fourth dimension:** When key force data is available, it captures the *intensity* of each keystroke independent of timing. A user who types fast may have very similar timing to another fast typist, but their force profiles differ. Early research (Roth et al., 2008, Journal on Information Security) showed that pressure-based features alone achieved EER ~8%; combined with timing, force is expected to push EER below 1% for fixed text.

### 5.3 Feature Stability Over Time

Research on which features resist temporal drift:

| Feature | 15-Month Stability | Notes |
|---------|-------------------|-------|
| Digraph DD for common pairs | High | Motor programs highly stable |
| H (dwell) for common keys | Moderate-High | Speed changes affect this |
| Negative flight time patterns | High | Deeply habitual, resistant to fatigue |
| Overall WPM | Low | Highly context-dependent |
| Error rate | Low | Varies with content and attention |
| Pause distribution | Moderate | Content-dependent but tendencies stable |
| Shift key timing | High | Habit-formed early, rarely changes |

---

## 6. Mobile Keystroke Biometrics

### 6.1 Fundamental Differences from Physical Keyboards

Touch keyboards introduce different signal types and different challenges:

**What touchscreens add:**
- **Touch contact area** (finger spread) — `Touch.radiusX`, `Touch.radiusY`
- **Touch pressure** (on supported hardware) — `Touch.force` (iOS Safari only; unreliable on Android)
- **Touch location precision** — exact XY coordinates of touch, not just key identity
- **Swipe/slide distance** — how far the finger moves during a key press
- **Tap angle** — orientation of the finger contact ellipse

**What touchscreens lose:**
- Physical key travel — no analog depth measurement
- Negative flight times — not physically meaningful without mechanical switches
- Precise key identity — on a soft keyboard, the intended key is inferred, not measured directly

### 6.2 Multi-Sensor Fusion

The most powerful mobile systems fuse typing timing with motion sensors captured **simultaneously during typing**:

**Accelerometer:** Captures micro-vibrations caused by finger impacts on the screen. Different users apply different force patterns, creating different vibration signatures even without pressure APIs.

**Gyroscope:** Captures rotational micro-movements of the phone during typing. Right-thumb typists vs. left-thumb vs. two-finger create distinct gyroscope signatures.

**Magnetometer:** Less commonly used; captures device orientation.

**Key 2024 finding (Springer, Implicit Authentication):** Including **spatial touch features** (position, radius, angle) reduced implicit authentication EER by **26.4–36.8%** relative to purely temporal features. Spatial data appears more stable than timing alone on touchscreens.

### 6.3 State-of-the-Art Mobile Results

**TypeNet Mobile (Acien et al., 2021):**
- 60,000 subjects, 63 million keystrokes on touchscreens
- EER: **9.2%** — notably worse than physical keyboard (2.2%)
- 5 enrollment sessions of 50 keystrokes

**TypeFormer (2024):**
- Transformer architecture with Gaussian range encoding
- 5 sessions × 50 keystrokes enrollment
- **EER: 3.25%** on mobile — significant improvement over TypeNet mobile

**Continuous authentication ML (Springer, 2023):**
- Soft keyboard typing behavior + accelerometer + gyroscope
- SVM, Random Forest, CNN, LSTM evaluated
- Detection possible "as fast as 0.03 ms" (likely refers to single-event detection, not EER)

**Smartphone sensor fusion (MDPI Sustainability, 2023):**
- Combined accelerometer + gyroscope for user identification during typing
- 15 subjects; used low sampling rate to mitigate battery impact

### 6.4 Commercial Mobile Implementations

**TypingDNA Mobile:**
- iOS + Android SDK
- Captures timing patterns from soft keyboard via text field instrumentation
- Does not claim to use accelerometer/gyroscope in public documentation
- Powers enterprise 2FA and continuous authentication products

**Daon IdentityX:**
- Multi-modal behavioral biometrics platform
- Includes keystroke, swipe, touch pressure patterns
- Targeted at financial services

### 6.5 Battery and Privacy Considerations

Mobile biometric collection has practical constraints:
- Continuous sensor polling at 200 Hz (sufficient for motion capture) draws minimal power (~1–2 mW)
- User consent and transparency required in most jurisdictions (GDPR, CCPA)
- On-device processing preferred to minimize data transmission and privacy risk

---

## 7. Adversarial Robustness

### 7.1 Attack Taxonomy

**Statistical attacks:** Attacker uses population-average typing statistics (mean timings for common digraphs) to construct a plausible sample without ever observing the target. Against CMU benchmark classifiers, statistical attacks achieved meaningful penetration rates. Modern DL systems are more robust.

**Mimicry attacks (targeted imitation):** Attacker observes target's typing and attempts to reproduce it. Human imitation of keystroke timing patterns is generally poor — the temporal precision required (millisecond-level) is beyond conscious control. However, automated playback of recorded typing is a genuine threat.

**Replay attacks:** Captured keystroke timing sequences played back. Countermeasure: ensure authentication input is live by requiring response to a dynamic prompt (challenge-response).

**Adversarial ML attacks:** Black-box and white-box attacks on ML-based authenticators. A 2023 study demonstrated up to **86% attack success rate** using adversarial perturbation on keyboard biometric classifiers (Springer, International Journal of Information Security). This is a serious concern for DL-based systems.

**Timing-forgery attacks:** A January 2025 arXiv paper ("On the Insecurity of Keystroke-Based AI Authorship Detection") demonstrated that timing-forgery attacks can defeat motor-signal verification systems, specifically in the context of AI authorship detection but with implications for authentication.

### 7.2 Countermeasures

1. **Liveness detection:** Require the user to type a novel prompt not seen before (prevents replay)
2. **Challenge-response:** Generate a random phrase to type, preventing pre-recorded playback
3. **Multimodal fusion:** Adding even a second modality (face, voice, or force) dramatically increases attack difficulty
4. **Ensemble models:** Combining multiple classifiers makes adversarial samples harder to craft
5. **Confidence thresholds and anomaly detection:** Flag unusual match-score patterns (too-perfect scores can indicate replay)
6. **Rate limiting and session monitoring:** Multiple failed attempts → escalate to stronger factor

### 7.3 Security Assessment

For a "typing passport" system (Jitter Protocol), the threat model should acknowledge:
- Keystroke timing alone is **not sufficient for high-security single-factor authentication** (e.g., physical access)
- Keystroke timing IS suitable as a **second factor**, continuous authentication layer, or strong passive authentication signal
- Adding force data makes mimicry attacks exponentially harder (force patterns are subconscious)
- The most realistic attack vector is **replay of recorded typing** — defeated by fresh challenge-response prompts

---

## 8. Commercial Landscape

### 8.1 Active Players

**TypingDNA (Romania, founded 2016):**
- Largest commercial operator; recognized in Gartner Hype Cycle for Digital Identity 2025
- Products: Verify 2FA, ActiveLock (continuous enterprise auth)
- RESTful API: `POST /save/{id}` (enroll), `POST /auto/{id}` (authenticate)
- JavaScript recorder captures timing patterns from browser text fields
- No force data; timing only
- Pricing: usage-based API

**Plurilock (Canada, public company):**
- Enterprise continuous authentication using keystroke + mouse dynamics
- Deployed for US government contractors
- Passive, always-on monitoring

**Behaviosec (acquired by LexisNexis 2021):**
- Behavioral biometrics at financial institution scale
- Fraud detection, not just authentication

**Daon:**
- Multi-modal platform including keystroke
- Large bank and government deployments

**BioTracker / BioSig-ID:**
- Specialized in online testing integrity
- Used by universities to verify student identity during remote exams

### 8.2 Patent Landscape

Key issued patents in the space:

- US4805222 (1989) — Young & Hammon, foundational "keystroke rhythm" identity verification
- US7206938 (2007) — Blender & Postley, "key sequence rhythm recognition"
- US8332932 (2012) — keystroke dynamics authentication techniques
- US8368510 — biometric authentication and verification via keystroke
- **US11914690 (2024)** — Popa & Hunt, "Systems and Methods for Using Typing Characteristics for Authentication" — most recent granted patent; review claims carefully for overlap

**White space for Jitter:**
- Multi-session temporal profile calibration with drift-anchor methodology
- Force + timing fusion for consumer hardware (Hall effect keyboard class)
- Cross-device identity portability (same biometric profile adapts to different keyboard hardware)
- Typing passport as portable credential (vs. per-service enrollment)
- Passive continuous re-authentication with UI surface (the "jitter" visualization feedback mechanism)

---

## 9. Implications for Jitter Protocol Design

### 9.1 Signal Architecture Recommendation

**Tier 1 core (implement first):**
- Dwell time (H) per key, millisecond precision
- Down-Down (DD) for all consecutive key pairs
- Up-Down (UD) for all consecutive key pairs
- Signed flight time (explicitly preserve negative values)
- Shift key hand preference and timing

**Tier 2 enhancement:**
- Pause distribution (>300ms gaps between key events)
- Error/correction pattern (backspace/delete timing and frequency)
- Digraph timing by word position (word-internal vs. word-boundary digraphs)

**Tier 3 (force-augmented, Wooting SDK path):**
- Peak force per key (from analog depth value)
- Force ramp rate (rate of change of analog value on keydown)
- Key-specific force mean and variance
- Simultaneous key overlap depth profiles (polyphonic force patterns)

### 9.2 Enrollment Protocol

Based on the literature, recommend:

1. **Minimum:** 5 sessions × 200 keystrokes = 1000 keystrokes, spread over 3+ days
2. **Optimal:** 10 sessions × 300 keystrokes = 3000 keystrokes, spread over 1–2 weeks
3. **Session diversity requirement:** At least 3 different times-of-day represented in enrollment
4. **Device normalization:** If user switches devices during enrollment, flag and segment by device class (laptop keyboard, external mechanical, etc.)

### 9.3 Authentication Protocol

- **Fixed-text challenge** (for high-security scenarios): 20–40 character phrase, EER target <3%
- **Free-text continuous** (for passive monitoring): 50+ keystrokes per window, EER ~2–4%
- **Hybrid:** Passive monitoring with periodic fixed-text challenge when confidence drops

### 9.4 The Jitter Differentiator — What Is Novel

The scientific literature establishes that keystroke biometrics work. The IP opportunity for Jitter is the **system architecture and UX**, not the raw feature computation:

1. **Portable typing passport:** A single enrollment that authenticates across services (analogous to how a driver's license is issued once and accepted everywhere). No prior commercial system does portable cross-site typing identity.

2. **Temporal drift management with explicit UI:** The "jitter" concept — surfacing the biometric confidence score visually to the user — allows the user to understand and participate in profile maintenance. No prior system makes the drift-adaptation loop transparent.

3. **Multi-device profile fusion:** Explicitly modeling the relationship between a user's laptop typing profile and their phone typing profile. Separate profiles with a learned "translation" between them.

4. **Force-augmented tier:** When Hall effect hardware is present, automatically engaging a higher-confidence authentication tier without user action. Graceful degradation when force data unavailable.

5. **Health-aware drift detection:** Using clinically validated markers (the Parkinson's research shows interkey latency and release latency degradation is detectable at 83–96% sensitivity) to flag anomalous drift patterns that may indicate health changes vs. normal behavioral drift.

### 9.5 Minimum Viable Accuracy Targets

For a commercially deployable system:

| Use Case | Target EER | Achievable? |
|----------|------------|-------------|
| 2FA replacement (convenient) | <5% | Yes, achievable with timing only |
| Continuous session auth (passive) | <3% | Yes, with DL on free text |
| Single-factor login (security-conscious) | <1% | Requires force data or very long text |
| High-security access control | <0.5% | Requires force + timing + multi-session |

---

## 10. Key Citations

### Foundational Papers

- **Killourhy & Maxion (2009)** — "Comparing Anomaly-Detection Algorithms for Keystroke Dynamics." CMU benchmark dataset. https://www.cs.cmu.edu/~maxion/pubs/KillourhyMaxion09.pdf

- **Gunetti & Picardi (2005)** — "Keystroke Analysis of Free Text." ACM TOIS. Established word-specific digraph discriminability principle.

- **A Survey of Keystroke Dynamics Biometrics (2013)** — PMC3835878. https://pmc.ncbi.nlm.nih.gov/articles/PMC3835878/

### Deep Learning Era

- **TypeNet: Deep Learning Keystroke Biometrics (2021)** — Acien et al., IEEE Transactions on Biometrics. EER 2.2%/9.2% physical/mobile. https://arxiv.org/abs/2101.05570

- **TypeFormer (2024)** — Transformer architecture for mobile keystroke. EER 3.25%. https://link.springer.com/article/10.1007/s00521-024-10140-2

- **Improved Biometric Identification via Deep Learning (2024)** — PMC11207587. EER 2.46%, FAR 0.015%. https://pmc.ncbi.nlm.nih.gov/articles/PMC11207587/

- **Integrating Deep Learning and Data Fusion (2024)** — Siamese network + triplet loss. Best EER 0.11–0.13. https://www.sciencedirect.com/science/article/abs/pii/S0920548924001004

### Force Sensors and Hardware

- **A Flexible Pressure Sensor Array for Self-Powered Identity Authentication During Typing (2025)** — Science Advances Vol. 11. doi: 10.1126/sciadv.ads2297. https://pmc.ncbi.nlm.nih.gov/articles/PMC11900873/

- **Dynamic Keystroke-Password Recognition Based on Piezoelectric-Triboelectric Coupling Sensor Array (2025)** — ScienceDirect. https://www.sciencedirect.com/science/article/abs/pii/S2211285525000266

- **Wooting Analog SDK** — Open-source Rust SDK for Hall effect keyboard analog data. https://github.com/WootingKb/wooting-analog-sdk

### Temporal Drift and Adaptation

- **Adaptive Biometric Systems: Review and Perspectives (2019)** — Rattani et al., ACM Computing Surveys 52(5). doi: 10.1145/3344255. https://dl.acm.org/doi/10.1145/3344255

- **Double Serial Adaptation Mechanism for Keystroke Dynamics (2019)** — Coli et al., Computers & Security. https://www.sciencedirect.com/science/article/abs/pii/S0167404818306059

- **Enhanced Template Update: Application to Keystroke Dynamics (2016)** — Computers & Security. https://www.sciencedirect.com/science/article/abs/pii/S016740481630044X

### Mobile

- **Mobile Behavioral Biometrics for Passive Authentication (2022)** — ScienceDirect. Spatial features reduce EER 26–37%. https://www.sciencedirect.com/science/article/pii/S016786552200071X

- **Machine Learning-Based Novel Continuous Authentication Using Soft Keyboard Typing Behavior and Motion Sensor Data (2023)** — Springer. https://link.springer.com/article/10.1007/s00521-023-09360-9

- **Smartphone User Identification Using Accelerometer and Gyroscope (2023)** — MDPI Sustainability. https://www.mdpi.com/2071-1050/15/13/10456

### Clinical Applications

- **Diagnosing Parkinson's Disease via Behavioral Biometrics of Keystroke Dynamics (2025)** — Science Advances. PMC11970477. https://pmc.ncbi.nlm.nih.gov/articles/PMC11970477/

- **Keystroke Biometrics as a Tool for Early Diagnosis of Parkinson's Disease (2023)** — PMC10572112. 83–96% sensitivity on 3 parameters. https://pmc.ncbi.nlm.nih.gov/articles/PMC10572112/

### Adversarial

- **Adversarial Attacks Against Mouse- and Keyboard-Based Biometric Authentication (2023)** — Springer IJIS. Up to 86% attack success. https://link.springer.com/article/10.1007/s10207-023-00711-0

- **On the Insecurity of Keystroke-Based AI Authorship Detection (2025)** — arXiv 2601.17280. Timing-forgery attacks. https://arxiv.org/html/2601.17280

### Standards and Benchmarks

- **CMU Keystroke Benchmark Dataset** — 51 users, password `.tie5Roanl`, 400 samples/user. https://www.cs.cmu.edu/~keystroke/

- **Benchmark Keystroke Biometrics Accuracy from High-Stakes Writing Tasks (2021)** — Choi, ETS Research Report. EER 4.7–5.4% on essay tasks. https://onlinelibrary.wiley.com/doi/full/10.1002/ets2.12326

- **Keystroke Dynamics: Concepts, Techniques, and Applications (2023)** — ACM Computing Surveys. Comprehensive review. https://arxiv.org/html/2303.04605v3

---

*This document synthesizes publicly available peer-reviewed research as of March 2026. All EER/FAR/FRR figures are dataset-dependent and should not be taken as universal performance guarantees. Implementation results will vary based on enrollment quality, hardware, user population, and threat model.*
