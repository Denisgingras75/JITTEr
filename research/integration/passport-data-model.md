# Jitter Passport: Data Model & Schema Design
## Date: 2026-03-02 | Source: Research agent sprint
## Purpose: Schema design, session history, storage split, and privacy architecture for patent filing

---

## 1. Overview

A Jitter Passport is a persistent behavioral identity record that accumulates across sessions. Its core data structure must balance three competing requirements: (1) enough raw fidelity to compute accurate identity comparisons, (2) a strong privacy guarantee that raw biometric data never leaves the device, and (3) efficient storage and transport for a lightweight embedded SDK.

The schema described here is the canonical data model for the Jitter Protocol v1 (per-site passport) and is designed to extend cleanly to the v2 Global Passport federation architecture.

---

## 2. Passport Data Structure (JSON Schema)

The root passport object. One passport exists per user per site in v1; one per user globally in v2.

```json
{
  "passport_id": "uuid-v4",
  "schema_version": "1.0",
  "site_id": "string (e.g. 'wgh.app')",
  "created_at": "ISO-8601 timestamp",
  "last_session_at": "ISO-8601 timestamp",
  "session_count": "integer",
  "calendar_age_days": "integer (derived: now - created_at)",

  "weight": {
    "value": "float [0.0, 0.95]",
    "tier": "string (infant|adolescent|mature|established|veteran)",
    "computed_at": "ISO-8601 timestamp"
  },

  "anomaly": {
    "score": "float [0.0, 1.0]",
    "last_flagged_at": "ISO-8601 timestamp | null",
    "flag_count_lifetime": "integer"
  },

  "profile": {
    "anchor_template": { "...see Section 4..." },
    "active_template": { "...see Section 4..." }
  },

  "session_history": [
    { "...see Section 3..." }
  ],

  "signals": {
    "...see Section 5..."
  },

  "meta": {
    "device_classes_seen": ["laptop_keyboard", "external_mechanical", "touchscreen"],
    "enrollment_complete": "boolean",
    "enrollment_sessions_required": 5,
    "export_format_version": "1.0"
  }
}
```

**Passport weight formula (from temporal-fortress-model.md):**

```
W(t, N, A) = 0.95 * (1 - e^(-N/tau)) * (1 - A) * age_factor(t)
```

Where N = session count, tau ≈ 15-25, A = anomaly score, age_factor = sigmoid of calendar age in days.

---

## 3. Session Record Structure

Each session appended to `session_history[]`. Sessions are immutable once written.

```json
{
  "session_id": "uuid-v4",
  "recorded_at": "ISO-8601 timestamp",
  "duration_ms": "integer",
  "keystroke_count": "integer",
  "device_class": "string (laptop_keyboard|external_mechanical|touchscreen|unknown)",
  "device_fingerprint_hash": "string (sha256 of device characteristics, NOT stored raw)",

  "match_score": "float [0.0, 1.0] (similarity to active_template at time of session)",
  "anomaly_score": "float [0.0, 1.0]",
  "max_signal_zscore": "float (worst single-signal deviation from profile)",
  "signals_exceeding_2sigma": "integer (count of signals with |z| > 2)",

  "accepted": "boolean (did this session pass the identity check)",
  "update_applied": "boolean (did this session update the active_template)",

  "time_of_day_bin": "integer [0-23] (hour of day UTC)",
  "day_of_week": "integer [0-6]",

  "raw_signals_retained": false
}
```

Note: `raw_signals_retained` is always `false` server-side. Session records on the server contain only scores and metadata, never raw timing data. Raw data lives on-device only during the session window and is discarded after the session template update.

**Minimum session validity requirements:**

| Check | Threshold | Purpose |
|---|---|---|
| Keystroke count | >= 50 | Enough data for statistical validity |
| IKI range | 1-500ms per interval | Human physiological bounds |
| KL-divergence vs prior sessions | > 0.001 | Replay detection (not too similar) |
| Typing speed | 0-150 WPM | Human bounds; 500 WPM is not human |
| Session duration | >= 30 seconds | Prevents single-burst spam |

