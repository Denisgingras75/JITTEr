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
  src/            war-score (CANONICAL WAR ENGINE), biometrics (capture), content, crypto, passport, writer, auth, popup, verifier
  manifest.json   Manifest V3
lab/              Algorithm proving ground
  jitter-box.js   Lab capture harness; scores through extension/src/war-score.js
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

## One Engine, Three Hosts
- `extension/src/war-score.js` = CANONICAL WAR scorer. Plain script, exposes `JitterWAR`. 9 signals with the plan weights, hard floors, soft penalties, length-weighted paste (no paste penalty), two-sided K-S, Pearson, step-table time cap. Change the math HERE and nowhere else, then `node sdk/build.js`.
- `extension/src/biometrics.js` = extension CAPTURE (timing, paste lengths, mouse, Loki gate, `getProfile`). `scoreWAR`/`applyTimeCap` delegate to war-score.js. It is not legacy and it is not a scorer.
- `sdk/src/core/jitter-box.js` = SDK CAPTURE. `sdk/build.js` inlines war-score.js ahead of it into `sdk/dist/jitter.min.js` (committed; rebuild after any engine change).
- `lab/jitter-box.js` = lab capture harness; `require()`s war-score.js so lab numbers use shipping math.

## Hard Rules
1. **Never store raw keystrokes.** Timing metadata only. (The badge's text_hash is a hash of the whole text, never the text.)
2. **Never say "AI detector"** — say "human verification" or "proof of human typing process"
3. **Never claim bulletproof** — claim economically irrational to fake at scale
4. **Badge must be cryptographically signed** (ECDSA P-256)
5. **Paste is transparent, not punished** — users paste quotes, URLs, names. Normal.
6. **`extension/src/war-score.js` is the canonical engine.** Extension, SDK bundle and lab all load that one file. Change the math there; never copy it.
7. All IP owned by Denis Gingras. See IP_DECLARATION.md.

## Known Gaps
- WAR thresholds/ramps were tuned on synthetic data; one session separates humans from bots weakly (audit P0-8). Recalibrate on real WGH sessions before trusting a threshold.
- The SDK's WGH path (`scoreRaw`) has no bigram/per-key data, so 33% of the weight sits at neutral 0.5 (audit P1-18).
- The server caps and classifies the client's typing score but does not recompute it.
- Backend changes (migrations 20260924*, attest/verify) are tested locally, not deployed: the Supabase project is paused. Deploy steps in docs/architecture/TRUST_LAYER.md.
- Anvil (Android) badges are unsigned and unscored; the Android build needs a machine with the SDK.
- Typing inside iframes isn't captured by the extension; the local passport can lose counts across tabs.
- Full status per finding: docs/FUNCTIONALITY_AUDIT_2026-09.md "Fix status on this branch".

## Key Files
1. `JITTER-PLAN.md` — full build bible (5 components, WAR formula, exit thesis)
2. `JITTER_FOUNDATIONS.md` — 610-line product bible
3. `extension/src/war-score.js` — the real engine (one file, loaded by extension, SDK bundle and lab)
4. `extension/src/content.js` — Chrome content script, protocol v10.0
5. `docs/security/RED_TEAM.md` — attack surface analysis

## Backend
Supabase (consistent with WGH). Firebase auth-utils.js is not loaded anywhere — do not ship.
Identity is a per-device P-256 key (no login): badges are device-signed, bound to text_hash + url,
attested by `/attest` (server-side age cap, rate limit, countersignature). Read
docs/architecture/TRUST_LAYER.md before touching attest/verify, crypto-utils.js or jitter-capture.js.
Dan IP conversation needed in writing before WGH integration.
