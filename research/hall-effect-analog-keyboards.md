# Hall Effect Sensors, Magnetic Switches, and Analog Keyboards for Keystroke Biometrics

**Research Document — Jitter Project**
**Date: March 2026**
**Purpose: Patent research — behavioral biometric scoring using analog keystroke depth signals**

---

## 1. Hall Effect Switch Technology

### 1.1 The Physics

The Hall Effect, first described by Edwin Hall in 1879, describes the production of a voltage difference (the Hall voltage) across an electrical conductor when an external magnetic field is applied perpendicular to the direction of current flow. In a conductor carrying current, a magnetic field exerts a Lorentz force on the moving charge carriers, displacing them toward one edge of the conductor. This displacement creates a measurable transverse voltage proportional to the strength of the magnetic field.

In keyboard switch applications, this principle is used to detect the position of a small permanent magnet embedded in the switch slider. As a key is pressed, the magnet descends toward a Hall Effect sensor mounted on the printed circuit board (PCB). The sensor continuously outputs a voltage that varies with the magnet's distance and orientation. The closer the magnet, the stronger the field, and the higher (or lower, depending on polarity) the sensor output. This output is sampled by an analog-to-digital converter (ADC) in the keyboard's microcontroller, producing a digital representation of key position at every sample cycle.

The critical distinction from traditional mechanical contact switches is that no physical connection between moving parts is required. A conventional mechanical key switch operates by closing an electrical circuit — two metal contacts physically touch when the key is depressed past its actuation point. This binary event (open or closed circuit) is the only information the switch conveys. There is no intermediate state; the contacts are either touching or not. The Hall Effect switch, by contrast, outputs a continuous analog signal across the entire range of key travel — from fully raised to fully depressed — with no physical contact involved at any point.

### 1.2 Key Manufacturers and Their Implementations

**Gateron KS-20 (Magnetic Hall Effect Switch)**

Gateron, one of the largest mechanical switch manufacturers, entered the Hall Effect space with the KS-20. The switch uses Gateron's patented magnetic induction sensing within a linear switch body. Specifications include a total travel distance of 4.1mm with an analog-detectable range from 0.4mm to 3.6mm. The magnetic flux range measurable by the sensor spans from approximately 102 Gauss to 905 Gauss across the travel range. Spring weight is available in variants starting at 30 grams of actuation force. The KS-20 uses a 3-pin mounting compatible with the Wooting/Lekker standard, which has become something of a de facto connector standard for Hall Effect switches. Multiple color variants exist (white, orange) corresponding to slight force and tactile feel differences, though all variants share the same underlying Hall Effect sensing mechanism.

**Lekker Switch by Wooting**

The Lekker switch was designed by Wooting specifically for their analog keyboards and represents a vertically integrated approach: Wooting designed the switch in concert with the keyboard's firmware and PCB sensor placement to optimize analog reading consistency. The switch uses a custom Hall Effect sensor (the specific sensor IC is not publicly disclosed) optimized for consistent signal linearity across the full travel range. A key design insight in the Lekker is that the magnet and sensor are calibrated together — the magnet's position in the slider and the sensor's placement on the PCB are tuned to produce a linear output curve rather than the nonlinear curves that uncalibrated magnet-sensor pairs tend to exhibit. Total travel is 4mm; the adjustable actuation window is 0.1mm to 3.8mm. At power-on, Wooting keyboards perform a per-switch calibration that records the resting magnetic value for each key, establishing a zero baseline that compensates for manufacturing variation and ambient magnetic fields. Force is rated at 65 centiNewtons (approximately 66 grams) with a linear feel and a lifespan of 100 million keystrokes. Debounce time is 0.03ms, versus the typical 5–25ms debounce required by mechanical contact switches to filter bounce noise.

**Geon Raw HE**

The Geon Raw HE is a third-party Hall Effect switch designed by Geon Works and sold through specialty keyboard retailers including Wooting's own store. It is a linear switch with PC top housing, nylon bottom housing, and POM stem. Available in three spring weight variants: Initial Force 27g/Bottom-out 40g, 36g/50g, and 45g/60g. Total travel is 3.4mm with an analog pre-travel range of 0.1mm to 3.3mm. The magnetic flux specifications are Initial: 160 Gauss, Bottom-out: 720 Gauss. A distinctive design feature is the through-hole bottom housing — the switch has an opening through the PCB mount surface, which affects how the PCB sensor reads the magnet at the bottom of travel. The Geon Raw HE is compatible with the Wooting/Lekker connector standard and has been validated for use with keyboards from Wooting, SteelSeries, Corsair, Rakka, NuPhy, Melgeek, KBDfans, and Matrix Lab.

**SteelSeries OmniPoint (Generations 1, 2, and 3)**

SteelSeries developed their OmniPoint switch line as a proprietary Hall Effect implementation exclusive to the Apex Pro keyboard series. The third generation, OmniPoint 3.0 (branded "HyperMagnetic"), was released with the Apex Pro Gen 3 in late 2024. The Gen 3 switches provide 40 discrete actuation levels adjustable via SteelSeries GG software, with a full range from 0.1mm to 4.0mm. SteelSeries claims their switches achieve response times of approximately 0.54ms versus the 6ms typical of mechanical contact switches — a roughly 11x improvement. The OmniPoint switches are proprietary and not compatible with third-party Hall Effect switches; the Apex Pro keyboard accepts only SteelSeries's own switches.

### 1.3 How Hall Effect Switches Differ from Mechanical Contact Switches

The differences between Hall Effect and mechanical contact switches fall into four categories: signal type, durability, debounce behavior, and information richness.

Signal type is the fundamental distinction. A mechanical switch produces a binary signal — on or off. A Hall Effect switch produces a continuous analog signal that encodes absolute position at every moment of key travel. This is not merely a matter of degree; it represents a categorical difference in the type of information available.

