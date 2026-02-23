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

## 8. Who Needs This and Why

> **Jitter isn't just for teachers catching cheaters. It's for anyone who needs to prove they're real.**

The AI content crisis affects everyone who writes for a living or writes to be trusted. Here are the audiences, their specific pain, and exactly how JITTEr solves it.

---

### A. Journalists — "I Wrote This. Here's Proof."

**The problem:** Public trust in journalism is at historic lows. Readers can't tell if a byline is a human reporter or an AI content mill. Newsrooms are already using AI to draft articles and not disclosing it. The journalists who *don't* use AI have no way to prove it.

**How JITTEr helps:**
- Reporter installs the extension. It runs silently while they write in Google Docs, WordPress, their CMS — any text field
- Every article gets a session badge: "4,200 words typed over 3 hours, 89 backspaces, cognitive ratio 2.7"
- The badge links to a verification page anyone can check
- Over months, the reporter builds a passport: "327 sessions, 14 months active, 890K career keystrokes"

**What the reader sees:**
```
Jane Martinez · Staff Reporter
⚡ JITTEr Verified · 14-month writing history · This article: 100% hand-typed
```

**Why it works for journalists specifically:**
- It's opt-in — reporters who care about credibility adopt it voluntarily
- It's a competitive advantage — "our newsroom is JITTEr-verified" is a trust signal
- It protects against false accusations — a reporter accused of using AI can show the ledger
- The writing ledger is their notebook — rewind to any point in the drafting process

**The bigger play:** News organizations can require JITTEr for freelance submissions. "Submit your article with a JITTEr badge or it goes to the bottom of the review queue." This alone could be a B2B vertical.

---

### B. Influencers & Content Creators — "This Review Is Real"

**The problem:** Brands pay influencers $500-$50K per sponsored post. They have no idea if the influencer actually wrote the review or outsourced it to an AI. Meanwhile, audiences are increasingly skeptical of sponsored content. The influencers who genuinely care about their products have no way to stand out from the ones running content through ChatGPT.

**How JITTEr helps:**
- Creator writes their review/caption/article with JITTEr running
- Badge shows: "612 words typed in 22 minutes, 34 edits, human rhythm confirmed"
- Creator shares the badge link alongside their post
- Their passport shows they've been a real writer for months — not a new account spinning up AI content

**What followers see:**
```
🔗 verify.jitter.so/badge/k9x2m1
⚡ Hand-typed · 22 min session · 3-month writing history
```

**Why influencers would actually use this:**
- It's a flex. "I actually wrote this" is the new authenticity signal
- Brands will prefer verified creators — reduces risk of paying for AI slop
- It differentiates them from the flood of AI-generated content
- It builds over time — a 12-month passport is a credibility moat that new AI accounts can't fake

**The brand angle:** Brands can require JITTEr badges for sponsored content campaigns. "Prove you typed the review yourself." This shifts the dynamic — creators who game it get caught, creators who are authentic get rewarded.

---

### C. Product Reviewers — "Verified Human Review"

**The problem:** 40%+ of online reviews are fake. Amazon, Yelp, Google Maps, TripAdvisor — all flooded with bot-generated and paid reviews. Consumers don't trust any of them anymore. The platforms spend millions on detection and still lose.

**How JITTEr helps:**
- Reviewer types their review on any platform with JITTEr running (extension or embedded widget)
- Badge proves: session biometrics + passport history
- Platform tags the review: "⚡ Verified Human Review" or "⚠ Unverified"
- Verified reviews rank higher, appear more prominently, carry more weight in aggregate scores

**What the consumer sees:**
```
★★★★☆  "The lobster roll was incredible — fresh, generous..."
⚡ Verified Human · 107-day account · Hand-typed review
```
vs.
```
★★★★★  "Amazing experience! Best food ever! Highly recommend!"
⚠ Unverified
```

**Why platforms would integrate this:**
- The cost of fake reviews is massive — lost consumer trust, regulatory pressure, advertiser complaints
- JITTEr doesn't require platforms to build their own detection — drop in a widget
- The trust signal is visible to consumers, which increases platform credibility
- Verified reviews can be weighted higher in recommendation algorithms

**The economics for review farms:**
- Without JITTEr: 1,000 fake reviews/day from 1 bot = $15
- With JITTEr: Need 33-100 aged accounts (90+ days each), limited to 10-30 reviews/day each = $500+ per 1,000 reviews
- **JITTEr doesn't eliminate fake reviews. It makes them 30x more expensive.**

---

### D. Newsletter & Blog Writers — "The Blue Checkmark for Writers"

**The problem:** Substack, Medium, Ghost, personal blogs — all being flooded with AI-generated content. Readers are unsubscribing because they can't tell who's real. Writers who spend hours crafting original work are competing against people who generate 10 posts/day with AI.

**How JITTEr helps:**
- Writer installs the extension. It monitors their writing tool (Substack editor, Ghost, Notion, wherever they write)
- Each published piece gets a verification link
- The link sits at the bottom of every post — small, unobtrusive, clickable

**What readers see at the bottom of a newsletter:**
```
— Denis
⚡ Verified: hand-typed · 47 min writing session · 8-month passport
   verify.jitter.so/badge/m4k8p2
```

**Why writers would adopt this:**
- It's the "blue checkmark" but for writing authenticity, not identity
- Readers who care about human writing will preferentially subscribe to verified writers
- It's free for the writer — the extension is free, the badge is free
- It compounds over time — a 2-year passport is a credibility signal that AI accounts can never match

---

### E. Academic Researchers — "Process Proof for Peer Review"

