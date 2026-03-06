# Jitter API Design
## Jitter Protocol — Patent Filing Research
**Date:** 2026-03-02
**Purpose:** API architecture reference — endpoints, response formats, webhooks, developer experience
**Classification:** Confidential IP Research

---

## 1. Design Philosophy: Stripe-Like Developer Experience

The Jitter API is designed around one north star: a developer who has never heard of behavioral biometrics should be able to integrate Jitter in under 30 minutes.

Stripe established the bar for developer-first API design. The principles:

1. **Predictable resource structure.** Every resource is a noun. Every action is a verb. Responses are consistent.
2. **Immediate feedback.** Errors are descriptive. The response tells you what went wrong and how to fix it.
3. **Test mode first.** Developers experiment with test keys before touching production. Mistakes cost nothing.
4. **No surprises in production.** What works in test works live.
5. **Great documentation is part of the product.** Not an afterthought.

Jitter adopts all five. The API surface is intentionally small — five core endpoints cover 95% of integration needs. Everything else is optional enrichment.

---

## 2. Authentication

All API requests use HTTP Bearer token authentication.

```
Authorization: Bearer jtr_live_sk_9f3c2da...
```

Two key types:

| Key Type | Prefix | Use |
|---|---|---|
| Site key (public) | `jtr_live_` | Embedded in front-end HTML — identifies the site, safe to expose |
| Secret key (private) | `jtr_live_sk_` | Server-side only — never expose in front-end code |
| Test site key | `jtr_test_` | Front-end test key, generates simulated sessions |
| Test secret key | `jtr_test_sk_` | Server-side test key, returns configurable mock responses |

---

## 3. Core Endpoints

### 3.1 POST /v1/verify

The primary endpoint. Called server-side after form submission to validate a session token.

**Request:**

```bash
POST https://api.jitter.io/v1/verify
Authorization: Bearer jtr_live_sk_9f3c2da...
Content-Type: application/json
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJzaXRlX2tleSI6Imp0cl9saXZlX2FiYzEyM3h5eiIsImxpdmVuZXNzIjowLjkyLCJpZGVudGl0eSI6MC44OSwiand0Ijp7InNjb3JlIjowLjg3fX0.HMAC",
  "site_key": "jtr_live_abc123xyz"
}
```

**Response (200 OK):**

```json
{
  "id": "ver_01HQXYZ789ABC",
  "valid": true,
  "jitter_score": 0.87,
  "classification": "human",
  "checkmark": true,
  "checkmark_tier": "verified",
  "liveness": {
    "score": 0.92,
    "classification": "human",
    "signals_flagged": []
  },
  "identity": {
    "score": 0.89,
    "passport_weight": 0.72,
    "passport_phase": "mature",
    "passport_status": "active",
    "sessions_accumulated": 24
  },
  "metadata": {
    "keystrokes_analyzed": 287,
    "session_duration_ms": 45200,
    "scoring_version": "1.0.0"
  },
  "token_id": "tok_v1_9f3c2d...",
  "created_at": "2026-03-02T14:22:00Z",
  "expires_at": "2026-03-02T14:37:00Z"
}
```

**Response (bot detected):**

```json
{
  "id": "ver_01HQXYZ789DEF",
  "valid": true,
  "jitter_score": 0.11,
  "classification": "bot",
  "checkmark": false,
  "checkmark_tier": "unverified",
  "liveness": {
    "score": 0.09,
    "classification": "bot",
    "signals_flagged": ["subms_fraction", "error_dynamics", "entropy_range"]
  },
  "identity": {
    "score": null,
    "passport_weight": 0.0,
    "passport_phase": null,
    "passport_status": null,
    "sessions_accumulated": 0
  },
  "metadata": {
    "keystrokes_analyzed": 142,
    "session_duration_ms": 2100,
    "scoring_version": "1.0.0"
  },
  "token_id": "tok_v1_8b2e1c...",
  "created_at": "2026-03-02T14:22:05Z",
  "expires_at": "2026-03-02T14:37:05Z"
}
```

**Error responses:**

