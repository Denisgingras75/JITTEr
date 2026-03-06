# PROVISIONAL PATENT APPLICATION
# CONTINUATION-IN-PART

## UNITED STATES PATENT AND TRADEMARK OFFICE

---

**TITLE OF THE INVENTION:**
METHOD AND SYSTEM FOR HUMAN VERIFICATION USING ANALOG KEYSTROKE DEPTH BIOMETRICS, CROSS-MODAL IDENTITY CORRELATION, AND PROGRESSIVE SENSOR ENRICHMENT

**INVENTOR:** Denis Michael Gingras
**DATE:** [Filing Date]
**FILING TYPE:** Provisional Patent Application (37 CFR 1.53(c))
**PRIORITY CLAIM:** This application claims the benefit of U.S. Provisional Application No. 63/994,858, filed March 2, 2026, entitled "METHOD AND APPARATUS FOR VERIFYING HUMAN AUTHORSHIP OF DIGITAL CONTENT VIA CONTINUOUS BIOMETRIC EFFORT ANALYSIS, PHYSICAL FORCE INPUT, AND CONTENT PROVENANCE CERTIFICATION," the entirety of which is incorporated herein by reference.

---

## 1. ABSTRACT

A system and method for verifying human identity and detecting automated input using continuous analog keystroke depth data from commercially available Hall Effect keyboards, cross-modal biometric identity correlation between mobile touchscreen and desktop keyboard inputs, and progressive sensor enrichment that adapts verification confidence to the capabilities of the connected input device. The system interfaces with existing commercial analog keyboards via open-source software development kits to capture per-key actuation depth curves at resolutions of up to 4096 discrete levels and polling rates of up to 8000 Hz, extracting biometric features including attack velocity, bottom-out depth, aftertouch duration, release asymmetry, resting finger pressure, and neuromuscular fatigue signatures that are physically impossible to capture from conventional binary keyboards. On mobile devices, the system captures touch pressure and contact geometry via standard web browser APIs without requiring native application installation. A cross-modal correlation engine identifies the same human individual across desktop and mobile input modalities by extracting modality-invariant behavioral features. The system provides multiplicative anti-spoofing resistance proportional to the number of independent biometric dimensions captured, creating an economic deterrent that scales from 1x (timing only) to 1000x or greater (analog depth plus cross-modal verification).

---

## 2. CROSS-REFERENCE TO RELATED APPLICATIONS

This application is a continuation-in-part of U.S. Provisional Application No. 63/994,858, filed March 2, 2026 (hereinafter "the Parent Application"). The Parent Application discloses a system for verifying human authorship via keystroke timing analysis, content provenance certification, and a hardware keyboard embodiment utilizing Hall Effect sensors and Force-Sensing Resistors. The present application incorporates by reference the entirety of the Parent Application and adds new matter relating to: (1) software-only integration with commercially available analog keyboards; (2) continuous actuation depth curve analysis as a biometric feature set; (3) cross-modal identity verification across mobile and desktop input devices; (4) progressive sensor enrichment with adaptive verification confidence; (5) web browser-based mobile touch biometric capture; and (6) specific anti-spoofing mechanisms targeting mechanical actuator devices.

---

## 3. BACKGROUND OF THE INVENTION

### 3.1 Field of the Invention

The present invention relates to biometric human verification, bot detection, and identity correlation across input devices. More specifically, the invention relates to methods of extracting biometric identity features from the continuous analog depth data produced by Hall Effect keyboard switches, correlating biometric signatures across physically different input modalities (touchscreen and keyboard), and adapting verification confidence to the sensor capabilities of the connected input device.

### 3.2 Limitations of Prior Art

The Parent Application (63/994,858) discloses a biometric keyboard hardware embodiment utilizing Hall Effect sensors (claims 13-15). However, this hardware embodiment requires a purpose-built keyboard with onboard cryptographic elements, limiting deployment to users who purchase specialized hardware.

Since the filing of the Parent Application, the commercial analog keyboard market has expanded significantly. As of 2026, multiple manufacturers (including but not limited to Wooting, DrunkDeer, NuPhy, Keychron, SteelSeries, and Corsair) ship keyboards incorporating Hall Effect switches capable of reporting continuous per-key position values. Open-source software development kits (notably the Wooting Analog SDK) provide cross-manufacturer access to analog key position data through a plugin architecture. These commercially available keyboards provide analog depth data with resolution of 12 bits (4096 discrete levels) at polling rates up to 8000 Hz — specifications that exceed the requirements for biometric feature extraction.