Durability improves dramatically because there are no contacts to wear. The metal contacts in mechanical switches are typically rated for 50 million to 100 million actuations before contact resistance increases or contacts fail to make reliable connection. Hall Effect sensors have no such wear mechanism; the magnet and sensor never touch. Lifespans of 100 million actuations or more are achievable without the contact degradation that limits mechanical switches.

Debounce is eliminated by design. Mechanical contacts physically vibrate when they close, producing a burst of rapid open-close transitions lasting between 5 and 25 milliseconds. All mechanical keyboard firmware must filter this noise, introducing latency. Because Hall Effect switches have no contacts, there is no bounce, and debounce filtering is unnecessary. Wooting specifies 0.03ms debounce on the Lekker, which is effectively just the ADC sampling latency.

Information richness is the implication most relevant to biometric applications. A mechanical keyboard can only report whether a key is pressed or released, and the timestamp of those events. A Hall Effect keyboard can report the exact depth of key press at any polling interval, enabling continuous position tracking throughout the entire keystroke event.

---

## 2. The Analog Keyboard Landscape

### 2.1 What "Analog" Means in This Context

The word "analog" in keyboard marketing terminology refers to the ability of each key to report a continuous value representing how far it is currently pressed, rather than a binary pressed/not-pressed state. The distinction is precisely analogous to the difference between a light switch (binary) and a dimmer (continuous). Analog keyboards can send a value like "key W is pressed 67% of the way down" rather than simply "key W is pressed."

This continuous depth information is what enables all the distinctive features of Hall Effect gaming keyboards: adjustable actuation points, Rapid Trigger, per-key actuation thresholds, and analog input emulation (treating keys as joystick axes).

### 2.2 Major Products

**Wooting 60HE and 80HE**

Wooting is widely credited as the company that commercialized analog Hall Effect keyboards for consumers, beginning with the Wooting One and Two in 2018. The current flagship products are the Wooting 60HE (60% form factor, released 2022, with a v2 revision available) and the Wooting 80HE (80% form factor, released 2023–2024). The 80HE represents the current state of the art for Wooting's technology.

Key specifications for the Wooting 80HE: 8000Hz (8kHz) polling rate, meaning the keyboard samples and reports key positions 8,000 times per second — an interval of 0.125ms between samples. The firmware reads 4,096 steps of position data per key (12-bit ADC resolution). Per-key actuation points are configurable in 0.1mm increments across the full travel range. Rapid Trigger sensitivity is adjustable down to 0.1mm increments. The keyboard connects via USB and is managed through Wooting's Wootility software.

**Rapid Trigger Technology**

Rapid Trigger, pioneered by Wooting, is a feature that can only exist because of continuous analog position reading. Traditional keyboards, even Hall Effect ones used in non-Rapid-Trigger mode, require the key to descend past an actuation point to register a press, then rise past a reset point (typically a few millimeters above actuation) before it can be actuated again. This reset gap is a performance limitation in competitive games where rapid repeated key presses matter.

Rapid Trigger replaces fixed actuation and reset points with dynamic detection: the key actuates whenever it moves downward by a threshold amount (configurable down to 0.1mm) from its current position, and deactivates whenever it moves upward by the same threshold. This means the key can re-actuate mid-travel without being fully released. For the firmware to compute this, it must have continuous position data at every polling cycle — it cannot rely on simple threshold crossing events. This real-time position stream is precisely the data that is biometrically interesting for Jitter's purposes.

An advanced variant, "Continuous Rapid Trigger," removes even the directional threshold: the key actuates on any downward motion and deactivates on any upward motion, regardless of distance. This maximizes repeat speed at the cost of occasional accidental actuations from finger tremor.

**Razer Huntsman V2 Analog and V3 Pro**

Razer entered the analog keyboard market with the Huntsman V2 Analog, which uses optical-analog switches. Rather than Hall Effect magnetic sensing, the Huntsman V2 Analog employs infrared light intensity to measure key position — light from an emitter is partially blocked by the slider at varying depths, and a photodetector reads the intensity as a proxy for position. The mechanism differs from Hall Effect at the physical layer but achieves similar results: a continuous analog signal representing key travel depth.

The Huntsman V3 Pro (released 2024) offers analog mode, Rapid Trigger with sensitivity down to 0.1mm, and a polling rate of up to 8kHz on the latest TKL variant (Huntsman V3 Pro TKL 8kHz). Actuation range is adjustable from 0.1mm to 4.0mm. WASD keys can be configured to function as a joystick left analog stick, with press depth controlling movement speed — the same XInput emulation model Wooting pioneered. Razer's implementation requires the Razer Synapse software to be installed for analog features to function; without Synapse, the keyboard reverts to binary behavior.

**SteelSeries Apex Pro (Gen 1, 2, 3)**

The SteelSeries Apex Pro, first released in 2019, was an early commercially successful Hall Effect keyboard. The Gen 3 (released late 2024) uses OmniPoint 3.0 HyperMagnetic switches with a full adjustable range of 0.1mm to 4.0mm in 40 discrete levels. Unlike Wooting's software-defined continuous adjustment, SteelSeries exposes 40 fixed steps. The Apex Pro Gen 3 supports Rapid Trigger and an anti-ghosting feature called "Protection Mode" that reduces adjacent-key sensitivity when an intended key is actuated. SteelSeries GG software manages configuration. The Apex Pro is notable for being the first mainstream-market Hall Effect keyboard, reaching a broader consumer base than Wooting's more enthusiast-focused products.

**DrunkDeer A75, A75 Pro, and A75 Ultra / Master**

