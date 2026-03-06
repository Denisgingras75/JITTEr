# CONTINUATION-IN-PART (CIP) — DRAFT NEW CLAIMS
## Building on Provisional #63/994,858

**Date:** 2026-03-04
**Status:** DRAFT — needs patent attorney review before filing
**Context:** Three research essays produced 2026-03-04 covering force sensors (phones), Hall Effect analog keyboards (Wooting SDK), and web touch/pressure APIs. These claims cover novel subject matter NOT in the provisional.

---

## NEW MATTER SUMMARY

The provisional (claims 13-15) covers a custom biometric keyboard with Hall Effect sensors and force profiles. The CIP adds:

1. **Software-only integration with existing commercial analog keyboards** (no custom hardware needed)
2. **Continuous actuation depth curves** as biometric features (not just peak force)
3. **Cross-modal identity verification** (mobile + desktop = same person)
4. **Progressive sensor enrichment** (system adapts to available hardware)
5. **Anti-spoofing via analog depth** (bot detection, not just auth)

---

## DRAFT CLAIMS (25-38)

### Analog Keyboard Integration (Software-Only)

**25.** A method for human verification using commercially available analog input keyboards, comprising:
- (a) interfacing with an analog keyboard via a software development kit (SDK) that exposes per-key continuous position values as floating-point numbers in the range of 0.0 (fully raised) to 1.0 (fully depressed);
- (b) sampling said per-key position values at a polling rate of at least 1000 Hz during a text input session;
- (c) constructing, for each keystroke event, an actuation depth curve comprising a time-series of position values from initial key depression through bottom-out to full key release;
- (d) extracting from each actuation depth curve a plurality of biometric features including: attack velocity (rate of position change during depression), bottom-out depth (maximum position value reached), aftertouch duration (time spent at or near maximum depth), release velocity (rate of position change during key return), and release asymmetry (ratio of depression time to release time);
- (e) comparing said extracted features against a stored biometric profile for the claimed user; and
- (f) generating a verification score indicating the likelihood that the keystroke input was produced by the claimed user's unique neuromuscular characteristics;
wherein the method operates with unmodified commercial analog keyboards without requiring custom hardware, firmware modifications, or onboard cryptographic elements.

**26.** The method of claim 25, wherein the analog keyboard utilizes Hall Effect sensors to detect the position of a permanent magnet embedded in each key switch, providing continuous position measurement with a resolution of at least 8 bits (256 discrete levels) across the full key travel range.

**27.** The method of claim 25, wherein the software development kit is a cross-platform open-source SDK supporting multiple commercial keyboard manufacturers through a plugin architecture, enabling biometric capture across keyboards from different manufacturers without manufacturer-specific integration.

### Actuation Depth Biometric Features (Novel Signal Space)

**28.** The method of claim 25, wherein the biometric features further comprise:
- (a) per-key resting pressure: the baseline position value detected when a finger rests on a key without actuating it, characteristic of individual finger weight and typing posture;
- (b) velocity profile shape: the curvature of position-over-time during key depression, distinguishing between linear press patterns and the characteristic sigmoidal curves produced by human finger biomechanics;
- (c) inter-key depth correlation: the relationship between actuation depths of simultaneously or sequentially pressed keys, reflecting individual hand geometry and typing technique; and
- (d) depth variance over session: the change in actuation depth patterns over a sustained typing session, reflecting neuromuscular fatigue characteristic of human typists and absent in automated input;
thereby providing biometric dimensions that are physically impossible to capture from binary (on/off) keyboard input and that multiplicatively increase the difficulty of spoofing relative to timing-only biometric systems.

**29.** The method of claim 25, further comprising a bot detection module configured to identify automated input by detecting:
- (a) unnaturally consistent actuation depth across keystrokes, wherein a coefficient of variation of bottom-out depth below a configurable threshold indicates mechanical or software-generated input;
- (b) absence of resting pressure events between keystroke sequences, wherein human typists characteristically produce measurable key contact during inter-keystroke intervals that automated systems do not;
- (c) symmetric depression and release velocity profiles, wherein human keystrokes exhibit characteristic asymmetry (faster depression than release) that automated actuators fail to replicate; and
- (d) absence of neuromuscular fatigue signatures over sustained input, wherein constant actuation force and depth over time indicates non-human origin;
wherein said bot detection operates independently of and in addition to timing-based detection, providing a parallel detection dimension that automated systems must simultaneously defeat.

