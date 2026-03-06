# Force Sensors on Phones for Keystroke Biometric Scoring

**Research Topic:** Pressure/force sensing capabilities on mobile devices, their APIs, current state, and relevance to the Jitter keystroke biometric system.

**Date:** 2026-03-04
**Author:** Research compilation for Jitter patent filing support

---

## 1. Force Touch / 3D Touch on iOS

### What It Was

Apple's 3D Touch was a pressure-sensitive display technology introduced with the iPhone 6s in September 2015. It allowed the device to distinguish between a normal tap, a light press ("Peek"), and a deeper press ("Pop"), enabling context-sensitive menus, quick actions from the home screen, and pressure-sensitive drawing in first-party apps. The term "Force Touch" originally referred to the trackpad version introduced on MacBooks in early 2015; Apple then adapted the name "3D Touch" for the phone variant.

### How It Worked

3D Touch used capacitive strain gauges embedded behind the display glass. The display stack consisted of the cover glass, a capacitive touch layer (detecting position), and beneath it a second capacitive layer that measured the microscopic deflection of the glass as the user pressed. As the glass flexed, the capacitance between the sensing electrodes changed, and this change was proportional to the applied force. The measurement was combined with the linear actuator (Taptic Engine) to provide haptic confirmation of threshold crossings.

Key engineering characteristics:

- **Measurement type:** Capacitive strain gauge, not a piezoelectric or resistive sensor
- **Force range:** Approximately 0.0 to 6.67 Newtons, expressed as a normalized float from 0.0 to 1.0 in the API (with `maximumPossibleForce` exposed so developers could recover the physical value)
- **Sampling rate:** Force was sampled at approximately 120 Hz, matching the touch position sampling rate of the device
- **Threshold engineering:** Apple internally used three threshold zones — untouched (0.0), "Peek" (light press, roughly 0.25–0.45 on the normalized scale), and "Pop" (deep press, roughly 0.65+). These thresholds were adaptive to the current touch area and adjusted slightly based on finger size detection

### The UITouch API

In UIKit, every `UITouch` object exposed two force-related properties:

```swift
// UITouch force API (iOS 9+, requires 3D Touch capable hardware)
let touch: UITouch  // obtained from touchesBegan(_:with:) etc.

let normalizedForce: CGFloat = touch.force
// Range: 0.0 (no pressure) to touch.maximumPossibleForce
// On 3D Touch hardware, max was typically ~6.67 (in "force units", not Newtons directly)

let maxForce: CGFloat = touch.maximumPossibleForce
// Device-specific maximum. On iPhone 6s/7/8/X: typically 6.666...

// Normalize to 0.0-1.0 for comparison:
let percentageForce = touch.force / touch.maximumPossibleForce
```

To check hardware capability before attempting to read force:

```swift
// Feature detection
if traitCollection.forceTouchCapability == .available {
    // 3D Touch hardware present, force values are meaningful
} else {
    // No 3D Touch; force will return 0.0 for touches, 1.0 for stylus
}
```

In practice, for soft touches on 3D Touch hardware, `force` would return values like 0.02–0.15, a genuine continuous gradient. This made keystroke-level pressure profiling possible: you could capture the force curve for an entire keypress event, from initial contact through peak force to liftoff.

### Apple Pencil Force

The Apple Pencil (both generations) also reported pressure through `UITouch.force`, with a finer effective resolution since the Pencil tip sensor was purpose-built. Pencil pressure was effectively 16-bit resolution under the hood, though exposed through the same normalized CGFloat API.

### When Apple Killed 3D Touch

Apple began phasing out 3D Touch with the iPhone XR (2018), which launched without it but included "Haptic Touch" as a marketing replacement. The iPhone 11 line (September 2019) completed the removal — all three models (iPhone 11, 11 Pro, 11 Pro Max) dropped 3D Touch entirely. This marked the end of pressure-gradient force sensing on iPhone.

The removal was driven by manufacturing complexity. The strain gauge layer added thickness and cost to the display stack. As Apple pushed toward thinner designs and OLED panels (which have a different stack architecture than the LCD panels used in 6s–X), the 3D Touch layer became difficult to integrate.

### What Replaced It: Haptic Touch