DrunkDeer is a Chinese manufacturer that has emerged as a strong value competitor in the Hall Effect keyboard segment. The A75 line spans from the base A75 (released ~2023) to the A75 Master and A75 Ultra (released 2024–2025). Key specifications from the high-end models: the A75 Ultra and Master use second-generation Hall Effect chips with 0.5 Gauss resolution, capable of detecting magnetic changes with 0.01mm precision in position (versus the 0.1mm practical resolution of first-generation chips). The A75 Master achieves an 8000Hz polling rate and 0.125ms latency. Rapid Trigger sensitivity on the Master extends to 0.01mm — an order of magnitude finer than most competitors, though whether this sensitivity is practically useful at the physical scale of finger movement is debatable. The A75 Pro offers Rapid Trigger sensitivity down to 0.1mm with a 0.2mm to 3.3mm actuation range.

---

## 3. APIs and SDKs for Reading Analog Key Travel

### 3.1 Wooting Analog SDK

The Wooting Analog SDK (GitHub: `WootingKb/wooting-analog-sdk`) is the primary open-source infrastructure for reading analog keyboard data programmatically. The SDK is built in Rust but exposes a C-compatible FFI (foreign function interface), with official or community wrappers for C, C++, Python, and Java. A community Python wrapper called WooPy is available on GitLab.

The SDK's architecture separates the core library from hardware-specific plugins. The core SDK handles device enumeration, plugin loading, data normalization, and the API surface. Hardware support is implemented as plugins — Wooting's own keyboards are supported by a first-party plugin, while third-party keyboards are supported through community-maintained plugins.

The universal-analog-plugin (GitHub: `AnalogSense/universal-analog-plugin`) extends SDK support to a wide range of non-Wooting analog keyboards, including: all Razer analog keyboards (Huntsman V2 Analog, Huntsman Mini Analog, Huntsman V3 Pro, Huntsman V3 Pro Mini, Huntsman V3 Pro Tenkeyless — all requiring Razer Synapse to be running), NuPhy Field75 HE, DrunkDeer A75, and Keychron HE models (Q1 HE, Q3 HE, Q5 HE, K2 HE, Lemokey P1 HE). Madlions' MAD60HE, MAD68HE, and MAD68R are also listed as supported.

**Core API Functions:**

```c
// Initialize the SDK; returns count of connected devices or error code
WootingAnalogResult wooting_analog_initialise();

// Read a single key's analog value by HID keycode
// Returns float 0.0–1.0, or negative error code
float wooting_analog_read_analog(unsigned short code);

// Read all currently pressed keys into parallel arrays
// code_buffer: array of HID keycodes for pressed keys
// analog_buffer: corresponding float values (0.0–1.0) for each key
// Returns count of keys read, or negative error code
int wooting_analog_read_full_buffer(unsigned short *code_buffer,
                                     float *analog_buffer,
                                     unsigned int len);

// Switch keycode interpretation mode
WootingAnalogResult wooting_analog_set_keycode_mode(
    WootingAnalog_KeycodeType mode);
```

**Data Format:**

Analog values are returned as C `float` (32-bit IEEE 754) in the range 0.0 to 1.0. The value 0.0 represents fully raised (no key depression) and 1.0 represents fully depressed (bottom out). When a key is released, the SDK returns 0.0 on the first read after release and then stops reporting the key. The SDK does not expose the raw ADC count; it normalizes the hardware's 12-bit value (0–4095) into the 0.0–1.0 float range before it reaches application code.

**Keycode Modes:**

The SDK supports four keycode identification schemes:
- HID (default): standard USB HID Usage Page 0x07 (Keyboard/Keypad) codes
- ScanCode1: PC AT scan code set 1 (used by some Windows applications)
- VirtualKey: Windows Virtual Key codes
- VirtualKeyTranslate: Windows VK codes adjusted for keyboard layout (Windows-only)

The default HID mode is the most portable and appropriate for cross-platform applications.

**Error Handling:**

The SDK encodes errors as negative float values that are members of the `WootingAnalogResult` enum. Common error codes include: UnInitialized, NoDevices, DeviceDisconnected, InvalidArgument, NoMapping, FunctionNotFound, and IncompatibleVersion. Applications must cast the return value and check for negativity before treating it as a valid analog reading.

**Multi-Device Behavior:**

When the same physical key is pressed simultaneously on multiple connected devices, the SDK returns the maximum value across all devices for that keycode.

**Language Ecosystem:**

The Rust core of the SDK is cross-platform, running on Windows, macOS, and Linux. The C FFI layer makes it accessible from any language capable of calling C libraries. The Wooting developer portal (dev.wooting.io) hosts guides, and an Unreal Engine plugin (`WootingKb/wooting-analog-unreal-plugin`) exists for game engine integration.

### 3.2 Razer Synapse and the Chroma/Analog SDK

Razer's developer ecosystem is focused on their Chroma RGB SDK rather than analog input. The Razer Developer Portal (developer.razer.com) provides access to the Chroma SDK for lighting control and GameSense-style integration, but there is no publicly documented SDK for reading per-key analog depth values programmatically from Huntsman analog keyboards.

Razer's analog keyboards communicate their depth data to Razer Synapse, which must be running as a background service for analog features to function. The Synapse software exposes WASD-as-joystick XInput emulation to games, but there is no public API allowing third-party applications to read the raw per-key depth values that Synapse is processing internally. The community universal-analog-plugin for the Wooting SDK achieves Razer support by reverse-engineering or accessing Synapse's internal data pathway — the implementation details are not publicly documented by Razer.

The OpenRazer project (a Linux community effort, GitHub: `openrazer/openrazer`) has tracked Razer Huntsman V2 Analog support, but analog depth reading is not among OpenRazer's capabilities; it focuses on LED control and basic input routing.

### 3.3 SteelSeries GameSense SDK

The SteelSeries GameSense SDK (GitHub: `SteelSeries/gamesense-sdk`, developer portal: steelseries.com/developer) is designed for sending game state information to SteelSeries peripherals to drive LED lighting, haptic feedback, and OLED display content. It operates via a local HTTP JSON API — applications send JSON payloads describing game events to a SteelSeries Engine local server, and the SDK routes those events to device effects.