```json
// 400 — Malformed token
{
  "error": {
    "code": "token_invalid",
    "message": "The token could not be parsed. Ensure you are passing the jitter_token field from the form submission.",
    "docs": "https://docs.jitter.io/errors/token_invalid"
  }
}

// 401 — Wrong secret key
{
  "error": {
    "code": "authentication_failed",
    "message": "The secret key does not match the site key in the token.",
    "docs": "https://docs.jitter.io/errors/authentication_failed"
  }
}

// 410 — Token expired (>15 minutes since generation)
{
  "error": {
    "code": "token_expired",
    "message": "This token was generated 23 minutes ago. Tokens expire after 15 minutes.",
    "docs": "https://docs.jitter.io/errors/token_expired"
  }
}
```

---

### 3.2 GET /v1/passport/{user_fingerprint}

Retrieve the current passport status for a user on this site. Useful for dashboards, moderation tools, and progressive trust UI.

**Request:**

```bash
GET https://api.jitter.io/v1/passport/fp_8a3d2e9f1b
Authorization: Bearer jtr_live_sk_9f3c2da...
```

**Response (200 OK):**

```json
{
  "user_fingerprint": "fp_8a3d2e9f1b",
  "passport_phase": "mature",
  "passport_status": "active",
  "passport_weight": 0.72,
  "checkmark_tier": "verified",
  "sessions_accumulated": 24,
  "sessions_verified": 22,
  "sessions_contributing": 2,
  "passport_age_days": 62,
  "created_at": "2025-12-31T09:00:00Z",
  "last_session_at": "2026-02-28T14:05:00Z",
  "anomaly_level": "none",
  "karma_gate_cleared": true,
  "karma_gate_threshold": 3
}
```

**Note on user fingerprint:** The `user_fingerprint` is a stable, site-scoped identifier derived from passport data. It is not a persistent cross-site identifier — it is opaque to Jitter and meaningful only within this site's namespace. Sites may store it alongside their own user records for passport status lookups.

---

### 3.3 POST /v1/enroll

Explicitly enroll a session as a passport anchor. Used when a site has out-of-band identity confirmation (e.g., email verification, phone OTP, KYC) and wants to mark a session as a high-trust enrollment sample.

Enrollment sessions receive a permanent anchor weight in the passport profile — they are never discarded during drift updates.

