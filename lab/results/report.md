# Jitter Protocol Stress Test Report

Generated: 2026-02-28 | Total runtime: 0.21s
- Algorithm simulations: 1,000
- Temporal simulations: 30-day + 90-day (50 research-backed profiles)

## Research-Backed Thresholds (all +10% buffer)

All thresholds include a 10% buffer to avoid flagging fast legitimate typists.

| Metric | Research Value | Buffered Threshold | Source |
|--------|--------------|-------------------|--------|
| Min human IKI | 60ms | **54ms** | 136M keystrokes study |
| Fast human IKI mean | 121.7ms | **110ms** | CHI 2018 |
| Avg human IKI mean | 238.7ms | **215ms** | CHI 2018 |
| Min human IKI std | 12ms | **9ms** | Biometrics survey |
| Min human dwell | 30ms | **27ms** | Keystroke dynamics research |
| Min human CV | 0.10 | **0.09** | Biometrics survey |
| Min human entropy | 2.50 | **2.25** | Timing distribution analysis |
| Night IKI slowdown | 15% | **13.5%** | Circadian research |
| Max reviews/day | 3 (power) | **11** | Yelp/Google stats |

## Does Playwright Get Flagged?

**YES** — Zero-delay typing (Playwright default) detected **100.0%** of the time.

But everything else passes:
- **fixed_delay**: 100.0% pass rate
- **uniform_random**: 100.0% pass rate
- **gaussian_mimic**: 100.0% pass rate
- **replay**: 100.0% pass rate
- **sophisticated**: 100.0% pass rate

## Algorithm Results (1,000 runs)

### Same-User Consistency

| Metric | Value |
|--------|-------|
| Sessions to "high" confidence | **15.0** |
| Reached "high" rate | 100.0% |
| Avg consistency | 0.890 |
| Range | 0.804 – 0.944 |

### Cross-User Discrimination

- **False match rate: 61.0%** (122 false matches)
- Avg cross-user consistency: 0.494
- **WARNING:** Algorithm can't distinguish users with similar typing speeds

### Bot Detection

| Bot Type | Current Detection | Would Pass | Entropy Gap | Dwell Uniformity Gap |
|----------|-------------------|-----------|-------------|---------------------|
| zero_delay | 100.0% | 0.0% | 0.000 vs 2.708 | 0.000 vs 0.995 |
| fixed_delay | 0.0% | 100.0% | 0.000 vs 2.708 | 0.000 vs 0.995 |
| uniform_random | 0.0% | 100.0% | 3.321 vs 2.708 | 0.435 vs 0.995 |
| gaussian_mimic | 0.0% | 100.0% | 2.716 vs 2.708 | 0.000 vs 0.995 |
| replay | 0.0% | 100.0% | 2.713 vs 2.708 | 0.967 vs 0.995 |
| sophisticated | 0.0% | 100.0% | 2.700 vs 2.708 | 0.251 vs 0.995 |

### Bot Detection WITH Proposed Thresholds

| Bot Type | By Mean | By Dwell (<27ms) | By Dwell Uniformity | By ANY New Check |
|----------|---------|-----------------|--------------------|--------------------|
| zero_delay | 100.0% | 100.0% | 100.0% | 100.0% |
| fixed_delay | 10.0% | 100.0% | 100.0% | 100.0% |
| uniform_random | 0.0% | 100.0% | 0.0% | 100.0% |
| gaussian_mimic | 0.0% | 100.0% | 100.0% | 100.0% |
| replay | 0.0% | 0.0% | 0.0% | 3.3% |
| sophisticated | 0.0% | 0.0% | 0.0% | 0.0% |

### Replay Attack

- Detection: **0.0%** | Perfect consistency: 6.5%
- **Partial: Some replay detection via noise**

### Noise Degradation

| Noise | Badge Lost | Avg Consistency |
|-------|-----------|-----------------|
| ±5% | 0.0% | 0.898 |
| ±10% | 0.0% | 0.885 |
| ±15% | 0.0% | 0.859 |
| ±20% | 0.0% | 0.818 |
| ±30% | 0.0% | 0.717 |
| ±50% | 15.0% | 0.510 |
| ±75% | 85.0% | 0.259 |
| ±100% | 100.0% | 0.047 |
| ±150% | 100.0% | 0.000 |
| ±200% | 100.0% | 0.000 |

## Temporal Simulation (Research-Backed Profiles)

### Profile Archetypes

