# Jitter Browser Extension — APIs, Permissions, and Platform Coverage

**Date:** 2026-03-02
**Agent:** my-guy
**Purpose:** Chrome Manifest V3 technical requirements, Web Store approval strategy, cross-browser positioning for patent filing

---

## 1. Chrome Manifest V3 Requirements

Manifest V3 (MV3) became mandatory for all new Chrome extensions in June 2023. Existing MV2 extensions were disabled starting January 2025. All Jitter extension development must target MV3.

**Key MV3 architectural constraints:**

| Feature | MV2 | MV3 | Jitter Impact |
|---------|-----|-----|---------------|
| Background script | Persistent background page | Service worker (ephemeral) | Service worker must handle state via chrome.storage |
| Network interception | webRequest blocking | declarativeNetRequest | No impact — Jitter doesn't intercept requests |
| Remote code | Allowed | Prohibited | All logic must ship with extension |
| WASM | Allowed | Allowed (with flag) | Relevant if ML inference added later |
| Content scripts | Same | Same | No change |
| chrome.tabs | Full access | Restricted | No impact — Jitter uses host_permissions |

**Service worker lifecycle implication:** MV3 service workers are terminated when idle (typically 30 seconds after last event). Jitter's design accounts for this: the service worker wakes on each message from the content script port, processes events, and flushes to `chrome.storage.local` before potentially suspending. Long-lived ports from content scripts keep the service worker alive while the user is typing.

---

## 2. Required Permissions

**Manifest permissions declaration:**

```json
{
  "manifest_version": 3,
  "permissions": [
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["capture.js"],
    "run_at": "document_idle"
  }],
  "side_panel": {
    "default_path": "panel.html"
  },
  "background": {
    "service_worker": "worker.js"
  }
}
```

**Permission justifications:**

| Permission | Purpose | Required? | User-Visible |
|-----------|---------|-----------|-------------|
| `storage` | Store computed biometric profile in chrome.storage.local | Yes | No |
| `sidePanel` | Enable the persistent side panel UI | Yes | No |
| `<all_urls>` host_permissions | Run content script on all pages to capture typing | Yes | Yes — Chrome shows warning |
| ~~`tabs`~~ | Not needed — content scripts inject via manifest | Not needed | — |
| ~~`webRequest`~~ | Not needed — Jitter doesn't intercept requests | Not needed | — |
| ~~`activeTab`~~ | Not sufficient — needs cross-tab persistence | Not suitable | — |

**`<all_urls>` justification for Web Store review:** Keystroke biometric profiling requires consistent measurement across all browsing contexts to build a reliable behavioral baseline. Limiting to specific sites would produce insufficient training data and break cross-site identity consistency, which is the core value proposition.

---

## 3. Chrome Web Store Review Policies

The Chrome Web Store has specific policies governing extensions that capture user input.

**Relevant policies:**

- **User data privacy:** Extensions that "collect, transmit, or use browsing activity or user data" must disclose this prominently and may trigger enhanced review.
- **Functionality must match description:** Extensions must do what they say. "Typing Passport" / "biometric identity" framing must match actual function.
- **Minimum permissions:** Extensions must request only permissions necessary for stated functionality. `<all_urls>` will be scrutinized — the cross-site typing passport use case is the justification.
- **No obfuscated code:** All extension code submitted to the store must be human-readable (no minification of logic, though asset minification is fine). This is a significant MV3 requirement.

**Known approval risks:**

| Risk | Mitigation |
|------|-----------|
| "Keylogger" classification | Frame as "keystroke timing biometric" — never captures characters, only timing deltas. Prominently state password field exclusion. |
| `<all_urls>` rejection | Required for cross-site typing passport. Justify in store listing: "Jitter builds your typing profile across all sites to establish a reliable baseline. No content is read — only timing patterns." |
| Enhanced privacy review | Prepare Privacy Practices declaration. Jitter's on-device model is the strongest possible answer: no data leaves device, no server receives anything. |
| Rejection of keystroke capture | No precedent for this. Privacy-blocking extensions exist (see §4 below). Capturing timing for biometric identity is legally and technically distinct from keylogging. |

**Competitive precedent:** TypingDNA's recorder is embedded JavaScript that sites include directly — it is not a standalone Chrome extension in the Web Store. As of early 2026, no standalone keystroke biometric extension exists in the Chrome Web Store. Jitter would be the first. This is both a risk (no approved precedent) and an opportunity (no competition in the store).

---

## 4. Existing Extension Landscape

**No standalone keystroke biometric extension exists in the Chrome Web Store as of early 2026.**

Privacy extensions that BLOCK keystroke timing collection do exist, which confirms the category is recognized:

| Extension | Direction | Notes |
|-----------|-----------|-------|
| Privacy Badger (EFF) | Blocks trackers | Does not specifically block keystroke timing |
| CanvasBlocker | Blocks fingerprinting | Covers timing APIs including performance.now() |
| JShelter | Anti-fingerprinting | Explicitly adds noise to performance.now() timestamps |
| uBlock Origin | Content blocking | Not timing-specific |

