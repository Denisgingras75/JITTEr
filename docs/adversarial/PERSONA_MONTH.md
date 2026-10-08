# Persona-month: what it costs to fake a JITTEr identity

*The falsification record the product plan asks for. Observed facts, measurements, derived numbers and hypotheses are kept apart. September 2026, branch `claude/functionality-audit-h7g3ia`, attest/verify functions as of commit `e8a2683`, engine 3.1.0.*

The question the plan defines as the go/no-go metric: **how many mature, high-trust synthetic personas can one adversary sustain per $1,000 of equipment and monthly operating cost?**

## Measured (this repository, local functions on PGlite, one CPU core)

Scripts: `lab/adversarial/forge.js` (needs `PORT=54331 npm run dev:functions` running, then `BASE=http://127.0.0.1:54331 node lab/adversarial/forge.js`), `lab/adversarial/persona-cost.js`, `lab/adversarial/distbot.js`.

**Tier 1 — forge the score.** Generate a P-256 key, sign a receipt that claims `war_uncapped: 0.95, keys: 300`, POST it. The server checks the signature and the JSON shape; it never sees a keystroke.

| Observation | Value |
|---|---|
| Forged attestations accepted | 200 / 200 |
| Throughput, one process, server and database included | 105 identities / s |
| Classification on day 0 | `building` |
| Same key after the device row is 8 / 31 / 91 / 181 days old | war 0.65 `building` / **0.80 `verified`** / 0.92 `verified` / 0.95 `verified` |
| Public `/verify` for the day-181 forged receipt | `verified`, server-signed when a key is configured |
| Rate limit | 60 per key per hour; 65 attestations from 65 keys → 65 accepted |
| Storage per identity | 138 bytes (the private key) |

**Attacker-side cost per attestation** (no server, no browser): key generation 0.13 ms; one signed attestation 0.16–0.18 ms CPU and 483 bytes. A persona-month at one attestation per day is **0.005–0.006 CPU-seconds and ~35 KB**. One million personas for 30 days: about 1–2 CPU-hours and 35 GB.

**Tier 2 — fool the engine with a generator, unmodified client.** Synthetic keystrokes fed through the real capture (`extension/src/biometrics.js`) into the shipped engine on a fake clock.

| Generator | Result |
|---|---|
| Uniform-random timing (what the repository's own tests use as "human" typing) | raw 0.51, war 0.38 → `bot` |
| Fixed per-identity parameters, log-normal sampling, pauses, typos; ~40 lines, untuned | 24 sessions: none `bot`, all raw ≥ 0.60, **11 / 24 raw ≥ 0.80**; per-identity mean dwell and flight stable within a few ms across sessions |
| Wall-clock for 50 sessions of ~430 keystrokes | 94 ms (nothing checks that time elapsed) |

## Verified prices (checked 2026-09-25)

- Human micro-work: MTurk median ≈ $2 / hour ([Hara et al. 2018](https://arxiv.org/abs/1712.05796)); CAPTCHA farms $0.50–$1.00 per 1 000 solves, reCAPTCHA v2 $1–$2.99 per 1 000 ([2Captcha](https://2captcha.com/p/recaptcha_v2), [Capterra](https://www.capterra.com/p/10039723/2Captcha/)).
- Phone-number verification: from $0.05–$0.50 per activation ([SMS-Activate](https://sms-activate.app/pricing), [SMS-Man](https://sms-man.com/)).
- Residential proxies: $0.49–$1 / GB budget, $3–$8 / GB mid-tier ([DataImpulse](https://dataimpulse.com/blog/residential-proxy-pricing-comparison/), [Proxidize](https://proxidize.com/research/proxy-pricing-index-2026/)).
- Fake product reviews: ≈ €15 each, €9 000 per 1 000 ([Which? via Komando](https://www.komando.com/news/fake-amazon-review-costs/)).

## Derived

- **Personas per $1,000 / month against the current build:** bounded only by what the server will ingest. With no per-IP limit the attacker's cost is ≈ $0 and the ingestion bill is the defender's. With a per-IP limit forcing residential proxies, 35 GB per million persona-months costs $35–175 → **$0.00004–0.0002 per persona-month**, i.e. millions of mature personas per $1,000.
- **A "thousand-at-bat career"** (the revised plan's unit of maturity): ≈ 0.16 CPU-seconds and ≈ 1 MB. Time gates only the first harvest: a pipeline that starts N careers every day harvests N mature careers every day after the maturation delay.
- **If physical typing were enforced** (which requires a trusted capture boundary the web cannot provide): a 500-word post at 40 WPM is 12.5 minutes → $0.42 at $2 / h, ≈ $1 at $5 / h; a worker keying pre-written text at 100+ WPM → ≈ $0.17. Against review fraud priced at ≈ $15–18 per review this is not a deterrent; against sub-dollar spam it is.

## Hypotheses (not measured)

- The plan's Layer-4 metrics (active days, schedule plausibility, volume bands, variance, rolling similarity, no concurrency) do not move the persona-month cost, because each constrains numbers the attacker writes; a scheduler and a seeded generator satisfy all of them. Expected cost of "reputation at risk" is P(detection) × persona value, and P(detection) for a persona kept inside the published bands is ≈ 0.
- A generator tuned against the engine (mouse-path samples, higher edit ratio) passes more than 11 / 24. Not attempted.
- Hardware attestation on mobile (a keyboard app with Play Integrity / App Attest and a hardware-bound key) raises the cost to one physical device per persona, amortized over its life; phone farms exist and were not priced.

## What this means for the product

Keystroke evidence gives **integrity** (a receipt cannot be edited or moved to other text) and **process** (what was typed, pasted and deleted, when). It does not give **scarcity**. The shipping product (the Writer receipt for classrooms) relies on the first two and borrows identity from the classroom. Anything that presents the rhythm score, device age or a passport as proof that a human wrote something is overclaiming, and the language rules in `docs/product/PROCESS_RECEIPT.md` exist to prevent it.
