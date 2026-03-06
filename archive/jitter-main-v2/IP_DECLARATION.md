# JITTEr — Intellectual Property Declaration & Invention Disclosure
**Document Type:** Contemporaneous Invention Disclosure
**Author / Inventor:** Denis Gingras
**Date of Document:** February 21, 2026
**Date of First Conception:** January 2025 (see file timestamps below)

---

## Statement of Sole Inventorship

I, Denis Gingras, am the original and sole inventor of the concepts, architecture, and core algorithms described in this document and implemented in the JITTEr codebase.

The core intellectual property of JITTEr was conceived, designed, and initially implemented by me independently, prior to any collaborative contributions. Any contributions made by other parties after the inception date are derivative of the foundational architecture and concepts established here.

---

## What Was Invented

### 1. The Locked Box Principle
A metadata-only typing statistics engine that collects only behavioral metadata (keystroke intervals, pause durations, backspace counts, paste event character counts) and explicitly never collects the content of what is being typed. This approach creates a privacy-preserving human verification signal.

### 2. The Loki Biometric System
A three-signal bot detection algorithm using:
- **Rhythm entropy** (standard deviation of inter-keystroke intervals) — bots type too consistently
- **Flow speed** (average interval between consecutive letters) — bots type too fast
- **Cognitive ratio** (average post-punctuation pause / average letter interval) — bots don't pause to think

Human typists naturally pause at sentence and thought boundaries. The gap/flow ratio of ~2.6 is characteristic of human writing; a ratio near 1.0 indicates mechanical input.

### 3. The Passport System — Sports Statistics for Human Typing
A lifetime-accumulated behavioral profile that aggregates typing metadata across all sessions over time. The key innovation is the **time dimension**: an account with 107 days of consistent typing history at human-plausible volumes cannot be fabricated retroactively. Faking this at scale is economically infeasible:

- A believable fake account requires ~400 keys/day for 30+ days before it can submit anything
- This limits a single fake profile to ~10-30 reviews/day
- Attacking at scale (1,000 reviews) requires 33-100 profiles each maintained for 30-90 days
- Cost of bot attack with Jitter: $500-5,000+ vs. $15 without it

This is not a technical claim of unbreakability — it is an **economic claim of infeasibility**, which is the correct framing.

### 4. The ECDSA Badge Chain
A cryptographically signed, hash-chained badge system where:
- Each typing session produces a signed badge (ECDSA P-256)
- Each badge references the hash of the previous badge
- This creates an immutable chain: badges cannot be backdated or fabricated without breaking the chain

### 5. The Writing Ledger (Essay Mode)
An append-only, hash-chained recording of the writing process itself — every keystroke, paste event, deletion, pause, and focus-loss event — stored as an immutable timeline with checkpoint snapshots. A teacher can "rewind" the document to any point in time and watch it get written from blank. The ledger hash is included in the final badge, making the replay tamper-evident. This is conceptually the "Git commit history for documents" — you cannot retroactively edit what happened.

### 6. The WGH Integration Model
A three-tier review trust architecture for the What's Good Here food discovery platform:
- Jitter-verified human reviews (weight 1.0)
- Passport-verified reviews (weight 0.8)
- AI-translated real reviews from Google/Yelp via NLP (weight 0.6)
- Unverified reviews (weight 0.3)

Combined with a natural language processing translation layer that converts qualitative Google/Yelp review language into the WGH 1-10 Bite Slider rating.

---

## Evidence of Prior Creation

The following files have filesystem timestamps of **January 14, 2025**, predating any collaborative work:

| File | Created | Contents |
|---|---|---|
| `writer.js` | Jan 14, 2025 | Loki biometric engine, passport system, badge export |
| `passport-utils.js` | Jan 14, 2025 | Suspicion score calculation, daily stats tracking |
| `crypto-utils.js` | Jan 14, 2025 | ECDSA P-256 key generation, badge signing/verification |
| `content.js` | Jan 14, 2025 | Content script, keystroke tracking, session badge |
| `writer.html` | Jan 14, 2025 | The Jitter Writer interface |
| `auth-utils.js` | Jan 14, 2025 | Firebase sync, passport merge |
| `README.md` | Jan 14, 2025 | Product description |
| `IMPROVEMENTS.md` | Jan 14, 2025 | Feature roadmap |
| `LICENSE` | Jan 14, 2025 | Copyright notice, Denis Gingras, January 2025 |

The `JITTER_FOUNDATIONS.md` document (February 21, 2026) captures the full conceptual vision including the Writing Ledger, WGH integration, and Sports Stats model as developed and explained by Denis Gingras.