"Haptic Touch" is Apple's rebrand for what is functionally a long-press gesture with haptic feedback. It has no pressure gradient whatsoever. The system detects that a touch has been held for approximately 0.5 seconds and then fires a haptic actuator click. The `UITouch.force` property on non-3D-Touch hardware returns:

- `0.0` for the brief moment before a "touch began" event settles
- `1.0` for all normal touches on screen

There is no intermediate value. Haptic Touch is a binary state machine (touch present / long-press threshold crossed), not a continuous pressure sensor. From a biometric standpoint, it is completely useless for force profiling.

### iOS Summary Table

| Device Generation | Force Sensing | API | Notes |
|---|---|---|---|
| iPhone 6s, 6s Plus | 3D Touch | UITouch.force | First generation |
| iPhone 7, 7 Plus | 3D Touch | UITouch.force | |
| iPhone 8, 8 Plus | 3D Touch | UITouch.force | |
| iPhone X, XS, XS Max | 3D Touch | UITouch.force | OLED, last with it |
| iPhone XR | None | force=1.0 | First without 3D Touch |
| iPhone 11 and all later | None | force=1.0 | Haptic Touch only |

---

## 2. Pressure Events on Android

### MotionEvent.getPressure()

Android has exposed pressure data through `MotionEvent` since API level 1 (Android 1.0). The method signature is:

```java
// Android Java API
float pressure = motionEvent.getPressure();
// Returns: 0.0 (no contact) to 1.0 (normalized maximum)
// Also available per-pointer in multi-touch:
float pressure = motionEvent.getPressure(pointerIndex);
```

In Kotlin:

```kotlin
override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
        MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> {
            val pressure = event.pressure  // 0.0f to 1.0f
            val size = event.size          // normalized contact area
            // pressure and size are often correlated — wider touch = more pressure reported
        }
    }
    return true
}
```

### The Reality: Fake vs. Real Pressure

Here is the uncomfortable truth: most Android devices do not have dedicated force-sensing hardware. The `getPressure()` value on these devices is derived from the touch controller's estimate of **contact area**, not actual force. The rationale is that a harder press tends to flatten the finger and increase contact area, so area serves as a proxy for pressure. This proxy is:

1. **Imprecise** — a very light touch with a large flat finger reports higher "pressure" than a firm touch with a fingertip
2. **Normalized differently per device** — the 0.0–1.0 range is calibrated per-hardware, so 0.5 on a Samsung means something different than 0.5 on a Pixel
3. **Often clamped** — many budget touch controllers report only a few discrete levels (4, 8, or 16 steps across the 0.0–1.0 range), making the float appearance of continuity misleading

Some devices (particularly older flagship devices from LG and Sony) included actual strain-gauge or piezoelectric force sensing. LG's G6 and V20 reported genuine pressure. Sony's Xperia line included pressure-sensitive display technology in select models. However, the industry largely abandoned dedicated force sensors in the 2018–2020 timeframe as the cost/benefit did not pan out without a platform-level commitment analogous to Apple's ecosystem push.

### Samsung S Pen Pressure

The S Pen stylus used in Samsung's Note and Galaxy S Ultra lines represents the highest-quality pressure sensing available on any phone platform. Samsung uses a Wacom EMR (Electromagnetic Resonance) digitizer layer that is separate from the capacitive touch layer. The S Pen:

- Reports **4096 pressure levels** (12-bit resolution)
- Operates at **240 Hz** sampling rate on current Ultra devices
- Uses no battery in the pen itself (passive resonance)
- Is completely separate from finger touch — the Wacom layer ignores fingers

The Android API for S Pen pressure in native code:

```kotlin
override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS) {
        val pressure = event.pressure        // 0.0 to 1.0, but 4096 discrete steps underneath
        val tiltX = event.getAxisValue(MotionEvent.AXIS_TILT)
        val orientation = event.orientation
        // Genuine high-resolution pressure data available here
    }
    return true
}
```

Samsung also exposes the S Pen SDK (`com.samsung.android.sdk.pen`) for additional pen-specific features, though the core `MotionEvent` API is sufficient for pressure.

### Wacom Digitizer Architecture

