# JITTEr — Project Context for Claude

## What This Is
Behavioral biometrics widget that proves a human typed something. Not AI detection. Not a CAPTCHA. A process receipt.

**The one-liner:** "Elon's checkmark but not useless."

**Core thesis:** Bots can fake a session. They cannot economically maintain consistent human-like profiles across months. Time is the moat.

**Patents:** #63/994,858 (base, 2026-03-02) + #63/997,498 (CIP, 2026-03-05)

## Read JITTER-PLAN.md for:
- The Five Components (widget, passport, essay, hall effect, extension)
- WAR formula with signal weights + time confidence caps
- Widget spec (jitter-widget.js build target) + done criteria
- Paste weighting rules + passport storage spec
- Hall Effect / Wooting research plan
- Known gaps table + priority order
- Exit thesis + key people

**Read it when building anything. Skip it for small fixes.**

## Repo Structure
```
extension/        Chrome extension
  src/            biometrics, content, crypto, passport, writer, auth, popup, verifier
  manifest.json   Manifest V3
lab/              Algorithm proving ground
  jitter-box.js   CANONICAL ENGINE (WAR scorer, 9 signals, K-S, Pearson)
  algo/           matching engine, runners, generators
  botfarm/        5 Playwright adversarial personas
sdk/              Embeddable widget (CURRENT BUILD TARGET)
android/          Anvil Keyboard (Kotlin IME POC)
tests/            10 test files
docs/             security, business, architecture, plans
patent/           Both provisional specs + filing guides
research/         20+ research docs
archive/          All previous versions (proof of work)
```

## Two Engines
- `lab/jitter-box.js` = CANONICAL. WAR scorer, 9 signals, K-S test, Pearson. 616 lines. Use this.
- `extension/src/biometrics.js` = LEGACY. Only 3 simple checks. Being replaced.

## Hard Rules
1. **Never store raw keystrokes.** Timing metadata only.
2. **Never say "AI detector"** — say "human verification" or "proof of human typing process"
3. **Never claim bulletproof** — claim economically irrational to fake at scale
4. **Badge must be cryptographically signed** (ECDSA P-256)
5. **Paste is transparent, not punished** — users paste quotes, URLs, names. Normal. Per-paste size weights purity (0.1x/0.3x/1.0x); no penalty except `paste_flood` (>90% weighted) as the anti-laundering guard. See JITTER-PLAN.md.
6. **jitter-box.js is the canonical engine.** biometrics.js is legacy. Port, don't fork.
7. All IP owned by Denis Gingras. See IP_DECLARATION.md.

## Known Gaps
- Extension uses weak biometrics.js (swap in progress on hawk/biometrics-swap branch)
- Auth has Firebase placeholder keys (Supabase swap on orca/supabase-auth branch)
- 61% cross-user false match rate (fixed in lab, not ported to extension)
- verify.html calls badge decode but never calls verifyBadge() (20-line fix)
- Suspicion score calculated but never embedded in badges
- Three badge formats exist — unify to v3.0 spec (see MASTER-PLAN.md)

## Key Files
1. `JITTER-PLAN.md` — full build bible (5 components, WAR formula, exit thesis)
2. `JITTER_FOUNDATIONS.md` — 610-line product bible
3. `lab/jitter-box.js` — the real engine
4. `extension/src/content.js` — Chrome content script, protocol v10.0
5. `docs/security/RED_TEAM.md` — attack surface analysis

## Backend
Supabase (consistent with WGH). Firebase auth-utils.js has placeholder keys — do not ship.
Dan IP conversation needed in writing before WGH integration.
