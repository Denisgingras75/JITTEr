# The Jitter Passport System
## Jitter Protocol — Patent Filing Research
**Date:** 2026-03-02
**Purpose:** Passport architecture reference — accumulation model, tiers, karma gate, lifecycle
**Classification:** Confidential IP Research

---

## 1. The Sports Card Metaphor

A Jitter passport is a sports card.

A rookie card has minimal data: the player exists, they showed up, they have a number. It is worth little. You cannot trust a rookie to perform in the playoffs.

A veteran card has a full career arc: 10 seasons of consistent statistics, notable games, anomalies that stand out precisely because the baseline is so well established. The card has weight. You know what to expect from this player.

The Jitter passport works the same way. Every typing session is a game entry on the card. Early on — one or two sessions — the passport has little predictive value. The user exists, they typed something that looks human, but there is not enough history to trust them with full content surfacing. As sessions accumulate over weeks and months, the passport builds a rich behavioral profile. The statistics deepen. Variance tightens. The card becomes authoritative.

This metaphor has a technical analogue: the passport weight function (Section 5). Weight starts near zero and asymptotically approaches 0.95 — never 1.0, because no biometric system should claim certainty. The closer to 0.95, the more the passport is trusted.

The sports card metaphor also explains anomaly detection (Section 8, the "Bronny Test"): a player who averaged 12 points per game for 5 seasons does not suddenly score 40 without scrutiny. A passport with consistent dwell times does not suddenly show machine-perfect uniformity without triggering review.

---

## 2. Passport Tiers

Five tiers define a passport's maturity. Tiers are named for the card collecting lifecycle — a shared intuition that anyone who has followed sports understands.

### Tier Definitions

| Tier | Age Requirement | Min Sessions | Passport Weight Ceiling | Content Treatment |
|---|---|---|---|---|
| **Infant** | 0–7 days | 1–3 | 0.20 | Held in karma gate, not surfaced |
| **Adolescent** | 7–30 days | 3–10 | 0.50 | Surfaced after karma gate clears, gray checkmark |
| **Mature** | 30–90 days | 10–30 | 0.75 | Green checkmark, full surfacing |
| **Established** | 90–365 days | 30–100 | 0.90 | Gold checkmark, trust signals visible |
| **Veteran** | 365+ days | 100+ | 0.95 | Maximum trust, priority surfacing |

Tier advancement requires **both** the age requirement AND the minimum session count. A user who typed once 90 days ago remains an Infant by session count, not an Established passport. Both axes must be satisfied.

### Why Both Axes

Age alone can be gamed: create an account, type minimally, wait 365 days, execute a bot campaign. Session count alone can be gamed: flood the system with short sessions in rapid succession.

The combination is significantly harder to fake. Accumulating 30+ verified sessions over 90+ days requires sustained human presence across many separate interactions. Bot farms find this economically unviable — the cost per fake veteran passport exceeds the value of a single review manipulation.

---

## 3. What Counts as a Verified Session

Not every typing session contributes equally to passport accumulation. A session must pass minimum quality thresholds to count.

### Minimum Requirements

| Requirement | Threshold | Rationale |
|---|---|---|
| Minimum keystrokes | 30 | Below 30, feature extraction is statistically unreliable |
| Minimum liveness score | 0.60 | Sessions below this threshold do not advance the passport |
| No replay detection | Token must be unique | Replayed sessions are discarded |
| Session duration | > 30 seconds | Prevents rapid programmatic session flooding |
| Keystroke spread | > 20 distinct keys | Prevents single-key or narrow-vocabulary attacks |

Sessions that do not meet these requirements are still processed and scored, but do not increment the passport session counter. They do not penalize the passport either — they are simply not counted.

### Verified vs. Contributing Sessions

A **verified session** (counts toward passport): passes all minimums, liveness_score ≥ 0.60, unique token.

A **contributing session** (counted for anomaly detection but not tier advancement): passes minimums, liveness_score between 0.40 and 0.60. These sessions are logged and influence the anomaly model but do not advance the tier clock.

---

## 4. The 3-Session Karma Gate

### Mechanism

New passports — Infant tier, 0–3 sessions — do not surface content immediately. Instead, content enters a moderation queue or is shown with a "new contributor" label. The gate opens after 3 verified sessions.

This is not a punishment. It is a calibration period. Three sessions give the scoring pipeline enough behavioral data to:

1. Establish a baseline feature vector
2. Verify consistency across multiple submissions
3. Confirm the account is not a one-shot bot submission

### Configurable Gate

Sites can set their own karma gate threshold via the `karma-gate` attribute. The default is 3. The range is 1–10.

| Gate Setting | Content During Gate | Recommended For |
|---|---|---|
| 1 | Held for review, released after 1st verified session | Low-stakes content, high-volume UGC |
| 3 (default) | New contributor label, held in soft queue | Review platforms, forums, social apps |
| 5 | Fully held, no visibility until gate clears | High-value content, credentialed submissions |
| 10 | Fully held | High-security contexts, formal academic or financial submissions |

### What the User Sees During the Gate

