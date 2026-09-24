# Anvil Keyboard 🛡️

**Proof of Human Work - An Android Keyboard**

Anvil Keyboard tracks your authentic typing to prove content was written by a human, not AI.

---

## Features

- **Full QWERTY Keyboard** - Works everywhere on Android
- **Keystroke Timing** - Tracks flight time between keys
- **Touch Pressure** - Captures how hard you press (on supported devices)
- **Motion Evidence** - Checks that each tap physically jolted the phone (see below)
- **Purity Score** - Real-time display of typed vs pasted ratio
- **Passport System** - Lifetime keystroke tracking with ranks
- **Verifiable Badges** - Copy badges that prove your work

---

## Ranks

| Rank | Keystrokes Required |
|------|---------------------|
| Novice | 0 |
| Silver | 10,000 |
| Gold | 50,000 |
| Platinum | 100,000 |
| Diamond | 500,000 |

---

## How to Build

### Option 1: Android Studio (Recommended)

1. Install [Android Studio](https://developer.android.com/studio)
2. Open Android Studio → File → Open → Select the `AnvilKeyboard` folder
3. Wait for Gradle sync to complete
4. Click Run (green play button) or Build → Build APK
5. APK will be at `app/build/outputs/apk/debug/app-debug.apk`

### Option 2: Command Line

```bash
# Make sure you have Android SDK installed
# Set ANDROID_HOME environment variable

cd AnvilKeyboard
./gradlew assembleDebug

# APK location:
# app/build/outputs/apk/debug/app-debug.apk
```

---

## How to Install

1. Build the APK (see above)
2. Transfer APK to your Android phone
3. Open the APK file to install (enable "Unknown sources" if prompted)
4. Open "Anvil Keyboard" app
5. Tap "Enable Keyboard" → Toggle on Anvil Keyboard
6. Tap "Select Anvil Keyboard" → Choose Anvil

---

## How It Works

1. **Every keypress is tracked** with timestamp and pressure
2. **Flight time** (time between keys) creates a biometric fingerprint
3. **Pasting is detected** and counted separately
4. **Purity Score** = Typed Characters / Total Characters × 100%
5. **Badges encode** your stats in a verifiable format

---

## Motion Evidence

A real finger hitting the glass gives the phone a tiny jolt: a spike in the
accelerometer (and usually the gyroscope) within a few milliseconds of the
touch. Taps injected by software (adb, accessibility services, emulators)
produce no jolt, and their touch size and pressure are usually constant.
That makes phone motion a cheap second signal next to keystroke timing.

- **When:** sensors run only while the keyboard is on screen, on a background thread.
- **What's measured per tap:** how sharply the accelerometer and gyroscope
  readings changed over ~5 ms (m/s², rad/s) compared with just before the tap,
  and when that peaked relative to the touch. Only magnitudes, never direction.
  Tilting or walking with the phone changes readings slowly, so it isn't
  mistaken for a tap.
- **Our own vibration:** the keyboard's key-up buzz also shakes the phone
  (even for injected taps), so those samples are ignored, and taps that land
  mid-buzz are skipped rather than scored.
- **What's kept:** per-session and lifetime aggregates (share of taps with a
  jolt, typical jolt size and spread, timing). Raw samples live only in a
  ~2 second in-memory buffer; per-tap values are never stored or tied to a
  key. Raw motion data can reveal what was typed, so it never leaves the phone.
- **Where it shows:** a live `📳 %` in the keyboard's status bar, a Motion
  Evidence card in the app, and a `motion` block in badges.
- **Evidence levels:** `strong` (≥60% of taps jolted the phone), `weak`
  (≥20%), `none`, or `unavailable` (fewer than 10 taps measured, no sensor,
  or under 100 Hz). This is a measurement, not a verdict: a phone lying on a
  table jolts much less than one in the hand.
- **Status:** the analysis (`TapMotionAnalyzer.kt`) is plain Kotlin with JVM
  unit tests in `app/src/test/` that run on simulated sensor streams. The
  thresholds are first guesses and still need calibrating on real phones.

---

## Files

```
AnvilKeyboard/
├── app/
│   ├── src/main/
│   │   ├── java/com/anvil/keyboard/
│   │   │   ├── AnvilInputMethodService.kt  # The keyboard
│   │   │   ├── BiometricTracker.kt         # Tracking logic
│   │   │   ├── TapMotionAnalyzer.kt        # Tap jolt analysis (plain Kotlin)
│   │   │   ├── TapMotionSensor.kt          # Feeds sensors to the analyzer
│   │   │   └── MainActivity.kt             # Settings/stats UI
│   │   ├── res/
│   │   │   ├── drawable/                   # Icons & backgrounds
│   │   │   ├── values/                     # Colors, strings, themes
│   │   │   └── xml/method.xml              # Input method config
│   │   └── AndroidManifest.xml
│   ├── src/test/                           # JVM unit tests
│   └── build.gradle
├── build.gradle
├── settings.gradle
└── gradle.properties
```

---

## Next Steps

- [ ] Add number/symbol keyboard layout
- [ ] Add swipe typing support
- [ ] Server-side badge verification
- [ ] Export detailed session reports
- [ ] iOS version

---

## License

MIT - Do whatever you want with it.

---

Built for humans, by humans. 🛡️
