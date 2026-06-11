# JITTEr Backend Hardening

Closes the two CRITICAL holes from the code audit — the forgeable attestation
endpoint and the exposed WAR score — plus the issues found while integrating
the audit package (see "Deviations" below).

## The architecture change in one line

**Before:** browser computes score → POSTs score → server stores whatever it's told.
**After:** browser sends raw timing → site backend signs → JITTEr server scores
authoritatively → stores its own verdict → returns classification only.

```
Browser (widget)                Site backend (e.g. WGH)            JITTEr (Supabase)
────────────────                ───────────────────────            ─────────────────
captures raw timing      →      /api/jitter-attest                 functions/v1/attest
scores locally (UI only)        holds JITTER_SITE_SECRET     →     verifies HMAC
never sends a score             signs body, forwards               sanitizes capture
                                                                   scores (scorer.ts)
                                                                   applies time cap w/
                                                                     true first_seen
                         ←      forwards response            ←     classification +
renders server verdict                                             badge_hash ONLY
```

## What lives where

| File | Role |
|---|---|
| `functions/attest/index.ts` | HMAC site auth, sanitization, rate limit, server-side scoring + time cap, server-signed badge hash. Score never returned. |
| `functions/verify/index.ts` | Public badge page. Renders classification + passport stats from the `public_badge` view via the **service role** key. No score anywhere. |
| `functions/_shared/scorer.ts` | WAR scorer — exact port of `sdk/src/core/jitter-box.js → scoreRaw`, parity-tested. |
| `migrations/20260611000001_harden_rls.sql` | Revokes ALL anon/authenticated access (tables AND view). Adds `public_badge` view, classification CHECK, rate-limit index. |
| `sdk/src/jitter-capture.js` | Widget. `scoreAndAttest()` POSTs raw capture to the site's signing proxy. Local score is UI-only. |
| `sdk/site-proxy-reference.js` | Reference Express handler for the site's signing proxy. The ONLY place the site secret lives. |
| `tests/forge-rejection.test.mjs` | Proves the auth/score-trust gate (unsigned, wrong-secret, smuggled-score requests all rejected). |
| `tests/scorer-parity.test.mjs` | Differential test: client and server scorers must agree exactly (fixed cases + 300-capture fuzz) + time-cap semantics. |

## Required environment (Supabase Edge Function secrets)

```
JITTER_SITE_SECRETS={"wgh":"<long-random-secret>"}
JITTER_ALLOWED_ORIGINS=https://wgh.app,https://www.wgh.app
JITTER_RATE_LIMIT=20
```

The same `wgh` secret goes in the site's backend env as `JITTER_SITE_SECRET`
(see `sdk/site-proxy-reference.js`). Generate with
`openssl rand -hex 32`. Rotate by adding a second key to the JSON, migrating
the site, then removing the old one.

## Deploy order (matters)

1. Run the migration FIRST (revokes public writes/reads). Old clients —
   including the extension, which still speaks the score-POSTing protocol —
   start failing to attest at this point. Expected.
2. Deploy `_shared/scorer.ts` + the two functions.
3. Set the env secrets.
4. Ship the SDK (`jitter-capture.js`) and stand up the site proxy.
5. Run `npm run test:unit` locally; smoke-test attest + verify against staging.

## Classification states

| State | Badge | Meaning |
|---|---|---|
| `verified` | green "Verified Human" | Typing scored ≥0.80 AND the passport is mature enough for the cap to allow it |
| `building` | gray "Building Trust" | Typing scored ≥0.80 but the passport is too young — the time cap withholds full trust. **Day-0 humans land here, not at 'bot'.** |
| `suspicious` | amber "Unverified" | Typing scored 0.50–0.79 |
| `bot` | red "Suspicious" | Hard floor tripped or score <0.50 |
| `insufficient_data` | (local badge kept) | <10 flight times — nothing stored |

Time-cap semantics (enforced by tests): the cap applies to the **penalized**
war (paste penalties survive it), limits confidence only (never promotes a
verdict), and is computed from the DB's `first_seen`, never a client claim.

## Deviations from the original audit package

The audit package was reviewed before integration; these defects were fixed:

1. **Scorer was not actually in parity with the client.** `pause_freq` was 10×
   off, `edit_ratio` used a different denominator, and `cross_signal` (weight
   0.15) was neutralized at 0.5 even though the widget sends the arrays it
   needs. Rewritten as an exact port; `tests/scorer-parity.test.mjs` fuzzes 300
   captures through both engines to keep it that way.
2. **`applyTimeCap` capped `raw_war` (pre-penalty).** A paste-flooded capture
   (raw 0.62, penalized 0.10) would have stored 0.62 on a mature passport —
   silently erasing the paste defense. Now caps the penalized war.
3. **Day-0 users were classified `bot`.** Cap 0.35 → `classify(0.35)` = bot →
   every new human got a red badge. Now: verified-quality typing on a young
   passport is `building` ("Building Trust").
4. **`verify` queried base tables with the anon key** — which the package's own
   migration had just revoked, so every badge page would have 404'd after
   deploy. Now reads the `public_badge` view with the service role.
5. **The view was anon-readable → bulk enumeration.** Anyone could
   `GET /rest/v1/public_badge` and dump the entire badge ledger + passport
   stats. Anon now has ZERO grants; the verify page (one hash at a time) is the
   only public read path. (Supabase default privileges auto-grant on new
   objects — the migration revokes explicitly or the view would ship
   world-readable.)
6. **Passport aggregates trusted client meta.** `meta.keys` could pump
   `total_keystrokes` — the stat the time-is-the-moat thesis rests on — even on
   honestly-signed requests. Now derived from the sanitized capture the server
   scored. (The old meta field names also matched nothing any current client
   sends.)
7. Added: capture sanitization (type/range/length), 1MB body cap, whitelisted
   meta, nonce in the badge hash, non-throwing tier lookup, top-level
   try/catch (no internals leak), HTML escaping + `no-store` on the verify
   page, and the widget no longer clobbers its local badge on attest errors.

## Known limitations (deliberate, documented)

- **Rate-limit race:** count-then-insert; a concurrent burst can overshoot the
  hourly limit by the number of in-flight requests. Bounded and acceptable; an
  atomic DB function can replace it if it ever matters.
- **Detector blindness is NOT fixed here.** This work makes the score
  *unforgeable*, not *correct* against an adapted attacker —
  `lab/results/report.md` shows fixed_delay / uniform_random / gaussian_mimic /
  replay passing the detector. That is a separate, harder problem. The
  server-side time cap (true `first_seen`) is the real defense at short-form
  length — lean on it.
- **The extension still speaks the old protocol** and will fail to attest until
  it is ported to the proxy flow (tracked as part of the biometrics swap).
