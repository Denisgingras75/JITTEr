# Anti-Cheat Integration: Where Jitter Fits in the Gaming Stack
## Jitter Protocol — Patent Filing & Product Design Research
**Date:** 2026-03-02
**Purpose:** Map the existing anti-cheat landscape, identify gaps Jitter fills, and define the integration model for gaming identity
**Classification:** Confidential IP Research

---

## Table of Contents

1. [Current Anti-Cheat Approaches](#1-current-anti-cheat-approaches)
2. [What Anti-Cheat Systems Detect](#2-what-they-detect)
3. [What Anti-Cheat Systems Do NOT Detect](#3-what-they-dont-detect)
4. [The Valve SOCD/Snap Tap Controversy](#4-valve-socd-controversy)
5. [Where Jitter Fits: The Identity Layer](#5-where-jitter-fits)
6. [Use Cases: Account Sharing, Boosting, Competitive Integrity](#6-use-cases)
7. [Integration Model: Anti-Cheat SDK + Jitter Passport](#7-integration-model)
8. [The HE Keyboard Installed Base Advantage](#8-he-keyboard-advantage)
9. [Implications for Jitter Protocol](#9-jitter-implications)

---

## 1. Current Anti-Cheat Approaches

### 1.1 Architectural Tiers

Anti-cheat systems operate at different privilege levels, each with different capabilities and trade-offs:

| System | Publisher | Architecture | Privilege Level |
|---|---|---|---|
| Vanguard | Riot Games | Kernel-mode driver | Ring 0 (kernel) |
| Easy Anti-Cheat (EAC) | Epic Games | Kernel-mode driver | Ring 0 (kernel) |
| BattlEye | Battleye GmbH | Driver + userspace | Ring 0 + Ring 3 |
| VAC (Valve Anti-Cheat) | Valve | Userspace | Ring 3 (userspace) |
| FACEIT Anti-Cheat | FACEIT | Kernel-mode driver | Ring 0 (kernel) |
| Ricochet | Activision | Kernel-mode driver | Ring 0 (kernel) |

The trend is clearly toward kernel-level access. Userspace anti-cheat (VAC) is widely considered insufficient against sophisticated cheat developers.

### 1.2 Vanguard (Riot Games)

Vanguard is among the most aggressive anti-cheat deployments in the industry, used in VALORANT, League of Legends, and Teamfight Tactics.

**Architecture:**
- Runs as a kernel-mode driver (`vgk.sys`) that loads at system boot — before Windows fully initializes
- Monitors loaded drivers, running processes, and memory modifications at the OS level
- Communicates with Riot's servers for behavioral analysis and ban decisions
- Permanently installed; cannot be disabled by the user when the game is running

**What it can see:**
- All running processes and their memory maps
- Loaded kernel drivers (detects driver-based cheats and DMA devices)
- Hardware fingerprints (HWID banning)
- Mouse and keyboard input at the driver level — including synthetic inputs
- Screen capture attempts by external processes

**What it cannot see:**
- Whether the human sitting at the keyboard is the account owner
- Whether a highly skilled external player has taken over the account
- Behavioral identity — who is typing vs who is clicking vs who their historical profile is

### 1.3 Easy Anti-Cheat (EAC)

EAC is the most widely deployed anti-cheat system, used in Fortnite, Apex Legends, Rust, Dead by Daylight, and hundreds of others.

**Architecture:**
- Kernel driver (`EasyAntiCheat.sys`) loaded during game session
- Driver-level hardware fingerprinting for HWID banning
- Memory scanning for known cheat signatures
- Process integrity checking

**Distinguishing feature:** EAC focuses heavily on **hardware fingerprinting**. When an account is banned, the hardware ID is also flagged, making it harder to create a new account on the same machine. This has created a market for "HWID spoofers."

### 1.4 BattlEye

Used in PUBG, Escape from Tarkov, DayZ, Rainbow Six Siege, and others.

**Architecture:**
- Kernel driver for memory access
- Process monitoring and injection detection
- Network traffic analysis for speed hack detection
- Periodic server-side validation

**Approach:** BattlEye emphasizes detecting **behavioral anomalies at the game state level** — impossible movement speeds, impossible accuracy rates, impossible reaction times. This is closer to statistical analysis than signature detection.

### 1.5 VAC (Valve)

Valve Anti-Cheat operates entirely in userspace and is widely regarded as the weakest major anti-cheat system.

**Architecture:**
- Scans game files and running memory for cheat signatures
- Periodic reporting to Valve servers
- Delayed bans (VAC bans are often delayed weeks to prevent cheat developers from knowing exactly what was detected)

---

## 2. What Anti-Cheat Systems Detect

All major anti-cheat systems are designed around **cheating detection** — identifying software that gives unfair advantages within the game itself:

| Cheat Category | Detection Method |
|---|---|
| Aimbot (auto-aim) | Impossibly precise mouse movements, input timing analysis, process memory injection |
| Wallhack (see through walls) | Memory reads of hidden entity positions |
| Speed hack | Server-side position verification, impossible movement deltas |
| Macro / script injection | Synthetic input detection at driver level, inhuman timing precision |
| Radar hack | Network packet analysis |
| DMA (Direct Memory Access) cheats | Driver-level detection, PCIe bus monitoring (Vanguard) |
| Trigger bot | Input timing at sub-millisecond precision, impossible reaction times |
| Spin bot (in CS) | Geometry impossibility detection server-side |

### 2.1 Behavioral Biometrics in Current Anti-Cheat

Current anti-cheat systems do use behavioral analysis, but exclusively for **cheat detection** rather than **identity verification**:

- BattlEye analyzes whether game-state behavior (accuracy, reaction time) is statistically impossible
- Vanguard monitors input timing for macro-level precision
- VAC uses community reports combined with stat anomalies

**The key distinction:** These systems ask "Is this player cheating?" not "Is this the registered player?" They analyze game-state behavior, not typing/input biometrics.

---

## 3. What Anti-Cheat Systems Do NOT Detect

### 3.1 The Identity Gap

Despite massive investment in kernel-level monitoring and behavioral analysis, no major anti-cheat system addresses **player identity fraud**:

| Fraud Type | Detectable by Current Anti-Cheat | Notes |
|---|---|---|
| Account sharing | No | Legitimate credentials, no cheat software |
| Boosting services | Partially (stat anomalies) | Skilled booster plays legitimately |
| Paid coaching with account takeover | No | External player, no cheat software |
| Tournament smurfing | No | Different account, same hardware |
| Account selling | No | New owner plays legitimately |
| Script/macro detection | Partially | Only detected if precision is inhuman |

### 3.2 Why Account Sharing Is Hard to Detect with Current Tools

Account sharing involves a legitimate player using legitimate credentials on legitimate hardware, potentially with no cheat software. From an anti-cheat perspective, it is indistinguishable from the account owner playing — unless the secondary player is drastically different in skill level, which is detectable via stat anomalies but only after many sessions.

**The boosting problem is particularly acute:** A skilled player hired to boost another account plays legitimately well. They use no cheats. They produce results that look "too good" for the account's history, but this is attributed to improvement or luck rather than account fraud.

### 3.3 The Economic Scale of the Problem

Boosting services represent a multi-hundred-million dollar annual market in competitive gaming. Major titles affected include:

- **CS2 / CSGO:** Boosting to Faceit levels, competitive rank buying
- **VALORANT:** Rank boosting to Immortal/Radiant
- **League of Legends:** Division boosting, account leveling
- **Escape from Tarkov:** Carry services (account takeover during raids)
- **Apex Legends:** Predator rank boosting

Anti-cheat systems from Valve, Riot, and Epic address cheating. None address the boosting economy in a systematic, scalable way. This is Jitter's opening.

---

## 4. The Valve SOCD/Snap Tap Controversy

### 4.1 Background

Simultaneous Opposite Cardinal Directions (SOCD) refers to pressing two opposing directional inputs at the same time (e.g., A and D simultaneously in CS2). On standard keyboards, this produces undefined behavior. Hall Effect keyboards, through analog sensing, enable a feature called "Snap Tap" (Wooting) or "SOCD Neutralization" that cleanly handles this input by canceling the earlier direction when the opposite is pressed.

In competitive FPS gaming, Snap Tap provides a measurable advantage: players can instantly change horizontal movement direction without the momentary input overlap that occurs on standard keyboards. This creates a different (faster) strafing pattern that standard keyboards physically cannot produce.

### 4.2 Valve's Response

In September 2023, Valve updated CS2's competitive rules to ban SOCD/Snap Tap behavior at the software level. The CS2 client detects and rejects Snap Tap-style inputs in competitive matchmaking.

**How the ban works:** CS2 monitors for simultaneous opposite directional inputs at the game input layer and flags or nullifies them. This is a game-side detection, not anti-cheat system level.

**Impact:** Wooting and other HE keyboard manufacturers updated their firmware to add a "CS2 compatible" mode that disables Snap Tap while retaining other HE features (Rapid Trigger, adjustable actuation).

### 4.3 Implications for Jitter

The Snap Tap controversy demonstrates two things:

1. **HE keyboard input is distinguishable from standard keyboard input** at the game client level — Valve proved this is detectable.
2. **The HE keyboard community is large enough to affect game design** — Valve banned a feature that only HE keyboards could produce, indicating significant adoption.

For Jitter, the controversy highlights that game developers are already thinking about HE keyboard behavior at the input level. A partnership pitch to game publishers can reference this context: "If you can detect Snap Tap, you can also detect player identity via force curves."

**The reverse implication:** If Valve bans features that provide unfair advantages, they are implicitly endorsing systems that can detect input-level behavioral differences. Jitter operates in the same space but for identity rather than advantage.

---

## 5. Where Jitter Fits: The Identity Layer

### 5.1 The Stack Diagram

```
LAYER 4: Game Rules Enforcement (server-side stat validation)
         "Is this score/rank possible?"

LAYER 3: Anti-Cheat (Vanguard, EAC, BattlEye)
         "Is cheat software running?"

LAYER 2: Platform Identity (Steam, PlayStation Network, Xbox Live)
         "Are these valid credentials?"

LAYER 1: [GAP — no current solution]
         "Is this the SAME HUMAN who owns this account?"

LAYER 0: Hardware (keyboard, mouse, controller)
         Raw input signals
```

Jitter fills Layer 1 — **behavioral identity** — which sits between platform credential validation and anti-cheat software detection. No existing commercial system occupies this layer at scale.

### 5.2 Why This Layer Matters

- Layer 2 (credentials) can be sold, shared, or phished — does not verify the human
- Layer 3 (anti-cheat) detects software cheats — does not verify the human
- Layer 1 (Jitter) verifies the human via behavioral patterns — cannot be spoofed by purchasing software

The three layers are complementary. Adding Jitter does not replace anti-cheat; it adds a dimension that anti-cheat fundamentally cannot provide.

### 5.3 The "Behavioral Biometric Passport" Concept

Jitter's core contribution to the gaming stack is establishing a **behavioral biometric passport** that is:

- **Portable:** Follows the player across accounts, games, and platforms
- **Passive:** Built from normal gameplay — no explicit enrollment beyond initial profiling
- **Layered:** Improves as more signal is available (typing, controller, force curve)
- **Non-invasive:** Does not require kernel-level access or process monitoring

---

## 6. Use Cases: Account Sharing, Boosting, Competitive Integrity

### 6.1 Account Sharing Detection

**Problem:** A player shares their account credentials with a friend or family member. The second user may play legitimately, making stat-based detection unreliable.

**Jitter solution:**
- Build behavioral passport from the account owner's typing patterns, controller dynamics, and force curves over normal gameplay sessions
- When a session's behavioral profile diverges significantly from the passport, flag as potential account share
- Confidence score fed to game publisher — they decide action (prompt for re-authentication, flag for human review, require step-up verification)

**Detection advantage:** HE keyboard force curves are the most powerful signal here. Even two players of identical skill level will have different force profiles — the physical signature of finger mass, angle, and muscle tone cannot be coached.

### 6.2 Anti-Boosting

**Problem:** A high-skill player is paid to play on a lower-skill player's account to artificially inflate rank.

**Jitter solution:**
- When a booster session begins, behavioral profile diverges sharply from account owner's passport
- High-skill player's behavioral profile is likely already in the Jitter system from their own accounts — cross-account matching can identify the specific booster
- Flag session as anomalous; allow publisher to take action

**Cross-account biometric matching** is a secondary capability that requires careful legal framing (privacy implications of linking identities across accounts) but is technically feasible and highly valuable.

### 6.3 Tournament Integrity

**Problem:** In esports, players must play on official tournament hardware. Identity verification currently relies on ID checks and supervision.

**Jitter solution:**
- Players register their behavioral passport before the tournament
- During tournament play, continuous behavioral verification runs passively
- Any significant deviation (player swapped mid-match) generates a flag
- Post-match analysis can retrospectively verify entire match history

**Hardware advantage:** Tournament environments control hardware. If tournament organizers mandate HE keyboards (feasible given price parity), force curve verification becomes available in the highest-stakes environment.

### 6.4 Smurf Account Detection

**Problem:** A high-skill player creates a new account to play against lower-skill opponents.

**Jitter solution:**
- New account's behavioral profile is built during initial sessions
- Cross-reference against Jitter passport database
- If new account matches existing passport of a banned or high-ranked player, flag for review

This requires a critical mass of Jitter passport holders — a network effect problem, not a technical one.

---

## 7. Integration Model: Anti-Cheat SDK + Jitter Passport

### 7.1 Integration Options

**Option A: Game Engine Plugin (Preferred)**
- Jitter SDK integrated at the game engine level (Unity, Unreal plugins)
- Captures keyboard/controller input directly from the engine's input system
- No separate installation required; ships with the game
- Behavioral data processed locally, only features (not raw inputs) sent to Jitter servers

**Option B: Anti-Cheat SDK Partnership**
- Jitter behavioral layer integrated with EAC, BattlEye, or Vanguard SDK
- Anti-cheat system passes input events to Jitter alongside its own analysis
- Requires partnership with anti-cheat vendor — higher barrier, but massive distribution
- Riot/Epic/Battleye become distribution channels rather than competitors

**Option C: Standalone Desktop SDK**
- Native background process similar to companion daemon architecture
- Captures input at OS level (below game, above kernel)
- Works across any game without individual game integration
- Privacy-sensitive: requires user opt-in and clear disclosure

**Option D: Web-Based (Browser Games / Web Companion)**
- Gamepad API for controller biometrics
- WebHID for HE keyboard biometrics
- Companion daemon for HE keyboards in non-Chromium browsers
- Lowest friction for web game publishers

### 7.2 Data Flow Architecture

```
[Game session in progress]
         |
         | Input events (keyboard, controller)
         v
[Jitter Client SDK]
  - Local feature extraction (no raw inputs leave device)
  - Force curve computation (if HE keyboard present)
  - Behavioral feature vector assembled
         |
         | Encrypted feature vector (not raw inputs)
         v
[Jitter API]
  - Compare against stored passport
  - Generate confidence score (0.0–1.0)
  - Anomaly detection vs historical sessions
         |
         v
[Game Publisher / Anti-Cheat Integration]
  - Receive confidence score + anomaly flags
  - Apply publisher-defined policy (flag, challenge, ban)
  - Optional: feed anti-cheat system as additional signal
```

### 7.3 Privacy Architecture

Raw input data (actual keystrokes, force curves) must not be transmitted to Jitter servers. Only derived features (dwell time distributions, force curve statistical moments, session-level aggregates) leave the device. This is both a privacy requirement and a performance requirement (raw HE data at 4000 Hz would be 100+ KB/s per key).

---

## 8. The HE Keyboard Installed Base Advantage

### 8.1 Why Gaming Is the One Market Where HE Keyboards Are Deployed at Scale

The biometric use of Hall Effect keyboards depends on a critical premise: the user already owns one. This is only reliably true in gaming:

| Market | HE Keyboard Penetration | Notes |
|---|---|---|
| Competitive FPS gaming (PC) | ~8–15% of active players (2026E) | Rapid Trigger drove mainstream adoption |
| Office/productivity | <0.5% | No consumer awareness, no demand driver |
| Finance/banking | <0.1% | Commodity keyboards, no HE demand |
| Government/security | <0.1% | Standardized hardware, procurement constraints |

Gaming is the only market where HE keyboard adoption is high enough, growing fast enough, and driven by enough user motivation (competitive advantage) to reach a meaningful biometric user base without requiring hardware subsidy.

### 8.2 The Chicken-and-Egg Solved

The typical biometric hardware problem: "Users need the hardware to use the biometric, but there's no reason to buy the hardware for the biometric."

For HE keyboards in gaming, this is already solved. Users bought Wooting and SteelSeries Apex Pro keyboards for Rapid Trigger and adjustable actuation — not for biometrics. Jitter can offer biometric identity as a **zero-additional-hardware benefit** to this existing installed base.

This is unique in the biometric industry. Most biometric systems require either:
- Dedicated enrollment hardware (fingerprint readers, iris cameras)
- A captive device with embedded sensor (Face ID on iPhone)
- A software-only approach limited to standard timing signals

Jitter's HE keyboard path requires neither dedicated hardware nor a captive device — it activates hardware the user already purchased for different reasons.

---

## 9. Implications for Jitter Protocol

### 9.1 Positioning vs. Anti-Cheat

Jitter should be positioned as **complementary to, not competitive with** existing anti-cheat systems. The pitch to game publishers:

- Anti-cheat detects software: "Is cheat software running?" (addressed by Vanguard/EAC)
- Jitter detects identity: "Is this the human who owns this account?" (not addressed by anyone)
- Together, they close both gaps in gaming integrity

### 9.2 Partnership vs. Standalone

The fastest path to gaming market penetration is likely a data partnership with an existing anti-cheat vendor rather than competing with them. Anti-cheat vendors have:
- Existing SDK integrations with thousands of games
- Publisher relationships
- Trust infrastructure (publishers already pay for anti-cheat)

Jitter adds the identity layer. The anti-cheat vendor sells the bundle.

**Risk:** Anti-cheat vendors could build this themselves. Jitter's moat is the patent claims on force curve biometrics and the behavioral identity algorithm — hard to replicate quickly.

### 9.3 The Snap Tap Precedent as Patent Support

Valve's detection of Snap Tap behavior at the game input level establishes legal and technical precedent that:
1. HE keyboard analog input is distinguishable from standard keyboard input
2. Game clients can legally monitor and act on HE-specific input patterns
3. The gaming community and game publishers accept input-level behavioral analysis

This precedent supports Jitter's patent claims: if game clients can analyze analog input for cheat detection (established by Valve), analyzing analog input for identity verification follows the same technical and legal foundation.