No prior art has been identified that utilizes the continuous actuation depth curves from commercial analog keyboards as biometric features for human verification or bot detection. Existing keystroke biometric systems (including TypingDNA, BioCatch, and Plurilock) operate exclusively on timing-derived features (inter-keystroke interval, dwell time, flight time) because conventional binary keyboards provide no depth information.

Similarly, no prior art has been identified that correlates biometric identity across mobile touchscreen input (where pressure and contact geometry are available) and desktop keyboard input (where timing is the primary signal) to verify that the same individual is typing on both devices.

US Patent 7,346,439 (Meylan, 2008, expired) claims pressure and timing for keystroke authentication but is limited to authentication (verifying a known user) rather than bot detection (distinguishing human from automated input) and does not address continuous depth curves, cross-modal correlation, or progressive sensor enrichment.

### 3.3 The Analog Depth Opportunity

Hall Effect keyboard switches operate by measuring the position of a permanent magnet embedded in the key switch slider relative to a Hall Effect sensor mounted on the printed circuit board. As a key is depressed, the magnet descends toward the sensor, producing a voltage proportional to the magnetic field strength at the sensor location. An analog-to-digital converter samples this voltage, producing a continuous digital representation of key position throughout the entire stroke — from fully raised to fully depressed and back.

This continuous position signal enables extraction of biometric features that are categorically unavailable from binary (on/off) keyboards:

- **Attack velocity:** The rate of position change during key depression, reflecting the force and speed with which a finger strikes the key.
- **Bottom-out depth:** The maximum position value reached during a keystroke, reflecting finger force and typing style (some typists consistently bottom out while others use lighter touches).
- **Aftertouch duration:** The time spent at or near maximum depth before release begins, reflecting individual keystroke rhythm.
- **Release velocity:** The rate of position change during key return, reflecting the speed at which the finger lifts.
- **Release asymmetry:** The ratio of depression time to release time. Human keystrokes characteristically exhibit faster depression than release due to the biomechanics of finger extension versus flexion. Mechanical actuators (solenoids, servos) typically produce symmetric profiles.
- **Resting pressure:** The baseline position value when a finger rests on a key without actuating it, reflecting individual finger weight and typing posture.
- **Velocity profile shape:** The curvature of position-over-time during depression. Human fingers produce characteristic sigmoidal curves due to muscle fiber recruitment patterns. Mechanical actuators produce linear or step-function profiles.
- **Micro-tremor:** Low-amplitude oscillation (typically 1-5 Hz) in the key position signal during sustained key depression, reflecting physiological tremor present in all humans and absent in mechanical or software-generated input.

Each of these features represents an independent biometric dimension. Spoofing a timing-only system requires matching one set of statistical distributions. Spoofing an analog-depth system requires simultaneously matching all of the above features across all keys — a multiplicatively harder problem.

---

## 4. SUMMARY OF THE INVENTION

The present invention provides:

**Software-Only Analog Keyboard Integration:** A method for capturing biometric depth features from commercially available Hall Effect keyboards via existing open-source SDKs, without requiring custom hardware, firmware modifications, or onboard cryptographic elements.

**Actuation Depth Biometric Feature Extraction:** A method for constructing per-keystroke actuation depth curves and extracting a multi-dimensional biometric feature set comprising attack velocity, bottom-out depth, aftertouch, release velocity, release asymmetry, resting pressure, velocity profile shape, inter-key depth correlation, and depth variance over session.

**Cross-Modal Identity Verification:** A system for verifying that the same human individual is typing on both a mobile touchscreen device and a desktop keyboard by correlating modality-invariant behavioral features (bigram timing ratios, cognitive pause patterns, error correction behavior, fatigue progression) while treating modality-specific features (touch pressure, contact geometry, actuation depth) as independent confidence amplifiers.

**Progressive Sensor Enrichment:** A method for adapting biometric verification to the capabilities of the connected input device, selecting appropriate feature subsets and detection thresholds based on detected sensor capabilities, and generating verification credentials that include a sensor fidelity indicator.

