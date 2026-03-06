# Jitter Protocol: Mobile Biometrics
## Phone-Specific Signals — Tap, Accelerometer, Gyroscope, Touch Geometry
**Date:** 2026-03-02
**Purpose:** Patent filing reference — mobile signal landscape, API access, accuracy benchmarks
**Classification:** Confidential IP Research

---

## 1. The Mobile Challenge

Mobile typing is fundamentally different from physical keyboard typing. Touch keyboards lack mechanical travel, negative flight times are physically impossible, and the primary biometric signals shift from timing precision to spatial and motion characteristics.

**Key EER gap (from academic benchmarks):**
- Physical keyboard (TypeNet, 168K users): **EER 2.2%**
- Touchscreen (TypeNet, 60K users): **EER 9.2%**
- Touchscreen (TypeFormer, 2024): **EER 3.25%** (state-of-art)

Mobile is harder — but the gap is closing. And mobile offers signals that desktops cannot: accelerometer, gyroscope, and spatial touch geometry.

---

## 2. Touch Event Signals

### 2.1 What Browser JavaScript Exposes

The `PointerEvent` and `TouchEvent` APIs expose:

```javascript
element.addEventListener('pointerdown', (e) => {
  // Timing
  e.timeStamp       // DOMHighResTimeStamp (sub-ms precision)

  // Spatial (unique to touch)
  e.clientX, e.clientY   // Touch coordinates on screen
  e.width, e.height      // Contact area dimensions (finger spread)
  e.pressure             // 0.0–1.0 normalized pressure
  e.tiltX, e.tiltY       // Pen tilt (stylus only)
  e.twist                // Pen rotation (stylus only)

  // Touch-specific (via TouchEvent)
  // touch.radiusX, touch.radiusY  — contact ellipse axes
  // touch.rotationAngle           — finger rotation on screen
  // touch.force                   — 0.0–1.0 (iOS Safari only with 3D Touch hardware)
});
```

### 2.2 What Is Actually Usable

| Signal | API | iOS Safari | iOS Chrome | Android Chrome | Android Firefox |
|--------|-----|-----------|------------|----------------|-----------------|
| Touch coordinates (X,Y) | PointerEvent | Yes | Yes | Yes | Yes |
| Contact area (width/height) | PointerEvent | Yes | Yes | Yes | Yes |
| Touch pressure | PointerEvent.pressure | **0.5 constant** | **0.5 constant** | Returns value but **unreliable** | Same |
| Touch radius (X,Y) | TouchEvent | Yes | Yes | Yes | Yes |
| Touch rotation angle | TouchEvent | Yes | No | Partial | Partial |
| Touch.force (3D Touch) | TouchEvent.force | **Dead** (removed iPhone 11+, 2019) | N/A | Returns 0 or constant | Returns 0 |

**Critical finding from PDF dossier (Section 4):** Touch pressure is effectively dead on all current mobile platforms.
- Apple **removed 3D Touch hardware** starting iPhone 11 (September 2019). Last iPhones with pressure sensing: XS and XS Max.
- Apple's Haptic Touch replacement is purely time-based — no pressure levels exposed.
- Android's `Touch.force` API exists but returns 0 or a constant on virtually all modern devices. No current Android phone ships display-level pressure sensors.
- The only remaining Apple device with web-accessible pressure: **Apple Pencil on iPad** via `Touch.force` in Safari.

**What IS usable on mobile:**
1. **Touch coordinates** — where exactly on the soft key the finger lands
2. **Contact area** (radiusX, radiusY) — larger area correlates with harder press (rough proxy for pressure)
3. **Touch timing** — same dwell/flight as desktop but with different distributions
4. **Touch movement** — finger slide during a key press (dx, dy from pointerdown to pointerup)

### 2.3 Spatial Touch Features — The Mobile Discriminator

A landmark 2024 finding (Springer, Implicit Authentication): including spatial touch features reduced implicit authentication EER by **26.4–36.8%** relative to purely temporal features.

**Per-key spatial features:**
- **Touch offset from key center** — each person consistently hits keys at slightly different positions
- **Touch area per key** — thumb vs index finger produces different contact areas
- **Touch movement vector** — finger slide direction and magnitude during the press
- **Inter-key spatial trajectory** — the path the finger traces between consecutive keys

