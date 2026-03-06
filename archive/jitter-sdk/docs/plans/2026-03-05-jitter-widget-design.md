# Jitter Widget SDK — Design Doc

**Date:** 2026-03-05
**Author:** Denis Gingras + Claude
**Status:** Approved

## What This Is

An embeddable JavaScript widget that captures typing biometrics and provides visible transparency badges for authored content. Not bot detection — content provenance. The value is in being seen.

**One-liner:** "Elon's checkmark but not useless."

## Philosophy

- Transparency, not suppression. Bot content is tagged, not hidden. The reader decides.
- Privacy by architecture. Raw keystrokes never leave the device. API receives aggregated statistical profiles (~500 bytes of numbers).
- The widget is the free wedge. The API is the product.

## Badge Taxonomy

| Badge | Meaning | Visual |
|-------|---------|--------|
| Human Verified | A real human typed this with their hands | Checkmark |
| Bot Detected | Automated input flagged | X mark |
| AI-Assisted | Human edited/verified AI-generated text | Mixed indicator |
| Building | Not enough sessions yet for confidence | Progress indicator |

Badges are visible to end users. That's the product.

## Integration (Site Owner)

### Script Tag (Any Site)
```html
<script src="https://cdn.jitter.dev/v1/jitter.min.js"></script>
<script>
  Jitter.init({ siteKey: 'site_xxx' })
  // Auto-attaches to all textareas, or:
  // Jitter.attach(document.getElementById('review-input'))
</script>
```

### On Form Submit
```javascript
const result = Jitter.score()
// { war: 0.92, classification: 'verified', session_token: 'tok_xxx' }
// Send session_token to your backend for server-side verification
```

### Server-Side Verification (Stripe Model)
```
POST https://api.jitter.dev/v1/sessions/verify
Authorization: Bearer sk_live_xxx
Body: { session_token: "tok_xxx" }

Response: {
  verified: true,
  confidence: 0.87,
  level: "high",
  passport_id: "jp_xxx",
  classification: "verified",
  flags: []
}
```

Two keys: `site_xxx` (public, in script tag) and `sk_live_xxx` (secret, server-side).

## Data Flow

```
User types in <textarea>
  → jitter.js captures timing biometrics locally
    (IKI, dwell, flight, bigrams, edit ratio, pause freq, mouse path)
    (NEVER captures text content)
  → On submit: scores locally (WAR — 9 weighted signals)
  → Sends aggregated profile stats to Jitter API (~500 bytes)
    (mean_iki, std_iki, mean_dwell, per_key_dwell, bigram_signatures)
    (NOT raw timestamps, NOT text, NOT content)
  → API merges into persistent passport (running weighted average)
  → API returns: { verified, confidence, level, passport_id }
  → Site displays badge to readers
```

## What Stays Local vs What Hits the Wire

| Local Only (Never Leaves Device) | Sent to API |
|----------------------------------|-------------|
| Raw keystroke timestamps | Aggregated means + std devs |
| Text content (what was typed) | WAR score + classification |
| Individual key events | Session hash (for replay detection) |
| Raw mouse positions | Mouse path linearity score |

## Architecture

### Package: `@jitter/widget`

```
jitter-sdk/
  src/
    core/
      jitter-box.js       ← Capture engine (extracted from WGH, zero deps)
      scorer.js            ← WAR scorer (9 signals)
    init.js               ← Jitter.init(), auto-attach, config
    api-client.js          ← POST to Jitter API on score()
    badge.js              ← Badge rendering (CSS-only, no framework)
  api/
    supabase/
      functions/
        session-create/    ← Edge Function: create session + merge passport
        session-verify/    ← Edge Function: verify session token
    schema.sql            ← jitter_profiles, jitter_samples, sites tables
  dist/
    jitter.min.js          ← Bundled for CDN (<10KB gzipped)
  examples/
    vanilla.html           ← Drop-in demo
    react.jsx             ← React integration
  tests/
    core.test.js           ← Unit tests for capture + scoring
    api.test.js            ← API integration tests
  package.json
  CLAUDE.md
  README.md
```

### Key Decisions

1. **Zero dependencies.** The core is vanilla JS using `var` for max compat. No build step required for script tag usage.
2. **Supabase Edge Functions for MVP API.** Free tier, already have the account. Swap to dedicated infra when there's revenue.
3. **Two scoring paths:** Local WAR score (instant, client-side) + API passport merge (persistent, server-verified).
4. **Badge rendering is CSS-only.** Injected via shadow DOM so it doesn't conflict with host site styles.

### API Schema (Supabase)

```sql
-- Sites registered with Jitter
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT UNIQUE NOT NULL,      -- public key (site_xxx)
  secret_key TEXT UNIQUE NOT NULL,    -- server key (sk_live_xxx)
  domain TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Reuse existing jitter_profiles + jitter_samples from WGH schema
-- Add site_id foreign key to track which site the session came from
```

## Time-Weighted Confidence (Key Innovation)

New accounts get a low confidence ceiling regardless of biometric quality. The longer and more consistent the passport, the tighter the tolerance bands. You can't fake time.

```
confidence_ceiling = min(1.0, base_score * time_multiplier)

time_multiplier:
  < 7 days:   0.4  (max confidence: 0.4)
  7-30 days:  0.6
  30-90 days: 0.8
  90-180 days: 0.95
  180+ days:  1.0
```

A bot farm creating accounts today can't reach "high" confidence for 90 days — and only if every session is biometrically consistent with circadian drift patterns.

## Roadmap

| Phase | What | When |
|-------|------|------|
| 1 | Extract jitter-box.js, build init wrapper, ship with WGH | Now |
| 2 | Supabase Edge Functions for session create/verify | Week 2 |
| 3 | Badge rendering + shadow DOM | Week 3 |
| 4 | npm publish + CDN + docs site | Week 4 |
| 5 | WGH switches from local import to SDK script tag | After stable |

## What This Is NOT

- Not bot detection (we show, not block)
- Not authentication (we verify humanness, not identity login)
- Not a walled garden (portable passport across sites)
- Not surveillance (we see HOW you type, never WHAT you type)

## Competitive Position

Every competitor hides their work. reCAPTCHA, Turnstile, BioCatch — invisible by design. Their value prop is "stop the bad thing" behind the curtain.

Jitter's value is in being seen. The badge next to a review saying "human wrote this" serves the reader, not the platform. Transparency as a product. No incumbent does this because they all serve the site, not the end user.
