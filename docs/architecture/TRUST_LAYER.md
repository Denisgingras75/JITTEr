# The Trust Layer

*What the code does today, how to deploy it, and where it goes next.*
*September 2026.*

The goal: several independent layers a person passes through without noticing, each of which costs a cheap bot farm money or time. No login, no CAPTCHA, nothing to configure.

## The layers

| # | Layer | What it costs a bot | Where |
|---|---|---|---|
| 1 | **Real input only.** Synthetic key events, scripted clicks and auto-repeat are ignored. | An in-page script can't type. The bot needs OS-level input (Playwright/CDP or a physical device). | `extension/src/content.js`, `sdk/src/core/jitter-box.js`, `sdk/src/jitter-capture.js` |
| 2 | **Typing dynamics (WAR).** One shared engine scores flight, dwell, bigram rhythm, distribution shape, editing, purity. Hard floors catch constant-rate and zero-dwell bots. | Must generate human-like timing statistics. (Weak on its own; see "Known limits".) | `extension/src/war-score.js` |
| 3 | **Device identity.** Each install/origin gets a P-256 key, generated non-extractable (service worker IndexedDB in the extension, page IndexedDB in the SDK). Every badge is signed with it. | A farm needs one key per fake device, and each key starts at age 0. | `background.js`, `crypto-utils.js`, `jitter-capture.js` |
| 4 | **Content binding.** The badge carries the SHA-256 of the certified text and the page it was minted on. | A badge can't be reused on other text; the signature breaks. | badge fields `text_hash`, `url` |
| 5 | **Server-anchored age (the time cap).** The server records when it first saw each device and caps the score by *its* record: < 1 day 0.35, 1–7 d 0.50, 7–30 d 0.65, 30–90 d 0.80, 90–180 d 0.92, 180+ d 1.00. | "Verified" is impossible before ~90 days of consistent presence. Age cannot be faked from the client. | `supabase/functions/_shared/trust.ts`, `attest/index.ts`, `devices` table |
| 6 | **Rate limits and replay protection.** 60 attestations per device per hour, 600 requests per address per hour (attest and erase together), and the same signed badge attested twice returns the same record. | Volume per identity and per address is bounded; more volume means more identities, each aged from zero. | `attest/index.ts`, `erase/index.ts`, `_shared/trust.ts`, `ip_windows` table |
| 7 | **Server countersignature.** The attestation (device id, age, cap, verdict, text hash) is signed with the server key and embedded in the badge; verifiers check it offline. | The server's verdict can't be forged or edited. | `attest/index.ts`, `verify-page.js` |
| 8 | **Sensor evidence (mobile).** The Anvil keyboard measures whether each tap physically jolted the phone. | Injected taps (adb, emulators) produce no jolt. | `android/.../TapMotionAnalyzer.kt` (not yet attested; see "Next") |

A badge that fails any signature check shows INVALID. A badge with no server attestation still verifies locally but says so ("NOT SERVER-ATTESTED").

The device's owner can take everything back: one request signed with the device key erases the device's attestations, profile and registration (`/erase`, below).

## The contract

### Attest

`POST /functions/v1/attest` — public (`verify_jwt = false`); the device signature is the credential.

```json
{ "site_key": "extension",
  "badge": { "...everything the client signed...", "war": 0.35, "war_uncapped": 0.72, "keys": 148,
             "text_hash": "<sha256 hex>", "url": "https://site/path", "minted_at": "<iso>",
             "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." } },
  "signature": "<base64 ECDSA P-256 r||s over canonicalJson(badge)>" }
```

Response: `{ badge_hash, attestation: { badge_hash, device_id, key_id, site_key, war, war_client, time_cap, age_days, classification, flags, text_hash, url, attested_at }, server_signature, server_key_id, profile }`.

- `site_key` names the integration and must be on the allowlist: `JITTER_SITE_KEYS`, comma-separated, default `extension,writer,wgh`. It is read on every request, so adding a site is a secret change, not a deploy. A key of the right shape that is not on the list gets 400 `unknown_site_key`; a malformed one 400 `bad_site_key`.
- `canonicalJson` = keys sorted at every depth, no whitespace, `undefined` dropped. Implemented identically in `crypto-utils.js`, `jitter-capture.js` and `_shared/trust.ts`; the backend tests check them against each other.
- `war_uncapped` is the typing score after penalties and before the client's own age cap; the server judges that and applies its own cap.
- Classification: `bot` (score < 0.20 or a hard floor), `verified` (capped ≥ 0.80), `building` (new device, decent typing), `suspicious` (the rest).
- `server_key_id` is the id of the server key that produced `server_signature`: the first 12 hex characters of the SHA-256 of the raw public key, upper-case, the same form as a device's key id. It is stored with the attestation, so a replayed badge reports the key that signed it at the time, whatever the current key is. Verifiers use it to pick the entry in `CryptoUtils.SERVER_PUBLIC_KEYS` (see "Rotating the server key").
- `GET /functions/v1/verify?hash=…` renders the record; `&format=json` returns it.
- Errors: `bad_site_key` / `unknown_site_key` 400, `bad_signature` 401, `insufficient_data` (< 20 keys) 400, `rate_limited` (device) 429, `rate_limited_ip` (address) 429, `payload_too_large` (32 KB) 413.

