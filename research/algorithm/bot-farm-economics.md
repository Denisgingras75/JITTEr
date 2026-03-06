# Jitter Passport: Bot Farm Economics Model
## Date: 2026-03-02 | Source: 3-agent research sprint

## Cost Per Fake Account Over Time (vs Jitter Passport)

| Timeline | Cost/Account/Month | vs CAPTCHA-only | What Dies |
|---|---|---|---|
| Day 1 | $0.04-$0.20 (one-time) | 1-4x | Nothing — single session is fakeable |
| Day 30 | $20-$60 | 500-2,000x | Fake followers, basic review spam |
| Day 90 | $57-$107 | 1,500-3,500x | Ad fraud, click fraud collapse |
| Day 180 | $133-$275 | 3,000-9,000x | Only nation-state disinformation survives |
| Day 365 | $200-$400 | 5,000-13,000x | Industrially unscalable for ALL use cases |

## At Scale: 10,000 Fake Accounts

| System | Monthly Cost (10k accounts) |
|---|---|
| CAPTCHA-only | $750-$1,650 |
| Jitter @ Day 30 | $200,000-$600,000 |
| Jitter @ Day 90 | $570,000-$1,070,000 |
| Jitter @ Day 180 | $1,330,000-$2,750,000 |
| Jitter @ Day 365 | $2,000,000-$4,000,000 |

## Why It Compounds (The Mechanism)

Each signal added doesn't increase cost linearly — it increases MULTIPLICATIVELY because signals must be:
1. Internally consistent with each other (typing rhythm matches fatigue curve matches circadian pattern)
2. Consistent with the account's history (can't deviate from established behavioral DNA)
3. Naturally evolving (too static = replay detection, too variable = takeover detection)

The combinatorial consistency requirement across 14 signals makes individual account maintenance economically equivalent to employing a dedicated human.

## The "Dedicated Human" Threshold

- Day 1-30: One click farm worker manages 20-50 accounts
- Day 30-90: Worker capacity drops to 5-15 accounts (behavioral consistency overhead)
- Day 90-180: Worker capacity drops to 1-2 accounts (bigram/motor memory must be individually maintained)
- Day 180+: 1:1 ratio — each fake account needs its own dedicated human operator

At 1:1, a "bot farm" is just an employment agency. Not an attack. Just... hiring people.

## Bot Farm Revenue Ceilings (What They Earn Per Account)

| Use Case | Monthly Revenue/Account |
|---|---|
| Fake followers (resale) | $0.10-$0.50 |
| Fake reviews | $0.50-$5.00 |
| Ad/click fraud | $1-$10 |
| High-value influence ops | $20-$100 |
| Nation-state disinfo | $50-$500 |

**Break-even crossover:**
- Day 30: Low-value use cases already unprofitable
- Day 90: Ad fraud and click fraud collapse
- Day 180: Even nation-state ops face marginal returns

## The Testing Bot Paradox

Q: Could bots sophisticated enough to TEST Jitter also serve as a bot farm?

A: No. A testing bot can pass a SINGLE SESSION. But maintaining a consistent behavioral identity for 6 months requires a bespoke behavioral generative model per account (a "digital twin"). Training cost: $10K-$100K per account. The testing toolkit and bot farm toolkit are the same — and both are economically irrational against temporal accumulation.

## Current Bot Infrastructure (Baseline for Comparison)

| Component | Cost |
|---|---|
| CAPTCHA solving (reCAPTCHA v2) | $0.80-$1.50/1,000 solves |
| CAPTCHA solving (Arkose/FunCaptcha) | $30-$35/1,000 solves (40x harder) |
| Residential proxy | $1.50-$4.00/GB |
| Antidetect browser | $7.99-$299/month |
| Click farm labor | ~$2-3/hour (Bangladesh/Vietnam) |

## The Core Principle

Jitter is not a wall. It's an ECONOMIC TOLL BOOTH.
- CAPTCHAs cost $0.001 to bypass
- Jitter passports push that to $20-400/month per fake account
- The system doesn't need to be unbreakable — it needs to make breaking it more expensive than the fraud is worth
- At scale, it achieves this by Day 90

## Key Comparisons

- Twitter Blue's $8/month fee increased bot costs 10,000% (Musk reported)
- Jitter's passport achieves 500-13,000x cost increase WITHOUT charging the user anything
- Bitcoin proof-of-work analogy: make fake identity computationally/behaviorally expensive, not cryptographically impossible

## Sources

- Click farm economics: Wikipedia, FraudBlocker 2024
- CAPTCHA bypass costs: AZcaptcha, 2captcha, Anti-Captcha pricing
- Arkose Labs difficulty: Medium technical analysis 2024
- Fake account markets: Euronews 2025 investigation
- Social media manipulation pricing: StratCom COE 2024 report
- Adversarial keystroke attacks: Springer IJIS 2023 (86% single-session success)
- Residential proxy pricing: Bright Data, IPRoyal, Decodo 2024
- Fake review statistics: Capital One Shopping 2025
