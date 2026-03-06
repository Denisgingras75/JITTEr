# PROVISIONAL PATENT APPLICATION

## UNITED STATES PATENT AND TRADEMARK OFFICE

---

**TITLE OF THE INVENTION:**
METHOD AND APPARATUS FOR VERIFYING HUMAN AUTHORSHIP OF DIGITAL CONTENT VIA CONTINUOUS BIOMETRIC EFFORT ANALYSIS, PHYSICAL FORCE INPUT, AND CONTENT PROVENANCE CERTIFICATION

**INVENTOR:** Denis Gingras
**DATE:** [Filing Date]
**FILING TYPE:** Provisional Patent Application (37 CFR 1.53(c))

---

## 1. ABSTRACT

A system and method for verifying human authorship of digital content and generating persistent, publicly verifiable proof-of-humanity certificates attached to said content at the point of creation. The system comprises: a biometric engine analyzing keystroke timing variance ("jitter"), dwell-time profiles, cognitive pause patterns, editing behavior, and linguistic rhythm signatures; a purity analyzer measuring the ratio of manual input to injected or pasted text; a content provenance module generating cryptographically signed digital certificates ("Smart Badges") persistently associated with the authored content; a cross-domain reputation engine ("Global Passport") aggregating human effort across independent web platforms; and a sequential badge-chaining mechanism providing tamper-evident provenance history. In hardware embodiments, the system captures physical force signatures via pressure-sensitive keyboard sensors. In mobile embodiments, the system captures physical interaction signatures via accelerometer and gyroscope sensor data. The system addresses the unmet need for proactive, continuous content-level human verification — as distinguished from prior art limited to point-in-time user authentication or one-time bot detection.

---

## 2. BACKGROUND OF THE INVENTION

**Field of the Invention:** The present invention relates generally to biometric security, document provenance, and content authenticity verification. More specifically, the invention relates to a system and method for verifying the human authorship of digital text through the analysis of behavioral input patterns, keystroke timing dynamics, physical force signatures, and cognitive behavioral indicators, and for generating persistent, portable, publicly verifiable certificates of human authorship attached to the resulting digital content.

**Background of the Prior Art:**

In the contemporary digital landscape, the proliferation of generative artificial intelligence (AI) has rendered traditional methods of content verification obsolete. Conventional "plagiarism checkers" and "AI detectors" rely on retrospective statistical analysis of a finished document. These systems are fundamentally reactive and probabilistic; they attempt to "guess" authorship based on word patterns, which are easily manipulated via paraphrasing tools or sophisticated prompting techniques. Furthermore, such systems frequently generate false positives, unjustly penalizing human authors who exhibit high linguistic precision.

Moreover, existing biometric authentication systems (such as FaceID or fingerprint scanners) are "point-in-time" solutions. They verify who a user is at the moment of login but fail to provide continuous provenance for the work performed during a session. While "keystroke dynamics" have been utilized for password security and user authentication (e.g., US4621334, US7509686, US7206938), these applications are typically limited to short, fixed strings of text for the purpose of verifying user identity. They do not address the broader need for verifying a sustained creative process and do not generate any certificate or credential attached to the resulting content.

Similarly, existing bot detection systems (e.g., US10908929B2, "Human versus bot detection using gesture fingerprinting") perform one-time challenge-response verification at a single point in time. These systems do not provide continuous monitoring during content authorship, do not generate certificates of human authorship, and do not attach any verifiable provenance to the content produced.

Standard computer input devices (keyboards) are also limited by their binary nature — keys are either "up" or "down." This binary input lacks the physical "proof-of-work" required to verify that a human hand, governed by unique neuromuscular and cognitive constraints, was the source of the input. Automated scripts can easily inject text into a host system at speeds and regularities that bypass current software-based detection, while "copy-paste" actions allow for the instant misappropriation of large-scale content without any record of the effort typically required for human composition.

On mobile devices, existing authentication methods similarly fail to provide continuous content provenance. While touchscreen devices capture tap events, no existing system utilizes the physical impact signatures — micro-movements detected by accelerometer and gyroscope sensors during the act of typing — as a continuous verification mechanism for content authorship with an associated provenance certificate.

