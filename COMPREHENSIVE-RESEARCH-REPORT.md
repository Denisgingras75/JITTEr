# Jitter: Comprehensive Research Report
## Full Inventory of Ideas, Code, Research, and Strategy
### Compiled 2026-03-05

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Core Idea](#the-core-idea)
3. [Project Inventory (12 Projects)](#project-inventory)
4. [Research Library (25+ Documents)](#research-library)
5. [Patent Status](#patent-status)
6. [Algorithm & Science](#algorithm--science)
7. [Business Strategy & Economics](#business-strategy--economics)
8. [Competitive Landscape](#competitive-landscape)
9. [Ideas Embedded Across the Codebase](#ideas-embedded-across-the-codebase)
10. [What's Built vs. What's Not](#whats-built-vs-whats-not)
11. [Pros and Cons Assessment](#pros-and-cons-assessment)
12. [Key Decisions Made](#key-decisions-made)
13. [Roadmap & Next Steps](#roadmap--next-steps)

---

## Executive Summary

Jitter is a behavioral biometrics system for **content provenance** — proving a human wrote something by analyzing HOW they typed, never WHAT. It spans 12 code projects (~11,500 lines), 25+ research documents, 2 filed provisional patents, and a full business plan.

**The one-liner:** "Elon's checkmark but not useless." Verifies the human, that's it.

**Patent status:** Two provisionals filed and confirmed:
- #63/994,858 (March 2, 2026) — base specification, 24 claims
- #63/997,498 (March 5, 2026) — CIP with 14 new claims (analog keyboards, cross-modal identity, progressive enrichment)

**Algorithm validation:** 96-100% bot detection, 0.4% false positive rate, 11/11 hardened checks passing across 1,000+ Monte Carlo runs.

**Market:** Behavioral biometrics $3B (2025) -> $12-18B (2032). Content provenance has NO incumbent building an embeddable widget.

---

## The Core Idea

### Philosophy (from jitter-bible.md)

Jitter **reveals** bots; it doesn't block them. It's a transparency layer, not a security tool.

**Origin:** Started with VRA crypto (video watermarking on ledger). Jitter is that for human authorship.

**Business model:** Stripe didn't build a payment app — they built `<script src='stripe.js'>`. Jitter builds `<jitter-input>` — a drop-in textarea replacement. The customer is the site (WGH, Reddit, universities), not the end user.

**Privacy moat:** Sees HOW you type, never WHAT. All processing is local. Sites get confidence scores, not raw biometrics. No centralized biometric database.

**Economic model:** Not about making faking impossible — it's a **toll on bot farms**. Cost per fake account goes from $0 to "not worth it."

| Timeline | Cost per Fake Account | vs. CAPTCHA |
|----------|----------------------|-------------|
| Day 1 | $0.04-$0.20 | 1x |
| Day 30 | $20-$60 | 500-2,000x |
| Day 90 | $57-$107 | 1,500-3,500x |
| Day 180 | $133-$275 | 3,000-9,000x |
| Day 365 | $200-$400 | 5,000-13,000x |

**The Phantom Typist Paradox:** By Day 90, compute cost to fake a passport (~$110) approaches the cost of hiring a real human (~$270/6mo). The rational strategy for bot farms becomes... hiring humans. The system wins by making fakes more expensive than the real thing.

### Non-Negotiable Rules
1. Mathematically hard to script
2. Completely frictionless
3. Privacy-first (metadata only, never content)
4. Reveal don't block
5. Ships WITH WGH (Memorial Day 2026)

---

## Project Inventory

### 1. Extension v2 (THE PRODUCT) — 2,188 lines JS

The flagship Chrome extension. Full biometric capture, ECDSA P-256 crypto, hash-chained badges, passport accumulation, cloud sync scaffold.

**Key files:**
- `biometrics.js` (441 lines) — Loki flow/gap, dwell, flight, DD, per-key fingerprinting on top 10 English letters, 30 bigrams, burst analysis, fatigue windows, mouse tracking
- `content.js` (383 lines, v10.0) — Runs on every page, floating shield UI, mints ECDSA-signed badges with 30+ metrics
- `crypto-utils.js` (211 lines) — ECDSA P-256, zero deps, Web Crypto API, hash chain linking badges
- `passport-utils.js` (229 lines) — 90-day rolling window, hourly activity histogram, suspicion scoring (0-100)
- `writer.js` (624 lines) — Append-only operation timeline with hash-chained checkpoints, replay system
- `auth-utils.js` (500 lines) — Firebase cloud sync scaffold (placeholder config, NOT functional)

**Bot detection signals:** botRhythm (std dev < 8ms), botSpeed (avg flow < 35ms), botLinearity (cognitive ratio < 1.2 with 200+ chars)

**Critical bugs found:**
1. verify.html does ZERO cryptographic verification — accepts forged badges
2. suspicionScore never included in badge payloads
3. Three incompatible badge formats across files
4. Firebase config is placeholder

**Rich documentation trail:**
- `JITTER_FOUNDATIONS.md` (610 lines) — Locked Box Principle, Sports Statistics Paradigm, Writing Ledger as "Git for Documents"
- `IP_DECLARATION.md` — Contemporaneous invention disclosure, Jan 14, 2025 file timestamps
- `CO_FOUNDER_AGREEMENT.md` — Template: 75-80% Denis / 20-25% co-founder, 4-year vest + 1-year cliff
- `PARTNER_NOTE.md` — Personal letter to collaborator about equity structure
- `CODE_REVIEW.md` — 12 issues identified, ranked by severity

### 2. WGH Test Lab — ~4,000 lines, 1,000 algorithm runs

The validation engine that **proved** Jitter works. Comprehensive adversarial testing against 6 bot types + 50 human profiles.

**Results (11/11 Checks Passing):**

| Bot Type | Detection Rate |
|----------|---------------|
| zero_delay | 100.0% |
| fixed_delay | 100.0% |
| uniform_random | 100.0% |
| gaussian_mimic | 100.0% |
| replay | 100.0% |
| sophisticated | 96.0% |
| **False Positive Rate** | **0.4%** |

**Critical weakness found:** 61% cross-user false match rate — two users at ~200ms/key indistinguishable by mean IKI alone. Fixed in v2.1 by adding std deviation, bigrams, per-key dwell.

**Cracks identified and patched:**
- Dwell time floor: mean_dwell < 27ms -> reject
- Variance floor: std_inter_key < 9ms -> reject
- Dwell uniformity: per-key CV < 0.09 -> reject
- Entropy floor: Shannon < 2.25 -> reject
- Perfect consistency flag: >= 0.98 -> review

### 3. SDK (Embeddable Widget) — ~1,200 lines

Standalone `<script>` tag for any website. Core extracted from WGH's jitter-box.js. Scaffold stage.

**Integration model:**
```html
<script src="https://cdn.jitter.dev/v1/jitter.min.js"></script>
<script>Jitter.init({ siteKey: 'site_xxx' })</script>
```

**Time-weighted confidence (the core economic thesis):**
- < 7 days: max confidence 0.4
- 7-30 days: 0.6
- 30-90 days: 0.8
- 90-180 days: 0.95
- 180+ days: 1.0

**Missing:** API endpoint, session management, end-to-end wiring, Supabase functions.

### 4. Extension v1 — 649 lines

Original prototype. Same core concept, simpler. No shared biometric engine, no ECDSA, no hash chain, no passport utilities.

### 5. Anvil Extension (Audit version) — 2,469 lines

Most comprehensive UI of any version. Full-screen writer, popup, verifier dashboard, icon system. Good reference for UX patterns.

### 6. Anvil-3-Claude — 1,019 lines

Bridge between v1 and audit version. Architecture evolution point.

### 7. Anvil-Extension-2 — 958 lines

Another iteration showing code evolution.

### 8. Jitter-Copy — 591 lines

Snapshot backup for patent filing reference.

### 9. Anvil Keyboard (Android IME) — Kotlin

Full QWERTY Android keyboard with biometric tracking. Flight time, pressure sensing, badge generation. Less sophisticated than desktop (no bigrams, bursts, fatigue, cursor tracking).

**Rank system:** Novice (0) -> Silver (10K) -> Gold (50K) -> Platinum (100K) -> Diamond (500K keystrokes)

### 10. Google-Drive Copies

Earlier extension files + economic thesis .docx documents. Deprecated.

### 11. B2B Platform (Design Only)

React SPA for platform customers. Self-service API key management, usage dashboard, billing.

**Pricing tiers:**
| Tier | Price | Verifications/mo |
|------|-------|-----------------|
| Free | $0 | 1,000 |
| Starter | $49/mo | 50,000 |
| Business | $199/mo | 500,000 |
| Enterprise | Custom | Unlimited |

### 12. Integration Protocol (Design Only)

Four-level onramp: Sandbox (0 min, no account) -> Free API Key (2 min) -> Server-Side Verify -> Passport Network. Philosophy: "Inertia-Free Verification."

---

## Research Library

### Algorithm & Science (7 docs)

**Keystroke Science Deep-Dive** — Academic foundations. TypeNet EER 2.2% (physical keyboard), 9.2% (touchscreen). Typing speed ICC = 0.79 over 2 years (substantial stability).

**15 Algorithm Hardening Enhancements** — Each with pseudocode and attack vectors defeated:
1. Physiological tremor spectral analysis (8-12 Hz PSD from browser timing — NOT in literature)
2. Sub-millisecond timestamp fraction (kills injection attacks)
3. GAN artifact detection via kurtosis + bigram cross-correlation
4. Error dynamics (kills zero-error bots)
5. Handedness asymmetry (kills averaging attacks)
6. Entropy rate analysis (catches GANs)
7. Motor program autocorrelation
8-15. [Additional signals documented with full pseudocode]

**Confidence Scoring Pipeline** — 14-core signal vector, two-stage scoring (liveness + identity), combined jitter_score = min(liveness, identity) x passport_weight. Includes "Bronny Test" — impossible stat lines trigger scrutiny.

**Temporal Fortress Model** — Mathematical proof that forgery cost grows superpolynomially: F(N,K) = F_0 x N^(K/2). At 100 sessions, 50 signals: search space is 10^25 times smaller. Lock-in threshold: ~50 sessions.

**Mobile Biometrics** — Touch geometry + accelerometer/gyroscope. IMU liveness: 8.5x acceleration vs baseline (kills ALL software bots). No physical tap = instant 0.0 score.

**Bot Farm Economics** — 10,000 fake accounts at Day 90: $570K-$1.07M/month (vs $750-1,650 for CAPTCHA-only).

**Temporal Fortress Research** — 11-section academic treatment: Bayesian profile tightening, anchor + drift model, compound signal multiplication, replay/generative attack failure, cross-site O(N x S^2) coordination complexity.

### Hardware & Sensors (5 docs)

**Touch Pressure Web APIs** — Pressure is effectively DEAD on all mobile platforms. iPhone returns 0.5 (constant). Android returns area-proxy (unreliable). Only iPad + Apple Pencil has real data.

**Force Sensors on Phones** — No mainstream phone has pressure hardware post-2019. 3D Touch dead since iPhone 11. S Pen (Samsung Ultra) is stylus-only.

**Hall Effect Analog Keyboards** — 0.1mm resolution, 400x signal density vs standard keyboards. WebHID blocks access (requires desktop daemon). Market trajectory: <1% now, 30-40% gaming by 2027.

**Hall Effect Gaming** (4 docs) — Force curve biometrics, anti-cheat integration, gaming controllers, DualSense analog triggers (50M+ owners). NO published research on Hall Effect depth for biometric ID — first-mover gap.

### Architecture & Integration (7 docs)

**Passport System** — Five tiers: Infant (0-7d) -> Adolescent (7-30d) -> Mature (30-90d) -> Established (90-365d) -> Veteran (365+). 3-session karma gate for new accounts.

**API Design** — Stripe-like simplicity. Five endpoints. Two token types (public/private). Test mode first.

**Federation Model** — v1: per-site passport (ships now). v2: global portable passport with trust transfer protocol.

**Passport Data Model** — ~9KB per passport. Privacy split: raw events in-memory only, storage has statistical aggregates only.

**Site Integration Guide** — One script tag, one custom element, server-side token verification. On-device Web Worker processing.

### Video Provenance (4 docs)

**C2PA Standard** — 200+ members (Adobe, Microsoft, etc.). Proves "this came from a Pixel 10" but NOT "a human created this." Gap Jitter fills: device provenance + human authorship = full content credibility.

**Deepfake Landscape** — 500K (2023) -> 8M (2025), 900% growth. Output-analysis detection failing. Behavioral analysis (Jitter's territory) is proactive.

**Phone-Level C2PA** — Pixel 10 full support, Samsung AI-only, Apple absent.

**Camera Signing** — Hardware attestation + Jitter behavioral identity = authentication chain for deepfakes.

### Market & Legal (3 docs)

**Competitive Landscape** — TypingDNA ($8.8M raised, stalled), BioCatch ($1.3B, banking only), Turnitin Clarity (no identity biometrics), GPTZero ($24M ARR, output analysis only), Roundtable (87% accuracy, $39/mo).

**Patent Conflict Analysis** — Core claims defensible but not clean. Strongest novel claim: Hall Effect force curves (NO prior art). Most dangerous competitor: Purely Human (purelyhuman.world).

**Patent Success Impact** — TAM: $800M-$2.5B today -> $5-12B by 2030. EU AI Act (Aug 2, 2026) creates compliance demand. Acquisition value: patent only $500K-$5M; patent + product + ARR: $8M-$50M.

---

## Patent Status

### Filed and Confirmed

| Filing | App # | Date | Fee | Claims |
|--------|-------|------|-----|--------|
| Base Provisional | 63/994,858 | March 2, 2026 | $65 | 24 |
| CIP Provisional | 63/997,498 | March 5, 2026 | $65 | 14 |

**Inventor:** Denis Michael Gingras, Oak Bluffs, MA 02557

### Base Specification (24 Claims)
Three embodiments: software (browser extension), hardware (custom biometric keyboard), mobile (accelerometer/gyroscope). 11-layer multi-signal detection pipeline. Smart Badges + Global Passport + Badge Chaining.

### CIP (14 New Claims)
Five novel additions:
1. Software-only analog keyboard integration via commercial keyboards (Wooting, Keychron, etc.)
2. Actuation depth biometric features (attack velocity, bottom-out depth, aftertouch, micro-tremor)
3. Cross-modal identity verification (same human across mobile + desktop)
4. Progressive sensor enrichment (binary keyboard 1x -> analog + mobile 1000x+ spoofing difficulty)
5. Anti-spoofing mechanisms (detecting mechanical actuators)

### Claim Strength Assessment

| Claim Area | Strength | Notes |
|------------|----------|-------|
| Hall Effect force curves | STRONGEST | No prior art found anywhere |
| Cross-modal identity | STRONG | No prior art combining mobile + desktop biometrics for content provenance |
| Progressive sensor enrichment | STRONG | Novel adaptive verification concept |
| Global Passport (cross-domain) | MODERATE | Must differentiate from reputation patents |
| Continuous keystroke capture | WEAK | US8332932B2 (2012) covers this |
| Per-key dwell fingerprint | WEAK | US4805222A (1989) covers this |
| Multi-layer scoring | MODERATE | BioCatch US8938787 is close |

### Deadlines
- **Hard deadline:** March 2, 2027 (file non-provisional or first provisional expires)
- **Conservative target:** June 2026 (give attorney time)
- **Recommended:** File utility claiming priority to BOTH provisionals

---

## Business Strategy & Economics

### Revenue Model

**B2B SaaS (primary):** Sites embed `<jitter-input>`, pay per verification.
- Free: 1,000 verifications/mo
- Starter: $49/mo (50K)
- Business: $199/mo (500K)
- Enterprise: Custom

**School essay mode (separate SKU):** $8/student/year per institution.

**B2C flip (later):** Extension grows passport network. Users eventually WANT "Jitter Verified" status. Influencers, students, journalists, gamers.

### Use Cases (Priority Order)
1. Review platforms (WGH, Yelp) — proves reviews are human-written
2. Forums (Reddit) — karma backed by biology, not just time
3. Education — proves student wrote the essay, without proctoring cameras
4. Video/media provenance — combined with C2PA for deepfake defense
5. AI training data — proves training data was human-generated
6. Ad platforms — human engagement verification
7. Gaming — anti-cheat via behavioral biometrics
8. Any UGC site — universal content provenance

### Regulatory Tailwinds
- **EU AI Act (Aug 2, 2026):** Article 50 mandates AI-generated content labeling. Creates compliance demand.
- **California SB 53:** First enforceable US AI regulatory framework (Sep 2025).
- **"Know Your Human" trend** in agentic commerce.

### The Data Asset Moat
The real moat is not the algorithm — it's the **passport registry**. At 1M veteran passports with 6 months history:
- Population-level behavioral distributions precisely calibrated
- Outliers (bot clusters) become statistically glaring
- Cross-passport correlation detects Sybil attacks
- Switching cost for competitors is enormous

---

## Competitive Landscape

| Competitor | What They Do | Jitter's Advantage |
|-----------|-------------|-------------------|
| **TypingDNA** | Keystroke timing for 2FA, continuous auth | No hardware signals, no content provenance, no portable passport |
| **BioCatch** | Behavioral biometrics for banking fraud ($1.3B) | Banking-only, no content provenance widget, no embeddable SDK |
| **Turnitin Clarity** | Revision history + paste detection | No identity biometrics, can't answer "same person as last time?" |
| **GPTZero** | AI text detection ($24M ARR) | Output analysis (reactive, failing). High false positives. |
| **Roundtable** | "Proof of Human" bot detection (87%) | Lower accuracy, no passport accumulation, no time-weighted confidence |
| **Self** | Blockchain + ZK proofs for Sybil resistance | No behavioral biometrics, no content-level verification |
| **CAPTCHA** | One-time bot gate | Solved by AI at 85-100%. No ongoing verification. $0.001 to bypass. |
| **Purely Human** | Same core concept | No patent filed yet. Jitter's March 2 priority wins. |

**The gap nobody fills:** No competitor builds an embeddable content-provenance widget with time-accumulated behavioral identity. They all do authentication (who you are) or fraud detection (stopping transactions). None do "this human wrote this text."

---

## Ideas Embedded Across the Codebase

### From JITTER_FOUNDATIONS.md
1. **Locked Box Principle** — Metadata only. Never content. Never keys. Just timing.
2. **Sports Statistics Paradigm** — Like batting averages. Over-time behavioral proof. Time is immutable.
3. **Writing Ledger as Git for Documents** — Append-only, tamper-evident, replayable proof of origin. Can't remove a paste event.
4. **Composition vs. Transcription Detection** — "Probably typed from another source" is a separate signal from "bot detected."

### From jitter-bible.md
5. **Karma gate backed by biology** — Like Reddit karma but you can't farm it. 3-session minimum before content surfaces.
6. **Reveal don't block** — Bot content gets tagged, not hidden. Readers decide. Transparency is the product.
7. **B2C flip** — Starts B2B (sites embed), becomes B2C (people want the passport). The VeriSign SSL padlock model.

### From Research Documents
8. **Phantom Typist Paradox** — By Day 90, the rational bot-farm strategy becomes hiring real humans. The system wins by making fakes more expensive than reality.
9. **Temporal Fortress** — Forgery cost grows superpolynomially. Time is the un-fakeable dimension.
10. **Progressive Sensor Enrichment** — Each additional signal dimension multiplies spoofing difficulty. Binary keyboard (1x) -> analog (10-100x) -> mobile (10-50x) -> combined (1,000x+).
11. **C2PA + Jitter stack** — C2PA proves device provenance; Jitter proves human authorship. Together = full content credibility.
12. **Bronny Test** — Named after statistical impossibility detection. Perfect consistency over 5 sessions = bot signature, because humans are messy.

### From Extension Code
13. **Badge as proof object** — Self-contained, portable, verifiable without server. ECDSA P-256 signed, hash-chained.
14. **Suspicion scoring** — 6 independent signals (superhuman output, unnaturally consistent, excessive sessions, high night activity, new + high output, extremely long sessions).
15. **Hash chain** — Each badge references previous badge's SHA-256. Prevents backdating history. Like blockchain but for individual authorship.

### From Patent Claims
16. **Software-only analog keyboard integration** — Capture biometric depth from commercial Hall Effect keyboards via open-source SDK, no custom hardware needed.
17. **Cross-modal identity** — Same human verified across phone + desktop through modality-invariant features (bigram timing ratios, cognitive pauses, error correction patterns).
18. **Anti-spoofing via mechanical actuator detection** — Linear profiles, uniform depth, symmetric depression/release, absent micro-tremor = robot arm, not human.

### From Integration Protocol
19. **Inertia-Free Verification** — Developer sees Jitter working in under 3 minutes, zero account, zero credit card, zero backend changes.
20. **Four-level onramp** — Public sandbox (instant) -> Free API key (2 min) -> Server-side verify (production) -> Passport network (passive).

### From Partner Note / Co-Founder Agreement
21. **Equity structure thinking** — 75-80% Denis / 20-25% co-founder. 4-year vest, 1-year cliff. Decision-making authority retained.
22. **IP Declaration** — Contemporaneous invention disclosure establishing Denis as sole original inventor, Jan 14, 2025 file timestamps.

---

## What's Built vs. What's Not

### Production-Quality
- Biometric capture engine (69+ metrics, proven by WGH Lab)
- ECDSA P-256 cryptographic implementation (zero deps)
- Hash chain concept (prevents backdating)
- Passport suspicion scoring (6 independent signals)
- Writing Ledger (append-only timeline + hash-chained checkpoints)
- Algorithm validation suite (1,000+ Monte Carlo runs, 50 human profiles, 6 bot types)
- Patent specification + CIP specification
- Patent drawings (8 hand-drawn + 5 programmatic)

### Working Prototype (Has Bugs)
- Chrome extension v2 (functional but verify.html doesn't verify, 3 badge format conflicts)
- Writer mode (ledger recording works, replay works)
- Content script (capture works, state management issues)
- Android keyboard (basic biometrics, less sophisticated)

### Design Complete, No Code
- B2B Platform (pricing, dashboard, admin panel)
- Integration Protocol (4-level onramp)
- Federation Model (cross-site passport trust transfer)
- API Design (5 endpoints, Stripe-like)

### Not Started
- Multi-layer scoring pipeline (ZERO of 11 layers implemented)
- Server-side verification API
- Supabase Edge Functions
- SDK end-to-end wiring
- npm package publishing
- Chrome Web Store listing
- Firebase real credentials
- Time-weighted confidence scoring (the core economic thesis has no code)
- Cross-site passport matching
- Hall Effect keyboard integration
- Mobile IMU integration
- WGH integration (capture on review submit)

---

## Pros and Cons Assessment

### PROS

**Technical**
- Algorithm is proven (96-100% detection, 0.4% FP, 1,000+ test runs)
- Privacy-by-architecture is genuine (not just policy)
- Zero dependencies in core — maximum browser compatibility
- ECDSA P-256 implementation is solid
- 15 hardening enhancements documented with pseudocode
- Mobile IMU provides binary liveness signal bots can't fake

**Strategic**
- Two provisionals filed — priority date established
- Hall Effect force curves have NO prior art — strongest novel claim
- EU AI Act (Aug 2026) creates regulatory demand
- No competitor builds embeddable content-provenance widget
- Time-weighted confidence is genuinely novel economic model
- Phantom Typist Paradox makes bot farms economically irrational by Day 90
- C2PA partnership angle gives device + human = complete stack

**Business**
- Stripe-like integration model proven effective
- Multiple revenue streams (B2B API, school SKU, B2C flip)
- WGH provides first customer and proof point
- Data asset moat grows with every user session
- Low startup cost ($130 in patent fees so far)

### CONS

**Technical**
- 61% cross-user false match rate on basic metrics (fixed in v2.1 but not shipped)
- verify.html showstopper bug — no actual cryptographic verification
- Three incompatible badge formats across codebase
- Time-weighted confidence scoring (core thesis) has ZERO implementation
- Multi-layer scoring pipeline has ZERO of 11 layers built
- Firebase cloud sync is completely non-functional (placeholder config)
- Pressure sensing is dead on all current mobile platforms
- Hall Effect keyboards require WebHID (Chrome/Edge only) or desktop daemon
- EER for keystroke dynamics under attack: 10-18% (academic reality)

**Strategic**
- Individual patent components have prior art back to 1989
- Patent claims are "defensible but not clean"
- Purely Human (purelyhuman.world) is pursuing same concept
- TypingDNA has $8.8M funding and existing market presence
- BioCatch has 92+ patents and $1.3B valuation in adjacent space
- Hall Effect keyboard market is <1% penetration currently
- Must file non-provisional by March 2027 or lose priority

**Business**
- Solo founder bootstrapping — limited execution bandwidth
- WGH Memorial Day deadline creates competing priorities
- No revenue yet, no customers yet, no Chrome Web Store listing
- B2B platform is design-only, no code
- School market requires institutional sales (slow, complex)
- Enterprise pricing requires support infrastructure

**Known Attack Vectors**
- Off-the-shelf tools (Emunium, PasteHuman, TypeSim) simulate human timing for free
- KeyGAN (Jan 2025) generates realistic keystroke patterns
- Replay attacks: 87.75% success with 50-200 stolen keystrokes
- Human farms: $0.03-0.10/bypass — technically unsolvable
- Cold start problem: first 10K users vulnerable

---

## Key Decisions Made

1. **Content provenance, not bot detection** — Show, don't block. Transparency as product.
2. **Per-site passport first (v1), global passport later (v2)** — Ships faster, proves concept, establishes data moat.
3. **Timing-only for independent patent claims** — Works on all keyboards. Pressure/force in dependent claims.
4. **Privacy-first architecture** — No raw keystroke data ever stored or transmitted. Architectural, not policy.
5. **Ships WITH WGH** — Memorial Day 2026. First customer = own product.
6. **Vanilla JS core** — var/function, zero deps, max browser compat. Framework wrappers separate.
7. **ECDSA P-256** — Small signature, Web Crypto native, mathematically sound.
8. **Supabase + Vercel** — Free tier infrastructure. Swap when revenue exists.
9. **75-80% Denis equity** — Retains decision-making authority with any co-founder.
10. **Hall Effect as v2** — Can't access via web browser today (WebHID blocks). Future-proofed in patent.
11. **Mobile pressure abandoned** — 3D Touch dead since 2019. IMU is the winning mobile signal.
12. **Reveal over block** — Bot content tagged, not hidden. Readers decide.

---

## Roadmap & Next Steps

### Immediate (Ships with WGH, Memorial Day 2026)
- [ ] Mini-passport (binary human/bot output)
- [ ] Karma gating (3-session gate before content surfaces)
- [ ] Software biometrics only
- [ ] Core capture engine integrated into WGH review flow

### Summer 2026
- [ ] Extract `<jitter-input>` as npm package
- [ ] Fix verify.html showstopper (add real crypto verification)
- [ ] Implement time-weighted confidence scoring
- [ ] Unify badge format across codebase
- [ ] SDK end-to-end wiring with Supabase Edge Functions
- [ ] Chrome Web Store listing for extension

### Fall 2026
- [ ] Patent attorney engagement + claims rewrite
- [ ] Start Substack (5 posts ready: origin story, economics, EU Act, science, Yelp replacement)
- [ ] B2B platform MVP
- [ ] First external customer integration

### Early 2027
- [ ] File non-provisional patent (claiming priority to both provisionals)
- [ ] Add 15 algorithm enhancements to patent
- [ ] Economic toll booth model documentation
- [ ] Temporal fortress math in claims

### Later (v2+)
- [ ] Global Passport (cross-site portable identity)
- [ ] Browser extension network growth
- [ ] Hall Effect hardware integration (as market grows)
- [ ] Mobile accelerometer/gyroscope layer
- [ ] Video/camera provenance (C2PA + Jitter)
- [ ] B2C passport flip
- [ ] Federation protocol (cross-site trust transfer)

### Key Deadlines
| Date | What |
|------|------|
| Memorial Day 2026 | WGH launch with Jitter baked in |
| August 2, 2026 | EU AI Act full effect (market tailwind) |
| March 2, 2027 | First provisional expires (MUST file non-provisional) |
| March 5, 2027 | CIP provisional expires |

---

## Appendix: File Locations

All source material is at `/Users/denisgingras/Documents/jitter-patent-filing/`

**Codebase:** `/codebase/` (12 projects, 97 files, ~11,500 lines)
**Research:** `/research/` (25+ documents across 6 subdirectories)
**Patent specs:** `specification.md`, `CIP-PROVISIONAL-SPECIFICATION.md`
**Filing receipts:** `FILING-RECEIPT.md` (both application numbers)
**Bible:** `jitter-bible.md` (canonical framing)
**Current SDK:** `/Users/denisgingras/jitter-sdk/` (active development)
