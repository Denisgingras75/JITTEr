# JITTER-PLAN.md
**Read this before every Claude Code session.**
*Last updated: 2026-03-05*

---

## What JITTEr Is

Behavioral biometrics widget that proves a human typed something.
Not AI detection. Not a CAPTCHA. A process receipt that travels with content.

**One-liner:** "Elon's checkmark but not useless."

**The economic thesis:** Bots can fake a session. They cannot economically maintain
consistent human-like profiles across months. Time is the moat. Cost per fake
verified account goes from $0.04 -> $200+ at 365 days. Bot farms quit.

**Patents:**
- #63/994,858 -- March 2, 2026 (base spec, 24 claims)
- #63/997,498 -- March 5, 2026 (CIP: Hall Effect force curves, cross-modal identity,
  progressive sensor enrichment)
- Non-provisional deadline: March 2, 2027

**Exit target:** ~$100k. Acquisition, angel check, or licensing deal.
Sell patent + traction before the arms race catches up.

---

## Repo Structure

```
JITTEr/
  sdk/
    jitter-widget.js     <- BUILD TARGET #1 (drop-in widget, full stack)
    jitter-box.js        <- Canonical WAR engine (copy from lab, keep in sync)
    react/
      JitterBox.jsx      <- React component wrapper
    demo.html            <- Integration demo (screenshot-ready for Bri)

  extension/
    src/
      biometrics.js      <- Biometric capture engine
      content.js         <- Content script, passport, badge minting
      crypto-utils.js    <- ECDSA P-256, hash chains
      passport-utils.js  <- Suspicion scoring, activity patterns
      writer.js          <- Essay Ledger (append-only hash chain)
    verify.html          <- Badge verification dashboard (BUG: doesn't verify)
    writer.html          <- Essay mode editor

  lab/
    jitter-box.js        <- CANONICAL ENGINE (WAR scorer, K-S, Pearson)
    algo/
      matching-engine.mjs
      hardened-runner.mjs  <- 96-100% detection, 11/11 checks
      bot-generator.mjs
    botfarm/             <- 5 Playwright adversarial personas

  hall/
    wooting-research.md  <- Hall Effect + Wooting API research
    wooting-poc.js       <- WebHID proof of concept
    force-curve-scorer.js <- Depth signal processing

  essay/
    essay-mode.js        <- Essay capture + ledger (200-300 lines to complete)
    ledger-replay.js     <- Checkpoint replay for teachers/auditors

  passport/
    passport-manager.js  <- localStorage + future Supabase
    passport-card.js     <- Sports card UI component
    passport-sync.js     <- Cross-session aggregation

  tests/
    widget.spec.js
    badge-chain.spec.js
    bot-detection.spec.js

  JITTER-PLAN.md         <- THIS FILE
```

---

## The Five Components

### 1. WIDGET -- sdk/jitter-widget.js <- BUILD NOW

Single JS file. Script tag. Auto-attaches to form textareas.
On submit: scores, signs, injects hidden badge field. Zero config. Zero friction.

**Three visual layers:**

Layer 1 -- Live indicator (while typing)
  Small dot pulses while capturing.
  Slim stats bar below textarea: purity % . keystrokes . time
  User barely notices.

Layer 2 -- Inline badge (after submit)
  8.4 Hall of Fame . 98% pure
  Clickable. Lives next to the submitted content.

Layer 3 -- Passport card modal (click the badge)
  Full profile: THIS SESSION + CAREER PROFILE
  WAR score headline. Career stats grid. Session stats below.

**WAR Formula (0-10 scale):**
  bigram_rhythm    0.18   CV of bigram means (human finger patterns)
  per_key          0.15   CV of per-key dwells (fingerprint)
  cross_signal     0.15   Pearson flow-coupling + pause warmup + fatigue
  distribution     0.12   K-S test: human keystrokes fit log-normal
  inter_key_var    0.10   Std dev of flight times (bots are flat)
  dwell_std        0.10   Std dev of key hold duration
  mean_dwell       0.08   Average key hold time (bots < 27ms)
  editing          0.07   Edit ratio + pause freq (bots never edit)
  purity           0.05   Typed vs weighted paste