Accordingly, there is a critical and unmet need in the fields of academia, journalism, social media, and secure communications for a proactive, continuous, and physical-based verification system. Such a system must: (1) verify the process of authorship in real-time, capturing the irregular "jitter" of human thought and the variable physical pressure of human touch; (2) generate a persistent, portable, cryptographically signed certificate of human authorship; and (3) attach said certificate to the resulting digital content, enabling any third party to verify that the content was authored by a verified human.

---

## 3. SUMMARY OF THE INVENTION

The present invention, termed the "Jitter Protocol" (also referred to as "Anvil Protocol"), provides a multi-layered verification and content provenance ecosystem:

- **Software Layer:** A browser-based extension monitors keystroke events in real-time, calculating biometric signatures including jitter coefficients, dwell-time profiles, cognitive pause patterns, editing behavior ratios, per-key fingerprints, and linguistic rhythm signatures. The extension operates across all web domains simultaneously.

- **Mobile Layer:** A mobile application or keyboard extension monitors accelerometer and gyroscope sensor data generated by the physical impact of human fingers on a touchscreen, capturing unique physical interaction signatures that cannot be replicated by software-based text injection.

- **Reputation Layer:** A "Global Passport" aggregates human effort over time across multiple independent web domains, creating a portable, cumulative reputation score that protects verified users from being flagged as bots and increases in confidence over time.

- **Hardware Layer:** A specialized biometric keyboard utilizing Hall Effect sensors and Force-Sensing Resistors (FSR) to verify the physical pressure and irregular rhythm of a human hand, signing the data at the firmware level to ensure tamper-proof provenance.

- **Content Provenance Layer:** A verification module that generates cryptographically signed digital certificates ("Smart Badges") comprising multi-dimensional biometric metadata, and attaches these certificates to the authored content at the point of creation. Each badge incorporates a hash of the previous badge, forming a sequential chain of provenance events.

- **Behavioral Analysis Layer:** A multi-signal analysis engine evaluating cognitive indicators including word-boundary pause patterns, editing frequency, mouse/pointer movement characteristics, session duration patterns, and cross-session consistency scoring to distinguish human behavioral profiles from automated systems.

---

## 4. BRIEF DESCRIPTION OF THE DRAWINGS

- **FIG. 1:** A block diagram of the system architecture, showing the interaction between the browser extension, the biometric engine, the content provenance module, the passport reputation system, local storage, and web domains.
- **FIG. 2:** A flowchart of the "Jitter Analysis" multi-layered scoring pipeline, showing sequential independent detection layers (dwell floor, variance floor, per-key uniformity, behavioral signals, replay deduplication, bigram analysis, composite borderline analysis), the flag accumulation mechanism, and the pass/suspicious/reject decision logic.
- **FIG. 3:** An exploded view of the hardware embodiment, showing the pressure-sensitive switch assembly, onboard cryptographic module, and force curve measurement system.
- **FIG. 4:** A UI mockup of the "Smart Badge" verification popup as displayed on web platforms, showing the badge-to-content association.
- **FIG. 5:** A diagram of the mobile embodiment, showing accelerometer/gyroscope data capture during touchscreen typing.
- **FIG. 6:** A diagram of the badge chaining mechanism, showing sequential cryptographic linking of provenance certificates.
- **FIG. 7:** A diagram of the per-key dwell-time fingerprint, showing unique timing profiles across different keys for an individual user.
- **FIG. 8:** A diagram of the session fingerprint deduplication mechanism, showing the deterministic hashing of session metrics, comparison against stored fingerprints, and immediate rejection of duplicate sessions as replay attacks.

---

## 5. DETAILED DESCRIPTION OF THE INVENTION

The system operates by intercepting input events (keydown, keyup, paste, text insertion, pointer movement) via the Document Object Model (DOM), hardware firmware, or mobile operating system sensor APIs.

### 5.1 Biometric Jitter Analysis

The processor calculates inter-keystroke timing using multiple complementary measurements:

**Key-Down-to-Key-Down Interval (DD Time):**

    DD(n) = T_down(n) - T_down(n-1)