The Wacom EMR approach used by Samsung works as follows: the digitizer layer emits an electromagnetic field. The pen contains a resonant circuit (coil + capacitor) tuned to match. When the pen is near the screen, it absorbs energy from the field and re-emits it. The digitizer detects the pen position by the location of peak signal. Pressure is sensed by a variable-capacitance tip mechanism inside the pen — pressing harder changes the capacitance of the resonant circuit, which shifts the signal strength returned to the digitizer. The digitizer interprets this signal shift as pressure. This is a fundamentally different (and more precise) mechanism than strain gauge force sensing.

### Android OEM Status Summary (2025–2026)

| Device Category | Pressure Sensing | Quality | Notes |
|---|---|---|---|
| Samsung Ultra (S Pen) | Real (Wacom EMR) | 4096 levels, 240 Hz | Best available on phones |
| Google Pixel 6–9 | Area-proxy | Low | Few discrete steps |
| Samsung Galaxy S/A (non-S Pen) | Area-proxy | Medium | Slightly better calibration |
| OnePlus, Xiaomi, Oppo flagship | Area-proxy | Low | Variable quality |
| Budget Android | Often binary | Minimal | 0 or 1, or 2-3 steps |

---

## 3. Web APIs

### PointerEvent.pressure

The W3C Pointer Events specification (Level 2, stable; Level 3, in development) defines a `pressure` attribute on `PointerEvent`:

```javascript
document.addEventListener('pointermove', (event) => {
    const pressure = event.pressure;
    // Spec: 0.0 to 1.0
    // 0.0 = no pressure (pointer not in contact)
    // 0.5 = normalized active contact with no pressure info (mouse button held, touch without pressure)
    // 1.0 = maximum pressure

    const pointerType = event.pointerType; // "mouse", "touch", "pen"
    const isPen = pointerType === 'pen';

    console.log(`Type: ${pointerType}, Pressure: ${pressure}`);
});
```

The spec is explicit about the fallback: if the hardware cannot report pressure, a touch that is active (in contact) should return `0.5`, and a touch with no contact returns `0.0`. This is important — it means implementations that cannot measure pressure are supposed to return `0.5`, not `1.0`.

In practice, browser implementations vary considerably:

**Chrome on Android (Chromium):**
- On devices with real pressure hardware: passes through the `MotionEvent.getPressure()` value
- On most devices: returns `0.5` during contact (spec-compliant no-pressure fallback)
- On S Pen: passes through Wacom pressure data, giving genuine gradient values

**Safari on iOS:**
- Returns `0.5` for all normal finger touches (no pressure hardware since iPhone XR)
- Returns `0.0` when not in contact
- For Apple Pencil on iPad: returns genuine pressure gradient via `0.0`–`1.0`

**Firefox on Android:**
- Returns `0.5` during contact on most devices
- Generally spec-compliant fallback behavior

**The 0/1 Myth:** There is a common misconception that browsers return binary 0/1 for pressure. The actual behavior on most modern phones is 0.0 (not touching) or 0.5 (touching, no pressure data). The spec value of 0.5 is a sentinel meaning "contact exists but no gradient available." Some older Chromium versions did return `1.0` instead of `0.5` for touches, which is why this misconception persists.

### Touch.force (WebKit)

Safari exposes a non-standard `force` property on `Touch` objects (the `TouchEvent` API), which was implemented specifically for 3D Touch on iPhone 6s–XS:

```javascript
document.addEventListener('touchmove', (event) => {
    const touch = event.touches[0];

    // Non-standard, WebKit only
    if ('force' in touch) {
        const force = touch.force; // 0.0 to 1.0
        // On 3D Touch hardware (iPhone 6s–XS): genuine gradient
        // On all iPhone 11+: returns 0.0 (not touching) or 1.0 (touching)
        // On Android Chrome: property may not exist
    }
});
```

The `Touch.force` property was added to the Touch Events Level 2 spec draft but was never standardized. It exists only in WebKit. On current iPhones (11 and later), `touch.force` returns `1.0` for all touches — binary, no gradient.

There is also a non-standard `Touch.altitudeAngle` and `Touch.azimuthAngle` for stylus tracking in Safari, but these are iPad/Apple Pencil specific.

### PointerEvent vs. TouchEvent: Which to Use

For any new implementation, `PointerEvent` is the correct API — it is standardized, it handles mouse/touch/stylus uniformly, and it is supported in all modern browsers. `TouchEvent` is older, iOS-specific in its origins, and lacks the unified design. The pressure properties carry the same limitations regardless of which API you use — the underlying hardware either measures pressure or it does not.

