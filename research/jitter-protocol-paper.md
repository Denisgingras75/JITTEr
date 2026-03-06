# The Jitter Protocol: Behavioral Biometric Proof-of-Humanity Through Temporal Accumulation, Multi-Signal Analysis, and Hall Effect Force Curve Authentication

**Denis Gingras**
Independent Researcher
March 2026

**Provisional Patent Application No. 63/994,858**
Filed March 2, 2026 — United States Patent and Trademark Office

---

## Abstract

We present the Jitter Protocol, a system for verifying human authorship of digital content through continuous behavioral biometric analysis and cryptographic content provenance certification. Unlike existing bot detection systems that perform one-time challenge-response verification, Jitter captures a multi-dimensional behavioral fingerprint during the natural act of writing and accumulates trust over time through a temporal passport model. The system introduces three contributions: (1) a multi-layered scoring pipeline analyzing 14+ behavioral signals including keystroke timing, cognitive load correlation, error dynamics, and physiological tremor detection; (2) a Temporal Fortress model demonstrating that the forgery cost of maintaining a fake behavioral identity grows superpolynomially with profile maturity, rendering bot farm operations economically irrational within 90 days; and (3) a novel application of Hall Effect magnetic keyboard sensors as a biometric identity signal, capturing continuous force curves during keystroke actuation — a signal space with no prior art in commercial products or academic literature. We show that a 50-signal passport accumulated over 100+ sessions constrains the acceptable behavioral space to a volume where reliable forgery requires per-identity simulation cost approaching that of hiring a real human. In economic analysis, Jitter increases fake account costs from $0.001 (CAPTCHA baseline) to $200-$400/month per account, representing a 5,000-13,000x cost multiplier. We position Jitter as infrastructure for the emerging regulatory environment, including the EU AI Act Article 50 (effective August 2, 2026), which mandates proof of human authorship but specifies no technical mechanism.

---

## 1. Introduction

### 1.1 The Authorship Crisis

The proliferation of generative artificial intelligence has created an unprecedented crisis in digital content authentication. Large language models can produce human-quality text in milliseconds. Image generators create photorealistic content from text prompts. Voice synthesis replicates speech with seconds of training data. The fundamental question — *"Did a human create this?"* — has become unanswerable by existing systems.

