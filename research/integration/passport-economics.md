# Jitter Passport: Economics of the Compound Difficulty Curve
## Date: 2026-03-02 | Source: Research agent sprint
## Purpose: 6-month cost modeling, economic moat analysis, ROI calculations (patent filing)

---

## 1. Overview: Not a Wall, an Economic Toll Booth

The conventional approach to bot defense is to build a wall: a CAPTCHA, a phone verification, a proof-of-humanity gate that either blocks a bot or lets it through. The wall either works or it doesn't. Sophisticated attackers find the gap and every account behind the gap has the same trust as every legitimate account.

Jitter is not a wall. It is an economic toll booth.

A CAPTCHA costs $0.001 to bypass. Jitter pushes that cost to $20-400 per month per fake account — and the cost rises every month the passport ages. The system does not need to be impenetrable. It needs to make fraud more expensive than the fraud is worth. By Day 90, it achieves this for every known commercial bot-farm use case except nation-state disinformation.

The toll booth analogy is precise: every interaction with the Jitter-protected system costs the adversary something. Legitimate users pay nothing — behavioral entropy is a natural byproduct of genuine activity. Fake accounts must pay computationally or with human labor to fake the entropy that real users generate for free.

---

## 2. Cost Per Fake Account Over Time

Source: bot-farm-economics.md. The following table represents the total monthly cost to maintain a single fake account (including infrastructure, human oversight, and computational identity maintenance) against a Jitter Passport system with 14+ signals.

| Timeline | Cost/Account/Month | vs. CAPTCHA-Only | What Collapses |
|---|---|---|---|
| Day 1 | $0.04-$0.20 (one-time) | 1-4x | Nothing — single session is fakeable |
| Day 30 | $20-$60 | 500-2,000x | Fake followers, basic review spam |
| Day 90 | $57-$107 | 1,500-3,500x | Ad fraud, click fraud |
| Day 180 | $133-$275 | 3,000-9,000x | Only nation-state disinfo survives |
| Day 365 | $200-$400 | 5,000-13,000x | Industrially unscalable for all use cases |

**Why the cost compounds:**

Each additional behavioral signal does not add cost linearly — it multiplies cost. Signals must be:
1. Internally consistent with each other (typing rhythm must match fatigue curve must match circadian pattern)
2. Consistent with the account's own history (can't deviate from established behavioral DNA without detection)
3. Naturally evolving (too static triggers replay detection; too variable triggers takeover detection)

The combinatorial consistency requirement across 14+ signals is what drives the exponential cost curve. This is not linear scaling — it is multiplicative constraint.

**The mathematical mechanism:**

From temporal-fortress-research.md, the forgery cost grows as:
```
F(N, K) = F_0 * N^(K/2)
```

Where N = sessions, K = number of tracked signals. For K=14 core v1 signals:
- At N=10 (Day 15): F = F_0 * 10^7 — order of magnitude harder than Day 1
- At N=50 (Day 90): F = F_0 * 50^7 — economically comparable to human labor
- At N=100 (Day 180): F = F_0 * 100^7 — industrially unscalable

---

## 3. Bot Farm Revenue Ceilings by Use Case

For Jitter's economics to create a deterrent, the cost of maintaining a fake account must exceed the revenue that account generates. The break-even crossover determines when each use case becomes economically unviable.

| Use Case | Monthly Revenue/Account | Break-Even Day | Status After Break-Even |
|---|---|---|---|
| Fake followers (resale) | $0.10-$0.50 | Day 1-7 | Immediately uneconomic |
| Fake reviews | $0.50-$5.00 | Day 1-14 | Collapses at Day 30 |
| Ad fraud / click fraud | $1-$10 | Day 14-30 | Collapses at Day 90 |
| High-value influence ops | $20-$100 | Day 30-60 | Strained at Day 90 |
| Nation-state disinformation | $50-$500 | Day 90-180 | Marginal at Day 365 |

**Interpretation:** By Day 90, every commercial bot-farm use case has crossed the break-even point. Only nation-state-level operations — with budgets that dwarf commercial fraud economics — remain viable, and even those face negative expected ROI by Day 365.

---

## 4. Break-Even Crossover Points

The break-even crossover is the day on which the cost of maintaining a fake account exceeds the revenue that account generates.

**For ad fraud / click fraud (the largest commercial bot use case):**
- Revenue per account: $1-10/month
- Jitter cost at Day 30: $20-60/month
- **Crossover: Day 14-22.** By the time an account is old enough to have non-infant passport weight, it is already unprofitable.

**For fake reviews (second largest commercial use case):**
- Revenue per account: $0.50-5.00/month
- Jitter cost at Day 30: $20-60/month
- **Crossover: Day 7-14.** Collapses before the Adolescent passport tier is even reached.

