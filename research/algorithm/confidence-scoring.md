# Jitter Protocol: Confidence Scoring Pipeline
## How Raw Signals Become a Bot/Human Score
**Date:** 2026-03-02
**Purpose:** Patent filing reference — scoring architecture, signal weighting, threshold calibration
**Classification:** Confidential IP Research

---

## 1. Overview: The Scoring Problem

Jitter captures dozens of raw behavioral signals per typing session (dwell times, flight times, digraph latencies, error dynamics, cognitive pauses, entropy rates, tremor signatures, etc.). The confidence scoring pipeline transforms this high-dimensional signal space into a single, actionable output:

**Binary question:** Was this content typed by a real human?
**Continuous output:** A confidence score from 0.0 (certainly bot) to 1.0 (certainly human), plus a per-identity match score when a passport exists.

This document defines the architecture from raw keystroke events to final score.

---

## 2. Signal Extraction Layer

### 2.1 Raw Event Capture

Every keystroke generates two events: `keydown` (with `performance.now()` timestamp, `e.code`, `e.key`, `e.location`) and `keyup` (same fields). From these, the extraction layer computes:

**Per-keystroke features:**
- Dwell time H(k) = keyup.timestamp - keydown.timestamp (typical: 50–150ms)
- Key identity (physical position via e.code, not character)
- Modifier state (shift held, ctrl held)

**Per-pair features (digraphs):**
- Down-Down time DD(i,j) = keydown[j].timestamp - keydown[i].timestamp
- Up-Down flight time UD(i,j) = keydown[j].timestamp - keyup[i].timestamp (signed — negative = overlap)
- Up-Up time UU(i,j) = keyup[j].timestamp - keyup[i].timestamp

**Session-level aggregates (computed over sliding windows of 50+ keystrokes):**
- Mean typing speed (WPM)
- Speed coefficient of variation (CV)
- Error rate (backspace count / total keystrokes)
- Pause distribution (histogram of gaps > 300ms)
- Burst ratio (consecutive flight times < 50ms / total pairs)

### 2.2 Minimum Sample Requirements

| Scoring Mode | Minimum Keystrokes | Confidence Ceiling |
|---|---|---|
| Quick liveness check | 30 keystrokes | 0.60 max |
| Standard session score | 140 keystrokes | 0.85 max |
| Full passport session | 300+ keystrokes | 0.95 max |

Below 30 keystrokes, no meaningful score can be produced. The system returns `insufficient_data` rather than a misleading score.

---

## 3. Feature Vector Construction

### 3.1 The 14-Signal Core Vector (v1)

For the v1 per-site passport (shipping with WGH), the feature vector comprises 14 signals organized by discriminative power (based on academic benchmarks — see keystroke-science-deep-dive.md §5):

**Tier 1 — Highest discriminative power (weight 1.0):**

| # | Signal | Dimension | Source |
|---|--------|-----------|--------|
| 1 | Digraph DD for top-20 common pairs | 20 values | Home-row bigrams: "er","th","he","in","re","an","on","en","at","it","or","es","is","ha","st","ou","ar","nd","to","se" |
| 2 | Negative flight time frequency | 1 value | Fraction of digraphs with UD < 0 |
| 3 | Negative flight time mean magnitude | 1 value | Mean of |UD| where UD < 0 |
| 4 | Spacebar dwell time (mean + std) | 2 values | Most discriminative single-key feature |
| 5 | Shift key dwell time (mean + std) | 2 values | Habitual, resistant to fatigue |

**Tier 2 — Good discriminability (weight 0.7):**

| # | Signal | Dimension | Source |
|---|--------|-----------|--------|
| 6 | Per-key dwell means for ETAOINSHRDLU | 12 values | Top-12 English letter frequencies |
| 7 | Typing speed CV | 1 value | Consistency of speed across 30s windows |
| 8 | Error dynamics triplet | 3 values | Pre-error acceleration, detection latency, post-correction deceleration |
| 9 | Shift hand preference ratio | 1 value | Left-shift usage / total shift usage |

