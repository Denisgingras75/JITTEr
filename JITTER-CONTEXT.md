# JITTEr — Complete Project Context

**Use this file to brief a new Claude session on the entire JITTEr project.**
Denis Gingras | Patents #63/994,858 + #63/997,498 | Copyright 2025-2026

---

## 1. What JITTEr Is

Behavioral biometrics widget that proves a human typed something. Not AI detection. Not a CAPTCHA. A process receipt that travels with content.

**One-liner:** "Elon's checkmark but not useless."

**Acronym:** Jitter Integrity Tracking & Typing Entropy Recognition

**Core thesis:** Bots can fake a single session. They cannot economically maintain consistent human-like typing profiles across months. Time is the moat. Cost per fake verified account goes from $0.04 to $200+ at 365 days. Bot farms quit.

**What it is NOT:**
- Not an AI content detector (never says "this was written by AI")
- Not surveillance (never stores content, only timing metadata)
- Not bulletproof (claims economically irrational to fake at scale)

---

## 2. Patent Status

- **Provisional #63/994,858** — filed March 2, 2026 (base spec, 24 claims)
- **CIP #63/997,498** — filed March 5, 2026 (Hall Effect force curves, cross-modal identity, progressive sensor enrichment, 14 additional claims)
- Non-provisional deadline: March 2, 2027
- All IP owned by Denis Gingras (see IP_DECLARATION.md)

---

## 3. Repo Structure

```
JITTEr/
  lab/                    Algorithm proving ground
    jitter-box.js         CANONICAL ENGINE — WAR scorer, 9 signals, K-S, Pearson (616 lines)
    algo/                 matching engine, hardened runner, bot/profile generators
    botfarm/              5 Playwright adversarial personas for stress testing

  extension/              Chrome extension (Manifest V3)
    src/
      content.js          Content script — keystroke tracking, badge minting, attestation
      biometrics.js       LEGACY engine (3 simple checks) — being replaced by jitter-box.js
      crypto-utils.js     ECDSA P-256 key generation, badge signing/verification
      passport-utils.js   Suspicion scoring, activity patterns, daily stats
      writer.js           Essay Ledger mode (append-only hash chain)
      auth-utils.js       Firebase placeholder keys (Supabase swap pending)
      background.js       Service worker, Google OAuth
      popup.js            Extension popup UI
      verifier.js         Badge verification logic
      wooting-analog.js   Hall Effect keyboard research (WebHID)
    verify.html           Badge verification dashboard
    writer.html           Essay mode editor
    manifest.json         Manifest V3

  sdk/                    Embeddable widget (current build target)
    src/
      init.js             Widget initialization
      jitter-capture.js   Capture + attestation flow
      badge.js            Badge display component
      core/jitter-box.js  Copy of canonical engine
    dist/                 Built widget files
    examples/             Integration demos

  supabase/               Attestation server
    functions/
      attest/index.ts     POST — records attestation, returns badge_hash
      verify/index.ts     GET — public badge verification (HTML + JSON)
    migrations/           attestations + profiles tables

  android/                Anvil Keyboard (Kotlin IME POC)
  tests/                  15 test files (Playwright + unit)
  docs/                   Security, business, architecture, plans
  patent/                 Both provisional specs + filing guides
  research/               20+ research documents
  archive/                All previous versions (proof of build history)
```

---

## 4. The WAR Scorer — The Core Algorithm

**WAR = Writing Authenticity Rating** (0.00–1.00 normalized, displayed as 0–10)

Canonical implementation: `lab/jitter-box.js` (616 lines, zero dependencies)

### 9 Weighted Signals

| Signal | Weight | What It Measures | Bot Floor | Human Zone |
|--------|--------|-----------------|-----------|------------|
| bigram_rhythm | 18% | CV of bigram timing means (finger patterns) | 0.08 | 0.20 |
| per_key | 15% | CV of per-key dwell times (typing fingerprint) | 0.09 | 0.25 |
| cross_signal | 15% | Pearson flow-coupling + pause warmup + fatigue | — | — |
| distribution | 12% | K-S test: keystrokes fit log-normal distribution | 0.25 | 0.08 |
| inter_key_var | 10% | Std dev of flight times (bots are flat) | 9ms | 45ms |
| dwell_std | 10% | Std dev of key hold duration | 8ms | 20ms |
| mean_dwell | 8% | Average key hold time (bots < 27ms) | 27ms | 80ms |
| editing | 7% | Edit ratio + pause frequency (bots never edit) | 3%/0.4 | 8%/1.5 |
| purity | 5% | Typed vs weighted paste ratio | 0 | 1 |