**Mobile Touch Biometrics via Web Browser:** A method for capturing touch pressure, contact geometry (radiusX, radiusY, rotationAngle), and temporal pressure variance during text input on mobile devices via standard web browser APIs (Pointer Events, Touch Events) without requiring native application installation.

**Anti-Spoofing via Analog Depth:** Methods for detecting mechanical spoofing devices (solenoid actuators, servo motors) by identifying linear actuation profiles, uniform depth across keys, symmetric depression/release velocities, and absence of micro-tremor — all characteristics of mechanical actuators that differ from human biomechanics.

**Timestamp Sub-Millisecond Integrity:** A method for detecting software-generated input by analyzing the fractional millisecond component of keystroke event timestamps, wherein real hardware-generated events exhibit non-zero sub-millisecond fractions due to hardware interrupt timing and OS scheduler jitter, while common bot frameworks produce clean integer timestamps.

---

## 5. BRIEF DESCRIPTION OF THE DRAWINGS

- **FIG. 9:** A block diagram of the software-only analog keyboard integration architecture, showing the relationship between commercial analog keyboard hardware, the open-source analog SDK, the biometric feature extraction module, and the verification engine.
- **FIG. 10:** A diagram of a single keystroke actuation depth curve, showing the time-series position signal from initial depression through bottom-out to release, with labeled biometric features (attack velocity, bottom-out depth, aftertouch, release velocity, release asymmetry, micro-tremor).
- **FIG. 11:** A comparison diagram showing human actuation depth curves (sigmoidal, asymmetric, variable depth, micro-tremor present) versus mechanical actuator curves (linear, symmetric, uniform depth, no tremor) versus software-injected input (no depth data, binary only).
- **FIG. 12:** A block diagram of the cross-modal identity verification system, showing mobile biometric capture (pressure + geometry + timing), desktop biometric capture (timing + optional depth), modality-invariant feature extraction, cross-modal correlation engine, and unified identity score output.
- **FIG. 13:** A diagram of the progressive sensor enrichment hierarchy, showing four tiers of input devices (binary keyboard, analog keyboard, mobile touchscreen, analog keyboard + mobile) with corresponding biometric feature sets and multiplicative spoofing difficulty factors.

---

## 6. DETAILED DESCRIPTION OF THE INVENTION

### 6.1 Software-Only Analog Keyboard Integration

The system interfaces with commercially available analog keyboards through an open-source software development kit (SDK) that provides a cross-platform, cross-manufacturer abstraction layer for reading per-key analog position values.

The SDK exposes the following interface:

```
// Read analog value for a specific key
float read_analog(uint16_t key_code)
// Returns: 0.0 (fully raised) to 1.0 (fully depressed)

// Read all pressed keys and their analog values
DeviceInfo[] read_full_buffer(uint16_t max_length)
// Returns: array of (key_code, analog_value) pairs for all keys
// with analog_value > 0.0
```

The system polls this interface at a configurable rate (minimum 1000 Hz, up to 8000 Hz depending on hardware capability) during text input sessions. For each detected keystroke event (key position crossing a configurable actuation threshold), the system records the complete time-series of position values from initial detection through bottom-out to full release, constructing an actuation depth curve.

The SDK supports multiple keyboard manufacturers through a plugin architecture. At initialization, the system queries the SDK for connected devices:

```
DeviceInfo[] get_connected_devices()
// Returns: device_id, device_name, manufacturer, device_type
```

This enables the system to operate with any analog keyboard that implements a compatible SDK plugin, without requiring manufacturer-specific integration code. As of 2026, compatible keyboards include products from Wooting (Lekker switches), DrunkDeer (proprietary Hall Effect), NuPhy (Hall Effect variants), and Keychron (magnetic switches), with additional manufacturers adopting the plugin standard.

### 6.2 Actuation Depth Curve Construction

For each keystroke, the system constructs an actuation depth curve by recording timestamped position values:

```
DepthCurve = [(t_0, p_0), (t_1, p_1), ..., (t_n, p_n)]
where:
  t_i = timestamp in microseconds
  p_i = key position (0.0 to 1.0)
  t_0 = first sample where p > noise_floor (typically 0.02)
  t_n = last sample before p returns below noise_floor
```

