# JITTEr Vision Board
### How We Get There

**Author:** Denis Gingras
**Date:** February 2026
**Copyright © 2025-2026 Denis Gingras. All Rights Reserved.**

---

> This is the execution doc. JITTER_FOUNDATIONS.md is the *what* and *why*.
> This is the *how* and *when*.

---

## Where We Are (February 2026)

**What exists:**
- Core biometrics engine (Loki) — working
- Passport accumulation — working
- ECDSA signing — working
- Suspicion scoring — working
- Teacher verify dashboard — exists but doesn't actually verify signatures
- Chrome extension shell — functional

**What's broken:**
- verify.html doesn't check signatures (anyone can forge a badge)
- Three incompatible badge formats
- Suspicion score not included in badges
- Firebase cloud sync has placeholder config
- Zero tests

**What doesn't exist yet:**
- The blue link (shareable verification URL)
- The JITTEr Score (unified 0-100 number)
- The embeddable widget
- The verification API
- The platform dashboard
- Any paying customer

**Honest grade: 4/10 implementation, 9/10 idea.**

---

## The Path: Five Stages

```
Stage 1: FIX THE CORE          ← Make what exists actually work
Stage 2: THE BLUE LINK          ← One shareable URL per badge
Stage 3: THE CREATOR LAUNCH     ← Writers, journalists, influencers adopt
Stage 4: THE WIDGET              ← Platforms embed JITTEr
Stage 5: THE NETWORK             ← Passports become internet credentials
```

Each stage is independently valuable. You don't need Stage 5 for Stage 2 to matter.

---

## Stage 1: Fix the Core

> **Goal:** Make the existing extension trustworthy and honest.

### What to do:

**1. Fix verification (THE blocker)**
- Call `verifyBadge()` from crypto-utils.js in verify.html
- Show "SIGNATURE INVALID" for unsigned/forged badges
- Show "Badge Decoded" until crypto passes, then "Badge Verified"
- This is ~20 lines of code. It makes the entire product real.

**2. Unify badge format**
- One format: the v2.0 spec from JITTER_FOUNDATIONS.md Section 12
- content.js mints it. writer.js mints it. verify.html reads it.
- Kill the flat format. Kill the old nested format. One format.

**3. Include suspicion score in badges**
- Both content.js and writer.js must pull suspicionScore from passport and embed it
- verify.html already reads it — it just always gets 0 right now

**4. Strip dead weight**
- Remove auth-utils.js (500 lines of broken Firebase). Cloud sync is a Phase 3 feature.
- Remove writer.html essay mode aspirations. The extension should work on ANY text field.
- Remove console.logs from production code

**5. Add the JITTEr Score**
- Composite 0-100 score combining entropy + suspicion + passport age + session stats
- This number goes in the badge, on the verify page, everywhere
- People understand one number. They don't understand cognitive ratio.

### What this produces:
- A Chrome extension that works on any webpage
- Badges that are cryptographically signed and verifiable
- A verify page that actually catches forgeries
- One clean number (JITTEr Score) that means something

### Effort: 1-2 weeks focused work.

---

## Stage 2: The Blue Link

> **Goal:** Every badge gets a shareable URL that anyone can click.

### What to build:

**1. A static verification page**
```
verify.jitter.so/badge/{hash}
```
- Hosted on Vercel or Netlify (free tier)
- Takes a badge hash in the URL
- Displays: JITTEr Score, session summary, passport summary
- Clean, mobile-friendly, one page
- No account needed to view

**2. Badge-to-URL flow in the extension**
- User mints badge → extension generates the verification URL
- URL is copied to clipboard alongside the badge data
- User pastes it anywhere: tweet, blog, email signature, Reddit comment

**3. The verification page design**
```
┌─────────────────────────────────────────┐
│  ⚡ JITTEr Verified                      │
│                                          │
│  Score: 87 / 100  ·  Trusted Human       │
│  ████████████████░░░░                    │
│                                          │
│  Session                                 │
│  ────────────────────────                │
│  612 words · 22 min · 100% hand-typed    │
│  34 edits · Natural rhythm confirmed     │
│                                          │
│  Writer History                          │
│  ────────────────────────                │
│  107-day account · 34 sessions           │
│  Advanced level · 57K career keystrokes  │
│                                          │
│  Cryptographic proof: ✅ Valid            │
│  Signed: Feb 23, 2026 at 3:47 PM        │
│                                          │
│  ─────────────────────────────────       │
│  What is JITTEr? → jitter.so             │
│  Get verified → Chrome Web Store link    │
└─────────────────────────────────────────┘
```

