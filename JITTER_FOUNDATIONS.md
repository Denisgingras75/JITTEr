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

## 7. School Essay Mode — The Locked Room

A separate, full-screen-enforced writer for in-class or timed assignments.

### Constraints enforced:
- **Full-screen required** — ESC exits and pauses the session (teacher sees this)
- **No paste allowed** — clipboard access blocked entirely
- **No split-screen detectable** — window focus loss logged (blur events)
- **Timer visible** — elapsed + remaining for timed assignments
- **Word target visible** — progress bar toward required length

### What this catches:
```
Scenario A: Student opens ChatGPT in other window, copies text
→ CAUGHT: paste event logged, pasted_chars > 0, purity drops

Scenario B: Student reads from phone and types it
→ PARTIALLY CAUGHT: typing too fast? Low backspaces?
  Low cognitive ratio (not pausing to think)?
  Teacher sees stats, makes judgment call.
  At minimum: they read it, which is... actually fine?

Scenario C: Student uses a script to type
→ CAUGHT via rhythm: bot_detected = true
  OR if undetected in session: passport flags it over time
  Can't maintain 50+ essays/semester without statistical detection.
```

### The honest position on Scenario B:
If a student reads AI content from their phone and manually types every word, that's... honestly a lot of work. And they're probably reading and processing the content. Jitter's job isn't to prevent all learning shortcuts — it's to prevent **effortless, zero-engagement cheating**.

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

## 10. Roadmap

### Phase 1 — Jitter Core (Done ✅)
- Loki biometric analysis (cognitive ratio, rhythm entropy)
- Passport accumulation + level system
- ECDSA badge signing + chain verification
- Activity pattern tracking + suspicion score
- Teacher verify dashboard
- Firebase cloud sync (optional)

### Phase 2 — WGH Integration
- [ ] NLP translation layer for Google/Yelp reviews → 1-10 scores
- [ ] Review source tagging system
- [ ] Weighted rating formula by source trust level
- [ ] Jitter session badge on WGH review submission
- [ ] Profile trust score visible on public profiles

### Phase 3 — School Essay Mode
- [ ] Full-screen enforcement + blur detection
- [ ] Paste blocking
- [ ] Assignment mode (word target + timer)
- [ ] Teacher session dashboard (see all students live)
- [ ] Export session report (CSV for gradebook)

### Phase 4 — Passport Network
- [ ] Public profile pages showing passport stats (no content, just numbers)
- [ ] "Jitter Verified Human" badge for profiles with 90+ day history
- [ ] Cross-platform passport (WGH + essay mode share same passport)
- [ ] Anomaly alerts ("this account submitted 28 reviews today")

---

## 11. The One-Line Summary

> Jitter is sports statistics for human typing —
> just metadata, just numbers, immutable over time,
> and economically impossible to fake at scale.

---

*Built with ⚡ by humans, for humans.*
*© 2025-2026 Denis Gingras. All Rights Reserved.*