The GameSense SDK does not provide an API for reading analog key depth values from the Apex Pro. It is a unidirectional event sink, not a data source for keyboard state. SteelSeries has not published a public SDK for reading OmniPoint analog values; that data is consumed internally by SteelSeries GG software for actuation point configuration and Rapid Trigger operation but is not exposed to third-party developers through any documented interface.

### 3.4 HID-Level Protocol Access

At the USB HID level, the situation for analog keyboards is complicated by the fact that the USB HID specification for keyboards (Usage Page 0x07) defines keys as binary — there is no standard HID report field for "key X is pressed to depth Y." Analog keyboards work around this at the hardware level by implementing a second HID interface alongside the standard keyboard interface, typically either:

1. **Gamepad/Joystick interface**: The keyboard registers as both a keyboard and a joystick device. Analog values are transmitted through standard HID joystick axis reports (Usage Page 0x01, Generic Desktop). This is how Wooting's early keyboards worked — the WASD keys were mapped to joystick X/Y axes and transmitted via XInput emulation.

2. **Vendor-defined reports**: The keyboard uses custom HID Usage Pages (vendor-defined, in the range 0xFF00–0xFFFF) to transmit proprietary analog data. The host-side software (Wootility, SteelSeries GG, Razer Synapse) knows how to interpret these vendor-specific reports.

The Wooting Analog SDK uses the second approach — it communicates with the keyboard via vendor-defined HID reports, bypassing the standard keyboard HID interface. This is why the SDK requires separate initialization and cannot be dropped in as a replacement for standard keyboard input reading.

### 3.5 WebHID API and Browser Access

The WebHID API (available in Chromium-based browsers since Chrome 89, 2021) allows web applications to communicate with HID devices, including keyboards, subject to user permission grants. However, the W3C specification explicitly blocks access to devices that define top-level HID collections with keyboard usage (Usage Page 0x01, Usage 0x06 Keyboard). This "protected collection" restriction means standard keyboards — including the standard keyboard interface of an analog keyboard — cannot be accessed via WebHID.

The analog/vendor-defined HID interface of an analog keyboard is a different HID interface with different usage pages. In principle, WebHID could be used to read the vendor-defined analog data from a keyboard's secondary HID interface, provided:
1. The keyboard exposes its analog data through a non-keyboard HID collection
2. The browser has not blocked the specific device (browsers maintain blocklists of known sensitive devices)
3. The user has explicitly granted permission through the WebHID device picker

In practice, this is not a supported or documented use case for any current analog keyboard manufacturer. The Wooting Analog SDK does not include a WebHID path. Accessing analog keyboard data from a browser requires either: (a) a native helper application acting as a bridge, exposing the data to the web page via WebSocket or postMessage; or (b) a browser extension with native messaging access. Both approaches require software installation and cannot be done transparently within a pure web application without user action.

### 3.6 Resolution and Physical Limits

The question of resolution — how many discrete depth levels the hardware can distinguish — spans multiple layers:

**ADC Resolution**: Wooting keyboards use a 12-bit ADC, producing 4,096 discrete levels (2^12) across the measurable analog range. This is the raw hardware resolution before any firmware processing.

**Physical Precision**: The Gateron KS-20 specifies a magnetic flux range of 102–905 Gauss across approximately 3.2mm of detectable travel. With 12-bit ADC resolution, this works out to approximately 0.78 micrometers per ADC count — far finer than any meaningful physical distinction in key travel.

**Practical Precision**: The DrunkDeer A75 Master claims 0.01mm precision (a generation-2 Hall chip with 0.5 Gauss resolution). At 3mm of travel, 0.01mm resolution implies 300 distinguishable positions, or roughly 9 bits. The Wooting 4,096-step (12-bit) claim suggests approximately 0.001mm theoretical resolution at 4mm travel, but real-world noise, mechanical play, and thermal drift likely bound practical resolution to 0.01–0.05mm.

**SDK Reported Resolution**: The Wooting Analog SDK reports values as a normalized 32-bit float (0.0–1.0). From 4,096 hardware levels, the SDK has the information to distinguish approximately 4,096 discrete floating-point values. However, because the SDK normalizes to [0.0, 1.0], the quantization is:

```
step size = 1.0 / 4095 ≈ 0.000244
```

Applications receiving SDK values can distinguish about 4,096 unique depths per key.

---

## 4. Biometric Implications for Jitter

### 4.1 What Binary Keyboards Provide

Current keystroke biometric systems, including the Jitter baseline, operate on binary keyboards that yield exactly two event types per key: KeyDown (with timestamp) and KeyUp (with timestamp). From these events, two fundamental measurements can be derived:

**Dwell Time**: The duration between KeyDown and KeyUp for a single key — how long the key was held depressed. This captures finger strength, typing habit, and motor pattern characteristics. Typical dwell times range from 30ms to 150ms depending on the key, typing speed, and individual physiology.

**Flight Time**: The duration between the KeyUp of one key and the KeyDown of the next — the inter-keystroke gap. This captures typing rhythm, finger transition speed, and the biomechanical time cost of moving between keys. Flight times can be negative (keys overlap), zero (simultaneous press), or positive (sequential press).

These two measurements, applied across a sequence of keystrokes, form the foundation of all existing keystroke biometric work. Equal Error Rates (EER) for state-of-the-art systems on binary keyboard data range from approximately 1.4% to 6.5% depending on the model, dataset, and authentication context. This is the ceiling Jitter is working against with binary signals.

Bots produce characteristically different binary timing patterns: flight times are often perfectly uniform, dwell times cluster to hardware polling intervals (1ms or 8ms increments), and the variance in both metrics is orders of magnitude lower than human typing. A human's flight time variance on a given bigram (key pair) is typically 20–80ms standard deviation; a bot's is often sub-1ms.

