# The Trust Layer

*What the code does today, how to deploy it, and where it goes next.*
*Branch `claude/functionality-audit-h7g3ia`, September 2026.*

The goal: several independent layers a person passes through without noticing, each of which costs a cheap bot farm money or time. No login, no CAPTCHA, nothing to configure.

## The layers

| # | Layer | What it costs a bot | Where |
|---|---|---|---|
| 1 | **Real input only.** Synthetic key events, scripted clicks and auto-repeat are ignored. | An in-page script can't type. The bot needs OS-level input (Playwright/CDP or a physical device). | `extension/src/content.js`, `sdk/src/core/jitter-box.js`, `sdk/src/jitter-capture.js` |
| 2 | **Typing dynamics (WAR).** One shared engine scores flight, dwell, bigram rhythm, distribution shape, editing, purity. Hard floors catch constant-rate and zero-dwell bots. | Must generate human-like timing statistics. (Weak on its own; see "Known limits".) | `extension/src/war-score.js` |
| 3 | **Device identity.** Each install/origin gets a P-256 key, generated non-extractable (service worker IndexedDB in the extension, page IndexedDB in the SDK). Every badge is signed with it. | A farm needs one key per fake device, and each key starts at age 0. | `background.js`, `crypto-utils.js`, `jitter-capture.js` |
| 4 | **Content binding.** The badge carries the SHA-256 of the certified text and the page it was minted on. | A badge can't be reused on other text; the signature breaks. | badge fields `text_hash`, `url` |
| 5 | **Server-anchored age (the time cap).** The server records when it first saw each device and caps the score by *its* record: < 1 day 0.35, 1–7 d 0.50, 7–30 d 0.65, 30–90 d 0.80, 90–180 d 0.92, 180+ d 1.00. | "Verified" is impossible before ~90 days of consistent presence. Age cannot be faked from the client. | `supabase/functions/_shared/trust.ts`, `attest/index.ts`, `devices` table |
| 6 | **Rate limits and replay protection.** 60 attestations per device per hour; the same signed badge attested twice returns the same record. | Volume per identity is bounded; more volume means more identities, each aged from zero. | `attest/index.ts` |
| 7 | **Server countersignature.** The attestation (device id, age, cap, verdict, text hash) is signed with the server key and embedded in the badge; verifiers check it offline. | The server's verdict can't be forged or edited. | `attest/index.ts`, `verify-page.js` |
| 8 | **Sensor evidence (mobile).** The Anvil keyboard measures whether each tap physically jolted the phone. | Injected taps (adb, emulators) produce no jolt. | `android/.../TapMotionAnalyzer.kt` (not yet attested; see "Next") |

A badge that fails any signature check shows INVALID. A badge with no server attestation still verifies locally but says so ("NOT SERVER-ATTESTED").

## The contract

`POST /functions/v1/attest` — public (`verify_jwt = false`); the device signature is the credential.

```json
{ "site_key": "extension",
  "badge": { "...everything the client signed...", "war": 0.35, "war_uncapped": 0.72, "keys": 148,
             "text_hash": "<sha256 hex>", "url": "https://site/path", "minted_at": "<iso>",
             "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." } },
  "signature": "<base64 ECDSA P-256 r||s over canonicalJson(badge)>" }
```

Response: `{ badge_hash, attestation: { badge_hash, device_id, key_id, site_key, war, war_client, time_cap, age_days, classification, flags, text_hash, url, attested_at }, server_signature, server_key_id, profile }`.

- `canonicalJson` = keys sorted at every depth, no whitespace, `undefined` dropped. Implemented identically in `crypto-utils.js`, `jitter-capture.js` and `_shared/trust.ts`; the backend tests check them against each other.
- `war_uncapped` is the typing score after penalties and before the client's own age cap; the server judges that and applies its own cap.
- Classification: `bot` (score < 0.20 or a hard floor), `verified` (capped ≥ 0.80), `building` (new device, decent typing), `suspicious` (the rest).
- `GET /functions/v1/verify?hash=…` renders the record; `&format=json` returns it.
- Errors: `bad_signature` 401, `insufficient_data` (< 20 keys) 400, `rate_limited` 429, `payload_too_large` 413.

The client embeds `attestation`, `server_signature` and `server_key_id` in the badge *outside* the device-signed part; `verify.html` checks the device signature over `CryptoUtils.signedPart(badge)` and the server signature over `attestation`, and that the attestation matches this badge's text hash, device and score.

## Database

- `devices` — one row per public key: `first_seen` (age), `last_seen`, `attest_count`, `site_keys`.
- `attestations` — one row per attested badge, with `device_id`, `text_hash`, `url`, `client_sig_hash` (unique: replay guard), `war_client`, `time_cap`, `age_days`, `server_signature`.
- `profiles` — lifetime aggregates per device, updated atomically by `record_attestation_stats()`.
- RLS on everything with no policies, grants revoked: the anon key can read and write nothing. Only the edge functions (service role) touch the tables.

## Deploying (the project is paused; nothing below has been run yet)

1. Restore the `jitter` Supabase project.
2. `supabase db push` — applies `20260924000001` (lock down) and `20260924000002` (devices, server trust).
3. `node supabase/scripts/gen-server-key.mjs` → `supabase secrets set JITTER_SERVER_KEY_JWK='<private jwk>'`; paste the public JWK into `CryptoUtils.SERVER_PUBLIC_JWK` in `extension/src/crypto-utils.js`. Without it, attestations are stored but not countersigned and verifiers say "not checked".
4. `supabase functions deploy attest` and `supabase functions deploy verify` (picks up `verify_jwt = false` from `config.toml`).
5. Serve the verify page from a custom domain or a static host: `*.supabase.co` rewrites HTML responses to `text/plain`, so `/verify?hash=` links render as source there. `format=json` works regardless.
6. WGH: `JitterCapture.init({ siteKey: 'wgh', attestUrl: 'https://<project>.supabase.co/functions/v1/attest' })` and use `result.attestation` / `result.verifyUrl`.

Local: `npm run dev:functions` serves both functions on 127.0.0.1:54321 against PGlite; `npm run test:backend` runs the backend tests.

## Known limits

- **One session is weak evidence.** The audit's simulation put humans mostly in "suspicious" and a scorer-aware bot in "verified". Thresholds and ramps were tuned on synthetic data and need real sessions (WGH) before any threshold is trusted. The layers above are what make it expensive anyway: a passing session on a day-0 device caps at 0.35.
- **The server trusts the client's typing score.** It caps and classifies but does not recompute it. A next step is recomputing WAR server-side from the profile the badge carries (the engine is plain JS; Deno can run it) and flagging mismatches.
- **A device key is not a person.** Two extensions on one laptop are two devices; one person with two browsers has two histories. That is acceptable for a frictionless start; linking devices is the wallet step below.
- **Rate limit is per device per hour,** not per site or per IP.

## Next

1. **Deploy** (above) and get WGH data flowing; recalibrate on it.
2. **Mobile:** Anvil badges are still unsigned and unscored. Either run the shared engine on-device (a JS runtime) or score server-side from the profile Anvil sends, sign with an Android Keystore P-256 key, and attest with the motion block as an extra flag. Server-side scoring is the smaller change and also gives the cross-check above.
3. **Passport / wallet:** link devices to one identity when the user chooses to (a QR from one device to another, or an account), show totals across sites ("human · 14 months · consistent"), keep the post list opt-in.
4. **Capture gaps:** typing inside iframes and `about:blank` editors is not captured by the extension; the local passport can lose counts across tabs.