This measures the interval between successive key depression events.

**Flight Time (Key-Up-to-Key-Down):**

    T_f = T_down(n) - T_up(n-1)

This measures the interval between releasing one key and depressing the next.

**Dwell Time (Key-Down-to-Key-Up):**

    DW(n) = T_up(n) - T_down(n)

This measures how long an individual key is held down before release.

For all timing measurements, the system calculates the standard deviation (sigma) across the authorship session. Humans exhibit a standard deviation of inter-keystroke jitter typically between 10ms and 150ms. Automated scripts or AI text injectors typically exhibit sigma near 0ms due to the absence of neuromuscular variation. The system flags any input stream where sigma falls below a configurable threshold (e.g., 5-8ms) as likely automated.

Inter-keystroke intervals below a minimum threshold (e.g., 20ms) are filtered as likely simultaneous keypresses or hardware artifacts. Intervals exceeding a maximum threshold (e.g., 2000ms) are classified as cognitive pauses rather than typing rhythm and are analyzed separately.

### 5.2 Per-Key Dwell-Time Fingerprint

The system tracks dwell time (keydown-to-keyup duration) on a per-key basis across at least the most frequently used characters in the applicable language (e.g., the ten most common English letters: E, T, A, O, I, N, S, H, R, D). Each user produces a unique per-key dwell-time profile reflecting their neuromuscular characteristics, finger size, hand positioning, and typing habits. This per-key fingerprint serves as a secondary biometric identifier that is difficult to simulate because it requires replicating the physical characteristics of a specific human's interaction with a keyboard.

### 5.3 Linguistic Rhythm Analysis (Bigram/Trigram Timing)

The system maintains timing distributions for the most common character bigrams in the applicable language (e.g., TH, HE, IN, ER, AN, RE, ON, AT, EN, ND, and others). For each tracked bigram, the system records the mean and standard deviation of transition times.

Humans type familiar character sequences (e.g., "TH") significantly faster than unfamiliar sequences (e.g., "QX") due to motor learning and muscle memory. This cognitive-motor rhythm is a biological signature that simple random-delay injection cannot replicate, because a bot adding random "white noise" delays would produce timing patterns uncorrelated with linguistic context. The system verifies that observed flight times for specific character sequences correlate with expected human-rhythmic latency patterns.

### 5.4 Cognitive Pause Analysis (Word-Boundary Detection)

The system distinguishes between "flow" intervals (keystrokes occurring within a word or familiar sequence) and "gap" intervals (keystrokes occurring after punctuation, spaces, or other word boundaries). The ratio of mean gap time to mean flow time is calculated as the "Cognitive Ratio."

Human authors exhibit a Cognitive Ratio typically between 2.0 and 3.0, reflecting the natural cognitive cost of transitioning between words, sentences, or ideas. Automated systems typically exhibit a Cognitive Ratio near 1.0, as they do not experience differential cognitive load at linguistic boundaries. A Cognitive Ratio below a configurable threshold (e.g., 1.2) is flagged as a potential indicator of automated input.

### 5.5 Editing Behavior Analysis

The system monitors the ratio of deletion events (backspace, delete keys) to total keystroke events ("Edit Ratio"). Human authors naturally produce errors and corrections during composition, resulting in a measurable edit ratio. AI-generated text injected into a text field produces zero editing events. An anomalously low edit ratio in a sustained authorship session is utilized as a negative indicator for human presence.

### 5.6 Cognitive Pause Frequency

The system counts cognitive pauses (inter-keystroke intervals exceeding a threshold, e.g., 2 seconds) per unit of keystrokes (e.g., per 100 keystrokes). Human authors pause to think, re-read, consider word choice, and process ideas. The frequency and distribution of these pauses reflect genuine cognitive engagement. Automated systems that inject text continuously without pauses, or that insert artificially regular pauses, produce pause frequency patterns distinguishable from human authorship.

### 5.7 Pointer/Mouse Movement Analysis