**Request:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "site_key": "jtr_live_abc123xyz",
  "enrollment_context": {
    "identity_verified_method": "email_otp",
    "verified_at": "2026-03-02T14:00:00Z"
  }
}
```

**Response:**

```json
{
  "enrolled": true,
  "passport_phase": "adolescent",
  "anchor_sample_added": true,
  "sessions_accumulated": 3,
  "message": "Session added as enrollment anchor. Karma gate will clear after 0 additional verified sessions."
}
```

---

### 3.4 POST /v1/webhooks

Register a webhook endpoint to receive Jitter events. Jitter pushes events to your server rather than requiring polling.

**Request:**

```json
{
  "url": "https://yourdomain.com/webhooks/jitter",
  "events": [
    "session.verified",
    "passport.tier_changed",
    "anomaly.detected",
    "passport.suspended"
  ],
  "secret": "whsec_your_webhook_signing_secret"
}
```

**Response:**

```json
{
  "webhook_id": "wh_01HQXYZ789",
  "url": "https://yourdomain.com/webhooks/jitter",
  "events": ["session.verified", "passport.tier_changed", "anomaly.detected", "passport.suspended"],
  "status": "active",
  "created_at": "2026-03-02T14:00:00Z"
}
```

---

### 3.5 GET /v1/verify/{verification_id}

Retrieve a prior verification result by ID. Useful for audit trails and moderation review.

```bash
GET https://api.jitter.io/v1/verify/ver_01HQXYZ789ABC
Authorization: Bearer jtr_live_sk_9f3c2da...
```

Returns the same structure as the original verify response. Results are retained for 90 days.

---

## 4. Confidence Score Breakdown

Every verify response returns three layered scores. Understanding how they combine is essential for integration decisions.

### Score Components

| Score | Range | Source | Meaning |
|---|---|---|---|
| `liveness_score` | 0.0–1.0 | Current session only | Is a real human typing right now? |
| `identity_score` | 0.0–1.0 | Current session vs. passport profile | Is this the same human as the passport holder? |
| `passport_weight` | 0.0–0.95 | Passport history | How much can we trust the passport's history? |
| `jitter_score` | 0.0–0.95 | Combined | Final composite score used for content decisions |

### Combination Formula

```
jitter_score = min(liveness_score, identity_score) * passport_weight
```

### Score Interpretation Guide

| jitter_score | checkmark_tier | Recommended Action |
|---|---|---|
| < 0.20 | `unverified` | Strong bot signal. Tag content, hold for review or silently discard. |
| 0.20–0.40 | `unverified` | Suspicious. Surface with "unverified" label or hold. |
| 0.40–0.60 | `building` | Uncertain. Surface with "new contributor" label, monitor for patterns. |
| 0.60–0.85 | `verified` | Human, growing passport. Surface normally with green checkmark. |
| 0.85–0.95 | `established` | High-trust veteran passport. Surface with gold checkmark, optional priority treatment. |

### No Passport (New User)

When a user has no prior passport history (Infant tier, 1 session), the `identity_score` is null and `passport_weight` is near 0. The `jitter_score` will be low even if the `liveness_score` is high — this is intentional. First-session content goes through the karma gate. This is not a bug; it is the design.

Sites that need first-session content to surface (e.g., a live chat, a time-sensitive review) can configure `karma-gate="1"` and surface based on `liveness_score` directly rather than the composite `jitter_score`.

---

## 5. Webhook Events

### 5.1 session.verified

Fires when a session token is successfully verified. The most common event. Use to update content records with the Jitter verification result.

```json
{
  "event": "session.verified",
  "id": "evt_01HQXYZ123",
  "created_at": "2026-03-02T14:22:00Z",
  "data": {
    "verification_id": "ver_01HQXYZ789ABC",
    "user_fingerprint": "fp_8a3d2e9f1b",
    "jitter_score": 0.87,
    "classification": "human",
    "checkmark_tier": "verified",
    "passport_phase": "mature"
  }
}
```

### 5.2 passport.tier_changed

Fires when a user's passport advances to a new tier. Use to update user trust levels in your database, remove "new contributor" labels, or surface previously gated content.

```json
{
  "event": "passport.tier_changed",
  "id": "evt_01HQXYZ456",
  "created_at": "2026-03-02T14:22:00Z",
  "data": {
    "user_fingerprint": "fp_8a3d2e9f1b",
    "previous_tier": "adolescent",
    "new_tier": "mature",
    "sessions_accumulated": 10,
    "passport_age_days": 31,
    "new_passport_weight": 0.53
  }
}
```

### 5.3 anomaly.detected

Fires when a Bronny Test threshold is breached. Use to flag the user's recent submissions for moderation review, send a notification to your trust and safety team, or temporarily apply stricter content filtering.

```json
{
  "event": "anomaly.detected",
  "id": "evt_01HQXYZ789",
  "created_at": "2026-03-02T14:30:00Z",
  "data": {
    "user_fingerprint": "fp_8a3d2e9f1b",
    "anomaly_level": "orange",
    "signals_flagged_count": 4,
    "passport_status": "active",
    "new_passport_weight": 0.44,
    "recommended_action": "review_recent_submissions"
  }
}
```

### 5.4 passport.suspended

Fires when a passport is automatically suspended due to a Red-level anomaly or replay detection. Use to hold all pending submissions from this user and flag prior recent submissions for moderation.

```json
{
  "event": "passport.suspended",
  "id": "evt_01HQXYZ999",
  "created_at": "2026-03-02T14:35:00Z",
  "data": {
    "user_fingerprint": "fp_8a3d2e9f1b",
    "suspension_reason": "anomaly_threshold_red",
    "passport_status": "suspended",
    "passport_weight": 0.0,
    "sessions_flagged_count": 1,
    "recommended_action": "hold_all_submissions_pending_review"
  }
}
```

### Webhook Signature Verification

Every webhook POST includes a `Jitter-Signature` header:

```
Jitter-Signature: t=1740920520,v1=sha256=abc123def456...
```

Verify using your webhook secret:

```javascript
const computedSig = crypto
  .createHmac('sha256', process.env.JITTER_WEBHOOK_SECRET)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex');

