# JITTEr Journalist Badge - "Sign Your Work" Architecture

**Date:** 2026-02-23
**Vision:** Let journalists prove their work is human-written with zero workflow friction

---

## 🎯 The Core Idea

**Problem:** Journalists accused of using AI to write articles

**Solution:** Browser extension that:
1. Tracks typing invisibly across ALL sites (Medium, Substack, Google Docs, Gmail)
2. Builds a "human passport" over time
3. Lets you "sign" an article with cryptographic proof
4. Embeds verification in HTML metadata (like C2PA for text)

**Zero workflow change.** Write where you always write. JITTEr just adds a signature.

---

## 🏗️ Architecture: Keep It Dead Simple

### **Component 1: Content Script (The Tracker)**

**What it does:**
- Injects into ALL web pages
- Detects text editors (contentEditable, textarea, Google Docs, Medium editor)
- Tracks keystroke timing (not content, just timing)
- Shows indicator: "🟢 JITTEr Tracking" when active
- Saves session data locally

**What it tracks:**
```javascript
{
  sessionId: "abc123",
  site: "medium.com",
  startTime: 1234567890,
  endTime: 1234598890,
  keystrokes: 5234,
  backspaces: 687,
  pasteEvents: 2,
  pasteChars: 147,
  flowIntervals: [120, 145, 98, ...], // typing speed between chars
  gapIntervals: [450, 380, 520, ...], // thinking pauses
  cognitiveRatio: 2.1, // gap/flow (higher = more human)
  entropy: 87, // variance score
  contentHash: "a7f2e9b4c1d8..." // SHA256 of final content (for verification)
}
```

**Privacy:** NO content stored, only timing patterns + final hash

---

### **Component 2: Background Worker (Session Manager)**

**What it does:**
- Receives session data from content script
- Updates passport profile
- Manages crypto keys
- Handles "Sign This Article" requests

**Passport data:**
```javascript
{
  userId: "user_abc123", // optional, can be anonymous
  publicKey: "...", // ECDSA public key
  createdAt: "2024-01-15",
  totalKeystrokes: 2100000,
  level: "Expert", // Novice → Master based on total
  accountAgeDays: 234,
  sessionsCompleted: 847,
  totalHoursTyped: 412,
  avgCognitiveRatio: 2.3,
  avgEntropy: 82,
  suspicionScore: 0.02, // bot likelihood (0-1)

  // Session history (for pattern analysis)
  recentSessions: [
    { date: "2026-02-23", keystrokes: 5234, duration: 11520, site: "medium.com" },
    // ...last 100 sessions
  ]
}
```

---

### **Component 3: Popup UI (Control Panel)**

**What it shows:**

```
┌────────────────────────────────┐
│  ⚡ JITTEr                     │
├────────────────────────────────┤
│                                │
│  Status: 🟢 Tracking           │
│  Current session: 47 min       │
│  Keystrokes: 2,134             │
│                                │
├────────────────────────────────┤
│  📊 YOUR PASSPORT              │
│                                │
│  @denis_writer                 │
│  Level: Expert ⭐⭐⭐⭐         │
│  Total: 2.1M keystrokes        │
│  Age: 234 days                 │
│  Sessions: 847                 │
│                                │
├────────────────────────────────┤
│                                │
│  [✍️ Sign This Article]        │
│                                │
│  [Toggle Tracking: ON]         │
│                                │
│  [View Portfolio →]            │
│                                │
└────────────────────────────────┘
```

---

### **Component 4: Badge Generator (The Signature)**

**When user clicks "Sign This Article":**

1. Content script grabs current page content
2. Hashes content: `SHA256(pageText)`
3. Looks up current session data
4. Creates badge payload:

```javascript
{
  version: "3.0",
  type: "article",

  // Article info
  title: "Why AI Can't Replace Journalists", // extracted from page
  url: "https://medium.com/@denis/...",
  contentHash: "a7f2e9b4c1d8...", // SHA256 of content
  date: "2026-02-23",

  // Session proof
  session: {
    keystrokes: 5234,
    duration: 11520, // seconds (3.2 hours)
    backspaces: 687,
    pasteEvents: 2,
    pasteChars: 147,
    cognitiveRatio: 2.1,
    entropy: 87,
    site: "medium.com"
  },

  // Passport proof (accumulated credibility)
  passport: {
    totalKeystrokes: 2100000,
    level: "Expert",
    accountAge: 234, // days
    sessions: 847,
    publicKeyId: "fingerprint_abc123"
  },

  // Cryptographic proof
  signature: "ECDSA_signature_here...",
  publicKey: "full_JWK_here...",

  // Chain proof (links to previous badges)
  prevBadgeHash: "xyz789...",
  blockId: "0xAB3F91"
}
```

3. Signs with ECDSA private key
4. Encodes as base64
5. Offers formats:
   - **HTML embed** (meta tags + visible badge)
   - **Shareable link** (verify.jitter.com/a7f2e9)
   - **Plaintext** (for email)
   - **JSON download** (.jitter file)

---

