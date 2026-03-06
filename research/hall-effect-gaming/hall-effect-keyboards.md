# Hall Effect Keyboards: Technology & Browser Access
## Jitter Protocol — Patent Filing & Product Design Research
**Date:** 2026-03-02
**Purpose:** Technical foundation for Hall Effect keyboard signal acquisition — hardware capabilities, vendor landscape, browser access paths, and native SDK architecture
**Classification:** Confidential IP Research

---

## Table of Contents

1. [How Hall Effect Switches Work](#1-how-hall-effect-switches-work)
2. [Major Vendors and Hardware Specifications](#2-major-vendors)
3. [Data Exposed: Per-Key Analog Depth](#3-data-exposed)
4. [WebHID Browser Access](#4-webhid-browser-access)
5. [Working Implementations (Open-Source)](#5-working-implementations)
6. [Native SDK Path: Wooting Analog SDK](#6-native-sdk-path)
7. [Browser Companion Daemon Architecture](#7-browser-companion-daemon)
8. [Market Size and Growth Trajectory](#8-market-size)
9. [Implications for Jitter Protocol](#9-jitter-implications)
10. [Key References](#10-references)

---

## 1. How Hall Effect Switches Work

### 1.1 Magnetic Sensing vs. Mechanical Contact

Traditional mechanical switches (Cherry MX, Gateron, Kailh) operate on **physical contact closure**: a metal leaf spring touches a conductive pad at a fixed actuation point. This produces a binary signal — pressed or not pressed. No analog depth is available. The actuation point wears over time as the metal fatigues.

Hall Effect switches replace the contact mechanism with a **magnet and Hall Effect sensor**:

1. A small permanent magnet is embedded in the key stem.
2. A Hall Effect sensor (IC) sits on the PCB directly below the stem.
3. As the key depresses, the magnet moves closer to the sensor.
4. The sensor outputs a **continuously varying voltage** proportional to magnetic field strength.
5. This voltage is digitized by onboard ADC (analog-to-digital converter) into a numeric depth value.

**Result:** Every position along the key's full travel range (typically 0–4mm) is distinguishable with sub-0.1mm resolution. The keyboard knows not just whether a key is pressed but exactly *how far* it has traveled at any moment.

### 1.2 Why This Changes What Data Is Available

| Property | Mechanical Contact | Hall Effect |
|---|---|---|
| Output per keystroke | Binary (0 or 1) | Continuous float (0.0–1.0) |
| Actuation point | Fixed by hardware | Configurable in firmware |
| Analog depth | None | Full travel, 0.1mm resolution |
| Wear mechanism | Contact degradation | None (contactless) |
| Key travel | 2–4mm | 4mm (Wooting) |
| Force data (raw) | None | Inferred from depth-over-time trajectory |

### 1.3 Terminology

- **Actuation depth:** The travel distance at which the key registers a keypress event. Configurable 0.1–4.0mm on Wooting.
- **Rapid Trigger:** Feature that re-arms actuation on the way back up, enabling faster reset. Requires analog sensing.
- **Snap Tap / SOCD Neutralization:** Cleans up simultaneous opposite directional inputs (e.g., A+D). Banned by Valve in CS2 competitive.
- **Analog output mode:** Keys behave as gamepad analog sticks — depth maps to axis value. Used in racing games, flight sims.

---

## 2. Major Vendors and Hardware Specifications

### 2.1 Wooting (Lekker Switches)

Wooting is the most developer-accessible Hall Effect keyboard vendor. Their Lekker switches are manufactured by Gateron under Wooting's specifications.

| Spec | Value |
|---|---|
| Switch type | Lekker (Hall Effect, magnetic) |
| Key travel | 4.0mm |
| Analog resolution | 0.1mm (reported as float 0.0–1.0) |
| Polling rate | Up to 4000 Hz (Wooting 60HE+) |
| HID interface | Vendor-specific usage pages (0xFF00 family) |
| SDK | Wooting Analog SDK (open-source, Rust) |
| WebHID support | Yes — wooting-js library confirmed working |
| Models | Wooting 60HE, 60HE+, Two HE, One HE |
| Price range | $149–$199 USD |

Wooting's decision to publish an open SDK and expose analog data via vendor-specific HID usage pages is the key enabler for browser-based biometric capture. Their community is heavily developer-focused.

### 2.2 Razer (Optical Analog Switches)

Razer's approach uses **optical infrared sensing** rather than magnetic. The mechanism differs but the output is equivalent: continuous analog depth per key.

| Spec | Value |
|---|---|
| Switch type | Razer Analog (optical IR) |
| Key travel | 4.0mm |
| Analog resolution | ~0.1mm |
| Polling rate | Up to 8000 Hz (Huntsman V3 Pro) |
| SDK | Razer SDK / Synapse (proprietary, Windows-only) |
| WebHID support | Not publicly confirmed — SDK is closed |
| Models | Huntsman V3 Pro, Huntsman V3 TKL Pro |
| Price range | $189–$249 USD |

Razer's SDK is proprietary and requires Synapse installation. Browser-based access is not documented. Native app integration is possible via Razer SDK if Synapse is running.

### 2.3 SteelSeries (OmniPoint Adjustable Actuation)

SteelSeries Apex Pro series uses Hall Effect switches with adjustable actuation points, marketed primarily as a gaming feature rather than an analog input device.

| Spec | Value |
|---|---|
| Switch type | OmniPoint 2.0 (Hall Effect) |
| Key travel | 4.0mm |
| Actuation range | 0.2–3.8mm (adjustable per-key) |
| Polling rate | 8000 Hz (Apex Pro TKL 2023) |
| Analog output | Yes (available in analog mode) |
| SDK | SteelSeries GG / GameSense (proprietary) |
| WebHID support | Not publicly confirmed |
| Price range | $179–$209 USD |

### 2.4 Emerging Vendors

| Vendor | Switch | Notes |
|---|---|---|
| MCHOSE | Magnetic HE | Open analog data — kb-hall library confirmed working |
| Gateron (standalone) | Magnetic jade | Primarily OEM supply for other brands |
| Macrolev | Open-source HE | Community analog keyboard with web configurator |
| NuPhy | Magnetic HE | Consumer-focused, SDK status unknown |
| Mode Designs | Magnetic HE | Premium boutique, limited units |

---

## 3. Data Exposed: Per-Key Analog Depth

### 3.1 Raw HID Report Structure (Wooting)

Wooting keyboards expose analog data through **vendor-specific HID usage pages** (usage page 0xFF00 or similar manufacturer-defined pages). The standard keyboard HID usage page (0x01, usage 0x06) only reports binary keypress events.

A typical Wooting analog HID report includes:

```
Report ID: [vendor-specific]
For each active key:
  keycode: uint8  (HID key code)
  analog:  uint8  (0–255, scaled from 0.0–1.0)
```

The report lists only currently-active keys (depth > threshold), not all 60/80/100 keys on the board. This keeps report size small and latency low.

### 3.2 Data Precision

| Parameter | Value |
|---|---|
| Depth range | 0.0–1.0 (normalized) |
| Raw ADC resolution | Typically 8-bit (0–255), mapped to 0.0–1.0 |
| Physical resolution | 0.1mm across 4mm travel |
| Sampling rate | Up to 4000 Hz (Wooting 60HE+) |
| Report latency | ~0.25ms at 4000 Hz polling |

At 4000 Hz, the keyboard is sending a new snapshot of all key depths every 0.25 milliseconds. This is 8x the polling rate of a standard gaming keyboard (500 Hz) and 40x a standard office keyboard (100 Hz). For biometric capture, 1000 Hz is more than sufficient — the force curve develops over 50–150ms.

### 3.3 What a Force Curve Looks Like in Raw Data

A single keypress at 1000 Hz polling produces approximately 50–150 data points:

```
t=0ms:    depth=0.00  (key at rest)
t=5ms:    depth=0.08  (finger contact, initial depression)
t=15ms:   depth=0.35  (approaching actuation point)
t=20ms:   depth=0.52  (actuation — keydown event fires)
t=35ms:   depth=0.91  (approaching bottom-out)
t=45ms:   depth=1.00  (full bottom-out)
t=50ms:   depth=1.00  (bottom-out hold)
t=80ms:   depth=0.88  (release begins)
t=95ms:   depth=0.45  (rising through actuation — key-up fires)
t=110ms:  depth=0.12  (late release)
t=120ms:  depth=0.00  (key back at rest)
```

This trajectory is the **force curve**. Standard keyboards only see the events at t=20ms (keydown) and t=95ms (keyup). Hall Effect keyboards expose the entire shape.

---

## 4. WebHID Browser Access

### 4.1 WebHID API Overview

WebHID is a browser API that allows web pages to communicate with HID (Human Interface Device) class hardware over USB or Bluetooth. It was developed under the Web Incubator Community Group (WICG) — not a formal W3C standard.

```javascript
// Request device access (requires user gesture)
const devices = await navigator.hid.requestDevice({
  filters: [{ vendorId: 0x31E3 }]  // Wooting vendor ID
});
const device = devices[0];
await device.open();

device.addEventListener('inputreport', (event) => {
  const { data, device, reportId } = event;
  // Parse analog depth values from data buffer
});
```

### 4.2 Browser Support

| Browser | Support | Notes |
|---|---|---|
| Chrome | Yes (v89+, March 2021) | Full support |
| Edge | Yes (v89+) | Chromium-based |
| Opera | Yes | Chromium-based |
| Firefox | No | Actively resisted — security/privacy objections |
| Safari | No | No plans to implement |
| Chrome Android | No | Mobile excluded |
| Safari iOS | No | No support |

**Global browser coverage for WebHID: approximately 39%** (Chromium desktop only, as of 2026).

This is the primary deployment risk for web-based Hall Effect biometrics. Firefox's objection centers on fingerprinting surface and the lack of a permission model comparable to Firefox's site isolation. Safari has not commented on timeline.

### 4.3 The Keyboard Block and How HE Keyboards Bypass It

Chrome blocks direct WebHID access to standard keyboard HID usage pages (usage page 0x01, usage 0x06). This prevents web pages from capturing raw keystrokes via HID, which would bypass browser key event handling and create security/privacy risks.

Hall Effect keyboards bypass this block by exposing analog data through **vendor-specific HID usage pages** (e.g., 0xFF00). These pages are not blocked because:

1. They are not the standard keyboard usage page Chrome protects.
2. They contain analog depth values, not keyboard scan codes used for text input.
3. The vendor defines the page's schema — Chrome has no policy against vendor pages.

This is not a loophole — it is the intended design. Wooting and MCHOSE explicitly publish their usage page schemas for developers.

### 4.4 Permission Model

WebHID requires:
1. **HTTPS context** — no HTTP origins allowed.
2. **User gesture** — `requestDevice()` must be called in response to a click or similar user interaction.
3. **Browser picker dialog** — the user sees a hardware selection dialog and must explicitly choose the device. This is a one-time grant that persists in browser settings.
4. **No ambient access** — the page cannot query which HID devices are connected without the picker.

The user gesture requirement means Jitter cannot silently detect Hall Effect keyboards. The integration must be explicit: "Connect your Wooting keyboard for enhanced biometrics."

---

## 5. Working Implementations (Open-Source)

These libraries prove that Hall Effect keyboard analog data is accessible via WebHID in production:

### 5.1 wooting-js

- **Source:** GitHub, Wooting organization
- **Language:** TypeScript
- **What it does:** Reads per-key analog input from Wooting keyboards via WebHID. Provides typed API for connecting devices, reading real-time depth values per key code, and subscribing to analog input reports.
- **API shape:**
  ```typescript
  const device = await WootingAnalog.getDevice();
  const analogValues = await device.readAnalog();
  // Returns: Map<keyCode: number, depth: number (0.0-1.0)>
  ```
- **Status:** Confirmed working. Used in Wooting's own web configurator.

### 5.2 kb-hall

- **Source:** GitHub, community project
- **Language:** JavaScript
- **What it does:** Reads per-key analog values from MCHOSE magnetic HE keyboards. Renders a real-time heatmap of key depths in the browser.
- **Significance:** Demonstrates that non-Wooting vendors are also accessible via WebHID with vendor-specific pages.

### 5.3 WebHMK / Libhmk

- **Source:** GitHub, open-source
- **What it does:** General-purpose Hall Effect keyboard library with a browser-based configurator. Supports multiple HE keyboard vendors.
- **Significance:** Proves the pattern generalizes beyond a single vendor — a Jitter SDK could target multiple keyboards through a common abstraction.

### 5.4 Macrolev

- **Source:** GitHub, open-source hardware + firmware project
- **What it does:** Fully open analog keyboard with web configurator that reads live key depths.
- **Significance:** Demonstrates end-to-end from firmware to browser, useful for understanding the full data pipeline.

---

## 6. Native SDK Path: Wooting Analog SDK

For native app deployments (browser companion, desktop apps, game integrations), Wooting provides an official cross-platform SDK.

### 6.1 SDK Overview

| Property | Value |
|---|---|
| Language | Rust (core), bindings for C, Python, others |
| Platform | Windows, macOS, Linux |
| License | Open-source (MIT/Apache) |
| Distribution | GitHub: WootingAnalog/wooting-analog-sdk |

### 6.2 Core API

```rust
// Initialize SDK
wooting_analog_initialise();

// Read analog value for a specific key (by HID key code)
let depth: f32 = wooting_analog_read_analog(key_code);
// Returns 0.0 (not pressed) to 1.0 (fully depressed)

// Read all currently active keys
let buffer: Vec<(u16, f32)> = wooting_analog_read_full_buffer(device_id);
// Returns: Vec of (key_code, depth) for all keys with depth > 0
```

### 6.3 Cross-Platform Considerations

The SDK handles platform-specific USB HID communication internally. On macOS, it interfaces with IOKit. On Windows, it uses the Win32 HID API. On Linux, it uses hidraw. The application layer sees a uniform Rust API regardless of platform.

For a Jitter native companion app, the SDK provides the most reliable analog data path — not subject to WebHID browser restrictions.

---

## 7. Browser Companion Daemon Architecture

To serve users on Firefox, Safari, or mobile while still capturing Hall Effect data, a **browser companion daemon** architecture bridges the gap.

### 7.1 Architecture Overview

```
[HE Keyboard]
    |
    | USB HID
    v
[Native Companion App]  ← Wooting Analog SDK (Rust/native)
    |
    | Local WebSocket or Named Pipe (IPC)
    v
[Browser Extension]  ← registered localhost endpoint
    |
    | postMessage / extension API
    v
[Jitter Web SDK]  ← standard browser JavaScript
```

### 7.2 Components

**Native Companion App:**
- Runs as a background process (menu bar on macOS, system tray on Windows).
- Reads analog data via Wooting SDK at configurable polling rate (default 1000 Hz for biometrics).
- Exposes a local WebSocket server on a fixed port (e.g., `ws://localhost:9345`).
- Sends analog reports as JSON or binary frames.

**Browser Extension (optional):**
- Relays WebSocket messages to the web page via the extension message passing API.
- Eliminates the need for `ws://localhost` connections from HTTPS pages (mixed-content restriction).
- Alternatively, the companion app serves on `wss://` with a self-signed cert + extension trust.

**Jitter Web SDK:**
- Detects whether the companion is running on page load.
- Falls back gracefully to standard timing-only biometrics if no companion detected.
- When companion is present, augments timing features with force curve data.

### 7.3 Security Considerations

- The companion app should require per-site authorization (user approves which origins can receive analog data).
- Analog data should not leave the local machine — only processed features (not raw curves) are sent to Jitter servers.
- This mirrors the architecture used by 1Password, Bitwarden, and other native-assist browser integrations.

---

## 8. Market Size and Growth Trajectory

### 8.1 Hall Effect Keyboard Market

Hall Effect gaming keyboards have moved from a niche enthusiast product to a mainstream gaming peripheral category between 2023–2026.

| Year | Estimated HE Units Sold (Gaming) | Notes |
|---|---|---|
| 2022 | ~150,000 | Wooting dominant, early adopters |
| 2023 | ~600,000 | SteelSeries Apex Pro mass market push |
| 2024 | ~2,000,000 | Razer Huntsman V3 Pro, market expansion |
| 2025 | ~5,000,000 | Multiple budget HE options under $100 |
| 2026E | ~9,000,000 | Expected — budget HE reaching mainstream |

Source: Estimated from gaming peripheral market reports and Wooting community data; treat as directional. Exact figures not independently verified.

### 8.2 The Rapid Trigger Inflection Point

Wooting's "Rapid Trigger" feature went viral in the FPS gaming community in late 2023. The feature requires Hall Effect sensing and demonstrated a measurable competitive advantage in games like CS2 and VALORANT. This single feature drove mass market awareness of HE keyboards and accelerated adoption across all vendors.

**Key implication for Jitter:** The installed base of HE keyboards is growing rapidly. Users who own HE keyboards for gaming performance reasons already have the hardware required for premium force-curve biometrics — no additional hardware purchase is needed.

### 8.3 Price Erosion

| Year | Entry-Price HE Keyboard |
|---|---|
| 2022 | ~$150 |
| 2023 | ~$120 |
| 2024 | ~$80 |
| 2025 | ~$50 |
| 2026 | ~$35 (projected) |

Budget HE options at $35–50 from brands like Epomaker and Akko are expected to be widely available by late 2026. This further expands the addressable user base.

---

## 9. Implications for Jitter Protocol

### 9.1 What This Enables

Hall Effect keyboard integration gives Jitter access to **force curve data** — the analog depth trajectory of each keypress from initial contact to bottom-out to release. This is categorically different from anything available through standard keyboard events.

Standard keyboard events (keydown/keyup) give Jitter:
- Dwell time (keyup - keydown): ~1ms precision
- Flight time between keys: ~1ms precision

Hall Effect events give Jitter additionally:
- Approach velocity (how fast the finger descends)
- Peak force proxy (bottom-out depth, duration at maximum)
- Release trajectory shape
- Per-key depth variance (some fingers press harder than others)
- Ramp rate (ms from first contact to actuation threshold)

### 9.2 Deployment Strategy

Given WebHID's 39% browser coverage, Jitter should target HE biometrics as an **opt-in premium tier**, not a baseline requirement:

1. **Tier 1 (all users):** Standard timing biometrics via keyboard events. Universal browser support.
2. **Tier 2 (Chrome/Edge users with HE keyboard):** Direct WebHID integration via opt-in flow.
3. **Tier 3 (any browser, companion installed):** Full force curve via native daemon IPC bridge.

This tiered architecture ensures no user is blocked from Jitter while premium signal quality is available to those who opt in.

### 9.3 Competitive Moat

No commercial biometric system currently uses per-keystroke force curves from Hall Effect keyboards for identity verification. The open-source implementations (wooting-js, kb-hall, WebHMK) demonstrate feasibility but have not been productized into a biometric identity system. This is an open field.

---

## 10. Key References

- Wooting Analog SDK: https://github.com/WootingAnalog/wooting-analog-sdk
- wooting-js library: https://github.com/WootingAnalog/wooting-js
- kb-hall (MCHOSE): GitHub community project
- WebHMK/Libhmk: GitHub open-source HE keyboard library
- WebHID WICG Specification: https://wicg.github.io/webhid/
- Chrome WebHID blog post (March 2021): developers.google.com
- Mozilla WebHID position: https://mozilla.github.io/standards-positions/ (opposed)
- Wooting Rapid Trigger announcement: wooting.io/blog