### 4.2 The New Dimension: Analog Depth as a Continuous Signal

Analog Hall Effect keyboards add a third axis to every keystroke event: position over time within the keystroke. Instead of two events (KeyDown at t=0, KeyUp at t=T), an analog keyboard produces a time series of (timestamp, depth) pairs sampled at the polling rate — for a Wooting 80HE at 8kHz, this is potentially 8,000 samples per second, yielding 240 samples for a 30ms keypress.

This transforms every keystroke from a two-point event into a continuous trajectory in one-dimensional space. The biometric implications are significant.

### 4.3 New Signal Dimensions Available

**Actuation Depth Curves**

Each keystroke produces a depth-versus-time profile: the key starts at 0.0, descends at some rate to a peak depth, dwells at or near that depth for some duration, then ascends back to 0.0. The shape of this curve is biometrically characterizable. A user who presses forcefully and bottoms out every key will produce flat-topped curves reaching 1.0. A user who types with a light, controlled touch will produce curves that peak at 0.6–0.8 and do not reach full travel. Some users will show a characteristic "overshoot and settle" pattern if they press and slightly release before fully committing to a keypress.

**Peak Depth Fingerprinting**

The maximum depth achieved per key per press is itself a biometric signal. Research in touchscreen typing has shown that users develop consistent force habits per finger — the index finger tends to press with different characteristic force than the pinky. On physical keyboards, this translates to characteristic maximum depression depths. A user might consistently bottom out F and J (index fingers, home row) while consistently pressing Q only 70% of the way (left pinky, weaker finger, less common key). This per-key depth profile constitutes a fingerprint that would be stable across sessions for a given user.

Bots scripting keypresses either bottom out every key uniformly (depth = 1.0, every key, every press) or, if simulating key depth, would produce suspiciously regular depth distributions — for example, always 0.8 depth, with near-zero variance. Human depth distributions show natural noise: the same key pressed by the same finger will vary ±10–20% in peak depth across presses due to fatigue, attention, typing speed, and neuromuscular variability.

**Velocity and Acceleration Profiles**

The derivative of the depth-time curve gives velocity (how fast the key is moving downward or upward at each moment), and the second derivative gives acceleration. These curves describe the dynamics of the keystroke: how quickly the user accelerates into the press, whether they decelerate before bottoming out, and the release dynamics (sudden snap-up versus gradual release).

Human finger dynamics during typing are governed by the physiology of tendon-muscle-bone systems, which produce characteristic sigmoid-shaped descent curves (slow start, rapid acceleration, deceleration near bottom). Individual users will differ in the time constants of this sigmoid, the asymmetry between press and release curves, and whether they exhibit "resting contact" behavior (finger resting on key with nonzero depth before intentional press).

**Resting Finger Pressure**

Many users rest their fingers lightly on home row keys between keystrokes. On a binary keyboard, this resting contact is invisible unless the key crosses the actuation threshold. On an analog keyboard, the resting depth — say, 0.05 to 0.15 normalized units from light finger contact — is measurable and characteristic. A user who rests fingers with 10g of constant pressure will produce a consistent non-zero baseline between keystrokes. A user who hovers fingers above the keys will produce a true zero between keystrokes.

This resting pressure signal has no equivalent on binary keyboards. It is only observable with analog sensing.

**Partial Press Behaviors**

Users under cognitive load (thinking before typing a word) may show characteristic partial press behaviors: the key starts to descend to 20–30% depth as the finger begins to press, pauses as the brain processes, then completes the press or withdraws. These hesitation patterns are invisible on binary keyboards. An analog keyboard captures the full exploratory motion.

**Key Release Profiles**

The release trajectory (the ascending portion of the depth curve) is distinct from the press trajectory and carries independent biometric information. Some users release keys with a rapid snap (high release velocity), others gradually lift the finger. The time constant of the release curve can differ substantially from the press curve. Per-user, per-key release profiles are measurable from the analog time series.

### 4.4 Anti-Bot Implications

The uniform-depth problem for bots mirrors the uniform-timing problem they have with binary keyboards. A bot generating synthetic keystrokes can potentially produce human-plausible timing variance (flight times and dwell times with artificial noise injected). Reproducing analog depth curves with human-plausible characteristics is substantially harder.

To fool analog depth biometrics, a bot would need to:
1. Know the target user's per-key characteristic peak depths
2. Generate per-press depth variation consistent with human neuromuscular noise (Gaussian with plausible mean and standard deviation)
3. Produce realistic sigmoid press curves with correct time constants
4. Generate plausible release curves (which may differ from press curves)
5. Inject resting-contact baselines between keystrokes
6. Maintain cross-session consistency in all of the above

This is a fundamentally harder spoofing problem than timing-only attacks. The additional dimensions multiply the signal space the bot must model and reproduce correctly, and the naturalistic noise patterns in analog curves are difficult to model without training data on the specific target user.

For bot classification (human vs. not-human, rather than specific user identification), the analog signals provide strong categorical markers: bots that bottom out every key uniformly, bots with zero resting pressure, bots with unnaturally fast or linear press curves. These are recognizable patterns even without a per-user baseline.

### 4.5 Impact on Whole Assessment Rating (WAR)

Jitter's WAR metric aggregates multiple behavioral signals into a single score. On binary keyboards, the signal space is effectively two-dimensional: dwell time and flight time. Adding analog depth transforms the signal space into multiple continuous dimensions per keystroke:

- Peak depth (scalar per keypress)
- Press velocity curve (temporal series)
- Release velocity curve (temporal series)
- Resting baseline pressure (continuous between-keypress signal)
- Partial press count and depth distribution (per session)
- Per-finger depth fingerprint (derived over session)