### **Component 5: Embeddable Badge (HTML Format)**

**What gets copied to clipboard:**

```html
<!-- JITTEr Human Verification -->
<div class="jitter-verified-badge" data-jitter-id="0xAB3F91">
  <!-- Metadata for verification -->
  <meta name="jitter:verified" content="true">
  <meta name="jitter:content-hash" content="a7f2e9b4c1d8">
  <meta name="jitter:signature" content="ECDSA_sig_here">
  <meta name="jitter:author" content="@denis_writer">
  <meta name="jitter:keystrokes" content="5234">
  <meta name="jitter:duration" content="11520">
  <meta name="jitter:cognitive-ratio" content="2.1">
  <meta name="jitter:passport-level" content="Expert">
  <meta name="jitter:timestamp" content="2026-02-23T15:30:00Z">

  <!-- Visible badge -->
  <div style="font-family:monospace;border:1px solid #00F0FF;border-radius:4px;padding:12px;background:#050505;color:#fff;display:inline-block;margin:20px 0;">
    <div style="color:#00F0FF;font-weight:bold;margin-bottom:8px;">
      ✍️ HUMAN-WRITTEN VERIFIED
    </div>
    <div style="font-size:12px;color:#aaa;">
      <div>Author: <strong style="color:#fff">@denis_writer</strong></div>
      <div>Written: 3.2 hours • 5,234 keystrokes</div>
      <div>Passport: <span style="color:#FFD700">Expert</span> • 2.1M lifetime keys</div>
      <div style="margin-top:8px;">
        <a href="https://verify.jitter.com/a7f2e9b4c1d8"
           style="color:#00F0FF;text-decoration:none;">
          🔐 Verify this article →
        </a>
      </div>
    </div>
  </div>
</div>
```

**User pastes this into Medium/Substack.** Done. Badge travels with article.

---

### **Component 6: Verification Page**

**URL:** `verify.jitter.com/a7f2e9b4c1d8`

**What it shows:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         ⚡ JITTER VERIFICATION REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 ARTICLE INFORMATION
┌────────────────────────────────────────────────
│ Title:  "Why AI Can't Replace Journalists"
│ Author: @denis_writer
│ Date:   February 23, 2026
│ URL:    medium.com/@denis/...
└────────────────────────────────────────────────

✍️ SESSION PROOF
┌────────────────────────────────────────────────
│ Total Keystrokes: 5,234
│ Duration: 3.2 hours (11,520 seconds)
│ Backspaces: 687 (13% edit rate - normal)
│ Paste Events: 2 (147 chars total)
│
│ Cognitive Ratio: 2.1 (HIGH - natural pauses)
│ Entropy: 87/100 (natural variance)
│ Bot Probability: 0.2% (HUMAN ✓)
└────────────────────────────────────────────────

🎖️ PASSPORT CREDENTIALS
┌────────────────────────────────────────────────
│ Level: Expert ⭐⭐⭐⭐
│ Lifetime Keystrokes: 2,100,000
│ Account Age: 234 days
│ Sessions Completed: 847
│ Total Hours Typed: 412 hours
│ Avg Cognitive Ratio: 2.3 (consistent)
│ Suspicion Score: 0.02 (LOW - trusted)
└────────────────────────────────────────────────

🔐 CRYPTOGRAPHIC VERIFICATION
┌────────────────────────────────────────────────
│ Content Hash: a7f2e9b4c1d8f3e2...
│ Signature: VALID ✅
│ Public Key: fingerprint_abc123
│ Chain Link: #846 → #847 (verified)
│ Block ID: 0xAB3F91
└────────────────────────────────────────────────

📊 WRITING TIMELINE
[Graph showing typing activity over 3.2 hours]
│
│   ██
│ ████  █    ██
│████████  ████  ██   █
│████████████████████████
└────────────────────────────
0h        1.5h        3.2h

⚠️ CONTENT VERIFICATION
┌────────────────────────────────────────────────
│ Status: VERIFIED ✓
│
│ Current page content matches signed hash.
│ No modifications detected since signature.
└────────────────────────────────────────────────

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This article was verified as human-written using
JITTEr Protocol - Cryptographic proof of authorship