### Cross-Modal Identity Verification

**30.** A system for cross-modal biometric identity verification comprising:
- (a) a first biometric capture module configured to capture, on a mobile touchscreen device, a first set of biometric features comprising touch pressure (force applied to the screen surface), contact geometry (the size and shape of the finger contact area as measured by touch radius values), and inter-keystroke timing;
- (b) a second biometric capture module configured to capture, on a desktop computing device, a second set of biometric features comprising inter-keystroke timing, dwell time, and flight time, and optionally, when an analog keyboard is detected, actuation depth features as described in claim 25;
- (c) a cross-modal correlation engine configured to identify statistical correspondences between the first set and the second set of biometric features for the same claimed user, despite the sets comprising different physical measurements from different input modalities;
- (d) a unified identity score representing the confidence that both input sessions originate from the same human individual; and
- (e) a verification module generating a credential indicating cross-modal human verification;
wherein the system verifies that the same person is typing on both mobile and desktop devices by correlating the timing-based features common to both modalities while treating modality-specific features (touch pressure, contact geometry, actuation depth) as independent confidence amplifiers.

**31.** The system of claim 30, wherein the cross-modal correlation engine extracts modality-invariant features comprising:
- (a) bigram timing ratios: the relative timing between common two-character sequences, which reflect motor learning patterns that persist across input devices;
- (b) cognitive pause patterns: the frequency and duration of inter-word pauses reflecting individual thought patterns independent of input device;
- (c) error correction behavior: the rate, type, and timing of backspace and editing events reflecting individual writing habits; and
- (d) fatigue progression: the rate of performance degradation over a sustained typing session reflecting individual neuromuscular characteristics;
whereby said modality-invariant features enable identity correlation even when the physical input characteristics differ substantially between mobile and desktop environments.

### Progressive Sensor Enrichment

**32.** A method for adaptive biometric verification comprising:
- (a) detecting, at session initialization, the input capabilities of the connected input device, including: binary keyboard (timing only), analog keyboard (timing plus actuation depth), touchscreen (timing plus pressure plus contact geometry), or stylus input (timing plus pressure plus tilt);
- (b) selecting, based on the detected capabilities, a verification profile comprising the subset of biometric features available from the detected input device;
- (c) applying detection thresholds calibrated for the selected verification profile, wherein profiles with more available biometric dimensions apply stricter per-dimension thresholds due to higher overall confidence; and
- (d) generating a verification score that reflects both the biometric match quality and the richness of the available sensor data;
wherein the system operates on any input device from a standard binary keyboard to a fully instrumented analog keyboard, with verification confidence scaling proportionally to the richness of available biometric signals.

**33.** The method of claim 32, wherein a verification credential generated by the system includes a sensor fidelity indicator specifying which biometric dimensions were captured, enabling relying parties to assess the depth of verification performed and to set minimum sensor requirements for high-security applications.

### Mobile Touch Biometrics (Web Browser)

**34.** A method for capturing biometric features from a mobile touchscreen device via a web browser comprising:
- (a) registering event listeners for Pointer Events and Touch Events on text input elements within a web page;
- (b) capturing, for each touch event during text input, the pressure value (a floating-point number from 0.0 to 1.0 representing force applied), the contact radius values (radiusX and radiusY representing the size of the finger contact ellipse in CSS pixels), and the rotation angle of the contact ellipse;
- (c) constructing per-keystroke touch profiles comprising pressure magnitude, contact area (derived from radiusX multiplied by radiusY), contact shape ratio (radiusX divided by radiusY), and temporal pressure variance during key dwell;
- (d) comparing said touch profiles against a stored biometric template for the claimed user; and
- (e) generating a mobile verification score;
wherein said biometric capture operates entirely within a standard web browser without requiring native application installation, app store approval, or device-specific SDKs, thereby enabling deployment on any website via a JavaScript library.

**35.** The method of claim 34, wherein the contact geometry features (radiusX, radiusY, rotationAngle) serve as stable biometric identifiers reflecting individual finger size, finger angle during typing, and hand positioning habits, providing biometric dimensions unavailable on desktop keyboard input.