### Cross-Signal Sub-Tests (3 components)
1. **Pause warmup** — after a gap, next keystrokes should be slower (humans re-engage)
2. **Flow coupling** — Pearson correlation between inter-key speed and dwell time windows
3. **Fatigue slope** — typing slows over time (human neuromuscular fatigue)

### Statistical Methods
- **K-S test** — Kolmogorov-Smirnov against log-normal fit (human keystrokes are log-normal)
- **Pearson r** — correlation coefficient for flow coupling
- **Ramp scoring** — linear interpolation between bot_floor and human_zone per signal

### Classification Thresholds
- WAR >= 0.80: `verified` (human)
- WAR >= 0.50: `suspicious`
- WAR < 0.50: `bot`

### Time Confidence Cap (The Economic Thesis in Code)
```
< 1 day     → max WAR 0.35
1-7 days    → max WAR 0.50
7-30 days   → max WAR 0.65
30-90 days  → max WAR 0.80
90-180 days → max WAR 0.92
180+ days   → max WAR 1.00
```

### Paste Weighting (Transparent, Not Punished)
```
< 50 chars   → 0.1x alien weight  (URL, name — noise)
50-300 chars → 0.3x alien weight  (shown in stats, mild impact)
> 300 chars  → 1.0x alien weight  (shown prominently)
```

---

## 5. The Five Components

### 5a. Widget (sdk/) — BUILD TARGET #1
Single JS file. Script tag. Auto-attaches to form textareas. On submit: scores, signs, injects hidden badge field. Zero config, zero friction.

Three visual layers:
1. **Live indicator** — small dot + stats bar while typing
2. **Inline badge** — WAR score + tier after submit (clickable)
3. **Passport card modal** — full profile on badge click

### 5b. Passport System
Lifetime-accumulated behavioral profile. Per-user identity across sessions and sites.
- localStorage now, Supabase for sync
- Tracks: sessions, total keystrokes, career WAR, consistency index, streaks
- **Raw biometric telemetry NEVER leaves the device.** Supabase stores ONLY WAR score + badge hash.

Suspicion scoring (6 signals):
- superhuman_output: > 10,000 keys in a session
- unnatural_consistency: CV of session WAR < 0.05 across 5+ sessions
- excessive_sessions: > 20 sessions/day
- high_night_activity: > 80% activity 11pm-5am
- new_high_output: account < 7 days + > 5,000 keys/session
- extreme_duration: session > 4 hours without pause

### 5c. Essay Mode / Writing Ledger
Append-only hash chain recording the writing process. Teacher sees a rewind button, not a number. Every keystroke, paste, pause, focus-loss event recorded. Checkpoints every 100 keystrokes. Hash chain makes the replay tamper-evident.

Status: ~200-300 lines from complete. Parked until September 2026 (Molly pilot).

### 5d. Hall Effect / Wooting
Physics-based trust. Premium tier. 4,096 levels of key depth at 8kHz (400x signal density vs binary keyboard). Human fingers create sigmoidal depression curves with 8-12 Hz micro-tremor that software and solenoids cannot replicate.

Three hardest-to-fake signals: micro_tremor, release_asymmetry, depth_variance.

### 5e. Chrome Extension
Passport network seed. Working but running legacy biometrics.js engine. Two known bugs:
1. verify.html doesn't actually call verifyBadge() (~20-line fix)
2. Suspicion score calculated but never embedded in badges

---

## 6. Attestation Server (Supabase Edge Functions)

**Live and deployed** on JITTEr's Supabase project (`fmguuhnustgcqzgjaoil`).

### POST /functions/v1/attest
- Input: `{ user_id, site_key, war_score, classification, flags, meta }`
- Validates WAR score (0-1 range)
- Generates SHA-256 badge_hash from `user_id:site_key:war_score:timestamp`
- Inserts attestation record, upserts user profile with aggregated stats
- Returns: `{ badge_hash, timestamp, classification, profile }`

### GET /functions/v1/verify
- Input: `?hash=<badge_hash>` (add `&format=json` for machine-readable response)
- Queries attestations table, returns verification page or JSON
- Public — anyone can verify any badge

### Database Tables
- `attestations` — id, user_id, site_key, war_score, classification, badge_hash, flags[], meta, created_at
- `profiles` — user_id, total_keystrokes, total_sessions, total_badges, avg_war, best_war, level, etc.

---

## 7. Cryptography

- **ECDSA P-256** — badge signing (crypto-utils.js)
- **SHA-256 hash chain** — each badge references previous badge hash (immutable chain)
- **SHA-256 badge_hash** — attestation server generates from composite input
- Forgery requires breaking P-256. Chain hash prevents backdating.