if (computedSig !== signature) {
  return res.status(400).send('Invalid signature');
}
```

---

## 6. Rate Limiting and Abuse Prevention

### Per-Site Rate Limits

| Endpoint | Rate Limit | Burst |
|---|---|---|
| POST /v1/verify | 1,000 req/min | 5,000 req/min for up to 60s |
| GET /v1/passport/{fp} | 500 req/min | — |
| POST /v1/enroll | 100 req/min | — |
| GET /v1/verify/{id} | 500 req/min | — |

Rate limit headers are returned on every response:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1740920580
```

### Token Abuse Prevention

Each session token is single-use. A token that has been verified cannot be replayed. Attempted replay returns:

```json
{
  "error": {
    "code": "token_already_used",
    "message": "This token has already been verified. Each token can only be used once.",
    "first_verified_at": "2026-03-02T14:22:00Z",
    "docs": "https://docs.jitter.io/errors/token_already_used"
  }
}
```

---

## 7. SDK Availability

### 7.1 JavaScript Recorder (Client-Side)

The primary SDK. Installed via CDN or npm.

**CDN (recommended for most integrations):**
```html
<script src="https://cdn.jitter.io/v1/recorder.js" async></script>
```

**npm (for framework integrations):**
```bash
npm install @jitter-io/recorder
```

**React component wrapper:**
```jsx
import { JitterInput } from '@jitter-io/react';

<JitterInput
  siteKey="jtr_live_abc123xyz"
  name="review"
  placeholder="Write your review..."
  onScoreChange={(score) => setLiveScore(score)}
/>
```

**Vue component wrapper:**
```bash
npm install @jitter-io/vue
```

```html
<jitter-input
  :site-key="siteKey"
  name="review"
  @score-change="handleScoreChange"
/>
```

### 7.2 Server-Side SDKs

| Language | Package | Status |
|---|---|---|
| Node.js | `@jitter-io/node` | v1 — GA |
| Python | `jitter-python` | v1 — GA |
| Ruby | `jitter-ruby` | v1 — GA |
| PHP | `jitter/jitter-php` | v1 — GA |
| Go | `github.com/jitter-io/jitter-go` | v1 — GA |

**Node.js example:**
```javascript
import Jitter from '@jitter-io/node';

const jitter = new Jitter(process.env.JITTER_SECRET_KEY);

const result = await jitter.verify({
  token: req.body.jitter_token,
  siteKey: 'jtr_live_abc123xyz',
});

if (result.classification === 'bot') {
  // handle bot
}
```

---

## 8. Pricing Model

### Philosophy

Developers should be able to build and test for free. Production pricing should scale with value delivered — sites that process more content pay more, but the unit cost goes down as volume grows.

### Tiers

| Tier | Monthly Verifications | Price | Target |
|---|---|---|---|
| **Developer** | 500/month | Free forever | Building, testing, side projects |
| **Starter** | 10,000/month | $29/month | Small review platforms, early-stage products |
| **Growth** | 100,000/month | $199/month | Mid-size platforms, 10K+ active users |
| **Scale** | 1,000,000/month | $999/month | Large platforms, enterprise |
| **Enterprise** | Unlimited | Custom | >1M/month, SLA, dedicated support |

**Passport storage:** Included in all tiers. No per-user or per-passport fee.

**Webhooks:** Included in all tiers. No per-event charge.

**Overages:** Billed at $0.003 per verification above tier limit (Starter/Growth) or $0.001 per verification (Scale).

### Comparison Context

TypingDNA's Pro tier charges approximately $0.20/user/month for identity verification. Jitter charges per verification event, not per user — making it significantly more economical for high-volume, low-identity-depth use cases like review platforms.