[View @denis_writer's Portfolio] [Report Issue]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### **Component 7: Portfolio Page (Optional)**

**URL:** `jitter.com/@denis_writer`

**Public profile showing:**
- Passport stats (level, total keystrokes, account age)
- Recent verified articles (titles + links)
- Writing streak (days active)
- Badge showcase

Think: GitHub profile for writers

---

## 🔒 Privacy & Security

### **What We Track:**
✅ Keystroke timing patterns
✅ Session duration
✅ Cognitive metrics (thinking pauses)
✅ Final content hash (for verification)

### **What We DON'T Track:**
❌ Actual content/text
❌ Keylogger data
❌ Screen recording
❌ Webcam/audio
❌ Browsing history outside writing sessions

### **Data Storage:**
- **Local-first:** All session data in browser storage
- **Cloud-optional:** Only if user creates account for portfolio
- **User control:** Can delete all data anytime

### **Crypto:**
- ECDSA P-256 for signatures
- SHA-256 for content hashing
- Public/private key pair per user
- Chain linking (each badge references previous)

---

## 🚀 MVP Feature Scope (Week 1)

**Core features:**
1. ✅ Content script tracks typing on all sites
2. ✅ Shows "🟢 Tracking" indicator
3. ✅ Popup shows current session stats
4. ✅ "Sign This Article" button
5. ✅ Badge generation (HTML embed + link)
6. ✅ Verification page (verify.jitter.com)
7. ✅ Passport levels (Novice → Master)
8. ✅ Crypto signatures

**NOT in MVP:**
- ❌ User accounts (local-only for now)
- ❌ Portfolio page (later)
- ❌ Payment (free initially)
- ❌ Platform integrations (manual embed)
- ❌ Hardware pressure sensing (future)
- ❌ Mobile app (desktop Chrome only)

---

## 📁 File Structure (New Clean Start)

```
jitter-journalist/
├── manifest.json          # Chrome extension config
├── background.js          # Service worker (session manager)
├── content.js             # Injected tracker (all pages)
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic
├── popup.css              # Popup styles
├── verify.html            # Verification page (hosted)
├── verify.js              # Verification logic
├──
├── utils/
│   ├── crypto.js          # ECDSA signing (steal from old code)
│   ├── passport.js        # Passport tracking (steal from old code)
│   └── biometrics.js      # Loki algorithm (steal from old code)
│
├── docs/
│   ├── JOURNALIST_ARCHITECTURE.md  # This file
│   └── PRIVACY.md         # Privacy policy for users
│
└── old-code/              # Archive existing school-focused code
    └── (move all existing files here for reference)
```

---

## 🎯 Success Metrics (Week 1 Test)

**Goal:** Validate journalist demand

**Metrics:**
1. Build MVP (40 hours max)
2. Email 20 journalists/Substackers
3. Get 5+ to install and try
4. Get 3+ to publicly embed badge
5. Ask: "Would you pay $5/month?"

**If YES → build payment, scale**
**If NO → pivot to schools (use existing Blue Book code)**

---

## 🔄 What We Salvage from Existing Code

**KEEP (copy to new utils/):**
- ✅ `content.js` lines 78-151: Loki biometric analysis (cognitive ratio algorithm)
- ✅ `crypto-utils.js`: ECDSA signature code
- ✅ `passport-utils.js`: Passport tracking logic
- ✅ Badge format/structure
- ✅ Verification certificate display

**DISCARD (only needed for schools):**
- ❌ `writer.html` (standalone editor)
- ❌ `admin.html` (teacher dashboard)
- ❌ Lockdown mode logic
- ❌ Exam timer features
- ❌ Teacher proctoring

---

## 💰 Business Model (Post-MVP)

### **Free Tier:**
- 5 signed articles/month
- Basic badge
- Public verification page

### **Pro Tier ($10/month):**
- Unlimited signed articles
- Custom badge styling
- Portfolio page (jitter.com/@yourname)
- Priority verification
- API access

### **Platform Tier ($500-5K/month):**
- White-label verification
- Bulk API for publications (NYT, Atlantic, etc.)
- Team accounts
- Advanced analytics

---

## 🚦 Go/No-Go Decision (Week 2)

**After journalist testing, decide:**

**GO signals (continue with journalist market):**
- 3+ journalists say "I'd pay $5-10/month"
- 5+ publicly embed badge
- Press interest (Product Hunt, Hacker News upvotes)
- Use case clarity emerges

**NO-GO signals (pivot to schools):**
- 0 journalists willing to pay
- "Nice idea, don't need it" feedback
- No public embedding
- Can't articulate clear value prop

**If NO-GO:** Return to existing Blue Book code, focus on school market (slower but more certain revenue)

---

## 🎯 Why This Will Work (Or Fail Fast)

**Advantages:**
1. **Simple MVP:** Can ship in days
2. **Low friction:** Zero workflow change
3. **Clear value:** Proof of human authorship
4. **Timing:** AI crisis accelerating
5. **Novel approach:** Nobody doing "C2PA for text"

**Risks:**
1. Nobody cares about proving human authorship
2. Journalists say "nice to have" not "must have"
3. Platform adoption required for network effects
4. Chicken-egg problem (need users AND verifiers)

**The Test:**
Build it in 1 week. Show 20 journalists. If 3+ care, keep going. If 0 care, pivot to schools.

**Cost:** 40 hours of work
**Downside:** Waste a week
**Upside:** Validate billion-dollar idea for cost of weekend project

---

## 📋 Next Steps (RIGHT NOW)

1. ✅ **Document this architecture** (DONE - this file)
2. Move existing code to `old-code/` folder
3. Create new clean extension structure
4. Build content script tracker (4 hours)
5. Build badge generator (4 hours)
6. Build verification page (4 hours)
7. Test on Medium/Google Docs (2 hours)
8. Find 20 journalists to email (2 hours)

**Total: 1 week to launch or learn**

---

**Let's start fresh and ship fast.**
