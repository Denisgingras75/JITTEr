# Competitive Landscape: Keystroke & Behavioral Biometrics
## Jitter Protocol — Patent Filing Research
**Date:** 2026-03-01
**Purpose:** Prior art survey, competitive differentiation, patent claim framing

---

## 1. TypingDNA

**Website:** https://www.typingdna.com
**Founded:** 2015 (Bucharest, Romania)
**Status:** Active and independent as of early 2026. No acquisition. Recognized as Sample Vendor in Gartner Hype Cycle for Digital Identity 2025 and Gartner Hype Cycle for Fraud and Financial Crime Prevention 2025.

### What They Capture
TypingDNA captures purely **software-layer timing data** — no hardware sensor data:
- **Dwell time** (key hold duration) per character
- **Flight time** (inter-key latency between keyup and keydown of successive keys)
- Typing speed (characters per minute)
- Typing pattern vector encoded as an array of dwell/flight duration pairs

They explicitly do NOT capture: key force, actuation depth, pressure, acoustic signature, or any sub-millisecond physical mechanics.

### Pattern Types
Two core pattern modes:
- **SameText (type:2)** — User types a fixed phrase (min ~20-30 chars). Highest accuracy. Recommended for authentication. Works like a passphrase with a biometric layer.
- **AnyText** — Free-form typing, requires 140+ characters, lower accuracy. Deprecated / not recommended.

### Products
1. **Authentication API** — RESTful. Enrolls typing patterns and compares against stored profiles. Minimum 1 prior enrollment required. Returns match score JSON.
2. **Verify 2FA** — Drop-in 2FA replacement that uses typing a fixed phrase instead of an SMS OTP.
3. **ActiveLock 3.5 Fortress** (launched Feb 2025) — Continuous endpoint authentication for desktops. Evaluates user identity every 10 seconds. Multi-modal: adds mouse behavior and face recognition on top of typing.
4. **ForgeRock integration nodes** — GitHub-published, enterprise SSO integration.

### Accuracy Claims
TypingDNA claims accuracy "comparable to fingerprint and face recognition" as of December 2024, with a new AI engine. However, they acknowledge that their system offers three tunable operating points: lowest FRR (user-friendly), lowest FAR (high security), or balanced. They do not publish a specific EER figure in public materials. Academic skepticism exists around extreme accuracy claims in the field generally — any EER below ~2% should be treated cautiously without independent benchmarking.

### Pricing
- **Free developer tier:** Up to 100 users/month
- **Pro:** ~$0.20/user/month, billed to credit card
- **Enterprise:** Custom pricing
- **ActiveLock:** Separate pricing at https://www.typingdna.com/pricing/activelock

### Funding
- $1.5M seed (2019, GapMinder Venture Partners)
- $7M Series A (Jan 2020, led by Gradient Ventures / Google)
- **Total: $8.82M raised. No Series B on record.**
- Investors include Google's AI-focused fund, Credo Ventures, AI Venture Labs.

### Customers
ProctorU (online proctoring), Webhelp, Optimal IdM. Targets financial services, healthcare, education.

### Where Jitter Is Different
- TypingDNA captures only timing (dwell/flight). **Jitter captures physical hardware signal data** — actuation depth, Hall effect sensor analog values, inter-switch timing at sub-millisecond resolution. This is a fundamentally different signal layer.
- TypingDNA requires fixed-text enrollment for best results. Jitter can operate on **any free text** because the signal is in the hardware mechanics, not just timing statistics.
- TypingDNA does not use keyboard firmware/hardware integration. Jitter's model involves the switch itself as a sensor.
- TypingDNA operates at the OS/browser JavaScript event layer. Jitter operates below the OS input stack.

---

## 2. Turnitin Clarity

**Website:** https://www.turnitin.com/products/feedback-studio/clarity
**Announced:** March 4, 2025 (SXSW EDU)
**GA:** Q3 2025 (paid add-on to Turnitin Feedback Studio)
**Status:** Active and commercially shipping. Named to TIME's Best Inventions of 2025.