The system optionally captures pointer movement data (mouse or trackpad) as a supplementary biometric signal. Human pointer movement exhibits characteristic patterns of linearity, curvature, speed variation, and micro-corrections that differ from automated cursor positioning. The system analyzes pointer path linearity and speed distribution as additional indicators of human presence.

### 5.8 Biological Decay (Fatigue)

The system monitors for biological decay over sustained authorship sessions by recording biometric measurements in sequential time windows. A human author typically exhibits a non-linear decay in typing velocity (words-per-minute) and a corresponding increase in jitter variance over a sustained session. The absence of this decay curve in high-volume output is utilized as a negative indicator for human presence. The system records fatigue windows at regular intervals (e.g., every N keystrokes) to build a fatigue profile over the duration of the session.

### 5.9 Force Signature (Hardware Embodiment)

In the physical keyboard embodiment, piezoelectric or Hall Effect sensors measure the Attack Velocity, Bottom-Out Force, Aftertouch (continuous pressure variance during key dwell-time), and Release Velocity for each keystroke. Because humans possess unique neuromuscular "force curves," the system creates a multi-dimensional biometric template. Unlike a password, which can be stolen, a force signature is a physical manifestation of effort that cannot be easily simulated by a bot without specialized mechanical actuators.

The hardware utilizes an encapsulated input path. The cryptographic module generates a hash of the text content concatenated with the biometric force-metadata, ensuring that the "Human-Proof" status is tied to the specific string of characters generated. This prevents "man-in-the-middle" software attacks on the hardware-to-software pipeline.

### 5.10 Mobile Physical Interaction Signature

In the mobile embodiment, the system captures data from the device's accelerometer and gyroscope sensors during typing on a touchscreen. Each physical tap on the screen produces micro-movements and impact signatures detectable by these inertial sensors. The system analyzes:

- Tap Impact Pattern: The acceleration magnitude and direction produced by each finger strike on the glass surface.
- Device Micro-Movement: The subtle positional shifts of the device caused by the physical force of typing, which vary based on hand size, grip angle, finger pressure, and typing posture.
- Inter-Tap Dynamics: The physical rhythm of screen contact, including the force differential between sequential taps.

These physical interaction signatures are unique to individual users and, critically, require an actual human body physically interacting with a physical device — a condition that software-based text injection cannot satisfy.

### 5.11 Content Provenance and Smart Badge

Upon completion of an authorship session (or at user-triggered checkpoints during a session), the verification module generates a cryptographically signed digital certificate (the "Smart Badge") containing:

- The jitter coefficient and variance data
- The purity ratio (manual keystrokes vs. pasted content)
- The per-key dwell-time fingerprint summary
- The cognitive ratio (flow vs. gap timing)
- The edit ratio
- The cognitive pause frequency
- The biological decay profile (if applicable)
- A hash of the authored content
- A hash of the previous badge in the sequence (for badge chaining)

This certificate is attached to or embedded within the authored content (e.g., as an encoded data payload within an HTML element, metadata tag, or inline annotation), enabling any third party to verify the human provenance of the content. The badge is designed to be displayed on web platforms (social media posts, articles, comments, reviews) as a visible indicator of verified human authorship.

### 5.12 Badge Chaining (Sequential Provenance)

Each Smart Badge incorporates a cryptographic hash of the preceding badge generated by the same user, creating a sequential, tamper-evident chain of provenance events. This badge chain provides:

- A cumulative history of verified human authorship events
- Tamper detection: alteration of any badge in the chain invalidates all subsequent badges
- Progressive confidence: a longer unbroken chain of badges indicates a sustained pattern of verified human authorship

This mechanism is analogous to a blockchain ledger but operates at the individual user level without requiring distributed consensus.

### 5.13 Writing Ledger (Append-Only Operation Log)

The system maintains an append-only operation log ("Writing Ledger") recording all input events, editing operations, window focus/blur events, and checkpoint hashes during an authorship session. This ledger provides:

- A complete, replayable record of the authorship process
- Detection of window unfocus events (which may indicate switching to an AI tool)
- Hash-chained checkpoints ensuring the integrity of the recorded process
- Replay functionality enabling third parties to observe the authorship process