From each depth curve, the system extracts the following biometric features:

**Attack Velocity (AV):**
```
AV = (p_peak - p_0) / (t_peak - t_0)
```
Where p_peak is the maximum position value (bottom-out) and t_peak is the timestamp at which it occurs. Units: position-units per microsecond.

**Bottom-Out Depth (BOD):**
```
BOD = max(p_i) for all i in curve
```
Reflects how deep the key is pressed. Range: 0.0 to 1.0.

**Aftertouch Duration (ATD):**
```
ATD = t_release_start - t_peak
where t_release_start = first t_i after t_peak where dp/dt < -threshold
```
Measures how long the finger holds the key at maximum depth before beginning to release.

**Release Velocity (RV):**
```
RV = (p_peak - p_n) / (t_n - t_release_start)
```
The speed of key return to resting position.

**Release Asymmetry (RA):**
```
RA = (t_peak - t_0) / (t_n - t_peak)
```
The ratio of depression time to release time. Human keystrokes typically produce RA < 1.0 (faster depression than release) due to the biomechanics of finger flexion versus extension. Values near 1.0 or above 1.0 indicate mechanical or automated actuation.

**Velocity Profile Shape (VPS):**
The system fits a sigmoidal function to the depression phase of the depth curve:
```
p(t) = L / (1 + e^(-k(t - t_mid)))
```
The goodness-of-fit (R²) to this sigmoidal model serves as a biometric feature. Human finger depression closely follows a sigmoidal curve (R² > 0.90). Mechanical actuators produce linear profiles (low R² for sigmoidal fit). The parameter k (steepness) varies between individuals and serves as an additional biometric dimension.

**Micro-Tremor Index (MTI):**
During the aftertouch phase (key held at near-maximum depth), the system analyzes the power spectral density of position fluctuations in the 1-12 Hz band. Human physiological tremor produces characteristic spectral peaks in the 8-12 Hz range (pathological tremor) and 1-5 Hz range (normal physiological tremor). The presence and spectral distribution of these fluctuations serve as a biometric feature. Mechanical actuators and software-generated input produce no such fluctuations.

### 6.3 Per-Key Depth Profile

The system maintains a per-key biometric profile storing the statistical distribution of each depth feature across the keyboard:

```
KeyProfile[key_code] = {
  mean_AV, std_AV,      // attack velocity
  mean_BOD, std_BOD,    // bottom-out depth
  mean_ATD, std_ATD,    // aftertouch duration
  mean_RV, std_RV,      // release velocity
  mean_RA, std_RA,      // release asymmetry
  mean_VPS, std_VPS,    // velocity profile shape
  mean_MTI, std_MTI,    // micro-tremor index
  sample_count          // number of observations
}
```

Different keys exhibit different depth profiles for the same individual due to finger assignment (index vs. pinky), key position (home row vs. reach), and hand geometry. This per-key variation is itself a biometric feature — the pattern of how depth features vary across the keyboard is unique to each individual's hand geometry and typing technique.

### 6.4 Cross-Modal Identity Verification

The cross-modal identity verification system correlates biometric signatures captured from physically different input devices to verify that the same human individual is the source of input on both devices.

**Mobile Capture Module:**
On mobile touchscreen devices, the system captures biometric features via standard web browser APIs:

```javascript
element.addEventListener('pointerdown', (e) => {
  capture({
    pressure: e.pressure,     // 0.0 to 1.0 (force applied)
    width: e.width,           // contact width in CSS pixels
    height: e.height,         // contact height in CSS pixels
    tiltX: e.tiltX,           // stylus tilt (-90 to 90)
    tiltY: e.tiltY,
    twist: e.twist,           // stylus rotation (0-359)
    timestamp: e.timeStamp    // high-resolution timestamp
  });
});

element.addEventListener('touchstart', (e) => {
  const touch = e.changedTouches[0];
  capture({
    force: touch.force,           // 0.0 to 1.0 (iOS)
    radiusX: touch.radiusX,       // contact ellipse X radius
    radiusY: touch.radiusY,       // contact ellipse Y radius
    rotationAngle: touch.rotationAngle,
    timestamp: e.timeStamp
  });
});
```

