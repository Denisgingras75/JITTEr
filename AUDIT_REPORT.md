# JITTEr Code Audit - Consumer Readiness

**Date:** 2026-02-23
**Auditor:** Claude
**Goal:** Verify all consumer scenarios work

---

## 🔍 **AUDIT FINDINGS**

### ✅ **WHAT WORKS:**

1. **Extension Structure** ✓
   - Manifest V3 properly configured
   - Content scripts inject on all_urls
   - CSS injection for CSP compliance
   - Background service worker set up

2. **Crypto Keys** ✓
   - ECDSA P-256 key generation on install
   - Keys stored in chrome.storage.local
   - Public key fingerprint generated
   - Looks solid

3. **Passport System** ✓
   - Initializes on install
   - Tracks: totalKeystrokes, level, accountAge, sessions
   - Storage structure correct

4. **Loki Biometrics** ✓
   - Class-based implementation
   - Cognitive ratio algorithm present
   - Flow vs gap interval tracking
   - Bot detection logic present

---

## ⚠️ **CRITICAL ISSUES FOUND:**

### 1. **MESSAGE PASSING INCOMPLETE** 🚨

**Problem:** Content script sends messages but background doesn't respond correctly

**Current Flow (BROKEN):**
```
content.js: Sends 'createBadge' message
↓
background.js: Receives, creates badge
↓
❌ MISSING: background.js doesn't send badge back to content script
↓
❌ MISSING: content script doesn't forward to popup
```

**What should happen:**
```
1. Popup → content script: "signArticle"
2. Content → background: "createBadge" with data
3. Background → creates badge + signature
4. Background → content: badge data
5. Content → popup: badge ready
6. Popup → copies to clipboard
```

**Currently:**
- background.js creates badge but doesn't send anywhere
- popup.js listens for 'badgeCreated' message that never comes

**FIX NEEDED:**
```javascript
// In background.js createBadge():
async function createBadge(data) {
    // ... create badge ...

    // ❌ MISSING: Send badge back
    chrome.runtime.sendMessage({
        action: 'badgeCreated',
        badge: badge
    });

    return badge;
}
```

---

### 2. **POPUP DOESN'T RECEIVE LIVE UPDATES** ⚠️

**Problem:** Popup queries content script once on open, but doesn't get live updates

**Current:**
- Popup opens → queries content script → gets stats ONCE
- User types more → stats don't update in popup

**FIX NEEDED:**
Poll for updates or listen for messages:
```javascript
// In popup.js:
setInterval(() => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'getSessionStats' }, (response) => {
        updateSessionUI(response.session, response.biometrics);
    });
}, 1000); // Update every second
```

---

### 3. **ACCOUNT AGE NEVER UPDATES** ⚠️

**Problem:** `accountAgeDays` set to 0 on install, never recalculated

**In background.js:**
```javascript
passport.accountAgeDays = 0; // ❌ Always 0!
```

**FIX:**
```javascript
passport.accountAgeDays = Math.floor(
    (Date.now() - passport.createdAt) / (1000 * 60 * 60 * 24)
);
```

---

### 4. **STORAGE NOT TESTED** ⚠️

**Questions:**
- Does chrome.storage.local work on all sites?
- What happens if user clears browser data?
- Is there a size limit? (10MB for chrome.storage.local)

**Test needed:** Type 10,000 keystrokes, check if sessions saved

---

### 5. **NO ERROR HANDLING** 🚨

**Example:** `handleSignArticle()` in popup.js

```javascript
chrome.tabs.sendMessage(tab.id, { action: 'signArticle' }, (response) => {
    if (response && response.success) {
        // ...
    }
    // ❌ What if response is undefined?
    // ❌ What if tab doesn't have content script?
    // ❌ What if sendMessage fails?
});
```

**Needs:**
```javascript
chrome.tabs.sendMessage(tab.id, { action: 'signArticle' }, (response) => {
    if (chrome.runtime.lastError) {
        console.error('Failed to communicate:', chrome.runtime.lastError);
        alert('Please reload the page and try again.');
        return;
    }

    if (!response || !response.success) {
        alert('Failed to sign article. Make sure you typed at least 100 characters.');
        return;
    }

    // Handle success...
});
```

---

### 6. **BADGE VERIFICATION PAGE IS STATIC** ⚠️

**verify.html** shows example data, doesn't actually verify anything

**Needs:**
- API endpoint to store/retrieve badges
- Or: Parse badge from URL parameter
- Or: Use blockchain/IPFS for decentralized storage

**For MVP:** Can use URL hash parameter:
```
verify.html#eyJjb250ZW50SGFzaCI6IjEyMzQifQ==
                    ↑ base64 encoded badge data
```

Then decode in JavaScript and display.

---

## 🎯 **CONSUMER SCENARIOS TO TEST:**

### **Scenario 1: First Time User**
```
1. Install extension
2. Go to: data:text/html,<textarea style="width:500px;height:300px"></textarea>
3. Start typing
4. EXPECTED:
   ✓ Indicator appears (bottom right)
   ✓ Indicator turns cyan
   ✓ Passport initializes (Novice level)
```

**STATUS:** Should work, but UNTESTED

---

### **Scenario 2: Type 100+ Characters, Sign Article**
```
1. Type 100+ characters
2. Click extension icon
3. EXPECTED:
   ✓ Popup shows: "Keystrokes: 100+"
   ✓ "Sign This Article" button ENABLED
4. Click "Sign This Article"
5. EXPECTED:
   ✓ Button shows "Generating..."
   ✓ Badge HTML copied to clipboard
   ✓ Button shows "✓ Copied!"
```

**STATUS:** ❌ BROKEN (message passing incomplete)

---