---

## 8. WGH Integration (What's Good Here)

JITTEr is integrated into WGH (food discovery platform) for review trust scoring.

### Integration Points
- `src/utils/jitter-box.js` — copy of canonical engine, runs in-browser
- `src/api/jitterApi.js` — attestation calls + profile/badge RPCs
- `src/api/votesApi.js` — submits votes with WAR score + badge_hash
- `src/components/ReviewFlow.jsx` — scores review on submit, calls attestation
- `supabase/migrations/026-jitter-tables.sql` — jitter_profiles + jitter_samples
- `supabase/migrations/2026-05-04-jitter-server-side-ingest.sql` — hardened sample ingest RPC

### Trust Scoring for Reviews
```
Jitter-verified human reviews:     weight 1.0
Passport-verified (no badge):      weight 0.8
AI-translated real reviews:        weight 0.6
Unverified reviews:                weight 0.3
```

### Security Status (as of May 2026)
- `submit_jitter_sample` RPC: HARDENED (plausibility bounds, rate limits)
- `submit_vote_atomic` RPC: HARDENED (war_score bounds, badge_hash format check, server-side verification via verify-jitter-badge edge function)

---

## 9. Hard Rules

1. **Never store raw keystrokes.** Timing metadata only.
2. **Never say "AI detector"** — say "human verification" or "proof of human typing process."
3. **Never claim bulletproof** — claim economically irrational to fake at scale.
4. **Badge must be cryptographically signed** (ECDSA P-256).
5. **Paste is transparent, not punished** — users paste quotes, URLs, names. Normal.
6. **jitter-box.js is the canonical engine.** biometrics.js is legacy. Port, don't fork.
7. All IP owned by Denis Gingras. See IP_DECLARATION.md.
8. Raw telemetry never hits any server. WAR + badge hash only.

---

## 10. Known Gaps

| Gap | Severity | Status |
|-----|----------|--------|
| verify.html doesn't verify | CRITICAL | 20-line fix, not deployed |
| Suspicion score not in badges | High | Code exists, not wired |
| 3 incompatible badge formats | High | Unify to v3.0 spec |
| Firebase placeholder keys | Medium | Supabase swap pending (needs Dan) |
| Extension using legacy engine | Medium | Swap in progress |
| Essay mode incomplete | Low | September 2026 target |
| Wooting WebHID | Low | Research, no deadline |

---

## 11. Key People

- **Denis Gingras** — sole inventor, IP owner (80/20 split with Dan)
- **Dan** — co-founder, WGH. IP conversation needed in writing before WGH integration.
- **Molly** — Essay Mode pilot teacher. September 2026.
- **Bri (Brian Sullivan)** — investor/advisor. After WGH has real data.

---

## 12. Exit Thesis

~$100k target. Small acquisition, angel check, or licensing deal. Not building to operate — building to demonstrate traction, then sell. Traction = WGH live with real behavioral data from real users.

Honest probability: 20-30% baseline. 50-60% with correct execution sequence.

---

## 13. Competitive Landscape

| Tool | Approach | Problem |
|------|----------|---------|
| GPTZero | Detects AI-written text | High false positives; accuses good writers |
| Turnitin AI | Content fingerprinting | Can be evaded by rephrasing |
| Proctoring cams | Video surveillance | Invasive, hated, privacy nightmare |
| **JITTEr** | Verifies the human writing *process* | Can't accuse content — only measures effort |

---

## 14. Economics of Attack

| Attack Type | Reviews/Day/Profile | Profiles Needed (1K reviews) | Cost |
|-------------|--------------------|-----------------------------|------|
| Raw bot (no JITTEr) | 1,000+ | 1 | $15 |
| Bot mimicking JITTEr | 10-30 | 33-100 | $500+ |
| Bot with aged accounts | 10-30 | 33-100 + 90-day wait | Infeasible |
| Human typist | 20-40 | 25-50 | $2,000+ |

---

## 15. Priority Order

1. Call Dan. IP in writing. (Blocks WGH + Supabase)
2. Build sdk/jitter-widget.js (no Dan dependency)
3. Build sdk/demo.html (screenshot for Bri)
4. Fix extension/verify.html (20 lines)
5. Research Wooting WebHID (independent)
6. Finish essay/essay-mode.js (September target)
7. WGH integration (requires Dan call)

---

## 16. The One-Line Summary

> JITTEr is sports statistics for human typing — just metadata, just numbers, immutable over time, and economically impossible to fake at scale.