---

## 4. Anchor Template vs. Active Template (Double Serial Model)

Jitter implements the double serial adaptation model from Coli et al. (2019, Computers & Security). Two templates are maintained simultaneously:

### 4.1 Anchor Template

The stable long-term identity reference. Initialized from the first 5 enrollment sessions. Updated infrequently and conservatively.

- **Update policy:** Updated only when the active template drifts > 15% from anchor AND at least 90 days have passed since last anchor update. This captures legitimate long-term skill evolution while resisting poisoning.
- **Purpose:** Drift alarm. If the current session score against the anchor falls below 0.40 while the active template score is high, this signals rapid behavioral change — flag for review.
- **Server-side:** Stored as aggregate statistics (mean, variance, sample count per signal). Never raw timing vectors.

### 4.2 Active Template

The adaptive short-term identity reference. Updated after every successful high-confidence session.

- **Update policy:** Score-gated. Only update if match_score against anchor exceeds the 85th percentile of the enrollment distribution.
- **Update mechanism:** Exponential moving average with alpha = 0.1 (slow adaptation):
  ```
  active_template[signal] = 0.9 * active_template[signal] + 0.1 * session[signal]
  ```
- **Purpose:** Follow legitimate behavioral drift (skill improvement, injury recovery, new device adaptation) without losing the anchored identity.
- **Max drift rate:** Bounded by `delta_max = 3 * (sigma_biological_drift / sqrt(N))`. Sessions causing faster drift than this trigger elevated scrutiny.

### 4.3 Why Two Templates

A single template either drifts too easily (poisoning risk) or rejects legitimate users after months of natural behavioral evolution (usability failure). The double serial model provides:
- **Security:** Anchor is hard to move. An attacker cannot gradually walk the profile toward a target behavior.
- **Usability:** Active template accommodates real behavioral change. A user who improves from 45 to 70 WPM over 6 months is not rejected.
- **Fraud detection:** Divergence between anchor score and active score is itself a signal.

---

## 5. Per-Signal Storage Format

For each of the 14 core v1 signals, the template stores three values: mean, variance, and sample count. This is the Sufficient Statistic representation — enough to compute a match score without retaining raw data.

```json
{
  "signals": {
    "digraph_dd": {
      "pairs": {
        "th": { "mean_ms": 82.3, "variance_ms2": 44.1, "n": 312 },
        "he": { "mean_ms": 74.1, "variance_ms2": 38.7, "n": 289 },
        "er": { "mean_ms": 68.9, "variance_ms2": 52.3, "n": 198 }
      },
      "tracked_pairs": 20
    },
    "negative_flight_frequency": {
      "mean": 0.31,
      "variance": 0.008,
      "n": 847
    },
    "negative_flight_magnitude": {
      "mean_ms": -18.4,
      "variance_ms2": 23.1,
      "n": 263
    },
    "spacebar_dwell": {
      "mean_ms": 94.2,
      "variance_ms2": 187.3,
      "n": 512
    },
    "shift_dwell": {
      "mean_ms": 112.7,
      "variance_ms2": 241.8,
      "n": 89
    },
    "per_key_dwell": {
      "keys": {
        "e": { "mean_ms": 71.3, "variance_ms2": 41.2, "n": 203 },
        "t": { "mean_ms": 68.9, "variance_ms2": 38.7, "n": 189 }
      },
      "tracked_keys": 12
    },
    "speed_cv": {
      "mean": 0.18,
      "variance": 0.004,
      "n": 47
    },
    "error_dynamics_triplet": {
      "rush_phase_iki_ms": { "mean_ms": 52.1, "variance_ms2": 12.3, "n": 341 },
      "error_detection_pause_ms": { "mean_ms": 287.4, "variance_ms2": 1841.2, "n": 341 },
      "correction_iki_ms": { "mean_ms": 89.7, "variance_ms2": 67.4, "n": 341 }
    },
    "shift_hand_preference": {
      "left_shift_ratio": { "mean": 0.34, "variance": 0.009, "n": 89 }
    },
    "pause_distribution": {
      "bin_300_500ms": { "mean": 0.12, "variance": 0.003, "n": 47 },
      "bin_500_1000ms": { "mean": 0.07, "variance": 0.002, "n": 47 },
      "bin_1000ms_plus": { "mean": 0.03, "variance": 0.001, "n": 47 }
    },
    "cognitive_load_correlation": {
      "mean": 0.67,
      "variance": 0.041,
      "n": 47
    },
    "bimanual_asymmetry": {
      "mean": 0.23,
      "variance": 0.018,
      "n": 47
    },
    "entropy_rate": {
      "mean_bits": 4.12,
      "variance": 0.081,
      "n": 47
    },
    "subms_timestamp_fraction": {
      "mean": 0.47,
      "variance": 0.031,
      "n": 2841
    }
  }
}
```