### 5.14 Cross-Session Consistency Scoring

The system compares biometric profiles across multiple authorship sessions by the same user. A consistency score is computed by comparing a new session's biometric signatures (mean inter-key timing, dwell-time profiles, cognitive ratio, edit ratio) against the user's running profile built from prior sessions. Anomalous deviation from established patterns may indicate account takeover, unauthorized delegation, or automated generation, and is flagged for review.

### 5.15 Multi-Signal Suspicion Scoring Pipeline

The system evaluates each authorship session through a multi-layered scoring pipeline comprising independent detection layers. Each layer checks a distinct biometric dimension. A session that fails two or more independent layers is rejected as likely automated. A session failing exactly one layer is flagged as suspicious for additional monitoring. This layered approach ensures that an automated system must simultaneously satisfy all detection dimensions — defeating any single check is insufficient.

The scoring pipeline comprises the following ordered layers, each operating independently:

**Layer 1 — Dwell Time Floor:** The system rejects sessions where mean dwell time (key depression duration) falls below a minimum threshold derived from human biomechanical research (e.g., 27ms, representing a 10% buffer below the established minimum human dwell time of 30ms). Automated text injection via browser APIs produces dwell times of 1-2ms, providing a clear separation.

**Layer 2 — Variance Floor:** The system rejects sessions where the standard deviation of inter-keystroke intervals falls below a minimum threshold (e.g., 9ms, representing a 10% buffer below the established minimum human standard deviation of approximately 12ms for fast typists). Fixed-delay bots produce zero variance.

**Layer 3 — Inter-Keystroke Interval Floor:** The system rejects sessions where mean inter-keystroke interval falls below a minimum threshold (e.g., 54ms, representing a 10% buffer below the established minimum human inter-keystroke interval of 60ms). Zero-delay automated injection produces intervals near 0ms.

**Layer 4 — Per-Key Dwell Uniformity:** The system calculates the coefficient of variation (CV) of per-key dwell times across tracked keys. Human typists produce varying dwell times per key (reflecting finger size, key position, and muscle memory), resulting in CV values above a minimum threshold (e.g., 0.09). Automated systems produce uniform dwell times with CV approaching zero.

**Layer 5 — Timing Coefficient of Variation:** The system calculates the overall CV of inter-keystroke intervals (standard deviation divided by mean). Human typists, including fast typists, maintain CV values above a minimum threshold. The threshold is dynamically adjusted based on typing speed — faster typists naturally exhibit lower CV due to greater consistency, so a reduced threshold is applied for sessions with mean inter-keystroke intervals below a configurable speed boundary (e.g., 125ms).

**Layer 6 — Behavioral Editing Signals:** The system evaluates the edit ratio (proportion of deletion events to total keystrokes) and cognitive pause frequency (pauses per unit of keystrokes) as complementary signals. Sessions exhibiting both anomalously low edit ratio (e.g., below 3% for non-fast typists) and anomalously low pause frequency (e.g., below 0.4 per 100 keystrokes) simultaneously are flagged, as this combination is characteristic of automated text generation. Fast typists (mean inter-keystroke interval below a configurable threshold) are exempted from this check, as their fluid typing naturally produces fewer edits and pauses.

**Layer 7 — Dwell Time Standard Deviation Floor:** The system checks the standard deviation of dwell times across the session. Human dwell time variance typically exceeds 12ms. Sessions with dwell time standard deviation below a hard floor (e.g., 8ms) are flagged as definitive bot signals. Sessions between the hard floor and a soft threshold (e.g., 11ms) are flagged as suspicious.

**Layer 8 — Session Fingerprint Deduplication:** The system generates a deterministic fingerprint for each session based on its aggregate timing metrics (mean and standard deviation of inter-keystroke intervals, dwell times, flight times, edit ratio, pause frequency, and per-key dwell values). This fingerprint is stored in the user's profile. If a new session's fingerprint matches a previously recorded fingerprint, the session is immediately rejected as a replay attack. This provides definitive replay detection without requiring storage of raw timing data.