**For high-value influence operations (political, brand manipulation):**
- Revenue per account: $20-100/month
- Jitter cost at Day 90: $57-107/month
- **Crossover: Day 60-90.** Influence operations require Mature or higher passports to have real reach. The passport tier that grants meaningful influence is the same tier where costs exceed revenue.

**The elegant trap:** Jitter's passport tiers are calibrated so that the trust level required for effective manipulation is precisely the trust level at which the economic case for the fake account inverts. You need an Established passport to be trusted. An Established passport costs more to maintain than it earns.

---

## 5. The "Dedicated Human" Threshold

At scale, maintaining fake accounts transitions from automated software problems to human labor problems. This is the threshold at which a "bot farm" stops being a bot farm and starts being an employment agency.

| Phase | Days | Worker Capacity | Reason |
|---|---|---|---|
| Infant | 0-30 | 20-50 accounts/worker | Behavioral consistency overhead is low; basic consistency checks only |
| Adolescent → Mature | 30-90 | 5-15 accounts/worker | Bigram timing and motor memory patterns require individual maintenance |
| Mature → Established | 90-180 | 1-2 accounts/worker | Per-account behavioral DNA requires dedicated attention |
| Established → Veteran | 180+ | 1 account/worker | Each fake veteran needs its own dedicated human operator |

**What this means:**

At the 1:1 ratio (Day 180+), a "bot farm" running 10,000 fake accounts requires 10,000 full-time human workers. At $2-3/hour (click farm labor, Bangladesh/Vietnam), that is $20,000-30,000 per hour, or roughly $40-60 million per year, to operate 10,000 fake Veteran passports.

No commercial fraud operation has this economics. Nation-state disinfo campaigns that operate at this scale are, by definition, spending state resources — which puts them outside the economic model of bot farms entirely.

At 1:1, a bot farm is just an employment agency. Not an attack. Just hiring people.

---

## 6. At-Scale Economics: 10,000 Accounts

The at-scale comparison makes the deterrent vivid.

| System | Monthly Cost for 10,000 Active Accounts |
|---|---|
| CAPTCHA-only bypass | $750-$1,650 |
| Jitter @ Day 30 | $200,000-$600,000 |
| Jitter @ Day 90 | $570,000-$1,070,000 |
| Jitter @ Day 180 | $1,330,000-$2,750,000 |
| Jitter @ Day 365 | $2,000,000-$4,000,000 |

At Day 90, maintaining 10,000 fake accounts costs $570K-$1.07M per month, versus $750-$1,650 for CAPTCHA-only.

That is a **500-700x cost increase** simply by requiring 90 days of consistent behavioral history.

The CAPTCHA cost assumes $0.80-$1.50 per 1,000 solves (reCAPTCHA v2 via CAPTCHA-solving services). For comparison, Arkose Labs (FunCaptcha) raises CAPTCHA bypass to $30-35 per 1,000 solves — a 40x improvement. Jitter's Day 90 economics represent a further 40-90x improvement over Arkose Labs, achieved without any change to the user experience.

---

## 7. The Phantom Typist Paradox

Denis's insight, from temporal-fortress-research.md, mathematically validated:

**If a bot is sophisticated enough to maintain a convincing behavioral identity for 6 months across 50 signals, is it effectively simulating a human being? At what point does simulating a human cost as much as hiring one?**

**The Phantom Typist Calculation:**

Cost to maintain a Jitter-grade fake identity for 6 months (50+ signals, 100+ sessions):

| Component | Cost |
|---|---|
| Fine-tuned generative model per identity | $50-200 (2026 inference pricing) |
| Real-time inference during typing sessions (2 sessions/day × 180 days × $0.03/session) | ~$10.80 |
| Total compute per mature fake identity | ~$60-210 over 6 months |

Cost of an equivalent human worker for 6 months:
- 1 hour/day at $1.50/hour (click farm labor): ~$270 over 6 months

**The crossover is closer than it appears — but the bot approach has fatal structural flaws:**

1. The generative model must be imperceptibly accurate across ALL 50 signals simultaneously. A single detectable signal invalidates the entire 6-month investment.
2. Human workers can be retasked if a campaign ends. A flagged and invalidated passport is a total loss with no recoverable value.
3. The model must be trained per identity, not per population. There is no amortization across accounts — each fake veteran requires its own bespoke model.
4. The failure probability compounds over time. Each session is an independent detection opportunity. Over 180 days at 2 sessions/day, there are 360 independent detection attempts. If each session has even a 1% detection probability, the probability of surviving all 360 sessions is 0.99^360 = 2.7% — meaning 97.3% of fake passports are caught before reaching veteran status.

**The Phantom Typist conclusion:** At 50 signals and 90+ days, the economic crossover does not make faking cheaper than hiring — it makes faking approximately equal in cost to hiring, while adding catastrophic downside risk (total loss on detection) and requiring domain expertise (behavioral AI) that click farms do not have.