### Browser Support Reality Matrix (2025–2026)

| Platform | API | Pressure Values | Real Data? |
|---|---|---|---|
| iPhone 11+ / Safari | PointerEvent.pressure | 0.0 or 0.5 | No |
| iPhone 6s–XS / Safari | Touch.force | 0.0–1.0 gradient | Yes (dead platform) |
| Android / Chrome, no S Pen | PointerEvent.pressure | 0.0 or 0.5 | Sometimes area-proxy |
| Android / Chrome, S Pen | PointerEvent.pressure | 0.0–1.0 gradient | Yes |
| iPad / Safari + Apple Pencil | PointerEvent.pressure | 0.0–1.0 gradient | Yes |
| Desktop / Chrome + graphics tablet | PointerEvent.pressure | 0.0–1.0 gradient | Yes |
| Desktop / Chrome, mouse | PointerEvent.pressure | 0.0 or 0.5 | No |

---

## 4. What Is Actually Possible Today (2025–2026)

### Web Browsers

The web pressure API story is bleak for finger-based biometrics on current hardware:

**iPhone:** Apple removed 3D Touch in 2019. Every iPhone 11, 12, 13, 14, 15, 16 — every current iPhone in users' hands — reports only a binary contact/no-contact signal. `PointerEvent.pressure` returns `0.5` during finger touch and `0.0` when not touching. There is no gradient, no partial pressure value, no force curve. The hardware to measure it does not exist in these devices.

**Android (mainstream):** The `getPressure()` value is an area-proxy that varies wildly by device and has poor calibration. For keystroke biometrics, where you need comparable values across users and devices, this is worse than useless — it introduces noise that varies by manufacturer, touch controller vendor, and firmware version. A "pressure" of 0.4 on one device may represent a completely different physical scenario than 0.4 on another device.

**Android (S Pen devices):** The Samsung Galaxy S Ultra line (S23 Ultra, S24 Ultra, S25 Ultra) has genuine high-quality pressure data via S Pen, but S Pen input is stylus-only. Users typing on a virtual keyboard with their fingers still get area-proxy data. The S Pen data is valuable for stylus-based applications (drawing, handwriting) but not for keyboard-based keystroke biometrics.

**Conclusion for web-based keystroke biometrics:** Pressure data from `PointerEvent.pressure` or `Touch.force` cannot be treated as a reliable signal for finger-based keyboard input on current mainstream devices. Any system depending on pressure gradients would work for approximately 0% of iPhone users (the dominant mobile browser demographic in the US) and perhaps 5–15% of Android users (those with S Pen devices, if using the stylus).

### iOS Native Apps

A native iOS app faces the same hardware limitation. `UITouch.force` still exists in the UIKit API — it has not been removed — but on all current iPhones (11 and later), it returns `1.0` for all active touches. The API exists for backward compatibility with apps that were built when 3D Touch hardware was available.

```swift
// This code compiles and runs, but returns 1.0 on all modern iPhones
override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    for touch in touches {
        let force = touch.force               // 1.0 on iPhone 11+
        let maxForce = touch.maximumPossibleForce  // 1.0 on iPhone 11+
        let normalized = force / maxForce    // Always 1.0
    }
}
```

Apple removed the `forceTouchCapability` check returning `.available` — it now always returns `.unavailable` or `.unknown` on current hardware. A properly written app that checked `traitCollection.forceTouchCapability == .available` before attempting to read force values would simply never read force on any current iPhone.

For iPad with Apple Pencil, `UITouch.force` does return a genuine gradient (Pencil has its own pressure sensor), but this is stylus-specific and not relevant to keyboard-entry biometrics.

### Android Native Apps

A native Android app using `MotionEvent.getPressure()` will:

1. Get genuine, reliable pressure data on S Pen touches on Samsung Ultra devices
2. Get area-proxy data of variable quality on finger touches on flagship Android phones
3. Get binary or near-binary data on most other Android devices

For a keystroke biometric system, even the "genuine" area-proxy data is problematic because the relationship between reported pressure and actual applied force is non-linear, device-specific, and not recalibratable without device-specific ground truth data.

### Stylus Devices: The Exception

If the target use case involves stylus input (Apple Pencil on iPad, S Pen on Samsung), real pressure data is available and of high quality:

- **Apple Pencil + iPad + PencilKit:** Apple's `PencilKit` framework gives full access to stroke pressure, altitude, azimuth, and roll data. The `PKStrokePoint` struct contains a `pressurizedAzimuthUnitVector` and a `force` (CGFloat) measured at high resolution. Sampling rate is effectively 240 Hz for Apple Pencil data through PencilKit.
- **S Pen + Samsung Android + Wacom layer:** As described above, 4096 levels at 240 Hz.

These are not relevant to phone keyboard biometrics but are relevant to any handwriting-based biometric or signature verification system.

---

## 5. Integration Points for Keystroke Biometrics (jitterScorer.js)

### What Could Be Built If Pressure Were Reliable

Hypothetically, if `PointerEvent.pressure` returned genuine gradient data on all devices, the Jitter scoring system could incorporate the following signals:

**Per-key Force Profile**
Each keystroke produces a force curve: a time-series of pressure values from first contact through peak force to liftoff. This curve has a characteristic shape per person (fast ramp-up vs. gradual, sharp peak vs. plateau) that could be a strong biometric identifier. The duration of the peak plateau, the slope of the initial contact ramp, and the total impulse (integral of force over time) would all be extractable signals.

```javascript
// Hypothetical per-keystroke pressure capture
class PressureCurveCapture {
    constructor() {
        this.samples = [];
        this.startTime = null;
    }

    onPointerDown(event) {
        this.startTime = performance.now();
        this.samples = [{ t: 0, p: event.pressure }];
    }

    onPointerMove(event) {
        if (this.startTime === null) return;
        this.samples.push({
            t: performance.now() - this.startTime,
            p: event.pressure
        });
    }

    onPointerUp(event) {
        const curve = this.samples;
        this.startTime = null;
        this.samples = [];
        return this.extractFeatures(curve);
    }

    extractFeatures(curve) {
        if (curve.length < 3) return null;

        const pressures = curve.map(s => s.p);
        const peakPressure = Math.max(...pressures);
        const peakTime = curve[pressures.indexOf(peakPressure)].t;
        const totalDuration = curve[curve.length - 1].t;
        const rampRate = peakPressure / peakTime;  // pressure per ms

        // Impulse: trapezoidal integration
        let impulse = 0;
        for (let i = 1; i < curve.length; i++) {
            const dt = curve[i].t - curve[i-1].t;
            impulse += ((curve[i].p + curve[i-1].p) / 2) * dt;
        }

        return { peakPressure, peakTime, totalDuration, rampRate, impulse };
    }
}
```

**Force Variance as Authenticity Signal**
Genuine human typing produces natural variance in keystroke force — harder on home keys, lighter on reach keys, varying with fatigue and emotional state. A bot or automated attacker using synthetic touch injection would likely produce uniform pressure values (typically the default `0.5`). Force variance could thus serve as a liveness detection signal.

**Force Curves During Dwell Time**
For keys held down (long press), the force curve shape during dwell — whether the user maintains constant pressure or lets it vary — is a behavioral characteristic. Biometric systems could use the coefficient of variation of pressure during dwell as a per-user feature.

### Current Reality: Why Pressure Is Off the Table

The Jitter scoring system (`jitterScorer.js`) should not incorporate `PointerEvent.pressure` as a meaningful signal for the following reasons:

1. **Coverage is near zero on target devices.** The primary target demographic is iPhone users (dominant in US food-focused apps). Every current iPhone returns binary pressure data. A signal that is unavailable for 50–70% of users cannot be a core biometric feature.

2. **Android data quality is too variable.** Even where non-binary data is available on Android, the values are not comparable across devices. A pressure of 0.4 on a Pixel 9 and 0.4 on a Galaxy S24 base model are not the same physical phenomenon. Any model trained on this data would have to be device-specific, which is not feasible without enormous labeled datasets.

3. **Values are sentinel-contaminated.** The spec sentinel value of `0.5` for "touch present, no pressure data" means that half the 0.0–1.0 range is occupied by a non-informative flag value. Any statistical analysis of pressure data must first filter out `0.5` values and treat them as missing, degrading the dataset.

4. **Spoof resistance is not gained.** If the system learns that "real users have pressure 0.5" (because that is all iPhones return), then an attacker spoofing touch events simply needs to set pressure to 0.5. The signal provides no discriminative power.