**Time confidence cap (THE ECONOMIC THESIS IN CODE):**
  < 1 day     -> max WAR 0.35
  1-7 days    -> max WAR 0.50
  7-30 days   -> max WAR 0.65
  30-90 days  -> max WAR 0.80
  90-180 days -> max WAR 0.92
  180+ days   -> max WAR 1.00

**Paste weighting (transparent, not punished):**
  < 50 chars  -> 0.1x alien weight  (URL, name -- noise)
  50-300 chars -> 0.3x alien weight  (shown in stats, mild impact)
  > 300 chars  -> 1.0x alien weight  (shown prominently)
  Multiple pastes -> flag 'high_paste_volume', not a hard WAR penalty

**WAR Tiers:**
  8.0-10   Hall of Fame
  6.0-7.9  All-Star
  4.0-5.9  Solid
  2.0-3.9  Rookie
  0-1.9    Suspicious

**Done criteria:**
  - Script tag on demo.html -> auto-attaches
  - Type -> live dot + stats bar visible
  - Submit -> badge inline (WAR, tier, purity)
  - Click badge -> passport card modal opens
  - Badge has valid ECDSA P-256 signature
  - Hidden field jitter_badge present in form data
  - Paste paragraph -> shown in stats, not hard-penalized
  - Day 0 account: WAR capped at 0.35 regardless of typing quality

---

### 2. PASSPORT -- passport/

The sports card. Accumulates over time. Per-user identity across sessions and sites.

**localStorage (now), Supabase (after Dan call):**
```json
{
  "firstSeen": 1740000000000,
  "sessions": 34,
  "totalKeystrokes": 58420,
  "careerPurity": 0.94,
  "careerWAR": 7.8,
  "consistencyIndex": 87,
  "streak": { "current": 8, "longest": 12 },
  "avgSubmissionsPerDay": 2.4,
  "suspicionScore": 4
}
```

**Architecture rule (non-negotiable):**
Raw biometric telemetry NEVER leaves the device.
Supabase stores ONLY: WAR score + badge hash.

**Suspicion scoring (6 signals from passport-utils.js):**
  superhuman_output     > 10,000 keys in a session
  unnatural_consistency  CV of session WAR < 0.05 across 5+ sessions
  excessive_sessions    > 20 sessions/day
  high_night_activity   > 80% activity 11pm-5am
  new_high_output       account < 7 days + > 5,000 keys/session
  extreme_duration      session > 4 hours without pause

---

### 3. ESSAY MODE -- essay/

Writing Ledger for students. Append-only hash chain.
Captures composition process. Not proctoring. Transparency.

**Status:** ~200-300 lines from complete. Parked until September 2026 (Molly pilot).

**essay-mode.js needs:**
  - Ledger: append-only hash chain (timing only, never content)
  - Checkpoint: snapshot every 100 keystrokes
  - Export: signed ledger + badge payload

**ledger-replay.js:**
  Teacher view. Scrubber timeline. Shows when text appeared, paste events,
  typing speed over time. Like git diff for human composition.

**Key distinction:** NOT proctoring. Doesn't lock the browser.
"You can Google. We just verify you typed the answer."

**Reactivates September 2026. Check IRB requirements before Molly's pilot.**

---

### 4. HALL EFFECT / WOOTING -- hall/

Physics-based trust. Premium tier. The long-term moat.

4,096 levels of key depth at 8kHz. 400x signal density vs binary keyboard.
Standard keyboard: 2 data points per keypress.
Hall Effect at 8kHz: ~800 data points per keypress.

**Why it can't be faked:**
Human fingers create sigmoidal depression curves with 8-12 Hz micro-tremor.
Solenoids: linear. Software: binary. Physics is the differentiator.

