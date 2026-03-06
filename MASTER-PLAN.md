# JITTEr — Master Plan

**Read this first. Every build session.**

## Current Build Target: `sdk/jitter-widget.js`

### What it needs to be

A single JS file. Drop a `<script>` tag on any page.
It auto-discovers form textareas and attaches.
On submit, it mints a signed badge and injects it as a hidden field.

### The widget has three visual layers:

**Layer 1 -- Live indicator (while typing)**
Small dot + minimal stats bar below the textarea.
Shows: purity %, keystrokes, session time.
Nothing intrusive. User barely notices it.

**Layer 2 -- Badge (after submit)**
Inline badge next to the submitted content.
Shows: WAR score, tier icon, purity %.
Clickable.

**Layer 3 -- Passport card (click the badge)**
Modal showing full profile.
Two sections: THIS SESSION + CAREER PROFILE.

### Passport card layout:

```
+------------------------------------------+
|  JITTEr PASSPORT                         |
|  Denis G.  .  Advanced  .  107 days      |
|                                           |
|  WAR  8.4  Hall of Fame                  |
|  --------  84%                            |
|                                           |
|  THIS SESSION                             |
|  Typed: 847 chars    Pasted: 0            |
|  Purity: 100%        WPM: 52             |
|  Duration: 14 min    Pauses: 12           |
|                                           |
|  CAREER PROFILE                           |
|  Sessions: 34        Streak: 8 days       |
|  Avg purity: 94%     Consistency: 87      |
|  Posts/day: 2.4      Since: Nov 2025      |
|                                           |
|  [Verify this badge]  [View profile]      |
+------------------------------------------+
```

---

## WAR Formula (Writer Authenticity Rating, 0-10)

### Signal weights:
```
bigram_rhythm    0.18   CV of bigram means (human finger patterns)
per_key          0.15   CV of per-key dwells (fingerprint)
cross_signal     0.15   Pearson flow-coupling + pause warmup + fatigue
distribution     0.12   K-S test: human keystrokes = log-normal
inter_key_var    0.10   Std dev of flight times (bots are flat)
dwell_std        0.10   Std dev of key hold duration
mean_dwell       0.08   Average key hold time (bots are too short)
editing          0.07   Edit ratio + pause frequency (bots never edit)
purity           0.05   Typed vs pasted
```

### Time confidence cap (THE ECONOMIC THESIS IN CODE):
```
Account age     Max WAR
< 1 day         0.35    (new account, can't trust it)
1-7 days        0.50
7-30 days       0.65
30-90 days      0.80
90-180 days     0.92
180+ days       1.00    (time is the moat)
```

**A bot can type perfectly. It cannot fake 180 days of consistent history.**

### Paste weighting:
Copy-paste is normal human behavior. Do NOT punish it like a bot signal.
Instead: transparent display.

```
Paste event < 50 chars   -> neutral (URL, username, quote fragment)
Paste event 50-300 chars  -> shown in stats, mild purity penalty (-0.3x weight)
Paste event > 300 chars   -> shown prominently, full purity penalty
Multiple pastes           -> flag 'high_paste_volume' but don't hard-penalize WAR
```

Purity = typed_chars / (typed_chars + weighted_alien_chars)
where weighted_alien = short_pastes*0.1 + medium_pastes*0.3 + long_pastes*1.0

### WAR tiers:
```
8.0-10   Hall of Fame   (established, high confidence)
6.0-7.9  All-Star       (strong profile, trustworthy)
4.0-5.9  Solid          (developing, reasonable)
2.0-3.9  Rookie         (new or limited data)
0-1.9    Suspicious     (bot flags present)
```

---

## Passport Storage

**For now: localStorage** (no server required)
Key: `jitter_passport`

```json
{
  "firstSeen": 1740000000000,
  "lastSeen":  1741000000000,
  "sessions": 34,
  "totalKeystrokes": 58420,
  "careerPurity": 0.94,
  "careerWPM": 51,
  "consistencyIndex": 87,
  "streak": { "current": 8, "longest": 12 },
  "dailySubmissions": { "2026-03-05": 3 },
  "avgSubmissionsPerDay": 2.4
}
```

**Future: Supabase** (when Dan IP conversation done)
Store only: WAR score + badge hash (raw biometrics NEVER leave client)

---

## Files to Build (in order)

### 1. `sdk/jitter-widget.js` -- THE WIDGET
Single file. UMD bundle (works as script tag AND ES module).
No dependencies. No build step required for basic use.