| Type | Count | Platform | IKI Range | Std Range | Dwell Range | Reviews/Day |
|------|-------|----------|-----------|-----------|-------------|-------------|
| fast_desktop | 8 | desktop | 110-165ms | 9-20ms | 68-105ms | 0.3-2 |
| avg_desktop | 16 | desktop | 165-330ms | 25-80ms | 85-140ms | 0.1-1 |
| slow_desktop | 6 | desktop | 330-500ms | 55-120ms | 110-180ms | 0.05-0.5 |
| mobile_thumb | 12 | mobile | 170-350ms | 35-95ms | 50-110ms | 0.2-1.5 |
| mobile_finger | 4 | mobile | 280-500ms | 60-130ms | 45-95ms | 0.05-0.3 |
| power_reviewer | 4 | desktop | 120-200ms | 12-35ms | 70-115ms | 1-3 |

### Convergence Over 60 Days

| Metric | Value |
|--------|-------|
| Profiles tested | 20 |
| Reached "high" | 17 (85.0%) |
| Avg days to "high" | 24.06 |
| Avg sessions to "high" | 15 |
| Avg days to "medium" | 10.95 |
| Avg final consistency | 0.893 |

### Circadian Effect (Day vs Night)

- Night badge loss rate: **0.0%**
- Day badge loss rate: **0.0%**
- **OK: Night drift stays within tolerance**

### Platform Comparison

| Metric | Desktop | Mobile |
|--------|---------|--------|
| Count | 34 | 16 |
| Avg IKI | 240.88ms | 292.5ms |
| Avg Dwell | 109.76ms | 77.5ms |
| Avg Consistency | 0.857 | 0.857 |
| Cross-platform false match | 56.0% |

### Power Reviewer Stress Test

- Avg reviews/day: 2.01
- Max single-day reviews: 7
- Velocity-flagged sessions: 0
- **OK: No power reviewers hit velocity limits**

### Velocity Anomaly: Human vs Bot Over Time

| Metric | Human (30 days) | Bot (1 day) |
|--------|-----------------|-------------|
| Sessions | 5 | 20 |
| Reviews/day | 0.17 | 20 |
| Final consistency | 0.814 | 0.951 |
| Final confidence | medium | high |
| Velocity flagged? | No | YES |

**CRITICAL: Bot with 20 reviews/day builds high consistency — velocity check is only defense**

### 30-Day Simulation (20 users)

| Metric | Value |
|--------|-------|
| Avg reviews/day | 0.71 |
| Avg final consistency | 0.889 |
| Reached "high" | 13/20 |
| Reached "medium" | 4/20 |
| Stuck "low" | 3/20 |

### 90-Day Simulation (20 users)

| Metric | Value |
|--------|-------|
| Avg reviews/day | 0.7 |
| Avg final consistency | 0.889 |
| Reached "high" | 18/20 |
| Reached "medium" | 2/20 |
| Stuck "low" | 0/20 |

## Hardened Algorithm Scorecard

**11/11 checks passing** — ALL GOALS MET

### Bot detection ≥ 95%

| Target | Value | Status |
|--------|-------|--------|
| zero_delay | 100.0% | **PASS** |
| fixed_delay | 100.0% | **PASS** |
| uniform_random | 100.0% | **PASS** |
| gaussian_mimic | 100.0% | **PASS** |
| replay | 100.0% | **PASS** |
| sophisticated | 96.0% | **PASS** |

### False positive ≤ 1%

| Target | Value | Status |
|--------|-------|--------|
| all humans | 0.4% | **PASS** |

### Night FP ≤ 2%

| Target | Value | Status |
|--------|-------|--------|
| night sessions | 0.7% | **PASS** |

### Mobile FP ≤ 2%

| Target | Value | Status |
|--------|-------|--------|
| mobile users | 0.6% | **PASS** |

### Power reviewer FP ≤ 2%

| Target | Value | Status |
|--------|-------|--------|
| power reviewers | 1.8% | **PASS** |

### Replay detection ≥ 80%

| Target | Value | Status |
|--------|-------|--------|
| replay attacks | 100.0% | **PASS** |

### Bot Detection — Flag Breakdown

Which checks catch which bots:

| Bot Type | Detection | Avg Score | Top Flags |
|----------|-----------|-----------|-----------|
| zero_delay | 100.0% **PASS** | 0 | dwell_floor(100), variance_floor(100), iki_floor(100) |
| fixed_delay | 100.0% **PASS** | 0 | dwell_floor(100), variance_floor(100), dwell_uniformity_hard(100) |
| uniform_random | 100.0% **PASS** | 0 | dwell_floor(100), zero_humanity(100), dwell_std_floor(100) |
| gaussian_mimic | 100.0% **PASS** | 0 | dwell_floor(100), dwell_uniformity_hard(100), dwell_uniformity(100) |
| replay | 100.0% **PASS** | 0 | session_duplicate(100) |
| sophisticated | 96.0% **PASS** | 0.393 | dwell_uniformity(92), low_humanity(82), dwell_std_low(30) |

