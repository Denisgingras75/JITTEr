# Functionality Audit — JITTEr

**Date:** 2026-09-24 · **Audited commit:** `4231806` (main, 2026-03-08) · **Scope:** extension, SDK, scoring engine + lab, Supabase backend, Android keyboard, tests/tooling · **Code changed by the audit:** none. The separate Anvil motion-sensor feature was committed after the audit (see the end); line numbers below refer to `4231806`.

Severity: **P0** = core flow unusable or core promise violated · **P1** = major feature broken or wrong results · **P2** = partial / edge-case breakage · **P3** = minor.
Evidence: **VERIFIED** = observed by running it (real MV3 extension in Chromium under Xvfb, Node/Deno harnesses, PGlite Postgres, JVM) · **STATIC** = code reading · **LIVE** = read-only check of the deployed Supabase project · **DOCS** = Supabase platform documentation.

---

## TL;DR

**As committed, no end-to-end user flow works.**

| Flow | Status | Why |
|---|---|---|
| Student writes in the extension's Writer, teacher verifies | ❌ | `writer.html`, `verify.html`, `verifier.html` load their scripts from the wrong folder and use inline or remote scripts that Manifest V3 blocks (P0-1). |
| Badge from any web page, verified by a recipient | ❌ | The server path returns 401 on every call and the Supabase project is paused (P0-6). The in-extension check accepts forged badges (P0-2). |
| Website embeds the SDK widget | ❌ | `Jitter.init()` / `JitterBox.attach()` recurse until the stack overflows (P0-7). None of the 8 widget done-criteria in JITTER-PLAN are met. |
| Android keyboard | ❌ | The project can't be built by any documented route (P0-9). |
| `npm test` | ❌ | 0 of 39 pass. The unit tests that do pass aren't run by it (P1-20). |

**The core promise doesn't hold yet:**
- **Scoring:** the scorer doesn't separate humans from bots within one session. In a 200-session simulation, synthetic humans were almost never "verified", while a bot written against the shipped scoring code was "verified" every time (P0-8).
- **Forgery:**
  - Badges verify against a key carried inside the badge itself (P0-2).
  - Page JavaScript can pass as a human: the extension mints it a signed badge, and the SDK rates a 40-line script "verified" (P0-3).
  - The SDK signs nothing. Its token is plain base64, and its trust gates live in `localStorage` (P0-10).
  - The database accepts attestations written directly with the public anon key (P0-5).
- **Time moat:** "time is the moat" isn't implemented anywhere a server enforces it. The only time cap reads a client-side date that the client can change.

**What does work (VERIFIED):**
- **Capture and live HUD:** in the page's main frame, keystrokes are captured from every input type tested, and the HUD updates.
- **Minting:** badges are copied to the clipboard as HTML and plain text. From the second badge onward the ECDSA signature verifies.
- **Paste:** pastes are detected.
- **Hard Rule #1:** the content-script path never stores or sends typed text.
- **Scoring code:**
  - The engines never produce NaN or out-of-range scores under a 100k-session fuzz, and they're fast.
  - Constant-delay and zero-delay bots are caught.
  - The committed lab results and the SDK bundle are reproducible byte-for-byte.
- **Backend (repo code, not the deployed project):**
  - The migrations apply cleanly.
  - Both functions type-check.
  - `/attest` handles CORS and validation correctly in isolation.

---

## Fix status on this branch

The branch now carries the fixes below (see `docs/architecture/TRUST_LAYER.md` for the design). "Deploy" means the Supabase project is paused, so the server-side pieces are tested locally (PGlite + Deno) but not yet deployed.

