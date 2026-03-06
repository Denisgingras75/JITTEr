# ⚡ JITTEr - Human Authorship Verification

**J**itter **I**ntegrity **T**racking & **T**yping **E**ntropy **R**ecognition

A Chrome extension that verifies human authorship through keystroke biometrics, making bot-generated content economically unfeasible.

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

### 4. Activity Pattern Analysis
- Daily keystroke statistics (last 90 days)
- Hourly writing patterns (detects 24/7 bot farms)
- Session length distribution
- Variance analysis (humans are inconsistent, bots aren't)

### 5. Automated Bot Detection
- Suspicion score (0-100)
- Statistical thresholds for bot farms
- Risk levels: LOW / MEDIUM / HIGH

### 6. Teacher Verification Dashboard
- `verify.html` - Paste badge, get instant analysis
- Visual risk assessment
- One-click verification (< 30 seconds)

---

## 📦 Files

### Core Extension:
- `manifest.json` - Chrome extension config
- `background.js` - Opens writer tab
- `content.js` - Web page monitoring + badge scanner
- `writer.html` - Main text editor interface
- `writer.js` - Editor logic + badge minting

### Security Layer:
- `crypto-utils.js` - ECDSA signatures, key management
- `passport-utils.js` - Activity tracking, bot detection

### Teacher Tools:
- `verify.html` - Badge verification dashboard

### Documentation:
- `README.md` - This file
- `IMPROVEMENTS.md` - Enhancement strategy

---

## 🚀 Quick Start

### For Students:
1. Install extension (load unpacked in Chrome)
2. Click extension icon → Opens Jitter Writer
3. Write your essay
4. Click "MINT BADGE"
5. Copy badge and paste in your submission

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
**100% client-side** - No server uploads

---

## 💡 Philosophy

> "We don't detect AI. We verify the human writing process."

When cheating becomes harder than learning, education wins.

---

Built with ⚡ by humans, for humans.