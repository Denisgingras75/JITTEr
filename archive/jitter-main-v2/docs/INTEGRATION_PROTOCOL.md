# JITTEr Integration Protocol
### Inertia-Free Human Verification

**Design principle:** A developer should be able to see JITTEr working on their page in under 3 minutes, with zero account creation, zero credit card, and zero backend changes.

The first impression IS the sales pitch.

---

## The Onramp

```
Level 0 — Sandbox (0 minutes, no account)
  One script tag. Type something. See a badge.
  No key required. Works anywhere, right now.

Level 1 — Free Tier (~2 minutes)
  Enter email. Get a real API key.
  1,000 verifications/month. No card.

Level 2 — Production (~10 minutes)
  Add server-side verify call.
  Replace sandbox key with live key.
  Ship it.

Level 3 — Passport Network (passive)
  Users install the Chrome extension.
  Their passport builds over time.
  Your trust signals get stronger automatically.
```

Each level works independently. You don't need Level 3 for Level 1 to be valuable. You don't need Level 2 to see Level 0 work. **Nothing gates the next step.**

---

## Level 0 — Sandbox (Zero Friction)

No account. No key. Just paste this into any HTML page:

```html
<script src="https://cdn.jitter.so/widget.js"></script>
```

That's it. The widget auto-attaches to every `<textarea>` on the page. Type in any text box and a small badge appears in the corner of the field when enough typing data is collected.

```
┌─────────────────────────────────────────┐
│ Write your review...                    │
│                                         │
│                                         │
│                         ⚡ Verified      │  ← badge auto-appears
└─────────────────────────────────────────┘
```

**Sandbox results are logged at jitter.so/sandbox** — a public, session-based dashboard showing the last 100 badges minted from your IP. No signup required. Retention: 24 hours.

### What the badge contains (sandbox)

```json
{
  "valid": true,
  "bot_detected": false,
  "suspicion_score": 14,
  "typed_chars": 203,
  "pasted_chars": 0,
  "session_duration_sec": 47,
  "passport_age_days": null,
  "env": "sandbox"
}
```

**Sandbox limitations:**
- Results not persisted beyond 24 hours
- No passport lookup (extension not required)
- Rate-limited to 100 verifications/session
- Marked `"env": "sandbox"` — never use in production

---

## Level 1 — Free API Key

When you've seen enough in sandbox, go to **jitter.so/signup**.

- Enter email
- Get key: `pk_live_abc1xxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Swap it in:

```html
<script src="https://cdn.jitter.so/widget.js"></script>
<script>JITTEr.init({ apiKey: 'pk_live_abc1xxxx' })</script>
```

That's the entire client-side integration. The widget handles everything else.

**Free tier:** 1,000 verifications/month. No card. Real data. Real dashboard.

---

## Level 2 — Server-Side Verify (Production)

Client-side only is fine for displaying badges to users. But for trust decisions (weighting votes, flagging content) you need server-side verification. A determined bad actor could fake client-side results.

**The pattern:**

```
1. Widget runs → mints badge → passes it to your form on submit
2. Your server receives form + badge
3. Your server POSTs badge to JITTEr API
4. JITTEr returns { valid, bot_detected, suspicion_score }
5. You decide what to do with that information
```

**Step 1: Receive the badge in your form**

The widget automatically injects a hidden field `jitter-badge` into the nearest `<form>`. No code needed.

```html
<!-- JITTEr injects this automatically on badge mint -->
<input type="hidden" name="jitter_badge" value="eyJ2ZXJzaW9uIjoiMi4wIi..." />
```

Or handle it in JS:

```javascript
document.querySelector('jitter-widget').addEventListener('badge', (e) => {
  const badge = e.detail.badge  // base64 badge string
  // attach to your form submit, store it, pass it to your server
})
```

**Step 2: Verify server-side**

```javascript
// Node.js / any server
async function verifyJitter(badgeBase64) {
  const res = await fetch('https://api.jitter.so/v1/verify', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.JITTER_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ badge: badgeBase64 }),
  })
  return res.json()
}