### What They Capture
Clarity is **not a biometric identity system** — it is a **writing process provenance tool**. What it records:
- Revision history / draft history (every auto-saved version)
- Video playback of the writing process
- Paste events (flags text pasted into the editor vs. typed)
- Typing vs. non-typing time (active writing time vs. total elapsed time)
- AI tool usage history (which AI tools were consulted in the browser)
- Typing patterns as a qualitative signal (not used for identity verification — used for behavioral flags)

Clarity does **not** compute a biometric identity signature. It records process metadata, not a person's unique biometric fingerprint.

### How It Works
Integrated as a browser-based writing environment within Turnitin Feedback Studio. Students write inside the Clarity editor, which logs keystrokes, timing, paste events, and version history to Turnitin's servers. Instructors review a dashboard showing draft history timeline, playback, and flags. It does not require a separate app or extension — it is web-based.

### Business Model
- Add-on license to Turnitin Feedback Studio (institutional contracts)
- Not sold standalone
- Pricing not publicly disclosed; institutional/B2B only

### Reception
Mixed. Positive: TIME recognition, strong adoption signal for academic integrity. Negative: student privacy concerns echo Turnitin's prior AI detection backlash (where false positives punished legitimate students). Privacy policy states anonymized student data may be used to improve the AI assistant — controversial in education contexts.

### Where Jitter Is Different
- Clarity is about **provenance** (did you write this yourself over time?). Jitter is about **identity** (is the person typing the person they claim to be?).
- Clarity cannot answer "is this the same person as last time?" — it only records what happened, not who did it.
- Jitter could theoretically be layered with Clarity: Clarity proves a document was typed live; Jitter proves the typist's identity matches an enrolled profile.
- Clarity is locked to an LMS/education context. Jitter is infrastructure-level and application-agnostic.
- **Key gap Jitter fills:** Authorship identity verification across sessions, not just within a single writing session.

---

## 3. BioCatch

**Website:** https://www.biocatch.com
**Founded:** 2011 (Tel Aviv, Israel)
**Status:** Acquired by Permira private equity for **$1.3 billion** in May 2024. Independent operating entity.
**Revenue:** $160M ARR as of June 2025 (up from $145M in 2024). Record $40M+ new sales in FY2024.

### What They Capture
BioCatch tracks **3,000+ behavioral and contextual signals** across a user session. Key signal categories:
- **Physical interaction:** Mouse movements, mouse drift, typing cadence, swipe patterns, scroll behavior
- **Cognitive signals:** Hesitation patterns, segmented typing, field-correction behavior
- **Device behavior:** Device orientation, how the device is held, pressure points
- **Session-level context:** Navigation patterns, transaction timing, anomaly vs. baseline deviation
- **Network-level:** Behavioral signals shared across the BioCatch Connect 2.0 network of 555M+ protected users

BioCatch processes **16+ billion user sessions per month** across **1.6 billion devices**, protecting 555M banking customers globally.

### Technology Moat
The network effect is their moat. BioCatch Connect 2.0 is a financial crime intelligence-sharing network — when fraud is detected on one bank's user, the behavioral signal is anonymized and shared across the network, improving detection for all members. In Q3 2025 alone, the network uncovered $60M in attempted fraud from 180M+ payments worth $330B. In 2024, it stopped an estimated $3.7B in fraud.

### Business Model
Enterprise SaaS. B2B only. Sold to banks, payment processors, telcos. Not available to developers via a self-serve API. Minimum contract sizes are enterprise-scale.

### Where Jitter Is Different
- BioCatch is fraud detection at session/behavioral level, not biometric identity verification at the keystroke hardware level.
- BioCatch does not produce a persistent identity token for a user — it produces a risk score for a session.
- BioCatch requires a large behavioral corpus per user before anomaly detection is meaningful. Jitter is designed for **cold-start identity** — identification from the first few keystrokes.
- BioCatch is banking/enterprise-only. Jitter is designed as a developer-accessible protocol.
- BioCatch does not capture hardware-level physical keystroke mechanics. Their "typing cadence" is purely software-layer timing.
- **Key gap:** No lightweight API for developers. No hardware biometric signal. No cross-device portability of identity signature.