The recommended approach for jitterScorer.js is to treat pressure as an **optional enrichment signal**: capture `event.pressure` on every pointer event, but flag it with device capability context, and only use it in scoring when the capability check indicates real gradient data is available (S Pen on known Samsung model, or Apple Pencil on iPad).

```javascript
// In jitterScorer.js — recommended pressure handling
function isPressureGradientReliable(pointerEvent) {
    // Pressure of exactly 0.5 is the W3C "no pressure data" sentinel
    // Seeing it consistently means the hardware doesn't measure pressure
    // This check is heuristic — use a moving window in production
    return pointerEvent.pointerType === 'pen' ||
           (pointerEvent.pressure > 0 &&
            pointerEvent.pressure !== 0.5 &&
            pointerEvent.pressure !== 1.0);
}

function captureKeystrokeFeatures(events) {
    const features = {
        // Core timing features — always available
        flightTime: null,
        dwellTime: null,
        interKeyInterval: null,

        // Pressure features — optional, device-dependent
        peakPressure: null,
        pressureGradientAvailable: false,
    };

    const pressureSamples = events
        .filter(e => e.type === 'pointermove' || e.type === 'pointerdown')
        .map(e => e.pressure);

    // Check if pressure data looks genuine (not all 0.5 or all 1.0)
    const uniquePressures = new Set(pressureSamples.map(p => p.toFixed(2)));
    if (uniquePressures.size > 3) {
        features.pressureGradientAvailable = true;
        features.peakPressure = Math.max(...pressureSamples);
        // ... extract additional pressure curve features
    }

    return features;
}
```

---

## 6. Sampling Rates

### 3D Touch Era (iPhone 6s–XS)

Apple's 3D Touch sampled force at 120 Hz, synchronized with the touch position sampling rate. This was fast enough to capture meaningful pressure dynamics for typical typing speeds (most keypress contact durations are 60–200 ms, so 120 Hz gives 7–24 samples per keypress). The Taptic Engine feedback was triggered off of threshold crossings in this signal, which required low latency in the force processing pipeline.

### Android Touch Sampling

The base Android touch sampling rate is typically 60 Hz on older devices and 120–240 Hz on 2021+ flagships. Notable specifics:

- **Pixel 6 and later:** 240 Hz touch sampling (though the display may be 60/90/120 Hz — touch sampling is independent)
- **Samsung Galaxy S Ultra:** 240 Hz touch, 240 Hz S Pen (Wacom)
- **Mid-range Android:** Typically 60–120 Hz
- **`getPressure()`** is evaluated at the same rate as position — there is no separate force sampling rate on Android; both are products of the same touch controller frame

### Web / PointerEvent Delivery Rate

`PointerEvent` dispatches in JavaScript are subject to several rate limits:

1. **requestAnimationFrame throttling:** By default, `pointermove` events are coalesced and delivered at the display refresh rate (60, 90, or 120 Hz depending on device). This is a browser optimization — the platform may receive touch updates at 240 Hz at the OS level, but JavaScript only sees them at rAF rate.

2. **getCoalescedEvents():** The Pointer Events Level 2 spec provides `PointerEvent.getCoalescedEvents()`, which allows JavaScript to retrieve all intermediate pointer positions that were received between rAF frames. This gives access to the full native sampling rate:

```javascript
document.addEventListener('pointermove', (event) => {
    // Without coalescence: one event per rAF frame (~60Hz)
    const regularPressure = event.pressure;

    // With coalescence: all intermediate events (up to native sampling rate)
    const coalescedEvents = event.getCoalescedEvents();
    coalescedEvents.forEach(coalesced => {
        const fullRatePressure = coalesced.pressure;
        // This can give 240Hz data on capable devices
    });
});
```

3. **Predicted events:** `event.getPredictedEvents()` gives forward-predicted pointer positions, which are useful for rendering latency reduction but not for biometric analysis.

For Jitter keystroke analysis, `getCoalescedEvents()` is worth using if pressure data ever becomes reliable, as it provides the highest-resolution pressure curve per keystroke.

### Summary Table: Sampling Rates

