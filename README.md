# ⚡ JITTEr - Human Authorship Verification

**J**itter **I**ntegrity **T**racking & **T**yping **E**ntropy **R**ecognition

A Chrome extension that verifies human authorship through keystroke biometrics, making bot-generated content economically unfeasible.

---

## 📜 Copyright & License

**Copyright © 2025-2026 Denis Gingras. All Rights Reserved.**

This software is proprietary and confidential. See [LICENSE](LICENSE) file for full terms.

**IMPORTANT:** This is proprietary software protected by copyright law. Unauthorized reproduction, distribution, or commercial use is strictly prohibited without explicit written permission.

**Patent Pending:** Methods and systems for keystroke biometric verification.

---

## 🎯 Purpose

**For Schools:** Detect AI-generated essays without false positives
**For Students:** Prove authentic human work
**For Teachers:** Fast, reliable verification dashboard

**Not a content detector** - We verify the *human writing process*, not the content itself.

---

## 🔥 Key Features

### 1. Loki Biometrics - Keystroke Analysis
- Measures typing rhythm (flow vs gap intervals)
- Calculates "Cognitive Ratio" (pauses after punctuation)
- Detects bot-like patterns (too fast, too consistent)
- Real-time entropy scoring

### 2. Cryptographic Signatures (v2.0)
- ECDSA P-256 digital signatures
- Each badge cryptographically signed
- Chain of custody (each badge references previous)
- Mathematically impossible to forge

### 3. Lifetime Passport System
- Accumulates keystrokes over time
- Progressive levels (Novice → Master)
- Tracks account age (days since first use)
- **Bot farms can't fake time**

### 4. Cloud Sync (Optional)
- Firebase authentication for portable passports
- Sync passport across devices
- Privacy-first: never syncs essay content
- Local-first architecture (works offline)

### 5. Activity Pattern Analysis
- Daily keystroke statistics (last 90 days)
- Hourly writing patterns (detects 24/7 bot farms)
- Session length distribution
- Variance analysis (humans are inconsistent, bots aren't)

### 6. Automated Bot Detection
- Suspicion score (0-100)
- Statistical thresholds for bot farms
- Risk levels: LOW / MEDIUM / HIGH

### 7. Teacher Verification Dashboard
- `verify.html` - Paste badge, get instant analysis
- Visual risk assessment
- One-click verification (< 30 seconds)

---

## 📦 Files

### Core Extension:
- `manifest.json` - Chrome extension config (v2.0)
- `background.js` - Opens writer tab
- `content.js` - Web page monitoring + badge scanner
- `writer.html` - Main text editor interface
- `writer.js` - Editor logic + badge minting

### Security Layer:
- `crypto-utils.js` - ECDSA signatures, key management
- `passport-utils.js` - Activity tracking, bot detection
- `auth-utils.js` - Firebase authentication & cloud sync

### Teacher Tools:
- `verify.html` - Badge verification dashboard

### Documentation:
- `README.md` - This file
- `IMPROVEMENTS.md` - Enhancement strategy
- `LICENSE` - Copyright and license terms

---

## 🚀 Quick Start

### For Students:
1. Install extension (load unpacked in Chrome)
2. Click extension icon → Opens Jitter Writer
3. (Optional) Login to sync passport across devices
4. Write your essay
5. Click "MINT BADGE"
6. Copy badge and paste in your submission

### For Teachers:
1. Open `verify.html` in browser
2. Paste student's badge
3. Click "VERIFY BADGE"
4. Review risk score (accept/review/reject)

---

## 🤖 Why Bots Can't Win

**Economic Friction:**
- Bot must have aged account (3+ months waiting)
- Bot must mimic human patterns (expensive R&D)
- Bot must maintain passport history (infrastructure cost)
- Bot essay cost: $50+ (vs $15 now)

**Student's decision:** "Homework is cheaper than cheating" ✅

---

## 🔒 Security Model

### Protected:
- ✅ Badge forgery (ECDSA signatures)
- ✅ Fake passport claims (time-based verification)
- ✅ Account transfer (key-bound identity)
- ✅ Volume fraud (statistical detection)

### Trade-offs:
- ❌ Student manually typing AI text (mitigation: in-class writing)
- ❌ Hiring human typist (but now costs $50+)

**Goal:** Economic friction, not perfection

---

## 📊 Badge Structure (v2.0)

Badges now include:
- Session metrics (integrity, cognitive ratio, entropy)
- Passport profile (lifetime stats, account age, suspicion score)
- Cryptographic signature (ECDSA P-256)
- Chain hash (links to previous badge)
- Public key fingerprint

---

## ☁️ Cloud Sync Setup (Optional)

To enable cloud sync across devices:

1. Create a Firebase project at https://firebase.google.com
2. Enable Authentication (Email/Password)
3. Enable Firestore Database
4. Update `auth-utils.js` lines 12-18 with your Firebase config
5. Deploy and students can login to sync their passports

**Privacy:** Only passport metadata is synced, never essay content.

---

## 📈 Success Metrics

**Detection:**
- 95% bot detection rate
- <5% false positive rate

**Economics:**
- Make bot essays cost >$50
- Make setup time >90 days

**Adoption:**
- 10 schools by Month 3
- 500 students by Month 6

---

## ⚖️ Ethics & Privacy

**We collect:** Keystroke timing, session statistics (locally)
**We DON'T collect:** Essay content, personal info
**100% client-side** - No server uploads (unless user opts into cloud sync)

Cloud sync (optional):
- User controls when to enable
- Can delete cloud data anytime
- Only syncs passport metadata

---

## 💡 Philosophy

> "We don't detect AI. We verify the human writing process."

When cheating becomes harder than learning, education wins.

---

## 🛡️ Intellectual Property

This software contains proprietary algorithms and trade secrets:
- **Loki Biometric Analysis System™**
- Keystroke dynamics and cognitive ratio algorithms
- Passport accumulation and bot detection methodologies
- Cryptographic chain-of-custody verification

**Patent Pending:** Methods and systems for keystroke biometric verification and bot detection.

---

## 📞 Contact & Licensing

**For licensing inquiries, commercial use, or partnerships:**

Contact: Denis Gingras
Repository: https://github.com/Denisgingras75/JITTEr

**Educational institutions:** Contact for volume licensing
**Commercial use:** Requires separate license agreement
**Journalists/Press:** Permission required for coverage

---

## ⚠️ Legal Notice

This software is protected by copyright law and international treaties. Unauthorized reproduction, distribution, reverse engineering, or commercial use may result in severe civil and criminal penalties, and will be prosecuted to the maximum extent possible under the law.

---

Built with ⚡ by humans, for humans.

**© 2025-2026 Denis Gingras. All Rights Reserved.**