---

## 4. BehavioSec (now LexisNexis Risk Solutions)

**Original company:** BehavioSec AB, founded 2008 in Luleå, Sweden
**Acquisition:** Acquired by LexisNexis Risk Solutions (part of RELX Group) in **May 2022**. Terms undisclosed.
**Current status:** Fully absorbed into LexisNexis Risk Solutions as the BehavioSec product line. Available at: https://risk.lexisnexis.com/products/behaviosec

### What They Captured (and still capture)
BehavioSec pioneered separating browser-based and mobile behavioral biometrics:
- **Desktop/web:** Keystroke timing (dwell, flight), mouse movements, typing rhythm, browser interaction patterns
- **Mobile:** Touchscreen swipe dynamics, tap pressure (estimated via touch area), device tilt/gyroscope data, multi-touch patterns
- **Session anomaly detection:** Deviation from established user behavioral baseline

BehavioSec's differentiation pre-acquisition was their mobile touchscreen behavioral layer — converting complex touchscreen sensor data into behavioral features was technically harder than keyboard-only approaches.

### Post-Acquisition State
Integrated into LexisNexis ThreatMetrix platform. The combined product offers: BehavioSec's behavioral biometrics + ThreatMetrix's browser/device fingerprinting + LexisNexis identity data assets. No longer an independent product. Sold only through LexisNexis enterprise channels.

### Where Jitter Is Different
- BehavioSec/LexisNexis captures timing and touch surface data — still software-layer inference, not hardware physics.
- The acquisition locks the technology inside a massive enterprise bundle. No developer API access.
- Jitter operates at the keyboard hardware physics level (Hall effect sensor data, actuation curves) — a signal type BehavioSec never addressed.
- **Key gap:** BehavioSec has no story for mechanical keyboard users, Hall effect switches, or sub-OS signal capture.

---

## 5. KeyTrac

**Website:** https://www.keytrac.net
**Status:** INACTIVE as of approximately 2024 (Tracxn classifies as inactive, last data November 2024). Website remains live.
**Funding:** None raised. ~7 employees at peak.

### What They Captured
Keystroke dynamics only — dwell time, flight time, typing speed. Standard timing-based approach. Offered:
- RESTful API with a match-score output
- Free tier: 2 users
- Paid tier: Per-user monthly pricing

The API computed a match score by comparing a new typing sample against stored profile vectors.

### Competitive Gap
A small, unfunded, now-inactive project that validated the market demand for a developer-accessible keystroke biometrics API. Confirms that TypingDNA has become the default choice, and that this space has limited viable alternatives for developers. Jitter's developer-focused API approach is directly in the gap KeyTrac vacated.

---

## 6. UnifyID (acquired by Prove)

**Original company:** UnifyID, Redwood City, CA
**Status:** Acquired by **Prove** (phone-number-based identity company). Operating as Prove's Mobile Behavioral Biometrics product.

### What They Captured
UnifyID's approach was broader than pure keystroke dynamics — it was an **implicit authentication** platform:
- Gait patterns (accelerometer data while walking)
- Location patterns (habitual location clusters)
- WiFi network patterns (known networks as identity signal)
- Keystroke/typing behavior
- Driving patterns

The theory: no single signal, but a fusion of ambient behavioral and environmental signals creates a passive identity proof.

### Where Jitter Is Different
- UnifyID's model required persistent device access and ambient sensor monitoring — a very high-friction privacy ask.
- UnifyID's typing signal was one of many inputs, not the primary biometric.
- Prove's focus is phone number identity verification — UnifyID's technology appears to serve that use case, not standalone biometric auth.
- Jitter is purely keystroke-focused but at a deeper hardware layer than UnifyID ever reached.