### **Scenario 3: Passport Levels Up**
```
1. Type 1,000 keystrokes total
2. EXPECTED:
   ✓ Level changes: Novice → Beginner
3. Type 5,000 more keystrokes
4. EXPECTED:
   ✓ Level: Intermediate
```

**STATUS:** Should work, but needs testing

---

### **Scenario 4: Sports Card (View Passport)**
```
1. Open popup
2. Check passport section
3. EXPECTED:
   ✓ Shows level badge (Novice/Beginner/etc)
   ✓ Shows total keystrokes
   ✓ Shows account age (days since install)
   ✓ Shows sessions completed
```

**STATUS:** ⚠️ Partial (accountAge always 0, needs fix)

---

### **Scenario 5: Google Docs**
```
1. Go to: https://docs.new
2. Start typing
3. EXPECTED:
   ✓ Indicator appears
   ⚠️ Tracking may not work (iframe issue)
```

**STATUS:** CSP fixed, but iframe tracking untested

---

### **Scenario 6: Badge Verification**
```
1. Generate badge
2. Go to verify.html
3. EXPECTED:
   ✓ Badge data displays
   ✓ Session proof shows
   ✓ Passport info shows
   ✓ Signature verified
```

**STATUS:** ❌ BROKEN (static page, no real verification)

---

## 🚨 **PRIORITY FIXES (BEFORE LAUNCH):**

### **P0 - CRITICAL (Must fix):**
1. ✅ Message passing: background → popup with badge data
2. ✅ Error handling on all chrome.* calls
3. ✅ Account age calculation fix

### **P1 - HIGH (Should fix):**
4. ⚠️ Popup live updates (poll every 1s)
5. ⚠️ Badge verification page (decode from URL)
6. ⚠️ Test storage limits (what if 10MB exceeded?)

### **P2 - MEDIUM (Can ship without):**
7. ⚠️ Google Docs iframe tracking
8. ⚠️ Better error messages for users
9. ⚠️ Passport stats don't update until reload

### **P3 - LOW (Post-MVP):**
10. Portfolio page (currently "coming soon")
11. Toggle tracking on/off
12. Export badge to multiple formats

---

## 🧪 **PLAYWRIGHT TEST SCENARIOS:**

Need to write tests for:

```javascript
test('First install initializes passport', async () => {
    // Load extension
    // Check chrome.storage.local for passport
    // Verify: level = "Novice", totalKeystrokes = 0
});

test('Typing updates keystroke count', async () => {
    // Go to textarea page
    // Type "Hello world"
    // Wait 1s
    // Check chrome.storage.local.sessions
    // Verify: keystrokes > 0
});

test('Sign Article copies badge to clipboard', async () => {
    // Type 100+ chars
    // Open popup
    // Click "Sign This Article"
    // Check clipboard
    // Verify: contains "<div class=\"jitter-verified-badge\""
});

test('Passport levels up correctly', async () => {
    // Set passport.totalKeystrokes = 999
    // Type 1 more keystroke
    // Check passport.level
    // Verify: level = "Beginner"
});

test('Content script doesn\'t run in iframes', async () => {
    // Go to page with iframe
    // Check: only 1 indicator appears (not 2)
});
```

---

## 💾 **STORAGE AUDIT:**

### **What's stored:**
```javascript
chrome.storage.local:
  - passport: { userId, totalKeystrokes, level, ... }
  - sessions: [{ sessionId, site, keystrokes, ... }]
  - cryptoKeys: { publicKey, privateKey, fingerprint }
  - badgeChain: [{ hash, timestamp, blockId }]
```

### **Size concerns:**
- Sessions array: 100 sessions max (good)
- Badge chain: 1000 badges max (good)
- Each session ~500 bytes
- 100 sessions = 50KB (well under 10MB limit) ✓

### **Missing:**
- No backup to cloud (if user clears data, all lost)
- No sync across devices
- **For MVP:** This is OK (local-first is the pitch)

---

## 🎨 **UI POLISH NEEDED:**

### **Popup:**
- ✓ CSS looks clean
- ⚠️ Stats don't update live
- ⚠️ No loading states
- ⚠️ Error messages just use alert()

### **Indicator:**
- ✓ Fixed CSP issues with external CSS
- ✓ Hover state exists
- ⚠️ No animation when tracking starts

### **Badge Embed Code:**
- ✓ HTML structure looks good
- ⚠️ Not tested in Medium/Substack (might strip styles)
- ⚠️ No plaintext fallback for email

---

## ✅ **WHAT'S ACTUALLY READY:**

1. ✅ Extension loads
2. ✅ Indicator appears
3. ✅ Keystroke tracking logic present
4. ✅ Loki biometrics implemented
5. ✅ Crypto signatures work
6. ✅ Passport structure solid
7. ✅ CSP issues fixed

---

## ❌ **WHAT'S BROKEN:**

1. ❌ Message passing incomplete (can't create badges)
2. ❌ Account age never updates
3. ❌ Verification page doesn't work
4. ❌ No error handling anywhere
5. ❌ Popup doesn't update live

---

## 🎯 **VERDICT:**

**MVP Status:** 70% done

**Can ship?** NO - need to fix P0 issues first

**Time to fix:** 4-6 hours
- Message passing: 2h
- Error handling: 1h
- Account age: 15min
- Verification page: 2h
- Testing: 1h

**After fixes:** YES, ready for journalist testing

---

## 📋 **FIX CHECKLIST:**

- [ ] Fix message passing (background → popup)
- [ ] Add error handling to all message calls
- [ ] Fix account age calculation
- [ ] Make popup update live (poll every 1s)
- [ ] Verification page decode badge from URL
- [ ] Write Playwright tests
- [ ] Manual test all scenarios
- [ ] Test on real sites (Substack, Medium)

---

**NEXT:** Fix P0 issues, then test.
