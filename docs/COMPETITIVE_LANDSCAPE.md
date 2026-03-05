# JITTEr — Competitive Landscape & Market Analysis

**Date:** February 24, 2026
**Author:** Denis Gingras
**Status:** Research complete

---

## Executive Summary

No company currently combines keystroke biometrics, time-locked passports, and cryptographic badges for portable human authorship verification. The adjacent market (AI content detection) has proven demand — GPTZero alone generates $16M ARR with 8M users — but all existing solutions analyze the *output* (text) rather than the *process* (how it was written). JITTEr occupies a genuine gap in the market.

---

## Competitive Map

| Company | What They Do | Funding | Users / Revenue | Verifies Writing Process? |
|---|---|---|---|---|
| **GPTZero** | Analyzes text to detect AI content | $13.5M | $16M ARR, 8M users | No — analyzes the *output*, not the process |
| **Originality.ai** | AI content detection for publishers | Bootstrapped | $2.3M revenue, 20 people | No — content analysis only |
| **Copyleaks** | Plagiarism + AI detection | $7–8M | 83 employees | No — content analysis only |
| **Winston AI** | AI content detection | Unfunded | Small team | No — content analysis only |
| **Turnitin** | Plagiarism + AI detection for schools | Acquired for $1.7B (2019) | 16K+ institutions | No — content fingerprinting |
| **TypingDNA** | Keystroke biometrics | $8.8M | — | **Closest** — but does *authentication* (are you who you say you are?), NOT *authorship verification* (did a human write this?) |
| **BioCatch** | Behavioral biometrics for banking | $250M+ | Banking/fraud sector | No — fraud detection, not content |
| **Worldcoin / World ID** | Proof of humanity via iris scans | $250M+ | 12–16M iris scans | No — proves you're human once, not per-content |
| **C2PA / Content Credentials** | Media provenance standard (Adobe, Microsoft, etc.) | Backed by Adobe/MSFT/Google | 6,000 member orgs | Partial — tracks *how content was made* but for images/video, not writing |

---

## Key Observations

### 1. Nobody is doing what JITTEr does

No company combines keystroke biometrics + time-locked passports + cryptographic badges for portable human authorship verification.

### 2. TypingDNA is the closest technical analog

They do keystroke dynamics but use it for *identity* ("is this the same person who typed last time?"), not *authorship* ("was this written by a human?"). They've raised $8.8M and are focused on 2FA/authentication. They are NOT building a badge system, NOT building a passport, NOT targeting content verification.

### 3. GPTZero is the market leader in the adjacent space

$16M ARR, 8M users, $13M in the bank. But they analyze the *text itself* — perplexity, burstiness, word patterns. High false positives. Writers hate being accused. And the fundamental problem: as AI gets better, the text becomes indistinguishable. GPTZero is in an arms race they'll eventually lose.

### 4. C2PA is the closest in spirit

Adobe, Microsoft, Google, BBC — they're building a "nutrition label" for digital content. But it's focused on images/video (camera-to-screen provenance). Nobody in the C2PA ecosystem is doing writing-process verification.

### 5. Worldcoin proves you're human once; JITTEr proves it every time you write

Different use cases entirely. Worldcoin also has massive regulatory problems (banned in multiple countries).

---

## The Spoofing Paper (January 2026)

A January 2026 arXiv paper found that **keystroke timing alone can be spoofed with 99.8% evasion rates**. Three attack classes:

1. **Copy-type attack** — human transcribes AI text, producing real motor signals
2. **Timing forgery** — bot samples from human timing distributions
3. **Statistical mimicry** — matching the coefficient of variation of real typing

### Why this doesn't kill JITTEr

The paper attacks **single-session keystroke timing** — which is exactly what JITTEr's passport system already defends against. You can fake one session's timing. You can't fake 107 days of accumulated history with natural variance, sleep patterns, and session distribution. The paper actually *validates* JITTEr's multi-layered approach.

### Pitch defense

If someone throws this paper at you in a meeting: "We don't rely on single-session timing alone. That's the whole point of the passport."

---

## Why This Isn't an Altcoin

Altcoins were:
- Copies of Bitcoin with minor tweaks
- Solving problems nobody had
- Competing with 10,000 other coins doing the same thing
- Speculative value, not utility value

JITTEr is:
- **Solving a proven, growing problem** (GPTZero's $16M ARR proves people pay for this)
- **Using a genuinely different approach** (process verification, not content detection)
- **Has no direct competitor** in its specific niche
- **Has real utility** — the badge means something, the passport can't be faked

**Better analogy:** What credit scores were before FICO standardized them. Everyone knew creditworthiness mattered. Banks had their own ad-hoc systems. Then one company said "here's a number, 300–850, and it's portable." That became a $13B industry.

JITTEr says: "Here's a number, 0–100, and it proves you're a real human writer. It's portable across the internet."

---

## Risk Assessment

### 1. Adoption chicken-and-egg
Creators won't use it until readers recognize the badge. Readers won't recognize it until creators use it.

**Mitigation:** The blue link bootstraps both sides simultaneously.

### 2. GPTZero pivots
They have $16M ARR, 8M users, and $13M in the bank. If they decide to add keystroke biometrics, they have distribution.

**Defense:** JITTEr's passport system is a time-locked moat. GPTZero can't retroactively give users 6 months of typing history.

### 3. TypingDNA pivots
They already have the keystroke tech.

**Defense:** They're deep in the authentication/2FA market. Content authorship is a different business.

### 4. Spoofing paper gets mainstream attention
Could scare people off keystroke approaches entirely.

**Defense:** Educate that single-session timing ≠ passport system. The paper validates the multi-layer approach.

---

## Market Sizing

| Segment | Signal | Relevance |
|---|---|---|
| AI content detection | GPTZero $16M ARR, Turnitin acquired for $1.7B | Direct proof of demand for content authenticity |
| Behavioral biometrics | BioCatch raised $250M+ | Validates keystroke/behavioral analysis has enterprise value |
| Digital identity | Worldcoin raised $250M+ | Validates proof-of-humanity as a category |
| Content provenance | C2PA has 6,000 member orgs | Validates "trust labels" for digital content |

The content authenticity market is real and growing. JITTEr approaches it from a direction no one else occupies.

---

## Strategic Position

```
                    CONTENT-FOCUSED                    PROCESS-FOCUSED
                    (what was written)                 (how it was written)

ONE-TIME            GPTZero                            (empty — nobody here
VERIFICATION        Originality.ai                      except JITTEr session
                    Copyleaks                           badges)
                    Winston AI
                    Turnitin

ACCUMULATED         (not possible —                    JITTEr Passport
OVER TIME           text analysis is                   (107+ days of typing
                    point-in-time)                      history, time-locked)
```

JITTEr occupies the bottom-right quadrant alone.

---

## Bottom Line

The market is real ($16M ARR for content detection alone), the approach is novel (nobody combines biometrics + passport + badges), and the timing is right (AI content is exploding, trust is collapsing).

The question isn't "is the idea good?" — it clearly is. The question is: **can you ship the blue link and get 100 creators using it before someone else figures this out?**