The client embeds `attestation`, `server_signature` and `server_key_id` in the badge *outside* the device-signed part; `verify.html` checks the device signature over `CryptoUtils.signedPart(badge)` and the server signature over `attestation`, and that the attestation matches this badge's text hash, device and score.

### Erase

`POST /functions/v1/erase` — public (`verify_jwt = false`), same CORS headers as attest; the device signature is the credential.

```json
{ "publicKeyJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." },
  "requested_at": "2026-09-25T14:03:11.000Z",
  "signature": "<base64 ECDSA P-256 r||s over canonicalJson({ action: 'erase', publicKeyJwk, requested_at })>" }
```

The client signs exactly `{ action: "erase", publicKeyJwk, requested_at }` — the same `publicKeyJwk` object it sends — with the device key. `requested_at` is an ISO timestamp and must be within ten minutes of server time either way; that bounds how long a captured request could be replayed, and replaying an erase changes nothing anyway.

Response: `200 { device_id, deleted: { attestations, profiles, devices } }` — the rows removed, in that order and in one transaction: the device's attestations, its profile (`profiles.user_id = device_id`), its `devices` row. All zeros when nothing was there; a second erase is not an error.

- After an erase, `/verify` returns 404 for the device's badges. Badges the person already holds still verify offline by their signatures; the server no longer vouches for them.
- The device is forgotten entirely: if it attests again it is registered afresh, at age 0, with a new profile.
- Errors: `bad_public_key` 400, `missing_fields` 400, `stale_request` 400, `bad_signature` 401, `rate_limited_ip` 429, `payload_too_large` (4 KB) 413, `method_not_allowed` 405.

### The per-address limit

Both functions count requests per client address per hour, 600 by default (`JITTER_MAX_ATTESTS_PER_IP_HOUR`), one budget shared by attest and erase. The address is the first entry of `x-forwarded-for`, else `cf-connecting-ip`, else `"unknown"`.

What is stored: `sha256(address + ":" + JITTER_IP_SALT)` and a count, per hour. Never the address. Set `JITTER_IP_SALT` to a random secret: without it the hash of an IPv4 address can be recovered by hashing all four billion of them; with it the buckets mean nothing outside the server. Changing the salt starts every bucket over.

The count is taken after the checks that cost only CPU (parsing, validation, the device signature) and before any other query, so a flood of malformed or unsigned requests costs the database nothing, and a refused request still counts. Rows older than a day are dropped by `prune_ip_windows()`, which `bump_ip_window` runs on about one call in a hundred; it can also be run by hand (`select prune_ip_windows();`).

## Database

- `devices` — one row per public key: `first_seen` (age), `last_seen`, `attest_count`, `site_keys`.
- `attestations` — one row per attested badge, with `device_id`, `text_hash`, `url`, `client_sig_hash` (unique: replay guard), `war_client`, `time_cap`, `age_days`, `server_signature`, `server_key_id`.
- `profiles` — lifetime aggregates per device, updated atomically by `record_attestation_stats()`.
- `ip_windows` — `bucket` (the salted hash), `window_start` (the hour), `count`. Maintained by `bump_ip_window(bucket, limit)`, which upserts the current hour's row in one statement and returns whether the count after the increment is within the limit; `prune_ip_windows()` drops rows older than a day.
- `erase_device(device_id)` deletes a device's attestations, profile and device row in one transaction and returns the three counts.
- RLS on everything with no policies, table grants revoked, the functions revoked from `PUBLIC`, `anon` and `authenticated`: the anon key can read, write and call nothing. Only the edge functions (service role) touch the tables.

## Environment

Function secrets (`supabase secrets set NAME='value'`). All optional; none is needed to run the tests. Each is read per request, so a change takes effect without a redeploy.

| Variable | Default | What it does |
|---|---|---|
| `JITTER_SERVER_KEY_JWK` | unset | The server's private P-256 JWK. Unset: attestations are stored but not countersigned; `server_signature` and `server_key_id` are null and verifiers say "not checked". |
| `JITTER_SITE_KEYS` | `extension,writer,wgh` | Comma-separated site keys `attest` accepts. |
| `JITTER_MAX_ATTESTS_PER_IP_HOUR` | `600` | Requests per address per hour, attest and erase together. |
| `JITTER_IP_SALT` | empty | Salt for the address hash in `ip_windows`. Set it in production. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.