The practical impact on WAR depends on how well a classifier can exploit the additional dimensions, but the theoretical signal richness increase is substantial — potentially 10–100x more biometric information per keystroke event compared to binary keyboard timing alone.

---

## 5. Practical Considerations

### 5.1 Market Penetration and Adoption

Analog Hall Effect keyboards remain a premium, enthusiast-oriented segment of the gaming keyboard market. The overall gaming keyboard market was estimated at approximately $1.1 billion in 2024, with approximately 9.14 million units sold. Hall Effect keyboards, while growing rapidly, represent a fraction of this volume.

Key adoption data points:
- By 2026, analog keyboards with Hall Effect switches are projected to capture approximately 25% of the high-end gaming keyboard segment
- Rapid Trigger features were adopted by 67% of VCT (Valorant Champions Tour) 2025 professional players
- Major brands including Asus, Corsair, Keychron, and Logitech all introduced Hall Effect keyboards in 2025, signaling mainstream market entry
- The Hall Effect switch market was valued at $2.1 billion in 2024, projected to reach $4.5 billion by 2033 (CAGR 9.1%)

For Jitter's practical deployment, analog keyboard penetration among the user base is likely 2–8% of total keyboard users in 2026, concentrated heavily among gamers and enthusiasts. This is a niche within the addressable typing population.

### 5.2 Progressive Enhancement Strategy

The correct engineering approach is progressive enhancement: treat analog depth as an optional enrichment layer on top of the binary timing baseline that works for all users.

The detection flow should be:

1. **Device enumeration at session start**: Query the Wooting Analog SDK to determine if an analog keyboard is connected and recognized. If no analog keyboard is detected, fall back to binary timing-only scoring.

2. **Capability detection on web surfaces**: Since the Wooting Analog SDK requires a native application layer, web-only Jitter implementations cannot directly access analog data. Options include a lightweight native helper application (a small background process that bridges SDK data to the web page via WebSocket), or a browser extension using native messaging.

3. **Layered feature extraction**: Run binary timing feature extraction (dwell/flight) for all users. For users with detected analog keyboards, additionally extract depth curves, peak depths, and velocity profiles.

4. **Weighted WAR scoring**: Apply separate model weights for analog-equipped users versus binary-only users. Do not penalize binary users for lacking depth signals; instead, boost confidence for analog users who have depth profiles that match expectations.

5. **Temporal consistency**: Analog depth profiles require an enrollment phase — multiple typing sessions to establish per-user, per-key depth distributions. The progressive approach begins with binary scoring and progressively upgrades the model as analog data accumulates.

### 5.3 Privacy Implications

Analog depth data is more invasive than binary timing data and requires careful privacy consideration.

Under GDPR (and equivalents), keystroke biometric data that "allow or confirm the unique identification" of a natural person qualifies as biometric data under Article 9, which restricts processing to specific legal bases including explicit consent. Depth profile data, because it is more individually distinctive than timing data alone, more clearly crosses the threshold of enabling unique identification.

Specific concerns:
- Per-key depth profiles, aggregated over many keystrokes, constitute a detailed behavioral fingerprint that could potentially be used to identify a person across contexts beyond the intended authentication purpose
- Depth data is harder to anonymize than timing data — timing can be rounded or perturbed with minimal impact on authenticity scores, but depth data contains additional dimensions that are harder to strip of identifying information
- Depth data includes resting pressure between keystrokes, which is a continuous signal rather than event-triggered — this is closer to continuous monitoring than event-based logging

Recommended mitigation: extract and store only aggregate statistical features (mean peak depth, depth standard deviation, press curve time constant) rather than raw time-series depth data. On-device feature extraction before transmission reduces the volume and sensitivity of data leaving the endpoint.

### 5.4 Patent Landscape for Biometric Use of Analog Keystroke Data

Several relevant patents and patent applications establish prior art in adjacent areas:

**US9165129B2** — "Keyboard as biometric authentication device" (WO2014004038A1 international equivalent): Describes keyboards with keys comprising pressure detectors, keypress detectors, and velocity detectors. Technologies covered include mechanical key switches, capacitive sensing key switches, strain gauges, and resistive/capacitive touch. This patent addresses pressure detection in keyboards for biometric purposes, though it predates the commercialization of Hall Effect analog keyboards. The claims focus on capturing touch location and pressure; they may encompass depth-based biometrics but were not written with Hall Effect sensing in mind.

**US8332932B2** — "Keystroke dynamics authentication techniques": Covers timing-based keystroke authentication using dwell and flight time. Does not address analog depth.

**US8762734B2** — "Biometric pressure grip": Covers pressure-based biometrics for grip interfaces; may have claim language relevant to key depth measurement.

**US9864516 / US10402089** — Universal keyboard patents covering capacitive layer detection of touch location and pressure for biometric generation.

Prior art observation: The specific claim space of Hall Effect sensor-based continuous depth profiling for behavioral biometric scoring — as distinct from pressure-sensitive keyboards using capacitive or resistive sensing — appears to be relatively open. The combination of Hall Effect sensing technology (contactless, magnetic, linear, high-resolution) with biometric depth profiling (velocity curves, resting pressure, per-key fingerprinting) for bot detection specifically represents a potential novel claim space.

The key differentiators from existing patents:
- Hall Effect sensing produces a continuous position signal (not a pressure proxy) through a physically distinct mechanism from capacitive or resistive sensing
- Continuous Rapid Trigger polling (up to 8kHz) provides temporal resolution unavailable in prior art systems
- The specific application to bot detection (human vs. automated agent classification) rather than user authentication is underexplored in existing keyboard biometric patents
- The resting pressure between keystrokes (finger contact depth in the 0–0.1 normalized range during non-press intervals) as a distinct biometric signal may be novel

---

## 6. Technical Deep Dive: Raw Data During a Keystroke