---

## 7. Plurilock Security

**Website:** https://plurilock.com
**Status:** Active. Publicly traded (TSX-V: PLUR). Growing enterprise traction in 2025.
**Notable contracts:** U.S. Army NETCOM continuous authentication deployment; multiple U.S. Department of Defense contracts; financial services clients.

### What They Capture
Plurilock BioTracker focuses on **continuous endpoint authentication**:
- Keystroke dynamics (dwell, flight, typing rhythm)
- Mouse movement patterns
- Device hold orientation
- Application usage patterns

The model: continuously re-authenticates the authorized user in the background during a work session. If typing/mouse behavior shifts (indicating a different person took over the keyboard), it raises an alert or locks the session.

### Business Model
Enterprise SaaS, specifically for government, defense, and regulated industries. Not a developer API play.

### Where Jitter Is Different
- Plurilock is an enterprise security product requiring IT deployment. Jitter is designed as an embeddable protocol.
- Plurilock does not capture hardware-level physical keystroke data.
- Plurilock's use case is "is the authorized employee still at the keyboard?" — session continuity. Jitter's use case includes cold-start identity from zero prior context.
- **Key gap:** No self-serve developer access. No hardware signal depth.

---

## 8. Typing.AI

**Website:** https://typing.ai
**Status:** Active small player. Featured on Hacker News (Show HN) in 2022. Limited public information about traction or funding.

### What They Capture
Standard keystroke timing: typing speed, keypress duration, inter-key latency. Claims "no false positives" and generates a unique "Typing ID" per user using AI/ML. API-first approach similar to TypingDNA but appears to be an earlier-stage company.

### Where Jitter Is Different
Same differentiation as TypingDNA — software timing only, no hardware physics signal.

---

## 9. Neuro-ID (acquired by Experian)

**Website:** https://www.neuro-id.com
**Status:** Acquired by **Experian** approximately 2024-2025. Operating within Experian's fraud detection stack.

### What They Capture
Neuro-ID's focus was **form interaction behavioral biometrics** — reading intent signals from how users fill out digital forms:
- Typing hesitation (pauses mid-field)
- Copy/paste vs. typed entry detection
- Field navigation order
- Correction and backspace patterns
- Mouse movement hesitation before field entry
- Typing rhythm consistency vs. scripted/bot behavior

The thesis: a real human filling out their own information shows organic hesitation, correction, and variable timing. Bots and fraud ring operators show robotic consistency. Neuro-ID was designed to distinguish humans from bots and genuine users from synthetic identities.

### Where Jitter Is Different
- Neuro-ID is about liveness detection and fraud signal, not persistent identity. It asks "is this a real human?" not "is this the specific human who enrolled?"
- Neuro-ID does not produce a portable identity token or biometric profile.
- Jitter produces a stable hardware-physical identity signature that persists across sessions and applications.
- **Key gap:** No cross-session identity continuity. No hardware signal layer.

---

## 10. Gaming Anti-Cheat: Hall Effect Keyboards (Wooting, Razer)

**Wooting:** https://wooting.io — Wooting 60HE, 80HE
**Razer:** Huntsman V3 Pro TKL (Hall effect / analog)

### Current State (Anti-Cheat Context)
Hall effect keyboards (HE keyboards) measure **actual magnet position** of each key at any point in its travel — providing a continuous analog value (0.0mm to 4.0mm typical) rather than a binary on/off. This gives sub-0.1mm position resolution at sub-millisecond polling rates.

Current anti-cheat use of HE data: **none for identity**. Gaming anti-cheat (Vanguard, EAC, BattlEye) uses hardware fingerprinting (disk serials, MAC address, motherboard UUID) for identity, not behavioral biometrics. Vanguard monitors keystrokes and mouse inputs to detect inhuman timing (macro/script detection), but this is cheating detection, not identity verification.