**Why these are discriminative:**
- Hand size determines which fingers reach which keys
- Grip style (one-thumb, two-thumb, index-finger) creates consistent spatial signatures
- Screen size normalization is required — a user switching from iPhone 15 to iPhone 16 Pro Max shifts touch positions

---

## 3. Motion Sensor Signals

### 3.1 Accelerometer

**API access:**
- `DeviceMotionEvent` — exposes `acceleration` (with gravity) and `accelerationIncludingGravity`
- Browser coverage: **~95%+** (all modern browsers)
- iOS Safari: requires explicit `DeviceMotionEvent.requestPermission()` since iOS 13 (must be called from user gesture)
- Android Chrome: currently auto-grants access, but Google has signaled plans to tighten permissions

```javascript
// iOS permission request (must be triggered by user action like button click)
DeviceMotionEvent.requestPermission().then(permission => {
  if (permission === 'granted') {
    window.addEventListener('devicemotion', (e) => {
      const ax = e.acceleration.x;  // m/s² without gravity
      const ay = e.acceleration.y;
      const az = e.acceleration.z;
      // Sample rate: typically 60Hz default, up to 100Hz requestable
    });
  }
});
```

**What accelerometer captures during typing:**
- **Tap impact signatures** — each finger tap on the screen creates a micro-acceleration impulse detectable in the phone's motion sensors
- **Pre-tap hand tremor** — 2–4 Hz physiological tremor measurable as baseline noise between taps
- **Device movement pattern** — how the phone shifts in the hand during typing (left-right rocking for thumb typing)

**Key research finding (zkSENSE, Brave Research, arXiv 1911.07649):**
- Tap events produce **8.5x acceleration** vs baseline noise
- Software bots produce **zero** IMU response (no physical finger tap)
- Hardware rigs would need to replicate specific finger mass, strike angle, and grip geometry

### 3.2 Gyroscope

**API access:**
- `DeviceMotionEvent.rotationRate` — alpha (z-axis), beta (x-axis), gamma (y-axis) in degrees/second
- Same permission model as accelerometer
- Chrome/Edge also expose `Gyroscope` class via Generic Sensor API (cleaner interface, Chromium only)

**What gyroscope captures during typing:**
- **Rotational micro-movements** — right-thumb typists produce different rotation patterns than left-thumb or two-finger typists
- **Typing posture signature** — how the phone tilts during a typing session (walking vs sitting vs lying down produces different baselines)
- **Per-tap rotation coupling** — each tap creates a small rotation proportional to the tap force and position on screen

### 3.3 IMU-Based Liveness Detection

**The most powerful mobile-specific bot detection signal:** A real finger tap creates simultaneous, correlated acceleration and rotation impulses that are physically tied to the touch event timestamp. Software bots generate touch events with zero physical manifestation.

