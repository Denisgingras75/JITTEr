#!/usr/bin/env node

/**
 * Manual test instructions for JITTEr extension
 * Since Playwright requires Chrome download, use this for manual testing
 */

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           JITTEr Extension - Manual Test Guide                ║
╚═══════════════════════════════════════════════════════════════╝

📋 SETUP:
1. Open Chrome
2. Go to chrome://extensions/
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the JITTEr folder

✅ TESTS TO RUN:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEST 1: Simple Textarea
------------------------
1. Open: data:text/html,<textarea id="test" style="width:500px;height:300px"></textarea>
2. Start typing
3. EXPECTED:
   ✓ See "⚡" indicator (bottom right)
   ✓ Indicator turns cyan when typing
   ✓ Click indicator → popup shows stats

COMMON ISSUES:
- Indicator missing → content.js not injecting
- Stats not updating → message passing broken

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEST 2: ContentEditable (Medium-style)
---------------------------------------
1. Open: data:text/html,<div contenteditable="true" style="width:500px;height:300px;border:1px solid #ccc;padding:20px">Start typing...</div>
2. Start typing
3. EXPECTED:
   ✓ Same as Test 1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEST 3: Google Docs (CRITICAL)
-------------------------------
1. Open: https://docs.new
2. Wait for doc to load
3. Start typing
4. EXPECTED:
   ✓ Indicator appears (bottom right of main window)
   ✓ Typing is tracked
   ✓ Popup shows stats

⚠️  KNOWN ISSUES:
- Google Docs uses iframes
- Content script must run in TOP frame only (not iframes)
- CSP might block some features

DEBUG:
- Open DevTools → Console
- Look for "🟢 JITTEr: Tracking initialized"
- Check for CSP errors

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEST 4: Medium
--------------
1. Open: https://medium.com/new-story
   (May require login)
2. Start typing in editor
3. EXPECTED:
   ✓ Indicator appears
   ✓ Tracking works

COMMON ISSUES:
- CSP blocking inline styles
- Editor uses complex React structure

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEST 5: Substack
----------------
1. Open: https://substack.com
2. Click "Start writing"
3. Type in editor
4. EXPECTED:
   ✓ Same as above

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEST 6: Gmail (Bonus)
---------------------
1. Open: https://mail.google.com
2. Click "Compose"
3. Type in email body
4. EXPECTED:
   ✓ Indicator appears
   ✓ Typing tracked

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEST 7: "Sign This Article" Button
-----------------------------------
1. Go to any site, type 100+ characters
2. Click extension icon (popup)
3. Click "Sign This Article"
4. EXPECTED:
   ✓ Button shows "Generating..."
   ✓ Badge HTML copied to clipboard
   ✓ Button shows "✓ Copied!"

COMMON ISSUES:
- Message passing fails → no badge generated
- Clipboard permission denied → check manifest

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 DEBUGGING CHECKLIST:

If extension not working:
□ Check chrome://extensions → JITTEr is enabled
□ Check for errors in extension (click "Errors")
□ Open DevTools → Console → Look for:
  - "🟢 JITTEr: Tracking initialized"
  - Any red errors
□ Check manifest.json permissions
□ Reload extension after code changes

If indicator missing:
□ content.js not injecting
□ Check: "all_frames": false in manifest (should be false)
□ Check: CSP blocking script

If tracking not working:
□ Message passing broken (content → background → popup)
□ Check background.js console (right-click extension → Inspect views → background page)
□ Storage permissions issue

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 REPORT RESULTS:

After testing, note:
✓ = Works
✗ = Broken
⚠ = Partial

TEST 1 (Textarea):        [ ]
TEST 2 (ContentEditable): [ ]
TEST 3 (Google Docs):     [ ]
TEST 4 (Medium):          [ ]
TEST 5 (Substack):        [ ]
TEST 6 (Gmail):           [ ]
TEST 7 (Sign Button):     [ ]

BUGS FOUND:
-
-
-

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 NEXT STEPS:

If all tests pass:
→ Ready for journalist outreach

If tests fail:
→ Fix bugs
→ Re-test
→ Iterate

Good luck! 🍀
`);
