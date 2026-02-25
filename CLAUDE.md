# JITTEr - Project Context for Claude

## Project Overview
JITTEr is a human typing verification system. It proves text was physically typed in real time by a human using keystroke metadata (timing, rhythm, corrections) — never the content itself.

## Core Strategic Insights

### The Economic Force Model (The Real Value Proposition)
JITTEr is NOT an AI detector. It is an **economic force that increases the cost of faking human-generated content**.

- Right now, generating fake content costs essentially nothing (one API call, fractions of a cent)
- JITTEr makes faking expensive: to bypass it, an attacker must actually type text through a real keyboard, in real time, matching realistic typing dynamics, per document, every time
- Even a robotic typing simulator costs real time and real hardware per piece of content
- A bot farm generating 10,000 articles/day would need 10,000 humans typing in real time — the business model collapses
- **This is proof-of-work for text.** Same logic as CAPTCHAs, hashcash for email spam, PoW in crypto
- You don't stop every bad actor — you make it economically irrational to operate at volume

**The pitch:** "We don't claim to catch every AI-generated sentence. We make it cost real human time to produce verified content. That kills the economics of scale that make bots dangerous."

### The Data Flywheel (Statistical Inference at Scale)
Once JITTEr has enough volume, the typing data itself becomes the detection layer:

1. Collect enough real human typing sessions to build a baseline of what authentic typing looks like across populations
2. Patterns emerge — natural pause distributions, error rates, fatigue curves, burst/think rhythms, correction habits
3. Outliers become obvious — anything outside the statistical distribution of real typing flags itself
4. You don't need to define what "fake" looks like — you define what "real" looks like. Anything outside that envelope flags itself

**What becomes inferable:**
- Typing that's too consistent (humans drift, machines don't)
- Suspiciously perfect cadence (even replay bots struggle with natural variance)
- Copy-paste clusters (generating elsewhere and pasting chunks)
- Fatigue signatures (real sessions get slower, sloppier over time — faked ones don't)
- Per-user fingerprints (each user develops a typing identity that's hard to impersonate)

**The moat:** Anyone can build a keystroke logger. Nobody else will have the dataset of verified human typing behavior at scale. That dataset gets more valuable with every session.

### The Publish Averages, Keep Distributions Strategy
- **Publish:** Average WPM, average correction rate, average pause frequency, aggregate patterns — enough for transparency and trust
- **Keep private:** Full distributions, variance ranges, edge-case thresholds, per-user fingerprint models, simulation results
- Attackers can't reverse-engineer detection if they don't know the thresholds
- Publishing averages gives legitimacy without giving away the playbook

### The Simulation Play
- Run millions of synthetic typing sessions (bots trying to mimic human behavior) against the real dataset
- Measure the detection gap
- Publish the detection rate, not the methodology: "We ran 1,000,000 simulated attacks. Here's the detection rate."
- The methodology stays proprietary, the results are public
- Academic partners can validate under NDA without open-sourcing the model
- **Same model as credit card fraud detection** — Visa doesn't publish fraud rules, they publish fraud rates

## Key Framing Rules
- Never say "AI detector" — say "human verification" or "proof of human typing process"
- Never claim to be bulletproof — claim to make faking economically irrational at scale
- The product is the data, not just the tool
- Think credit bureau for typing, not antivirus for text

## Key Documents
- `JITTER_FOUNDATIONS.md` — Full technical and business architecture
- `CO_FOUNDER_AGREEMENT.md` — Partnership structure
- `IP_DECLARATION.md` — IP ownership
- `docs/plans/` — Platform design and implementation plans