JShelter's deliberate degradation of `performance.now()` precision is the most relevant: it confirms browsers/extensions treat timing APIs as fingerprinting vectors, which supports Jitter's novelty claim that using timing for *beneficial* biometric identity is a new application.

**TypingDNA comparison:**

| Aspect | TypingDNA | Jitter |
|--------|-----------|--------|
| Delivery | Embedded JS snippet (sites include it) | Standalone Chrome extension |
| Data flow | Timing data sent to TypingDNA servers | All processing on-device |
| User visibility | Invisible to user | User-facing passport UI |
| User control | None (site decides) | Full (user-controlled) |
| Cross-site profile | No (per-site only) | Yes (cross-site baseline) |
| Extension store presence | Not in Web Store | First mover |

---

## 5. performance.now() Precision and Spectre Mitigation

**The precision situation:**

After the Spectre CPU vulnerability disclosure in January 2018, all major browsers reduced the precision of timing APIs to limit side-channel attacks:

| Browser | performance.now() Precision | Notes |
|---------|---------------------------|-------|
| Chrome 68+ | ±0.1ms (100 microseconds) | Reduced from 5µs after Spectre |
| Firefox 59+ | ±1ms (1 millisecond) | More aggressive reduction |
| Safari 15+ | ~1ms | Similar to Firefox |
| Brave | Variable — anti-fingerprinting adds additional noise | See §8 |

**Impact on Jitter:**

±0.1ms jitter in Chrome is well below the discriminative threshold for keystroke biometrics. Typical human digraph timings range from 50ms to 400ms. A 0.1ms error on a 150ms measurement is 0.067% noise — statistically negligible across a session of 140+ keystrokes.

The ±0.1ms noise **averages out** across measurements. Jitter relies on statistical aggregates (means, standard deviations over many keypresses), not individual timing precision. A single timing measurement with ±0.1ms noise contributes to a rolling mean calculated over hundreds of measurements. The central limit theorem ensures the aggregate converges to the true behavioral parameter.

**Published research confirmation:** Keystroke authentication studies using browser-captured timing (TypeNet, TypeFormer) achieve 2–9% EER despite browser-imposed timing restrictions. The limitation exists and does not prevent viable biometric capture.

---

## 6. Content Script vs. Service Worker Responsibilities

**Content script (capture.js) — runs in page context:**

Responsibilities:
- Attach keydown/keyup listeners in capture phase
- Read `event.code` and `performance.now()` timestamp
- Check capture eligibility (password exclusion, per-site blacklist, user pause state)
- Send `{ code, t, type }` objects to service worker via long-lived port
- Monitor focus events to track active element type

Does NOT do:
- Any metric computation
- Any storage access
- Any network calls
- Any DOM modification

**Service worker (worker.js) — background context:**

Responsibilities:
- Receive event stream from content script ports
- Buffer events in memory (circular buffer)
- Run metric calculations (dwell, digraph, flight, overlap, modifier patterns)
- Maintain adaptive template (anchor + active)
- Flush computed stats to `chrome.storage.local` every 30 seconds
- Push live metric updates to side panel port
- Compute Jitter Score (weighted composite)
- Handle user control messages (pause, clear, blacklist updates)

**Why this split:** Content scripts run in the page's renderer process and should be as lightweight as possible to avoid affecting page performance. All CPU-intensive computation (metric calculation, template comparison, score derivation) happens in the service worker's separate process.

---

## 7. Side Panel API

The Side Panel API (Chrome 114+, June 2023) enables a persistent panel pinned to the browser chrome, separate from the page content. This is Jitter's primary UI surface.

**Advantages over popup:**

| Feature | Popup | Side Panel |
|---------|-------|-----------|
| Persistence | Closes on blur | Persists across tab navigation |
| Size | Limited | Full browser height |
| Visibility | Must click icon to open | Always visible when pinned |
| Tab switching | Loses state | Maintains state |

**Side panel manifest declaration:**

```json
"side_panel": {
  "default_path": "panel.html"
}
```

**Programmatic open (user gesture required in MV3):**

```javascript
// In popup.js or content script response to user click:
chrome.sidePanel.open({ windowId: windowId });
```

The side panel opens via user gesture (clicking the extension icon). Once open, it persists until explicitly closed. This is the correct UX model for Jitter's live typing dashboard.

---

## 8. Brave Browser — Partnership Opportunity

Brave is the highest-leverage browser partnership for Jitter, for three reasons:

1. **Privacy-aligned user base:** Brave's 80M+ monthly active users explicitly chose a privacy-first browser. Jitter's "your biometrics stay on your device" message resonates with this audience more than general Chrome users.

2. **Built-in verification ambitions:** Brave has existing infrastructure around proof-of-humanity (Brave Ads attention verification, Brave Rewards). Jitter as a human-verification layer fits their product direction.