// In your review/comment handler:
const result = await verifyJitter(req.body.jitter_badge)

// { valid, bot_detected, suspicion_score, passport_age_days }
```

**Step 3: Act on the result**

You decide. JITTEr doesn't block anything. It gives you signal.

```javascript
if (result.bot_detected) {
  // Option A: reject silently (low friction, but loses data)
  // Option B: flag for moderation queue (recommended)
  // Option C: publish with a "Low confidence" tag (transparent)
  review.trust_level = 'unverified'
} else {
  review.trust_level = result.passport_age_days > 30 ? 'passport' : 'session'
}
// Store trust_level with the review. Display badge to users.
```

**The philosophy: reveal, don't block.**

A review tagged "⚠ Unverified · suspicious pattern" does more damage to a bad actor than a silently rejected review. It's public. It's transparent. It lets your users self-sort. And it protects you from "you deleted my review" complaints.

---

## Widget Configuration Reference

All options are optional. Zero config required in sandbox.

```html
<script src="https://cdn.jitter.so/widget.js"></script>
<script>
JITTEr.init({
  apiKey: 'pk_live_abc1xxxx',  // required for Level 1+

  // Which elements to monitor (default: all textareas)
  target: '#review-body',      // CSS selector, or HTMLElement

  // Minimum chars before badge can mint (default: 50)
  minChars: 100,

  // Show the badge inline in the field? (default: true)
  showBadge: true,

  // Badge position (default: 'bottom-right')
  badgePosition: 'bottom-right',  // 'bottom-left' | 'none'

  // Callback when badge mints
  onBadge: function(result) {
    console.log('Badge:', result)
    // { valid, bot_detected, suspicion_score, badge }
  },

  // Callback if bot pattern detected (fires before form submit)
  onBot: function(result) {
    console.warn('Bot pattern detected:', result.suspicion_score)
  },
})
</script>
```

**React:**

```jsx
// npm install @jitter/react
import { JitterWidget } from '@jitter/react'

<JitterWidget
  apiKey="pk_live_abc1xxxx"
  minChars={100}
  onBadge={(result) => setBadge(result.badge)}
  onBot={(result) => console.warn('Bot score:', result.suspicion_score)}
/>
```

**Vue / Angular / Svelte:** use the vanilla JS widget (`JITTEr.init()`). No framework-specific packages needed.

---

## Trust Levels — What to Store and Display

Store `trust_level` with every piece of user content. Display it as a badge.

| `trust_level` | What it means | Display |
|---|---|---|
| `passport` | Typed live + passport ≥30 days | ⚡ Jitter Verified |
| `session` | Typed live, no passport | ⚡ Session Verified |
| `unverified` | Submitted without JITTEr or bot-flagged | ⚠ Unverified |
| `none` | No JITTEr data at all | — (no badge) |

**Weighting (if you use numerical ratings):**

```
passport    → weight 1.0   (full trust)
session     → weight 0.7   (typed it, no history)
unverified  → weight 0.3   (low confidence)
none        → weight 0.3   (same as unverified)
```

These are starting values. Tune based on your bot rate.

---

## WGH Integration (Reference Implementation)

WGH is the first platform using JITTEr. This is exactly how it works in production.

**What changed:**

1. Review textarea in the vote modal → wrapped in JITTEr widget
2. Badge minted on submit → passed to `votesApi.submitVote()`
3. `trust_level` stored in `votes` table alongside the text review
4. Review feed shows badge next to each written review
5. Consensus score weights numerical ratings by `trust_level`

**What didn't change:**

- The Bite Slider (1-10 rating) — unchanged, no friction added
- Written reviews are still optional — verified reviews just rank higher
- Mobile experience — widget works on mobile Safari/Chrome, no extension required

**The incentive structure (not a wall):**

> "Type a review and it gets a trust badge. Verified reviews show first."

No mandatory fields. No blocks. Just a visible signal that makes authentic reviews more prominent and makes fake reviews easier to spot.

---

## API Reference

### `POST /v1/verify`

**Authentication:** `Authorization: Bearer sk_live_xxxx` (secret key, server-side only)

**Request:**
```json
{
  "badge": "eyJ2ZXJzaW9uIjoiMi4wIi..."
}
```

**Response:**
```json
{
  "valid": true,
  "bot_detected": false,
  "suspicion_score": 14,
  "passport_age_days": 107,
  "level": "Advanced",
  "signature_valid": true
}
```

**Error responses:**
```json
{ "error": "Invalid or revoked API key" }       // 401
{ "error": "Missing badge in request body" }    // 400
{ "error": "Badge signature invalid" }          // 422
```

**Rate limits:** 100 req/sec on Starter, 1,000 req/sec on Business.

---

## Self-Serve Onboarding Sequence

This is the exact sequence a platform customer sees from zero to production:

```
Day 0 — Sandbox
  Developer finds JITTEr (blog post, HN, WGH badge link)
  Pastes one script tag
  Types in a textarea
  Sees badge appear
  Clicks badge → sees sandbox dashboard
  "Ok, this works."

