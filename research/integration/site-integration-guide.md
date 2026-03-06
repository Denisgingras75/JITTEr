# Site Integration Guide: Embedding the Jitter Protocol
## Jitter Protocol — Patent Filing Research
**Date:** 2026-03-02
**Purpose:** Integration architecture reference — how sites embed Jitter, API contract, drop-in model
**Classification:** Confidential IP Research

---

## 1. Design Philosophy: Build a Widget, Not an App

Jitter's integration model is borrowed from two proven playbooks:

**Stripe:** A payment form that any developer can drop into any website with a `<script>` tag and two lines of configuration. The complexity — PCI compliance, fraud detection, card tokenization — is invisible. The developer sees a clean API.

**reCAPTCHA:** A widget that replaces a form element. One script tag. One HTML element. A server-side token check. Done.

Jitter follows the same pattern. The complexity — keystroke capture, on-device feature extraction, passport weight computation, confidence scoring — is invisible to the embedding site. The developer sees:

1. A `<script>` tag
2. A `<jitter-input>` element in place of their `<textarea>`
3. A server-side API call to verify the session token

That is the entire integration surface.

---

## 2. The Drop-In Replacement Model

### 2.1 From `<textarea>` to `<jitter-input>`

In the simplest case, the integration is a single element swap:

**Before:**
```html
<textarea
  name="review"
  placeholder="Write your review..."
  rows="4"
></textarea>
```

**After:**
```html
<script src="https://cdn.jitter.io/v1/recorder.js" async></script>

<jitter-input
  site-key="jtr_live_abc123xyz"
  name="review"
  placeholder="Write your review..."
  rows="4"
></jitter-input>
```

The `<jitter-input>` custom element renders identically to a `<textarea>` — same DOM form behavior, same CSS styling surface, same `name` attribute for form submission. From the user's perspective, nothing changes. From the browser's perspective, it is a Web Components custom element that wraps a native `<textarea>` internally.

### 2.2 What the Custom Element Does

On mount, `<jitter-input>` initializes the Jitter Recorder, which:

1. Attaches `keydown` and `keyup` event listeners to the internal `<textarea>`
2. Records keystroke events using `performance.now()` timestamps (sub-millisecond resolution)
3. Runs feature extraction **locally in a Web Worker** (off the main thread — no UI impact)
4. Accumulates the feature vector as the user types
5. At session end (form submit or configurable session timeout), generates a signed session token containing the computed confidence scores

The session token is a compact, signed JWT-like blob. It contains scores and metadata. It contains **no raw keystroke data** and **no text content**.

### 2.3 Form Submission Flow

When the form submits, `<jitter-input>` appends a hidden field `jitter_token` to the form data automatically. The server receives this token alongside the user's submission and calls the Jitter API to verify it.

---

## 3. Integration Steps

### Step 1: Add the Script Tag

```html
<script src="https://cdn.jitter.io/v1/recorder.js" async></script>
```

Place in `<head>` or before your `</body>`. The recorder is ~12KB gzipped. Loads asynchronously — no render blocking.

### Step 2: Replace Your Textarea

```html
<jitter-input
  site-key="YOUR_SITE_KEY"
  name="content"
  rows="5"
  placeholder="Share your experience..."
></jitter-input>
```

That is the entire front-end integration.

### Step 3: Verify on the Server

After form submission, call the Jitter verification API:

```bash
POST https://api.jitter.io/v1/verify
Authorization: Bearer YOUR_SECRET_KEY
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "site_key": "jtr_live_abc123xyz"
}
```

**Response:**

```json
{
  "valid": true,
  "jitter_score": 0.87,
  "classification": "human",
  "checkmark": true,
  "checkmark_tier": "verified",
  "passport_phase": "mature",
  "liveness_score": 0.92,
  "identity_score": 0.89,
  "passport_weight": 0.72,
  "sessions_accumulated": 24,
  "keystrokes_analyzed": 287,
  "token_id": "tok_v1_9f3c2d...",
  "expires_at": "2026-03-02T18:45:00Z"
}
```

The site uses `classification` and `jitter_score` to decide whether to surface the content, apply a "bot" label, or hold for review. Jitter recommends tagging over blocking — see Section 5.

---

## 4. What Happens on the Client

All sensitive computation happens on-device. Nothing leaves the browser except the signed session token.

### 4.1 Keystroke Capture

The recorder captures:
- `keydown` and `keyup` events per key
- `performance.now()` timestamps (sub-millisecond, not quantized to system clock)
- Physical key code (`e.code` — keyboard position, not character)
- Modifier state (shift, ctrl, alt)

The recorder explicitly does **not** capture:
- Key values (`e.key`) — the actual characters typed
- Text content of the textarea
- Mouse events or any non-keyboard input

### 4.2 On-Device Feature Extraction (Web Worker)

A dedicated Web Worker runs the feature extraction pipeline while the user types. The main thread is never blocked. The worker computes:

- Per-key dwell times (keydown → keyup duration)
- Digraph down-down and flight times (inter-key latencies)
- Error dynamics (backspace patterns, post-error correction timing)
- Cognitive load signals (pause duration correlated with word complexity)
- Session-level entropy and variability measures
- Sub-millisecond timestamp distribution (hardware noise indicator)

Raw events are processed and discarded. Only the accumulated feature vector is retained in memory.

### 4.3 Local Passport Lookup

If a passport exists for this user on this site (stored encrypted in `localStorage`), the worker computes an identity score against the stored profile. If no passport exists, only the liveness score is computed — the session contributes toward building a new passport.

