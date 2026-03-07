# Jitter SDK — Generic Widget Design

Date: 2026-03-07
Status: Approved
Builds on: 2026-03-05-jitter-widget-design.md (archived)

## Goal

Single JS file. Attaches silently to any textarea. Captures keystroke biometrics. On submit, returns WAR score + classification. Badge renders on the output side. Zero friction during typing.

## Architecture

Single file built from 4 source files via `build.js` concatenation:

```
jitter-box.js  (capture engine + WAR scorer)
badge.js       (Shadow DOM badge rendering)
init.js        (public API: init, attach, score, detach)
build.js       (concatenator → dist/jitter.min.js ~25KB)
```

`jitter-box.js` is the single source of truth for capture AND scoring. The Chrome extension's `biometrics.js` stays separate (extension-specific UI + chrome.storage concerns).

## Capture Engine

Port from `extension/src/biometrics.js` into `sdk/src/core/jitter-box.js`:

- `createSession()` — session state (flight times, dwell times, bigrams, etc.)
- `handleKeydown(session, key, ctrl, meta, alt)` — flight time, dwell start, bigrams, per-key tracking
- `handleKeyup(session, key, ctrl, meta, alt)` — dwell time completion
- `handlePaste(session, charCount)` — alien char tracking
- `handleMouseMove(session, x, y)` — path linearity
- `getProfile(session)` — aggregate stats from raw session data
- `analyzeLoki(session)` — flow/gap cognitive ratio, entropy, bot flag

New: `JitterBox.attach(el)` — hooks keydown/keyup/paste/mousemove on element, returns `{ score(), detach() }`. This is the glue `init.js` already expects.

## Public API

```js
// Integration
Jitter.init({ siteKey: 'wgh' })        // auto-attach to all textareas
Jitter.attach(element)                   // manual attach
Jitter.score(element)                    // score on submit
Jitter.detach(element)                   // cleanup
Jitter.createBadge(classification, opts) // render badge for review card

// score() returns:
{
  war: 0.72,
  raw_war: 0.78,
  classification: 'verified',  // 'verified' | 'building' | 'suspicious' | 'bot'
  flags: [],
  components: { ... },
  session_token: 'jtok_...',   // for future server-side verification
  reviewCount: 5,
  eligible: true               // meets verification threshold
}
```

## Verification Threshold

Two checks:

```
eligible = (review_count >= 3) AND (days_since_first_review >= 3)
```

localStorage keys:
- `jitter_review_count` — incremented on each `score()` call
- `jitter_first_review` — timestamp, set once on first `score()` call

Until eligible: `classification = 'building'`, badge shows "Building Trust" regardless of WAR score.

After eligible: classification based on WAR score:
- Hard floor triggered → 'bot'
- WAR >= 0.80 → 'verified'
- WAR >= 0.50 → 'suspicious'
- WAR < 0.50 → 'bot'

Economics: bot farm needs 3 real calendar days minimum per fake account. Can't buy time in bulk.

## Data Flow

```
1. Site adds <script src="jitter.min.js"></script>
   Jitter.init({ siteKey: 'wgh' })

2. User focuses textarea → auto-attach via MutationObserver
   Capture runs silently. Zero UI during typing.

3. On form submit → site calls Jitter.score(el)
   Returns WAR score + classification + session_token

4. Site renders badge on review card (output side):
   Jitter.createBadge(result.classification)
```

## Privacy

- Raw keystrokes never leave the device
- `score()` returns aggregated stats only (means, std devs, ratios)
- Text content is never captured
- Only WAR score + badge hash go to server (Phase 2)
- `session_token` is base64-encoded summary, not raw telemetry

## Files to Change

1. `sdk/src/core/jitter-box.js` — Add capture engine (port from biometrics.js)
2. `sdk/src/init.js` — Wire `JitterBox.attach()`, add verification threshold logic
3. `sdk/src/badge.js` — Already done, no changes needed
4. `sdk/build.js` — Already done, no changes needed
5. `tests/sdk.test.js` — New test file for SDK integration

## Out of Scope (Phase 2)

- Attestation server (Supabase Edge Functions)
- Server-side session verification endpoint
- npm publish / CDN hosting
- API client
- React/framework wrappers