The HE keyboard controversy is about competitive features (Rapid Trigger, SOCD/Snap Tap) — Valve banned SOCD in CS2. No public research or commercial product uses Hall effect sensor curves as a biometric identity signal.

**This is an open field. No prior art on Hall effect sensor curves as a biometric identity signature exists in commercial products.**

### What Jitter Represents in This Context
- HE keyboards provide physical actuation depth, velocity, and curve shape per keystroke — far richer than timing alone.
- The actuation curve (how fast a key travels through its range, where it pauses, how it rebounds) is unique to the person pressing it.
- No commercial anti-cheat system, no identity company, and no academic paper (known as of early 2026) has claimed this signal space.

---

## 11. Academic / Open Source

### GitHub Ecosystem
The `keystroke-dynamics` GitHub topic contains dozens of academic projects, almost all:
- Python or Java implementations
- Using CMU Keystroke Benchmark Dataset (51 users, 400 repetitions of `.tie5Roanl`)
- Focused on password-based fixed-text authentication
- Machine learning approaches: SVM, k-NN, RNN, CNN, increasingly Transformer-based (2024-2025)
- Star counts: most 5-50 stars — research-grade, not production

Notable academic milestone: ACM Computing Surveys published "Keystroke Dynamics: Concepts, Techniques, and Applications" (2025) — a comprehensive state-of-the-art review. Transformer architectures are now state-of-the-art, achieving near-perfect accuracy on fixed-text benchmarks with deep learning.

### Hardware Sensor Research (2024-2025)
- **Science Advances (2025):** "A flexible pressure sensor array for self-powered identity authentication during typing" — uses giant magnetoelastic effect to convert key press mechanical pressure into electrical signals. Claims 100% recognition accuracy on their test set. This is research-grade, not commercial, and uses embedded sensor keyboards, not off-the-shelf HE keyboards.
- **ScienceDirect (2025):** Piezoelectric-triboelectric coupling sensor for keystroke pattern recognition — academic, not commercial.

### Key Academic Gap
Academic work on hardware-level biometrics requires custom sensor keyboards. **No academic project has studied authentication using data from commercially available Hall effect keyboards (Wooting, Razer) via their existing analog switch readout.**

---

## 12. Browser Extension Landscape

### What Exists
- No keystroke biometric identity extension in the Chrome Web Store as of early 2026.
- Privacy/anti-tracking extensions exist that **block** keystroke timing collection (Whonix documentation warns users about typing deanonymization; a 2015 Chrome extension by researchers attempted to add timing noise).
- General browser fingerprinting detectors (DFPM on GitHub) exist but do not focus on typing.
- TypingDNA's recorder is a JavaScript library meant to be embedded by web developers — not a standalone extension.

### Opportunity
A Chrome extension that collects the Jitter biometric signal (hardware-level typing data, if accessible via browser APIs or a companion driver) and provides authentication services does not exist. The closest is TypingDNA's embedded JS recorder, which is drop-in code for developers, not a user-installed extension.

---

## Summary Comparison Table