**The problem:** Academic fraud is rising. Papers generated by AI, ghost-written by mills, submitted to journals with fabricated data. Peer review can't keep up. Retraction rates are climbing.

**How JITTEr helps:**
- Researcher writes in their editor with JITTEr running
- Submission includes a JITTEr badge alongside the manuscript
- Reviewers see: "This paper was typed over 23 sessions across 4 months, 47K keystrokes, consistent human rhythm"
- The writing ledger shows the drafting process — not a single paste-dump, but organic construction

**Why journals would care:**
- Reduces reviewer burden — a verified badge means less suspicion, faster review
- Creates a paper trail — if fraud is alleged later, the ledger exists
- Doesn't require changing the submission process — just an additional metadata attachment

---

### The Common Thread

Every use case has the same shape:

```
1. Someone writes something
2. Someone else needs to trust it was human-written
3. JITTEr provides the cryptographic proof
4. The proof is portable, verifiable, and builds over time
```

Schools were the first use case because the pain is acute and the buyer is obvious. But the *market* is everyone who writes anything that matters.

---

## 9. The JITTEr Score — One Number That Means Something

Raw metrics are for engineers. Users need one number.

### The Problem with Raw Metrics

A teacher sees "Cognitive Ratio: 2.68" — means nothing. A reader sees "Entropy: 74" — means nothing. The metrics are internally correct but externally useless.

### The Solution: JITTEr Score (0-100)

One composite score that combines all signals into a single human-readable number:

```
JITTEr Score = weighted combination of:
  ├── Session Authenticity (40%)
  │   ├── Entropy score (rhythm variance + cognitive ratio)
  │   ├── Paste ratio (typed vs pasted characters)
  │   └── Bot detection (binary flag, hard override to 0 if bot)
  │
  ├── Passport Credibility (40%)
  │   ├── Account age (0-30 days = low, 30-90 = medium, 90+ = high)
  │   ├── Inverse suspicion score (100 - suspicionScore)
  │   ├── Session count (more sessions = more trust)
  │   └── Daily variance (higher variance = more human)
  │
  └── History Integrity (20%)
      ├── Chain hash valid (all previous badges intact)
      ├── Level progression (natural growth over time)
      └── Activity pattern consistency (no sudden spikes)
```

### What the Score Means to People

| Score | Label | Color | What It Tells You |
|---|---|---|---|
| 85-100 | **Trusted Human** | Green | Strong passport, natural writing, long history |
| 65-84 | **Likely Human** | Blue | Good session, moderate history |
| 40-64 | **Uncertain** | Yellow | New account, limited history, or some flags |
| 20-39 | **Suspicious** | Orange | Multiple red flags, investigate further |
| 0-19 | **Bot Pattern** | Red | Failed biometric checks, no credible history |

### How It Appears Everywhere

**On a badge link:**
```
⚡ JITTEr Score: 87 · Trusted Human
```

**On a review:**
```
★★★★☆  "The lobster roll was incredible..."
⚡ 87 · Hand-typed · 3-month writer
```

**On a newsletter:**
```
⚡ Verified 91 · verify.jitter.so/badge/m4k8p2
```

**On a teacher dashboard:**
```
Student: Sarah Chen
JITTEr Score: 82 · Likely Human
Session: 891 typed / 0 pasted · 14 min · CR 2.68
Passport: Advanced · 107 days · 34 sessions
```

One number. Everyone understands it. Like a credit score for writing authenticity.

---

## 10. The Blue Link — How Badges Travel the Internet

> **The badge has to go where the writing goes.**

### The Problem

A badge that only lives inside the Chrome extension is useless. The proof needs to travel with the content — to tweets, blog posts, review sites, emails, wherever the writing is published.

### The Solution: A Shareable Verification URL

Every minted badge gets a short URL:
```
verify.jitter.so/badge/a3f9e2
```

This link:
- Works anywhere you can paste text (tweets, bios, blog footers, email signatures)
- Opens a clean verification page showing the JITTEr Score + session details
- Is cryptographically tied to the badge — can't be reused for different content
- Looks like a blue hyperlink in any context (the "blue" you're thinking of)

### Three Levels of Badge Display

**Level 1: The Link (works everywhere, zero integration)**
```
Just finished my review of the new MacBook Pro.
⚡ verify.jitter.so/badge/a3f9e2
```
Paste it anywhere. Twitter, Reddit, email, comments. No platform cooperation needed.

**Level 2: The HTML Widget (for websites that embed it)**
```html
<jitter-badge hash="a3f9e2" score="87"></jitter-badge>
```
Renders as a small, clickable badge inline with the content:
```
⚡ 87 · Verified Human · Click to verify
```

**Level 3: The Platform Integration (for sites with the SDK)**
The platform reads the badge server-side and renders their own trust UI:
```
★★★★☆  Review by @denis  ⚡ JITTEr Verified
```
No user action needed — the verification is automatic and built into the platform.

### Why "The Blue Link" Is the V1 Move

- Works TODAY with zero infrastructure beyond a static verification page
- No platform cooperation required
- Users self-distribute it (every link is free marketing)
- Creates demand for Level 2 and 3 integrations
- The link IS the product for creators — it's their proof

---

## 11. What Makes Jitter Different (Competitive Landscape)

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

## 12. Jitter Badge v2.0 Structure

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

## 13. The B2B Platform Play — JITTEr as a Protocol

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

## 14. Roadmap

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

## 15. The One-Line Summary

> Jitter is sports statistics for human typing —
> just metadata, just numbers, immutable over time,
> and economically impossible to fake at scale.

---

*Built with ⚡ by humans, for humans.*
*© 2025-2026 Denis Gingras. All Rights Reserved.*