The rational economic choice for an adversary at Day 90 is to hire actual humans. Which is exactly the point. The system wins when it forces adversaries to use real people.

---

## 8. Expected Survival Rate of Fake Passports

From temporal-fortress-model.md and game-theoretic analysis:

| Passport Tier | Age Required | Estimated Survival Rate for Fake Passports |
|---|---|---|
| Infant → Adolescent | 0-7 days | ~40% (easy to fake; detection is limited) |
| Adolescent → Mature | 7-30 days | ~15% (compound signals begin binding) |
| Mature → Established | 30-90 days | ~5% (dedicated human threshold hit) |
| Established → Veteran | 90-365 days | ~1% (economic inversion complete) |
| Veteran (sustained) | 365+ days | <0.1% (stochastic detection over time eliminates survivors) |

**The lottery math:**

For a bot farm to reliably produce 100 Veteran passports, it must create approximately:
```
100 / 0.001 = 100,000 Infant passports
```

Each must be maintained for 365 days. The cost of creating and maintaining 100,000 infant passports to harvest 100 veterans, at even $5/account/month over 12 months:
```
100,000 * $5 * 12 = $6,000,000
```

For 100 Veteran passports with a manipulation value ceiling of perhaps $100/month each:
```
100 * $100 = $10,000/month in value
```

Break-even requires 600 months (50 years) of operating the veterans at full revenue. The operation is structurally irrational.

---

## 9. Expected ROI Calculation: Negative for Fake Veterans

**Formal expected value calculation:**

```
EV(fake_passport) = V_veteran * P(survive_to_veteran) - Cost_accumulation
```

Using conservative estimates:
- `V_veteran` = value of a fully trusted veteran passport = $50-500/month (use case dependent)
- `P(survive_to_veteran)` = 0.01 (1% survival rate across 12 months)
- `Cost_accumulation` = $200-400/month for 12 months = $2,400-4,800 total

For a fake followers use case (V_veteran = $0.50/month):
```
EV = $0.50 * 0.01 - $3,600 = $0.005 - $3,600 = -$3,599.995
```

For a nation-state disinfo use case (V_veteran = $500/month):
```
EV = $500 * 0.01 - $3,600 = $5 - $3,600 = -$3,595
```

Even at the highest-value use case, the expected ROI of attempting to build a fake veteran passport is profoundly negative. The only viable path to a high-trust passport is to be a real user.

---

## 10. Comparison to Twitter Blue's 10,000% Cost Increase

When Elon Musk introduced Twitter Blue at $8/month, he reported that it increased bot costs by approximately 10,000% (100x). The observation was that most bots operate on sub-cent economics; a monthly fee of $8 is simply not viable at click-farm scale.

Jitter achieves a comparable or superior cost increase WITHOUT charging the user anything:

| System | Cost Increase vs. Baseline | Mechanism |
|---|---|---|
| Twitter Blue ($8/month fee) | ~10,000% (100x) | Monetary friction |
| Jitter @ Day 30 | 50,000-200,000% (500-2,000x) | Temporal behavioral friction |
| Jitter @ Day 90 | 150,000-350,000% (1,500-3,500x) | Compound signal friction |
| Jitter @ Day 365 | 500,000-1,300,000% (5,000-13,000x) | Full temporal fortress |

Twitter Blue's approach has a ceiling: a motivated adversary with adequate funding can simply pay $8/month per account. The monetary barrier is linear — it costs exactly as much to maintain 10,000 accounts as 10 accounts, just $80,000/month.

Jitter's barrier is superpolynomial. It costs dramatically more per account as accounts age, and it cannot be bypassed with money alone — it requires genuine behavioral consistency over time, which is not purchasable.

---

## 11. Bitcoin Proof-of-Work Analogy

Bitcoin's proof-of-work requires miners to expend real computational resources to publish a block. No shortcut exists: the work must be done. This makes the blockchain tamper-resistant because rewriting history requires redoing all the work that went into it.

Jitter's passport is behavioral proof-of-work.

A high-trust passport requires real behavioral work: hundreds of typing sessions over months, exhibiting the natural complexity of human motor patterns. No shortcut exists. The work must be done. A fake veteran passport cannot be purchased or generated — it must be lived.

The analogy holds in one additional dimension: both systems make the legitimate activity easy (mining with honest behavior is straightforward) and the fraudulent activity expensive (51% attacks require majority hash power; fake veterans require majority behavioral authenticity). The cost asymmetry is the security property.

Unlike Bitcoin's proof-of-work, Jitter's behavioral proof does not consume electricity. The "work" is the normal activity of a human being. Legitimate users generate proof-of-humanity as a natural byproduct of using the internet. Bots must pay to simulate it.

---

## 12. The Data Asset Is the Real Moat

The product vision correctly identifies this:

> "The real moat is a network of passports with months of accumulated data. Once a million people have Jitter passports with 6 months of history, that dataset is the asset. Nobody can bootstrap that from scratch."

**Why the passport registry is the defensible moat:**

**Network effects on detection accuracy:**
- At 10,000 passports: detection is based on individual passport analysis + small population reference
- At 100,000 passports: population-level behavioral distributions are well-calibrated; outliers are identifiable
- At 1,000,000 passports: behavioral clusters from coordinated bot farms are detectable in the population distribution; the false-negative rate on sophisticated attacks drops dramatically

**The calibration advantage:**
With 1 million veteran passports, the Jitter system knows:
- What the actual distribution of typing speeds looks like across the human population
- How digraph timing varies by age, profession, native language (a non-English speaker's 'th' digraph looks different from a native English speaker's)
- What legitimate circadian patterns look like (and which accounts deviate from all known patterns)
- How behavioral evolution looks over 6-month arcs for real users

This calibration cannot be purchased. It can only be accumulated. A competitor starting from scratch in 2028 would need 1-2 years of data accumulation to achieve comparable detection accuracy, assuming they could attract comparable user adoption.

**The switchover cost:**
A site that has 18 months of Jitter passport data for its users faces enormous switching costs to an alternative. Migrating to a different behavioral biometric system means losing all accumulated passport history. Users restart from Infant tier. The trust infrastructure must be rebuilt from scratch. Sites will not switch unless the alternative is dramatically superior.

**The adversarial moat:**
From temporal-fortress-research.md Section 11.1:
- Cross-passport correlation analysis detects identity farms (behavioral clusters that look too similar — bot farms generating from the same underlying model will cluster in behavioral space)
- Epoch-level ground truth: if 99% of passports show a particular circadian pattern, the 1% that don't are candidates for investigation

This cross-passport analysis only becomes possible with scale. At 10,000 passports, a bot farm running 500 coordinated fake accounts is 5% of the population — hard to detect in a noisy reference set. At 1,000,000 passports, 500 coordinated accounts is 0.05% of the population — their clustering in behavioral space is a statistically glaring anomaly.

The data asset compounds. Every new legitimate passport makes the detection system more accurate. Every incremental accuracy improvement makes fake passports easier to detect. The system becomes harder to attack as it grows — a property almost no other fraud defense system has.

---

## Summary: The Economics in Numbers

| Metric | Value | Source |
|---|---|---|
| CAPTCHA bypass cost | $0.001/solve | AZcaptcha, 2captcha pricing |
| Jitter fake account cost at Day 30 | $20-60/month | bot-farm-economics.md |
| Jitter fake account cost at Day 90 | $57-107/month | bot-farm-economics.md |
| Cost increase vs CAPTCHA at Day 90 | 1,500-3,500x | bot-farm-economics.md |
| Twitter Blue cost increase | ~100x | Musk's reported observation |
| Jitter Day 365 cost increase | 5,000-13,000x | bot-farm-economics.md |
| Expected survival rate to veteran | <1% | game-theoretic model |
| Expected ROI of fake veteran passport | Negative | this document, Section 9 |
| Dedicated human threshold | Day 90+ | bot-farm-economics.md |
| 10,000 fake accounts at Day 90 | $570K-$1.07M/month | bot-farm-economics.md |
| Cross-site coordination overhead | O(N*S^2) | temporal-fortress-model.md |
| Compute cost of Phantom Typist (6 months) | ~$60-210 | temporal-fortress-research.md |
| Human labor cost (equivalent, 6 months) | ~$270 | click farm market data |
| Break-even day for ad fraud | Day 14-22 | this document, Section 4 |

**The bottom line:** Jitter's economic architecture makes the sustained operation of fake accounts unprofitable for all commercially motivated adversaries by Day 90. It does this without charging users, without blocking legitimate activity, and without a single wall to climb over. It is a toll booth that gets more expensive every month, indefinitely.

---

## Sources

- bot-farm-economics.md (this research dossier) — all cost and revenue per account data
- temporal-fortress-model.md (this research dossier) — forgery cost formula, survival rate analysis, Phantom Typist calculation
- temporal-fortress-research.md (this research dossier) — cross-site coordination complexity, data asset moat
- AZcaptcha, 2captcha, Anti-Captcha pricing — CAPTCHA bypass costs
- Arkose Labs / Medium technical analysis (2024) — Arkose difficulty benchmark
- Euronews (2025) investigation — fake account marketplace pricing
- StratCom COE (2024) report — social media manipulation pricing
- Wikipedia, FraudBlocker (2024) — click farm economics
- Capital One Shopping (2025) — fake review statistics
- Bitcoin whitepaper (Nakamoto 2008) — proof-of-work analogy
- Twitter Blue / Musk October 2022 statements — 10,000% cost increase claim