Day 0 — Free Signup (2 minutes later)
  Goes to jitter.so
  Enters email + company name
  Gets API key immediately (no card, no approval)
  Swaps sandbox → live key
  Verifications start appearing in dashboard

Day 1-7 — Integration
  Adds server-side verify call
  Stores trust_level with content
  Shows badge to users
  Sees bot_detected events in dashboard

Day 14 — Upgrade Trigger
  Usage approaches 1,000/month limit
  Dashboard shows: "You've used 847 of 1,000 free verifications"
  Upgrade prompt: "Starter — $49/mo — 50,000 verifications"
  Clicks upgrade → email to Denis → handled in 24 hours

Day 30+ — Retention
  Dashboard shows "847 bots revealed this month"
  That number is shared internally ("look what we're catching")
  Switching cost is now real: trust_level is stored in their DB
  Jitter Verified badges appear across their platform
  Their users ask about it
  They're not going anywhere
```

---

## What Makes This Frictionless (Design Decisions)

**1. Public sandbox key — no signup gate**
The biggest friction in any B2B tool is "I have to create an account just to see if it works." JITTEr's answer: don't make them. Let the widget work on any page instantly. The signup happens after they've already seen the value.

**2. Auto-attach to textareas**
Zero configuration in sandbox. The script tag is enough. The widget finds text fields and monitors them automatically. The developer doesn't have to do anything else.

**3. Hidden field injection**
The widget auto-injects `<input type="hidden" name="jitter_badge">` into the parent form. Most backends receive it automatically without any frontend changes. No custom event handlers required.

**4. Reveal not block**
Platforms don't have to make blocking decisions. They just store `trust_level` and display it. The system works even if they do nothing with the bot signal — the badge still appears, users still see it. The value is visible immediately.

**5. Email upgrade (no Stripe at MVP)**
"Contact us" mailto link for upgrades. Looks scrappy but actually signals high-touch, which enterprise buyers prefer. Add Stripe self-serve in V2 when the pattern is proven.

**6. The sandbox dashboard at jitter.so/sandbox**
A live view of your session's verifications. No account needed. Shows: badge count, bot rate, suspicion scores. Makes the abstract tangible in 30 seconds. This page is the sales page.

---

## Security Notes for Integrators

- **Never use your live API key on the client side.** Use `pk_live_` on the frontend (public, read-only), `sk_live_` on your server (secret, never expose).
- **Always verify server-side for trust decisions.** Client-side badges can be forged by a determined actor.
- **The badge signature validates the ECDSA chain** — the verify API checks this. A forged badge returns `"signature_valid": false`.
- **JITTEr never sees the content of what was typed.** Timing metadata only. You don't need to worry about privacy compliance for the widget itself.
- **GDPR/CCPA:** The badge contains no PII. Typing metadata is anonymous. You still need to handle consent for your own review/comment system — JITTEr doesn't change that calculus.

---

*© 2025-2026 Denis Gingras. All Rights Reserved.*
*JITTEr is a trademark of Denis Gingras.*
