# JITTEr Full Audit & Brainstorm
**Date:** 2026-02-23

---

## What JITTEr Actually Is Right Now

**~500 lines of real logic** wrapped in ~3,000 lines of scaffolding.

### Working:
- Keystroke biometrics engine ("Loki") — measures flow vs gap timing, cognitive ratio, entropy
- Passport system — career-level typing history, suspicion scoring
- ECDSA cryptographic signing — badges get signed with browser-born keys
- Activity pattern tracking — daily/hourly keystroke stats

### Broken/Half-baked:
- `verify.html` **never actually checks the cryptographic signature** — anyone can forge a badge in 2 lines of JS. The entire trust model collapses here.
- Firebase cloud sync has placeholder API keys (`"YOUR_API_KEY_HERE"`)
- Three incompatible badge formats exist simultaneously
- Suspicion score is calculated but never included in the badge payload
- No tests. Zero.

### Not started:
- Server-side verification API
- Third-party widget/embed system
- Any B2B platform infrastructure

---

## Code Breakdown

| Category | Lines | Status |
|---|---|---|
| **Pure business logic** (biometrics, suspicion, crypto, ledger) | ~500 | Real & working |
| **UI/HTML/CSS/event handlers** | ~1,500 | Scaffolding |
| **Firebase/cloud sync** (`auth-utils.js`) | ~500 | Broken/placeholder |
| **Config/manifest/background** | ~60 | Minimal |
| **Documentation** | ~1,000+ | Solid |

### Core Business Logic Files:
- `writer.js` (644 lines) — Keystroke tracking, Loki biometrics, ledger, badge export
- `content.js` (404 lines) — Web monitoring, typing detection, project tracking
- `passport-utils.js` (229 lines) — Activity patterns, suspicion scoring
- `crypto-utils.js` (211 lines) — ECDSA signing/verification, chain hashing

### UI/Presentation:
- `writer.html` (459 lines) — Editor interface
- `verify.html` (526 lines) — Teacher dashboard

### Dead Weight:
- `auth-utils.js` (500 lines) — Cloud sync with placeholder Firebase config

---

## Critical Issues Blocking Production

### SHOWSTOPPER: verify.html doesn't actually verify
- Decodes Base64 badge
- Reads JSON
- **Never calls `verifyBadge()` to check ECDSA signature**
- Any user can forge a perfect badge in 2 lines of JavaScript
- Teachers see "Badge Verified" for forged badges

### High Priority:
1. `suspicionScore` never included in badge payloads — risk assessment always shows 0
2. Three incompatible badge formats exist simultaneously (never unified)
3. `mergePassports()` is lossy (drops activity stats from one device during sync)
4. `bio` state never resets between sessions (stale biometric data)
5. Firebase config is placeholder (cloud sync completely broken)
6. Paste character count not tracked in content.js (only paste events)
7. Integrity calculation misleading for paste-heavy documents

### Medium Priority:
1. writer.html essay mode is incomplete (no fullscreen, no paste blocking, no blur detection)
2. Public key fingerprint not canonical (JSON.stringify property order)
3. console.log statements in production code

---

## Use Cases: Journalists, Influencers, Reviewers

**Right now? No use case exists for them.** But the potential is massive — and possibly a bigger market than education.

| Audience | The Problem | What JITTEr Could Prove |
|---|---|---|
| **Journalists** | "Did you actually write this or did ChatGPT?" Trust in bylines is collapsing | "I typed 4,200 words over 3 hours with human rhythm patterns" |
| **Influencers** | Sponsored posts feel fake. Brands want authentic content proof | "This review was hand-typed, not generated. Here's the biometric receipt" |
| **Product reviewers** | Amazon/Yelp reviews are 40%+ fake. Nobody trusts reviews anymore | "Verified human-written review" badge next to the review |
| **Substack/Medium writers** | Readers abandoning platforms flooded with AI slop | "JITTEr Verified" badge = trust signal = subscribers |

### Why the creator angle might be bigger than education:
- Creators **want** to prove they're human (it's a flex, not surveillance)
- It's opt-in (no privacy backlash like proctoring)
- It's a trust badge (like the blue checkmark, but for *writing authenticity*)

---

## VPN Comparison

**No VPN functionality at all.** Purely keystroke timing analytics. Doesn't touch the network, doesn't hide the screen, doesn't proxy anything. It's more like a **fitness tracker for typing** — watches *how* you type (timing between keys), never *what* you type.

### Privacy Design:
- Keystroke TIMING only (milliseconds between keystrokes), never the actual keys
- No content stored in the extension — essays live in the browser only
- No screenshots/DOM access for privacy
- No PII collected
- 100% client-side by default

---

## The Badge Vision: "The Blue Link"

### Option A: Inline Badge (like Twitter Blue Check)
```
Denis Gingras ✓ᴶᴵᵀᵀᴱʳ  wrote this review
```
Small verified mark next to the author name. Platforms would need to integrate.

### Option B: Embeddable HTML Widget
```html
<jitter-badge data-hash="a3f9e2..." data-score="87">
  ✍️ Human-written · 4,200 words · 3h session · Verified
</jitter-badge>
```
Clickable — expands to show the full biometric receipt. Any website can embed it.

