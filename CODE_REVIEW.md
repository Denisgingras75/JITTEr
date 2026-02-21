# ⚡ JITTEr Code Review
**Reviewed by:** Claude Code
**Date:** February 2026
**Scope:** Full codebase — manifest.json, content.js, background.js, writer.js, writer.html, passport-utils.js, crypto-utils.js, auth-utils.js, verify.html

---

## What's Solid

The core ideas are genuinely strong and the architecture is mostly right.

- **Loki biometrics (writer.js)** — Three independent signals (rhythm stdDev, avgFlow speed, cognitive ratio) are harder to spoof in combination than any single metric. The math is sound.
- **Passport suspicion scoring (passport-utils.js)** — Six independent signals, well-calibrated. The "high output on new account" signal (+20) is particularly sharp.
- **Privacy-by-design** — Keystroke *timing* only, never the keys themselves. This is the right architecture legally and ethically.
- **ECDSA P-256 badge signing** — Correct choice. Small signature, Web Crypto native, no library dependency.
- **Chain hashing concept** — Each badge references the previous hash. Prevents backdating history. Smart.
- **iframe detection** — `window !== window.top` prevents duplicate shields in embedded frames.
- **MutationObserver for badge scanning** — Efficient; doesn't re-process already-marked links.
- **verify.html UI design** — Clean risk communication (LOW/MEDIUM/HIGH with color coding). Teachers will understand it immediately.

---

## Critical Bugs (Must Fix Before Any Real Use)

### 1. verify.html does zero cryptographic verification
**File:** `verify.html` — `verifyBadge()` function

The "Teacher Dashboard" **verifies nothing**. It decodes base64 and reads the JSON. That's it. Anyone can forge a perfect badge:

```javascript
// This passes as "LOW RISK" with 100% integrity and 120 days age:
const forged = btoa(JSON.stringify({
    integrity: 100, cr: 2.8, edits: 47,
    passport: 57000, passportLevel: 'Expert',
    accountAge: 120, sessions: 34
}))
```

The `crypto-utils.js` is imported by verify.html but `verifyBadge()` (the ECDSA check) is never called. The file imports the tools and then ignores them.

**Fix:** Call `verifyBadge(payload, signature, publicKey)` from crypto-utils.js inside the verify flow. Show a red "SIGNATURE INVALID" banner if verification fails, and don't show the green success box without it.

---

### 2. `suspicionScore` is never included in badge payloads
**Files:** `content.js` → `copyBadge()`, `writer.js` → `exportBadge()`

`passport-utils.js` calculates `suspicionScore` (0–100) and it's stored in chrome.storage. But neither `copyBadge()` in content.js nor the badge export in writer.js includes it in the payload.

`verify.html` reads `data.suspicionScore || 0` — so **the risk assessment always shows 0 = LOW RISK**, regardless of the account's actual suspicion history.

**Fix:** Include `suspicionScore` and `suspicionSignals` from passport when building badge payloads.

---

### 3. Two incompatible badge formats — neither complete
Three different badge structures exist simultaneously:

| Source | Format | Signed? | Has suspicionScore? |
|---|---|---|---|
| `content.js copyBadge()` | flat JSON: `{integrity, cr, passport, accountAge...}` | ❌ No | ❌ No |
| `writer.js exportBadge()` | nested: `{session:{...}, passport:{...}, crypto:{...}}` | ✅ Yes | ❌ No |
| `JITTER_FOUNDATIONS.md` v2.0 spec | nested per spec | ✅ Yes | ✅ Yes |

`verify.html` expects the flat content.js format (`data.integrity`, `data.cr`). It won't work with writer.js's nested format. Neither badge includes the suspicion score.

**Fix:** Define one canonical badge format (the v2.0 spec is the right one), update all three producers (content.js, writer.js) to emit it, and update verify.html to read the nested structure.

---

### 4. `mergePassports()` is lossy — drops all dailyStats
**File:** `auth-utils.js` — `mergePassports()`

