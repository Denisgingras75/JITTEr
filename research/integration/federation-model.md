# Jitter Passport: Federation Model & Cross-Site Trust Architecture
## Date: 2026-03-02 | Source: Research agent sprint
## Purpose: Cross-site trust transfer architecture for the v2 Global Passport (patent filing)

---

## 1. Overview

The Jitter Protocol is designed in two phases. v1 is a per-site passport: each site maintains its own independent behavioral identity record for each user. v2 introduces the Global Passport: a single portable behavioral identity credential that carries earned trust across any Jitter-integrated site. This document defines the federation architecture, trust transfer protocol, privacy constraints, and the network effect moat that the passport registry creates.

---

## 2. Why v1 Is Per-Site Only

v1 deliberately ships without cross-site federation. The reasons are strategic and technical:

**Ships faster.** Federation requires a trust authority, a cross-site attestation protocol, and standardized export/import formats. Each of these adds significant specification, security review, and implementation time. v1 avoids all of it.

**Proves the concept.** The core value proposition — that behavioral accumulation over time creates a meaningful identity signal — must be demonstrated and measured before cross-site trust transfer becomes a meaningful product. v1 generates that evidence.

**Simpler security surface.** A per-site passport has one trust boundary: the issuing site. A federated passport has two: the issuing site and the receiving site's trust in the issuing site's attestation. This is a meaningfully larger attack surface that requires additional hardening before deployment.

**The v1 moat is still real.** Even per-site, a 90-day Mature passport on a single platform costs a bot farm $57-107 to maintain and creates a 1,500-3,500x cost increase over CAPTCHA-only defenses (source: bot-farm-economics.md). v1 alone is commercially viable.

**The federation upgrade is backward-compatible.** The data model (see passport-data-model.md) is designed so that a v1 passport can be exported and imported into a v2 federation with no schema migration. The `export_signature` and `public_key_fingerprint` fields exist from day one precisely for this upgrade path.

---

## 3. v2 Vision: Portable Identity Across Sites

The v2 Global Passport is analogous to a driver's license: issued once by a trusted authority, accepted everywhere that authority is recognized.

A driver's license works because:
- A single licensing authority (the state DMV) performs the original identity verification
- Every accepting party (car rental desk, bar) trusts the issuer's attestation
- The license is not re-issued for every use case — it is presented as a credential
- The license has a standard format that any accepting party can read

A Jitter Global Passport works the same way:
- A user builds behavioral history on any Jitter-integrated site (the "issuing site")
- That history is cryptographically attested and packaged as a portable passport
- Any other Jitter-integrated site (the "receiving site") can verify the attestation and accept the passport's weight — discounted by a cross-site trust factor
- The user does not re-enroll from scratch on every new site

The key difference from a driver's license: the Jitter passport's "credential" is not who you are (name, date of birth) but how you type. The behavioral biometric IS the identity.

---

## 4. Trust Transfer Protocol

### 4.1 Protocol Overview

When a user presents a passport from Site A on Site B:

```
1. User authenticates with Site B (new account creation or login)
2. User offers to import existing passport from Site A
3. Site B requests an attestation package from Site A's Jitter registry
4. Site A issues a signed passport export (see passport-data-model.md Section 8)
5. Site B verifies the signature, checks passport age and weight
6. Site B applies a cross-site trust discount and initializes a local passport
7. User begins on Site B with a non-zero starting weight (not Infant tier)
```

### 4.2 Trust Discount Formula

A passport imported from another site does not arrive with full weight. The receiving site applies a trust discount:

```
W_received = W_exported * D_site * D_age
```