**4. Where the badge data lives**
Two options:
- **Option A: Badge data encoded in the URL itself** (no server needed, URL is long)
  `verify.jitter.so/#eyJ2ZXJzaW9uIjoiMi4wIi...`
- **Option B: Badge stored server-side, short URL**
  `verify.jitter.so/badge/a3f9e2` → server looks up badge

**Start with Option A.** Zero infrastructure. The entire badge is in the URL hash. The verification page is a static site that reads the hash and renders it. No database, no server, no cost.

Move to Option B when badge URLs need to be short (for tweets, bios).

### What this produces:
- A link anyone can share that proves their writing is human-verified
- Free marketing — every shared link promotes JITTEr
- The "blue link" that creators put in their posts

### Effort: 1 week (it's a static page + extension update).

---

## Stage 3: The Creator Launch

> **Goal:** Get writers, journalists, and influencers using JITTEr voluntarily.

### The pitch:

**For journalists:**
> "Prove your articles are human-written. Add a JITTEr link to your byline."

**For newsletter writers:**
> "Your subscribers want to know you're real. JITTEr proves it."

**For influencers:**
> "Brands pay more for verified authentic content. JITTEr is your proof."

**For reviewers:**
> "Your reviews carry more weight with a ⚡ JITTEr Verified badge."

### How to get the first 100 creators:

**1. Direct outreach (Week 1-2)**
- Find 20 Substack writers who've publicly complained about AI content
- Find 10 journalists who've written about AI detection problems
- Find 10 tech YouTubers/bloggers who review products
- DM them: "I built this. It proves you wrote your own content. Free. Try it."

**2. Content marketing (Week 2-4)**
- Write a Substack post: "I Built a Blue Checkmark for Writers" (using JITTEr, obviously)
- Post on Hacker News: "Show HN: Keystroke biometrics to prove human authorship"
- Post on Reddit r/journalism, r/Substack, r/blogging
- Each post includes a JITTEr badge link — proof that the post itself is human-written

**3. The self-reinforcing loop**
- Every creator who adds a JITTEr link to their post is advertising JITTEr
- Readers click the link → see the verification page → "What is this?" → install
- New installs grow the passport network
- Bigger network makes the credential more valuable

### Key metric: 100 creators sharing JITTEr links within 60 days.

### Effort: Ongoing marketing, not engineering. The product is built in Stages 1-2.

---

## Stage 4: The Widget (B2B)

> **Goal:** Platforms embed JITTEr in their review/comment forms.

### What to build:

**1. The JavaScript widget**
```html
<script src="https://cdn.jitter.so/widget.js"></script>
```
- Auto-attaches to textareas
- Monitors typing in real-time
- Mints a badge when the form is submitted
- Injects a hidden field with the badge data

**2. The verification API**
```
POST https://api.jitter.so/v1/verify
Authorization: Bearer sk_live_xxxx
Body: { "badge": "base64..." }
Response: { "valid": true, "score": 87, "bot_detected": false, ... }
```

**3. The platform dashboard**
- Sign up → get API keys → see usage stats
- "847 bots blocked this month" — the number that makes them stay
- Embed snippet copy-paste
- Billing (manual invoicing first, Stripe later)