Contains:
- `JitterBio` -- capture engine (port from biometrics.js)
- `JitterWAR` -- scoring engine (port from lab/jitter-box.js)
- `JitterPassport` -- localStorage passport manager
- `JitterCrypto` -- ECDSA P-256 (port from crypto-utils.js)
- `JitterUI` -- web component + indicator + passport card
- `JITTEr` -- public API (init, attach, status)

### 2. `sdk/demo.html` -- INTEGRATION DEMO
Shows the widget working on a mock review form.
This is what you show WGH, what you screenshot for Bri.

### 3. `sdk/react/JitterBox.jsx` -- REACT COMPONENT
```jsx
import { JitterBox } from '@jitter/react'
<JitterBox onBadge={(b) => setBadge(b)} minChars={50} />
```

### 4. Tests: `tests/widget.spec.js`
Playwright tests for the widget behavior.

---

## Integration API

### Script tag (zero config):
```html
<script src="https://cdn.jitter.so/v1/widget.js"></script>
<!-- Done. Auto-attaches to all form textareas. -->
```

### With config:
```html
<script src="widget.js"></script>
<script>
JITTEr.init({
  target: '#review-body',
  minChars: 50,
  onBadge: function(result) {
    // { war, classification, purity, session, passport }
  },
  onBot: function(result) {
    console.warn('Bot detected:', result.war)
  }
})
</script>
```

### React:
```jsx
<JitterBox
  minChars={50}
  placeholder="Write your review..."
  onBadge={(b) => submitWithBadge(b)}
/>
```

### What the server receives (hidden field `jitter_badge`):
```json
{
  "version": "3.0.0",
  "timestamp": 1741000000000,
  "war": 7.2,
  "raw_war": 8.1,
  "time_cap": 0.92,
  "passport_days": 107,
  "classification": "verified",
  "flags": [],
  "purity": 98.4,
  "session": {
    "keystrokes": 847,
    "duration": 847,
    "wpm": 52,
    "human_chars": 891,
    "alien_chars": 18,
    "paste_events": 1,
    "weighted_purity": 0.984
  },
  "passport": {
    "sessions": 34,
    "age_days": 107,
    "career_purity": 0.94,
    "consistency_index": 87
  },
  "signature": "MEYCIQDx...",
  "chain": {
    "previous": "7b2c1d4e...",
    "fingerprint": "A3F9E2B1C4D0"
  }
}
```

---

## Known Gaps

1. **verify.html doesn't verify** -- calls badge decode but never calls `verifyBadge()`.
   Fix: 20 lines. Call `CryptoUtils.verifyBadge(payload, sig, pubKeyJwk)`.

2. **Suspicion score not in badges** -- calculated, never embedded.
   Fix: pull `passport.suspicionScore` in both content.js and writer.js exportBadge().

3. **Three badge formats** -- unify to v3.0 spec (this doc, "What the server receives").

4. **Time-weighted confidence** -- needs implementation in jitter-widget.js. Port to extension.

5. **Cross-user 61% false match** -- fixed in lab (added bigrams + per-key dwell).
   Extension still uses old 3-check system. Port jitter-box.js -> biometrics.js.

6. **Firebase placeholder** -- skip Firebase, target Supabase when Dan call done.

---

## Priority Order

1. Build `sdk/jitter-widget.js` to spec above (doesn't require Dan)
2. Build `sdk/demo.html` (screenshot-ready)
3. Fix `verify.html` -- call verifyBadge() (20 lines, makes everything real)
4. Port jitter-box.js engine -> extension (replaces biometrics.js)
5. Call Dan. IP in writing. (blocks WGH integration)
6. WGH integration (requires Dan call first)

---

## What "Done" Looks Like for the Widget

- [ ] Drop `<script src="widget.js">` on demo.html
- [ ] Type in the textarea -- see live purity dot and stats bar
- [ ] Submit -- badge appears inline (WAR score, tier, purity %)
- [ ] Click badge -- passport card modal opens
- [ ] Card shows session stats + career profile
- [ ] Badge contains valid ECDSA P-256 signature
- [ ] Hidden field `jitter_badge` present in form data on submit
- [ ] Paste a paragraph -- shows in stats, mild purity impact, not hard penalty
- [ ] New account: WAR capped at 0.35 even with perfect typing
- [ ] Second session same day: passport updates, WAR slightly higher

That's the MVP. Everything else is scope creep.

---

*Author: Denis Gingras | JITTEr provisional patents #63/994,858 + #63/997,498*
*Last updated: 2026-03-05*