The Jitter checkmark badge is visible to the user even during the gate. It shows as "Building" (gray checkmark) with session count: "1 of 3 sessions complete." This is intentional — transparent signaling that the system is learning who they are, not penalizing them. Honest users do not find this frustrating. They find it credible.

---

## 5. Passport Weight Formula

The passport weight `W` determines how much the passport's accumulated history amplifies the session score. A high-quality session from a veteran passport carries more weight than the same session from an Infant passport.

### Formula

```
W = 0.95 * (1 - e^(-N/tau)) * (1 - A) * age_factor(t)
```

Where:

| Variable | Definition | Notes |
|---|---|---|
| `N` | Number of verified sessions accumulated | Integer ≥ 0 |
| `tau` | Session decay constant (default: 15) | Sessions needed to reach ~63% of ceiling. Tunable by sensitivity mode. |
| `A` | Anomaly score ∈ [0.0, 1.0] | 0 = clean history, 1 = fully suspended |
| `age_factor(t)` | Temporal age multiplier | Defined below |
| `0.95` | Maximum weight ceiling | Never reaches 1.0 by design — no biometric system is certain |

### Age Factor

```
age_factor(t) = min(1.0, t / t_mature)
```

Where `t` is the passport age in days and `t_mature` = 30 days. Passports under 30 days old are linearly discounted. After 30 days, the age factor reaches 1.0 and no longer limits weight.

### Weight Trajectory

| Sessions (N) | Age | Anomaly (A) | Passport Weight |
|---|---|---|---|
| 1 | Day 1 | 0.0 | 0.063 (Infant) |
| 3 | Day 7 | 0.0 | 0.168 (Infant ceiling) |
| 5 | Day 14 | 0.0 | 0.273 |
| 10 | Day 30 | 0.0 | 0.487 (Adolescent ceiling) |
| 20 | Day 60 | 0.0 | 0.738 |
| 30 | Day 90 | 0.0 | 0.856 (Mature ceiling) |
| 50 | Day 180 | 0.0 | 0.937 |
| 100 | Day 365 | 0.0 | 0.950 (Veteran ceiling) |
| 30 | Day 90 | 0.30 | 0.599 (30% anomaly penalty) |

The anomaly term `(1 - A)` means a passport with a dirty history — flagged sessions, behavioral inconsistencies — carries proportionally less weight even if it has high session count. A veteran passport that starts showing bot-like behavior is discounted, not just flagged.

---

## 6. Per-Site (v1) vs. Global (v2) Architecture

### v1: Per-Site Passport

In v1, each site that embeds Jitter maintains an independent passport for each user. A user's 50-session veteran status on Site A has no bearing on their Infant status on Site B.

**Architecture:**
- Passport profile stored encrypted in `localStorage` under `jitter_passport_{site_key}_{user_fingerprint}`
- Session tokens are site-scoped: a token from Site A cannot be verified by Site B's secret key
- No cross-site identity linkage — the site only knows how many sessions this user has accumulated with them

**Privacy implication:** Sites cannot collude to identify a user across the web. A user is only as trusted as their history on that specific site.

**Practical implication for WGH launch:** A user who has reviewed restaurants on Yelp for 3 years starts as an Infant on WGH. This is a temporary friction point and a design tradeoff accepted for privacy.

### v2: Global Passport

In v2, a user can optionally upgrade to a global passport — a cross-site portable trust credential.

**Architecture:**
- User explicitly opts in and creates a Jitter account
- Global passport stored server-side in Jitter's encrypted passport registry
- Per-site history contributes to a unified passport after user consent
- Sites receive a portable trust signal: "this user has 400 verified sessions across 12 sites over 2 years"
- The global passport does NOT reveal which sites the user contributed to — only aggregate counts and tier

**The privacy contract:** Global passport enrollment requires explicit opt-in. The user controls which sites contribute to their global passport. Sites that receive the global trust signal see aggregate statistics, never site-specific history.

**Regulatory position:** Global passport is designed to comply with GDPR (explicit consent, data portability), CCPA (opt-out available), and EU AI Act Article 50 (machine-readable authorship signal enforceable August 2, 2026).

---

## 7. The "Bronny Test": Anomaly Detection

### Origin of the Name

LeBron James Jr. ("Bronny") plays alongside his father in the NBA. If a scout saw Bronny's stat line without context, the numbers would seem normal — a solid professional player. But against the backdrop of "son of LeBron James," every performance is scrutinized against an impossible family baseline. That scrutiny is useful: it detects whether the performance is consistent with what we know about this family of players.

In Jitter, the Bronny Test is the mechanism that compares each new session against the established passport profile — not against population averages, but against this specific user's own history.

### Detection Mechanism

Each signal in the current session is compared against the passport's per-signal mean and standard deviation:

```
z_i = |signal_i - passport_mean_i| / passport_sigma_i
```

Escalation thresholds:

| Condition | Anomaly Level | Action |
|---|---|---|
| Any single signal > 3σ | Yellow | Log and monitor, no user impact |
| 3+ signals simultaneously > 2σ | Orange | Score penalty, elevated monitoring |
| 10+ signals simultaneously > 1.5σ | Red | Passport suspension pending review |
| Session fingerprint KL-divergence < 0.01 vs. any prior session | Critical | Replay attack detected, session rejected |

### The Variance Collapse Detector

A subtle but important signal: a human's behavioral variance does not decrease over time. People become faster typists, but not more metronomically consistent. If a passport's per-session signal variance drops below 50% of enrollment variance for five or more consecutive sessions, this triggers a variance collapse alert.

Real humans do not get MORE consistent. Bots optimizing toward a profile mean do.

This detector catches a specific attack: an adversary who has reverse-engineered a user's passport profile and is now generating synthetic sessions tuned to the mean. Each session looks plausible in isolation. The pattern of decreasing variance is what exposes the attack.

### Anomaly Score Accumulation

The anomaly score `A` in the passport weight formula accumulates across sessions with exponential decay:

```
A = 1 - PRODUCT(1 - a_i * exp(-lambda * (t - t_i))) for all recent sessions
```

Where:
- `a_i` = per-session anomaly severity (0.0–1.0)
- `lambda` = decay constant, half-life of 30 days
- Old anomalies fade; recent anomalies dominate

A clean session in an otherwise flagged passport history gradually rehabilitates the passport. Sustained clean behavior over 90+ days can fully clear an Orange anomaly. Red-level suspensions require manual review.

---

## 8. Data Storage: On-Device vs. Server-Side Split

### What Lives On-Device (localStorage)

The passport profile for per-site v1 passports is stored entirely on-device:

```json
{
  "version": "1.0",
  "site_key": "jtr_live_abc123xyz",
  "sessions_verified": 24,
  "passport_phase": "mature",
  "passport_weight": 0.72,
  "created_at": "2025-12-15T10:22:00Z",
  "last_session_at": "2026-02-28T14:05:00Z",
  "profile": {
    "mu": [...],
    "sigma": [...],
    "anchor_samples": [...]
  },
  "anomaly_log": [...],
  "checksum": "sha256:9f3c2d..."
}
```

The `profile` object contains the statistical model: per-feature means, standard deviations, and a small set of anchor samples from enrollment. This is the biometric data. It never leaves the device in v1.

The checksum validates integrity — if the stored passport has been tampered with, the next verify call fails cryptographic validation and the passport resets.

### What Lives Server-Side

Jitter's servers store only:
- Session tokens (15-minute TTL, then purged)
- Aggregate anonymized statistics for population model calibration
- For v2 global passports: encrypted passport profile (user-keyed, opaque to Jitter employees)
- Site-level event logs (session verified, tier changed, anomaly detected) — no biometric data

**The privacy guarantee:** Jitter cannot reconstruct a user's biometric profile from server-side data. The profile is on the device. The server validates tokens, not profiles.

---

## 9. Passport Suspension and Recovery

### Suspension Triggers

A passport is suspended when:
1. Red-level Bronny Test threshold reached (10+ signals simultaneously > 1.5σ)
2. Replay attack detected (KL-divergence < 0.01)
3. Manual review flags the passport (site admin report, fraud signal from partner network)
4. Passport age/session count inconsistency detected (passport claims 365 days but device clock anomaly detected)

### Suspension Behavior

During suspension:
- `passport_weight` is set to 0.0 regardless of session history
- New sessions still capture liveness scores — content can still surface if liveness alone is high
- The site receives `passport_status: "suspended"` in API responses
- The user sees their checkmark drop to "Unverified" state

### Recovery Process

**Automatic recovery:** If subsequent sessions pass cleanly and anomaly score decays below the Yellow threshold, suspension lifts automatically after 30 days of clean sessions. The passport weight resumes from the pre-suspension level minus a permanent 10% penalty (integrity discount).

**Manual recovery:** The user can contact the site or Jitter support to initiate passport review. For v2 global passports, re-enrollment is available with identity re-verification.

**Hard reset:** If the user clears localStorage (or switches devices in v1), the passport resets to Infant. This is a deliberate design choice — the biometric is device-bound in v1. Losing the device means rebuilding trust from scratch. This inconvenience is the security property: there is no "recover my passport" flow that a social engineer can exploit.

---

## Sources

- Passport weight formula: algorithm/temporal-fortress-model.md §7 (Temporal Fortress Model)
- Anomaly detection thresholds: algorithm/confidence-scoring.md §6 (Bronny Test)
- Signal discriminability and feature vector: algorithm/confidence-scoring.md §3 (14-signal core vector)
- Tier advancement criteria: algorithm/confidence-scoring.md §4.2 (Identity Scoring table)
- Biological drift bounds: algorithm/confidence-scoring.md §7 (Adaptation and Drift)
- Privacy model and data split: algorithm/confidence-scoring.md §8.3 (What Sites Never See)
- EU AI Act Article 50: enforcement date August 2, 2026; €15M or 3% worldwide turnover penalties (dossier research)
- Bot farm economics: algorithm/bot-farm-economics.md