**Tier 3 — Contextual signals (weight 0.4):**

| # | Signal | Dimension | Source |
|---|--------|-----------|--------|
| 10 | Pause distribution (3-bin histogram) | 3 values | Short (<500ms), medium (500ms–2s), long (>2s) pause frequencies |
| 11 | Cognitive load correlation | 1 value | Pearson r between word complexity and pre-word pause |
| 12 | Bi-manual asymmetry ratio | 1 value | Right-hand CV / left-hand CV |
| 13 | Entropy rate (sample entropy) | 1 value | SampEn of IKI sequence, order=2 |
| 14 | Sub-millisecond timestamp fraction | 1 value | Fraction of timestamp diffs with non-zero sub-ms component |

**Total feature vector dimensionality: ~50 values** (20 digraph DDs + 30 scalar/vector features)

### 3.2 Normalization

Each feature is z-score normalized against the population model:

```
z_i = (x_i - mu_population_i) / sigma_population_i
```

During cold start (< 1,000 passports), population parameters are bootstrapped from academic datasets (CMU benchmark, Aalto University TypeNet dataset). As the registry grows, population parameters are updated monthly from aggregate (anonymized) passport data.

---

## 4. The Two-Stage Scoring Architecture

Jitter uses a two-stage scoring pipeline:

**Stage 1: Liveness Score** — Is this session from a human being? (Binary human/bot classification)
**Stage 2: Identity Score** — Is this the same human as the passport holder? (Biometric matching)

### 4.1 Stage 1: Liveness Scoring

The liveness score answers: "Is a real human typing right now?"

**Inputs:** Current session feature vector (no passport history required)
**Output:** `liveness_score` ∈ [0.0, 1.0]