### 6.1 The Complete Keystroke as a Data Stream

At an 8kHz polling rate, a single keystroke lasting 60ms (a moderately fast press) produces approximately 480 samples. Each sample consists of:

```
{
  timestamp_us: uint64,    // microsecond timestamp
  keycode: uint16,         // USB HID keycode
  depth: float32           // 0.0–1.0 normalized depth
}
```

A complete typing sequence of 200 characters at 80 words per minute (approximately 400ms/key including inter-key gaps) over 80 seconds would produce roughly:

- 200 keystrokes × 60ms average press duration × 8000 samples/sec = 96,000 depth samples from press intervals
- Plus resting baseline samples during inter-key gaps: ~80 seconds × 8000 samples/sec = 640,000 baseline samples

Total raw data volume: approximately 736,000 float32 samples for an 80-second session, or about 2.8 MB of raw time-series data. This argues strongly for on-device feature extraction before transmission.

### 6.2 Feature Extraction from the Raw Stream

From the raw depth time series, the following features can be extracted per keystroke:

**Press Phase Features** (descent from 0.0 to peak depth):
- `t_press_start`: timestamp when depth first exceeds noise floor (e.g., depth > 0.02)
- `peak_depth`: maximum depth achieved during press
- `t_peak`: timestamp of peak depth
- `press_duration`: t_peak − t_press_start
- `press_velocity_mean`: peak_depth / press_duration
- `press_curve_shape`: fit parameter of sigmoid function to descent curve (captures acceleration pattern)
- `overshoot_depth`: depth achieved momentarily before settling, if press overshoots and recoils

**Dwell Phase Features** (time at or near peak depth):
- `dwell_duration`: time spent with depth > 90% of peak_depth
- `dwell_depth_variance`: variance of depth readings during dwell (captures sustained tremor)
- `dwell_depth_mean`: mean depth during dwell phase

**Release Phase Features** (ascent from peak back toward 0.0):
- `release_duration`: time from release initiation to depth dropping below noise floor
- `release_velocity_mean`: peak_depth / release_duration
- `release_curve_shape`: fit parameter of release sigmoid (may differ from press)
- `asymmetry_ratio`: press_duration / release_duration (many users release faster than they press)

**Inter-Keystroke Baseline Features** (between keystrokes):
- `resting_depth_mean`: mean depth of key during non-press periods
- `resting_depth_variance`: variance during rest (captures finger hover stability)
- `contact_fraction`: fraction of time between keystrokes where depth > noise floor

**Session-Level Aggregate Features** (derived from multiple keystrokes):
- Per-key mean and standard deviation of peak_depth across all presses
- Per-finger depth fingerprint (grouping keys by finger assignment)
- Session-level press velocity distribution
- Session-level release velocity distribution

### 6.3 Hardware Polling and Timing

The polling rate of the keyboard determines the temporal resolution of the depth time series. Current generation keyboards:

| Keyboard | Max Polling Rate | Sample Interval |
|---|---|---|
| Wooting 60HE v2 | 1000 Hz | 1.0 ms |
| Wooting 80HE | 8000 Hz | 0.125 ms |
| DrunkDeer A75 Master | 8000 Hz | 0.125 ms |
| Razer Huntsman V3 Pro TKL 8kHz | 8000 Hz | 0.125 ms |
| SteelSeries Apex Pro Gen 3 | 8000 Hz | 0.125 ms |

At 8kHz polling and 0.125ms sample intervals, the timing resolution for detecting the onset of press or release events is 0.125ms — approximately 40–80x finer than the 5–10ms precision available from binary keyboard event timestamps in most operating systems.

The Wooting Analog SDK does not itself impose a polling rate; it reads data from the keyboard's USB reports, which arrive at the keyboard's native polling rate. Applications calling `wooting_analog_read_analog()` in a tight loop will be rate-limited by the keyboard's USB polling interval. At 8kHz, this means approximately one new sample per 0.125ms. For biometric feature extraction, an application-side polling interval of 1ms is likely sufficient — this gives 30–150 samples per typical keystroke and reduces CPU overhead compared to true 8kHz sampling.

### 6.4 Coordinate System and Noise Characteristics

The SDK's normalized [0.0, 1.0] depth scale maps directly to the physical key travel range, but the mapping is nonlinear in physical space because the Hall Effect sensor's output is a nonlinear function of magnet distance. Wooting's firmware applies a calibration curve to linearize the output, but the calibration is per-keyboard, not per-switch. Individual switch variation means different keys at the same nominal depth may report slightly different SDK values.

Sensor noise characteristics at rest (key not pressed) are typically sub-0.01 in normalized units, corresponding to approximately ±0.04mm physical variation from thermal noise and electromagnetic interference. During a press event, mechanical vibration of the switch body may add additional noise, particularly at peak velocity (maximum descent speed). This mechanical noise is distinct from and additive to the sensor's electrical noise floor.

For biometric purposes, a noise floor of 0.01 normalized units (approximately 0.04mm) is acceptable — it is substantially smaller than the between-press depth variation that characterizes individual users.

---

## Summary and Research Conclusions

Hall Effect analog keyboards represent a significant and underexplored opportunity for keystroke biometric systems. The technology produces a continuous depth time series per key at up to 8,000 samples per second and 12-bit ADC resolution, transforming each binary press-release event into a rich multi-feature trajectory. The biometric signal space — depth curves, velocity profiles, peak depths, resting pressures, release asymmetries — is qualitatively larger than the dwell-time/flight-time space of binary keyboards and is correspondingly harder for bots to spoof convincingly.

The Wooting Analog SDK provides the most accessible path to reading this data programmatically, with open-source Rust/C code, cross-platform support, and a plugin architecture that extends to Razer, DrunkDeer, NuPhy, and Keychron analog keyboards. The SDK normalizes hardware values to float [0.0, 1.0] representing 4,096 discrete levels of depth.