### 4.4 Token Generation

At session end, the worker generates a session token containing:
- Liveness score
- Identity score (if passport exists)
- Passport weight
- Combined jitter_score
- Session metadata (keystroke count, duration)
- Cryptographic signature (HMAC-SHA256, keyed to site key)
- Token expiry (15-minute window)

The token is placed in the hidden `jitter_token` field. The worker and all raw event data are garbage-collected.

---

## 5. Configuration Options

### 5.1 Element Attributes

```html
<jitter-input
  site-key="jtr_live_abc123xyz"       <!-- Required. Your site key from dashboard -->
  name="review"                        <!-- Form field name, passed through to form data -->
  rows="5"                             <!-- Standard textarea rows attribute -->
  placeholder="Write your review..."  <!-- Standard textarea placeholder -->
  sensitivity="balanced"               <!-- "strict" | "balanced" | "permissive" -->
  show-checkmark="true"                <!-- "true" | "false" — display Jitter checkmark badge -->
  karma-gate="3"                       <!-- Sessions required before content is surfaced -->
  theme="light"                        <!-- "light" | "dark" | "auto" -->
></jitter-input>
```

### 5.2 Sensitivity Modes

| Mode | Liveness Threshold | Use Case |
|---|---|---|
| `strict` | jitter_score ≥ 0.75 for human classification | Essay submission, credentialed review, formal writing |
| `balanced` | jitter_score ≥ 0.60 (default) | Review platforms, social content, forums |
| `permissive` | jitter_score ≥ 0.40 | Light bot filtering, high-traffic UGC |

### 5.3 Checkmark Display

When `show-checkmark="true"`, the recorder renders a small badge in the bottom-right corner of the textarea — visible to the user — indicating their verification status:

| Badge State | Meaning | Display |
|---|---|---|
| Hidden | Insufficient keystrokes yet | Not shown |
| Building | 0.40–0.60 score, early sessions | Gray checkmark, "Building" |
| Verified | 0.60–0.85, established passport | Green checkmark |
| Established | 0.85+, veteran passport | Gold checkmark |

This is the "reveal-don't-block" design principle: users who pass get visible recognition. Bots are tagged, not hard-blocked.

### 5.4 Karma Gate Threshold

The `karma-gate` attribute sets how many verified sessions a user must accumulate before their content is surfaced normally. Default: `3`.

During the gate period, content is held in a moderation queue or shown with a "new contributor" label, depending on the site's implementation preference. After the gate clears, content surfaces immediately on submission.

---

## 6. Comparison to reCAPTCHA Integration

| Dimension | reCAPTCHA v2 | reCAPTCHA v3 | Jitter |
|---|---|---|---|
| Front-end | Script + checkbox widget | Script + JS call | Script + element swap |
| User friction | Click, solve puzzle | Zero (score-based) | Zero (types naturally) |
| Server-side | Token verify API | Token verify API | Token verify API |
| Response | Pass/fail | Score 0–1 | Score 0–1 + checkmark tier + passport metadata |
| Signal | Challenge puzzle | Browser fingerprint, behavior | Keystroke biometrics + passport history |
| AI-bypass rate | 96–99.8% (ETH Zurich: 100% on v2) | High | Requires human typing mechanics |
| Cross-session identity | None | None | Yes — passport accumulates |
| Content provenance | None | None | Yes — checkmark proves authorship |
| Bypass cost | $0.0007/1K solves (farm services) | Similar | Physical human + hardware required |
| Integration lines | ~5 | ~3 | ~3 |

The integration complexity is equivalent. The signal depth is fundamentally different. reCAPTCHA tells you whether a robot clicked a button. Jitter tells you whether a human typed this specific text, and whether it is the same human who has been here before.

---

## 7. Minimum Viable Integration (Full Example)

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jitter.io/v1/recorder.js" async></script>
</head>
<body>
  <form action="/submit-review" method="POST">
    <jitter-input
      site-key="jtr_live_abc123xyz"
      name="review_text"
      rows="5"
      placeholder="Describe your experience..."
      show-checkmark="true"
    ></jitter-input>
    <button type="submit">Submit Review</button>
  </form>
</body>
</html>
```

**Server-side (Node.js example):**

```javascript
const response = await fetch('https://api.jitter.io/v1/verify', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.JITTER_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    token: req.body.jitter_token,
    site_key: 'jtr_live_abc123xyz',
  }),
});

const result = await response.json();

if (result.classification === 'bot') {
  // Tag the submission, hold for review, or silently discard
  review.flagged = true;
  review.jitter_score = result.jitter_score;
} else {
  // Surface normally, optionally store checkmark tier
  review.verified = true;
  review.checkmark_tier = result.checkmark_tier;
}
```

---

## Sources

- reCAPTCHA bypass rates: ETH Zurich study, 100% success against reCAPTCHA v2 (2023); academic literature survey
- AI CAPTCHA solve accuracy: 96–99.8% across challenge types; bypass services at $0.0007/1K (dossier research)
- Cloudflare Turnstile bot detection: 33% effective (dossier research)
- Jitter algorithm architecture: algorithm/confidence-scoring.md
- Jitter signal capture: algorithm/keystroke-science-deep-dive.md
- Jitter temporal fortress/passport weight: algorithm/temporal-fortress-model.md
- Jitter differentiation summary: integration/competitive-landscape.md §Key Differentiation Summary