The mobile feature set comprises:
- Touch pressure magnitude and variance
- Contact area (radiusX × radiusY) reflecting finger size
- Contact shape ratio (radiusX / radiusY) reflecting finger angle
- Contact rotation angle reflecting hand positioning
- Inter-keystroke timing (same as desktop)
- Pressure profile over touch duration

**Desktop Capture Module:**
On desktop devices, the system captures timing features from standard keyboard events and, when an analog keyboard is detected, depth features via the analog SDK as described in Section 6.2.

**Modality-Invariant Feature Extraction:**
The cross-modal correlation engine extracts features that are statistically consistent for the same individual across input modalities:

1. **Bigram timing ratios:** For common two-character sequences (th, he, in, er, an, etc.), the ratio of the timing for one bigram relative to another. These ratios reflect motor learning patterns that persist across input devices because they originate in the brain's motor planning, not in the peripheral mechanics of the input device.

2. **Cognitive pause patterns:** The frequency and duration distribution of inter-word pauses (pauses exceeding a configurable threshold, typically 500ms). These reflect individual thought patterns and linguistic planning that are independent of input modality.

3. **Error correction behavior:** The rate of backspace events per 100 characters, the timing between error and correction, and the distribution of error positions within words. These reflect individual writing habits and self-monitoring patterns.

4. **Fatigue progression rate:** The rate at which typing speed decreases and timing variance increases over a sustained session. This reflects individual neuromuscular characteristics.

The correlation engine computes a similarity score between mobile and desktop feature vectors using a weighted distance metric, producing a unified identity score between 0.0 (no correlation) and 1.0 (strong same-person correlation).

### 6.5 Progressive Sensor Enrichment

The system detects input device capabilities at session initialization and adapts its verification approach accordingly:

**Tier 1 — Binary Keyboard (Standard):**
- Available features: inter-keystroke timing, dwell time, flight time, behavioral signals
- Detection dimensions: ~6 (per Parent Application claims 18-19)
- Spoofing difficulty: 1x (baseline)

**Tier 2 — Analog Keyboard:**
- Available features: all Tier 1 features plus actuation depth curves (8+ additional dimensions per key)
- Detection dimensions: ~14+
- Spoofing difficulty: 10-100x

**Tier 3 — Mobile Touchscreen:**
- Available features: inter-keystroke timing plus touch pressure, contact geometry, contact shape
- Detection dimensions: ~10
- Spoofing difficulty: 10-50x

**Tier 4 — Analog Keyboard + Mobile Cross-Modal:**
- Available features: all Tier 2 and Tier 3 features plus cross-modal correlation
- Detection dimensions: ~20+
- Spoofing difficulty: 1000x or greater

The verification credential generated by the system includes a **sensor fidelity indicator** specifying which tier of verification was performed and which biometric dimensions were captured. Relying parties (websites, applications) can set minimum tier requirements based on their security needs.

### 6.6 Anti-Spoofing via Analog Depth

The system detects mechanical spoofing devices by analyzing actuation depth curves for characteristics inconsistent with human biomechanics:

**Linear Profile Detection:** Human finger depression follows a sigmoidal curve due to muscle fiber recruitment patterns. Solenoid actuators produce linear position-over-time profiles. Servo motors produce step-function profiles. The system fits the depression phase to both linear and sigmoidal models and flags sessions where the linear fit is significantly better (R²_linear > R²_sigmoid).

**Uniform Depth Detection:** Human typists produce variable bottom-out depths across keys due to finger strength differences (index vs. pinky), key position (home row vs. reach), and natural variation. The system calculates the coefficient of variation of bottom-out depth across all actuated keys and flags sessions where CV < threshold as likely mechanical.

**Symmetric Velocity Detection:** Human keystrokes exhibit characteristic asymmetry (faster depression than release). The system calculates the mean release asymmetry ratio across a session and flags sessions where the ratio approaches 1.0.

**Absent Tremor Detection:** The system analyzes the power spectral density of position fluctuations during the aftertouch phase. Absence of spectral energy in the 1-12 Hz band during sustained key holds indicates non-human actuation.

**Absent Resting Pressure:** Between keystroke sequences, human typists characteristically produce measurable key contact (position values above noise floor) as fingers rest on keys. The system monitors inter-keystroke position values and flags sessions where keys return to exactly 0.0 between all keystrokes.