```javascript
// Current: take whichever has more keystrokes entirely
return localPassport.totalKeystrokes >= cloudPassport.totalKeystrokes
    ? localPassport : cloudPassport;
```

If you type 5K keys on device A, then type 10K keys on device B, syncing drops all of device A's `dailyStats`, `hourlyPattern`, and `sessionHistory`. The stats that calculate variance and sleep patterns — the most valuable anti-bot signals — are silently discarded.

**Fix:** Deep merge both passports:
```javascript
function mergePassports(a, b) {
    const merged = { ...a };
    merged.totalKeystrokes = Math.max(a.totalKeystrokes, b.totalKeystrokes);
    // Merge dailyStats: combine keys from both
    merged.dailyStats = {};
    const allDays = new Set([...Object.keys(a.dailyStats || {}), ...Object.keys(b.dailyStats || {})]);
    for (const day of allDays) {
        merged.dailyStats[day] = Math.max(a.dailyStats?.[day] || 0, b.dailyStats?.[day] || 0);
    }
    // Merge hourlyPattern: sum both
    merged.hourlyPattern = (a.hourlyPattern || Array(24).fill(0)).map(
        (v, i) => v + (b.hourlyPattern?.[i] || 0)
    );
    // sessionHistory: deduplicate by startTime
    const sessions = [...(a.sessionHistory || []), ...(b.sessionHistory || [])];
    const seen = new Set();
    merged.sessionHistory = sessions.filter(s => {
        if (seen.has(s.startTime)) return false;
        seen.add(s.startTime);
        return true;
    });
    return merged;
}
```

---

## Important Issues (Fix Before Production)

### 5. `bio` state never resets between sessions on same tab
**File:** `content.js`

`bio.backspaces`, `bio.flowIntervals`, `bio.gapIntervals`, `bio.cognitiveRatio` are module-level globals. If a user runs two projects on the same tab, the second session inherits all biometric data from the first. Backspace counts, rhythm data, and the `isBot` flag are all stale.

**Fix:** Reset bio state when starting a new project:
```javascript
'btn-start': () => {
    // Reset bio state
    bio.lastTime = null; bio.lastChar = '';
    bio.flowIntervals = []; bio.gapIntervals = [];
    bio.isBot = false; bio.entropy = 100;
    bio.backspaces = 0; bio.cognitiveRatio = 0;
    project = { isActive: true, humanKeystrokes: 0, pasteCount: 0, startTime: Date.now() };
    saveData(); updateUI();
}
```

---

### 6. Integrity calculation is misleading for paste-heavy documents
**File:** `content.js` — `calculateStats()`

```javascript
integrity = Math.round((project.humanKeystrokes / totalCharsInBox) * 100);
```

This is `typed keystrokes / current text length`. If a user types 400 chars into an 800-char text (half pasted), integrity = 50%. But if they then type another 200 chars of corrections on the typed portion, it reads as 75%. The metric doesn't cleanly separate typed vs pasted content.

**Cleaner formula:**
```javascript
const pastedChars = project.pastedCharCount || 0; // track paste char count, not just events
const totalChars = project.humanKeystrokes + pastedChars;
integrity = totalChars > 0 ? Math.round((project.humanKeystrokes / totalChars) * 100) : 100;
```
Note: requires tracking `pastedCharCount` (characters pasted, not paste events count). The writer.js already does this correctly with `session.pasted_chars`.

---

### 7. Paste character count not tracked in content.js
**File:** `content.js` — paste handler

```javascript
window.addEventListener('paste', (e) => {
    if (!project.isActive) return;
    project.pasteCount++;  // ← only counts events, not character volume
    saveData();
```

`project.pasteCount` counts how many times paste was pressed, not how many characters were pasted. A single paste of 3,000 chars and 10 pastes of 1 char each both register as "1 paste" and "10 pastes" — the volume is invisible.