3. **First-party distribution:** Brave could bundle or feature Jitter in a way that bypasses Chrome Web Store review risk entirely — Brave has its own extension distribution and could ship Jitter as a built-in feature.

**Technical compatibility:** Brave is Chromium-based and supports Manifest V3 extensions. Jitter requires no Brave-specific code. However, Brave's anti-fingerprinting features (Shields) add additional noise to `performance.now()`:

- Brave Shields set: performance.now() is jittered by up to ±1ms (similar to Firefox)
- This is acceptable — same averaging-out argument applies, slightly larger noise floor
- Brave could disable Shields noise specifically for Jitter if bundled as a trusted first-party feature

**Partnership pitch:** Brave gains a human-verification primitive that strengthens their Verified Creators and Brave Rewards authenticity claims. Jitter gains a distribution partner with a privacy-credentialed user base and potential bypass of Web Store review friction.

---

## 9. Firefox WebExtension Compatibility

Firefox supports the WebExtensions API, which is largely compatible with Chrome's extension APIs with differences:

| API | Chrome | Firefox | Jitter Impact |
|-----|--------|---------|---------------|
| Manifest V3 | Required | Supported (but MV2 still accepted) | Build for MV3, works in both |
| Side Panel | Yes (Chrome 114+) | Partial — Firefox has a sidebar API | Separate sidebar implementation needed |
| storage.local | chrome.storage.local | browser.storage.local | Use webextension-polyfill |
| performance.now() | ±0.1ms | ±1ms | Larger noise floor, still viable |
| Content scripts | Same | Same | No change |

Firefox's equivalent of Chrome's Side Panel is the sidebar API (`browser.sidebarAction`). A Firefox-compatible Jitter build requires a separate sidebar declaration and slightly different open/close handling. The core capture and computation logic is identical.

**Firefox market share:** ~3% globally (vs Chrome ~65%). Secondary priority, but meaningful for privacy-conscious users who prefer Firefox to Chrome.

---

## 10. Safari Web Extension Limitations

Safari Web Extensions (introduced Safari 14, 2020) are packaged as native macOS/iOS apps distributed through the Mac App Store / App Store. This creates significant friction vs. Chrome Web Store distribution.

**Critical limitations for Jitter:**

| Feature | Chrome | Safari | Impact |
|---------|--------|--------|--------|
| Distribution | Chrome Web Store | Mac App Store (macOS) / App Store (iOS) | Higher friction, Apple review |
| Background processing | Service worker | Background pages (limited) | iOS: no persistent background at all |
| performance.now() | ±0.1ms | ~1ms (anti-fingerprinting) | Viable, larger noise |
| Side panel equivalent | Yes | No direct equivalent | Major UI difference |
| iOS extension | Not applicable | Limited background, strict memory | Capture feasibility uncertain |

**Most significant limitation:** Safari on iOS does not support persistent background processing for extensions. The content script can run, but there is no reliable service worker context to receive the event stream and perform computation. Safari Web Extensions on iOS are highly restricted.

**Recommendation:** Safari desktop is a secondary target (post-launch). Safari iOS is not viable with the current architecture without major redesign. Focus on Chrome → Brave → Firefox for launch.

---

## 11. Extension Review Timeline

**Chrome Web Store review timing:**

| Review Type | Timeline | Trigger |
|------------|---------|---------|
| Automated review | Minutes–hours | All submissions |
| Manual review | Days–weeks | New extensions, sensitive permissions, updates to reviewed extensions |
| Enhanced privacy review | 2–8 weeks | Extensions with broad host permissions or data collection |

**Jitter's expected review path:** `<all_urls>` host_permissions and keystroke capture will likely trigger enhanced privacy review. Plan for 4–8 week approval timeline on initial submission. Factor into launch planning.

**Mitigation strategy:**
- Submit early (12+ weeks before target launch)
- Prepare detailed privacy practices disclosure before submission
- Include clear user-facing documentation of what is and is not captured
- Provide a link to open-source code repository (auditability reduces reviewer friction)
- Proactively contact Chrome Extensions team via developer forums if review stalls

---

## Sources

- Chrome Extensions Manifest V3 migration guide (developer.chrome.com/docs/extensions/mv3)
- Chrome Side Panel API documentation (developer.chrome.com/docs/extensions/reference/sidePanel)
- Chrome Web Store Program Policies — User Data section (chrome.google.com/webstore/devconsole)
- MDN: performance.now() (developer.mozilla.org)
- Spectre timing attack — Chromium security response (chromium.org/Home/chromium-security/ssca)
- JShelter extension source and documentation (jshelter.org)
- Brave Browser: Anti-fingerprinting documentation (brave.com/privacy/browser)
- Firefox WebExtensions compatibility (developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- Safari Web Extensions — Apple Developer documentation (developer.apple.com)
- TypingDNA recorder.js documentation (typingdna.com/docs)
- TypeNet research: browser-captured timing viability (arXiv:2101.05570)
- Jitter Protocol provisional patent specification (Denis Gingras, 2026)
