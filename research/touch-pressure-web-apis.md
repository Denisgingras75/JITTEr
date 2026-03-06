# Touch & Pressure APIs for Web-Based Biometrics
## Research Report: Jitter Protocol — Force/Pressure Signal Capture

**Date:** 2026-03-04
**Scope:** What force, pressure, and contact-geometry signals are available to web browsers for use as keystroke biometric features?
**Status:** Research complete. No code changes.

---

## Executive Summary

Web browsers expose meaningful pressure/force signals through four primary APIs: Touch Events (legacy, iOS-dominant), Pointer Events (cross-platform standard, Baseline since 2020), Apple's proprietary Force Touch Events (Safari/WebKit only, macOS trackpad + legacy 3D Touch), and the Gamepad API (analog triggers, not keyboard-relevant). Web HID, while capable of reading raw device reports, is **hardcoded to block keyboards and mice** — making it a dead end for keyboard biometrics. Android's native MotionEvent pressure data surfaces through both the Touch and Pointer Events APIs when the browser bridges it.

The practical takeaway for Jitter: **Pointer Events `pressure` is the cross-platform winner** for touchscreen and stylus inputs. Touch Events `force` is iOS-only but redundant with Pointer Events on modern iOS. Raw keyboards on desktop expose **zero pressure data** through any web API — timing is the only signal there.

---

## 1. Touch Events API

### Overview

The W3C Touch Events API (Level 2) fires `touchstart`, `touchmove`, `touchend`, and `touchcancel` events. Each `Touch` object in the event's `changedTouches` list carries geometry and pressure properties.

### Pressure/Force Properties

