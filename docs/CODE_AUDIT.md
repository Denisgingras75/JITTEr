# JITTEr Code Audit Report

**Date:** 2026-02-23
**Auditor:** Claude (Sonnet 4.5)
**Scope:** Complete codebase review
**Branch:** claude/understand-jitter-CB6g8

---

## Executive Summary

JITTEr is a **working prototype** with solid core functionality, but has **critical gaps** for production use as a "Digital Blue Book". The cryptographic implementation is sound, but integration issues, missing features, and inconsistencies need addressing.

**Overall Grade:** B- (Functional prototype, needs refinement for production)

**Critical Issues Found:** 7
**High Priority Issues:** 12
**Medium Priority Issues:** 8
**Low Priority Issues:** 5

---

## 🚨 CRITICAL ISSUES (Must Fix Before Production)

### 1. **Missing Copyright Headers in Utility Files**

**Files Affected:** `crypto-utils.js`, `passport-utils.js`

**Issue:** These files lack copyright headers while other files have them.

**Impact:** Legal protection inconsistent across codebase

**Fix:**
```javascript
/**
 * crypto-utils.js - Cryptographic Badge Verification
 *
 * Copyright (c) 2025-2026 Denis Gingras. All Rights Reserved.
 *
 * PROPRIETARY AND CONFIDENTIAL
 * Contains proprietary ECDSA signature algorithms.
 * Unauthorized copying, modification, or use is strictly prohibited.
 * See LICENSE file for full terms.
 */
```

---

### 2. **PassportUtils Not Used in content.js**

**File:** `content.js`

**Issue:** content.js has its own passport tracking but doesn't use PassportUtils for:
- Daily stats tracking
- Hourly pattern tracking
- Session recording
- Suspicion score calculation

**Impact:**
- Bot detection only works in writer.html, not on web pages
- Inconsistent passport data between environments
- Missing advanced analytics

**Current Code (lines 107-116):**
```javascript
passport.totalKeystrokes++;
passport.lastUsed = Date.now();
updatePassportLevel();
if (project.isActive) {
    project.humanKeystrokes++;
    if(!isIframe) updateUI();
}
```

**Should Be:**
```javascript
passport.totalKeystrokes++;
passport.lastUsed = Date.now();

// Use PassportUtils for proper tracking
if (typeof PassportUtils !== 'undefined') {
    PassportUtils.updatePassport(passport, 1, false);
}

updatePassportLevel();
if (project.isActive) {
    project.humanKeystrokes++;
    if(!isIframe) updateUI();
}
```

---

### 3. **Content Script Missing Utility Scripts**

**File:** `manifest.json`

**Issue:** content.js relies on PassportUtils and CryptoUtils but they're not injected into web pages

**Impact:** Badge creation and verification on web pages will fail

**Current manifest.json:**
```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "all_frames": true,
    "js": ["content.js"],
    "run_at": "document_idle"
  }
]
```

**Should Be:**
```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "all_frames": true,
    "js": [
      "crypto-utils.js",
      "passport-utils.js",
      "content.js"
    ],
    "run_at": "document_idle"
  }
]
```

---

### 4. **No Lockdown Mode (Critical for "Digital Blue Book")**

**Files:** `writer.js`, `writer.html`

**Issue:** Students can tab-switch, use other apps during exam - defeats entire purpose

**Impact:** Cannot be used for secure exam environment (core value prop)

**Missing Features:**
- ❌ Detect tab/window switching
- ❌ Prevent copy/paste from outside
- ❌ Block right-click/inspect element
- ❌ Fullscreen enforcement
- ❌ Log suspicious activities

**Required Implementation:**
```javascript
// In writer.js
let suspiciousActivities = [];

// Detect tab switching
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        suspiciousActivities.push({
            type: 'tab_switch',
            timestamp: Date.now()
        });
        console.warn('⚠️ Tab switch detected');
    }
});

// Detect window blur (student clicked away)
window.addEventListener('blur', () => {
    suspiciousActivities.push({
        type: 'window_blur',
        timestamp: Date.now()
    });
});

// Block external paste
document.getElementById('editor').addEventListener('paste', (e) => {
    const clipboardData = e.clipboardData.getData('text');
    // Only allow paste from within same session
    if (!isInternalPaste(clipboardData)) {
        e.preventDefault();
        alert('External paste blocked in exam mode');
    }
});
```

---

### 5. **Badge Signature Verification Not in verify.html**

**File:** `verify.html`

