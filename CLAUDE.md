# JITTEr — Project Context for Claude

## What This Is
Human typing verification. Proves text was physically typed by a real human using keystroke biometrics (timing, rhythm, corrections) — never the content itself. Patent pending.

## Core Thesis
"Make authenticity cheaper than faking it." Time is the moat. Being real costs nothing (just type). Being fake costs more every day. This is proof-of-work for text.

## Repo Structure
```
extension/        Chrome extension (THE PRODUCT)
  src/            JS modules: biometrics, content, crypto, passport, writer, auth, popup, verifier
  icons/          16/48/128px
  *.html          writer, verify, popup, verifier
  manifest.json   Manifest V3
lab/              Algorithm proving ground
  jitter-box.js   CANONICAL ENGINE (WAR scorer, 9 signals, K-S, Pearson)
  algo/           matching engine, runners, generators
  botfarm/        5 Playwright adversarial personas
  results/        simulation results + report
sdk/              Embeddable widget (scaffold)
android/          Anvil Keyboard (Kotlin IME POC)
tests/            10 test files
docs/             security, business, architecture, plans
patent/           Both provisional specs + filing guides + receipt
research/         20+ research docs
archive/          All previous versions (v1-v5, anvil files, proof of work)
```

## Two Engines — IMPORTANT
- `lab/jitter-box.js` = CANONICAL. WAR scorer, 9 signals, K-S test, Pearson correlation. 616 lines. Use this.
- `extension/src/biometrics.js` = WEAK. Only 3 simple bot checks. Needs to be replaced with jitter-box.js.

## Key Rules
- NEVER say "AI detector" — say "human verification" or "proof of human typing process"
- NEVER claim bulletproof — claim economically irrational to fake at scale
- Content is NEVER captured or transmitted. Only keystroke timing metadata.
- All IP owned by Denis Gingras. See IP_DECLARATION.md.
- Patent filed: provisional #63/994,858 (2026-03-02) + CIP #63/997,498 (2026-03-05)

## Known Gaps
- Extension uses weak biometrics.js instead of WAR scorer (swap in progress)
- Auth has Firebase placeholder keys (switching to Supabase)
- 61% cross-user false match rate (uses only mean_inter_key for identity)
- Time-weighted confidence scoring not implemented (core thesis has minimal code)
- No server-side verification API
- Not listed on Chrome Web Store

## Key Files to Read First
1. This file
2. `JITTER_FOUNDATIONS.md` — 610-line product bible
3. `lab/jitter-box.js` — the real engine
4. `extension/src/content.js` — Chrome content script, protocol v10.0
5. `docs/security/RED_TEAM.md` — attack surface analysis

## Backend
Moving to Supabase (consistent with WGH stack). Firebase auth-utils.js has placeholder keys — do not ship as-is.

## Framing
- Think credit bureau for typing, not antivirus for text
- The product is the data flywheel, not just the tool
- Publish averages, keep distributions private (like Visa fraud detection)
