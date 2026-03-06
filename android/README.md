# Anvil Keyboard 🛡️

**Proof of Human Work - An Android Keyboard**

Anvil Keyboard tracks your authentic typing to prove content was written by a human, not AI.

---

## Features

- **Full QWERTY Keyboard** - Works everywhere on Android
- **Keystroke Timing** - Tracks flight time between keys
- **Touch Pressure** - Captures how hard you press (on supported devices)
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

## Files

```
AnvilKeyboard/
├── app/
│   ├── src/main/
│   │   ├── java/com/anvil/keyboard/
│   │   │   ├── AnvilInputMethodService.kt  # The keyboard
│   │   │   ├── BiometricTracker.kt         # Tracking logic
│   │   │   └── MainActivity.kt             # Settings/stats UI
│   │   ├── res/
│   │   │   ├── drawable/                   # Icons & backgrounds
│   │   │   ├── values/                     # Colors, strings, themes
│   │   │   └── xml/method.xml              # Input method config
│   │   └── AndroidManifest.xml
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