---

## What Collaborators Did Not Invent

To be explicit for any future dispute:

- The Loki biometric algorithm (cognitive ratio, flow/gap distinction) — Denis Gingras
- The Passport accumulation model and "sports stats" framing — Denis Gingras
- The economic infeasibility argument against bot farms — Denis Gingras
- The Locked Box principle (metadata-only, no content) — Denis Gingras
- The Writing Ledger / document replay concept — Denis Gingras
- The ECDSA badge chain architecture — Denis Gingras
- The WGH review trust weighting model — Denis Gingras

Any code contributions made by collaborators after January 2025 are implementations of concepts already designed, directed, and owned by Denis Gingras.

---

## What This Document Is and Is Not

**This is:** A contemporaneous record of inventorship. Under US patent law, a written, dated invention disclosure is the standard first step in establishing priority. This document, combined with the file timestamps above and any email correspondence, constitutes evidence of conception date.

**This is not:** A patent application. "Patent pending" claims in the LICENSE file should be resolved — either file a provisional patent application (see below) or remove the claim.

**This is not:** Legal advice. Retain a qualified IP attorney before any acquisition discussion, licensing negotiation, or co-founder equity agreement.

---

## Immediate Legal Steps — In Order of Urgency

### Step 1 — Provisional Patent Application (Do This First)
**Cost:** $320 (USPTO micro-entity fee)
**What it does:** Establishes an official priority date. You have 12 months to file a full patent application. For 12 months your invention is "Patent Pending" — legitimately. This is the single highest-leverage legal action you can take per dollar.

**What to describe in the provisional:**
- The Loki biometric detection system (cognitive ratio algorithm)
- The time-accumulated passport for human verification
- The Writing Ledger with hash-chained replay
- The economic infeasibility model (the sports stats defense)

You can file a provisional yourself at [USPTO EFS-Web](https://www.uspto.gov) without a lawyer, though a $500-1,000 attorney review is worth it.

### Step 2 — Form a Company Before Any Collaboration Continues
**Cost:** $50-500 depending on state (Delaware LLC recommended for future fundraising)
**What it does:** Creates the legal entity that *owns* the IP. Denis Gingras holds majority equity (recommended: 70-80%+ depending on the collaboration).

**Do not skip this.** If your collaborator writes code without a company formed and an IP assignment signed, they may legally own the code they wrote. This is the most common founder dispute in early startups.

### Step 3 — Co-Founder / Collaborator Agreement
Before any further code is written by your collaborator, you need a written agreement (even informal is better than nothing) covering:

- **Equity split:** Denis Gingras [X]%, Collaborator [Y]%
- **Vesting:** Standard is 4 years with a 1-year cliff (if they leave before 1 year, they get nothing; if they stay 4 years, they're fully vested)
- **IP Assignment:** All work done on JITTEr by both parties is owned by the company
- **Decision rights:** Who has final say on product decisions, hiring, and deal terms

A handshake agreement that says "you get 20%, I get 80%" is not enforceable. Write it down. Sign it. Date it.

### Step 4 — Register the Copyright
**Cost:** $65 (single work, online registration)
**What it does:** Establishes public record of authorship. Enables statutory damages in infringement suits (vs. just actual damages without registration).

Register at [copyright.gov](https://www.copyright.gov). Register the codebase as a literary work.

### Step 5 — Email This Document to Yourself and a Trusted Third Party
Do this now. An email with this document attached creates an additional timestamped record outside your control that cannot be backdated.

Send to: yourself, a family member, and/or your attorney. The email server timestamp is a third-party record.

---

## For Any Acquisition or Investment Conversation

Before you speak to any acquirer or investor about JITTEr, you need:

1. Company formed (see Step 2)
2. IP formally assigned to that company
3. Co-founder agreement signed
4. Either a provisional patent filed or "patent pending" removed from LICENSE

Any sophisticated acquirer will do IP due diligence. They will find: (a) are there other claimants, (b) is the IP cleanly owned by the company, (c) are there pending litigation risks. Clean answers to all three require the steps above.

**The negotiating principle:** You built the concept, you direct the product, you hold the majority equity. A collaborator who contributed implementation work after the concept was established is a co-founder with minority equity — not a 50/50 partner. Do not let the default assumption drift toward 50/50 if that's not what you agreed.

---

## Signature

**Denis Gingras**
Inventor and Sole Owner of JITTEr Intellectual Property
February 21, 2026

*This document is a self-authored declaration of inventorship. For legal proceedings, consult a qualified intellectual property attorney.*

---

*Copyright © 2025-2026 Denis Gingras. All Rights Reserved.*