### 6.7 Timestamp Sub-Millisecond Fraction Analysis

The system captures the full-precision timestamp of each keystroke event as reported by the browser's Performance API or the operating system's high-resolution timer. Real keyboard events pass through a hardware interrupt → OS driver → application pipeline that introduces non-deterministic timing, resulting in timestamps with non-zero sub-millisecond fractions.

Common bot frameworks (including but not limited to Puppeteer, Selenium, Playwright, and programmatic DOM event dispatch via `dispatchEvent()`) generate synthetic keyboard events with timestamps that are either:
- Clean integer millisecond values (zero fractional component), or
- Artificially injected fractional values with detectable statistical distributions (e.g., uniform random vs. the characteristic non-uniform distribution produced by real hardware interrupt timing)

The system analyzes the distribution of fractional millisecond components across a typing session. A session where greater than a configurable threshold (e.g., 95%) of keystroke timestamps have zero fractional component is flagged as likely software-generated.

---

## 7. CLAIMS

### Software-Only Analog Keyboard Integration

1. A method for human verification using commercially available analog input keyboards, comprising:
    - (a) interfacing with an analog keyboard via a software development kit that exposes per-key continuous position values as floating-point numbers in the range of 0.0 to 1.0;
    - (b) sampling said per-key position values at a polling rate of at least 1000 Hz during a text input session;
    - (c) constructing, for each keystroke event, an actuation depth curve comprising a time-series of position values from initial key depression through bottom-out to full key release;
    - (d) extracting from each actuation depth curve a plurality of biometric features including attack velocity, bottom-out depth, aftertouch duration, release velocity, and release asymmetry;
    - (e) comparing said extracted features against a stored biometric profile; and
    - (f) generating a verification score indicating the likelihood that the keystroke input was produced by the claimed user's unique neuromuscular characteristics;
    wherein the method operates with unmodified commercial analog keyboards without requiring custom hardware or firmware modifications.

2. The method of claim 1, wherein the analog keyboard utilizes Hall Effect sensors to detect the position of a permanent magnet embedded in each key switch, providing continuous position measurement with a resolution of at least 8 bits across the full key travel range.

3. The method of claim 1, wherein the software development kit supports multiple commercial keyboard manufacturers through a plugin architecture, enabling biometric capture across keyboards from different manufacturers without manufacturer-specific integration.

### Actuation Depth Biometric Features

4. The method of claim 1, wherein the biometric features further comprise:
    - (a) per-key resting pressure: the baseline position value detected when a finger rests on a key without actuating it;
    - (b) velocity profile shape: the curvature of position-over-time during key depression, distinguishing between linear press patterns and sigmoidal curves produced by human finger biomechanics;
    - (c) inter-key depth correlation: the relationship between actuation depths of simultaneously or sequentially pressed keys, reflecting individual hand geometry; and
    - (d) depth variance over session: the change in actuation depth patterns over a sustained typing session, reflecting neuromuscular fatigue;
    thereby providing biometric dimensions unavailable from binary keyboard input that multiplicatively increase spoofing difficulty.

5. The method of claim 1, further comprising a bot detection module configured to identify automated input by detecting:
    - (a) unnaturally consistent actuation depth across keystrokes;
    - (b) absence of resting pressure events between keystroke sequences;
    - (c) symmetric depression and release velocity profiles; and
    - (d) absence of neuromuscular fatigue signatures over sustained input;
    wherein said bot detection operates independently of timing-based detection.

### Cross-Modal Identity Verification

6. A system for cross-modal biometric identity verification comprising:
    - (a) a first biometric capture module configured to capture, on a mobile touchscreen device, biometric features comprising touch pressure, contact geometry, and inter-keystroke timing;
    - (b) a second biometric capture module configured to capture, on a desktop computing device, biometric features comprising inter-keystroke timing, dwell time, flight time, and optionally actuation depth features;
    - (c) a cross-modal correlation engine configured to identify statistical correspondences between the first and second sets of biometric features for the same claimed user;
    - (d) a unified identity score representing confidence that both input sessions originate from the same human individual; and
    - (e) a verification module generating a credential indicating cross-modal human verification;
    wherein the system verifies that the same person is typing on both devices by correlating timing-based features common to both modalities while treating modality-specific features as independent confidence amplifiers.