| System | Touch Position Rate | Force/Pressure Rate | Notes |
|---|---|---|---|
| 3D Touch (iPhone 6s–XS) | 120 Hz | 120 Hz | Synchronized |
| iPhone 11+ | 60–120 Hz | N/A (binary) | ProMotion on Pro: 120Hz |
| Android flagship (2022+) | 240 Hz | 240 Hz (area-proxy) | Touch controller limited |
| S Pen / Wacom | 240 Hz | 240 Hz (4096 levels) | Best available |
| Web PointerEvent | ~60 Hz (rAF) | Same as position | Use getCoalescedEvents() |
| Web + getCoalescedEvents() | Up to native rate | Up to native rate | 240 Hz on capable devices |

---

## 7. Future Possibilities

### Under-Display Pressure Sensors

Qualcomm's 3D Sonic fingerprint sensors (used in the Galaxy S series and other flagships) are ultrasonic sensors capable of measuring both fingerprint ridge patterns and the **force and area** of the pressed finger. The Qualcomm 3D Sonic Max can measure contact force as a byproduct of its ultrasonic sensing. This is currently used only for fingerprint authentication, not exposed as general-purpose pressure input, and not accessible to third-party apps.

If Qualcomm or another vendor exposed under-display force sensing to the OS API (via an extension to `MotionEvent` or a new API), it would enable genuine pressure data on non-stylus finger touches. There is no announced plan to do this as of early 2026, but it is the most plausible technical path to resurrecting force-gradient input on mainstream phones.

### Acoustic Force Estimation

Research has explored using the phone's microphone to estimate keystroke force by analyzing the acoustic energy of the tap sound. Harder taps produce louder, different-frequency audio events. This is interesting but not currently exposed through any web or mobile API for typing contexts, and requires microphone permission which creates significant UX and privacy barriers.

### Piezoelectric Film Sensors

Samsung and others have explored embedding thin piezoelectric film sensors under display glass, separate from the Wacom digitizer layer. These sensors generate a voltage proportional to applied force and require no power for measurement. They were demonstrated in research contexts around 2017–2019 but did not reach production phones, likely displaced by the interest in under-display fingerprint sensors using the same real estate.

---

## 8. Patent and Prior Art Considerations

### Apple 3D Touch Patents

Apple holds extensive patents on pressure-based display interaction. Key areas covered:

- **US Patent 9,158,436** (and family): Pressure-sensitive touch screen using capacitive strain sensing; multi-level gesture classification based on force thresholds
- **US Patent 9,329,715**: Force feedback (haptic) response calibrated to detected pressure level
- **US Patent 9,552,100**: Distinguishing between "peek" and "pop" pressure thresholds with adaptive calibration
- **US Patent 10,185,397**: Simultaneous touch position + force measurement using layered capacitive sensing

These patents cover the hardware mechanism and the gesture-level pressure interaction paradigm. They do not cover the use of pressure data for biometric identity — the force-as-authentication application space is distinct from Apple's "3D Touch gestures for UI actions" claims.

### Samsung Pressure Sensing Patents

Samsung holds patents on S Pen pressure sensing through the Wacom EMR digitizer:

- Multiple patents covering the passive resonant stylus pressure measurement mechanism
- Patents on palm rejection during S Pen use (distinguishing stylus pressure from inadvertent palm contact)
- These are component/hardware patents; they do not cover biometric applications of pressure data

### Existing Keystroke Dynamics Patents Mentioning Force