### Option C: Link Badge (works anywhere, no integration needed)
```
[JITTEr Verified ✓](https://verify.jitter.so/badge/a3f9e2)
```
A hyperlink to a verification page. Works in tweets, Reddit posts, blog comments — anywhere you can paste a link. The "blue text."

**Option C is the move for v1.** No platform cooperation needed. Just a link.

---

## The Numbers Need to Mean Something

Right now the numbers are internally correct but externally meaningless. A teacher sees "Cognitive Ratio: 2.68" and thinks... nothing.

### What the numbers should become:

| Internal Metric | What Users Should See |
|---|---|
| Cognitive Ratio 2.68 | "Human thinking patterns detected" |
| Entropy 74 | "Writing Authenticity: 74/100" |
| Suspicion Score 8 | "Trust Level: High" |
| 4,200 typed / 0 pasted | "100% hand-typed" |
| 34 sessions over 107 days | "Established writer (3+ months active)" |

### One number to rule them all: JITTEr Score (0-100)
Combine entropy + suspicion + passport age + session stats into one clean score. That's what goes on the badge. That's what the blue link shows. That's what people understand.

---

## Core Data Structures (Reference)

### Passport Object
```javascript
{
  totalKeystrokes: number,          // Career total
  level: string,                    // "Novice" to "Master"
  firstUsed: timestamp,             // Account creation (immutable)
  lastUsed: timestamp,
  sessionsCompleted: number,
  dailyStats: {
    "2026-02-23": 523,              // Last 90 days
  },
  hourlyPattern: [0,0,0,...],       // 24 buckets
  sessionHistory: {
    lengths: [],                    // Keys per session
    timestamps: []
  },
  avgSessionLength: number,
  longestSession: number,
  sessionLengthVariance: number,    // Coefficient of variation
  avgDailyKeys: number,
  dailyVariance: number,
  suspicionScore: 0-100,
  suspicionSignals: []
}
```

### Bio (Biometrics) Object
```javascript
{
  lastTime: ms,
  lastChar: char,
  flowIntervals: [ms, ms, ...],    // Letter-to-letter (min 50 stored)
  gapIntervals: [ms, ms, ...],     // Punctuation-to-letter (min 20 stored)
  isBot: boolean,
  entropy: 0-100,                  // stdDev + (cognitiveRatio * 10)
  backspaces: number,
  cognitiveRatio: float,           // avgGap / avgFlow
  navigates: number                // Arrow key presses
}
```

### Key Computations

**Cognitive Ratio:**
```
CR = avgGapInterval / avgFlowInterval
Human: 2.5-3.0 (clear thinking pauses)
Bot: 1.0-1.2 (no thinking)
```

**Entropy Score:**
```
entropy = min(100, round(stdDev + (CR * 10)))
Combines micro-variance + cognitive signal
```

**Suspicion Score (0-100):**
```
Base: 0
+ 30 if avgDailyKeys > 5000          (superhuman)
+ 25 if variance < 0.3 && avgDaily > 500 (too consistent)
+ 25 if sessionsPerDay > 10          (too many assignments)
+ 15 if nightActivity > 40%          (no sleep)
+ 20 if accountAge < 7d && keys > 10K (aged account fail)
+ 15 if longestSession > 10K         (marathon)
```

---

## Strip Down & Rebuild Recommendation

### KEEP (the real value):
1. **Loki biometrics engine** — the flow/gap/cognitive ratio math is sound and novel
2. **Passport accumulation** — the "career typing history" concept is the moat
3. **Suspicion scoring algorithm** — the 6-signal detection system is clever
4. **ECDSA signing** — correct crypto approach

### STRIP:
1. **Firebase/auth-utils.js** — 500 lines of broken cloud sync. Kill it.
2. **writer.html** — the built-in editor is scope creep. The extension should work on *any* text field on *any* website.
3. **Three badge formats** — unify into one
4. **The "essay mode" concept** — it's a proctoring tool at that point, opposite of the creator-friendly vision

### BUILD BACK:
1. **Fix verify.html** — actually verify signatures (this is a 20-line fix that makes the whole thing real)
2. **One clean badge format** with a shareable verification URL
3. **The blue link** — `verify.jitter.so/badge/{hash}` that anyone can click
4. **A simple landing page** that explains what the badge means to non-technical people
5. **Unified JITTEr Score** — one number (0-100) that combines all signals

---

## Competitive Landscape

| Tool | Approach | Problem |
|---|---|---|
| **GPTZero** | Detects AI-written text | High false positives; accuses good writers |
| **Turnitin AI** | Content fingerprinting | Content can be rephrased to evade |
| **Proctoring cams** | Video surveillance | Invasive, hated, privacy nightmare |
| **JITTEr** | Verifies the human writing *process* | Can't accuse content — only measures effort |

---

## Honest Assessment

- The **idea** is 9/10 (novel, defensible, has real economic moat)
- The **implementation** is 4/10 (core logic works, but critical bugs + incomplete features)
- The **readiness** is 2/10 (not production-safe; cloud sync broken; verification doesn't verify)

**Recommendation:** Strip to core, fix the verify, build the shareable badge link, target creators first (not schools). The "prove you're human" market is about to explode and JITTEr is sitting on the right approach — process verification, not content detection.