**Fix:**
```javascript
window.addEventListener('paste', (e) => {
    if (!project.isActive) return;
    project.pasteCount++;
    const text = e.clipboardData?.getData('text') || '';
    project.pastedChars = (project.pastedChars || 0) + text.length;
    saveData();
});
```

---

### 8. Firebase config is placeholder — cloud sync unusable
**File:** `auth-utils.js`

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    ...
```

The entire cloud sync system (cross-device passport, "Jitter Verified Human" badge) can't be used. This isn't a code bug but it means the most powerful anti-bot feature — accumulated history across devices — doesn't work for anyone who installs this.

**Note on cost:** Firebase Firestore free tier is 50K reads/day, 20K writes/day. For a small user base this is free. Flag this when scaling.

---

### 9. writer.html essay mode is incomplete
**Per JITTER_FOUNDATIONS.md** Section 7 (School Essay Mode), the plan is:
- Full-screen required (ESC pauses session, teacher sees it)
- No paste allowed (clipboard blocked)
- Blur detection (split-screen / focus loss logged)
- Timer + word target visible

**Current state:** writer.js tracks paste events but doesn't block them. No fullscreen enforcement. No blur detection. No timer/word target.

This is Phase 3 work per the roadmap, but worth calling out explicitly.

---

## Minor Issues

### 10. `console.log` in background.js
```javascript
console.log("Jitter Protocol Installed");
console.log("Opening tab:", writerUrl);
```
Remove before production release.

---

### 11. Public key fingerprint is not canonical
**File:** `crypto-utils.js` — `getPublicKeyFingerprint()`

```javascript
fingerprint = await hashString(JSON.stringify(stored.jitterPublicKey));
```

`JSON.stringify` of an object doesn't guarantee property order. Two semantically identical JWK objects could produce different fingerprints. Use the raw key bytes instead:

```javascript
const exported = await crypto.subtle.exportKey('raw', keyPair.publicKey);
fingerprint = await hashBytes(exported); // hash the raw EC point bytes
```

---

### 12. verify.html shows "Badge Verified" even for forged/unsigned badges
The result header says **"Badge Verified"** for all successfully decoded badges, regardless of whether a signature was verified. A forged badge looks identical to a legitimate one. The header should say "Badge Decoded" until crypto verification passes, then "Badge Verified ✅".

---

## Recommended Fix Order

### Sprint 1 — Make verification actually verify
1. Call `verifyBadge()` from crypto-utils.js in verify.html — reject unverified badges
2. Include `suspicionScore` + `suspicionSignals` in badge payloads (both content.js and writer.js)
3. Unify badge format around v2.0 spec — one producer, one consumer

### Sprint 2 — Fix data integrity
4. Fix `mergePassports()` to deep merge instead of winner-takes-all
5. Reset `bio` state on session start in content.js
6. Track paste character count in content.js (not just event count)

### Sprint 3 — Production readiness
7. Configure Firebase with real credentials
8. Remove `console.log` from background.js
9. Fix public key fingerprint to use raw bytes
10. Change "Badge Verified" header to require valid signature

### Sprint 4 — Essay Mode (Phase 3)
11. Add `document.documentElement.requestFullscreen()` on session start in writer.html
12. Override `document.execCommand('paste')` and clipboard API in writer.html to block pastes
13. Add `window.addEventListener('blur', ...)` to log focus loss
14. Add visible timer + word count target to writer.html UI

---

## Architecture Verdict

The **concept** is rock solid. The sports stats model, the locked box principle, the economic impossibility argument — all of this is correct and defensible. The passport suspicion scoring in passport-utils.js is genuinely clever.

The **implementation** has one showstopper: `verify.html` verifies nothing. Until that's fixed, any user can forge a perfect badge in two lines of JavaScript. Everything else is fixable incrementally.

The ECDSA signing infrastructure in crypto-utils.js is already built and working. It just needs to be called in the verification step. The hardest part is already done.

---

*Review complete. Priority: fix the verify.html crypto gap first — it invalidates the entire trust model until resolved.*
