# JITTEr Testing Guide & Known Issues

## 🐛 Fixed: CSP (Content Security Policy) Issues

### Problem
Sites like Google Docs, Medium, GitHub block inline styles via CSP headers.

**Before (BROKEN):**
```javascript
indicator.style.cssText = `position: fixed; color: #00F0FF;`; // ❌ Blocked by CSP
```

**After (FIXED):**
```javascript
indicator.className = 'jitter-tracking'; // ✅ Uses external CSS
```

### Solution
- Created `content.css` with all styles
- Injected via `manifest.json` content_scripts
- Uses CSS classes instead of inline styles
- All styles use `!important` to override site CSS

---

## 🎯 Sites Tested

### ✅ Should Work (No CSP issues)
- Generic textarea elements
- ContentEditable divs
- Most blogs and CMSes

### ⚠️ Needs Testing (CSP concerns)
- **Google Docs** - Strict CSP, complex iframe structure
- **Medium** - Strict CSP
- **Notion** - Uses iframes
- **GitHub** - Strict CSP
- **Substack** - Should work

### ❌ Known Limitations

#### Google Docs iframe issue
**Problem:** Google Docs uses nested iframes for the editor:
```
Main page (docs.google.com)
└─ .docs-texteventtarget-iframe (actual editor)
```

**Current behavior:**
- ✅ Indicator appears on MAIN page
- ⚠️ Keystroke tracking may not work in iframe

**Solution (if needed):**
Set `"all_frames": true` in manifest, then filter by URL:
```javascript
// Only run indicator on main frame
if (window !== window.top) {
    // In iframe - just track, no indicator
} else {
    // Main frame - show indicator
}
```

---

## 🧪 Manual Testing Checklist

Run `npm test` to see full test guide.

### Quick Test
```
1. Load extension in Chrome
2. Go to: data:text/html,<textarea style="width:500px;height:300px"></textarea>
3. Start typing
4. EXPECTED:
   ✓ See "⚡" indicator (bottom right)
   ✓ Indicator turns cyan when typing
   ✓ Click → popup shows stats
```

### Google Docs Test
```
1. Go to: https://docs.new
2. Wait for doc to load
3. Start typing
4. Check DevTools console for errors
5. EXPECTED:
   ✓ Indicator appears (even if tracking doesn't work yet)
   ✓ No CSP errors
```

### Debug Console Checks
```
✅ Should see:
- "🟢 JITTEr: Tracking initialized"
- "Found X text editor(s) on page"

❌ Should NOT see:
- "Refused to apply inline style" (CSP error)
- "Content Security Policy" errors
```

---

## 🔍 Debugging Common Issues

### Indicator doesn't appear
**Possible causes:**
1. `content.css` not loading → Check manifest.json includes css
2. Body not ready → Wait for DOMContentLoaded
3. CSP blocking → Check console for errors
4. Z-index conflict → Increase z-index in content.css

**Fix:**
```bash
# Reload extension
chrome://extensions/ → Click reload button

# Check console
F12 → Console tab → Look for JITTEr messages
```

### Tracking not working
**Possible causes:**
1. Focus not detected → Check isTextEditor() function
2. Message passing broken → Check background.js console
3. Storage permission issue → Check manifest.json

**Debug:**
```javascript
// In DevTools console on any page
chrome.storage.local.get(['sessions'], console.log);
// Should show array of sessions
```

### "Sign This Article" button disabled
**Possible causes:**
1. Session not active (< 100 keystrokes)
2. Content script not communicating with popup
3. Background service worker crashed

**Fix:**
```bash
# Check background worker
chrome://extensions/ → JITTEr → Inspect views: background page
# Look for errors
```

---

## 🚨 Priority Issues to Fix

### 1. Google Docs iframe tracking (HIGH)
**Issue:** Typing happens in iframe, not main page
**Status:** Needs investigation
**Fix:** May need `all_frames: true` with smart filtering

### 2. Message passing test (MEDIUM)
**Issue:** content → background → popup communication untested
**Status:** Needs manual test
**Test:** Type, click popup, verify stats update

### 3. Badge generation test (MEDIUM)
**Issue:** Crypto signing untested on real content
**Status:** Needs manual test
**Test:** Type 100+ chars, click "Sign This Article"

### 4. Verification page (LOW)
**Issue:** Currently static HTML, no real badge loading
**Status:** Works for demo, needs API later

---

## 📊 Test Results Template

After testing, fill this in:

```
TESTED BY: [Your name]
DATE: [Date]
CHROME VERSION: [chrome://version]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PASSING TESTS:
- [ ] Indicator appears on simple textarea
- [ ] Indicator turns cyan when typing
- [ ] Keystroke count increases
- [ ] Popup shows session stats
- [ ] "Sign This Article" generates badge

⚠️  PARTIAL (Works but has issues):
- [ ] Google Docs (indicator yes, tracking ?)
- [ ] Medium (CSP issues?)
- [ ] Substack

❌ FAILING TESTS:
- [ ] [Describe what failed]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONSOLE ERRORS:
[Paste any red errors here]

NOTES:
[Any other observations]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔧 Known Workarounds

### If Google Docs doesn't track:
**Temporary workaround:**
1. Type in Google Docs
2. Copy final text
3. Go to simple textarea: `data:text/html,<textarea style="width:500px;height:300px"></textarea>`
4. Paste and edit there
5. Use "Sign This Article"
6. Copy badge + article back to Google Docs

(Not ideal, but validates core functionality while we fix iframe issue)

### If Medium blocks badge embed:
**Workaround:**
- Put badge at END of article (after all content)
- Medium might strip certain HTML, so test plaintext version

---

## ✅ Next Steps After Testing

1. **If all basic tests pass:**
   - ✅ Ready for journalist outreach
   - Focus on sites that work (Substack, generic editors)

2. **If Google Docs fails:**
   - Document issue
   - Add to roadmap for v3.1
   - Focus on Substack/Medium for now

3. **If message passing broken:**
   - HIGH PRIORITY FIX
   - Core functionality depends on it

---

**RUN TESTS NOW:** `npm test`

(This just shows the manual test guide - you still need to test in Chrome)