**The 14 core v1 signals:**

| Signal | What It Measures | ICC Stability |
|---|---|---|
| Digraph DD (20 pairs) | Down-down timing for top bigrams | High |
| Negative flight frequency | How often keys overlap | High |
| Negative flight magnitude | How much overlap, in ms | High |
| Spacebar dwell | Space bar hold duration | High |
| Shift dwell | Shift key hold duration | High |
| Per-key dwell (12 keys) | Individual key hold per top-12 keys | Moderate-High |
| Speed CV | Within-session typing speed consistency | Moderate |
| Error dynamics triplet | Rush-error-correction three-phase signature | Moderate-High |
| Shift hand preference | Left vs right shift ratio | High |
| Pause distribution (3 bins) | 300-500ms / 500-1s / 1s+ pause histogram | Moderate |
| Cognitive load correlation | Text complexity vs. pause frequency | Moderate |
| Bi-manual asymmetry | Left vs right hand speed differential | High |
| Entropy rate | Permutation entropy of IKI sequence | High |
| Sub-ms timestamp fraction | Fractional millisecond distribution | High |

---

## 6. Storage Split: On-Device vs. Server-Side

Privacy-preserving architecture. The raw biometric never leaves the device.

### 6.1 On-Device Only (Never Transmitted)

- Raw keystroke timestamps (keydown/keyup events with millisecond precision)
- Per-keystroke timing vectors before aggregation
- Device hardware identifiers used for fingerprinting (stored only as a hash)
- Session-level raw IKI sequences used to compute signal statistics

Retained for: Duration of the active session only. Discarded after the session's signal statistics are computed.

### 6.2 On-Device + Synced to Server

- Session records (match scores, anomaly scores, metadata — see Section 3)
- Active template (aggregated signal statistics: mean, variance, n per signal)
- Passport weight and tier

Sync model: Client computes all matching locally. Server receives the result, not the input.

### 6.3 Server-Side Only

- Passport weight time-series (for trend analysis)
- Anomaly flag history
- Cross-session aggregate analytics (used to detect coordination patterns across passports)
- Session count, calendar age, tier history

### 6.4 Server-Side Never

- Raw keystroke timing sequences
- Per-keystroke dwell or flight values in time-series form
- Device hardware identifiers (only hash of fingerprint is synced)
- Typed text content (Jitter observes timing patterns, not characters)

---

## 7. Data Retention Policy

| Data Type | On-Device Retention | Server-Side Retention |
|---|---|---|
| Raw keystroke events | Session duration only | Never stored |
| Session records | Indefinite (user-controlled) | 24 months rolling |
| Anchor template | Indefinite | 24 months |
| Active template | Indefinite | 24 months |
| Passport weight history | Indefinite | 24 months |
| Anomaly flags | 12 months | 12 months |
| Deleted passport | Immediate purge | 30-day purge window, then gone |