Market penetration remains limited — Hall Effect keyboards are a niche within the gaming keyboard segment, concentrated among competitive gamers and enthusiasts. As of 2026, adoption among all keyboard users is estimated at 2–8%, with higher concentration among the competitive gaming demographics where Jitter's bot detection is most relevant.

The progressive enhancement architecture — using analog depth when available, falling back to binary timing — is the correct deployment strategy. The patent space for Hall Effect-specific biometric depth profiling for bot detection appears substantially open, with existing patents addressing pressure-based biometrics through capacitive/resistive sensing that is mechanically and operationally distinct from contactless Hall Effect magnetic sensing.

---

## Sources

- [Gateron KS-20 Product Page — GATERON](https://www.gateron.com/products/gateron-ks-20-magnetic-white-switch-set)
- [Gateron KS-20 Technical Overview — Gateron Blog](https://www.gateron.com/blog/detail/get-to-know-the-gateron-ks-20-magnetic-hall-sensor-switch-set)
- [What are Hall Effect keyboard Switches — Wooting](https://wooting.io/post/what-are-hall-effect-keyboard-switches)
- [Wooting Analog SDK — GitHub: WootingKb/wooting-analog-sdk](https://github.com/WootingKb/wooting-analog-sdk)
- [Wooting Analog SDK Usage — SDK_USAGE.md](https://github.com/WootingKb/wooting-analog-sdk/blob/develop/SDK_USAGE.md)
- [Wooting Developer Portal](https://wooting.io/post/wooting-developer-portal-the-future-of-analog-input-keyboards)
- [Wooting 80HE True Polling Rate](https://wooting.io/post/wooting-80he-the-true-polling-rate)
- [Wooting Rapid Trigger Explained](https://wooting.io/rapid-trigger)
- [GEON Raw HE Switch — GEONWORKS](https://geon.works/products/geon-raw-he-switch)
- [GEON Raw HE Switch — KBDfans](https://kbdfans.com/products/geon-raw-he-magnetic-switch)
- [Razer Huntsman V3 Pro — Razer](https://www.razer.com/gaming-keyboards/razer-huntsman-v3-pro)
- [Razer Huntsman V3 Pro Review — PCWorld](https://www.pcworld.com/article/2217170/razer-huntsman-v3-keyboard-review.html)
- [Universal Analog Plugin Supported Keyboards — GitHub Issue #1](https://github.com/AnalogSense/universal-analog-plugin/issues/1)
- [Universal Analog Plugin — GitHub: AnalogSense/universal-analog-plugin](https://github.com/AnalogSense/universal-analog-plugin)
- [SteelSeries Apex Pro Gen 3 Review — G Style Magazine](https://gstylemag.com/2024/11/18/steelseries-apex-pro-gen-3-review/)
- [SteelSeries Apex Pro Gen 3 — The Shortcut](https://www.theshortcut.com/p/steelseries-apex-pro-gen-3-gaming-keyboard-hall-effect-switches-thockier)
- [GameSense SDK — GitHub: SteelSeries/gamesense-sdk](https://github.com/SteelSeries/gamesense-sdk)
- [DrunkDeer A75 — DrunkDeer](https://drunkdeer.com/products/adjustable-keyboard-magnetic-switch-a75)
- [DrunkDeer A75 Ultra — DrunkDeer Blog](https://drunkdeer.com/blogs/news/drunkdeer-a75-ultra-he-keyboard-unlock-the-future-of-speed-and-precision)
- [DrunkDeer A75 Review — RTINGS](https://www.rtings.com/keyboard/reviews/drunkdeer/a75)
- [WebHID API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API)
- [WebHID Chrome for Developers](https://developer.chrome.com/docs/capabilities/hid)
- [A Survey of Keystroke Dynamics Biometrics — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC3835878/)
- [Biometric Identification Based on Keystroke Dynamics — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9105156/)
- [A Hybrid CAPTCHA with Keystroke Dynamics — arXiv](https://arxiv.org/html/2510.02374)
- [Keystroke Dynamics — Plurilock](https://plurilock.com/deep-dive/keystroke-dynamics/)
- [Keystroke Dynamics: Biometrics at Your Fingertips — SecureIDNews](https://www.secureidnews.com/news-item/keystroke-dynamics-biometrics-at-your-fingertips/)
- [US9165129B2 — Keyboard as biometric authentication device — Google Patents](https://patents.google.com/patent/US9165129B2/en)
- [US8332932B2 — Keystroke dynamics authentication techniques — Google Patents](https://patents.google.com/patent/US8332932B2/en)
- [US8762734B2 — Biometric pressure grip — Google Patents](https://patents.google.com/patent/US8762734B2/en)
- [2025 Hall Effect Keyboard Trends — Accio](https://www.accio.com/business/trends-of-hall-effect-keyboard)
- [Hall Effect Keyboards Go Mainstream in 2025 — GamesRadar+](https://www.gamesradar.com/hardware/gaming-keyboards/2025-may-have-been-the-year-the-hall-effect-keyboard-went-mainstream-but-2026-will-be-the-year-it-flourishes/)
- [Gaming Keyboard Market Report 2030 — Grand View Research](https://www.grandviewresearch.com/industry-analysis/gaming-keyboard-market-report)
- [Wooting 60HE Product Page](https://wooting.io/wooting-60he)
- [Wooting 80HE Product Page](https://wooting.io/wooting-80he)
- [Wooting Lekker Switch — Deskthority Wiki](https://deskthority.net/wiki/Wooting_Lekker)
- [Razer Huntsman V2 Analog — Razer](https://www.razer.com/gaming-keyboards/razer-huntsman-v2-analog)
- [GDPR and Biometrics — NineID](https://www.nineid.com/blog/gdpr-and-biometrics-an-overview)