**3 hardest-to-fake signals:**
  micro_tremor      8-12 Hz involuntary oscillation (impossible from software)
  release_asymmetry Attack curve != release curve (always true for humans)
  depth_variance    Same key pressed differently each time (fatigue, angle)

**Wooting WebHID access:**
```javascript
const devices = await navigator.hid.requestDevice({
  filters: [{ vendorId: 0x31E3 }]  // Wooting vendor ID
})
// Read HID reports -> parse depth values -> build force curve
```

**Research tasks (no dependencies, start anytime):**
  - Read Wooting open-source SDK (wooting.io/developer)
  - Write WebHID connection + raw data reader
  - Parse HID reports into depth-time arrays
  - Detect sigmoid vs linear curve shapes
  - Extract micro-tremor via FFT on depth time series
  - Add depth_curve: 0.20 weight to WAR scorer
  - Validate: can you distinguish human from solenoid?

This does NOT need to ship before exit. Build enough to demo and support patent claims.

---

### 5. CHROME EXTENSION -- extension/

Passport network seed. Users install once, build history passively.
That history becomes their credential everywhere.

**Status:** Working but running old engine. Two critical bugs.

**Bug 1 (SHOWSTOPPER): verify.html doesn't verify.**
verifyBadge() exists. verify.html never calls it. Anyone can forge a badge.
Fix -- ~20 lines:
```javascript
const isValid = await CryptoUtils.verifyBadge(
  payload, payload.signature, payload.chain.pub_key
)
if (!isValid) showError('SIGNATURE INVALID -- badge may be forged')
```

**Bug 2: Suspicion score not in badges.**
passport-utils.js calculates it. Neither content.js nor writer.js embeds it.
Fix: pull suspicionScore from passport before exportBadge().

**Extension priority order:**
  1. Fix verify.html (20 lines)
  2. Fix suspicion score embedding
  3. Unify to v3.0 badge format
  4. Replace biometrics.js with jitter-box.js engine
  5. Replace Firebase with Supabase (after Dan call)

---

## Known Gaps

| Gap | Severity | Blocked on |
|-----|----------|-----------|
| verify.html doesn't verify | CRITICAL | Nothing -- fix today |
| Suspicion score not in badges | High | Nothing |
| 3 incompatible badge formats | High | Nothing |
| Firebase placeholder | Medium | Dan call |
| No server-side verify API | Medium | Dan call |
| Extension using old engine | Medium | Nothing |
| Essay mode incomplete | Low | September 2026 |
| Wooting WebHID | Low | Nothing (research) |

---

## Priority Order

1. **Call Dan. IP in writing.** Blocks WGH + Supabase.
2. **Build sdk/jitter-widget.js** (doesn't require Dan)
3. **Build sdk/demo.html** (screenshot for Bri)
4. **Fix extension/verify.html** (20 lines)
5. **Research Wooting WebHID** (independent of everything)
6. **Finish essay/essay-mode.js** (September target)
7. **WGH integration** (requires Dan call)

---

## Hard Rules

1. Never store raw keystrokes. Timing metadata only.
2. Dan IP in writing before WGH integration.
3. Badge must be cryptographically signed before B2B pitch.
4. Paste is transparent, not punished.
5. jitter-box.js is the canonical engine. biometrics.js is legacy.
6. JITTEr is a measurement layer, not a verdict machine.
7. Raw telemetry never hits Dan's servers. WAR + badge hash only.

---

## Exit Thesis

~$100k target. Small acquisition, angel check, or licensing deal.
Not building to operate. Building to demonstrate traction, then sell.

Traction = WGH live with real behavioral data from real users.
Bri pitch gets materially stronger the moment WGH has real data.

Honest probability: 20-30% baseline. 50-60% with correct execution sequence.

---

## Key People

- Dan -- co-founder, WGH. IP split 80/20 Denis. CURRENT BLOCKER.
- Molly -- Essay Mode pilot. September 2026.
- Bri (Brian Sullivan) -- investor/advisor. After WGH has data.

---

*Denis Gingras | Patents #63/994,858 + #63/997,498*