**4. The super-admin (Denis's view)**
- All customers, all usage, MRR, churn
- Built alongside the customer dashboard (same React app)

### Who to target first:
1. **WGH** (you own it — perfect testbed)
2. **One local news site** (journalists already using JITTEr from Stage 3)
3. **One review platform** (approach smaller Trustpilot competitors first)

### Pricing:
| Tier | Price | Verifications/mo |
|---|---|---|
| Free | $0 | 1,000 |
| Starter | $49/mo | 50,000 |
| Business | $199/mo | 500,000 |
| Enterprise | Custom | Unlimited |

### Key metric: First paying customer.

### Effort: 4-6 weeks for widget + API + dashboard.

---

## Stage 5: The Network

> **Goal:** JITTEr passports become internet-wide credentials.

This is the endgame. When enough people have passports and enough platforms check them, the passport becomes a portable trust credential — like a credit score for writing authenticity.

### What this looks like:
- Public passport profiles: `jitter.so/@denis` → shows stats, no content
- Trust tiers visible everywhere:
  - ✅ Verified Human (30+ days, low suspicion)
  - 🔷 Established Human (90+ days)
  - ⭐ Trusted Contributor (180+ days, Advanced+)
- Cross-platform reputation: your JITTEr passport follows you from Substack to Reddit to Yelp
- Anomaly detection: "This account submitted 28 reviews today" → automatic flag
- Sybil resistance for DAOs/voting: one passport = one human = one vote

### The flywheel at full speed:
```
More users install extension
  → Passport network grows
  → Passports become more valuable (longer history)
  → More platforms want to verify against the network
  → More platforms embed the SDK
  → More reasons to install the extension
  → Loop
```

### This is the "typing credit bureau."

### Key metric: Passports recognized by 10+ platforms.

### Effort: 6-12 months after Stage 4. This is the marathon, not the sprint.

---

## The Timeline (Realistic)

```
NOW ──────────────────────────────────────────────────────────►

Feb-Mar 2026          Mar-Apr 2026        Apr-Jun 2026
┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│  STAGE 1     │     │  STAGE 2     │    │  STAGE 3     │
│  Fix Core    │────►│  Blue Link   │───►│  Creator     │
│  2 weeks     │     │  1 week      │    │  Launch      │
│              │     │              │    │  Ongoing     │
└──────────────┘     └──────────────┘    └──────────────┘

Jun-Aug 2026                    Sep 2026+
┌──────────────┐               ┌──────────────┐
│  STAGE 4     │               │  STAGE 5     │
│  Widget +    │──────────────►│  Network     │
│  B2B API     │               │  Growth      │
│  6 weeks     │               │  Ongoing     │
└──────────────┘               └──────────────┘
```

---

## What We're NOT Doing (Scope Discipline)

Things that sound good but are distractions right now:

- **Mobile app** — the Chrome extension covers laptops/desktops where writing happens
- **AI content detection** — we verify process, we don't analyze content. Stay in our lane.
- **Built-in editor (writer.html)** — the extension should work on ANY text field. Don't build a writing app.
- **Firebase cloud sync** — local-first is fine for now. Cloud sync is Stage 4+ when there's a server
- **Essay proctoring mode** — that's surveillance. We're building trust badges, not proctoring software.
- **Partnerships with big platforms** — they'll come to us when the creator network is big enough. Don't chase Yelp on day 1.

---

## The One Question That Decides Everything

> **"Would a creator voluntarily put this on their content?"**

If the answer is yes — the product works. If the answer is no — we built the wrong thing.

Teachers can be forced to use tools. Creators can't. The creator market is the true test. If journalists and writers *want* to prove they're human, and *want* to share the blue link, everything else follows.

Build for the creator who wants to flex their humanity. The institutions will follow.

---

## Success Milestones

| Milestone | Target | What It Proves |
|---|---|---|
| verify.html catches a forged badge | Week 1 | The product is real |
| First blue link shared in the wild | Week 3 | The distribution model works |
| 100 creators using JITTEr links | Month 2 | Creators want this |
| First platform embeds the widget | Month 4 | B2B has demand |
| First paying customer | Month 5 | Business model works |
| 1,000 passports aged 30+ days | Month 6 | Network is growing |
| "JITTEr Verified" recognized by readers | Month 8 | Brand is forming |
| 10 platforms integrated | Month 12 | Protocol is emerging |

---

## Cost to Get There

### Stage 1-2 (Fix Core + Blue Link): ~$0
- Extension update: free
- Static verification page on Vercel: free
- Domain (jitter.so): ~$30/year

### Stage 3 (Creator Launch): ~$0 (sweat equity)
- Direct outreach: free
- Content marketing: free (write posts, use JITTEr to verify them)
- Chrome Web Store listing: $5 one-time

### Stage 4 (Widget + API): ~$20-50/month
- Vercel serverless functions: free tier → ~$20/month
- Supabase for platform dashboard: free tier → ~$25/month
- Domain + SSL: already have it

### Stage 5 (Network Growth): scales with revenue
- Infrastructure scales with paying customers
- 10 Starter customers = $490/month MRR → covers all infrastructure
- 5 Business customers = $995/month MRR → profitable

**Total cash needed to reach first paying customer: under $100.**

---

*The idea is worth 9/10. The code is 4/10. The gap is fixable. Fix the core, ship the blue link, let creators carry it forward.*

*© 2025-2026 Denis Gingras. All Rights Reserved.*