**Layer 9 — Replay Heuristic (Multi-Metric Similarity):** For sessions not caught by fingerprint deduplication, the system compares the session's aggregate metrics against the user's running profile. If a configurable number of metrics (e.g., four or more out of five) fall within tight tolerance bands of the profile averages, the session is flagged as a potential replay. Additionally, per-key dwell correlation is checked — if a high percentage of tracked keys have dwell times within a tight tolerance of the stored profile, additional suspicion weight is applied.

**Layer 10 — Composite Borderline Analysis:** The system monitors sessions that pass individual layer thresholds by narrow margins. If a session triggers one flag and additionally has multiple metrics in a "borderline" zone (marginally above individual thresholds), the composite borderline condition itself triggers a flag. This addresses sophisticated automated systems designed to pass each individual check by minimal margins — a pattern unlikely in natural human variation, where metrics are typically well above or well below thresholds rather than clustered near them.

**Layer 11 — Bigram Rhythm Analysis:** The system verifies that common character bigrams (e.g., "TH", "HE", "IN") are typed faster than uncommon bigrams, reflecting motor learning and muscle memory. Automated systems with randomized delays produce flat bigram timing with no linguistic correlation.

**Research-Backed Thresholds:** All detection thresholds are derived from published keystroke dynamics research (including studies of 136 million keystrokes) and include a configurable buffer (e.g., 10%) to prevent false positives against fast legitimate typists operating in their peak performance zone. This buffer ensures the system does not penalize skilled human typists while maintaining high detection rates against automated systems.

**Empirical Validation:** In controlled testing with 2,000+ simulated trials across 50 research-backed human typing profiles and 6 distinct automated attack strategies (zero-delay injection, fixed-delay injection, uniform-random-delay injection, Gaussian-mimic injection, exact session replay, and sophisticated multi-signal mimicry), the multi-signal pipeline achieved:
- 96-100% detection rate across all six automated attack categories
- 0.4% false positive rate on legitimate human sessions
- 0.7% false positive rate on human sessions during nighttime hours (when typing patterns naturally degrade)
- 0.6% false positive rate on mobile device sessions
- 1.8% false positive rate on high-volume power users
- 100% detection rate on exact replay attacks (via session fingerprint deduplication)

### 5.16 Circadian Tolerance

The system accounts for natural variation in human typing patterns caused by circadian rhythm. Research indicates that human inter-keystroke intervals increase by approximately 10-15% during nighttime hours (e.g., 10 PM to 4 AM local time) due to fatigue, reduced alertness, and neuromuscular relaxation. The detection thresholds are calibrated to accommodate this natural drift without generating false positives, while still detecting automated systems that do not exhibit circadian variation.

### 5.17 Profile Convergence and Progressive Confidence

The system builds a running biometric profile for each user across multiple authorship sessions. Confidence in the profile increases progressively as more sessions are ingested. In empirical testing, profiles reach "high" confidence (sufficient for reliable verification) after approximately 15 sessions, with 90% of users reaching high confidence within 90 days of regular usage. This progressive confidence model means that the system's detection accuracy improves over time as the profile becomes more refined, while simultaneously narrowing the margin of error available to sophisticated automated systems attempting to mimic a specific user.

---

## 6. CLAIMS

What is claimed is:

1. A system for verifying human authorship of digital content comprising:
    - (a) an input monitoring module configured to track sequential keystroke events, text-insertion events, and deletion events;
    - (b) a biometric engine configured to calculate a jitter coefficient based on the variance of timing between said keystroke events, a dwell-time profile based on the duration of individual key depression events, and a cognitive ratio based on the differential timing of keystrokes at linguistic boundaries versus within linguistic units;
    - (c) a purity analyzer configured to calculate a ratio of manual keystroke events to pasted or injected text-insertion events; and
    - (d) a verification module configured to generate a cryptographically signed digital certificate comprising the jitter coefficient, the dwell-time profile, the cognitive ratio, and the purity ratio, said digital certificate being persistently associated with the authored digital content as publicly verifiable proof of human authorship.

2. The system of claim 1, wherein the input monitoring module is an asynchronous browser extension configured to operate across a plurality of independent web domains to aggregate a cumulative reputation score ("Passport"), said reputation score increasing over time as verified human authorship events accumulate.