| Company | Signal Layer | Metrics Captured | Hardware Depth | Identity vs. Fraud | Developer API | Status (2026) | Acquirer/Moat |
|---|---|---|---|---|---|---|---|
| **TypingDNA** | Software (JS events) | Dwell, flight, speed | None | Identity (auth) | Yes, self-serve | Active, independent | $8.8M raised, Gartner-recognized |
| **Turnitin Clarity** | Software (browser editor) | Draft history, paste events, writing time | None | Process provenance | No (LMS only) | Active, shipping | Turnitin (edu incumbent) |
| **BioCatch** | Software (web/app SDK) | 3,000+ signals: mouse, typing cadence, device tilt, cognitive | None | Fraud scoring | No (enterprise only) | Active, $1.3B valuation | Permira; network effect moat |
| **BehavioSec** | Software (web + mobile touch) | Keystroke timing, swipe dynamics, gyroscope | None | Fraud/auth hybrid | No (LexisNexis bundle) | Absorbed (LexisNexis, 2022) | LexisNexis identity data |
| **Plurilock** | Software (endpoint agent) | Keystrokes, mouse, device hold | None | Identity (continuous) | No (enterprise IT) | Active, gov contracts | DoD/Army contracts |
| **KeyTrac** | Software (JS) | Dwell, flight, speed | None | Identity (auth) | Yes (inactive) | INACTIVE (2024) | None |
| **UnifyID** | Software (multi-sensor) | Gait, location, WiFi, keystrokes | None | Implicit auth | No | Acquired (Prove) | Phone identity bundle |
| **Neuro-ID** | Software (form events) | Form hesitation, paste, correction | None | Fraud/liveness | Formerly yes | Acquired (Experian) | Experian identity data |
| **Typing.AI** | Software (JS) | Dwell, flight, speed | None | Identity (auth) | Yes, self-serve | Active (small) | None |
| **HE Keyboards (Wooting/Razer)** | Hardware (Hall sensor) | Analog actuation depth, velocity, curve | Full | Unaddressed | None | Active HW market | Gaming peripherals, not identity |
| **Academic/OSS** | Software (timing) | Dwell, flight, fixed-text | None (except research prototypes) | Research only | Open source | Research-grade | CMU dataset, no commercialization |
| **JITTER (this invention)** | **Hardware (HE sensor)** | **Actuation depth, velocity, curve shape, dwell, flight, physical mechanics** | **Full** | **Identity** | **Designed as protocol** | **Patent pending** | **Unique hardware-physics signal** |

---

## Key Differentiation Summary for Patent Purposes

### The Signal Gap
Every commercial competitor — TypingDNA, BioCatch, BehavioSec, Plurilock, KeyTrac, Typing.AI — captures **only software-layer timing data** derived from OS keyboard events (keydown/keyup timestamps). This data is:
- Available only after the OS processes the keypress
- Quantized to OS timer resolution (typically 1-15ms)
- Identical regardless of what keyboard the user types on
- Spoofable by replaying recorded timing sequences

### What Jitter Captures That No Competitor Does
The Jitter Protocol, as described in the patent application, captures:
1. **Analog actuation depth per keystroke** — the position value from the Hall effect sensor at keydown, hold, and release (continuous curve, not binary event)
2. **Actuation velocity** — the rate of travel through the key's range, unique to each person's keystroke force profile
3. **Actuation curve shape** — the full physical trajectory of each keypress from rest to bottom-out and back, reflecting the typist's physical musculature and habitual finger mechanics
4. **Sub-OS timing** — captured at the keyboard firmware polling rate (1000Hz+ on modern HE keyboards), not OS event quantization

This data cannot be replicated by software-only biometric systems because it requires access to the physical Hall effect sensor output. It cannot be spoofed by replaying timing patterns because the physical actuation curve is independent of timing.

### The Identity vs. Fraud Distinction
BioCatch and Neuro-ID produce session-level risk scores. They do not produce portable, persistent identity signatures. Jitter produces a **biometric identity token** that:
- Persists across sessions and devices (if the same keyboard is used or similar physical mechanics are learned)
- Can be enrolled once and verified indefinitely
- Is hardware-grounded, not software-layer

### No Prior Art in Hardware-Level HE Identity
Searches of commercial products, Chrome Web Store, GitHub, and academic literature confirm: no prior art exists for using Hall effect keyboard sensor curves as a biometric identity signal. Academic pressure-sensor keyboard work uses custom embedded hardware. No work addresses the commercially available Wooting/Razer HE keyboard ecosystem for biometric authentication.

---

## Sources

