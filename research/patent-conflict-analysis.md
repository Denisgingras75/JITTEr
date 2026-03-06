# Patent Conflict Analysis — App #63/994,858
Date: 2026-03-02

## Verdict
Core claim set is **defensible but not clean**. Individual components have prior art. Novelty depends on the specific COMBINATION and the content-provenance framing.

## Risk by Claim

| Claim | Risk | Key Prior Art | Defense |
|-------|------|---------------|---------|
| 1. Continuous keystroke capture | MEDIUM-HIGH | US8332932B2 (2012), US5229764A (1993) | Reframe: purpose is content certification, not authentication |
| 2. Smart Badge certificate | HIGH base / MEDIUM scoped | US20030115475A1 (biometric + digital certs), Purely Human (product) | Content-bound + biometric + portable = novel combination |
| 3. Global Passport | MEDIUM | US9363283B1, US9578043B2 (reputation scoring) | Cross-domain BIOMETRIC EFFORT aggregation is novel |
| 4. Badge chaining | MEDIUM | C2PA standard, WO2017044554A1 | Chains biometric sessions, not just edit operations |
| 5. Multi-layer scoring | HIGH broad / LOW scoped | BioCatch US8938787 | Must tie to certificate issuance gate, not generic detection |
| 6. Hall Effect force curves | LOW (STRONGEST) | US9165129B2 (force as biometric) | No prior art for Hall Effect specifically as proof-of-work |
| 7. Mobile IMU correlation | HIGH standalone / MEDIUM scoped | BioCatch, zkSENSE research | Frame as corroboration for content provenance |
| 8. Session fingerprint dedup | MEDIUM | US8508338B1 (replay prevention) | Session biometric fingerprint as dedup key is novel |
| 9. Per-key dwell fingerprint | HIGH | US4805222A (1989), US8332932B2 | Core keystroke dynamics since 1989 — must reframe |
| 10. Embeddable widget | HIGH standalone / LOW scoped | TypingDNA product, US7942318B2 | Novel if scoped to certificate-emitting component |

## Most Dangerous Competitor
**Purely Human** (purelyhuman.world) — same core concept (keystroke during writing -> crypto proof -> sharable badge). No patent filed yet. Jitter's March 2, 2026 priority date wins if they file after.

## Strongest Novel Claim
**Hall Effect force curves as proof-of-physical-effort** — NO prior art found for:
- Hall Effect magnetic sensors specifically as biometric
- Force curves framed as "proof of work"
- Force curves incorporated into content provenance certificate

## Recommendations for Non-Provisional
1. Narrow Claims 1, 7, 9, 10 — end each with "for generating a content provenance certificate"
2. Draft Claim 6 (Hall Effect) carefully — most novel, highest blocking potential
3. Differentiate Claim 3 from reputation patents — biometric EFFORT, not behavioral signals
4. Address arxiv 2601.17280 (Jan 2026) — proves keystroke alone insufficient, Jitter's multi-layer is the response
5. Scope scoring pipeline to certificate issuance decision gate

## Key Prior Art Patents to Review
- US8332932B2 — Keystroke dynamics auth (2012)
- US20030115475A1 — Biometrically enhanced digital certificates (2003)
- US9165129B2 — Keyboard as biometric auth device
- US8938787 — BioCatch multi-signal behavioral analysis
- US8508338B1 — Replay attack prevention in biometrics
- US4805222A — Per-key dwell (1989, foundational)
- WO2017044554A1 — Biometric blockchain verification
