# JITTEr — Human Authorship Verification

**J**itter **I**ntegrity **T**racking & **T**yping **E**ntropy **R**ecognition

Proves text was typed by a real human through keystroke biometrics. Makes bot-generated content economically unfeasible at scale. Patent pending.

**Copyright 2025-2026 Denis Gingras. All Rights Reserved.** See [LICENSE](LICENSE).

---

## What It Does

Captures keystroke timing metadata (never content) and scores human authenticity using 9 weighted signals. Creates cryptographically signed badges proving authorship. Builds a lifetime "typing passport" that gets harder to fake over time.

**Not an AI detector.** We verify the human writing process. Anything outside the envelope of real typing flags itself.

---

## Architecture

| Component | Status | Description |
|-----------|--------|-------------|
| **Chrome Extension** | Working | Manifest V3, modular (6 JS modules), ECDSA badge signing, passport system |
| **WAR Scorer** | Working | One shared engine (`extension/src/war-score.js`): 9-signal weighted composite — bigram rhythm, two-sided K-S test, Pearson correlation, hard floors, weighted paste |
| **Writing Ledger** | Working | Append-only operation timeline with SHA-256 hash-chained checkpoints |
| **Bot Farm Tests** | Working | 5 Playwright adversarial personas for stress testing |
| **Embeddable SDK** | Scaffold | `<jitter-input>` widget for any site |
| **Android Keyboard** | POC | Kotlin IME with basic biometrics (flight time + pressure) |
| **Server Verification** | Not built | API endpoint for third-party badge verification |

---

## The Engine — WAR Scorer

9 signals, weighted composite score:

| Signal | Weight | What It Measures |
|--------|--------|-----------------|
| Bigram rhythm CV | 18% | Consistency of character-pair timing |
| Per-key uniqueness CV | 15% | Individual key timing variance |
| Cross-signal correlation | 15% | Coherence between biometric channels |
| K-S distribution test | 12% | Statistical normality of timing |
| Inter-key variance | 10% | Gap consistency between keystrokes |
| Dwell std deviation | 10% | Key hold time variation |
| Mean dwell time | 8% | Average key hold duration |
| Editing behavior | 7% | Backspace/delete patterns |
| Purity score | 5% | Human vs external input ratio |

Canonical implementation: `extension/src/war-score.js` — one plain-script engine (`JitterWAR`) loaded by the Chrome extension, inlined into the SDK bundle by `node sdk/build.js`, and `require()`d by the lab. Capture code differs per host; the math does not.

Paste is transparent, not punished: pasted characters enter only the purity signal, weighted by the length of each paste (< 50 chars 0.1x, 50–300 0.3x, > 300 1.0x); three or more pastes raise a `high_paste_volume` flag, never a penalty. The time confidence cap (< 1 day 0.35 … 180+ days 1.00) clamps the final WAR, never the raw score.

---

## Repo Structure

```
extension/     Chrome extension (the product) + src/war-score.js, the canonical WAR engine
lab/           Algorithm lab (bot farm, matching engine; scores with the shared engine)
sdk/           Embeddable widget scaffold
android/       Anvil Keyboard (Kotlin IME)
tests/         10 test files
docs/          Security (red team, blue book), business, architecture
patent/        Both provisional specs + filing receipt
research/      20+ research documents
archive/       All previous versions — proof of build history
```

---

## Why Bots Can't Win

**Economics, not accuracy.**

To bypass JITTEr, an attacker must physically type through a real keyboard, in real time, matching realistic typing dynamics — per document, every time. A bot farm generating 10,000 articles/day would need 10,000 humans typing in real time.

The passport system adds time cost: accounts accumulate trust over months. New accounts are suspicious. You can't buy time.

---

## Patent Status

- Provisional: #63/994,858 (filed 2026-03-02)
- CIP: #63/997,498 (filed 2026-03-05)
- Utility filing planned within priority year

---

## Privacy

- Keystroke timing only — content is never captured or transmitted
- 100% client-side by default
- Optional cloud sync for passport portability (metadata only)
- User controls all data

---

## IP Notice

This software contains proprietary algorithms and trade secrets. Unauthorized reproduction, distribution, reverse engineering, or commercial use is prohibited. See [LICENSE](LICENSE) and [IP_DECLARATION](IP_DECLARATION.md).

Built by Denis Gingras.