## Deploying (the project is paused; nothing below has been run yet)

1. Restore the `jitter` Supabase project.
2. `supabase db push` — applies `20260924000001` (lock down), `20260924000002` (devices, server trust) and `20260925000001` (address windows, erase, `server_key_id`).
3. `node supabase/scripts/gen-server-key.mjs` → `supabase secrets set JITTER_SERVER_KEY_JWK='<private jwk>'`; add the public JWK to `CryptoUtils.SERVER_PUBLIC_KEYS` in `extension/src/crypto-utils.js` under its key id. Without it, attestations are stored but not countersigned and verifiers say "not checked".
4. `supabase secrets set JITTER_IP_SALT='<32 random bytes as hex>'` (for example `openssl rand -hex 32`).
5. `supabase functions deploy attest`, `supabase functions deploy verify`, `supabase functions deploy erase` (each picks up `verify_jwt = false` from `config.toml`).
6. Serve the verify page from a custom domain or a static host: `*.supabase.co` rewrites HTML responses to `text/plain`, so `/verify?hash=` links render as source there. `format=json` works regardless.
7. WGH: `JitterCapture.init({ siteKey: 'wgh', attestUrl: 'https://<project>.supabase.co/functions/v1/attest' })` and use `result.attestation` / `result.verifyUrl`.

Local: `npm run dev:functions` serves the three functions on 127.0.0.1:54321 against PGlite; `npm run test:backend` runs the backend tests; `npm run typecheck:backend` type-checks the functions.

## Rotating the server key

Attestations carry the id of the key that countersigned them, so rotation is additive: the new key signs from now on, the old public key stays known so old receipts still verify.

1. `node supabase/scripts/gen-server-key.mjs`. It prints the private JWK, the public JWK and the key id.
2. Add the public JWK to `CryptoUtils.SERVER_PUBLIC_KEYS` in `extension/src/crypto-utils.js`, keyed by its key id, next to the existing entry. Do not remove the old one: every receipt attested under it names it in `server_key_id` and verifies against it. Ship this before the next step, so verifiers know the new key before receipts start carrying it.
3. `supabase secrets set JITTER_SERVER_KEY_JWK='<new private jwk>'`. From then on `attest` signs with the new key and returns its id; a replayed badge still returns its stored signature and the old id. No redeploy, no migration.
4. Keep the old private key nowhere. If it was compromised, note the key id and the date: receipts naming it from before that date are still good, later ones are not, and removing its entry from the client-side map refuses them all.

Rows from before `server_key_id` existed have it null; on a replay `attest` reports the current key id for those, which is right until the first rotation.

## Known limits

- **One session is weak evidence.** The audit's simulation put humans mostly in "suspicious" and a scorer-aware bot in "verified". Thresholds and ramps were tuned on synthetic data and need real sessions (WGH) before any threshold is trusted. The layers above are what make it expensive anyway: a passing session on a day-0 device caps at 0.35.
- **The server trusts the client's typing score.** It caps and classifies but does not recompute it. A next step is recomputing WAR server-side from the profile the badge carries (the engine is plain JS; Deno can run it) and flagging mismatches.
- **A device key is not a person.** Two extensions on one laptop are two devices; one person with two browsers has two histories. That is acceptable for a frictionless start; linking devices is the wallet step below.
- **The per-address limit trusts the proxy.** The address comes from `x-forwarded-for` as the platform's gateway sets it. If the gateway appends the real address to a header the client sent rather than replacing it, the first entry is the client's to choose and the limit can be dodged by picking a new value: it then bounds careless floods, not deliberate ones. Confirm which it is on the live project and, behind Cloudflare, prefer `cf-connecting-ip`. Many people behind one address (a school, a carrier) share one budget; 600 an hour is meant to be generous for that, and changing it is a secret change, not a deploy.

## Next

1. **Deploy** (above) and get WGH data flowing; recalibrate on it.
2. **Mobile:** Anvil badges are still unsigned and unscored. Either run the shared engine on-device (a JS runtime) or score server-side from the profile Anvil sends, sign with an Android Keystore P-256 key, and attest with the motion block as an extra flag. Server-side scoring is the smaller change and also gives the cross-check above.
3. **Passport / wallet:** link devices to one identity when the user chooses to (a QR from one device to another, or an account), show totals across sites ("human · 14 months · consistent"), keep the post list opt-in.
4. **Capture gaps:** typing inside iframes and `about:blank` editors is not captured by the extension; the local passport can lose counts across tabs.