The keystroke biometrics patent space (which Jitter's application must navigate) does include prior art mentioning force:

- **US Patent 7,346,439** (Meylan et al., 2008): "Method and system for authenticating a user based on keystroke dynamics including key press duration, force, and timing." This is a notable prior art document — it explicitly claims force (pressure) as one component of a keystroke dynamics authentication system, combined with timing. This patent is expired (18-year term from 2008 filing), but it establishes prior art that using pressure + timing for authentication was known.

- **US Patent 8,392,612** (Fair, 2013): Mentions "keystroke pressure" as a biometric factor in a multi-factor authentication scheme. The claims are broad but focus on the authentication method overall, with pressure as one of several features.

- **US Patent 9,036,896** (Daon Holdings): Covers multi-factor mobile biometrics including "pressure" as a feature in handwriting/signature authentication contexts.

**Implications for Jitter:** If Jitter's patent application includes claims around force/pressure as a biometric signal, it must differentiate from this prior art. The differentiation could be:

1. **Novelty in the specific pressure curve features extracted** (not just raw pressure, but impulse, ramp rate, asymmetry)
2. **Novelty in the cross-device normalization method** that accounts for the sentinel value problem
3. **Novelty in treating pressure as an optional enrichment signal** within a multi-modal typing rhythm system, with graceful degradation when unavailable
4. **Novelty in the liveness detection application** of pressure variance (distinguishing human from bot, not human A from human B)

The safest approach is to claim pressure features only in dependent claims (subordinate to the core timing-based claims) and to frame them as one possible embodiment of the invention rather than a required element. The core claims should be defensible with timing data alone, since that is what actually works on current hardware.

---

## 9. Recommendation for Jitter

### Do Not Depend on Force Data

The Jitter keystroke biometric system should be built entirely on timing signals (flight time, dwell time, inter-key intervals, hold duration profiles) and behavioral signals (error rate, correction patterns, rhythm consistency). These signals:

- Work on 100% of devices with a touch keyboard
- Are consistent and comparable across devices
- Have a deep prior art landscape to navigate but clear differentiation opportunities
- Provide sufficient discriminative power for the intended use cases

### Treat Pressure as Optional Enrichment

Capture `event.pressure` in the raw event log regardless, because:

1. Storage cost is negligible (one float per pointer event)
2. Future hardware may make the data useful retroactively
3. For the small population of S Pen users or future pressure-capable devices, the signal could augment confidence scores
4. For bot detection specifically, the binary pressure pattern (all values exactly 0.5) is itself a signal — synthetic touch injection may produce non-0.5 values that betray automation

The implementation strategy in `jitterScorer.js`:

```javascript
// Raw capture — always do this
function capturePointerEvent(e) {
    return {
        t: performance.now(),
        type: e.type,
        x: e.clientX,
        y: e.clientY,
        pressure: e.pressure,         // 0.0, 0.5, or gradient
        pointerType: e.pointerType,   // "touch", "mouse", "pen"
        // Store raw; analysis layer decides how to use pressure
    };
}

// Analysis layer — conditional on quality
function scorePressureSignal(keystrokeEvents, deviceProfile) {
    const pressureValues = keystrokeEvents.map(e => e.pressure);
    const hasGradient = new Set(pressureValues).size > 5;  // heuristic

    if (!hasGradient) {
        return { available: false, score: null };
    }

    // Only reach here on S Pen / iPad Pencil / future pressure hardware
    return {
        available: true,
        score: computePressureProfileScore(pressureValues, deviceProfile),
    };
}
```

### For the Patent Application

Include pressure-based features in the specification as one embodiment but do not make them required by the independent claims. Draft language such as:

> "In certain embodiments, the biometric feature vector further comprises one or more pressure-derived features, including peak contact force, force ramp rate, and integrated force impulse per keystroke, derived from pressure data reported by the touch input device. The system is configured to detect whether the touch input device provides pressure gradient data and to include or exclude pressure-derived features from the feature vector accordingly."

This preserves the patent's coverage of pressure-augmented scoring while not making the claims unenforceable due to the lack of pressure hardware on current mainstream devices.

---

## Summary

| Dimension | Status (2026) |
|---|---|
| iPhone force sensing | Dead since 2019. All current iPhones: binary only |
| Android finger pressure | Area-proxy, highly variable, not reliable for biometrics |
| Android S Pen pressure | Excellent (4096 levels), but stylus only |
| Web PointerEvent.pressure | Returns 0.5 sentinel on most devices, not useful |
| Web Touch.force | Binary (1.0) on all current iPhones, not useful |
| iPad + Apple Pencil | Real gradient, stylus only |
| Jitter application | Do not depend on pressure; capture it for future use |
| Patent strategy | Include pressure in embodiments; keep independent claims timing-based |

The death of 3D Touch is the defining hardware event for this research area. What was a promising biometric signal from 2015–2019 — real, continuous, 120 Hz force data on the world's most popular phone — was removed by Apple for industrial design reasons and has not been replaced. The industry moved on. Web standards faithfully defined APIs for pressure data that now return sentinel values on virtually every mainstream device. The biometric potential of force sensing on phones was real, briefly demonstrable, and is now dormant pending a new hardware generation that has not yet arrived.