### Anti-Spoofing Claims

**36.** The method of claim 25, wherein the system detects mechanical spoofing devices (solenoid actuators, servo motors, or similar electromechanical key-pressing apparatus) by identifying:
- (a) actuation depth curves exhibiting linear position-over-time profiles inconsistent with the sigmoidal curves characteristic of human finger biomechanics;
- (b) uniform bottom-out depth across all keys inconsistent with the variable depth characteristic of different fingers (index vs. pinky) and different key positions (home row vs. reach keys);
- (c) identical depression and release velocity magnitudes inconsistent with the characteristic human asymmetry of faster depression than release; and
- (d) absence of micro-tremor in the actuation depth signal, wherein human key depression exhibits characteristic low-amplitude oscillation (1-5 Hz) reflecting physiological tremor absent in mechanical actuators.

**37.** The method of claim 29, wherein the bot detection module assigns a multiplicative difficulty factor to spoofing attempts, calculated as the product of the number of independent biometric dimensions captured, such that:
- binary keyboard (timing only): difficulty factor = 1x (baseline);
- binary keyboard with timing and behavioral signals: difficulty factor = 3x;
- analog keyboard (timing plus depth): difficulty factor = 10x to 100x;
- mobile touchscreen (timing plus pressure plus geometry): difficulty factor = 10x to 50x;
- analog keyboard with cross-modal mobile verification: difficulty factor = 1000x or greater;
wherein each additional independent biometric dimension multiplicatively increases the cost and complexity of spoofing, creating an economic deterrent that scales with the sensor richness of the input device.

### Timestamp Integrity

**38.** The method of claim 25, further comprising a timestamp sub-millisecond fraction analysis module configured to:
- (a) capture the fractional millisecond component of each keystroke event timestamp as reported by the input event API;
- (b) analyze the distribution of said fractional components across a typing session;
- (c) flag sessions where keystroke timestamps exhibit exclusively integer millisecond values (zero fractional component) as likely generated by software injection, wherein real human keyboard events processed through operating system input stacks produce timestamps with non-zero sub-millisecond fractions due to hardware interrupt timing and OS scheduler jitter;
wherein said analysis provides a single-check detection mechanism for common bot frameworks (including Puppeteer, Selenium, and programmatic DOM event dispatch) that generate clean integer timestamps.

---

## NOTES FOR ATTORNEY

1. Claims 25-27 cover the **software-only** analog keyboard integration — distinct from claims 13-15 in the provisional which describe custom hardware. This is the Wooting/DrunkDeer/NuPhy path — no custom keyboard needed.

2. Claims 28-29 define the **novel biometric signal space** from analog depth data. No prior art found claiming actuation depth curves, resting pressure, or release asymmetry as biometric features.

3. Claims 30-31 cover **cross-modal identity** — verifying same person across phone and desktop. No prior art found. This is the strongest novel claim.

4. Claim 32-33 cover **progressive enrichment** — the system works on any keyboard but gets more confident with better sensors. This makes the patent applicable regardless of hardware adoption.

5. Claim 36 specifically addresses **mechanical spoofing** (solenoid actuators), which is the obvious attack vector against depth-based biometrics.

6. Claim 37 quantifies the **multiplicative difficulty** of spoofing, establishing the economic toll booth thesis in patent language.

7. Claim 38 is the **timestamp fraction check** — one line of code that kills most existing bot frameworks. Already in the algorithm enhancements research.

8. **Prior art checked:** US 7,346,439 (Meylan 2008, expired — pressure+timing for auth), US 8,332,932 (keystroke dynamics auth), WO2014004038A1 (keyboard as biometric device), US 11,914,690 (2024, typing characteristics — timing only). None cover analog depth curves, cross-modal identity, or progressive sensor enrichment.

9. **Filing deadline:** Provisional #63/994,858 has a 12-month window. CIP or utility must file before expiration.

10. **Research supporting these claims:**
    - ~/Documents/jitter-patent-filing/research/force-sensors-phones.md
    - ~/Documents/jitter-patent-filing/research/hall-effect-analog-keyboards.md
    - ~/Documents/jitter-patent-filing/research/touch-pressure-web-apis.md
