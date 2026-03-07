# WAR Scorer Hardening Design

Date: 2026-03-07
Status: Approved
Approach: Hybrid (hard floors + soft penalties + new signal)

## Problem

WAR flags are diagnostic but toothless. A bot triggering 3+ flags still gets its full weighted score. The hardened algorithm from the stress test report was never wired into the live scorer.

## Layer 1: Hard Floors (WAR = 0)

Instant kill for obvious bot signatures. No human triggers these (0.4% FP rate with 10% research buffer).

| Check | Threshold | Flag |
|-------|-----------|------|
| mean_dwell < 27ms | dwell_floor | All Playwright bots |
| std_inter_key < 9ms | variance_floor | fixed_delay, zero_delay |
| mean_inter_key < 54ms | iki_floor | zero_delay |

If any hard floor triggers: WAR = 0, tier = "Suspicious", return early.

## Layer 2: Soft Penalties (deduct from raw WAR)

Applied after weighted sum. Floor at 0.

| Flag | Condition | Penalty |
|------|-----------|---------|
| bigram_uniform | bigram CV < 0.08 | -0.08 |
| per_key_uniformity | per-key CV < 0.09 | -0.08 |
| dwell_std_hard | dwell std < 8ms | -0.06 |
| no_editing_behavior | edit_ratio < 0.03 AND pause_freq < 0.4 | -0.05 |
| non_lognormal | K-S stat > 0.25 | -0.05 |

Max total penalty: -0.32. Sophisticated bot drops from ~0.50 to ~0.18.

## Layer 3: Dwell Uniformity (10th signal)

New weighted signal measuring per-key dwell CV. Ramp: [0.09, 0.25].

Updated weights (sum = 1.00):
- bigram_rhythm: 0.18
- per_key: 0.15
- cross_signal: 0.15
- distribution: 0.12
- inter_key_var: 0.10
- dwell_std: 0.10
- mean_dwell: 0.08
- editing: 0.05
- dwell_uniformity: 0.04
- purity: 0.03

## Out of Scope

- Velocity check (>11 reviews/day) — server-side, not client scorer
- Replay hash dedup — DB-level
- Session nonces — protocol-level

## Files

1. extension/src/biometrics.js — scoreWAR()
2. sdk/src/core/jitter-box.js — scoreProfile()