**`Touch.force`**
- Type: `float`
- Range: `0.0` (no pressure) to `1.0` (maximum hardware pressure)
- Returns `0.0` if the hardware cannot detect pressure
- Hardware-dependent; absolute sensitivity varies by device
- Spec: [W3C Touch Events Level 2, `touch-force`](https://w3c.github.io/touch-events/#dom-touch-force)

**`Touch.radiusX` / `Touch.radiusY`**
- Type: `float` (CSS pixels)
- The X and Y radii of the ellipse that best approximates the finger contact area
- Returns `1` if the hardware reports only a point contact
- Together with `rotationAngle`, these construct the contact ellipse
- **Biometric relevance:** Contact area is a proxy for finger size, touch angle, and press depth — all stable individual traits

**`Touch.rotationAngle`**
- Type: `float` (degrees, 0–90)
- Rotation of the contact ellipse
- Hardware-dependent; often `0` on devices that don't detect finger rotation

### Browser Support Matrix

| Browser | `touch` events | `force` | `radiusX/Y` | `rotationAngle` |
|---------|---------------|---------|-------------|----------------|
| Chrome Android (all) | Yes | Partial (device hw) | Partial (device hw) | Partial |
| Safari iOS (all) | Yes | Yes (iOS 9+) | Yes (iOS 13+) | Partial |
| Firefox Android | Yes | Partial | Partial | Partial |
| Safari macOS | No | No | No | No |
| Chrome Desktop | Yes (touch screens) | Partial | Partial | Partial |
| Firefox Desktop | Yes (touch screens) | Partial | Partial | Partial |

**Key notes:**
- Safari macOS does not fire Touch Events at all; it uses proprietary `webkit*` events (see Section 4)
- `force` on iOS requires 3D Touch hardware (iPhone 6s through iPhone 13) OR Apple Pencil; Face ID-era iPhones (14+) removed 3D Touch from the display — no force from fingertip on those devices
- iPad + Apple Pencil: `force`, `radiusX/Y`, `altitudeAngle`, `azimuthAngle` all populate correctly from iOS 13+
- Android Chrome: `force` and `radiusX/Y` depend on the underlying digitizer; many Android phones do report pressure through `Touch.force` via the OS MotionEvent bridge

### Sampling Rate

Touch Events are dispatched at the browser's event loop rate, typically **60 Hz** on most devices. On Apple Pencil with a ProMotion display, the underlying input can be sampled at 240 Hz (120 Hz in Low Power Mode), but the browser coalesces these before dispatching — see Pointer Events `pointerrawupdate` for high-frequency access.

### Biometric Feature Mapping

| Touch Property | Biometric Feature |
|---------------|------------------|
| `force` per keypress | Per-key press force profile (dwell force, peak force, force at liftoff) |
| `radiusX * radiusY` (contact area) | Finger contact size — stable individual trait |
| `rotationAngle` | Finger orientation — stable per-key |
| Force over time (touchstart→touchend) | Force ramp-up curve, dwell force curve |
| `force` at touchend vs touchstart | Release force gradient |

---

## 2. Pointer Events API

### Overview

Pointer Events (W3C Level 3, Baseline Widely Available since July 2020) is the modern, cross-input-type event model unifying touch, pen, and mouse inputs. It is the **recommended API for new development** and fully supersedes Touch Events for pressure capture.

Every `PointerEvent` carries a superset of pressure, geometry, and orientation data.

### Pressure/Force Properties

**`PointerEvent.pressure`**
- Type: `float`
- Range: `0.0` to `1.0`
- `0.5` for mouse/trackpad in active button state (no real pressure hardware)
- `0.0` for mouse not in active state
- For touch: actual hardware pressure if supported; `0.5` as default if not
- For pen/stylus: actual pressure from digitizer
- Spec: [W3C Pointer Events, `pressure`](https://w3c.github.io/pointerevents/#dom-pointerevent-pressure)

**`PointerEvent.tangentialPressure`**
- Type: `float`
- Range: `-1.0` to `1.0`
- Barrel/cylinder pressure (stylus barrel button squeeze)
- Default: `0`; only meaningful for styli with barrel sensors (Wacom, some Surface pens)

**`PointerEvent.tiltX` / `PointerEvent.tiltY`**
- Type: `float` (degrees, -90 to 90)
- Plane angle of the stylus relative to the screen surface
- `0` for most touch/mouse inputs; meaningful only for pen pointerType
- Spec note: tiltX/Y are being complemented by azimuthAngle/altitudeAngle (see below)

**`PointerEvent.altitudeAngle`** (Pointer Events Level 3)
- Type: `float` (radians, 0 to π/2)
- `π/2` = stylus perpendicular to screen; `0` = lying flat
- Added to WebKit/Safari in August 2024
- Now shipping in Chrome, Firefox, and Safari

**`PointerEvent.azimuthAngle`** (Pointer Events Level 3)
- Type: `float` (radians, 0 to 2π)
- Clockwise rotation of stylus from the positive Y axis when projected onto the screen
- Added to WebKit/Safari in August 2024 alongside altitudeAngle

**`PointerEvent.twist`**
- Type: `float` (degrees, 0–359)
- Clockwise rotation of the stylus around its own major axis
- Hardware: only specialized styli support this (Wacom Art Pen)

**`PointerEvent.width` / `PointerEvent.height`**
- Type: `float` (CSS pixels)
- Contact geometry dimensions in X and Y
- Functionally equivalent to `Touch.radiusX * 2` / `Touch.radiusY * 2`
- Returns `1` if hardware doesn't report contact size

### Browser Support Matrix

| Browser | `pressure` | `tiltX/Y` | `altitudeAngle/azimuthAngle` | `width/height` | `tangentialPressure` | `twist` |
|---------|-----------|-----------|------------------------------|----------------|---------------------|---------|
| Chrome 55+ (desktop) | Yes | Yes (pen only) | Yes (v122+) | Yes | Yes (pen only) | Yes (pen only) |
| Chrome Android | Yes | Partial | Partial | Yes | No | No |
| Safari iOS 13+ | Yes | Yes (Apple Pencil) | Yes (2024+) | Yes | No | No |
| Safari macOS 13+ | Yes | Yes (Pencil/stylus) | Yes (2024+) | Yes | No | No |
| Firefox 59+ | Yes | Yes (pen only) | Yes (Firefox 114+) | Yes | Yes (pen only) | Yes (pen only) |
| Firefox Android | Yes | Partial | Partial | Yes | No | No |
| Edge 12+ | Yes | Yes | Yes | Yes | Yes | Yes |
| Samsung Internet | Yes | Partial | No | Yes | No | No |

**`pointerType` behavior:**
- `"touch"`: `pressure` from digitizer if available; otherwise `0.5`
- `"pen"`: Full pressure + tilt + orientation data from pen digitizer
- `"mouse"`: `pressure` is always `0.5` (active) or `0` (hover); no geometry data

### `pointerrawupdate` — High-Frequency Access

`pointerrawupdate` fires as fast as the hardware reports, bypassing the browser's event coalescing. This is the mechanism to get sub-frame-rate pressure samples.

```javascript
element.addEventListener("pointerrawupdate", (e) => {
  // Fires at hardware polling rate (up to 240 Hz for Apple Pencil)
  // e.getCoalescedEvents() returns all batched sub-frame events
  for (const coalesced of e.getCoalescedEvents()) {
    recordSample(coalesced.pressure, coalesced.timeStamp);
  }
});
```

**Sampling rates by device:**
- Apple Pencil (iPad Pro): up to 240 Hz via `pointerrawupdate`
- Apple Pencil (Low Power Mode): 120 Hz
- Android touch digitizer: typically 60–120 Hz (device-dependent)
- Wacom tablets: 133–200 Hz typically
- Standard touch screens: 60–120 Hz

**Browser support for `pointerrawupdate`:**
- Chrome 77+: Yes
- Firefox: No (not implemented as of early 2026)
- Safari: No

### Biometric Feature Mapping

| Pointer Property | Biometric Feature |
|-----------------|------------------|
| `pressure` at pointerdown | Initial contact force |
| `pressure` peak during dwell | Maximum press force |
| `pressure` at pointerup | Liftoff force |
| `pressure` time-series | Force curve shape — individual signature |
| `width * height` (contact area) | Finger pad size, press angle |
| `tiltX/Y` or `altitudeAngle/azimuthAngle` | Typing posture — very stable individual trait |
| Pressure integral over dwell time | Total "impulse" per keypress |
| Pressure variance across keys | Typing rhythm confidence score |

---

## 3. Apple Force Touch Events (WebKit-Proprietary)

### Overview

Apple's proprietary `webkit*` force events fire in Safari on macOS for devices with Force Touch trackpads (MacBook 2015+, Magic Trackpad 2+) and on iOS with 3D Touch displays (iPhone 6s through 13). These are **non-standard** and not on a W3C track.

### Events

| Event | Fires When |
|-------|-----------|
| `webkitmouseforcewillbegin` | Before `mousedown`; preventable |
| `webkitmouseforcedown` | After `mousedown` when force threshold crossed |
| `webkitmouseforcechanged` | Each time pressure changes between down and up |
| `webkitmouseforceup` | When force drops below threshold |

### Property

**`MouseEvent.webkitForce`**
- Type: `float`
- Normalized to hardware-specific range; not strictly 0–1
- Constants:
  - `MouseEvent.WEBKIT_FORCE_AT_MOUSE_DOWN` — minimum force for a normal click
  - `MouseEvent.WEBKIT_FORCE_AT_FORCE_MOUSE_DOWN` — minimum force for a force click

### Browser Support

- **Safari macOS:** Yes (Force Touch trackpad required)
- **Safari iOS:** Yes (3D Touch devices only: iPhone 6s–13)
- **Chrome/Firefox/Edge:** No
- **Deprecation status:** Non-standard. Not deprecated but not growing. iOS 14+ iPhones lack 3D Touch hardware; Apple shifted investment to Haptic Touch (binary). For iPad + Apple Pencil, `Touch.force` and `PointerEvent.pressure` are the better paths.

### Practical Assessment for Jitter

This API gives real data on macOS Safari with a Force Touch trackpad — a meaningful segment of MacBook users. `webkitmouseforcechanged` fires continuously during trackpad interaction, giving a pressure time-series. However:
1. It's Safari-only — Chrome on macOS gets nothing
2. On modern iPhones (14+), no hardware support
3. Pointer Events `pressure` on macOS doesn't reflect trackpad pressure for mouse pointerType — it returns `0.5` always

**Gap:** Trackpad force on macOS is only accessible via this proprietary API or not at all. This is a coverage gap worth noting for the patent.

---

## 4. Gamepad API

### Overview

The Gamepad API (Baseline since March 2017) provides access to connected game controllers via polling (`navigator.getGamepads()`). It is **not event-driven** for input — you poll at animation frame rate.

### Analog Input Data

**`GamepadButton.value`**
- Type: `float`
- Range: `0.0` (fully unpressed) to `1.0` (fully pressed)
- For analog triggers (L2/R2 on PlayStation-style controllers): real continuous pressure
- For digital buttons: binary (0 or 1 only)

**`Gamepad.axes`**
- Array of `float` values in range `-1.0` to `1.0`
- Analog sticks: X and Y axes per stick
- No pressure — positional only

### Browser Support

| Browser | Gamepad API | Analog triggers |
|---------|------------|----------------|
| Chrome 35+ | Yes | Yes |
| Firefox 29+ | Yes | Yes |
| Safari 10.1+ | Yes | Yes |
| Edge 12+ | Yes | Yes |

### Relevance to Jitter Biometrics

**Not relevant for keyboard biometrics.** The Gamepad API requires a physical gamepad connected to the device. It cannot intercept keyboard input. Its analog `value` property is useful for controller-based biometrics (a different domain) but has no application to web-based keystroke analysis.

One theoretical edge case: a specialized USB controller presenting as a HID gamepad (not keyboard) could pass pressure data through this API. This is a research curiosity, not a practical deployment path.

---

## 5. Web HID API

### Overview

Web HID provides raw access to HID protocol devices over USB or Bluetooth. It allows reading raw HID input reports — the lowest-level web access to physical device data.

### Browser Support

| Browser | WebHID |
|---------|--------|
| Chrome 89+ | Yes |
| Edge 89+ | Yes |
| Firefox | No |
| Safari | No |

### The Keyboard Blocker — Hard Security Limit

This is the critical finding: **WebHID explicitly and permanently blocks access to keyboards, mice, and security keys.**

From the Chrome implementation:

> "Chrome inspects the usage of each top-level collection and if a top-level collection has a protected usage (e.g. generic keyboard, mouse), then a website won't be able to send and receive any reports defined in that collection."

The rationale from the WebHID explainer:

> "A page could turn [keyboard access] into a keylogger. You could observe keystrokes without keyboard focus."

This blocking is **by design and not bypassable** — it is enforced at the browser level regardless of user permission grants. Keyboards present with HID Usage ID `0x06` (Keyboard) which is on the protected list.

### What WebHID CAN Access

- Gamepads/joysticks (not keyboard-mapped)
- Custom HID devices with non-protected usage IDs
- Wacom tablets (if not mapped as keyboard)
- Macro pads that don't use keyboard HID usage

### Relevance to Jitter

Dead end for web keyboard biometrics. WebHID cannot access keyboard hardware at any level. This is intentional, enforced, and cross-browser (where supported). Do not invest in this path.

---

## 6. Android-Specific Pressure

### How Android Pressure Reaches the Browser

Android's native touch API (`MotionEvent`) includes `getPressure(pointerIndex)` which returns a normalized float. The precision and scaling depend on the touchscreen digitizer — different manufacturers calibrate differently, and values can exceed 1.0 on some hardware.

The Android WebView and Chrome for Android bridge this data to web APIs:
- `MotionEvent.getPressure()` → `Touch.force` in Touch Events
- `MotionEvent.getPressure()` → `PointerEvent.pressure` in Pointer Events

### Platform-Specific Notes

**Samsung devices:** Some Samsung digitizers report pressure at 8-bit resolution (256 steps), giving finer granularity than the 0–1 float suggests. The float is normalized from the raw value.

**Qualcomm-based devices (most Android):** Pressure reporting varies by Synaptics/ELAN digitizer firmware. Many report discrete steps (often 32–256 levels) normalized to 0–1.

**Google Pixel:** Generally good pressure reporting through Chrome.

**Practical issue:** Android browser `Touch.force` and `PointerEvent.pressure` are populated but the actual precision varies widely across the Android device ecosystem — from meaningless binary (0 or 0.5) to smooth 8-bit gradients. Treat Android pressure data as noisy and design features accordingly (use statistical aggregates, not single-sample values).

### No Direct Android Web API

There is no Android-specific web JavaScript API for pressure. All access is through the Touch Events and Pointer Events APIs described above. Android's `MotionEvent` is a native API only — available in native apps (Java/Kotlin) and React Native/Flutter but not in web browsers.

---

## 7. Synthesis: What Jitter Can Capture

### By Platform

| Platform | Timing (ms) | Pressure | Contact Area | Tilt/Angle | Sampling Rate |
|----------|------------|---------|-------------|------------|---------------|
| Desktop keyboard (any browser) | Yes | No | No | No | ~1 ms (event-driven) |
| macOS Safari + Force Touch trackpad | Yes (virtual keys) | Yes (webkit) | No | No | ~60 Hz |
| iOS 13+ Safari (finger) | Yes | Limited (no 3DT on 14+) | Yes | No | 60 Hz |
| iOS + Apple Pencil | Yes | Yes | Yes | Yes | Up to 240 Hz |
| Android Chrome (finger) | Yes | Partial (device-dependent) | Partial | No | 60–120 Hz |
| Android Chrome + stylus | Yes | Yes | Yes | Partial | 60–120 Hz |

### Feature Set for Jitter Patent

Pressure/force signals that can be captured cross-platform via web APIs:

1. **Per-keypress pressure profile** (`PointerEvent.pressure` time-series via `pointerrawupdate`)
   - Peak pressure during dwell
   - Pressure at initial contact (pointerdown)
   - Pressure at liftoff (pointerup)
   - Force ramp-up curve shape
   - Force decay curve shape

2. **Contact geometry** (`width`, `height` or `Touch.radiusX/Y`)
   - Mean contact area per key
   - Contact area variance across session
   - Aspect ratio of contact ellipse (finger orientation)

3. **Stylus/pen orientation** (when applicable: Apple Pencil, Wacom, Surface Pen)
   - `altitudeAngle` — pen elevation (stable individual writing posture)
   - `azimuthAngle` — pen rotation direction (stable)
   - `tiltX/Y` — alternative representation

4. **Composite features** (computed from above)
   - Pressure * dwell time = "impulse" per key
   - Contact area at peak pressure (finger compression depth proxy)
   - Pressure consistency score across repeated key presses

### The Desktop Keyboard Gap

Standard physical keyboards — the primary input device for most computers — expose **zero pressure, contact, or geometry data** through any web API. WebHID blocks them. No OS bridge exposes this. The only signals available are:
- `keydown` / `keyup` timestamps (millisecond resolution via `Date.now()` or microsecond via `performance.now()`)
- Key identity (`key`, `code`, `keyCode`)

This is not a Jitter limitation — it's a universal constraint. All web-based keystroke biometric systems face this. The novelty space for Jitter is combining the rich multimodal signals (pressure + timing + area) on mobile/touch with timing-only profiles on desktop, using a cross-modal identity model.

---

## 8. Implementation Notes

### Recommended API Stack

```javascript
// Primary: Pointer Events (cross-platform, modern)
element.addEventListener("pointerdown", captureContact);
element.addEventListener("pointerup", captureContact);
element.addEventListener("pointerrawupdate", captureHighFreq); // Chrome only

// Fallback for iOS <= 12 or non-Pointer-Events browsers
element.addEventListener("touchstart", captureTouchContact);
element.addEventListener("touchend", captureTouchContact);

// macOS Safari Force Touch (opportunistic)
element.addEventListener("webkitmouseforcechanged", captureMacForce);
```

### Detecting Pressure Hardware Capability

```javascript
function hasPressureHardware(event) {
  if (event instanceof PointerEvent) {
    // Mouse always returns 0 or 0.5; real touch/pen varies
    return event.pointerType !== "mouse" && event.pressure !== 0.5;
  }
  if (event instanceof TouchEvent) {
    const t = event.changedTouches[0];
    return t.force !== 0 && t.force !== 1.0; // 1.0 = "unsupported, returns max"
  }
  return false;
}
```

### Resolution Considerations

The 0–1 float range does not imply 32-bit float precision in practice:
- Apple Pencil via Touch Events: reportedly ~256 discrete levels (8-bit effective)
- Wacom tablets: typically 2048 or 8192 levels, normalized to 0–1 (11-bit or 13-bit effective)
- Android finger touch: 32–256 levels depending on digitizer (5–8 bit effective)
- iPhone 3D Touch: Apple documents this as "continuous" — likely 8-bit or better internally
- iPad finger touch (no 3D Touch): binary on most models (either 0 or 1.0)

For biometric feature extraction, treat the effective resolution as **5–8 bits** for touch and **8–13 bits** for active styli. Design classifiers accordingly — sub-level jitter is noise, not signal.

---

## 9. Related Prior Art & Research Signals

- **"Authenticating User Using Keystroke Dynamics and Finger Pressure"** (ResearchGate) — demonstrates 99% accuracy using finger pressure alone, vs 35% dwell-time-only
- **"Biometric Identification Based on Keystroke Dynamics"** (MDPI Sensors 2022) — defines 155 features including pressure, contact area, dwell time, flight time
- **"Keystroke Dynamics: Concepts, Techniques, and Applications"** (arXiv 2303.04605, updated June 2024) — comprehensive survey covering mobile touchscreen keystroke auth
- **Pressure.js** — open-source library abstracting Touch Events + Pointer Events + WebKit Force Touch under one API; confirms the three-API approach is established practice

---

## 10. Summary Scorecard

| API | Cross-browser | Pressure Data | Keyboard Applicable | Novelty for Jitter |
|-----|--------------|--------------|--------------------|--------------------|
| Touch Events (`force`, `radiusX/Y`) | Mobile only | Yes (device-dependent) | Yes (touch keyboards) | Contact geometry features |
| Pointer Events (`pressure`, `width`, `height`, `tiltX/Y`) | Baseline | Yes (best coverage) | Yes (touch keyboards, stylus) | Primary signal; orientation features |
| `pointerrawupdate` | Chrome only | Yes (high freq) | Yes (touch keyboards) | Sub-frame pressure curves |
| WebKit Force Touch (`webkitmouseforcechanged`) | Safari only | Yes (macOS trackpad) | Yes (macOS virtual keys) | macOS trackpad gap-filler |
| Gamepad API | Baseline | Analog triggers only | No (not keyboard) | Irrelevant |
| Web HID | Chrome/Edge only | Raw HID | No (explicitly blocked) | Dead end |
| Android MotionEvent | Native only | Yes (direct) | N/A (not web) | N/A |

---

## Sources

- [Touch: force property - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Touch/force)
- [Touch: radiusX property - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Touch/radiusX)
- [Touch Events - W3C Level 2](https://w3c.github.io/touch-events/)
- [PointerEvent: pressure property - MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure)
- [PointerEvent - MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent)
- [PointerEvent: tiltX - MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/tiltX)
- [PointerEvent: altitudeAngle - MDN](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/altitudeAngle)
- [Element: pointerrawupdate event - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointerrawupdate_event)
- [Pointer Events Level 3 - W3C](https://w3c.github.io/pointerevents/)
- [Pointer Events Working Group Charter 2025](https://w3c.github.io/charter-drafts/2025/pointer-events-wg.html)
- [Force Touch Events - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Force_Touch_events)
- [WebHID API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API)
- [Connect to uncommon HID devices - Chrome Developers](https://developer.chrome.com/docs/capabilities/hid)
- [Gamepad API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
- [GamepadButton: value - MDN](https://developer.mozilla.org/en-US/docs/Web/API/GamepadButton/value)
- [Pressure.js](https://pressurejs.com/)
- [Apple Pencil Safari API Test - shuding/apple-pencil-safari-api-test](https://github.com/shuding/apple-pencil-safari-api-test)
- [Apple: Illustrating force, altitude, azimuth properties](https://developer.apple.com/documentation/uikit/touches_presses_and_gestures/illustrating_the_force_altitude_and_azimuth_properties_of_touch_input)
- [WebKit: Expose altitudeAngle and azimuthAngle to PointerEvent](https://www.mail-archive.com/webkit-changes@lists.webkit.org/msg217758.html)
- [MDPI Sensors 2022: Biometric Identification Based on Keystroke Dynamics](https://www.mdpi.com/1424-8220/22/9/3158)
- [arXiv 2303.04605: Keystroke Dynamics: Concepts, Techniques, Applications](https://arxiv.org/abs/2303.04605)
- [ResearchGate: Authenticating User Using Keystroke Dynamics and Finger Pressure](https://www.researchgate.net/publication/224385908_Authenticating_User_Using_Keystroke_Dynamics_and_Finger_Pressure)
- [Touch/pointer events test results - Patrick H. Lauke](https://patrickhlauke.github.io/touch/tests/results/)
- [TPAC 2023: Changes in Pointer Events Level 3](https://www.w3.org/2023/09/TPAC/demos/pointer-events.html)
- [Android MotionEvent - Android Developers](https://developer.android.com/reference/android/view/MotionEvent)
