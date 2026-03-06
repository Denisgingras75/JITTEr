# ⚡ JITTER FOUNDATIONS
### The Locked Box of Human Proof

**Version:** 1.0
**Author:** Denis Gingras
**Copyright © 2025-2026 Denis Gingras. All Rights Reserved.**

---

## 1. What Jitter Actually Is

Jitter is a **metadata-only typing statistics engine** — a locked box.

Whatever happens inside the box, only numbers come out. No content. No keystrokes stored. No essay text. No personal data. Just small, anonymous stats about the *act* of typing:

```
backspaces: 47
paste_events: 1
pasted_chars: 312
typed_chars: 891
avg_flow_interval: 142ms
avg_gap_interval: 381ms
cognitive_ratio: 2.68
rhythm_entropy: 74
session_duration: 847s
word_count: 203
```

That's it. The content lives outside the box. Jitter never sees it.

---

## 2. The Sports Stats Paradigm

> **Jitter is batting averages, not surveillance.**

A baseball scout doesn't watch every at-bat with a camera — they track numbers over time. Batting average, on-base percentage, strikeout rate. Those numbers tell you who the player actually is, independent of any single game.

Jitter works the same way:

| Baseball Stat | Jitter Stat | What It Reveals |
|---|---|---|
| Batting average | `avg_cognitive_ratio` | Natural thinking rhythm |
| Games played | `sessions_completed` | Consistent usage over time |
| At-bats per game | `avg_session_keys` | Realistic output per sitting |
| Night games | `hourly_pattern[2-6]` | Sleep-like gaps (bots don't sleep) |
| Career stats | `total_keystrokes` | Time-locked passport |
| Strikeout rate | `rhythm_entropy` | How "noisy" (human) the typing is |

**A real student's season stats look like this:**
```
Sept 1 → Dec 15 (107 days)
  Day 1:   0 keys (installed, curious)
  Week 1:  2.3K keys (first assignment)
  Month 1: 15K keys (essays, notes)
  Month 2: 18K keys (midterms)
  Month 3: 22K keys (finals crunch)
  ─────────────────────────────────
  Total:   57K keys / 107 days
  Avg:     533 keys/day
  Variance: HIGH (humans are inconsistent)
  Night activity: 18% (stays up sometimes)
```

**A bot farm's "season" looks like this:**
```
Day 1 only (created to cheat)
  Total:   500 keys / 1 day
  Avg:     500 keys/day
  Variance: N/A (1 day of data)
  Night activity: N/A
```

**There is no faking 107 days.** The time dimension is the unbreakable wall.

---

## 3. Why Jitter Is an Easy Flag at Scale

Even if a sophisticated bot perfectly mimics human typing rhythm in a **single session**, maintaining a believable profile over time is economically catastrophic:

### The Math

To look like a real human reviewer:
- Must type ~300-500 keys/day average (not superhuman)
- Must show natural daily variance (some days 0, some days 800)
- Must show realistic sleep patterns (no 3am activity)
- Must accumulate 30+ days before submitting anything suspicious

**Maximum output for a "believable" fake profile:**
```
~400 keys avg × 30 days = 12,000 keys "banked" before first review
1 review ≈ 200 typed chars
Reviews per day without looking bot-like: ~10-30 MAX
```

### The Economics Break Down

| Attack Type | Reviews/Day/Profile | Profiles Needed (1K reviews) | Cost |
|---|---|---|---|
| Raw bot (no Jitter) | 1,000+ | 1 | $15 |
| Bot mimicking Jitter | 10-30 | 33-100 | $500+ |
| Bot with aged accounts | 10-30 | 33-100 + 90-day wait | Infeasible |
| Human typist | 20-40 | 25-50 | $2,000+ |

**Jitter doesn't have to be unbreakable. It just has to make cheating more expensive than being honest.**

---

## 4. Two Modes of Jitter

### Mode A: Profile Verification (Sports Stats Over Time)

A Jitter **Passport** accumulates across every session ever typed in the extension. It's the career stat sheet.

```javascript
passport = {
    totalKeystrokes: 57423,        // Career keys
    level: "Advanced",             // Novice → Master
    firstUsed: 1727740800000,      // Sept 1 (can't be faked backward)
    accountAgeDays: 107,           // Time is immutable
    sessionsCompleted: 34,
    avgSessionKeys: 1689,
    avgDailyKeys: 537,
    dailyVariance: 0.74,           // HIGH = human ✅
    hourlyPattern: [...],          // Sleep visible
    suspicionScore: 8,             // 0-100 (LOW ✅)
    suspicionSignals: []
}
```

A teacher verifying an essay sees the **career stats**, not just the session. Even if this session looks clean, a 1-day-old account with 500 keys fails immediately.

### Mode B: Single Session Verification (The Snapshot)

For individual reviews, forum posts, or short assignments — when there's no passport context — Jitter provides a **session snapshot**:

```javascript
session_badge = {
    typed_chars: 891,
    pasted_chars: 0,               // 0 = no paste ✅
    backspaces: 47,                // Edits = human thinking ✅
    cognitive_ratio: 2.68,         // Pauses after punctuation ✅
    rhythm_entropy: 74,            // Noisy = human ✅
    session_duration_sec: 847,     // ~14 min for ~200 words = realistic ✅
    bot_detected: false
}
```

This is useful even without a passport. A review typed in 8 seconds with 0 backspaces and 0 cognitive ratio is flagged, passport or not.

---

## 5. The Locked Box Principle

**Jitter collects:**
- Keystroke timing intervals (numbers, not the keys themselves)
- Backspace count
- Paste event count + character count of each paste
- Session duration
- Word count
- Hour of day (for sleep pattern tracking — never the date/time itself)

**Jitter never collects:**
- What was typed (the actual text)
- Which keys were pressed
- Any content, personal info, or identifying data
- Screenshots or DOM access

**This is the pitch to schools, parents, and privacy advocates:**
> "Jitter knows you spent 47 minutes typing something with normal rhythm. It has no idea what you wrote."

---

## 6. WGH Integration — Real People Reviews, AI-Translated

### The Problem
Google and Yelp have millions of real human reviews. WGH needs 1-10 numerical ratings. These two things don't speak the same language.

### The Solution: AI Translation Layer

Take real human-written reviews from Google/Yelp and translate their qualitative language into WGH's Bite Slider (1-10) using NLP sentiment + context analysis:

```
Google review: "The lobster roll was incredible —
                fresh, generous, perfectly buttered.
                Best one on the island."
→ NLP analysis: superlative positive, food-specific praise
→ Translated rating: 9.2 / 10
→ Tag: [★ Real Review · Google · AI-Scored]
```

```
Google review: "Decent enough but nothing special.
                The fries were soggy."
→ NLP analysis: neutral with specific negative
→ Translated rating: 5.8 / 10
→ Tag: [★ Real Review · Google · AI-Scored]
```

### Tagging System

Every dish rating on WGH has a source tag:

| Tag | Meaning |
|---|---|
| `Human · Jitter Verified` | Typed in WGH with Jitter session badge |
| `Human · Passport Verified` | Passport-holding account, strong history |
| `Real Review · Google · AI-Scored` | Imported from Google, NLP-translated |
| `Real Review · Yelp · AI-Scored` | Imported from Yelp, NLP-translated |
| `Unverified` | Submitted without Jitter (counts less) |

### The Score Blending Formula

```
dish.rating = weighted average:
    - Jitter-verified human reviews:    weight 1.0
    - Passport-verified (no badge):     weight 0.8
    - AI-translated real reviews:       weight 0.6
    - Unverified reviews:               weight 0.3
```

This rewards verified humans without completely discarding real imported reviews.

---

## 7. The Writing Ledger — Git for Documents

> **"It's not a lock. It's a camera that records what happened in the box."**
> — Denis Gingras, February 2026

The Writing Ledger is NOT about blocking anything. It's about recording everything in an append-only, tamper-evident chain. A teacher doesn't get a number — they get a rewind button.

### The Core Concept

Every document has a history: a sequence of operations that took it from blank to finished. Normally that history is invisible. The Writing Ledger makes it permanent, portable, and cryptographically sealed.

Every operation is recorded in a timeline:
```
{ t: 0,    op: 'start' }
{ t: 142,  op: 'key',   char: 'T' }
{ t: 287,  op: 'key',   char: 'h' }
{ t: 3847, op: 'paste', text: '800 chars of text', len: 800 }
{ t: 4102, op: 'delete' }
{ t: 38000, op: 'blur',  duration: 31000 }   ← left window for 31 seconds
{ t: 69000, op: 'pause', duration: 4200 }    ← sat and thought
```

Every 10 operations, a **checkpoint** is taken — a snapshot of the full document content — and hashed against the previous checkpoint. This creates a hash chain:

```
checkpoint_0: { content: '',         hash: sha256('genesis' + '' + t) }
checkpoint_1: { content: 'The ...',  hash: sha256(prev_hash + content + t) }
checkpoint_N: { content: 'full essay', hash: '...' }  ← ledger hash goes in badge
```

**You cannot remove block 47 (the paste event) without breaking every subsequent hash.** The chain is the proof.

### The Replay

A teacher opens `verify.html`, loads the ledger file, and presses play. They see:

- A document that starts empty
- Characters appearing at natural typing speed
- **A flash of highlighted text** when a paste event fires — 800 chars appearing in one frame
- A greyed-out overlay when the window was unfocused: "⚠️ Window left for 31s"
- The full scrub bar — drag to any moment in time

This is not an accusation. It's evidence. A student who wrote their own essay has nothing to fear from a rewind. A student who pasted GPT output at second 12 has a very visible problem.

### What This Catches (and Doesn't Try to)

```
Scenario A: Student pastes GPT text
→ CAPTURED: paste op recorded, content jumps 800 chars in one frame
  Teacher rewinds, sees the moment. Conversation happens.

Scenario B: Student reads from phone, types it word by word
→ PARTIALLY CAPTURED: cognitive ratio low, low backspaces
  Also: teacher asks "walk me through paragraph 3" — they either can or can't.
  At minimum: they read it. That's actually engagement.

Scenario C: Student uses a typing script
→ CAUGHT: rhythm too clean (Loki), OR passport flags over time

Scenario D: Student wrote it themselves
→ CLEAN: scrub the whole timeline. Writing grew organically from nothing.
  Natural pauses, edits, false starts, restarts. Human pattern.
```

### Why Not Block Paste?

Blocking is a war you lose. Students find workarounds. Instead:

**Don't block. Record. The record is indelible.**

A paste you recorded is more damning than a paste you blocked — because the student still submitted the work, and the evidence exists.

### The Privacy Boundary

The Writing Ledger only lives in `writer.html` (the explicit essay writer). The student chose to open it for an assignment. The content IS the submission — storing it for replay is appropriate and expected, same as turning in a paper.

`content.js` (the passive content script on all websites) **never** records content. Ever. That's the locked box. The two modes are distinct by design.

The ledger file is stored locally. It goes nowhere until the student exports and submits it. No server ever sees it unless the student hands it to the teacher.

### The Blockchain Comparison

This is accurate. It's an append-only ledger where each block references the previous one. The ledger hash in the badge is the root of the chain. A teacher with the replay file can verify the chain hash matches the badge — confirming the replay hasn't been edited after export.

You can't retroactively remove a paste event. You can't smooth out the edit history. The ledger is what happened.

### What This Catches in the Broader Picture

For schools: process proof without surveillance. No webcam. No proctoring service. No privacy lawsuits. Just a replayable writing session.

For journalists: "Here is the ledger of how I reported this story." Every draft, every edit, the research-to-writing timeline. Proof of original reporting.

For influencers / creators: "I wrote this review in the writer. Here's the ledger." Authenticity you can show, not just claim.

### Scenarios This Doesn't Try to Stop

If a student reads AI content from their phone and manually types every word — honestly, that's a lot of work. They probably engaged with the content. Jitter's job is not to prevent all learning shortcuts. It's to prevent **effortless, zero-engagement cheating**. The ledger handles the effortless case perfectly.

---

## 8. What Makes Jitter Different

| Tool | Approach | Problem |
|---|---|---|
| GPTZero | Detects AI-written text | High false positives; accuses good writers |
| Turnitin AI | Content fingerprinting | Content can be rephrased to evade |
| Proctoring cams | Video surveillance | Invasive, hated, privacy nightmare |
| **Jitter** | Verifies the human writing *process* | Can't accuse content — only measures effort |

**Core philosophy:**
> "We don't detect AI. We verify the human writing process."

Jitter never says "this essay was written by AI." It only says "this account has 107 days of consistent human typing history" or "this session shows bot-like rhythm."

One is a content accusation. The other is a process measurement. The difference matters legally and ethically.

---

## 9. Jitter Badge v2.0 Structure

Every minted badge is a compact, portable proof object:

```json
{
  "version": "2.0",
  "timestamp": 1740000000000,
  "session": {
    "typed_chars": 891,
    "pasted_chars": 0,
    "backspaces": 47,
    "cognitive_ratio": 2.68,
    "entropy": 74,
    "duration_sec": 847,
    "bot_detected": false
  },
  "passport": {
    "total_keystrokes": 57423,
    "level": "Advanced",
    "account_age_days": 107,
    "sessions_completed": 34,
    "avg_daily_keys": 537,
    "daily_variance": 0.74,
    "suspicion_score": 8,
    "suspicion_signals": []
  },
  "crypto": {
    "signature": "MEYCIQDx...",
    "public_key_fingerprint": "a3f9e2...",
    "previous_badge_hash": "7b2c1d..."
  }
}
```

Encoded as Base64, signed with ECDSA P-256. Forgery requires breaking P-256. Chain hash means you can't fabricate a history — each badge references the one before it.

---

## 10. The B2B Platform Play — JITTEr as a Protocol

> **This is the real business model.**

JITTEr is not just a Chrome extension. The extension is the seed — it grows the passport network. The business is selling verification to platforms that need to know their users are human.

Think HTTPS. Nobody pays for HTTPS directly. But every website in the world runs it. The infrastructure became the standard. JITTEr's goal is to become the HTTPS of human verification — invisible, universal, trusted.

---

### The Two-Layer Architecture

```
Layer 1: Extension (Consumer)
  ├── Free Chrome extension, users install it once
  ├── Grows the passport network passively
  ├── Builds lifetime typing history that becomes credentials
  └── Every user becomes a walking proof of humanness

Layer 2: SDK/API (B2B Revenue)
  ├── Platforms embed the JITTEr JS widget in their review/comment forms
  ├── Widget captures session data and mints a badge
  ├── Platform server calls JITTEr API to verify the badge
  └── Platform shows "Jitter Verified" on verified content
```

The extension and the SDK share the same passport. A user who installs the extension for school work is also building credentials that Yelp or Reddit can verify. The network becomes valuable to both sides simultaneously.

---

### Target Platforms

| Platform Type | Example | The Problem They Have | What JITTEr Sells Them |
|---|---|---|---|
| Review sites | Yelp, Trustpilot, Google Maps | Fake reviews, paid reviews | Session badge + passport score per review |
| Social platforms | Reddit, Hacker News | Bot brigading, astroturfing | Human verification on posts/upvotes |
| Journalism | Substack, local news | Fake comments, harassment bots | "Verified Human Commenter" badge |
| EdTech | Canvas, Google Classroom | AI-written essays | Writing Ledger integration |
| Creator platforms | Patreon, Medium | Engagement farming by bots | Verified fan/reader credentials |
| DAOs / Web3 | Voting systems | Sybil attacks (1 person = 1000 votes) | Passport as proof of unique human |

---

### The SDK (What Platforms Actually Buy)

```html
<!-- Platform drops this in their review form -->
<script src="https://cdn.jitter.so/widget.js"></script>
<jitter-widget
  api-key="pk_live_xxxx"
  on-badge="handleBadge"
  require-passport-days="30"
/>
```

```javascript
// Platform server verifies badge (never trust client)
const result = await fetch('https://api.jitter.so/v1/verify', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sk_live_xxxx' },
  body: JSON.stringify({ badge: badgeFromClient })
});

const { valid, passportDays, suspicionScore, level } = await result.json();
// valid: true/false
// passportDays: 107 (how long this account has existed)
// suspicionScore: 8 (0-100, lower is better)
// level: "Advanced"
```

The platform decides what to do with that data — show a badge, weight the content higher, flag for review. JITTEr just provides the signal.

---

### Pricing Model

| Tier | Who | What | Price |
|---|---|---|---|
| Free | Individuals, small sites | 1,000 verifications/month | $0 |
| Starter | Small platforms | 50K verifications/month | ~$99/mo |
| Business | Mid-size platforms | 500K verifications/month | ~$499/mo |
| Enterprise | Yelp, Reddit-scale | Custom, SLA, support | Custom |

School essay mode is a separate SKU:
- Free for individual teachers (5 students)
- Per-seat pricing for institutions (~$8/student/year)

---

### Why This Works Without Big Money

The Chrome extension:
- Costs $5 to publish
- Self-distributes via word of mouth
- Each install grows the passport network for free

The API infrastructure:
- Vercel or Railway for the verification endpoint (~$20/month at early scale)
- Firebase for passport sync (already in codebase, free tier covers early users)
- No ML infrastructure needed — it's just math on metadata

First 1,000 users can be acquired through:
1. Schools and teachers (direct outreach, teachers talk to each other)
2. WGH integration (every WGH reviewer builds a passport)
3. ProductHunt / HN launch (the concept is novel enough to earn organic attention)

First paying customer: one school district, one journalism org, or one review site doing a pilot.

---

### The Network Effect

```
More users install extension
    → Passport network grows
    → Passports become more valuable (longer history, more credible)
    → More platforms want to verify against the network
    → More platforms embed the SDK
    → More reasons to install the extension
    → Loop
```

This is the same flywheel that made credit scores powerful. One bureau, all lenders check it, all consumers need a score. JITTEr is building the typing credit bureau.

---

### The "Jitter Verified" Trust Mark

Ultimately, the goal is for "Jitter Verified" to mean something. Like:

- ✅ **Verified Human** (passport ≥ 30 days, suspicion < 30)
- 🔷 **Established Human** (passport ≥ 90 days, suspicion < 20)
- ⭐ **Trusted Contributor** (passport ≥ 180 days, suspicion < 10, level Advanced+)

Users display this on profiles. Platforms show it on content. The badge becomes a reputation signal that travels across the internet — not tied to one platform, not controlled by any one company except JITTEr.

That's the endgame: a portable human credential that works everywhere.

---

## 11. Roadmap

### Phase 1 — Jitter Core (Done ✅)
- Loki biometric analysis (cognitive ratio, rhythm entropy)
- Passport accumulation + level system
- ECDSA badge signing + chain verification
- Activity pattern tracking + suspicion score
- Teacher verify dashboard
- Firebase cloud sync (optional)

### Phase 2 — Writing Ledger (Done ✅)
- Append-only hash-chained operation timeline
- Checkpoint snapshots every 10 ops
- Teacher replay: rewind to any moment, paste events highlighted
- Ledger hash embedded in badge
- Export/submit flow

### Phase 3 — B2B SDK (Build Next)
- [ ] JITTEr verification API endpoint (badge verify, passport score)
- [ ] JS widget for embedding in third-party forms
- [ ] Platform dashboard (API key management, usage stats, verified content feed)
- [ ] Pricing tiers + Stripe integration
- [ ] School essay mode SKU (teacher dashboard, session review)

### Phase 4 — WGH Integration
- [ ] NLP translation layer for Google/Yelp reviews → 1-10 scores
- [ ] Review source tagging system
- [ ] Weighted rating formula by source trust level
- [ ] Jitter session badge on WGH review submission
- [ ] Profile trust score visible on public profiles

### Phase 5 — Passport Network
- [ ] Public profile pages showing passport stats (no content, just numbers)
- [ ] "Jitter Verified Human" trust mark tiers
- [ ] Cross-platform passport (WGH + essay mode share same passport)
- [ ] Anomaly alerts ("this account submitted 28 reviews today")
- [ ] DAO/Web3 Sybil resistance (one human = one vote)

---

## 12. The One-Line Summary

> Jitter is sports statistics for human typing —
> just metadata, just numbers, immutable over time,
> and economically impossible to fake at scale.

---

*Built with ⚡ by humans, for humans.*
*© 2025-2026 Denis Gingras. All Rights Reserved.*