7. The system of claim 6, wherein the cross-modal correlation engine extracts modality-invariant features comprising:
    - (a) bigram timing ratios reflecting motor learning patterns that persist across input devices;
    - (b) cognitive pause patterns reflecting individual thought patterns independent of input device;
    - (c) error correction behavior reflecting individual writing habits; and
    - (d) fatigue progression reflecting individual neuromuscular characteristics.

### Progressive Sensor Enrichment

8. A method for adaptive biometric verification comprising:
    - (a) detecting the input capabilities of the connected input device at session initialization;
    - (b) selecting a verification profile comprising the subset of biometric features available from the detected device;
    - (c) applying detection thresholds calibrated for the selected verification profile; and
    - (d) generating a verification score reflecting both biometric match quality and sensor data richness;
    wherein the system operates on any input device from a binary keyboard to a fully instrumented analog keyboard, with verification confidence scaling proportionally to available biometric signals.

9. The method of claim 8, wherein a verification credential includes a sensor fidelity indicator specifying which biometric dimensions were captured, enabling relying parties to set minimum sensor requirements.

### Mobile Touch Biometrics via Web Browser

10. A method for capturing biometric features from a mobile touchscreen device via a web browser comprising:
    - (a) registering event listeners for Pointer Events and Touch Events on text input elements;
    - (b) capturing, for each touch event, pressure value, contact radius values, and rotation angle;
    - (c) constructing per-keystroke touch profiles comprising pressure magnitude, contact area, contact shape ratio, and temporal pressure variance;
    - (d) comparing said touch profiles against a stored biometric template; and
    - (e) generating a mobile verification score;
    wherein said capture operates entirely within a standard web browser without requiring native application installation.

11. The method of claim 10, wherein contact geometry features serve as stable biometric identifiers reflecting individual finger size, finger angle, and hand positioning habits.

### Anti-Spoofing

12. The method of claim 1, wherein the system detects mechanical spoofing devices by identifying:
    - (a) linear actuation depth curves inconsistent with human sigmoidal profiles;
    - (b) uniform bottom-out depth across all keys inconsistent with variable human finger strength;
    - (c) symmetric depression and release velocities inconsistent with human biomechanical asymmetry; and
    - (d) absence of micro-tremor in the 1-12 Hz band during sustained key holds.

13. The method of claim 5, wherein the bot detection module assigns a multiplicative difficulty factor proportional to the number of independent biometric dimensions captured, such that analog keyboard verification provides 10-100x greater spoofing resistance than timing-only verification, and analog keyboard combined with cross-modal mobile verification provides 1000x or greater spoofing resistance.

### Timestamp Integrity

14. The method of claim 1, further comprising a timestamp sub-millisecond fraction analysis module configured to flag sessions where keystroke timestamps exhibit exclusively integer millisecond values as likely generated by software injection, wherein real human keyboard events produce timestamps with non-zero sub-millisecond fractions due to hardware interrupt timing and OS scheduler jitter.

---

## 8. RELATIONSHIP TO PARENT APPLICATION

The present application incorporates by reference the entirety of U.S. Provisional Application No. 63/994,858. The claims of the present application are distinct from and complementary to the claims of the Parent Application:

- Parent claims 1-12: Timing-based biometric verification, content provenance, Smart Badges, passport reputation (retained, not repeated here)
- Parent claims 13-15: Custom biometric keyboard hardware with onboard cryptographic element
- Parent claims 16: Mobile accelerometer/gyroscope verification
- Parent claims 17-24: Multi-layer scoring pipeline, dynamic thresholds, session dedup, composite analysis

The present claims extend the Parent Application by:
- Enabling analog depth biometrics via commercial off-the-shelf keyboards (claims 1-5), removing the requirement for custom hardware
- Adding cross-modal identity correlation (claims 6-7), a capability not disclosed in the Parent Application
- Adding progressive sensor enrichment (claims 8-9), enabling adaptive verification across device tiers
- Adding web browser-based mobile touch biometrics (claims 10-11), distinct from the Parent Application's accelerometer/gyroscope approach
- Adding specific anti-spoofing mechanisms for analog depth data (claims 12-13)
- Adding timestamp integrity analysis (claim 14)

---

*END OF SPECIFICATION*
