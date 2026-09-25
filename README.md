# JITTEr — a process receipt for written work

**Copyright 2025-2026 Denis Gingras. All Rights Reserved.** See [LICENSE](LICENSE).

JITTEr records **how a text was written** — when, over how many sittings, how much was typed, pasted and deleted, and in what rhythm — signs that record, and binds it to the final text. A student writes in the JITTEr Writer and hands in the essay with a receipt; a teacher pastes both into the verify page and sees the whole composition story, minute by minute, with an optional replay.

## What a receipt proves, and what it does not

A receipt proves that a specific text was entered into the Writer through a specific process, on a device holding a specific key, and that neither the record nor the text has been altered since. It does **not** say who was at the keyboard, whether typed text was copied from another screen, or whether a language model wrote it. JITTEr is not an AI detector and never labels anyone. Every page that shows a receipt says so. The full contract is in [docs/product/PROCESS_RECEIPT.md](docs/product/PROCESS_RECEIPT.md).

## What exists

| Component | State | Notes |
|---|---|---|
| **Writer** (`extension/writer.html`) | Working, tested | Autosaving editor; hash-chained ledger of operations (never characters); replay; signed receipt bound to the text |
| **Verify page** (`extension/verify.html`) | Working, tested | Signature, text binding, server record, sittings, active time, typed/pasted/deleted timeline, paste list, revision, ledger replay |
| **Site capture** (content script) | Opt-in per site | Records typing rhythm on sites the user enables from the popup; never on password or payment fields; never text |
| **Typing-rhythm engine** (`extension/src/war-score.js`) | Working; calibrated on synthetic data only | One statistic on the receipt, not a verdict. Thresholds have never been fitted to real sessions |
| **Attestation server** (`supabase/functions`) | Built and tested locally; not deployed | Records when a receipt existed, per-device age, rate limits, countersignature, self-service erasure |
| **Embeddable SDK** (`sdk/`) | Capture path works; no customer yet | For a site that wants receipts on its own forms |
| **Android keyboard** (`android/`) | Proof of concept; not built on a device | Tap-motion evidence tuned on synthetic signals |
| **Hall-effect / analog input** | Research | See `research/` |

## Privacy

- The ledger and the receipt contain counts and timestamps, never characters. Paste events record a length, not the text.
- Content snapshots for the replay live in the ledger file on the student's machine and are shared only when the student chooses to.
- Site capture is off until the user enables a site; password, payment and one-time-code fields are never captured anywhere.
- The server (when deployed) stores a device key hash, the text hash, the page, the score and timestamps. **Delete my server records** in the popup erases all of it with one signed request.
- The device key is generated non-extractable and never leaves the device. Losing the device means starting over; there is no account.

## Security model, honestly

A receipt's signature and text hash give **integrity**: it cannot be edited, forged for a different text, or moved to another essay, and the server's countersignature fixes when it existed. Integrity is what a teacher needs, because the classroom already supplies identity.

Keystroke timing on its own does **not** give scarcity. Everything a browser reports about typing is self-reported, and a generator sampling human-like timings passes the rhythm score; ageing a key costs nothing and parallelizes. Measured numbers and the scripts that produce them are in [docs/adversarial/PERSONA_MONTH.md](docs/adversarial/PERSONA_MONTH.md). Do not present the rhythm score, the passport or device age as proof that a human wrote something.

## Repository

```
extension/     Chrome extension: Writer, verify page, popup, opt-in site capture, the engine
  src/war-score.js       typing-rhythm engine (one file; SDK and lab load the same one)
  src/receipt-utils.js   receipt/ledger building and verification (shared by Writer and verify page)
sdk/           Embeddable capture + receipt for third-party sites (dist/ is built by node sdk/build.js)
supabase/      Attest, verify and erase functions, migrations, local Deno+PGlite tests
lab/           Simulations, bot personas, adversarial scripts (lab/adversarial/)
android/       Anvil keyboard proof of concept (Kotlin)
tests/         Playwright page tests, Node unit tests
docs/          product/, architecture/, adversarial/, security/, the functionality audit
research/      Background research
patent/        Provisional specs
archive/       Earlier versions
```

## Running it

```
npm install
npm run test:unit        # engine, receipt utils, crypto parity, SDK
npm run test:backend     # attest / verify / erase against PGlite
npm run test:e2e         # Playwright: Writer, verify page, capture scope, SDK
```

Load `extension/` unpacked in Chrome to use the Writer. Deploying the server is described in [docs/architecture/TRUST_LAYER.md](docs/architecture/TRUST_LAYER.md).

## Patents

Provisional applications #63/994,858 (2026-03-02) and #63/997,498 (2026-03-05). Filing documents are in `patent/`.

## IP

Proprietary. See [LICENSE](LICENSE) and [IP_DECLARATION.md](IP_DECLARATION.md). Built by Denis Gingras.
