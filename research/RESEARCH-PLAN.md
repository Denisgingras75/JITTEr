# Jitter Research Plan
Last updated: 2026-03-02

Two tracks running in parallel. Terminal agents handle synthesis. You handle fact-finding on Claude.ai/Perplexity where current data matters.

---

## TRACK 1: Terminal Agents (running now)
Already dispatched. They synthesize, organize, model. No internet needed.

## TRACK 2: Claude.ai / Perplexity (you, when you have 20 min)
Copy-paste these prompts. Drop findings into the research folders. Agents will integrate next round.

---

### Session 1: C2PA + Camera Reality Check (~10 min)
**Use: Perplexity (needs current sources)**

> Which cameras currently ship with C2PA content credentials built in as of 2026? Include Leica, Sony, Nikon, Canon. Do any smartphone cameras (iPhone, Pixel) support content authenticity signing? What is the current state of the C2PA standard adoption?

Drop findings into: `research/video-provenance/camera-signing.md`

---

### Session 2: Hall Effect Keyboard APIs (~10 min)
**Use: Perplexity or Claude.ai with web search**

> What Hall Effect keyboards are available in 2026? (Wooting, SteelSeries Apex Pro, Rapt, others) Do any expose analog key travel data via USB HID or API? Can web browsers access Hall Effect analog values through WebHID API? Show me a working WebHID code example for reading from a keyboard.

Then:

> What data does the PS5 DualSense controller expose through the Web Gamepad API? Specifically: adaptive trigger resistance, haptic feedback, gyroscope, accelerometer. Can a web app read force/pressure data from DualSense?

Drop findings into: `research/hall-effect-gaming/hall-effect-keyboards.md` and `gaming-controllers.md`

---

### Session 3: Competitive Intel (~10 min)
**Use: Perplexity**

> What is TypingDNA doing in 2025-2026? Are they still active? What's their latest product? Same for BioCatch — what's their current focus? Any new startups doing keystroke biometrics or behavioral authentication?

> What is the current state of bot detection on Reddit, Yelp, and Google Reviews? What tools do they use? What's failing?

Drop findings into: `research/integration/competitive-landscape.md` (update existing)

---

### Session 4: Patent Prior Art (~15 min)
**Use: Google Patents (patents.google.com)**

Search these queries:
- `keystroke biometrics continuous authentication`
- `typing pattern identity verification`
- `behavioral biometric content provenance`
- `keyboard force curve user authentication`
- `cross-site behavioral identity passport`

For each relevant patent: title, patent number, filing date, key claims, and how Jitter differs.

Drop findings into: `research/algorithm/prior-art.md` (new file)

---

### Session 5: Browser Extension Policies (~10 min)
**Use: Claude.ai with web search**

> What are the current Chrome Web Store policies for extensions that monitor keyboard input? What permissions are required? Has Google rejected or removed any keystroke-monitoring extensions recently? What about Firefox Add-ons policies?

> How does Brave browser handle native integrations vs extensions? Is there a partner program or API for built-in features?

Drop findings into: `research/extension/browser-apis.md`

---

### Session 6: Mobile Biometrics Reality (~10 min)
**Use: Perplexity**

> What touch/tap biometric data can a mobile web app access in 2026? Specifically: touch pressure (Force Touch / 3D Touch — is it still available?), accelerometer during typing, gyroscope data. What about native iOS/Android apps vs Progressive Web Apps — what sensor access differs?

> Are there any existing mobile keystroke biometric implementations? Academic papers or commercial products?

Drop findings into: `research/algorithm/mobile-biometrics.md`

---

### Session 7: Education Market (~10 min)
**Use: Claude.ai or Perplexity**

> How does Turnitin detect AI-generated text in 2026? What's their accuracy rate? What are the known failure modes? How much do schools pay per student?

> Are there any products that verify a student TYPED their own essay (not AI detection, but authorship verification via biometrics)? What's the gap in this market?

Drop findings into: `research/integration/education-market.md` (new file)

---

### Session 8: EU AI Act + Regulatory (~10 min)
**Use: Perplexity**

> What does the EU AI Act (effective August 2026) require for AI-generated content labeling? Does it create regulatory demand for proof-of-humanity tools? What about the US — any federal or state legislation on bot disclosure or AI content labeling?

Drop findings into: `research/integration/regulatory-landscape.md` (new file)

---

## After Each Session
1. Save findings to the right research folder
2. Don't worry about formatting — terminal agents will clean up next dispatch
3. Add a note at the top: `Source: [Perplexity/Claude.ai] [date] [your search query]`
4. Terminal agents read these raw notes and integrate into structured docs

## Next Agent Dispatch (after you've done 3-4 sessions above)
Dispatch agents again with: "Read INDEX.md. Read all files in your domain folders. There are NEW raw findings from web research — integrate them into the existing docs. Update INDEX.md when done."

That's the compound loop: you find facts, agents structure them, you find more facts, agents go deeper.
