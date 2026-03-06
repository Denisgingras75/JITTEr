# JITTEr - Prove Your Writing is Human

**Version 3.0 - Journalist MVP**

## What is this?

A Chrome extension that lets journalists and writers prove their work is human-written, not AI-generated.

**How it works:**
1. Install extension
2. Write anywhere (Medium, Google Docs, Substack, Gmail, etc.)
3. Extension tracks your typing invisibly (timing patterns, not content)
4. Click "Sign This Article" when done
5. Paste badge into your article
6. Anyone can verify it's human-written

**Zero workflow change.** Write where you always write. JITTEr just adds a signature.

---

## MVP Status (Week 1)

**✅ DONE:**
- Content script that tracks across ALL sites
- Loki biometric analysis (cognitive ratio algorithm)
- Passport system (levels, stats, accumulation)
- Badge generation with crypto signatures
- Popup UI with session stats
- Verification page (basic)
- Privacy-first (no content tracking, only timing)

**🚧 TODO (Week 2):**
- Test on Medium, Substack, Google Docs
- Fix message passing between content/background/popup
- Improve badge embed code
- Add verification API (currently static)
- Polish UI
- Find 20 journalists to test

---

## Quick Start (Developer)

### Install Locally

1. Clone repo:
```bash
git clone <repo>
cd JITTEr
```

2. Load extension in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `JITTEr` folder

3. Test it:
   - Go to Medium.com or Google Docs
   - Start typing
   - Click extension icon
   - Should show "🟢 Tracking" when typing

### File Structure

```
JITTEr/
├── manifest.json              # Chrome extension config
├── background.js              # Service worker (crypto, passport)
├── content.js                 # Injected tracker (all pages)
├── popup.html/js/css          # Extension popup UI
├── verify.html                # Verification page
├── utils/
│   └── biometrics.js          # Loki algorithm
├── old-code/                  # Archived school-focused code
└── docs/
    ├── README_JOURNALIST.md   # This file
    └── JOURNALIST_ARCHITECTURE.md  # Full technical spec
```

---

## How It Works (Technical)

### 1. Content Script Tracks Typing

When you type in ANY text editor (Medium, Docs, textarea, contentEditable):

```javascript
// Tracks timing, NOT content
{
  keystrokes: 5234,
  backspaces: 687,
  pasteEvents: 2,
  cognitiveRatio: 2.1,  // Pause ratio (humans = 2-3, bots < 1.5)
  entropy: 87           // Variance score (humans = 70-100, bots < 20)
}
```

### 2. Loki Algorithm Detects Bots

Measures "cognitive rhythm":
- **Flow speed:** Typing within words
- **Gap speed:** Pausing after punctuation (thinking)
- **Cognitive Ratio:** Gap / Flow

Humans pause to think (ratio > 2.0)
Bots type at constant speed (ratio < 1.2)

### 3. Badge Generation

Creates signed proof:

```json
{
  "title": "My Article",
  "session": {
    "keystrokes": 5234,
    "duration": 11520,
    "cognitiveRatio": 2.1
  },
  "passport": {
    "level": "Expert",
    "totalKeystrokes": 2100000,
    "accountAge": 234
  },
  "signature": "ECDSA_signature_here",
  "contentHash": "SHA256_of_article"
}
```

### 4. Verification

Anyone can verify:
- Content hash matches (article wasn't changed)
- Signature is valid (crypto proof)
- Session data looks human (cognitive ratio check)
- Passport is credible (account age, history)

---

## Privacy

**What we track:**
- ✅ Keystroke timing patterns
- ✅ Session duration
- ✅ Cognitive metrics
- ✅ Final content hash (for verification)

**What we DON'T track:**
- ❌ Actual text/content (not keylogged)
- ❌ Screen recording
- ❌ Webcam/audio
- ❌ Browsing history
- ❌ Personal data

**All local-first.** No cloud account needed for MVP. Data stays on your device.

---

## Testing Checklist

Before sending to journalists:

- [ ] Works on Medium.com
- [ ] Works on Google Docs
- [ ] Works on Substack
- [ ] Works on Gmail
- [ ] Badge copies to clipboard
- [ ] Badge pastes correctly in Medium
- [ ] Verification page loads
- [ ] Passport stats update
- [ ] Crypto signatures work
- [ ] No crashes/errors

---

## Next Steps

### This Week:
1. Test on real sites (Medium, Docs, Substack)
2. Fix bugs
3. Polish UI
4. Write user-friendly copy

### Next Week:
1. Find 20 journalists (Substack writers, tech journalists)
2. Email with demo link
3. Get feedback
4. Iterate

### Week 3 Decision:
- **If 3+ say "I'd pay for this"** → Build payment, scale
- **If 0 care** → Pivot to school market (Blue Book code already exists)

---

## Comparison: Old vs New

### Old Code (School-focused):
- ❌ Built for exams, not journalists
- ❌ Lockdown mode (overkill)
- ❌ Teacher dashboards
- ❌ Standalone editor (friction)
- ⚠️ Works, but wrong use case

### New Code (Journalist-focused):
- ✅ Tracks EVERYWHERE (Medium, Docs, etc.)
- ✅ Zero workflow change
- ✅ Simple "Sign This Article" UX
- ✅ 10x simpler scope
- ✅ Faster to market

**Old code archived in `/old-code/`** - can salvage later for school pivot if needed.

---

## Why This Might Work

**Timing:** AI crisis accelerating
**Pain Point:** Journalists accused of using ChatGPT
**Solution:** Cryptographic proof of human authorship
**Novel:** Nobody doing "C2PA for text"
**Low Friction:** Zero workflow change

**Risk:** Nobody might care. That's what we're testing.

---

## Contact

Questions? Open an issue or email.

**License:** Proprietary - See LICENSE file

---

**Built in 1 week. Tested in 1 week. Validated or pivoted in week 3.**

**Let's ship it and see if anyone gives a shit. 🚀**