**Hard gates (instant fail → score = 0.0):**
- Sub-millisecond fraction = 0.0 (all integer-ms timestamps → injected events, see algorithm-hardening #10)
- Zero error rate over 200+ keystrokes (no human types 200 characters without a single correction)
- Typing speed > 200 WPM sustained (physiological ceiling for human typing is ~150 WPM for experts)
- Identical session fingerprint to any prior session (exact replay)

**Soft signals (weighted combination):**

```
liveness_score = sigmoid(
    w1 * tremor_ratio_score +        # Enhancement #1: 8-12Hz band power
    w2 * entropy_range_score +        # Enhancement #8: SampEn in [0.8, 2.2]
    w3 * error_dynamics_score +       # Enhancement #6: three-part error signature
    w4 * cognitive_load_score +       # Enhancement #4: pause-complexity correlation
    w5 * subms_fraction_score +       # Enhancement #10: hardware timestamp noise
    w6 * asymmetry_score +            # Enhancement #13: bi-manual asymmetry present
    w7 * flight_time_distribution     # Log-normal fit (humans) vs Gaussian (GANs)
)
```

**Initial weight calibration (tuned against known bot types):**

| Weight | Signal | Rationale |
|--------|--------|-----------|
| w1 = 0.15 | Tremor ratio | Kills GANs, coached farms |
| w2 = 0.15 | Entropy range | Kills random-delay bots, GANs |
| w3 = 0.12 | Error dynamics | Kills TypeSim (0% errors), PasteHuman |
| w4 = 0.12 | Cognitive load | Kills all timing-only spoofs |
| w5 = 0.18 | Sub-ms fraction | Kills injection attacks (Emunium, TypeSim) — highest weight because binary discriminator |
| w6 = 0.08 | Asymmetry | Kills profile-averaging attacks |
| w7 = 0.20 | Distribution shape | General human/bot separator |

**Liveness thresholds:**

| Score Range | Classification | Action |
|---|---|---|
| 0.0–0.20 | Bot (high confidence) | Content tagged as bot-generated, karma gate blocks |
| 0.20–0.40 | Suspicious | Content tagged as unverified, elevated monitoring |
| 0.40–0.60 | Uncertain | Content visible but no checkmark, additional sessions requested |
| 0.60–0.80 | Likely human | Checkmark with "building confidence" indicator |
| 0.80–1.0 | Human (high confidence) | Full checkmark, content surfaces normally |

### 4.2 Stage 2: Identity Scoring

The identity score answers: "Is this the same person as the passport holder?"

**Inputs:** Current session feature vector + passport profile (accumulated from prior sessions)
**Output:** `identity_score` ∈ [0.0, 1.0]

**Method: Mahalanobis Distance** (accounts for feature correlations within an individual's profile)

```
d = sqrt((x - mu_passport)^T * Sigma_passport^(-1) * (x - mu_passport))
identity_score = 1.0 - chi2_cdf(d^2, df=K)
```

Where:
- `x` = current session feature vector
- `mu_passport` = passport profile mean (weighted by recency via anchor+drift model)
- `Sigma_passport` = passport covariance matrix
- `K` = number of features (dimensionality)
- `chi2_cdf` = chi-squared cumulative distribution function

This yields a p-value interpretation: identity_score = 0.95 means "there is a 95% probability this session was generated by the passport holder."

**Identity scoring requires a minimum passport maturity:**

| Passport Phase | Min Sessions | Identity Score Ceiling | Notes |
|---|---|---|---|
| Infant (0-7 days) | 1-3 | 0.50 | Insufficient data for reliable matching |
| Adolescent (7-30 days) | 3-10 | 0.70 | Profile still forming |
| Mature (30-90 days) | 10-30 | 0.85 | Commercially useful accuracy |
| Established (90-365 days) | 30-100 | 0.95 | High-confidence matching |
| Veteran (365+ days) | 100+ | 0.98 | Near biological floor of intra-individual variability |

### 4.3 Combined Output: The Jitter Confidence Score

The final score exposed to sites is a combination:

```
jitter_score = min(liveness_score, identity_score) * passport_weight
```

Where `passport_weight` comes from the Temporal Fortress model (see temporal-fortress-model.md §7):

```
passport_weight = 0.95 * (1 - e^(-N/tau)) * (1 - anomaly_score) * age_factor
```

**This three-factor design means:**
- A high liveness score with no passport history produces a low jitter_score (new user, not yet trusted)
- A mature passport with a poor liveness score produces a low jitter_score (possible account takeover)
- Only mature passports with high liveness AND identity match produce high jitter_scores

---

## 5. Threshold Calibration Strategy

### 5.1 The Operating Point Problem

Every biometric system faces a tradeoff: stricter thresholds reduce false acceptance (bots slip through) but increase false rejection (real humans get flagged). The optimal operating point depends on the use case.

**Jitter's multi-threshold approach:**

| Use Case | Target FAR | Target FRR | Operating Point |
|---|---|---|---|
| Review platform (WGH) | <5% | <3% | Balanced — some bots OK if tagged |
| Education (essay verification) | <1% | <5% | Security-heavy — false negatives tolerable |
| Social media (karma gating) | <10% | <1% | Usability-heavy — minimize friction |
| High-security (financial) | <0.1% | <10% | Maximum security |

### 5.2 Calibration Data Sources

**Academic benchmarks used for initial calibration:**
- CMU Keystroke Benchmark: 51 users, 400 samples each — provides per-signal distribution baselines (Killourhy & Maxion, 2009)
- Aalto University dataset: 136 million keystrokes, 168,000 subjects — provides population-level norms for free-text typing (Acien et al., TypeNet, 2021)
- TypeFormer mobile dataset: 5 sessions × 50 keystrokes — mobile-specific norms (2024)

**Production calibration:**
- First 90 days: population model bootstrapped from academic data
- Day 90+: weekly recalibration against production passport registry
- Continuous A/B testing of threshold adjustments on non-critical decisions (e.g., which content gets a "building confidence" vs. full checkmark)

### 5.3 Per-Signal Threshold Ranges

| Signal | Human Range | Bot Range | Gray Zone |
|---|---|---|---|
| Tremor ratio (8-12Hz PSD) | 0.15–0.40 | <0.05 or >0.50 | 0.05–0.15 |
| Sample entropy | 0.8–2.2 | <0.4 or >3.5 | 0.4–0.8 or 2.2–3.5 |
| Sub-ms timestamp fraction | >0.60 | ~0.0 | 0.01–0.60 |
| Error rate (per 200 chars) | 0.02–0.15 | 0.0 or >0.30 | 0.15–0.30 |
| Negative flight time frequency | 0.05–0.35 | <0.01 or >0.50 | 0.01–0.05 |
| Cognitive load correlation | r > 0.20 | r ~ 0 | 0.05–0.20 |
| Kurtosis of IKI distribution | >1.5 | <0.5 | 0.5–1.5 |
| Bigram cross-correlation (off-diag mean) | 0.30–0.70 | <0.10 | 0.10–0.30 |

---

## 6. Anomaly Detection: The "Bronny Test"

Named for the sports card metaphor: impossible stat lines trigger scrutiny.

### 6.1 Per-Session Anomaly Score

```
A_session = f(z_scores across all K signals)
```

Where z_score_i = |signal_i - passport_mean_i| / passport_sigma_i

**Escalation thresholds:**

| Condition | Anomaly Level | Action |
|---|---|---|
| Any single signal > 3σ | Yellow | Flag for monitoring, no user impact |
| 3+ signals simultaneously > 2σ | Orange | Elevated monitoring, score penalty |
| 10+ signals simultaneously > 1.5σ | Red | Automatic passport suspension pending review |
| Session fingerprint within KL-divergence < 0.01 of any prior session | Critical | Replay detected, session rejected |

### 6.2 Cross-Session Anomaly Tracking

The anomaly score feeds into the passport weight function. Repeated anomalies accumulate:

```
anomaly_score = 1 - PRODUCT(1 - a_i * decay(t - t_i)) for recent sessions
```

Where:
- `a_i` = per-session anomaly severity (0–1)
- `decay(dt)` = exponential decay with half-life of 30 days
- Old anomalies fade; recent ones dominate

**The "variance collapse" detector:** Track rolling variance of each signal across sessions. If variance drops below 50% of enrollment variance for 5+ consecutive sessions, flag potential bot takeover. Real humans don't get MORE consistent over time — bots optimizing toward the profile mean do.

---

## 7. Adaptation and Drift Management

### 7.1 Profile Update Rules

The scoring pipeline must balance stability (identity anchor) against drift tolerance (natural behavioral change).

**Update protocol (confidence-gated):**

```
IF identity_score > 85th percentile of passport history:
    Update passport profile with new session data
    Weight: recent sessions get higher weight (recency bias)
    Anchor: enrollment samples are NEVER removed from profile
ELSE IF identity_score > 50th percentile:
    Include session in profile with reduced weight (0.3x)
ELSE:
    Do NOT update profile — session is either an anomaly or impostor
    Increment anomaly counter
```

### 7.2 Drift Rate Bounds

Maximum allowed per-session drift for any signal:

```
delta_max = 3 * (sigma_biological_drift / sqrt(N))
```

Where sigma_biological_drift is calibrated from longitudinal research:
- Typing speed: ~5–15% variance over 30–90 days (Sensors MDPI, 2020; ICC = 0.79)
- Per-key hold times: ~8–12% drift over 180 days
- Digraph flight times: ~10–15% drift over 180 days

Sessions exceeding delta_max trigger the "Bronny Test" — not automatic rejection, but elevated scrutiny.

---

## 8. Output Format

### 8.1 API Response Structure

The scoring pipeline returns a structured response to the embedding site:

```json
{
  "jitter_score": 0.87,
  "liveness": {
    "score": 0.92,
    "classification": "human",
    "signals_flagged": []
  },
  "identity": {
    "score": 0.89,
    "passport_weight": 0.72,
    "passport_phase": "mature",
    "sessions_accumulated": 24
  },
  "checkmark": true,
  "checkmark_tier": "verified",
  "metadata": {
    "keystrokes_analyzed": 287,
    "session_duration_ms": 45200,
    "scoring_version": "1.0.0"
  }
}
```

### 8.2 Checkmark Tiers

| Tier | Criteria | Visual |
|---|---|---|
| `unverified` | jitter_score < 0.40 | No checkmark |
| `building` | 0.40 ≤ jitter_score < 0.60 | Gray checkmark with "Building confidence" |
| `verified` | 0.60 ≤ jitter_score < 0.85 | Green checkmark |
| `established` | jitter_score ≥ 0.85 AND passport_phase ≥ "established" | Gold checkmark |

### 8.3 What Sites Never See

Per Jitter's privacy model:
- Raw keystroke timing data — never leaves device
- Individual signal values — only aggregate scores
- Text content — never captured
- Specific anomaly details — only classification and flagged count

Sites see scores and classifications. They never see the biometric data.

---

## 9. Attack Resistance by Scoring Stage

| Attack Type | Stage 1 (Liveness) Defense | Stage 2 (Identity) Defense |
|---|---|---|
| Emunium/TypeSim injection | Sub-ms fraction = 0.0 → instant fail | N/A (fails Stage 1) |
| KeyGAN synthetic timing | Kurtosis too low, entropy too uniform, distribution fails KS test | Mahalanobis distance high (GAN output doesn't match individual profile) |
| PasteHuman (copy-type) | Cognitive load r ~ 0, error dynamics absent | Digraph timing doesn't match passport |
| Replay attack | Session fingerprint deduplication | KL-divergence too low vs prior sessions |
| Coached human farm | Missing tremor signature consistency, session time clustering | Profile inconsistency across operators |
| Purchased account | N/A (may pass liveness) | Behavioral evolution discontinuity (Enhancement #2) |
| Adversarial passport poisoning | N/A (slow attack) | AIC model selection catches linear drift (Enhancement #15) |

---

## 10. Performance Targets

Based on academic benchmarks adjusted for production conditions:

| Metric | Target (v1 launch) | Academic Reference |
|---|---|---|
| Human correctly classified as human | >97% (FRR < 3%) | TypeNet EER 2.2% on free text |
| Bot correctly classified as bot | >90% (FAR < 10%) | Conservative — GANs are improving |
| Mature passport identity match | >95% accuracy | EER 0.5–1% at 50+ sessions |
| Scoring latency (on-device) | <50ms per session | All computation local, no network |
| Minimum keystrokes for any score | 30 | Below this, insufficient data |

**Expected improvement trajectory:**
- v1 (launch): 90% bot detection, 97% human acceptance
- v1 + 90 days (production data): 93% bot detection (calibrated on real attacks)
- v2 (force-augmented): >98% bot detection with Hall Effect tier

---

## Sources

- Killourhy & Maxion (2009) — CMU Keystroke Benchmark, baseline classifier comparison
- Acien et al. (2021) — TypeNet, EER 2.2% free text, 136M keystrokes population norms
- TypeFormer (2024) — Mobile keystroke transformer, EER 3.25%
- Rattani et al. (2019) — Adaptive biometric template update strategies, ACM Computing Surveys
- MDPI Sensors (2020) — ICC temporal persistence of biometric features
- MDPI Entropy (2017) — Behavioral entropy: 60-80 bits achievable with 50 signals
- Jitter algorithm-hardening-15-enhancements.md — Enhancement-specific detection thresholds
- Jitter temporal-fortress-model.md — Passport weight function
- Jitter keystroke-science-deep-dive.md — Feature discriminative power rankings