At 10,000 verifications/month:
- TypingDNA equivalent: $0.20 × (users) — cost depends on enrolled user count, not verification count
- Jitter: $29/month flat (Starter tier)

---

## 9. Comparison to TypingDNA API

TypingDNA is the closest existing API in the market. The differences matter for patent positioning and for developer adoption messaging.

| Dimension | TypingDNA | Jitter |
|---|---|---|
| Signal layer | Software (JS events, dwell/flight) | Software (JS events) + hardware physics (v2) |
| Primary use case | Identity authentication (login replacement) | Content provenance (human-typed authorship) |
| Fixed text requirement | SameText pattern requires fixed phrase; AnyText requires 140+ chars | Free text, no minimum character constraint on content |
| Output | Match score (identity) | Composite score: liveness + identity + passport weight |
| Cross-session accumulation | Profile matching across sessions (identity) | Passport tiers with karma gate (trust accumulation) |
| Content provenance | Not a feature | Core feature — checkmark system for surfaced content |
| Reveal-don't-block | Not a feature | Core feature — tag bots visibly, don't hard-block |
| Embeddable element | JS library (developer-embedded recorder) | Web Component custom element (`<jitter-input>`) |
| Developer pricing | $0.20/user/month (Pro tier) | $0.003/verification (overages); $29/month flat (Starter) |
| Company status | Independent, $8.6M raised, Gartner-recognized | Pre-launch, patent filing stage |
| API style | RESTful, standard JSON | RESTful, Stripe-inspired, more verbose responses |
| Webhook support | Not publicly documented | First-class feature |
| Global passport | No | v2 roadmap (opt-in, cross-site) |
| EU AI Act readiness | Not positioned as compliance tool | Positioned for Article 50 compliance (August 2026) |

**The fundamental difference:** TypingDNA answers "is this person who they say they are?" for login security. Jitter answers "was this content typed by a real human, and is it the same human who has been here before?" for content trust. These are different questions, different use cases, and different markets — which is why six patent differentiators exist where neither product anticipates the other.

---

## 10. Developer Experience Details

### Test Mode

With test keys (`jtr_test_` prefix), the recorder runs normally but session tokens are flagged as test tokens. The verify API returns configurable mock responses:

```bash
POST https://api.jitter.io/v1/verify
Authorization: Bearer jtr_test_sk_...

# To simulate a verified human:
{ "token": "...", "site_key": "jtr_test_...", "_simulate": "human_verified" }

# To simulate a bot:
{ "token": "...", "site_key": "jtr_test_...", "_simulate": "bot_detected" }

# To simulate a new passport (karma gate active):
{ "token": "...", "site_key": "jtr_test_...", "_simulate": "infant_passport" }
```

Test mode data never affects production passport profiles. Test verifications are free and unlimited.

### API Changelog and Versioning

API versions are date-based (`/v1/`, `/v2/`). Breaking changes require a new major version. Minor additions (new fields in responses) are non-breaking and added in-place. The changelog is machine-readable at `https://api.jitter.io/changelog.json`.

### Status Page

`https://status.jitter.io` — uptime, incident history, current latency percentiles. P99 scoring latency target is <100ms for the verify endpoint.

---

## Sources

- TypingDNA pricing: https://www.typingdna.com/pricing (dossier research, early 2026)
- TypingDNA API pattern types: integration/competitive-landscape.md §1 (TypingDNA)
- TypingDNA funding: $8.82M total; Series A January 2020 (dossier research)
- Jitter confidence scoring: algorithm/confidence-scoring.md §4.3 (Combined Output)
- Jitter passport weight formula: algorithm/confidence-scoring.md §4.3; integration/passport-system.md §5
- Jitter checkmark tiers: algorithm/confidence-scoring.md §8.2
- EU AI Act Article 50: enforcement August 2, 2026; penalties €15M or 3% worldwide turnover (dossier research)
- Jitter 6 differentiators: patent-conflict-analysis.md; dossier research summary
- Stripe API design principles: industry reference