User-initiated passport deletion triggers immediate on-device purge and a server-side deletion request. Server completes purge within 30 days. After deletion, no reconstruction is possible from server-side data (scores cannot be reversed to recover biometrics).

---

## 8. Passport Portability Format (Export / Import)

For v2 federation and user data portability (GDPR Article 20 compliance), a passport export package is defined:

```json
{
  "export_schema_version": "1.0",
  "exported_at": "ISO-8601",
  "passport_id": "uuid-v4",
  "site_id": "string",
  "created_at": "ISO-8601",
  "session_count": "integer",
  "calendar_age_days": "integer",

  "anchor_template": {
    "signals": { "...aggregated statistics only..." }
  },
  "active_template": {
    "signals": { "...aggregated statistics only..." }
  },
  "weight": {
    "value": "float",
    "tier": "string"
  },
  "session_history": [
    {
      "session_id": "uuid",
      "recorded_at": "ISO-8601",
      "match_score": "float",
      "anomaly_score": "float",
      "accepted": "boolean",
      "keystroke_count": "integer",
      "time_of_day_bin": "integer"
    }
  ],

  "export_signature": "HMAC-SHA256 of canonical payload, signed with user's device key",
  "public_key_fingerprint": "string (for import-time verification)"
}
```

**What is NOT included in the export:**
- Raw keystroke timing data (it was never stored)
- Typed text content
- Device hardware identifiers

**Import validation:** Receiving site verifies the export signature before accepting the passport. An unsigned or tampered export is rejected. Weight transfer on import is conservative: a passport imported from another site starts at 70% of its exported weight (trust discount for cross-site transfer; v2 federation handles this more precisely — see federation-model.md).

---

## 9. Estimated Storage Requirements

### Per-Passport (All Signal Templates)

| Component | Estimated Size |
|---|---|
| Anchor template (14 signals, ~20 pairs for digraphs) | ~4 KB |
| Active template (same) | ~4 KB |
| Passport metadata | ~1 KB |
| Total template storage | ~9 KB per passport |

### Per Session Record

| Component | Estimated Size |
|---|---|
| One session record (JSON) | ~500 bytes |
| 100 sessions (1 year typical) | ~50 KB |
| 500 sessions (5-year veteran) | ~250 KB |

### At Scale (Server-Side, Excluding Raw Data)

| Scale | Storage Estimate |
|---|---|
| 10,000 passports | ~590 MB |
| 100,000 passports | ~5.9 GB |
| 1,000,000 passports | ~59 GB |

This is well within standard cloud storage economics. The privacy architecture (no raw biometrics server-side) means storage is dominated by session metadata and aggregated statistics, not raw signals.

---

## 10. Privacy Architecture Summary

The fundamental privacy guarantee of the Jitter data model:

**The server sees scores. It never sees raw biometrics.**

- Keystroke timing → computed on-device → signal statistics (mean/variance/n) → only statistics leave the device
- Match score → computed on-device by comparing session statistics to template → only the score is reported to server
- Typed text content → never observed or stored at any layer

This design means:
1. A server breach exposes session scores and passport weights — not typing patterns
2. Scores cannot be mathematically reversed to recover timing data
3. The passport is a behavioral certificate, not a behavioral recording

---

## Sources

- Coli et al. (2019), "Double Serial Adaptation Mechanism for Keystroke Dynamics" — Computers & Security. Template anchor/active split.
- Rattani et al. (2019), "Adaptive Biometric Systems: Review and Perspectives" — ACM Computing Surveys. Update policy design.
- temporal-fortress-model.md (this research dossier) — Passport weight formula and tier thresholds.
- algorithm-hardening-15-enhancements.md (this research dossier) — 14 core v1 signals.
- keystroke-science-deep-dive.md (this research dossier) — Signal definitions, ICC values, academic baselines.
- GDPR Article 17 (right to erasure), Article 20 (data portability) — retention and export policy.