3. The system of claim 1, wherein the biometric engine is further configured to calculate a per-key dwell-time fingerprint by tracking the mean and variance of key depression duration for individual keys, thereby generating a biometric profile unique to the neuromuscular characteristics of the user.

4. The system of claim 1, wherein the biometric engine is further configured to:
    - access a context-aware linguistic heatmap comprising expected human-rhythmic latencies for specific character sequences (n-grams); and
    - verify the jitter coefficient by comparing observed inter-keystroke times for specific character sequences (bigrams and trigrams) against the expected latencies in said heatmap, such that automated inputs utilizing randomized delays are identified by their lack of rhythmic correlation to the linguistic context.

5. The system of claim 1, wherein the biometric engine is further configured to calculate a cognitive ratio by classifying inter-keystroke intervals as either "flow" intervals (occurring within words or familiar character sequences) or "gap" intervals (occurring at word boundaries, sentence boundaries, or after punctuation), and computing the ratio of mean gap time to mean flow time; wherein a cognitive ratio below a configurable threshold is flagged as indicative of automated input.

6. The system of claim 1, wherein the biometric engine is further configured to:
    - calculate an edit ratio based on the proportion of deletion events (backspace, delete) to total keystroke events; and
    - calculate a cognitive pause frequency based on the count of inter-keystroke intervals exceeding a configurable duration threshold per unit of total keystrokes;
    wherein anomalously low values of either metric during a sustained authorship session are utilized as negative indicators for human presence.

7. The system of claim 1, wherein the biometric engine is configured to monitor for biological decay over a sustained authorship session by recording biometric measurements in sequential time windows, defined by a non-linear decrease in words-per-minute velocity and a corresponding increase in jitter variance over time; wherein the absence of said biological decay in high-volume text output is utilized as a negative indicator for human presence.

8. The system of claim 1, wherein the verification module is further configured to incorporate a cryptographic hash of the preceding digital certificate generated by the same user into each new digital certificate, thereby forming a sequential, tamper-evident chain of provenance certificates; wherein alteration of any certificate in the chain invalidates all subsequent certificates.

9. The system of claim 1, further comprising an append-only operation log ("Writing Ledger") configured to record all input events, editing operations, window focus and blur events, and periodic hash-chained checkpoints during an authorship session; said ledger providing a replayable record of the authorship process and enabling detection of session interruptions that may indicate use of external text generation tools.

10. The system of claim 1, further comprising a cross-session consistency module configured to compare biometric profiles from a current authorship session against a running profile aggregated from prior sessions by the same user; wherein anomalous deviation from established biometric patterns is flagged as a potential indicator of unauthorized delegation or automated generation.

11. The system of claim 1, further comprising a multi-signal suspicion scoring module configured to aggregate a plurality of behavioral indicators including daily output volume, cross-session consistency variance, session frequency, time-of-day activity patterns, account age relative to output volume, and session duration into a composite risk score for automated authorship.

12. The system of claim 1, wherein the input monitoring module is further configured to capture pointer movement data including path linearity, speed distribution, and micro-correction patterns as supplementary biometric signals for human presence verification.

13. A biometric keyboard for human verification comprising:
    - (a) a plurality of keys, each key associated with a pressure sensor;
    - (b) an onboard controller configured to measure the physical force applied to each key;
    - (c) a cryptographic secure element configured to sign a data packet containing the text input and the measured force profile; and
    - (d) a visual indicator on the keyboard housing configured to change state upon detection of non-human input patterns.

14. The keyboard of claim 13, wherein the pressure sensor is a Hall Effect sensor configured to measure continuous travel distance, bottom-out impact, release velocity, and continuous pressure variance (aftertouch) during the dwell-time of a keypress.

15. The keyboard of claim 13, wherein the onboard controller is configured to capture a multi-dimensional force profile for each keystroke, comprising:
    - attack velocity (the speed of key depression);
    - aftertouch (continuous pressure variance during key dwell-time); and
    - release velocity (the speed of key return);
    thereby generating a physical signature unique to the neuromuscular profile of the user.