**Issue:** Teacher dashboard shows signature but doesn't actually VERIFY it

**Impact:** Teachers can't detect forged badges (defeats crypto security)

**verify.html shows signature (line ~450):**
```javascript
if (badge.signature) {
    certDiv.innerHTML += `<div class="verify-section">
        <strong>Signature:</strong> ${badge.signature.substring(0, 50)}...
    </div>`;
}
```

**Missing:** Actual verification call to `CryptoUtils.verifyBadge()`

**Should Add:**
```javascript
if (badge.signature && badge.publicKeyId) {
    // Fetch public key and verify
    const isValid = await CryptoUtils.verifyBadge(
        badge,
        badge.signature,
        badge.publicKey // Need to include full public key in badge
    );

    const verifyStatus = isValid ?
        '<span style="color:#00FF00">✅ VERIFIED</span>' :
        '<span style="color:#FF0000">❌ INVALID SIGNATURE</span>';

    certDiv.innerHTML += `<div class="verify-section">
        <strong>Crypto Verification:</strong> ${verifyStatus}
    </div>`;
}
```

---

### 6. **Public Key Not Included in Badge Payload**

**File:** `writer.js` lines 284-325

**Issue:** Badge includes `publicKeyId` (fingerprint) but not the actual public key

**Impact:** Cannot verify signature without the public key itself

**Current payload (line 316):**
```javascript
publicKeyId: publicKeyFingerprint
```

**Should Be:**
```javascript
publicKeyId: publicKeyFingerprint,
publicKey: await CryptoUtils.getPublicKey() // Export full JWK
```

**Add to crypto-utils.js:**
```javascript
async getPublicKey() {
    const stored = await chrome.storage.local.get(['jitterPublicKey']);
    return stored.jitterPublicKey || null;
}
```

---

### 7. **No Time Limits or Auto-Submit**

**File:** `writer.js`

**Issue:** No way to set exam duration or force submission

**Impact:** Cannot use for timed exams (required for digital blue book)

**Missing:**
```javascript
let examConfig = {
    enabled: false,
    durationMinutes: 90,
    startTime: null,
    warningThreshold: 5 // minutes before end
};

function startExamMode(duration) {
    examConfig.enabled = true;
    examConfig.durationMinutes = duration;
    examConfig.startTime = Date.now();

    // Set timer
    const endTime = Date.now() + (duration * 60 * 1000);
    const timer = setInterval(() => {
        const remaining = endTime - Date.now();

        if (remaining <= 0) {
            clearInterval(timer);
            autoSubmit();
        } else if (remaining <= (examConfig.warningThreshold * 60 * 1000)) {
            showWarning(`${Math.ceil(remaining / 60000)} minutes remaining`);
        }

        updateTimerDisplay(remaining);
    }, 1000);
}

async function autoSubmit() {
    alert('Time expired! Automatically submitting...');
    await exportBadge();
    document.getElementById('editor').contentEditable = false;
}
```

---

## ⚠️ HIGH PRIORITY ISSUES

### 8. **Duplicate Passport Level Logic**

**Files:** `writer.js` (lines 151-158), `content.js` (lines 119-127)

**Issue:** Same logic copy-pasted in two files

**Impact:** Maintenance nightmare, potential inconsistencies

**Fix:** Move to PassportUtils:
```javascript
// In passport-utils.js
updateLevel(passport) {
    const k = passport.totalKeystrokes;
    if (k < 1000) passport.level = "Novice";
    else if (k < 5000) passport.level = "Beginner";
    else if (k < 15000) passport.level = "Intermediate";
    else if (k < 50000) passport.level = "Advanced";
    else if (k < 150000) passport.level = "Expert";
    else passport.level = "Master";
    return passport;
}
```

Then replace both files:
```javascript
if (typeof PassportUtils !== 'undefined') {
    PassportUtils.updateLevel(passport);
} else {
    // Fallback inline
    updatePassportLevel();
}
```

---

### 9. **Rhythm Analysis Duplication**

**Files:** `writer.js` (lines 126-150), `content.js` (lines 129-150)

**Issue:** Loki algorithm duplicated

**Impact:** Inconsistent bot detection between environments

**Fix:** Create shared `loki-utils.js` module

---

### 10. **Missing Stats Tracking Integration**

**File:** `writer.js` lines 327-338

**Issue:** Stats tracking exists but only fires when logged in