Where:
- `W_exported` = passport weight at time of export (0.05 to 0.95)
- `D_site` = site trust discount factor (0.5 to 1.0, set by the federation authority based on Site A's track record of issuing accurate passports)
- `D_age` = export recency discount: `e^(-days_since_export / 30)` — a passport exported 30 days ago is worth less than one exported today

**Example:**
- Site A passport weight: 0.80 (Established tier)
- D_site for Site A: 0.75 (Site A is a known, reputable Jitter integrator)
- D_age: export is 7 days old → e^(-7/30) = 0.79
- W_received = 0.80 * 0.75 * 0.79 = **0.47** (Mature tier starting weight)

The user begins on Site B in the Mature tier rather than Infant. This is a meaningful advantage: they skip the 30-day Adolescent period during which content has low trust weight. But they do not arrive with full Established weight — they must earn the remaining trust through sessions on Site B.

### 4.3 Attestation Package Structure

The signed package that Site A issues when a user requests a trust transfer:

```json
{
  "attestation_version": "1.0",
  "issued_by": "wgh.app",
  "issued_at": "ISO-8601",
  "expires_at": "ISO-8601 (48 hours from issuance)",
  "passport_id": "uuid (Site A's local ID)",
  "public_key_fingerprint": "string",

  "claims": {
    "session_count": "integer",
    "calendar_age_days": "integer",
    "weight": "float",
    "tier": "string",
    "anomaly_score_lifetime_max": "float",
    "enrolled_at": "ISO-8601"
  },

  "template_summary": {
    "signal_count": "integer",
    "top_signals_stable": ["digraph_dd", "negative_flight_freq", "shift_dwell"]
  },

  "signature": "Ed25519 signature over canonical JSON of (issued_by + issued_at + passport_id + claims)"
}
```

**What is NOT in the attestation package:**
- Raw behavioral templates (signal means/variances)
- Session history records
- Device fingerprint data
- Typed text

The receiving site gets the passport's claim of trustworthiness, not the underlying biometric data. This is the privacy-preserving core of the federation design: Site B learns "this user has 8 months of behavioral history and a weight of 0.80" — it does not learn "this user types the digraph 'th' with a mean interval of 82ms."

The receiving site must then build its own behavioral profile from scratch through sessions on Site B. The imported attestation provides a starting weight advantage, not a biometric shortcut.

### 4.4 Cross-Site Behavioral Verification

After import, the receiving site runs its own behavioral verification to confirm that the user's actual typing behavior is consistent with what a passport of the imported weight would imply.

```
If match_score(first_3_sessions, imported_template_claims) < threshold:
    → Weight penalty applied: W_local = W_received * 0.5
    → Flag raised for review
```

This prevents the most obvious attack: stealing someone's passport attestation and presenting it as your own. The behavioral fingerprint must match the claims. If a user has an imported Established passport but types like an Infant (fast, inconsistent, no characteristic digraph patterns), the mismatch is detected within 3 sessions and the passport weight is penalized.

---

## 5. Cross-Site Behavioral Consistency Requirements

For the v2 Global Passport to function, the same user must type with reasonable consistency across different sites. Research confirms this is a valid assumption for genuine users:

- Nature Communications (2025): encrypted cross-domain behavior is linkable through bursty activity patterns — the temporal fingerprint of when someone types is itself consistent across sites
- arXiv 2409.08966 (2024): behavioral features are highly consistent within a genuine user across platforms

**What consistency means in practice:**
- A user who types at 65 WPM on Site A should type at approximately 55-75 WPM on Site B (context variation is expected)
- Digraph timing for common pairs (th, er, he) should be stable within 15% across sites — these are deeply ingrained motor programs, not influenced by the interface
- Shift hand preference and spacebar dwell are highly interface-agnostic

**What is expected to vary:**
- Overall typing speed (task difficulty, familiarity with the interface)
- Session length and pause patterns (different content types)
- Error rate (different autocorrect settings, different keyboards)

The cross-site verification threshold is calibrated to accept genuine human variation while rejecting behavioral impersonation.

---

## 6. The Coordination Problem for Bots

The cross-site moat is not additive — it is multiplicative.

**Per-site forgery cost (from temporal-fortress-model.md):**
```
F(N, K) = F_0 * N^(K/2)
```

**Cross-site forgery cost:** A bot maintaining N identities across S sites must coordinate all N * S virtual humans simultaneously. Each virtual human must be:
- Behaviorally consistent within their own history (the per-site problem)
- Behaviorally consistent with their cross-site identity (new constraint)
- Not simultaneously active on two sites (scheduling constraint)
- Showing appropriate fatigue carryover between sites

**Coordination complexity:**
```
O(N * S^2)
```

Where S = number of sites. The S^2 term arises because every pair of sites must have their behavioral states synchronized. A bot farm operating 10,000 fake identities across 5 sites faces not 5x the cost of a single-site operation — it faces 25x the coordination overhead.

**Concrete example:**
- Single-site fake veteran at Day 365: $200-400 per account (bot-farm-economics.md)
- Same fake identity maintained across 5 sites: not $200-400 * 5 = not $1,000-2,000
- Real cost: $200-400 * 25 (S^2 coordination overhead) = **$5,000-10,000 per identity per year**

Cross-site passports do not just multiply the cost. They square it.

---

## 7. Federation vs. Centralization Tradeoffs

The v2 architecture must choose between two models:

### 7.1 Centralized Federation

A single Jitter Identity Authority (JIA) issues all global passports. Sites query the JIA to verify passport claims.

**Pros:**
- Simple trust model — one root of trust
- Easy revocation (JIA can revoke any passport globally)
- Consistent passport weight across all sites

**Cons:**
- Single point of failure and attack
- Privacy concern: JIA sees which sites a user visits (by virtue of issuing attestations on demand)
- Regulatory risk: a single authority holding behavioral identity records is a high-value target for government access requests
- Operational dependency: if JIA goes down, cross-site verification breaks globally

### 7.2 Federated Trust (Recommended)

Sites form trust relationships directly with each other, optionally via a lightweight trust registry that maintains only public keys and site reputation scores — not behavioral data.

**Pros:**
- No central behavioral data store
- Privacy-preserving: the trust registry knows site reputations, not user behavior
- Resilient: a site can trust another site's passports even if the central registry is unavailable (cached trust scores)
- Regulatory: behavioral data stays on the issuing site, where the user agreed to it

**Cons:**
- More complex implementation — sites must establish bilateral trust relationships
- Trust score maintenance requires ongoing coordination among federation members

**Recommended v2 architecture:** Federated trust with a lightweight public key infrastructure (PKI). The trust registry maintains:
- Site public keys (for attestation signature verification)
- Site trust scores (based on their passport fraud rates — how often did a site's passports turn out to be fake?)
- Revoked passport IDs (global blacklist)

The registry does NOT maintain:
- Behavioral data of any kind
- User identity mappings
- Cross-site session records

---

## 8. Privacy: Sites See Scores, Never Raw Biometrics

The privacy contract is identical across v1 and v2:

**What a receiving site learns from a federated passport:**
- Passport weight (0.0 to 0.95)
- Tier (infant through veteran)
- Calendar age in days
- Session count
- Anomaly score (lifetime maximum)

**What a receiving site never learns:**
- The user's actual behavioral signal values (digraph timings, dwell distributions)
- Which specific keys the user presses or how they press them
- What the user typed on the issuing site
- The user's device hardware characteristics

This design is not just a product decision — it is the correct privacy architecture for cross-site behavioral credentials. A site accepting a passport from another site is making a trust decision based on evidence ("this passport has 8 months of history and W=0.80"), not acquiring a new biometric dataset. The biometric stays on the issuing site.

---

## 9. The Network Effect Moat

The Jitter passport registry is the real moat, as stated in the temporal-fortress research:

> "The real moat is a network of passports with months of accumulated data. Once a million people have Jitter passports with 6 months of history, that dataset is the asset. Nobody can bootstrap that from scratch."

**Why the data asset is defensible:**

At 1 million veteran passports:
- The inter-individual variance model is calibrated on real behavioral diversity at scale
- Outlier detection becomes increasingly precise: the reference distribution tightens, making anomaly detection more accurate
- Cross-passport coordination detection improves: bot farms generating from the same underlying model cluster in behavioral space — detectable with a large enough reference population
- Epoch-level ground truth: if 99.2% of passports show a consistent circadian pattern, the 0.8% that don't are candidates for investigation

**The cold start problem (first 10,000 users):**

During the early phase, the registry population is too small for population-level anomaly detection. Mitigations:

1. **Aggressive weight discounting:** Any passport under 30 days carries a weight floor of 0.15 regardless of internal consistency. Early passports cannot be fast-tracked to high-trust status.
2. **Population-level outlier detection:** Compare each new passport's signals against the growing population distribution. A passport with digraph timings that fall outside 3 sigma of the observed human population is suspicious even if internally consistent.
3. **Network graph analysis during Infant phase:** Look for behavioral clusters suggesting common generation. Passports created within the same 24-hour window that share similar rhythm signatures are candidates for coordinated creation.
4. **Enrollment diversity requirement:** First 5 sessions must span at least 3 different time-of-day bins and 2 different days. Coordinated bot farms tend to enroll in bursts.

Once the registry reaches approximately 50,000 active passports with 60+ day history, population-level detection becomes reliable. At 500,000 passports, the reference distribution is robust enough to detect even sophisticated coordinated behavior.

---

## 10. The Cold Start Problem and Mitigation

The v2 Global Passport has its own cold start problem: a new user on a Jitter-integrated site has no passport history anywhere. For that user, v2 federation provides no advantage — they start from Infant tier regardless.

This is not a product problem. It is expected behavior. The Temporal Fortress is explicitly designed so that trust is earned, not granted. The cold start period for a legitimate user is 30-90 days of normal site usage. During that window:
- Content is visible (Jitter does not block content from infant passports by default)
- Voting weight and influence are reduced proportionally to passport weight
- The user is transparently informed that their passport is building and what tier they are in

The cold start problem for bot farms is different: they must invest 30-90 days before a passport has any meaningful manipulation value. The cold start IS the product's primary defense mechanism.

---

## Summary Comparison Table

| Dimension | v1 Per-Site Passport | v2 Global Passport |
|---|---|---|
| Trust scope | Single site | All Jitter-integrated sites |
| Trust transfer | None | Cryptographic attestation with discount |
| Cross-site cost for bots | Additive (N sites = N*cost) | Quadratic (N sites, S sites = N*S^2 cost) |
| Privacy model | Site sees scores | Sites see scores (raw biometric never crosses site boundary) |
| Cold start | 30-90 days per site | 30-90 days once, then transferable |
| Central authority | None | Lightweight PKI (public keys + site reputation only) |
| Launch timeline | v1 ships first | v2 after proving per-site concept |
| Data asset value | Per-site registry | Global registry — the compounding moat |

---

## Sources

- temporal-fortress-model.md (this research dossier) — cross-site coordination complexity O(N*S^2), passport weight formula
- bot-farm-economics.md (this research dossier) — per-account cost at Day 365
- passport-data-model.md (this research dossier) — export/import format, attestation package structure
- Nature Communications (2025) — "Temporal Fingerprints for Identity Matching Across Encrypted Domains" — cross-site behavioral consistency evidence
- arXiv 2409.08966 (2024) — "User Identity Linkage on Social Networks" — within-user cross-platform consistency
- EURASIP Journal on Information Security (2024) — "Strategic Safeguarding: A Game Theoretic Approach" — Nash equilibria in attacker-defender systems with superlinear defender complexity
- AAMAS 2025 — "More Efficient Sybil Detection Mechanisms" — temporal behavioral consistency as the strongest Sybil signal