Current countermeasures are reactive and probabilistic. AI text detectors (GPTZero, Turnitin AI Detection, OpenAI's classifier) analyze finished documents for statistical patterns characteristic of machine-generated text. These systems suffer from fundamental limitations: they guess based on word patterns rather than observing the creation process, they produce false positives that penalize skilled human writers, and they are defeated by paraphrasing tools and iterative prompting techniques. OpenAI's own AI classifier was withdrawn in July 2023 due to low accuracy [1].

CAPTCHA systems (reCAPTCHA, hCaptcha, Arkose Labs) perform one-time challenge-response verification at a single point in time. They do not provide continuous monitoring during content authorship, do not generate certificates of human authorship, and are defeated at scale for $0.80-$1.50 per 1,000 solves [2]. The CAPTCHA model fundamentally misunderstands the threat: the question is not "is a human present at login?" but "did a human create this specific content?"

Existing biometric authentication systems (FaceID, fingerprint, keystroke dynamics for passwords) verify identity at the moment of login but provide no continuous provenance for work performed during a session. They answer "who are you?" but not "are you the one who wrote this?"

### 1.2 The Regulatory Gap

The regulatory environment is moving faster than the technical infrastructure. The EU AI Act Article 50, taking effect August 2, 2026, mandates that AI-generated content be labeled and that systems exist to verify human authorship. California's proposed AB 3211 requires similar disclosure. Yet neither regulation specifies *how* human authorship should be verified. The C2PA standard (Coalition for Content Provenance and Authenticity, backed by Adobe, Microsoft, and the BBC) addresses device-level content provenance — proving a photo was taken by a specific camera — but does not address author-level behavioral verification. A gap exists between the regulatory mandate and the available technical mechanisms.

### 1.3 Contributions

This paper presents the Jitter Protocol as a system designed to fill this gap. Our contributions are:

1. **A multi-signal behavioral analysis pipeline** that captures 14+ independent biometric dimensions during the natural act of typing, achieving 96-100% bot detection with <2% false positive rate in controlled testing.

2. **The Temporal Fortress model**, a mathematical framework demonstrating that the cost of maintaining a fake behavioral identity grows superpolynomially with profile maturity: *F(N,K) = F₀ · N^(K/2)*, where N is accumulated sessions and K is the number of tracked signals.

3. **A novel application of Hall Effect keyboard sensors** as a biometric identity signal, representing the first proposed use of commercial magnetic depth sensors (Wooting, Razer analog keyboards) for behavioral authentication — a signal space with no prior art in commercial products or published academic literature.

4. **An economic model** showing that Jitter increases fake account maintenance costs from $0.001 (CAPTCHA) to $200-$400/month at 365 days, achieving a 5,000-13,000x cost multiplier that renders bot farm operations economically irrational for all but nation-state actors.

5. **A content provenance certification system** generating cryptographically signed "Smart Badges" attached to authored content, with hash-chained sequential certificates providing tamper-evident provenance history.

---

## 2. Related Work

### 2.1 Keystroke Dynamics: A Mature Field

Keystroke biometrics has a 40-year research history. The foundational US Patent 4,805,222 (Young & Hammon, 1989) established keystroke rhythm as an identity verification mechanism. The CMU Keystroke Benchmark (Killourhy & Maxion, 2009) [3] remains the canonical reference: 51 users, 400 samples each, password `.tie5Roanl`, achieving EER of 7.5% with classical classifiers (Scaled Manhattan distance).

Deep learning has dramatically improved accuracy. TypeNet (Acien et al., 2021) [4] achieved EER of 2.2% on physical keyboards and 9.2% on touchscreens using Siamese LSTM with triplet loss, trained on 136 million keystrokes from 168,000 subjects (Aalto University dataset). TypeFormer (2024) [5] applied Transformer architectures with Gaussian range encoding, achieving 3.25% EER on mobile. Recent CNN+RNN hybrids report EER as low as 0.65% on the CMU benchmark under controlled conditions [6].

However, all published work shares a common limitation: **timing-only signal capture from OS-level keyboard events**. No published system incorporates physical force data from consumer hardware.

### 2.2 Commercial Landscape

The behavioral biometrics market is projected to reach $14 billion by 2032 (SNS Insider), with keystroke dynamics representing 39.25% of revenue (Straits Research).

**TypingDNA** (Romania, founded 2015, $8.82M raised including Google's Gradient Ventures) is the dominant developer-accessible platform. It captures dwell time and flight time via JavaScript events and offers authentication API and continuous endpoint monitoring (ActiveLock 3.5 Fortress). Recognized in Gartner Hype Cycle for Digital Identity 2025. Captures only software-layer timing data — no hardware sensor integration.

**BioCatch** (Israel, acquired by Permira for $1.3B in May 2024, $160M ARR) processes 16+ billion user sessions monthly across 555M banking customers. Tracks 3,000+ behavioral and contextual signals. The BioCatch Connect 2.0 network uncovered $60M in attempted fraud in Q3 2025 alone. However, BioCatch produces session-level risk scores, not persistent identity tokens. It is enterprise-only with no developer API.

**BehavioSec** (Sweden, acquired by LexisNexis 2022) pioneered mobile touchscreen behavioral biometrics. Now absorbed into the LexisNexis ThreatMetrix platform. No longer independently accessible.

**Plurilock** (Canada, public TSX-V: PLUR) provides continuous endpoint authentication for U.S. Department of Defense and Army NETCOM. Enterprise security product, not developer infrastructure.

**Neuro-ID** (acquired by Experian ~2024-2025) specialized in form interaction behavioral biometrics — detecting bots through how users fill out digital forms. Produces liveness detection, not persistent identity.

**Turnitin Clarity** (launched March 2025, TIME's Best Inventions 2025) records writing process metadata — draft history, paste events, typing vs. non-typing time — but does not compute biometric identity signatures. It answers "was this document typed live?" but not "who typed it?"

**KeyTrac** (inactive as of 2024) validated developer demand for keystroke biometrics API before failing commercially.

A critical pattern emerges: **every commercial competitor captures only software-layer timing data derived from OS keyboard events**. No commercial product utilizes hardware-level physical keystroke mechanics. No product generates portable identity tokens with cross-domain accumulation. No product attaches provenance certificates to authored content.

### 2.3 The Hall Effect Gap

Hall Effect keyboards (Wooting 60HE/80HE, Razer Huntsman V3 Pro) use magnetic field sensing to measure continuous key travel depth at 0.1mm resolution and up to 4000 Hz polling rates. The Wooting Analog SDK (open-source, Rust-based) provides `read_analog(keycode)` returning float values 0.0-1.0 per key.

Current anti-cheat systems (Vanguard, EAC, BattlEye) use HE keyboard data only for cheating detection (inhuman timing, Rapid Trigger abuse). No system uses Hall Effect sensor curves as a biometric identity signal.

Academic research on force-augmented keystroke authentication exists but exclusively uses custom sensor hardware. The SFIK study (Zhang et al., Science Advances, 2025) [7] demonstrated 95.3-100% authentication accuracy using a self-powered flexible intelligent keyboard with giant magnetoelastic effect sensors. The PTCSA system (Nano Energy, 2025) [8] showed dual-verification via piezoelectric-triboelectric coupling sensor arrays. Both confirm that force data dramatically improves authentication accuracy — but neither addresses commercially available Hall Effect keyboards.

**No published research or commercial product uses data from commercially available Wooting or Razer Hall Effect keyboards for biometric authentication.** This represents the primary novel contribution of the Jitter Protocol.

### 2.4 Content Provenance Standards

The C2PA standard (Coalition for Content Provenance and Authenticity) provides hash-chained content provenance certificates for media files. Backed by Adobe, Microsoft, BBC, Intel, and others, C2PA establishes device-level provenance — proving a photo was taken by a specific camera at a specific time. However, C2PA does not address behavioral author verification. A document could be C2PA-certified as created on a specific device while being entirely AI-generated. Jitter's Smart Badge system is complementary to C2PA: C2PA certifies the device, Jitter certifies the human.

---

## 3. System Architecture

### 3.1 Overview

The Jitter Protocol operates across four layers:

1. **Capture Layer**: Browser extension or embedded JavaScript widget intercepting DOM input events (keydown, keyup, paste, text insertion, pointer movement) with `DOMHighResTimeStamp` precision.

2. **Analysis Layer**: Multi-signal biometric engine computing 14+ behavioral features from raw events, organized into three discriminative tiers.

3. **Passport Layer**: Temporal reputation system accumulating verified sessions into a portable identity profile with progressive confidence scoring.

4. **Provenance Layer**: Cryptographic certificate generation attaching proof-of-humanity metadata to authored content.

In hardware embodiments, a fifth layer captures physical force signatures via Hall Effect sensors at the keyboard firmware level.

### 3.2 Signal Capture

The system captures two primitive events per keystroke: `keydown` (with `performance.now()` timestamp, `e.code` physical key position, `e.key` logical character, `e.location` left/right modifier distinction) and `keyup` (same fields). From these primitives, the extraction layer computes:

**Per-keystroke features:**
- Dwell time: H(k) = keyup.timestamp - keydown.timestamp (typical range: 50-150ms)
- Key identity via physical position (`e.code`), not character
- Modifier state (shift/ctrl held)

**Per-pair features (digraphs):**
- Down-Down time: DD(i,j) = keydown[j] - keydown[i]
- Flight time: UD(i,j) = keydown[j] - keyup[i] (signed — negative values indicate key overlap, highly discriminative [3])
- Up-Up time: UU(i,j) = keyup[j] - keyup[i]

**Session-level aggregates (computed over 50+ keystroke sliding windows):**
- Mean typing speed (WPM), speed coefficient of variation (CV)
- Error rate (backspace count / total keystrokes)
- Pause distribution (histogram of gaps >300ms)
- Burst ratio (consecutive flight times <50ms / total pairs)

Browser-captured timestamps use `performance.now()` internally, providing microsecond precision. Chrome and Firefox apply ±0.1ms jitter to mitigate timing side-channel attacks, but this noise is random and averages out across samples [9].

### 3.3 The 14-Signal Feature Vector

The v1 feature vector comprises 14 signals (~50 dimensions total), organized by discriminative power based on published benchmarks:

**Tier 1 — Highest discriminative power (weight 1.0):**
- Digraph DD for top-20 common pairs ("er", "th", "he", "in", "re", "an", etc.) — 20 values
- Negative flight time frequency and mean magnitude — 2 values
- Spacebar dwell time (mean + std) — 2 values
- Shift key dwell time (mean + std) — 2 values

**Tier 2 — Good discriminability (weight 0.7):**
- Per-key dwell means for 12 most common English letters (E,T,A,O,I,N,S,H,R,D,L,U) — 12 values
- Typing speed CV across 30s windows — 1 value
- Error dynamics triplet (pre-error acceleration, detection latency, post-correction deceleration) — 3 values
- Shift hand preference ratio (left-shift / total shift usage) — 1 value

**Tier 3 — Contextual signals (weight 0.4):**
- Pause distribution (3-bin histogram: <500ms, 500ms-2s, >2s) — 3 values
- Cognitive load correlation (Pearson r between word complexity and pre-word pause) — 1 value
- Bi-manual asymmetry ratio (right-hand CV / left-hand CV) — 1 value
- Sample entropy of inter-keystroke interval sequence — 1 value
- Sub-millisecond timestamp fraction — 1 value

Each feature is z-score normalized against population parameters bootstrapped from academic datasets (CMU benchmark, Aalto University TypeNet dataset) during cold start, transitioning to production passport data as the registry grows.

---

## 4. Multi-Layered Scoring Pipeline

### 4.1 Two-Stage Architecture

Jitter uses a two-stage scoring pipeline:

**Stage 1 — Liveness Score:** Is this session from a human being? Binary classification requiring no passport history.

**Stage 2 — Identity Score:** Is this the same human as the passport holder? Biometric matching against accumulated profile.

### 4.2 Liveness Detection

The liveness score combines hard gates (instant fail conditions) with weighted soft signals:

**Hard gates (score = 0.0):**
- Sub-millisecond timestamp fraction = 0.0 (all integer-ms timestamps indicate injected events)
- Zero error rate over 200+ keystrokes (no human types 200 characters without corrections)
- Sustained typing speed >200 WPM (physiological ceiling is ~150 WPM for experts)
- Identical session fingerprint to any prior session (exact replay)

**Soft signal combination:**

```
liveness_score = sigmoid(
    0.20 · flight_time_distribution_score +
    0.18 · subms_fraction_score +
    0.15 · tremor_ratio_score +
    0.15 · entropy_range_score +
    0.12 · error_dynamics_score +
    0.12 · cognitive_load_score +
    0.08 · asymmetry_score
)
```

The sub-millisecond fraction (weight 0.18) serves as the most reliable single discriminator: real keyboards produce sub-millisecond timestamp variance from hardware bounce and OS scheduler jitter, while scripted injection (Emunium, TypeSim) bypasses keyboard hardware entirely, producing clean integer-millisecond timestamps. This signal alone kills the most common injection attack vectors.

The tremor ratio (weight 0.15) detects the involuntary 8-12 Hz physiological tremor present in human hand movement. This creates a characteristic power spectral density (PSD) signature in dwell time residuals after removing the typing speed trend. Humans produce tremor ratios of 0.15-0.40; bots with random jitter produce <0.05 (too flat); coached farms overcompensating produce >0.50.

### 4.3 The 11-Layer Detection Pipeline

The full scoring pipeline comprises 11 independent detection layers, each analyzing a distinct biometric dimension:

| Layer | Signal | Threshold | Kills |
|-------|--------|-----------|-------|
| 1 | Dwell time floor | Mean <27ms | All injection bots |
| 2 | Variance floor | σ(IKI) <9ms | Fixed-delay bots |
| 3 | IKI floor | Mean IKI <54ms | Zero-delay injection |
| 4 | Per-key dwell uniformity | CV <0.09 | Uniform-dwell bots |
| 5 | Timing CV | Overall CV below speed-adjusted threshold | Gaussian-mimic bots |
| 6 | Behavioral editing signals | Low edit ratio AND low pause frequency | TypeSim, PasteHuman |
| 7 | Dwell time σ floor | σ(dwell) <8ms hard, <11ms soft | Definitive bot signal |
| 8 | Session fingerprint dedup | Deterministic hash match | Exact replay attacks |
| 9 | Replay heuristic | 4+ of 5 metrics within tight tolerance | Perturbed replay |
| 10 | Composite borderline | Multiple metrics narrowly passing | Sophisticated mimicry |
| 11 | Bigram rhythm analysis | No linguistic timing correlation | Random-delay injection |

A session failing two or more independent layers is rejected. A session failing exactly one layer is flagged as suspicious. This architecture ensures that an automated system must simultaneously satisfy all detection dimensions — defeating any single check is insufficient.

All thresholds include a 10% buffer below research-derived human baselines to prevent false positives against fast legitimate typists.

### 4.4 Identity Scoring

For users with established passports, the identity score uses Mahalanobis distance:

```
d = sqrt((x - μ_passport)ᵀ · Σ_passport⁻¹ · (x - μ_passport))
identity_score = 1.0 - χ²_cdf(d², df=K)
```

This yields a p-value interpretation: identity_score = 0.95 means 95% probability this session was generated by the passport holder. Identity scoring requires minimum passport maturity — infant passports (1-3 sessions) have a ceiling of 0.50, while veteran passports (100+ sessions) can reach 0.98.

### 4.5 Combined Output

The final Jitter confidence score:

```
jitter_score = min(liveness_score, identity_score) · passport_weight
```

This three-factor design ensures that high liveness with no history produces low trust (new user), mature passport with poor liveness produces low trust (possible takeover), and only mature passports with high liveness AND identity match produce high confidence.

---

## 5. The Temporal Fortress Model

### 5.1 Mathematical Foundation

A behavioral passport is modeled as a multivariate Gaussian posterior that tightens with each verified session. After N sessions, the confidence interval around each signal parameter shrinks as:

```
σ_N = σ₀ / √N
```

For a passport with K independent behavioral signals, the joint acceptable behavior space (the volume of a K-dimensional ellipsoid) shrinks as:

```
V_N = V₀ · (1/N)^(K/2)
```

This is the core insight: **the volume collapses hyperbolically, not linearly.**

For K=50 signals:
- At N=10 sessions: V₁₀ = V₀ · 10⁻²⁵
- At N=100 sessions: V₁₀₀ = V₀ · 10⁻⁵⁰

The acceptable behavior space at 100 sessions is 10²⁵ times smaller than at 10 sessions. A bot must land inside this space with every new session.

### 5.2 Forgery Cost Function

Define forgery cost F(N,K) as the computational/economic cost to generate a plausible new session:

```
F(N,K) = F₀ · N^(K/2)
```

The forgery cost grows as a power law with an exponent equal to half the number of signals. **This growth is superpolynomial in profile maturity.**

### 5.3 The Compound Signal Problem

If a passport tracks K statistically independent signals, the joint false acceptance probability is:

```
P(fake accepted) = ∏ pᵢ  for i = 1 to K
```

Where pᵢ is the per-signal false acceptance probability. With each signal at pᵢ = 0.10:
- K=5: P = 10⁻⁵ (1 in 100,000)
- K=10: P = 10⁻¹⁰ (1 in 10 billion)
- K=20: P = 10⁻²⁰ (computationally unreachable)
- K=50: P = 10⁻⁵⁰ (the universe is not old enough)

In practice, behavioral signals share covariance (~0.3 mean pairwise correlation), reducing effective dimensionality to approximately K_effective ≈ K · (1 - mean_correlation). For 50 signals: K_effective ≈ 35 — still extraordinarily powerful.

### 5.4 Passport Weight Function

The passport weight model formalizes trust accumulation:

```
W(t, N, A) = 0.95 · (1 - e^(-N/τ)) · (1 - A) · age_factor(t)
```

Where:
- W_max = 0.95 (no passport reaches 100% trust)
- N = verified sessions
- τ = convergence constant (~20-25 sessions for K=50)
- A = anomaly score ∈ [0,1]
- age_factor(t) = sigmoid of calendar age

This produces five trust tiers:

| Phase | Calendar Age | Sessions | Weight | Interpretation |
|-------|-------------|----------|--------|----------------|
| Infant | 0-7 days | 1-5 | 0.05-0.15 | High suspicion |
| Adolescent | 7-30 days | 5-20 | 0.15-0.40 | Building trust |
| Mature | 30-90 days | 20-60 | 0.40-0.65 | Standard trust |
| Established | 90-365 days | 60-200 | 0.65-0.85 | Strong identity |
| Veteran | 365+ days | 200+ | 0.85-0.95 | Near-maximum |

### 5.5 Profile Lock-In

Based on published EER convergence data:
- After ~5 sessions: EER drops to 10-15%
- After ~15-20 sessions: EER reaches 3-5% (commercial-grade)
- After ~50 sessions: EER reaches 0.5-1% (biological floor for typing dynamics)
- After ~100+ sessions: EER stabilizes at irreducible intra-individual variability

**Lock-in occurs around 50 sessions** for a 50-signal system. Below this threshold, a sophisticated bot can operate in the uncertainty margin. Above it, every new session must precisely navigate a space defined by 50 real sessions.

### 5.6 Temporal Drift Management

Keystroke biometrics face a fundamental tension: identity must be stable, but behavior changes. Research establishes Intraclass Correlation Coefficients (ICC) for key features [10]:

- Typing speed (WPM): ICC = 0.79 over 2 years ("substantial" stability)
- Per-key hold times: ICC > 0.70 for high-frequency keys
- Inter-key flight times: ICC = 0.60-0.75 depending on bigram

The Jitter passport implements an anchor + drift model:

```
Profile(t) = α · Profile_historical + (1-α) · Profile_recent
```

Confidence-gated updating ensures only sessions exceeding the 85th percentile of passport match history are incorporated at full weight. Enrollment samples are never removed (anchor preservation). Maximum per-session drift is bounded by biological learning curves:

```
Δ_max = 3 · (σ_biological_drift / √N)
```

Sessions exceeding Δ_max trigger the anomaly detection system.

### 5.7 Anomaly Detection

The "Bronny Test" (named for the sports card metaphor: impossible stat lines trigger scrutiny) defines escalation thresholds:

| Condition | Level | Action |
|-----------|-------|--------|
| Any signal >3σ | Yellow | Monitor |
| 3+ signals simultaneously >2σ | Orange | Score penalty |
| 10+ signals simultaneously >1.5σ | Red | Passport suspension |
| Session fingerprint KL-divergence <0.01 | Critical | Replay rejection |

The **variance collapse detector** is particularly effective: if rolling variance drops below 50% of enrollment variance for 5+ consecutive sessions, bot takeover is flagged. Real humans don't become *more* consistent over time — bots optimizing toward the profile mean do.

---

## 6. Bot Farm Economics

### 6.1 The Toll Booth Thesis

Jitter is not a wall. It is an economic toll booth. The system does not need to be unbreakable — it needs to make breaking it more expensive than the fraud is worth.

CAPTCHAs cost $0.80-$1.50 per 1,000 solves ($0.001 per account). Jitter passports push maintenance to $20-$400/month per fake account. The system achieves this by Day 90 at scale.

### 6.2 Cost Escalation Over Time

| Timeline | Cost/Account/Month | vs CAPTCHA | What Dies |
|----------|-------------------|------------|-----------|
| Day 1 | $0.04-$0.20 | 1-4x | Nothing |
| Day 30 | $20-$60 | 500-2,000x | Fake followers, basic spam |
| Day 90 | $57-$107 | 1,500-3,500x | Ad fraud, click fraud |
| Day 180 | $133-$275 | 3,000-9,000x | All except nation-state |
| Day 365 | $200-$400 | 5,000-13,000x | Industrially unscalable |

### 6.3 The Dedicated Human Threshold

The combinatorial consistency requirement across 14+ signals constrains bot farm worker capacity:

- Day 1-30: One worker manages 20-50 accounts
- Day 30-90: Capacity drops to 5-15 accounts (behavioral consistency overhead)
- Day 90-180: Capacity drops to 1-2 accounts (bigram/motor memory must be individually maintained)
- Day 180+: **1:1 ratio — each fake account needs its own dedicated human operator**

At 1:1, a "bot farm" is just an employment agency. The system wins when it forces adversaries to use actual humans — which is exactly the goal.

### 6.4 At Scale (10,000 Fake Accounts)

| System | Monthly Cost |
|--------|-------------|
| CAPTCHA-only | $750-$1,650 |
| Jitter @ Day 30 | $200,000-$600,000 |
| Jitter @ Day 90 | $570,000-$1,070,000 |
| Jitter @ Day 180 | $1,330,000-$2,750,000 |
| Jitter @ Day 365 | $2,000,000-$4,000,000 |

For comparison, Twitter/X Blue's $8/month fee increased bot costs approximately 10,000% (per Musk's reported figures). Jitter achieves a 500-13,000x cost increase without charging the user anything.

### 6.5 The Phantom Typist Paradox

If a bot is sophisticated enough to maintain a consistent behavioral identity for 6 months across 50 signals, it is effectively simulating a human being. At what point does the cost of simulation approach the cost of hiring one?

Cost to maintain a Jitter-grade fake identity for 6 months:
- Per-identity model fine-tuning: ~$50-200 compute (2026 pricing)
- Real-time inference during 360 sessions: ~$10.80
- Total per mature fake identity: **~$110 over 6 months**

Cost of equivalent human labor:
- 1 hour/day at $1.50/hour for 180 days: ~$270

The crossover is closer than it seems — but the bot approach has fatal flaws: (1) the generative model must be imperceptibly good across all 50 signals simultaneously, (2) a single detected signal invalidates the entire 6-month investment, and (3) the expected survival rate of a fake passport to veteran status is <1%.

Expected value of a fake passport:

```
EV = V_veteran · P(survive_to_veteran) - Cost_accumulation
```

If P(survive 365 days) = 0.01 and V_veteran = $100, then EV = $1 minus accumulated costs. At maintenance cost >$1, the operation is economically irrational.

---

## 7. Hall Effect Force Curve Biometrics

### 7.1 The Novel Contribution

This section presents the primary novel contribution of the Jitter Protocol: the use of commercially available Hall Effect keyboard sensors as a biometric identity signal. To our knowledge, this is the first proposal to use force curve data from consumer HE keyboards for behavioral authentication.

### 7.2 Hall Effect Keyboard Technology

Hall Effect keyboards replace mechanical contact switches with magnetic field sensing. Each key switch contains a magnet that moves closer to a Hall Effect sensor as the key is pressed. The sensor measures the changing magnetic field intensity and converts it to an analog position value — continuous key travel depth with 0.1mm resolution.

**Key specifications (Wooting 60HE+):**
- Resolution: 0.1mm over 4mm total travel
- Analog value: 0.0 to 1.0 per key (continuous)
- Polling rate: up to 4,000 Hz
- SDK: Wooting Analog SDK (open-source, Rust-based, cross-platform)
- API: `read_analog(keycode)` returns float; `read_full_buffer(device_id)` returns all active keys

### 7.3 Force Curve Features

From the continuous analog signal, five biometric features per keystroke can be extracted:

1. **Peak depth**: Maximum actuation distance reached (not all typists bottom out every key)
2. **Approach velocity**: Rate of travel from rest to peak depth (sharp punch vs. gradual press)
3. **Ramp rate**: Rate of change of force during the descent phase
4. **Bottom-out duration**: Time spent at or near maximum actuation
5. **Release slope**: Rate of force removal during key return

These features capture the *intensity* dimension of each keystroke, orthogonal to timing. Two users with identical timing profiles may have radically different force profiles — one types with heavy strikes and full bottom-out, another with light touches and partial actuation.

### 7.4 Academic Validation

The SFIK study (Zhang et al., Science Advances, 2025) [7] provides the closest academic validation. Using custom magnetoelastic pressure sensors (sensing range 35-600 kPa, response time ~300ms), the system achieved:
- 8-character fixed password: **95.3% success rate**
- 14 double-key dynamic sets: **100% accuracy**
- Self-powered operation (no external power source)

The PTCSA system (Nano Energy, 2025) [8] demonstrated force-augmented dual-verification with crosstalk-free sensor isolation per key, confirming that force adds a dimension that timing alone cannot provide.

Combined timing+force EER projections:
- Timing only (best published): EER 0.65-2.2%
- Force only (Roth et al., 2008): EER ~8%
- **Timing + force combined: projected EER 0.3-0.7%**

### 7.5 Why Force Data Matters for Anti-Spoofing

Force patterns are subconscious. Unlike timing, which reflects learned motor programs, force profiles reflect physiological characteristics: finger mass, tendon elasticity, joint flexibility, habitual muscle tension. These cannot be consciously controlled or deliberately mimicked with the precision required for biometric matching.

Adding force data to timing-only authentication:
- Makes replay attacks irrelevant (force curves are independent of timing sequences)
- Makes GAN spoofing exponentially harder (must model an additional high-dimensional space)
- Provides a "proof of physical work" that software injection cannot satisfy
- Creates a tiered authentication architecture where HE keyboard users automatically receive higher-confidence verification

### 7.6 Browser Access Limitations

A practical limitation exists: Chrome's WebHID API blocks access to top-level keyboard HID collections (Usage Page 0x01, Usage 0x06). Direct browser-to-keyboard communication of analog values is not possible. Implementation requires one of:

1. **Native companion application** with IPC bridge to browser extension
2. **Wooting Analog SDK** running as a local service
3. **Custom HID interface** for secondary data channels

This limitation positions force curve capture as a Tier 3 enhancement — available on supported hardware with companion software, with graceful degradation to timing-only on standard keyboards.

### 7.7 Tiered Architecture

The Jitter Protocol implements a tiered authentication model:

| Tier | Signal Source | Projected EER | Requirements |
|------|-------------|---------------|--------------|
| 1 | Standard keyboard timing | 2-5% | Browser only |
| 2 | Enhanced timing (all 14 signals + ML) | 1-3% | Browser + trained model |
| 3 | Hall Effect timing + force curves | 0.3-0.7% | HE keyboard + companion app |
| 4 | HE force + native companion + firmware signing | <0.3% | Full hardware integration |

Users automatically receive the highest tier supported by their hardware. The system detects HE keyboard presence and engages force capture transparently.

---

## 8. Novel Detection Mechanisms

### 8.1 Fifteen Algorithm Hardening Enhancements

Through systematic analysis of six known attack vectors (zero-delay injection, fixed-delay injection, random-delay injection, Gaussian-mimic injection, exact replay, and sophisticated multi-signal mimicry), we developed 15 countermeasures, 7 of which represent genuinely novel contributions with no prior publication:

### 8.2 Physiological Micro-Tremor Detection (Enhancement #1)

The human hand produces involuntary 8-12 Hz physiological tremor. By applying FFT to dwell time residuals (after removing the typing speed trend via moving average), we extract a characteristic PSD signature:

```
tremor_ratio = band_power(8-12 Hz) / total_power
```

Humans: 0.15-0.40. Bots: <0.05. Coached farms overcompensating: >0.50.

**Prior art:** PSD analysis on wearable sensors is established (PMC10776092). Applying PSD to *browser-captured keystroke timing residuals* for bot detection is not in the literature.

### 8.3 Cognitive Load Correlation (Enhancement #4)

Humans slow down before complex words. The pause before "epistemological" is measurably longer than before "fox." We compute Pearson correlation between pre-word pause duration and word complexity (based on frequency and syllable count):

```
r(pause_duration, word_complexity)
Humans: r > 0.20
All bots: r ≈ 0 (timing divorced from content)
```

This requires 50+ words for statistical significance. No existing system tests for correlation between typing rhythm and linguistic complexity.

### 8.4 Entropy Rate Analysis (Enhancement #8)

Human inter-keystroke interval sequences have specific sample entropy — neither fully random (bots with random delays) nor fully deterministic (fixed schedule). GANs produce entropy biased toward training mean:

```
SampEn(IKI, order=2)
Humans: [0.8, 2.2]
GANs: >0.95 (too uniform permutation distribution)
Random bots: >3.5 (too chaotic)
```

**Prior art:** Sample entropy in heart rate variability analysis is medical literature. Permutation entropy as a GAN-artifact detector for keystroke timing is genuinely new.

### 8.5 Passport Poisoning Resistance (Enhancement #15)

The most novel mechanism addresses long-horizon adversarial evolution — a sophisticated adversary slowly "training" a passport by making incremental changes each session.

We fit competing models to passport metric evolution over time:
- H₁: Power law (human): M(t) = a · t^(-α) + b
- H₂: Linear (adversarial): M(t) = a · t + b
- H₃: Constant (bot): M(t) = b

Model selection via AIC (Akaike Information Criterion). If the linear model wins, adversarial evolution is suspected. Change-point detection (via the `ruptures` library) identifies abrupt metric shifts consistent with tool updates.

**No prior publication addresses AIC model selection between power-law/linear/constant trajectories for adversarial passport poisoning detection.** This represents the most defensible novel IP in the set.

---

## 9. Attack Resistance Analysis

### 9.1 Six Attack Categories

| Attack | Method | Defense |
|--------|--------|---------|
| **Emunium/TypeSim** | Browser API text injection | Sub-ms fraction = 0.0 → instant fail |
| **KeyGAN** | GAN-synthesized timing | Kurtosis, entropy, distribution shape |
| **PasteHuman** | Copy-and-retype service | Cognitive load r ≈ 0, error dynamics absent |
| **Replay** | Recorded session playback | Session fingerprint dedup, KL-divergence |
| **Coached farm** | Human workers with behavioral targets | Tremor inconsistency, session time clustering |
| **Account purchase** | Buy established account | Behavioral evolution discontinuity |

### 9.2 Controlled Testing Results

In testing with 2,000+ simulated trials across 50 research-backed human typing profiles and 6 attack strategies:

| Metric | Result |
|--------|--------|
| Detection rate (all attack categories) | 96-100% |
| False positive rate (legitimate human sessions) | 0.4% |
| False positive rate (nighttime sessions) | 0.7% |
| False positive rate (mobile sessions) | 0.6% |
| False positive rate (power users) | 1.8% |
| Exact replay detection | 100% |

### 9.3 Known Limitations

We acknowledge several limitations:

1. **Adversarial ML attacks**: A 2023 study demonstrated up to 86% attack success rate using adversarial perturbation on keystroke biometric classifiers [11]. Deep learning-based components of Jitter may be vulnerable to targeted adversarial examples.

2. **Timing-forgery attacks**: A January 2025 arXiv paper demonstrated timing-forgery attacks defeating motor-signal verification in AI authorship detection contexts [12]. The multi-signal approach mitigates but does not eliminate this risk.

3. **Cold start vulnerability**: The first 30 days of passport accumulation represent the most vulnerable window. Infant passports provide limited trust and should not be relied upon for high-stakes decisions.

4. **Browser timing precision**: Browser fingerprinting mitigations (±0.1ms jitter on `performance.now()`) reduce precision slightly but do not eliminate usability — the noise averages out across sessions.

---

## 10. Comparative Analysis

### 10.1 EER Benchmarks in Context

| Modality | Typical EER | Notes |
|----------|-------------|-------|
| Fingerprint (commercial) | 0.1-0.5% | Requires dedicated hardware |
| Iris recognition | 0.08-0.3% | Controlled environment |
| Face recognition (controlled) | 0.3-2% | Vulnerable to deepfakes |
| Voice recognition | 1-5% | Environment-dependent |
| Keystroke timing only, DL, fixed text | 0.65-3% | CMU benchmark |
| Keystroke timing only, DL, free text | 2.2-4.7% | TypeNet/TypeFormer |
| **Keystroke timing + force (research)** | **<0.5%** | SFIK study |
| **Jitter Protocol Tier 1 (timing)** | **2-5%** | Free text, browser |
| **Jitter Protocol Tier 3 (timing + force)** | **0.3-0.7%** | HE keyboard |

### 10.2 What Jitter Does That Others Don't

| Capability | TypingDNA | BioCatch | Plurilock | Turnitin Clarity | **Jitter** |
|-----------|-----------|----------|-----------|-----------------|-----------|
| Hardware force signals | No | No | No | No | **Yes** |
| Persistent identity token | Yes | No | Yes | No | **Yes** |
| Cross-domain passport | No | No | No | No | **Yes** |
| Content provenance cert | No | No | No | Partial | **Yes** |
| Developer self-serve API | Yes | No | No | No | **Yes** |
| Temporal accumulation | No | Partial | No | No | **Yes** |
| Open signal space (HE keyboards) | No | No | No | No | **Yes** |

---

## 11. Regulatory Positioning

### 11.1 EU AI Act Article 50

Taking effect August 2, 2026, Article 50 mandates:
- AI-generated content must be labeled
- Systems must exist to verify human authorship
- No technical mechanism is specified

Jitter provides a verifiable mechanism: a cryptographically signed certificate attached to content, backed by behavioral biometric evidence of human creation. The Smart Badge system can serve as the "proof of human authorship" that Article 50 requires but does not define.

### 11.2 California AB 3211 and Related Bills

Multiple U.S. state bills propose similar disclosure requirements. Jitter's portable passport model — a single enrollment verified across platforms — positions it as infrastructure that platforms can adopt to comply with emerging regulations.

### 11.3 Privacy Architecture

Jitter's privacy model ensures:
- Raw keystroke timing data never leaves the device
- Sites receive only aggregate scores and classifications
- Text content is never captured
- On-device processing minimizes data transmission
- No biometric data is centralized (per-user encrypted profiles)

This design anticipates GDPR Article 9 (processing of biometric data) and CCPA requirements.

---

## 12. Discussion

### 12.1 The Jitter Thesis

The fundamental insight of the Jitter Protocol is that **time is the ultimate proof of work**. A CAPTCHA can be solved in seconds. A behavioral passport requires months. The cost of faking is not in the complexity of any single session but in the compound consistency across hundreds of sessions over months.

This mirrors the economic logic of Bitcoin's proof-of-work: make forgery expensive, not impossible. The Temporal Fortress model shows this works because the cost function is superpolynomial — each additional session and each additional signal multiplies the forgery cost, not adds to it.

### 12.2 The Hall Effect Opportunity

The absence of prior art for Hall Effect biometrics on consumer keyboards represents a significant opportunity. The gaming keyboard market is growing, with Wooting selling out entire product runs and Razer investing heavily in analog switch technology. As HE keyboards enter mainstream adoption, the force curve signal space becomes available to millions of users without any additional hardware purchase.

The tiered architecture ensures Jitter provides value immediately (timing-only Tier 1) while offering enhanced security as hardware evolves (force-augmented Tier 3+). This "upgrade path" is unique among behavioral biometric systems.

### 12.3 Limitations and Future Work

1. **Sample size**: Production validation at scale has not been performed. The 2,000-trial simulation, while methodologically sound, does not substitute for deployment with real users and real adversaries.

2. **Adversarial arms race**: Generative models are improving rapidly. GAN-generated behavioral sequences may become indistinguishable from human typing at the individual session level within 2-3 years. The Temporal Fortress model's strength lies in cross-session consistency, not single-session detection.

3. **Mobile gap**: Touchscreen typing biometrics remain substantially less accurate than physical keyboard biometrics (TypeNet: 9.2% EER mobile vs. 2.2% physical). IMU sensor fusion improves this, but the mobile modality remains weaker.

4. **Accessibility**: Users with motor disabilities, tremor disorders (Parkinson's), or non-standard input methods may produce biometric profiles that trigger false positives. Grace paths and alternative verification mechanisms are required.

5. **Cross-device portability**: A user's typing profile changes substantially when switching keyboards. Cross-device profile fusion — learning the "translation" between a user's laptop and mechanical keyboard profiles — is an open research problem.

---

## 13. Conclusion

The Jitter Protocol addresses the unmet need for continuous, proactive verification of human authorship in the age of generative AI. By capturing multi-dimensional behavioral biometrics during the natural act of writing, accumulating trust through temporal passport models, and generating cryptographic provenance certificates attached to authored content, the system provides a mechanism that current solutions — CAPTCHAs, AI detectors, and point-in-time biometric authentication — cannot.

The Temporal Fortress model demonstrates that maintaining a fake behavioral identity becomes economically irrational within 90 days at scale, increasing fake account costs 1,500-3,500x above CAPTCHA baselines. The novel application of Hall Effect force curves from consumer gaming keyboards opens a signal space with no prior commercial or academic art, projected to achieve sub-1% EER when combined with timing data.

As the EU AI Act Article 50 and similar regulations take effect, the infrastructure gap between the regulatory mandate ("prove this human wrote this") and available technical mechanisms will become critical. The Jitter Protocol is designed to fill that gap.

---

## References

[1] OpenAI. "AI Classifier for Indicating AI-Written Text." Blog post, January 2023. Withdrawn July 2023.

[2] AZcaptcha, 2captcha, Anti-Captcha. Commercial CAPTCHA solving service pricing, 2024-2025.

[3] Killourhy, K. S., & Maxion, R. A. (2009). "Comparing anomaly-detection algorithms for keystroke dynamics." *IEEE/IFIP International Conference on Dependable Systems and Networks*. DOI: 10.1109/DSN.2009.5270346

[4] Acien, A., Morales, A., Fierrez, J., et al. (2021). "TypeNet: Deep Learning Keystroke Biometrics." *IEEE Transactions on Biometrics, Behavior, and Identity Science*, 3(2). arXiv: 2101.05570

[5] TypeFormer (2024). Transformer architecture for mobile keystroke biometrics. *Neural Computing and Applications*. DOI: 10.1007/s00521-024-10140-2

[6] Improved Biometric Identification via Deep Learning (2024). PMC11207587. EER 2.46%, FAR 0.015%.

[7] Zhang, J., et al. (2025). "A flexible pressure sensor array for self-powered identity authentication during typing." *Science Advances*, Vol. 11. DOI: 10.1126/sciadv.ads2297

[8] Piezoelectric-Triboelectric Coupling Sensor Array for Dynamic Keystroke-Password Recognition (2025). *Nano Energy*. DOI: 10.1016/j.nanoen.2025.110266

[9] Cross-Origin Time API Specification. W3C High Resolution Time Level 2. `performance.now()` precision and browser fingerprinting mitigations.

[10] Sensors (MDPI), 2020. "Why Temporal Persistence of Biometric Features, as Assessed by the Intraclass Correlation Coefficient, Is So Valuable for Classification Performance." DOI: 10.3390/s20164555

[11] Adversarial Attacks Against Mouse- and Keyboard-Based Biometric Authentication (2023). *International Journal of Information Security*, Springer. DOI: 10.1007/s10207-023-00711-0

[12] "On the Insecurity of Keystroke-Based AI Authorship Detection" (2025). arXiv: 2601.17280

[13] Rattani, A., et al. (2019). "Adaptive Biometric Systems: Review and Perspectives." *ACM Computing Surveys*, 52(5). DOI: 10.1145/3344255

[14] Gunetti, D., & Picardi, C. (2005). "Keystroke Analysis of Free Text." *ACM Transactions on Information Systems*.

[15] Coli, P., et al. (2019). "Double Serial Adaptation Mechanism for Keystroke Dynamics." *Computers & Security*.

[16] Keystroke Dynamics: Concepts, Techniques, and Applications (2023). *ACM Computing Surveys*. arXiv: 2303.04605v3

[17] Integrating Deep Learning and Data Fusion for Keystroke Biometrics (2024). *Computer Standards & Interfaces*. DOI: 10.1016/j.csi.2024.103875

[18] GANBA: Generative Adversarial Network for Biometric Anti-Spoofing (2022). *Applied Sciences*. DOI: 10.3390/app12031454

[19] Wooting Analog SDK. Open-source Rust SDK for Hall Effect keyboard analog data. GitHub: WootingKb/wooting-analog-sdk

[20] BioCatch Connect 2.0 (2025). Press release: $60M fraud detected Q3 2025 from 180M+ payments.

[21] SNS Insider (2025). Behavioral Biometrics Market to Reach $14.00 Billion by 2032.

[22] Straits Research. Behavioral Biometrics Market Report. Keystroke dynamics: 39.25% revenue share.

[23] Diagnosing Parkinson's Disease via Behavioral Biometrics of Keystroke Dynamics (2025). *Science Advances*. PMC11970477.

[24] EURASIP Journal on Information Security (2024). "Strategic safeguarding: A game theoretic approach for analyzing attacker-defender behavior." DOI: 10.1186/s13635-024-00180-5

[25] Nature Communications (2025). Temporal fingerprints for identity matching across encrypted domains.

[26] MDPI Entropy (2017). "Robust Biometric Authentication from an Information Theoretic Perspective." Behavioral entropy: 60-80 bits achievable with 50 signals.

[27] arXiv 2308.03189. Understanding Biometric Entropy and Iris Capacity. Iris: ~249 bits. Behavioral: 60-80 bits.

---

*Provisional Patent Application No. 63/994,858 filed March 2, 2026. This document represents pre-publication research and does not constitute prior art against the provisional filing.*