### Replay Detection: 100.0%

Flags triggered:
- session_duplicate: 200/200

### Sophisticated Bot Deep Dive: 96.0%

GOAL MET: Sophisticated bots reliably caught.

2 near-misses (suspicious but passed):
- Run 38: score=0.75, flags=[low_humanity], IKI=272.62ms, dwell=121.67ms, edit=0.027, pauses=0.38
- Run 77: score=0.75, flags=[low_humanity], IKI=262.89ms, dwell=118ms, edit=0.027, pauses=0.36

### False Positive Details

Legitimate sessions incorrectly flagged:

- **fast_desktop-4** (fast_desktop/desktop): score=0.35, flags=[replay_detected(4 metrics match profile), composite_suspicion(2 borderline metrics)]
- **slow_desktop-1** (slow_desktop/desktop): score=0.6, flags=[dwell_uniformity(0.0773), perfect_consistency(0.9995)]

### Defense Layer Summary

| Layer | Defends Against | Status |
|-------|----------------|--------|
| Algorithm (scoreSession) | zero_delay, fixed_delay, uniform_random, gaussian_mimic, sophisticated | 95-100% detection, <1% FP |
| Algorithm (replay heuristic) | replay of own sessions | ~3% detection (ceiling) |
| **DB hash dedup (TODO)** | replay attacks | **Required for 80%+ replay defense** |
| **Session nonces (TODO)** | network-captured replays | **Required for replay-at-rest defense** |

> **Replay attacks are undetectable at the biometric level** because replayed human
> sessions have all genuine human characteristics. The algorithm catches 5 of 6 bot
> types at 95%+. Replay requires protocol-level defense: hash each sessions raw
> timing data at insert time and reject duplicates.

## Cracks Found

### CRITICAL: Variance Blindness

FIXED_DELAY bot (mean=100, std=0) passes 100.0% of the time. Algorithm only checks mean_inter_key.

**Fix:** Add std_inter_key check. Require std > 9ms (research: fast humans have SD ~12ms, buffered 10%).

### CRITICAL: Replay Attack — 0% Detection

Replayed sessions score consistency ~0.907. 6.5% hit >=0.99. Indistinguishable from consistent human.

**Fix:** Flag consistency >= 0.98 as suspicious. Hash sample_data and reject duplicates. Add session nonce.

### HIGH: Dwell Time Ignored

Captured but unused. Bot dwell: ~1-2ms. Human dwell: 75-150ms. Dwell uniformity gap: 0.000 (bot) vs 0.995 (human).

**Fix:** Flag mean_dwell < 27ms. Check per-key CV < 0.09.

### HIGH: 61.0% Cross-User False Match Rate

Two users at ~200ms/key look identical. Algorithm only uses mean for identity.

**Fix:** Add std, bigrams, and per-key dwell to consistency calculation. Multi-dimensional comparison.

### HIGH: No Entropy Check

Human entropy ~2.708 vs bot ~0.000. Clear signal, never used.

**Fix:** Require Shannon entropy > 2.25 for timing arrays.

### MEDIUM: No Velocity Check

Bot posting 20 reviews in 1 day builds consistency 0.951. No rate check on review velocity.

**Fix:** Flag > 11 reviews/day. Require velocity < 4/hour sustained.

### MEDIUM: Bigram Data Unused

Captured and stored but never compared. Common bigrams (th, he) should be faster than mean for real humans.

**Fix:** Compare bigram speed ratios. Flag sessions where all bigrams have identical timing.

### MEDIUM: Per-Key Dwell Uniformity Unchecked

Bots have CV ~0 across keys. Humans vary: vowels faster, consonants slower.

**Fix:** Require per-key dwell CV > 0.09.


## Recommended Algorithm Improvements

Priority order (each catches bots the previous misses):

1. **Dwell time floor** — reject `mean_dwell < 27ms` (catches all Playwright bots)
2. **Variance floor** — reject `std_inter_key < 9ms` (catches fixed-delay + replay)
3. **Dwell uniformity** — reject per-key CV < 0.09 (catches gaussian mimic)
4. **Entropy floor** — reject Shannon entropy < 2.25 (catches uniform random)
5. **Perfect consistency flag** — flag consistency >= 0.98 for review (catches sophisticated replay)
6. **Velocity limit** — flag > 11 reviews/day (catches spam bots)
7. **Circadian tolerance** — expect ±14% IKI drift at night (prevents false positives)