**Current:**
```javascript
if (typeof StatsUtils !== 'undefined' && typeof AuthUtils !== 'undefined') {
    const status = AuthUtils.getSyncStatus();
    if (status.isLoggedIn && status.userEmail) {
        // Track badge mint
        StatsUtils.trackBadgeMint(...)
    }
}
```

**Problem:** No stats for non-logged-in users (most students during beta)

**Impact:** No analytics during pilot testing phase

**Fix:** Track anonymously if not logged in:
```javascript
if (typeof StatsUtils !== 'undefined') {
    const userId = AuthUtils?.getCurrentUser()?.uid || 'anonymous';
    StatsUtils.trackBadgeMint(userId, badgeData);
}
```

---

### 11. **No Teacher Proctoring Dashboard**

**Missing File:** `proctor.html`

**Issue:** Teachers can't see students writing in real-time

**Impact:** Cannot monitor exam sessions live (required for digital blue book)

**Required Features:**
- Live student list (who's writing now)
- Real-time word count per student
- Activity indicators (typing/idle)
- Flagging system (student stopped typing for >5 min)
- Export all essays at end

---

### 12. **No LMS Integration**

**Missing:** Canvas/Blackboard API integration

**Issue:** Teachers have to manually copy grades

**Impact:** Friction in adoption (teachers won't use it)

**Required:**
- Export to Canvas assignments
- Auto-upload badges to LMS
- Grade sync

---

### 13. **Supabase Config Hardcoded**

**Files:** `auth-utils.js`, `admin.html`

**Issue:** API keys in source code

**Impact:**
- Keys committed to git repo
- No way to change per environment (dev/prod)
- Security risk if repo becomes public

**Fix:** Use environment variables or separate config file

---

### 14. **No Error Handling in Async Functions**

**Example:** `writer.js` line 257 `async function exportBadge()`

**Issue:** No try/catch, no user feedback on failure

**Impact:** Silent failures, confused users

**Fix:**
```javascript
async function exportBadge() {
    try {
        // ... existing code ...
    } catch (error) {
        console.error('Badge export failed:', error);
        alert(`Failed to create badge: ${error.message}\n\nPlease try again or contact support.`);
        return;
    }
}
```

---

### 15. **Badge Chain Broken if User Clears Storage**

**File:** `crypto-utils.js` lines 171-178

**Issue:** Chain breaks if user clears browser data

**Impact:** Entire passport history lost

**Fix:** Store backup in Supabase
```javascript
async storeBadgeHash(badgeBase64) {
    const hash = await this.hashBadge(badgeBase64);
    if (hash) {
        await chrome.storage.local.set({ lastBadgeHash: hash });

        // Backup to cloud if logged in
        if (typeof AuthUtils !== 'undefined' && AuthUtils.getCurrentUser()) {
            await supabase.from('badge_chain').insert({
                user_id: AuthUtils.getCurrentUser().uid,
                hash: hash,
                created_at: new Date().toISOString()
            });
        }
    }
    return hash;
}
```

---

### 16. **Suspicion Score Thresholds Unvalidated**

**File:** `passport-utils.js` lines 132-187

**Issue:** Bot detection thresholds (5000 keys/day, variance <0.3) are guesses

**Impact:** False positives or false negatives

**Fix:** Need real-world data to calibrate
- Collect anonymous stats from pilot users
- Analyze distribution of legitimate vs bot patterns
- Adjust thresholds based on data

---

### 17. **No Session Recovery**

**Issue:** If browser crashes during exam, student loses all work

**Impact:** Disaster for students, liability for school

**Fix:** Auto-save to localStorage every 30 seconds:
```javascript
setInterval(() => {
    if (session.humanChars > 0) {
        const draft = {
            content: document.getElementById('editor').innerHTML,
            session: session,
            bio: bio,
            timestamp: Date.now()
        };
        chrome.storage.local.set({ autosave: draft });
    }
}, 30000);

// On load, check for autosave
chrome.storage.local.get(['autosave'], (result) => {
    if (result.autosave && Date.now() - result.autosave.timestamp < 3600000) {
        if (confirm('Found unsaved work. Restore?')) {
            document.getElementById('editor').innerHTML = result.autosave.content;
            session = result.autosave.session;
            bio = result.autosave.bio;
        }
    }
});
```

---

### 18. **Badge Format Version Not Enforced**

**Issue:** Payload includes `version: '2.0'` but no validation

**Impact:** Breaking changes in future versions will cause issues

**Fix:** Add version check in verify.html:
```javascript
function decodeBadge(base64) {
    const badge = JSON.parse(atob(base64));

    if (!badge.version || badge.version !== '2.0') {
        alert(`Unsupported badge version: ${badge.version || '1.0'}\n\nPlease update JITTEr to verify this badge.`);
        return null;
    }

    return badge;
}
```

---

### 19. **No Accessibility Support**

**Files:** All HTML files

**Issue:** No ARIA labels, keyboard navigation, screen reader support

**Impact:** Violates ADA compliance, excludes disabled students

**Fix:** Add proper ARIA:
```html
<button
    class="btn btn-primary"
    id="btn-export"
    aria-label="Export verified badge"
    role="button"
>
    MINT BADGE
</button>
```

---

## 📋 MEDIUM PRIORITY ISSUES

### 20. **Paste Event Tracking Incomplete**

**File:** `writer.js` line 116-122

**Issue:** Paste marks content as "alien" but doesn't track WHAT was pasted or FROM WHERE

**Impact:** Can't differentiate between pasting from own notes vs ChatGPT

**Enhancement:**
```javascript
function handlePaste(e) {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    const plainText = pastedText.replace(/<[^>]*>/g, '');

    // Track paste metadata
    const pasteEvent = {
        length: plainText.length,
        timestamp: Date.now(),
        source: e.clipboardData.types.includes('text/html') ? 'rich' : 'plain',
        firstChars: plainText.substring(0, 50) // For debugging only
    };

    if (!session.pasteHistory) session.pasteHistory = [];
    session.pasteHistory.push(pasteEvent);

    session.alienChars += plainText.length;
    document.execCommand('insertText', false, plainText);
    updateDashboard();
}
```

---

### 21. **Dashboard UI Updates Inefficient**

**File:** `writer.js` line 161-245 `updateDashboard()`

**Issue:** Called on every keystroke, updates entire UI

**Impact:** Performance degradation on long essays

**Fix:** Debounce or use requestAnimationFrame:
```javascript
let dashboardUpdateScheduled = false;

function updateDashboard() {
    if (dashboardUpdateScheduled) return;

    dashboardUpdateScheduled = true;
    requestAnimationFrame(() => {
        dashboardUpdateScheduled = false;
        // ... actual update logic ...
    });
}
```

---

### 22. **No Mobile Support**

**Issue:** Chrome extension only, doesn't work on phones/tablets

**Impact:** Students increasingly write on mobile devices

**Fix:** Build PWA version or React Native app

---

### 23. **No Offline Indicator**

**Issue:** If Supabase is down, users get cryptic errors

**Impact:** Confusion, support tickets

**Fix:** Check connectivity:
```javascript
window.addEventListener('online', () => {
    document.getElementById('offline-banner').style.display = 'none';
});

window.addEventListener('offline', () => {
    document.getElementById('offline-banner').style.display = 'block';
    document.getElementById('offline-banner').innerText =
        '⚠️ Offline - Cloud sync disabled. Your work is still saved locally.';
});
```

---

### 24. **Word Count Algorithm Naive**

**File:** `writer.js` line 172

**Issue:** `text.trim().split(/\s+/)` counts "don't" as 1 word but "don 't" as 2

**Impact:** Inconsistent word counts vs MS Word

**Fix:** Use proper word segmentation library or regex

---

### 25. **No Export to PDF/DOCX**

**Issue:** Only exports badge, not the actual essay

**Impact:** Students have to copy-paste essay separately

**Fix:** Add export buttons:
```javascript
function exportEssayWithBadge(format) {
    const essay = document.getElementById('editor').innerText;
    const badge = generateBadgeText();

    if (format === 'txt') {
        const blob = new Blob([essay + '\n\n' + badge], { type: 'text/plain' });
        downloadBlob(blob, 'essay.txt');
    }
    // Add PDF/DOCX export libraries
}
```

---

### 26. **Badge Display Ugly in Email**

**Issue:** HTML badge looks broken in some email clients

**Impact:** Teachers get garbage text

**Fix:** Add plaintext alternative:
```javascript
const plainBadge = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   JITTER VERIFIED BADGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Block ID: 0x${blockID}
Integrity: ${integrity}%
Cognitive Ratio: ${cr}
Passport: ${passportLevel} (${totalKeys} keys)
Date: ${date}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Verify at: https://jitter.app/verify
Badge Code: ${base64}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
```

---

### 27. **No Rate Limiting on Badge Mints**

**Issue:** Student can spam-mint badges

**Impact:** Database fills with junk

**Fix:**
```javascript
let lastBadgeMint = 0;
const BADGE_COOLDOWN = 60000; // 1 minute

async function exportBadge() {
    const now = Date.now();
    if (now - lastBadgeMint < BADGE_COOLDOWN) {
        alert(`Please wait ${Math.ceil((BADGE_COOLDOWN - (now - lastBadgeMint)) / 1000)}s before minting another badge.`);
        return;
    }
    lastBadgeMint = now;
    // ... rest of function ...
}
```

---

## 🔍 LOW PRIORITY ISSUES

### 28. **Console Logs in Production Code**

**All Files**

**Issue:** `console.log()` and `console.error()` everywhere

**Impact:** Leaks debug info to users

**Fix:** Use logging library with levels, disable in production

---

### 29. **No Keyboard Shortcuts**

**Issue:** Everything requires mouse clicks

**Impact:** Slower workflow for power users

**Fix:** Add shortcuts:
- Ctrl+E: Export badge
- Ctrl+R: Reset session
- Ctrl+S: Auto-save (already saved, just show confirmation)

---

### 30. **Dark Mode Missing**

**Issue:** Bright white UI strains eyes

**Impact:** Accessibility issue

**Fix:** Add dark theme toggle

---

### 31. **No Student Dashboard**

**Issue:** Students can't see their own passport history

**Impact:** No engagement with gamification

**Fix:** Create `student-dashboard.html` showing:
- Passport level progress
- Daily keystroke chart
- Session history
- Level-up milestones

---

### 32. **Badge Scanner Performance**

**File:** `content.js` line 200+ `runScanner()`

**Issue:** Scans entire page every 2 seconds

**Impact:** CPU usage, battery drain

**Fix:** Use MutationObserver instead of polling

---

## ✅ WHAT'S WORKING WELL

1. **Crypto Implementation:** ECDSA P-256 correctly implemented
2. **Loki Algorithm:** Cognitive ratio is clever, works as designed
3. **Passport Tracking:** Good foundation for long-term verification
4. **Privacy:** Local-first architecture preserves student privacy
5. **Bot Detection Logic:** Reasonable heuristics (need calibration)
6. **Supabase Integration:** Clean, well-structured
7. **Code Organization:** Generally well-organized, modular
8. **UI/UX:** Clean, minimal, focused

---

## 📊 Code Quality Metrics

**Total Lines of Code:** ~3,500
**Files:** 14
**Code Duplication:** ~15% (needs refactoring)
**Security Issues:** 2 critical (badge verification, key storage)
**Performance Issues:** 3 moderate
**Missing Features:** 8 critical for production

---

## 🎯 RECOMMENDED PRIORITIES

### Phase 1 (Week 1): Critical Fixes for Beta
1. Fix content script utility injection (**Issue #3**)
2. Add copyright headers (**Issue #1**)
3. Implement PassportUtils in content.js (**Issue #2**)
4. Add badge signature verification in verify.html (**Issue #5**)
5. Include public key in badge payload (**Issue #6**)
6. Add error handling (**Issue #14**)
7. Implement session recovery (**Issue #17**)

### Phase 2 (Week 2-3): Digital Blue Book Features
8. Implement lockdown mode (**Issue #4**)
9. Add time limits and auto-submit (**Issue #7**)
10. Build teacher proctoring dashboard (**Issue #11**)
11. Add exam configuration UI

### Phase 3 (Week 4+): Production Hardening
12. Calibrate bot detection thresholds with pilot data (**Issue #16**)
13. Fix code duplication (**Issues #8, #9**)
14. Add accessibility support (**Issue #19**)
15. Implement rate limiting (**Issue #27**)
16. Build LMS integration (**Issue #12**)

---

## 💰 Cost to Fix

**Estimated Developer Time:**
- Critical issues: 40-60 hours
- High priority: 60-80 hours
- Medium priority: 30-40 hours
- Low priority: 20-30 hours

**Total: 150-210 hours (4-5 weeks full-time)**

---

## 🎓 Final Recommendation

**For Pilot Testing:** Fix Phase 1 issues (1 week)
**For Production Launch:** Complete Phases 1-2 (3-4 weeks)
**For Scale:** Complete all phases (5+ weeks)

**Bottom Line:** Code is solid foundation but needs **3-4 weeks of focused work** to be production-ready as a "Digital Blue Book" system.

---

**Next Step:** Should I create implementation PRs for the critical issues?