| Finding | Status |
|---|---|
| P0-1 Writer/Verify pages can't run | Fixed. Both load in a real MV3 extension; the page tests pass. |
| P0-2 Forged badges verify | Addressed. Trust is anchored on the server: badges are signed by a device key held in the service worker, and the verify page shows whether the server attested the badge (device age, cap, verdict) and whether the server countersignature checks out. A self-signed badge with no attestation says NOT SERVER-ATTESTED; an edited attestation fails the countersignature. |
| P0-3 Page script can pass as a human | Fixed in the extension, the SDK core and jitter-capture: untrusted events, auto-repeat and scripted clicks are ignored. |
| P0-4 Crafted badge link runs script | Fixed. All badge fields are escaped; the certificate checks the signature first. |
| P0-5 Backend accepts forged attestations | Fixed (deploy). Tables closed to the anon key; `/attest` requires a device-signed badge, rate-limits per device, applies the age cap from its own records and countersigns. |
| P0-6 No recipient can verify | Mostly fixed (deploy). `verify_jwt` off for both functions (the device signature is the credential); `/verify` public with `format=json`. Still needed: a custom domain or static host for the HTML page. |
| P0-7 SDK `attach` recursion | Fixed. Browser smoke tests added. |
| P0-8 Scoring weak; no time moat in code | Time moat now in code: server-side device age cap (plan's step table), per-device rate limit, replay guard. Single-session discrimination unchanged: needs real sessions to recalibrate. |
| P0-9 Android can't build | Build configuration fixed and the Gradle wrapper committed; the full build still needs a machine with the Android SDK. |
| P0-10 SDK signs nothing | Fixed for jitter-capture (device key, signed and bound badge, attestation). `Jitter.init`'s `jtok_` token is still unsigned. |
| P1-1 Badge WAR drops penalties | Fixed. |
| P1-2 Badge not bound to text/page | Fixed: `text_hash` + `url` in the signed payload; verify page checks pasted text against the hash. |
| P1-3 Paste penalized | Fixed: one shared engine weights each paste by length (0.1×/0.3×/1.0×) into purity only; no penalty, `high_paste_volume` flag. |
| P1-4 First badge unsigned / replay click | Fixed. |
| P1-5 Ledger not verifiable | Open. |
| P1-6 verify.html unescaped | Fixed. |
| P1-7 Signature skips nested fields | Fixed (canonical JSON, unit-tested, server parity-tested). |
| P1-8 Identity unstable | Replaced by device identity (no login). |
| P1-9 Badges with no evidence | Fixed: 20 typed characters minimum (client and server); sessions counted on STOP. |
| P1-10 Passport lost across tabs | Open (the local passport is display-only now; the server profile is the record). |
| P1-11 Iframe editors not captured | Open. |
| P1-12 verifier.html mis-renders | Fixed by removal. |
| P1-13 Profile aggregation races | Fixed: one SQL statement (`record_attestation_stats`). |
| P1-14 `/verify` stored XSS | Fixed. |
| P1-15 Lab claims circular | Partly: the lab now scores with the shipping engine; the evaluation design is unchanged. |
| P1-16 Dwell floor bypass | Open. |
| P1-17 Loki gate refuses humans | Open (needs real data). |
| P1-18 WGH capture path weakest | Partly: dwell measured per key (rollover fix); bigram/per-key data still missing on that path. |
| P1-19 Engine forked | Fixed: `extension/src/war-score.js` is the one engine; SDK bundle and lab load it. |
| P1-20 Tests protect nothing | Fixed: `npm test` runs 209 unit tests, 80 backend tests and 75 Playwright tests (Writer, verify page, capture scope, real extension, SDK) and fails on failure; `bot-battery` deterministic. No CI yet. |
| P1-21 Android badge unsigned | Open (see TRUST_LAYER.md "Next"). |
| SDK-b / SDK-c / SDK-e..h | SDK-b, e, f, g, h fixed; SDK-c (mobile/IME on the WGH path) open. |
| P2 locale, held key, first-badge, badge id, BE-6 enumeration | Fixed. |

---

## Live deployment status (LIVE)

| Item | State |
|---|---|
| Supabase project `jitter` (`fmguuhnustgcqzgjaoil`) | **INACTIVE (paused)**; database connections time out |
| Edge functions | `attest` v3 and `verify` v2 are deployed; their source matches the repo |
| `verify_jwt` | **true on both** (`config.toml` has no `[functions.*]` override) |
| Consequence | Any request without a valid JWT in `Authorization` gets a platform 401 before the function runs (DOCS). HTML from functions on `*.supabase.co` is served as `text/plain` (DOCS). |

---

## Component scorecard

| Component | Works today? | Headline | Key findings |
|---|---|---|---|
| Extension: content script, HUD, mint | Partly | Capture and mint work. Badges are forgeable, page JS can mint them, and links are an XSS vector. | P0-2, P0-3, P0-4, P1-1, P1-2, P1-7..P1-11 |
| Extension: Writer / Verify / Verifier pages | No | Scripts don't load in the real extension | P0-1, P1-4, P1-5, P1-6, P1-12 |
| Extension: popup / background / sign-in | Partly | Buttons open broken pages. The sign-in identity isn't stable. | P1-8, P3 |
| SDK widget (current build target) | No | `attach` recursion; 0 of 8 done-criteria; nothing signed; trust gates in `localStorage`; mobile and IME typing unscored on the WGH path | P0-3, P0-7, P0-10, SDK section |
| Scoring engines (lab / SDK / extension) | Runs, doesn't discriminate | Three forks; paste is penalized; the time cap raises penalized scores | P0-8, P1-1, P1-3, P1-15..P1-19 |
| Supabase backend | Unreachable; insecure | 401 via `verify_jwt`, trusts the client, RLS open to anon | P0-5, P0-6, P1-13, P1-14 |
| Android keyboard | Doesn't build | Also has unsigned badges and fake purity | P0-9, P1-21..P1-23 |
| Tests / CI | No | 0/39 via `npm test`, no CI, and the tests hit the build artifact rather than the source | P1-20, P2 |

---

## P0 findings

### P0-1 · The extension's Writer, Verify and Verifier pages can't run · VERIFIED (real MV3 extension)
- **Wrong script paths:**
  - `writer.html:446-450` loads `crypto-utils.js`, `passport-utils.js`, `auth-utils.js`, `biometrics.js` and `writer.js` from `extension/`, but the files live in `extension/src/`.
  - The same applies to `verify.html:279-280` and `verifier.html:279`.
  - This broke in the restructure commit `53ef9c2`. Commit `c360ca7` fixed `manifest.json` but not the HTML.
- **Blocked by Manifest V3 CSP even with the paths fixed:**
  - Firebase is loaded from `www.gstatic.com` (`writer.html:442-444`).
  - `verify.html` has a ~370-line inline `<script>` plus inline `onclick`/`oninput` handlers.
  - The popup's inline script was already moved out for this reason in `35144c3`.
- **Result:** typing in the Writer does nothing, and VERIFY does nothing. The popup's "Open Writer" and "Verify Badge" buttons lead to these dead pages.
- **Fix:** point the tags at `src/…`, move the inline scripts into files and use `addEventListener`, and drop or bundle Firebase. A patched copy with these changes loaded cleanly.

### P0-2 · Forged badges show "SIGNATURE VALID" · VERIFIED
- **The badge vouches for itself:** it carries its own `publicKeyJwk` (`writer.js:387`, `content.js:317-320`). `verify.html:340-347` verifies the signature against that embedded key.
- **Forgery:** anyone can build a payload with any values (WAR 0.99, "Master", a 400-day account), sign it with a key they generate, embed that key, and get "Badge Verified ✅ / SIGNATURE VALID / High confidence". This was reproduced both with plain WebCrypto and in the real extension.
- **Private key exposure:** the user's private key is stored as an extractable JWK in `chrome.storage.local` (`crypto-utils.js:43-50`), and it can be read from the content-script context on any site.
- **Fix:** anchor trust. Either register each device's public key with the server at sign-in and have verifiers fetch it by key ID, or have the server countersign. Sign from a non-extractable key held in the service worker.

### P0-3 · Page script can pass as a human (extension and SDK) · VERIFIED
- There are no `isTrusted` checks anywhere in `extension/src` or `sdk/src`, so synthetic `KeyboardEvent`s from page script count as typing (`content.js:71-111`; `sdk/src/core/jitter-box.js:415-426`; `jitter-capture.js:69-95`).
- **Extension:**
  - The MINT and START buttons are ordinary DOM nodes in the page with `onclick` handlers (`content.js:224-235`), so page script can click them.
  - **Repro:** 360 dispatched events with log-normal timing, then `.click()` on `#btn-start` and `#btn-copy`. The result was a signed "All-Star" badge (WAR 0.75, no flags) on the clipboard.
  - 5,000 synthetic keydowns also inflated the passport by 5,000.
- **SDK:**
  - A plain-JS bot dispatching synthetic `KeyboardEvent`s (`isTrusted=false`) scored **0.91–0.95, "verified"** in 4 of 4 runs on the engine path. Simulated humans typing with trusted input scored 0.59–0.78, all "suspicious".
  - Text inserted without key events (`execCommand('insertText')`, CDP `insertText`) is credited through the mobile fallback (`jitter-box.js:524-573`) with no dwell data, so the dwell floor never fires.
- **Fix:**
  - Ignore `!e.isTrusted`.
  - Require key events for "typed" credit.
  - In the extension, move the UI into a closed shadow root or the popup, and require a trusted gesture to mint.

### P0-4 · A crafted badge link runs script on any site the user visits · VERIFIED
- `showMiniHUD` (`content.js:241`) and `showCertificate` (`content.js:245-289`) decode `#jitter:<base64>` from any link and insert `date`, `war`, `title` and other fields into `innerHTML` unescaped.
- **Repro:** an `<img onerror>` in `date` executed in the host page's main world on hover alone, and read `document.cookie` on click. Forum or comment sites that allow links but sanitize HTML are exposed through the extension.
- The certificate also renders "Verified" for unsigned, hand-made payloads.
- **Fix:** build the DOM with `textContent`. Verify the badge before rendering, and show "UNVERIFIED" otherwise.

### P0-5 · The backend accepts forged attestations, directly or through the API · VERIFIED (PGlite + Deno harness) and code-checked
- **Through `/attest`:** `attest/index.ts:15-51` takes `user_id`, `site_key`, `war_score` and `classification` from the request body. It has no caller authentication, no signature check, no replay protection and no rate limit.
  - `{user_id:"someone-else", war_score:1, classification:"verified"}` makes `/verify` show "Verified Human".
  - Replaying one body 50 times makes a profile "Master".
- **Directly against the tables:** the RLS policies named "Service role write" have no `TO service_role` clause, so they apply to everyone:
  - `…001:24-25`: `FOR INSERT WITH CHECK (true)`
  - `…002:25-26`: `FOR ALL USING (true) WITH CHECK (true)`
  - The anon key is committed at `extension/src/background.js:12`. With it you can insert "Verified Human" rows and update, backdate or delete anyone's profile.
  - Inserting a duplicate hash makes a real badge show "Badge not found". A row with `flags = NULL` crashes `/verify` with a 500.
- **Fix:**
  - Drop the write policies; the service role bypasses RLS anyway.
  - Serve reads through a lookup-by-hash RPC.
  - Take identity from a real user JWT (`auth.uid()`).
  - Derive trust on the server rather than accepting client scores.

### P0-6 · No recipient can verify a badge today · LIVE + DOCS + VERIFIED client behaviour
- **Auth:** `content.js:400-403` and `sdk/src/jitter-capture.js:284-286` POST with only `Content-Type`. Both deployed functions have `verify_jwt: true`, so every call gets a platform 401.
- **Silent fallback:** both clients swallow the error. The extension falls back to a `#jitter:` anchor, which is only meaningful to other extension users (P0-4). The SDK leaves `verifyUrl` null.
- **Verify links:** a `/verify?hash=` link is a plain navigation, so it can never carry the header. Even without the gate, `*.supabase.co` rewrites `text/html` to `text/plain`.
- **Deployment:** the project is paused.
- **Fix:**
  - Set `verify_jwt = false` for `verify` and serve the page from a custom domain or static host.
  - For `attest`, send a real user JWT. Adding the public anon key gains no trust.
  - Unpause the project or move it.

### P0-7 · The SDK widget crashes on attach · VERIFIED (reproduced by the lead in Chromium)
- `sdk/dist/jitter.min.js` has two `function attach` declarations in one scope (`:409` core, `:1032` `init.js`). Hoisting makes `JitterBox.attach` the init wrapper, which calls `JitterBox.attach` again. In the browser `JitterBox.attach === Jitter.attach` is `true`.
- Both `JitterBox.attach(el)` and `Jitter.init({...})` throw `RangeError: Maximum call stack size exceeded`, so nothing attaches.
- Knock-on effects:
  - The MutationObserver callback throws for textareas added later.
  - `Jitter.score()` always returns null.
  - `examples/vanilla.html` throws at `:121`, so its Score and Reset handlers are never wired.
- The bug has been in every dist build since the first one (`f640e1d`), including `archive/jitter-sdk/dist`.
- No test calls `attach`.
- **Fix:**
  - Give each module its own scope in `build.js`, or rename one of the `attach` functions.
  - Add a browser smoke test: init → type → `score()` returns non-null.
  - Two bugs only show up once this is fixed: SDK-f and SDK-g below.

### P0-8 · One session's score doesn't separate humans from bots, and "time is the moat" isn't in the code · VERIFIED (synthetic populations; the human rates depend on the model)
The same event streams were fed to all four engines, 200 sessions per population. Synthetic humans were generated keystroke by keystroke with log-normal timing, bigram structure, per-key dwell, word, sentence and thinking pauses, typo corrections and fatigue.

| Population | Mean WAR (lab / SDK / capture / ext) | "Verified" (lab / SDK / capture) | SDK AUC vs humans |
|---|---|---|---|
| Humans | .70 / .65 / .66 / .64 | 5.5% / 4.5% / 0% | – |
| Constant-delay bot | .13 / 0 / 0 / 0 | 0 | 1.0 |
| Uniform-jitter bot | .63 / .48 / .66 / .48 | 0 | .96 (capture .53) |
| i.i.d. log-normal bot with fake backspaces | .73 / .64 / .68 / .62 | 4% / 0 / 0 | .56 |
| Replay of a human (time ×0.9–1.1) | .69 / .65 / .66 / .63 | 4.5% / 4% / 0 | .53 |
| Bot using a stolen profile (stats the badge exposes) | .73 / .70 / .69 / .68 | 13.5% / 11% / 0 | .36 |
| Bot written against the shipped scorer | .93 / .94 / .74 / .93 | **100% / 100%** / 0 | – |

**Why:**
- Five components saturate for everyone.
- The cross-signal and distribution checks score an i.i.d. log-normal bot *above* humans.
- The one component that favours humans, per-key dwell CV, has a ramp (0.09–0.25) above the lab's own human figure of about 0.1. Typical humans score 0.11 on it.
- `dwell_uniformity` duplicates `per_key`.

**Time moat:** nothing in shipping code compares a user's profile across sessions; the lab matching engine is unused. The only time cap is in the extension, and it reads a `firstUsed` value from `chrome.storage.local` that the client can edit and backdate. The server never uses `profiles.first_seen`.

**Fix:** calibrate on real recorded humans (WGH is the natural source) against held-out attackers, and report ROC curves. Treat one session as weak evidence. Enforce account age and cross-session consistency on the server.

### P0-9 · The Android keyboard can't be built by any documented route · VERIFIED
- **Repositories conflict:** the root `build.gradle:14-19` declares `allprojects { repositories {…} }`, while `settings.gradle:9` sets `FAIL_ON_PROJECT_REPOS`, so configuration fails. Removing that block makes configuration pass.
- **No wrapper:** there is no `gradlew` or `gradle-wrapper.jar`. The README's `./gradlew assembleDebug` and `cd AnvilKeyboard` (the folder is `android/`) both fail.
- **Gradle vs JDK:** the wrapper pins Gradle 8.0, which can't run on JDK 21 ("Unsupported class file major version 65"). Current Android Studio bundles JDK 21. AGP 8.1.0 predates JDK 21 support.
- **Fix:** delete the `allprojects` repositories block, commit a wrapper for Gradle ≥ 8.7, and move to AGP ≥ 8.2.x (or pin JDK 17).

### P0-10 · The SDK signs nothing, and its trust gates live in the browser · VERIFIED
- There is no cryptography anywhere in `sdk/src`.
- The session token is `'jtok_' + btoa(JSON)` (`init.js:250-268`). The code comment says "NOT security — server validates with secret key", but no key, signature or verifier exists, and nothing consumes `jtok_`.
- **Forging a token:** decoding a token, setting `war:1` and `classification:'verified'`, and re-encoding gives a token indistinguishable from a real one.
- **The "3 reviews over 3 days" gate** (`init.js:26-45`) reads `localStorage`:
  - Two `setItem` calls turned a day-0 session into `eligible:true`.
  - Every `score()` call counts as another "review" (`init.js:212`).
- **The capture path's `badge_hash`** is a server lookup key over values the client asserts. It is not a signature (P0-5).
- **Fix:** sign on the server (or with a registered per-site key) over score + nonce + user. Keep first-seen and review counts on the server, tied to an authenticated user.

---

## P1 findings

**Extension: badges and scoring**
- **P1-1 · Badge WAR discards every penalty.** `applyTimeCap` uses `Math.min(raw_war, cap)` (`biometrics.js:575, 581`), where it should use `war`. It's called at `content.js:325` and `writer.js:333`. A session that the HUD shows as WAR 0.01 (paste flood) mints as 0.35 on a new account and 0.63 at 200 days. A sophisticated-bot profile goes from 0.08 to 0.35. Commit `6a85658` fixed the same mix-up in the HUD only. VERIFIED.
- **P1-2 · Badges aren't bound to any text or page.**
  - The payload has no content hash, URL or field ID, so one session can certify any number of texts.
  - Keys typed anywhere in the tab count, including password fields and the page body.
  - Fix: sign a salted hash of the certified field's final text, plus the URL, and count only keys aimed at that field. VERIFIED.
- **P1-3 · Paste is penalized, violating Hard Rule #5 and the SDK done-criterion.**
  - SDK and extension apply `paste_heavy` (−0.15), `paste_flood` (−0.30) and a ×(1 − paste ratio) multiplier (SDK `:281-318`, extension `:529-564`).
  - Pasting one 250-character quote makes 91.5% of humans "bot"; three pastes make it 100%.
  - One 65-character quote drops the HUD WAR from 0.60 to 0.48.
  - In the SDK, with the same typed text each time:
    - one pasted 39-character URL takes the WGH capture path from 0.60 to **0.47, "bot"**;
    - a 445-character paragraph takes the engine path from 0.71 to 0.13, "bot".
  - A "bot" result skips the building gate, so the badge immediately reads "Automated" (`init.js:71`).
  - The spec's length weighting (0.1×/0.3×/1.0×) and `high_paste_volume` flag exist nowhere. VERIFIED.
- **P1-4 · Two bug fixes from `e84cabf` were lost in the restructure (`53ef9c2`).**
  - The first badge of every install can't be verified: the public key is read before `getOrCreateKeyPair()` creates it (`writer.js:320-329`, `content.js:314-321`).
  - The Replay panel needs two clicks to open (`writer.js:483`).
  - `extension/old-code/writer.js` still contains both fixes. VERIFIED.
- **P1-5 · The Writing Ledger isn't verifiable.**
  - Each checkpoint's hash includes one `Date.now()`, but the stored `t` comes from a second call a few ms later (`writer.js:35-37`). Only 5 of 17 checkpoints in a real export could be recomputed.
  - The hash covers only previous hash + content, not `hasPaste` or `ops[]`, so paste evidence can be deleted without breaking the chain.
  - No teacher-side ledger verifier exists; JITTER_FOUNDATIONS.md:261 describes one.
  - The export stores every typed character and all pasted text (`writer.js:183, 209`), which is in tension with Hard Rule #1. VERIFIED.
- **P1-6 · `verify.html` builds its result with unescaped `innerHTML` (`:467` and elsewhere).** A badge whose signature fails can inject CSS that hides the real "SIGNATURE INVALID" banner and paints a fake "SIGNATURE VALID" one. VERIFIED (screenshot).
- **P1-7 · The signature covers nested fields only when their key name also appears at the top level.**
  - The cause is `JSON.stringify(obj, Object.keys(obj).sort())` (`crypto-utils.js:101, 139`); a replacer array whitelists names at every depth.
  - Tampering with `war_components.bigram_rhythm` or `per_key` still verifies VALID. `war_components.purity` is protected only because `purity` is also a top-level key.
  - Fix: sign an RFC 8785 canonical serialization. VERIFIED (lead).

**Extension: identity, sessions and capture**
- **P1-8 · Identity isn't stable or verifiable.**
  - Without the `identity.email` permission, `getProfileUserInfo` returns an empty email, so `user_id` becomes SHA-256 of the OAuth access token (`background.js:58-64`). It changes on every token refresh and is never validated.
  - The `SUPABASE_URL` and `SUPABASE_ANON_KEY` constants are unused.
  - Every signed-out user attests as `user_id:"anon"` (`content.js:391`), so their profiles pool into one.
  - Without a `key` in the manifest, `getAuthToken` only works if the OAuth client matches the unpacked extension's path-derived ID. VERIFIED / STATIC.
- **P1-9 · Badges can be minted without evidence.**
  - START then MINT with zero keys gives a signed `INT:100%` badge.
  - IME and on-screen keyboard input (`Process`/`Unidentified` keys) is ignored but still reported as 100%.
  - Every MINT click increments `sessionsCompleted`. VERIFIED.
- **P1-10 · The passport loses updates across tabs and frames.** Each frame writes the whole object. 30 keys in tab A plus 5 in tab B stored as 5; 99 keys across iframes stored as 11. VERIFIED.
- **P1-11 · Iframe editors don't count toward badges.** Typing in same- or cross-origin iframes never reaches the top-frame session. Editors inside `about:blank` / `designMode` frames (CKEditor 4, classic TinyMCE) aren't captured at all, because the manifest lacks `match_about_blank` and `match_origin_as_fallback`. VERIFIED.
- **P1-12 · `verifier.html` / `verifier.js` expect a legacy "Anvil" format** (`purity`, `humanChars`, …). A genuine badge renders as "undefined%, Invalid Date", and `{"totally":"made up"}` gets a green "✓ Verified Human Input". VERIFIED.

**Backend**
- **P1-13 · Profile aggregation is read-modify-write and ignores errors** (`attest/index.ts:62-95`).
  - 20 concurrent attests count as 2.
  - A failed upsert still returns success.
  - A string WAR like `"0.8"` concatenates and leaves `avg_war` NULL. VERIFIED.
- **P1-14 · `/verify` interpolates `flags`, `site_key`, `level` and `sites_used` without escaping** (`verify/index.ts:72-104`). Today the text/plain rewrite hides this. It becomes stored XSS once the page moves to a custom domain, which is the fix for P0-6. VERIFIED.

**Engine and lab**
- **P1-15 · The lab's headline numbers don't describe the product and are circular.**
  - The "11/11" scorecard evaluates `lab/algo/matching-engine.mjs`, which no shipping code uses.
  - Synthetic humans are clamped at the detector's own thresholds, and each lab bot has a built-in tell matching a detector check.
  - Thresholds were tuned on the same generators the lab tests against.
  - The "100% replay detection" replays a byte-identical session. With ±0.1% noise it drops to 1.5%.
  - **The 61% cross-user false-match rate re-derives to 61%.** CLAUDE.md's "fixed in lab" is false. VERIFIED.
- **P1-16 · Bots can slip past the dwell floor.** Dwells under 10 ms are discarded rather than flagged (`MIN_DWELL_MS`), so Playwright `press()` (1–4 ms dwells) never triggers the floor. The SDK's input-event fallback accepts text with no key events, and 69% of such sessions land in the same class as humans. VERIFIED.
- **P1-17 · The extension's Loki bot gate refuses badges to about half of synthetic humans.** The rate is 51%, and ranges from 1.5% to 75% depending on how much the typist slows at the start of each word (`biometrics.js:315`, `content.js:292`). VERIFIED (model-dependent).
- **P1-18 · The WGH capture path (`jitter-capture.js` → `scoreRaw`) is the weakest.**
  - 37% of the weight is fixed at 0.5, so no human can reach "verified" (max ≈ 0.815).
  - `pause_freq` has the wrong unit.
  - About 20% of keyups are paired with the wrong keydown.
  - AUC against a uniform-jitter bot is 0.53. VERIFIED.
- **P1-19 · The engine has been forked three or four ways.**
  - The "canonical" `lab/jitter-box.js` is the stalest.
  - The SDK and extension versions have 10 signals with different weights, floors and penalties.
  - The capture path differs again. The same input gets different classes in 6–55% of sessions, depending on the population. VERIFIED.

**Tests**
- **P1-20 · The test suite doesn't protect anything.**
  - `npm test` as committed: 0 passed, 32 failed, 7 did not run. The page tests open `writer.html`/`verify.html` at the repo root.
  - With paths and scripts fixed, 20 of 31 page tests pass. The remaining 11 split into 6 product bugs, 4 outdated tests and 1 of both (triage below).
  - The Node unit tests aren't in any npm script. Playwright executes them as a side effect of collection and exits 0 even when they print FAIL. If the bundle is missing, `bot-battery` calls `process.exit(0)`, so zero tests run and the result is still green.
  - `bot-battery` and `wgh-widget` test the committed dist bundle, not the source. `lab/jitter-box.js` isn't loaded by any test.
  - `tests/extension.test.js` points at the repo root (no manifest there), uses the MV2-only `backgroundPages()`, and calls `browser.contexts()` on a BrowserContext.
  - No CI exists. VERIFIED.

**Android**
- **P1-21 · The Android badge is unsigned and forgeable** (`BiometricTracker.kt:165-190`). It hard-codes purity 100, jitter 0 and pressure 0. The "hash" is just SHA-256 of the same JSON. No verifier reads `data-anvil-verify`. This violates Hard Rule #4. VERIFIED.
- **P1-22 · Android biometrics are collected and then thrown away.**
  - `generateBadge()` and `endSession()` have no callers, and every `onStartInputView` wipes the session.
  - Near-zero-interval bursts are silently dropped yet still counted as lifetime keystrokes.
  - `onPaste()` has no caller, so purity is always 100% and the README's "Pasting is detected" is false. VERIFIED.
- **P1-23 · The keyboard isn't usable day to day.**
  - The "123" key is a TODO, so there are no digits or `@?!'`.
  - Enter commits `"\n"` and ignores IME actions (send, search, go).
  - Backspace doesn't delete a selection and can split emoji. STATIC.

---

## SDK section
The SDK is the "current build target" in CLAUDE.md. It was driven in Chromium with real form submissions, trusted input (CDP) and synthetic events. A locally patched bundle was used only to look past P0-7; it is not proposed as a commit.

### JITTER-PLAN §1 done criteria: 0 of 8 met

| Criterion | Status | Evidence |
|---|---|---|
| Script tag on demo.html auto-attaches | ❌ | No `demo.html` or `jitter-widget.js` exists. A script tag alone attaches nothing, and `init()` crashes (P0-7). |
| Typing shows the live dot and stats bar | ❌ | The SDK renders nothing while typing; the DOM is unchanged mid-typing. |
| Submit shows the badge inline (WAR, tier, purity) | ❌ | There is no submit listener. The badge appears only through a manual `createBadge`/`insertBadge`, as a label such as "Human Verified (84%)". |
| Clicking the badge opens the passport modal | ❌ | The badge has no click handler, and there is no passport code in `sdk/`. |
| Badge has a valid ECDSA P-256 signature | ❌ | There is no cryptography in `sdk/` (P0-10). |
| Hidden `jitter_badge` field in form data | ❌ | The captured POST body was `title=&review=…&second=`. |
| A pasted paragraph appears in stats and isn't hard-penalized | ❌ | A 445-character paste gives 0.13, "bot", and there is no stats UI (P1-3). |
| Day-0 WAR is capped at 0.35 | ❌ | Day-0 WAR was 0.78, uncapped. Only a `localStorage` "building" label exists. |

### What works in the SDK (VERIFIED)
- **Build:** `node sdk/build.js` succeeds, and the committed dist is byte-identical to a fresh build.
- **jitter-capture.js** (the WGH path):
  - It attaches to `textarea[data-jitter="true"]`, including textareas added dynamically.
  - It scores through `JitterBox.scoreRaw` and returns war, classification, flags, meta and a Shadow-DOM badge.
  - Its POST passes `/attest`'s CORS preflight.
  - It never blocks the host page.
- **Hard floors** catch constant-rate and uniform-random `press()` bots.
- **Scripted input:** `el.value=`, `fill()` and paste-only input get no score, rather than a false "human".
- **Privacy:**
  - No typed text is stored or sent.
  - Storage is limited to two `localStorage` keys.
  - The bundle makes no network requests of its own.

### SDK-specific findings
- **SDK-a · P1 · The widget layer in the plan doesn't exist.**
  - There is no submit hook, hidden field, live indicator, automatic badge or passport modal.
  - `showBadge` and `apiUrl` are never read, and `checkVelocityPatterns` is never called.
  - `sdk/jitter-widget.js`, `sdk/demo.html` and `sdk/react/` don't exist.
- **SDK-b · P1 · The capture → Supabase path is broken end to end.**
  - There is no option to send an auth header, so every call gets a 401 (P0-6).
  - The code never checks `res.ok`, and `.catch` swallows errors, so failures come back as `badge_hash: null`.
  - The `meta` keys (`pasteCount`, `totalFocusMs`, …) don't match what `/attest` reads (`meta.keys`, `meta.paste_chars`, `meta.focus_ms`), so profile totals never increase.
  - `verifyUrl` is unusable (P0-6).
- **SDK-c · P1 · Mobile and IME typists get no score on the WGH path.**
  - `jitter-capture.js:83` counts only keydowns where `key.length === 1`. Android-style `Unidentified`/229 events and IME composition give `insufficient_data` (tested with CDP emulation, not a real device).
  - On the engine path they are scored without dwell data, and IME composition updates are counted as keystrokes (48 for 40 characters).
- **SDK-d · P1 · Scale, labels, time cap and weights all diverge from the spec.**
  - WAR is on a 0–1 scale, not 0–10.
  - There are three label vocabularies:
    - classifications: verified / suspicious / bot / building;
    - `badge.js`: "Human Verified" / "Under Review" / "Automated" / "Building Trust";
    - `jitter-capture.js`: "Verified Human" / "Unverified" / "Suspicious".
  - There is no time-confidence cap.
  - The weights (editing 0.05 / dwell_uniformity 0.04 / purity 0.03) differ from the spec and from the lab engine.
  - On the WGH path, `scoreRaw` fixes 37% of the weight at 0.5, so its maximum is about 0.815 and "verified" is effectively unreachable (P1-18).
- **SDK-e · P2 · `Jitter.init()` called from `<head>` throws.** It calls `observe(document.body)` while `body` is still null, and doesn't wait for DOMContentLoaded.
- **SDK-f · P2 · Once P0-7 is fixed, `Jitter.init` disables jitter-capture.** It overwrites `data-jitter="true"` with `"active"` (`init.js:184`), which the capture selector no longer matches.
- **SDK-g · P2 · Engine accounting bugs** (VERIFIED on the patched bundle):
  - Each backspace is counted twice, once on keydown and once on input deletion (`jitter-box.js:420-423`, `:529-533`).
  - `reset()` leaves `lastInputLength` set: after the host page cleared the field, 142 phantom backspaces were recorded.
  - On contenteditable, a paste is counted by both the paste handler and the observer, so a 68-character paste became 136 pasted characters and a "bot" result.
  - The input fallback reads `el.value`, which is undefined on contenteditable.
- **SDK-h · P2 · jitter-capture mismeasures dwell when keys overlap.** It uses keyup minus the *last* keydown rather than the same key's keydown (`:92`, `:100-101`). A very fast typist's true 113 ms mean was measured as 54 ms, and 12–27% of samples fell under the 27 ms bot floor.
- **SDK-i · P2 · Multiple fields.** `Jitter.score()` with no argument returns the last-attached instance, not the active one. `insertBadge` can remove another field's badge.
- **SDK-j · P2 · The session token carries the whole profile:** per-key dwell for the ten most common letters, bigram timings with counts, and mouse-path stats. It contains no raw keys, but it's designed for server-side use, which conflicts with Hard Rule #7 ("WAR + badge hash only").
- **SDK-k · P3 · Build and packaging:**
  - The dist isn't minified (38.7 KB, 1,158 lines).
  - `sdk/dist/` is tracked despite `.gitignore`, and `examples/jitter.min.js` isn't committed.
  - `build.js` leaves `init.js`'s `module.exports` block in the bundle.
  - The package's `"module"` field points at CommonJS.
  - The Vercel output has no `index.html`.
  - `sdk/package.json`'s `test` script points at a missing `tests/core.test.js`.

**SDK ↔ backend:** the main SDK (`init.js`) has no backend integration at all; `apiUrl` is unused, and nothing verifies tokens. The only path to the server is `jitter-capture.js` → `/attest`. It passes the CORS preflight but fails authentication, and its meta keys don't match.


---

## P2 findings (condensed)

**Extension**
- Minting throws in non-Latin-1 locales: `btoa` of `toLocaleDateString()`, e.g. ar-EG or fa-IR (`content.js:382`, `writer.js:400`).
- On `http://` sites `navigator.clipboard` is undefined, so minting fails silently.
- After an extension update, already-open tabs silently mint unsigned badges.
- Holding a key (auto-repeat) flips the session to SYNTHETIC and blocks minting (`biometrics.js:159-171`; `e.repeat` isn't filtered).
- STOP & COMMIT isn't persisted, so the session revives on reload. Per-URL session keys are never cleaned up.
- The HUD's integrity (83%) and the badge's (81%) use different formulas.
- New honest users are labelled "bot" until about day 17, and "verified" is impossible before about day 84 (day-0 cap 0.35 vs thresholds 0.5/0.8).
- Thresholds are inconsistent: 0.8/0.5 in `/verify` vs 0.6/0.4 in the HUD and verify.html.
- A pasted badge leaks the minting page's full URL, because the relative `#jitter:` href is made absolute by the clipboard.
- `wooting-analog.js` isn't referenced by any shipped page, so the Hall-effect prototype is inert.

**Backend**
- Anon can list every attestation and `user_id`. The extension's `user_id` is an unsalted SHA-256(email) prefix, so anyone can test whether an email is a user.
- `badge_hash` is deterministic and not unique: 20 requests gave 12 distinct hashes, and collided badges show "Badge not found".
- No input bounds: 2 MB `meta` is accepted, as are arbitrary `site_key`/`flags` strings and a WAR/classification mismatch.

**Engine**
- The K-S statistic computes only one side of D (underestimating it in 74% of samples), and its ramp isn't a Lilliefors critical value.
- The Pearson windows are misaligned.
- The pause-warmup check compares against an average that includes the pauses themselves.
- Only the last 100 flights and dwells are scored, so a bot session with a short human tail passes.
- A NaN flight passed to `scoreRaw` gives WAR NaN classified "bot". A null profile scores 1.0 "verified" (fail-open) in lab and SDK.

**Tests and tooling**
- `bot-battery.test.js` fails 22–23% of runs at random (unseeded draws at `:186`).
- The `'verified_human'` assertion at `:127` can never fail, because no engine emits that label.
- `sdk.test.js` needs Node ≥ 22.12 (it `require()`s an ES module).
- `playwright.config.js` and the npm scripts hard-code this container's browser path.
- `lab/botfarm/daily-run.sh` and the botfarm specs target `/Users/denisgingras/whats-good-here`. `lab/jitterScorer.js` can't be imported (`./logger` is missing).

**Android**
- Android signals don't match the web engine: flight time is up-to-up, there is no dwell time, and pressure is constant 1.0 on many devices.
- `MainActivity` stats were frozen at `onCreate`; fixed on this branch.

## P3 findings (condensed)

**Extension**
- The badge "ID" is `base64.slice(-6)` of the signature padding: 4 distinct IDs across 300+ badges.
- Key events without `.key` throw at `biometrics.js:169, 254`.
- Footprint on every page: content scripts run in every frame (21 frames on a page with 20 iframes), and one page load caused 15 storage writes. `bigramTimings` is never trimmed. The session URL is frozen across SPA navigations.
- On strict-CSP sites the certificate's close button (inline `onclick`) does nothing.
- Dead or miswired code:
  - `chrome.action.onClicked` never fires, because a popup is set.
  - `extension/src/popup.js` is orphaned.
  - `content.css` and `popup.css` are unreferenced.
  - `auth-utils.js` (Firebase) never runs.
  - The Firebase and googleapis host permissions are unused.
  - `PassportUtils` is injected but unused, so `suspicionScore` in badges is always 0.
- The manifest declares no icons, and the three PNGs are one 128×128 placeholder with a bad CRC.
- `extension/old-code/*` is dead.

**Backend**
- GET and malformed JSON return 500. Migrations aren't re-runnable. `config.toml` references a missing `seed.sql`. `supabase-js` is unpinned (`@2`) and the functions use the legacy `std@0.168` `serve`. `total_sessions` just equals the badge count.

**Repo**
- `package.json` has `"main": "auth-utils.js"`, which doesn't exist at the root.
- `.gitignore` lacks `test-results/`.

---

## E2E triage (tests/*.spec.js, 31 page tests)

| Stage | Result |
|---|---|
| As committed | 31/31 fail (`ERR_FILE_NOT_FOUND`: `helpers.js` points at the repo root) |
| Test paths fixed + page script paths fixed | 20 pass / 11 fail |
| + re-applying the two `e84cabf` fixes (P1-4) + updating 4 outdated specs | **31/31 pass** |

The 11 remaining failures:
- **6 product bugs:** Replay first-click (×3) and first badge unsigned (×3).
- **4 outdated tests:** they use the removed global `bio.*` (×3) and assert badge `version: '2.0'`.
- **1 both:** `teacher-verify:32` hits the unsigned first badge, and its expected labels changed with the WAR layout in `c53f13b`.

## Badge formats in the tree (interop)

| # | Format | Producer | Signed? | Consumed by |
|---|---|---|---|---|
| F1 | Flat v3.0 JSON, `btoa`, in a `#jitter:` href or `data-jitter-payload` | `content.js`, `writer.js` | ECDSA P-256, self-vouching (P0-2, P1-7) | `verify.html` (dead in the extension), content.js HUD/certificate (unverified) |
| F2 | Server `badge_hash` → `/verify?hash=` | `/attest` (from content.js and jitter-capture) | No | `/verify` (unreachable, P0-6) |
| F3 | `jtok_` + base64 JSON | `sdk/src/init.js` | No | Nothing |
| F4 | Legacy "Anvil" purity JSON / `data-anvil-verify` | Android, legacy `src/popup.js` | No | `verifier.js` (mis-renders); nothing reads the Android attribute |
| F5 | Spec v3.0 (nested `session{}`/`passport{}`/`chain{}`, 0–10 WAR, hidden field) | — | — | — (in the old MASTER-PLAN.md, not implemented) |

No producer–consumer pair both works and resists forgery today.

## Test coverage

About 13% of shipped code lines (≈650 of 5,140) run under any passing test, and none of those tests are wired into `npm test`.

| Component | Covered by a passing test? |
|---|---|
| Popup, background, auth | No test |
| `jitter-capture.js` | No test |
| Supabase functions | No test |
| `verifier.*` | No test |
| `lab/jitter-box.js` | No test |
| Android (before this branch) | No test |
| `biometrics.js` | `scoreWAR` only |
| SDK core | Only through the dist bundle |

## Doc claims vs reality

| Claim | Verdict |
|---|---|
| CLAUDE.md: "verify.html … never calls verifyBadge()" / JITTER-PLAN Bug 1 | **Stale.** It does call it (`verify.html:343`). The real problems are that the page doesn't load (P0-1) and the check is self-vouching (P0-2). |
| CLAUDE.md: "Suspicion score … never embedded" / JITTER-PLAN Bug 2 | **Inverted.** It is embedded (`content.js:368`, `writer.js:379`) but never computed, so it's always 0. |
| CLAUDE.md: "biometrics.js = LEGACY, only 3 simple checks" | **False.** It has the hardened 10-component WAR (a fork). Only the Loki gate is 3 checks. |
| CLAUDE.md: "jitter-box.js is the canonical engine … port, don't fork" | **False in practice.** The lab copy is the stalest, and SDK, extension and capture are forks (P1-19). |
| CLAUDE.md: "61% cross-user false match (fixed in lab)" | **False.** It re-derives to 61%, and cross-user matching isn't in the scorecard. |
| CLAUDE.md: "Three badge formats exist" | **True**, with 4–5 in practice (table above). |
| CLAUDE.md: "Auth has Firebase placeholder keys" | **Partly.** The placeholders exist, but nothing loads `auth-utils.js`; runtime auth is `chrome.identity`. |
| README: Chrome Extension "Working" | **Partly.** Capture and mint work; verify, writer, sign-in and passport integrity don't. |
| README: Writing Ledger "Working … SHA-256 hash-chained" | **Partly.** The chain exists but can't be recomputed (P1-5). |
| README: Bot Farm Tests "Working" | **False here.** They target the WGH repo on a macOS path. |
| README: Server Verification "Not built" | **Outdated.** It's built and wired but unreachable (P0-6). |
| README: "100% client-side by default" | **False.** Every MINT POSTs to Supabase without opt-in. |
| README: WAR weights table | Matches the lab only; the shipped engines differ. |
| Hard Rule #1 (never store raw keystrokes) | **Holds** for the content script, storage and network, and for Android. The Writer's ledger export stores typed characters and pasted text (P1-5). |
| Hard Rule #4 (badge ECDSA-signed) | **Signed but not anchored** (P0-2), partly unsigned (P1-4, P1-7), and not on Android (P1-21). |
| Hard Rule #5 (paste transparent, not punished) | **Violated** in the SDK, extension and HUD (P1-3). |
| Hard Rule #7 (raw telemetry never leaves; WAR + badge hash only) | **At risk.** The SDK's `jtok_` token is built for server-side use and carries per-key dwell, bigram timings and mouse-path stats (SDK-j). |
| JITTER-PLAN §1 widget "Done criteria" | **0 of 8 met** (SDK section). |
| android/README: "Full QWERTY … works everywhere", "Pasting is detected" | **False** (P1-22, P1-23). |

## Previously reported issues (docs/AUDIT*.md, CODE_REVIEW.md, Feb 2026)

| Earlier finding | Status now |
|---|---|
| verify.html doesn't verify | Verifies, but against the badge's own key (P0-2). The page doesn't load (P0-1). |
| Suspicion score not in badges | Embedded, but never computed. |
| 2–3 incompatible badge formats | Still 4–5 (table above). |
| Public key not included in badge | Now included, which is what makes forgery trivial (P0-2). |
| Content script missing utility scripts | Fixed in the manifest. |
| `mergePassports()` lossy (auth-utils) | Moot: `auth-utils.js` never runs. |
| Account age never updates | Now client-side `firstUsed`, which can be backdated (P0-8). |

---

## Suggested order of work

1. **Make the extension's pages run.**
   - Fix the script paths and CSP, and re-apply the two `e84cabf` fixes.
   - Point `tests/helpers.js` at `extension/` and update the 4 outdated specs. This gives 31/31, and the suite then guards these pages.
2. **Make badges mean something.**
   - Add a server-anchored key or a server countersignature.
   - Sign an RFC 8785 canonical payload.
   - Bind the badge to the text hash and URL.
   - Accept only `isTrusted` input and mint only from a trusted gesture.
   - Replace every `innerHTML` sink with `textContent`.
3. **Backend.**
   - Drop the PUBLIC write policies, read through an RPC, and require a user JWT on `/attest`.
   - Compute classification and time caps on the server, and update the profile atomically.
   - Set `verify_jwt=false` on `/verify` and serve it from a custom domain or static host.
   - Unpause the project.
4. **SDK.**
   - Fix the `attach` collision, the bugs it's hiding (SDK-f, SDK-g) and the `<head>` init crash (SDK-e), and add a browser smoke test.
   - Build the widget layer the plan describes: submit hook → server-signed badge → hidden `jitter_badge` → inline badge.
   - Add the auth header and `res.ok` handling to jitter-capture, and align its meta keys with `/attest`.
5. **Engine.**
   - Keep one engine module.
   - Remove the paste penalties (Hard Rule #5).
   - Cap `war`, not `raw_war`.
   - Collect real human sessions (WGH) and recalibrate before trusting any threshold.
6. **Tests and CI.** Run the unit tests with `node --test` behind a `test:unit` script, seed the random number generator, set Playwright's `testMatch` to `*.spec.js`, and add a CI workflow.
7. **Android.** Fix the build (P0-9), then sign badges with an Android Keystore P-256 key.

## How this was checked

The work was split across six parallel audit passes, and the lead re-checked the most serious claims directly:
- the page script paths;
- self-vouching verification (`verify.html:340-347`);
- nested-field signing (run against the real `crypto-utils.js`);
- `applyTimeCap` using `raw_war`;
- the RLS policy text;
- zero `isTrusted` references;
- the ledger timestamps;
- `attach` recursion in Chromium.

Methods:
- **Extension:** the real unpacked MV3 extension in Chromium 141 under Xvfb, driven by Playwright and CDP, with local test pages on two origins (with CSP headers). All Supabase traffic was intercepted; production was never called.
- **Backend:** migrations applied in PGlite (Postgres 17) with Supabase roles emulated. The functions ran unmodified under Deno with shimmed imports.
- **Engine:** the same event streams were fed to all four engines, cross-checked against Chromium, with scipy for the statistics.
- **SDK:** driven in Chromium with real form submissions, trusted input (CDP) and synthetic events. A local attest mock emulated the platform's 401. A locally patched bundle was used only to look past P0-7.
- **Android:** type-checked against the Android 14 framework (Robolectric `android-all`).
- **Deployed state:** Supabase management API, read-only.

---

## Change on this branch after the audit

`ae5239b` · **Anvil keyboard: tap motion evidence from phone sensors.**
- The keyboard measures how sharply the accelerometer and gyroscope change within a few ms of each key tap. Real fingers jolt the phone; software-injected taps don't.
- The keyboard's own vibration is masked out, so injected taps can't borrow it.
- Only aggregates are persisted.
- It has 17 JVM unit tests on simulated sensor streams, and every safeguard was checked by breaking it and watching a test fail. It type-checks against API 34.
- It still needs on-device calibration, and it inherits P0-9: the project must build first.

`1ab5af2` · **One typing-rhythm engine** (`extension/src/war-score.js`) for the extension, the SDK bundle and the lab; paste weighted by length, never punished.

`abf1051` · **Product decision.** The shipping product is the Writer process receipt for classrooms (proof of process and integrity, not of authorship or humanity). README rewritten to what exists; the "economically unfeasible" claims removed; `docs/adversarial/PERSONA_MONTH.md` records the measurements that falsified them (forged attestations accepted at 105/s and "verified" at day 31; a 40-line generator passes the engine 11/24; a persona-month costs 0.005 CPU-seconds).

`d601b61` · **Backend.** Site-key allowlist, per-address hourly limit (salted hashes, never addresses), `/erase` (a device deletes everything the server holds about it with one signed request), server key rotation; 80 backend tests.

`e2f881a` · **Extension hardening.** Capture is opt-in per site (no `<all_urls>`); never on password, payment or one-time-code fields; `identity` and Firebase permissions gone; the popup (previously dead) rebuilt; night-hours suspicion removed; a flagged session still mints a badge that carries the flags instead of a "Verification Denied" alert.

`26810be` · **The Writer product.** Receipt v4 (`docs/product/PROCESS_RECEIPT.md`): ledger of operations only, hash-chained snapshots, autosave across sittings, signed receipt bound to the text; the teacher's verify page with sittings, active time, typed/pasted/deleted timeline, paste list, revision, rhythm ("one statistic, not a verdict"), ledger replay, and the fixed note on what a receipt does not say.

Still open after all of the above: no real session has ever been captured (every threshold is uncalibrated); the server does not recompute the client's score; nothing is deployed (the Supabase project is paused; `*.supabase.co` serves the verify page as text); mobile and IME typing yield no keystrokes on the extension path; Anvil is unbuilt on a device.
