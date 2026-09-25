# JITTEr — Project Context for Claude

## What This Is
A **process receipt for written work**. The JITTEr Writer records how a text was entered (typed / pasted / deleted, sittings, active time, typing rhythm), signs the record with a device key and binds it to the final text. A teacher verifies the receipt and the essay on the verify page and can replay the composition from the student's ledger.

It proves *process* and *integrity*. It does not prove *who* typed, and it is not an AI detector. The classroom supplies identity; JITTEr supplies the record.

**Longer-term direction** (a passport / reputation layer across sites) is described in the vision documents and JITTER-PLAN.md. It is a documented direction, not the shipping product, and it has a measured problem: keystroke evidence on the open web gives no scarcity (docs/adversarial/PERSONA_MONTH.md). Do not build toward it without a trusted capture boundary.

**Patents:** #63/994,858 (base, 2026-03-02) + #63/997,498 (CIP, 2026-03-05)

## Read first
- `docs/product/PROCESS_RECEIPT.md` — the receipt and ledger contract, the verify page sections, the language rules. **Read it before touching the Writer, the verify page or receipt-utils.**
- `docs/architecture/TRUST_LAYER.md` — attest / verify / erase contract, schema, deploy steps, key rotation.
- `docs/adversarial/PERSONA_MONTH.md` — what the system does and does not defend against, with numbers.
- `docs/FUNCTIONALITY_AUDIT_2026-09.md` — findings and their fix status.
- `JITTER-PLAN.md` for the engine's formula (WAR weights, paste weighting, time caps) and the longer-term components.

## Repo Structure
```
extension/        Chrome extension (Manifest V3; no inline or remote scripts)
  writer.html     the Writer (src/writer.js, src/writer-page.js)
  verify.html     the teacher's verify page (src/verify-page.js)
  popup.html      site opt-in, passport summary, erase
  src/            receipt-utils (receipt + ledger), war-score (ENGINE), biometrics (capture),
                  content (opt-in site capture), crypto-utils, passport-utils, background (device key)
lab/              Simulations, bot personas, adversarial/ (forge, generator, persona-cost scripts)
sdk/              Embeddable capture + receipt for third-party sites; dist/ built by node sdk/build.js
supabase/         attest, verify, erase functions; migrations; tests/ (Deno + PGlite)
android/          Anvil keyboard proof of concept (Kotlin)
tests/            Playwright page tests + Node unit tests
docs/             product/, architecture/, adversarial/, security/, audit
patent/           Provisional specs
research/         Background research
archive/          Earlier versions
```

## One Engine, Three Hosts
- `extension/src/war-score.js` = CANONICAL typing-rhythm scorer. Plain script, exposes `JitterWAR`. 9 signals with the plan weights, hard floors, soft penalties, length-weighted paste (no paste penalty), two-sided K-S, Pearson, step-table time cap. Change the math HERE and nowhere else, then `node sdk/build.js`.
- `extension/src/biometrics.js` = extension CAPTURE (timing, paste lengths, mouse, `getProfile`). `scoreWAR`/`applyTimeCap` delegate to war-score.js.
- `sdk/src/core/jitter-box.js` = SDK CAPTURE. `sdk/build.js` inlines war-score.js ahead of it into `sdk/dist/jitter.min.js` (committed; rebuild after any engine change).
- `lab/jitter-box.js` = lab capture harness; `require()`s war-score.js so lab numbers use shipping math.
- `extension/src/receipt-utils.js` = receipt/ledger building and verification, shared by the Writer and the verify page, unit-tested in Node.

## Hard Rules
1. **Never record characters.** Ledger ops and receipts hold counts and timestamps; paste events hold a length. (Content snapshots for the replay live only in the student's ledger file. The receipt's `text_hash` is a hash of the whole text.)
2. **Never say "AI detector", "risk", "suspicious", "bot", "human-like", "authentic", "verdict" or "detected" in anything a student or teacher sees.** Say what was typed, pasted, deleted, over how many sittings, in how much active time. The typing-rhythm score is "one statistic, not a verdict".
3. **The Writer records; it never refuses.** No gate on minting a receipt.
4. **A receipt proves process and integrity, never identity or authorship.** Never present the rhythm score, device age or passport as proof that a human wrote something.
5. **Receipts must be cryptographically signed** (ECDSA P-256, canonical JSON, signed part excludes `CryptoUtils.UNSIGNED_FIELDS`).
6. **Paste is transparent, not punished** — it is recorded and shown, never penalized.
7. **`extension/src/war-score.js` is the canonical engine.** Extension, SDK bundle and lab all load that one file.
8. **Capture is opt-in per site** and never touches password, payment or one-time-code fields.
9. **Never claim economic infeasibility.** The measured cost of a fake identity is ≈ 0 (docs/adversarial/PERSONA_MONTH.md).
10. All IP owned by Denis Gingras. See IP_DECLARATION.md.

## Known Gaps
- The typing-rhythm engine was tuned on synthetic data only; no real session has ever been captured. Do not trust any threshold until real sessions exist.
- The server caps and classifies the client's score but does not recompute it; a forged score is accepted (measured).
- Backend is tested locally (PGlite) and not deployed; the Supabase project is paused. Deploy steps in docs/architecture/TRUST_LAYER.md. The verify page needs a custom domain (`*.supabase.co` serves HTML as text).
- Mobile: soft keyboards give the extension no keystrokes; the SDK has an input-event fallback without dwell. Anvil is unbuilt on a device.
- Typing inside cross-origin iframes is not captured; the local passport can lose counts across tabs.

## Backend
Supabase. Identity is a per-device P-256 key (no login). Receipts are device-signed, bound to `text_hash` + `url`, attested by `/attest` (server-side age cap, per-device and per-IP rate limits, site-key allowlist, countersignature) and erased by `/erase` (signed request; deletes everything for that device). Read docs/architecture/TRUST_LAYER.md before touching attest/verify/erase, crypto-utils.js or jitter-capture.js. Never run anything against the live project without the owner's go-ahead.
Dan IP conversation needed in writing before any WGH integration.