**Per-tap IMU features (from Enhancement #5 in algorithm-hardening):**

| Feature | Definition | Human Range | Bot Value |
|---------|-----------|-------------|-----------|
| Peak acceleration at tap | Max |a| within ±50ms of touch event | 0.3–3.0 m/s² | 0.0 (no tap) |
| Impulse decay time constant | Time for acceleration to return to baseline | 20–80ms | N/A |
| Rotation coupling ratio | Peak rotation rate / peak acceleration | 0.1–0.8 | N/A |
| Pre-tap baseline noise floor | RMS acceleration in 200ms window before tap | 0.02–0.15 m/s² (hand tremor) | 0.0 or device-noise floor only |
| Inter-tap correlation | Correlation between consecutive tap impact profiles | 0.4–0.9 (consistent strike) | N/A |

**This is a binary kill for software bots on mobile.** No software injection can produce correlated touch+IMU events without physical hardware interaction.

### 3.4 Sensor Sampling Rates and Battery Impact

| Sensor | Default Rate | Max Requestable | Battery Impact |
|--------|-------------|----------------|----------------|
| Accelerometer | 60 Hz | 100 Hz (iOS), 200 Hz (Android) | ~1–2 mW at 60 Hz |
| Gyroscope | 60 Hz | 100 Hz (iOS), 200 Hz (Android) | ~2–3 mW at 60 Hz |
| Combined IMU | 60 Hz | 100 Hz | ~3–5 mW (negligible) |

At 60 Hz sampling (sufficient for tap detection), continuous sensor polling draws approximately 3–5 milliwatts — negligible impact on battery life. A typical smartphone battery is 4,000–5,000 mAh at 3.7V (~15–18 Wh). At 5 mW, the sensor suite would drain approximately 0.03% of battery per hour.

---

## 4. Mobile Feature Vector

### 4.1 Combined Mobile Signal Set

**Timing features (same as desktop, adjusted distributions):**
- Dwell time per key (wider distribution on mobile: 60–200ms vs 50–150ms desktop)
- Inter-key interval (longer on mobile: 100–400ms vs 80–250ms desktop)
- Typing speed (lower on mobile: 20–60 WPM vs 30–120 WPM desktop)
- Error rate (higher on mobile: 5–15% vs 2–8% desktop)

**Spatial features (mobile-unique):**
- Per-key touch offset from center (20 values for common keys)
- Touch area mean and variance (radiusX, radiusY)
- Touch movement vector per key (slide direction and magnitude)
- Keyboard zone usage pattern (left/center/right distribution)

**Motion features (mobile-unique):**
- Tap impact acceleration profile (peak, decay, shape)
- Pre-tap tremor baseline (RMS noise floor)
- Rotation coupling ratio per tap
- Typing posture signature (mean device orientation during session)
- Grip stability index (variance of device orientation)

### 4.2 Feature Discriminative Power on Mobile

Based on published research:

| Feature Category | Contribution to EER Reduction | Source |
|------------------|-------------------------------|--------|
| Timing only | Baseline | TypeNet (2021) |
| + Spatial touch | 26–37% EER reduction | Springer Implicit Auth (2024) |
| + Accelerometer | Additional 15–20% reduction | MDPI Sustainability (2023) |
| + Gyroscope | Additional 5–10% reduction | MDPI Sustainability (2023) |
| Combined (timing + spatial + IMU) | ~50–60% total EER reduction vs timing-only | Estimated from individual contributions |

**Projected mobile EER with full sensor fusion:**
- TypeNet mobile baseline: 9.2%
- With spatial features: ~6.0%
- With spatial + IMU: ~3.5–4.5%
- TypeFormer (2024, timing+spatial): 3.25% (confirmed)

---

## 5. Mobile-Specific Attack Resistance

### 5.1 Attack Surface Comparison

| Attack Type | Desktop Viability | Mobile Viability | Why Mobile Is Harder |
|---|---|---|---|
| Timing injection (TypeSim) | High | High | Same — touch events can be injected |
| Timing + IMU injection | N/A | **Very Low** | Cannot fake correlated touch+acceleration events |
| Replay attack | Medium | Medium-Low | Spatial coordinates must match keyboard layout |
| GAN synthetic | Medium | Low | Must generate plausible spatial+timing jointly |
| Physical hardware rig | Very Low | **Extremely Low** | Must replicate finger biomechanics on specific phone |

### 5.2 The IMU Liveness Gate

For mobile sessions, the IMU liveness check acts as a hard prerequisite before any timing-based scoring:

```
IF device_has_motion_sensors AND permission_granted:
    IF tap_acceleration_correlation < 0.3:
        score = 0.0  // No physical taps detected
        classification = "bot"
        return
```

This single check eliminates all software-only bots on mobile. It cannot be bypassed without physical interaction with the device.

---

## 6. Cross-Device Profile Challenge

### 6.1 The Device Normalization Problem

A user's typing profile on their iPhone differs significantly from their profile on their laptop. Cross-device identity requires a normalization layer.

**Key differences:**
- Speed: Mobile typing is 40–60% slower than desktop for the same user
- Error rate: 2–3x higher on mobile
- Spatial features: completely absent on desktop
- IMU features: completely absent on desktop
- Dwell time distribution: shifted right (longer holds) on mobile

### 6.2 Profile Linking Strategy

For the v2 Global Passport, device-specific sub-profiles are maintained:

```
Passport {
  desktop_profile: { timing features only }
  mobile_profile: { timing + spatial + IMU features }
  cross_device_translation: {
    speed_ratio: mobile_wpm / desktop_wpm  // typically 0.4–0.6
    dwell_scaling: mobile_dwell / desktop_dwell  // typically 1.3–1.8
    error_ratio: mobile_errors / desktop_errors  // typically 2.0–3.0
  }
}
```

The translation parameters themselves become identity signals — each person has a characteristic speed ratio between their mobile and desktop typing, reflecting their relative proficiency with each input method.

---

## 7. Platform-Specific Implementation Notes

### 7.1 iOS (Safari / WKWebView)

- `DeviceMotionEvent.requestPermission()` **required** — must be called from a user-initiated event (button tap, not page load)
- Permission persists for the page session only — re-requested on page reload
- Accelerometer data includes gravity component by default; use `acceleration` (not `accelerationIncludingGravity`) for tap detection
- Touch.force returns **0.0** on all post-iPhone XS devices (3D Touch removed)
- `Touch.radiusX/radiusY` available and accurate — best proxy for touch pressure

### 7.2 Android (Chrome)

- Motion sensors currently auto-granted (no permission dialog) but **Chrome plans to tighten this** (Google Groups discussion indicates future permission-gating similar to iOS)
- `Touch.force` returns values on some devices but is **unreliable and inconsistent** across manufacturers (Samsung vs Pixel vs OnePlus all differ)
- `Touch.radiusX/radiusY` available — more consistent than force across devices
- Generic Sensor API (`Accelerometer`, `Gyroscope` classes) available in Chromium — cleaner interface than DeviceMotionEvent

### 7.3 Web App / PWA

Progressive Web Apps have the same sensor access as regular web pages. No additional permissions required beyond the standard browser APIs. This means Jitter's `<jitter-input>` widget can capture mobile biometrics without any native app installation.

---

## 8. Privacy Considerations for Mobile

Mobile biometric collection captures more ambient data than desktop:

| Data Type | Captured | Stored | Leaves Device |
|-----------|----------|--------|---------------|
| Touch coordinates | Yes | As per-key offset stats, not raw XY | No |
| Touch area | Yes | As mean/variance per key | No |
| Acceleration (tap impacts) | Yes | As impact profile features only | No |
| Gyroscope (rotation) | Yes | As coupling ratio + posture signature | No |
| Device orientation | Yes | As session average only | No |
| GPS / location | **No** | **No** | **No** |
| Text content | **No** | **No** | **No** |
| App/browser activity | **No** | **No** | **No** |

All sensor data is processed locally into statistical features. Raw sensor streams are never stored or transmitted. The on-device processing model applies to mobile identically to desktop.

---

## 9. Accuracy Targets: Mobile v1

| Metric | Target | Basis |
|---|---|---|
| Liveness detection (bot/human) | >95% with IMU, >85% without | zkSENSE: 8.5x acceleration differential |
| Identity match (mature passport) | EER < 5% | TypeFormer: 3.25% with timing+spatial |
| Minimum keystrokes for score | 50 (mobile needs more than desktop's 30) | Higher noise in mobile timing |
| Scoring latency | <100ms on-device | Slightly more features to compute |
| Battery impact | <0.05% per hour of typing | 5 mW sensor draw on ~15 Wh battery |

---

## Sources

- Acien et al. (2021) — TypeNet: EER 9.2% mobile, 2.2% physical keyboard (IEEE T-BIOM)
- TypeFormer (2024) — EER 3.25% mobile with transformer architecture (Springer)
- zkSENSE (Brave Research, arXiv 1911.07649) — 8.5x tap acceleration, 4.9x angular velocity vs bots
- Springer (2024) — Implicit authentication: spatial features reduce EER 26–37%
- MDPI Sustainability (2023) — Accelerometer + gyroscope for user ID during typing
- Apple Developer Docs — DeviceMotionEvent.requestPermission() requirement (iOS 13+)
- MDN Web Docs — DeviceMotionEvent, Touch.force, PointerEvent.pressure
- caniuse.com — DeviceMotion/DeviceOrientation: ~95%+ browser coverage
- Wikipedia — iPhone 3D Touch: removed September 2019 (iPhone 11)
- Jitter PDF Dossier Section 4 — Hardware biometrics & web APIs
- Jitter algorithm-hardening-15-enhancements.md — Enhancement #5: IMU Micro-Impact Signature