- [TypingDNA Authentication API](https://www.typingdna.com/authentication-api.html)
- [TypingDNA Gartner Hype Cycle 2025 recognition](https://blog.typingdna.com/typingdna-has-been-recognized-in-the-gartner-hype-cycle-for-digital-identity-2025)
- [TypingDNA Series A announcement](https://www.businesswire.com/news/home/20200104005003/en/TypingDNA-Raises-%247M-Series-A-to-Improve-Typing-Biometrics-Adoption-Worldwide)
- [TypingDNA Pattern Types Documentation](https://www.net.typingdna.com/docs/types-of-typing-patterns.html)
- [TypingDNA ActiveLock 3.5 Fortress launch](https://blog.typingdna.com/introducing-typingdna-activelock-3-5-fortress-redefining-continuous-endpoint-authentication-with-dual-layer-security-and-revolutionary-ai/)
- [Turnitin Clarity announcement (Plagiarism Today)](https://www.plagiarismtoday.com/2025/03/06/turnitin-announces-clarity-aim-to-make-student-writing-more-transparent/)
- [Turnitin Clarity product page](https://www.turnitin.com/products/feedback-studio/clarity)
- [Turnitin Clarity TIME Best Inventions 2025](https://www.turnitin.com/blog/turnitin-clarity-a-time-best-invention-of-2025)
- [Turnitin Clarity GA announcement](https://www.turnitin.com/press/turnitin-delivers-turnitin-clarity)
- [BioCatch Permira acquisition, $1.3B valuation](https://sacra.com/c/biocatch/)
- [BioCatch $160M ARR / Connect 2.0](https://www.biocatch.com/press-release/biocatch-connect-2.0-delivers-advanced-fraud-and-financial-crime-fighting-capabilities-to-worlds-banks)
- [BioCatch behavioral biometrics solution](https://www.biocatch.com/behavioral-biometrics-solution)
- [BioCatch named leader in behavioral biometrics](https://www.biocatch.com/press-release/biocatch-named-leader-behavioral-biometrics-device-intelligence)
- [LexisNexis acquires BehavioSec (PR Newswire)](https://www.prnewswire.com/news-releases/lexisnexis-risk-solutions-acquires-behavioral-biometric-innovator-behaviosec-301537552.html)
- [BehavioSec product page (LexisNexis)](https://risk.lexisnexis.com/products/behaviosec)
- [KeyTrac company profile (Tracxn)](https://tracxn.com/d/companies/keytrac/__w-7GZWWIdEWO1NL5jX1BNtjH9oB8XBwv6athdOKNYLI)
- [KeyTrac website](https://www.keytrac.net/en/)
- [Prove acquires UnifyID](https://www.prove.com/blog/prove-acquires-unifyid)
- [Plurilock US Army NETCOM contract](https://plurilock.com/press-release/u-s-army-netcom-to-deploy-plurilock-biotracker-the-first-continuous-identity-authentication-for-enhanced-cybersecurity/)
- [Typing.AI website](https://typing.ai/)
- [Typing.AI Hacker News launch](https://news.ycombinator.com/item?id=30130447)
- [Neuro-ID / Experian](https://www.neuro-id.com/)
- [Wooting Hall Effect keyboard](https://wooting.io/wooting-80he)
- [Valve bans SOCD in CS2](https://tildes.net/~games/1ib0/valve_bans_razer_and_wootings_new_keyboard_features_in_counter_strike_2)
- [Science Advances flexible pressure sensor keyboard (2025)](https://www.science.org/doi/10.1126/sciadv.ads2297)
- [ACM Computing Surveys: Keystroke Dynamics Concepts, Techniques, Applications](https://dl.acm.org/doi/10.1145/3733103)
- [GitHub keystroke-dynamics topic](https://github.com/topics/keystroke-dynamics)
- [Behavioral biometrics market $14B by 2032 (SNS Insider)](https://www.globenewswire.com/news-release/2025/03/12/3041441/0/en/Behavioral-Biometrics-Market-to-Reach-USD-14-00-Billion-by-2032-Due-to-Rising-Demand-for-AI-Driven-Identity-Verification-and-Fraud-Detection-SNS-Insider.html)
- [Keystroke dynamics 39.25% revenue share of behavioral biometrics market](https://straitsresearch.com/report/behavioral-biometrics-market)