16. A method for verifying human authorship on a mobile computing device comprising:
    - (a) capturing accelerometer and gyroscope sensor data from the mobile device during a text input session on a touchscreen;
    - (b) analyzing the captured sensor data to extract physical interaction signatures including tap impact patterns, device micro-movements, and inter-tap dynamics;
    - (c) calculating a jitter coefficient based on the variance of timing between keystroke events detected on the touchscreen;
    - (d) generating a cryptographically signed digital certificate comprising the physical interaction signatures and the jitter coefficient; and
    - (e) persistently associating said digital certificate with the authored digital content as publicly verifiable proof of human authorship.

17. The system of claim 1, wherein the digital certificate is rendered as a publicly visible badge embedded within or adjacent to the authored content on a web platform, said badge comprising an encoded data payload enabling any third party with access to the content to independently verify the human provenance of the authored content without requiring access to a centralized verification authority.

18. The system of claim 1, wherein the biometric engine evaluates each authorship session through a multi-layered scoring pipeline comprising a plurality of independent detection layers, each layer analyzing a distinct biometric dimension; wherein a session failing two or more independent layers is rejected as likely automated, and a session failing exactly one layer is flagged as suspicious for additional monitoring; such that an automated system must simultaneously satisfy all detection dimensions to avoid rejection.

19. The system of claim 18, wherein the multi-layered scoring pipeline comprises:
    - (a) a dwell time floor layer rejecting sessions where mean key depression duration falls below a threshold derived from human biomechanical research;
    - (b) a variance floor layer rejecting sessions where standard deviation of inter-keystroke intervals falls below a minimum threshold;
    - (c) a per-key dwell uniformity layer calculating the coefficient of variation of dwell times across tracked keys and rejecting sessions with uniformity characteristic of automated input;
    - (d) a behavioral editing layer evaluating the combination of edit ratio and cognitive pause frequency, wherein the simultaneous presence of anomalously low values in both metrics indicates automated generation;
    - (e) a dwell time variance layer evaluating the standard deviation of dwell times across the session; and
    - (f) a bigram rhythm layer verifying that timing of common character sequences correlates with expected human motor learning patterns.

20. The system of claim 18, further comprising a dynamic threshold adjustment module configured to adjust detection thresholds based on the user's typing speed, wherein faster typists receive relaxed thresholds for metrics that naturally compress at higher speeds, thereby reducing false positives on skilled human typists while maintaining detection rates against automated systems.

21. The system of claim 1, further comprising a session fingerprint deduplication module configured to:
    - (a) generate a deterministic fingerprint for each authorship session based on aggregate timing metrics including mean and standard deviation of inter-keystroke intervals, dwell times, flight times, edit ratio, pause frequency, and per-key dwell values;
    - (b) store said fingerprint in the user's biometric profile; and
    - (c) compare each new session's fingerprint against all previously stored fingerprints, immediately rejecting any session whose fingerprint matches a stored fingerprint as a replay attack;
    thereby providing deterministic replay attack detection without requiring storage of raw keystroke timing data.

22. The system of claim 18, further comprising a composite borderline analysis layer configured to:
    - (a) identify sessions that pass individual detection layers by narrow margins, where multiple biometric metrics fall within a borderline zone marginally above their respective thresholds;
    - (b) flag sessions exhibiting borderline values across a plurality of metrics simultaneously as suspicious;
    wherein the composite borderline condition addresses sophisticated automated systems designed to pass each individual detection layer by minimal margins — a pattern statistically unlikely in natural human typing variation.

23. The system of claim 1, wherein all detection thresholds include a configurable buffer percentage (e.g., 10%) applied to research-derived human baseline values, said buffer calibrated to prevent false positives against fast legitimate typists operating in peak performance conditions while maintaining detection rates exceeding 95% against automated systems.

24. The system of claim 10, wherein the cross-session consistency module implements progressive confidence scoring, wherein the confidence level of the user's biometric profile increases with each additional verified authorship session, narrowing the acceptable deviation range over time; such that automated systems that initially pass detection face increasingly stringent verification as the profile matures.

