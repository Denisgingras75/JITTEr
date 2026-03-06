/**
 * Pure JS port of merge_jitter_sample() trigger from schema.sql (lines 2054-2197).
 * Faithful to the original: same weighted running average, same consistency formula.
 *
 * This is the algorithm we're stress-testing.
 */

/**
 * Simulates a jitter profile — the running aggregate stored in jitter_profiles.
 */
export function createEmptyProfile() {
  return {
    profileData: null,
    reviewCount: 0,
    confidenceLevel: 'none',
    consistencyScore: 0,
    sessionHashes: new Set(), // fingerprints of all ingested sessions
  }
}

/**
 * Generate a fingerprint for a session based on its timing metrics.
 * Two sessions with identical timing produce the same hash.
 * In production this would be a proper hash of raw timing arrays.
 * Here we simulate it with a deterministic string from aggregated stats.
 */
function sessionFingerprint(sample) {
  // Round to avoid floating-point noise — same session always hashes the same
  const parts = [
    Math.round((sample.mean_inter_key || 0) * 100),
    Math.round((sample.std_inter_key || 0) * 100),
    Math.round((sample.mean_dwell || 0) * 100),
    Math.round((sample.std_dwell || 0) * 100),
    Math.round((sample.mean_dd_time || 0) * 100),
    Math.round((sample.edit_ratio || 0) * 10000),
    Math.round((sample.pause_freq || 0) * 1000),
    sample.total_keystrokes || 0,
  ]
  // Add per-key dwell values for stronger fingerprint
  if (sample.per_key_dwell) {
    const keys = Object.keys(sample.per_key_dwell).sort()
    for (const k of keys) {
      parts.push(Math.round(sample.per_key_dwell[k] * 100))
    }
  }
  return parts.join(':')
}

/**
 * Port of merge_jitter_sample() trigger.
 * Mutates the profile in place (like the DB trigger does).
 *
 * @param {object} profile - The user's jitter profile (mutable)
 * @param {object} newSample - The new jitter sample (sample_data JSONB)
 * @returns {object} The updated profile
 */
export function mergeSample(profile, newSample) {
  // Store session fingerprint for replay detection
  const hash = sessionFingerprint(newSample)
  if (!profile.sessionHashes) profile.sessionHashes = new Set()
  profile.sessionHashes.add(hash)

  if (profile.reviewCount === 0) {
    // First sample: create profile directly from sample
    profile.profileData = { ...newSample }
    profile.reviewCount = 1
    profile.confidenceLevel = 'low'
    profile.consistencyScore = 0
    return profile
  }

  const existingProfile = profile.profileData
  const sampleCount = profile.reviewCount + 1

  // Determine confidence level
  let newConfidence
  if (sampleCount >= 15) {
    newConfidence = 'high'
  } else if (sampleCount >= 5) {
    newConfidence = 'medium'
  } else {
    newConfidence = 'low'
  }

  // Calculate consistency: compare new sample's mean_inter_key to running profile's
  // Consistency = 1 - normalized_deviation (higher = more consistent)
  let newConsistency = 0
  if (
    existingProfile.mean_inter_key !== undefined &&
    newSample.mean_inter_key !== undefined &&
    existingProfile.mean_inter_key > 0
  ) {
    newConsistency = Math.max(0, Math.min(1,
      1.0 - Math.abs(
        newSample.mean_inter_key - existingProfile.mean_inter_key
      ) / existingProfile.mean_inter_key
    ))

    // Weighted running average with existing consistency
    if (profile.consistencyScore > 0) {
      newConsistency = (
        profile.consistencyScore * (sampleCount - 1) + newConsistency
      ) / sampleCount
    }
  }

  // Merge: running weighted average of key metrics
  const merged = {
    mean_inter_key: round(
      (coalesce(existingProfile.mean_inter_key, 0) * (sampleCount - 1) +
        coalesce(newSample.mean_inter_key, 0)) / sampleCount,
      2
    ),
    std_inter_key: round(
      (coalesce(existingProfile.std_inter_key, 0) * (sampleCount - 1) +
        coalesce(newSample.std_inter_key, 0)) / sampleCount,
      2
    ),
  }

  // Optional fields — only merge if present in new sample
  merged.mean_dwell = mergeOptional(existingProfile, newSample, 'mean_dwell', sampleCount, 2)
  merged.std_dwell = mergeOptional(existingProfile, newSample, 'std_dwell', sampleCount, 2)
  merged.mean_dd_time = mergeOptional(existingProfile, newSample, 'mean_dd_time', sampleCount, 2)
  merged.std_dd_time = mergeOptional(existingProfile, newSample, 'std_dd_time', sampleCount, 2)
  merged.edit_ratio = mergeOptional(existingProfile, newSample, 'edit_ratio', sampleCount, 3)
  merged.pause_freq = mergeOptional(existingProfile, newSample, 'pause_freq', sampleCount, 2)

  // per_key_dwell: simple merge (new keys overwrite old — matches JSONB || behavior)
  merged.per_key_dwell = {
    ...(existingProfile.per_key_dwell || {}),
    ...(newSample.per_key_dwell || {}),
  }

  // bigram_signatures: simple merge
  merged.bigram_signatures = {
    ...(existingProfile.bigram_signatures || {}),
    ...(newSample.bigram_signatures || {}),
  }

  // total_keystrokes: cumulative sum
  merged.total_keystrokes =
    (existingProfile.total_keystrokes || 0) + (newSample.total_keystrokes || 0)

  profile.profileData = merged
  profile.reviewCount = sampleCount
  profile.confidenceLevel = newConfidence
  profile.consistencyScore = round(newConsistency, 3)

  return profile
}

/**
 * Feed multiple sessions into a profile sequentially.
 * Returns the profile after all sessions are merged.
 */
export function buildProfile(sessions) {
  const profile = createEmptyProfile()
  for (let i = 0; i < sessions.length; i++) {
    mergeSample(profile, sessions[i])
  }
  return profile
}

/**
 * Check a new sample against an existing profile.
 * Returns the consistency score that would result.
 */
export function checkConsistency(profile, newSample) {
  if (!profile.profileData || profile.reviewCount === 0) return 0
  const existing = profile.profileData

  if (existing.mean_inter_key > 0 && newSample.mean_inter_key !== undefined) {
    return Math.max(0, Math.min(1,
      1.0 - Math.abs(newSample.mean_inter_key - existing.mean_inter_key) / existing.mean_inter_key
    ))
  }
  return 0
}

// ========================================
// HARDENED ENGINE v2 — layered bot detection
// ========================================
// Goals: 95%+ detection on all 6 bot types, <1% false positive on humans

import { THRESHOLDS } from './real-world-profiles.mjs'

/**
 * Score a session sample for bot signals.
 * Returns { passed, flags[], score 0-1 (1 = definitely human) }
 *
 * 7 layers, each independent. Any single flag = suspicious.
 * 2+ flags = rejected. This layering means a bot must beat ALL checks.
 */
export function scoreSession(sample, profile) {
  const flags = []
  let score = 1.0

  // --- Layer 0: Session Hash Dedup ---
  // If we've seen this exact session before, it's a replay. Instant reject.
  // This is the primary replay defense — algorithm-level heuristics can't
  // detect replays because they ARE genuine human sessions.
  if (profile && profile.sessionHashes) {
    const hash = sessionFingerprint(sample)
    if (profile.sessionHashes.has(hash)) {
      return {
        passed: false,
        suspicious: false,
        flagCount: 1,
        flags: [{ check: 'session_duplicate', value: 'exact match in profile history', threshold: 'unique session required' }],
        score: 0,
        verdict: 'replay_detected',
      }
    }
  }

  // --- Layer 1: Dwell Time Floor ---
  // Playwright press() = 1-2ms. Humans = 27ms+ (buffered from 30ms research)
  if (sample.mean_dwell !== undefined && sample.mean_dwell !== null) {
    if (sample.mean_dwell < THRESHOLDS.dwell.min_ms) {
      flags.push({ check: 'dwell_floor', value: sample.mean_dwell, threshold: THRESHOLDS.dwell.min_ms })
      score -= 0.4
    }
  }

  // --- Layer 2: Variance Floor ---
  // Fixed-delay bots have std=0. Fastest humans have std >= 9ms (buffered from 12ms)
  if (sample.std_inter_key !== undefined) {
    if (sample.std_inter_key < THRESHOLDS.iki.min_std) {
      flags.push({ check: 'variance_floor', value: sample.std_inter_key, threshold: THRESHOLDS.iki.min_std })
      score -= 0.3
    }
  }

  // --- Layer 3: IKI Floor ---
  // No human types faster than 54ms sustained (buffered from 60ms)
  if (sample.mean_inter_key !== undefined) {
    if (sample.mean_inter_key < THRESHOLDS.iki.min_ms) {
      flags.push({ check: 'iki_floor', value: sample.mean_inter_key, threshold: THRESHOLDS.iki.min_ms })
      score -= 0.5
    }
  }

  // --- Layer 4: Per-Key Dwell Uniformity ---
  // Bots have identical dwell across all keys (CV ≈ 0). Humans vary (CV > 0.09)
  // CV < 0.05 is a HARD signal — no human types with that uniformity across 10 keys
  if (sample.per_key_dwell) {
    const values = Object.values(sample.per_key_dwell)
    if (values.length >= 3) {
      const m = values.reduce((a, b) => a + b, 0) / values.length
      if (m > 0) {
        const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
        const cv = Math.sqrt(variance) / m
        if (cv < 0.05) {
          // Extremely uniform — definite bot signal, counts as 2 flags
          flags.push({ check: 'dwell_uniformity_hard', value: round(cv, 4), threshold: '> 0.05' })
          flags.push({ check: 'dwell_uniformity', value: round(cv, 4), threshold: THRESHOLDS.dwell_uniformity.min_human_cv })
          score -= 0.5
        } else if (cv < THRESHOLDS.dwell_uniformity.min_human_cv) {
          flags.push({ check: 'dwell_uniformity', value: round(cv, 4), threshold: THRESHOLDS.dwell_uniformity.min_human_cv })
          score -= 0.25
        }
      }
    }
  }

  // --- Layer 5: Coefficient of Variation ---
  // CV = std/mean. Bots with fixed or zero delay have CV ≈ 0. Humans ≥ 0.09
  // Exception: fast typists (IKI < 170ms) naturally have lower CV because they're
  // more consistent. Only flag CV if it's below 0.06 for fast typists.
  if (sample.mean_inter_key > 0 && sample.std_inter_key !== undefined) {
    const cv = sample.std_inter_key / sample.mean_inter_key
    const isFastTypist = sample.mean_inter_key < 170
    const cvThreshold = isFastTypist ? 0.06 : THRESHOLDS.cv.min_human
    if (cv < cvThreshold) {
      flags.push({ check: 'cv_floor', value: round(cv, 4), threshold: cvThreshold })
      score -= 0.2
    }
  }

  // --- Layer 6: Behavioral Signals ---
  // Bots have suspiciously low editing and no pauses.
  // Real humans: avg edit_ratio 3-18%, pause_freq 1-9 per 100 keys.
  // Night humans can have pause=0 but still have edits.
  if (sample.total_keystrokes > 30) {
    const editZero = sample.edit_ratio !== undefined && sample.edit_ratio === 0
    const pauseZero = sample.pause_freq !== undefined && sample.pause_freq === 0

    if (editZero && pauseZero) {
      flags.push({
        check: 'zero_humanity',
        value: `edit=0, pause=0, keys=${sample.total_keystrokes}`,
        threshold: 'nonzero expected',
      })
      score -= 0.3
    } else {
      // Sophisticated bots produce edit < 0.03 AND pause < 0.4 together.
      // Night humans: edit can be low (0.006-0.03) but pause stays high (0.4+),
      // or pause can drop but edit stays normal.
      // The COMBINATION is the signal — only bots have both at these levels.
      // EXCEPTION: genuinely fast typists (IKI < 125ms) naturally have low edit/pause.
      // 125ms cutoff: research fast humans at ~122ms mean. Only the truly elite
      // typists get exempted — everyone else gets checked.
      const isFastTypist = sample.mean_inter_key > 0 && sample.mean_inter_key < 125
      if (!isFastTypist) {
        const editLow = sample.edit_ratio !== undefined && sample.edit_ratio < 0.03
        const pauseLow = sample.pause_freq !== undefined && sample.pause_freq < 0.4

        if (editLow && pauseLow) {
          flags.push({
            check: 'low_humanity',
            value: `edit=${sample.edit_ratio}, pause=${sample.pause_freq}`,
            threshold: 'edit>0.03 OR pause>=0.4',
          })
          score -= 0.25
        }
      }
    }
  }

  // --- Layer 6b: Dwell Std Floor ---
  // Sophisticated bots have std_dwell 6-12ms. Humans have 10-22ms+.
  // This is the key separator — bots can't fake dwell time VARIANCE.
  if (sample.std_dwell !== undefined && sample.std_dwell !== null) {
    if (sample.std_dwell < 8) {
      // Hard floor — no human has std_dwell this low
      flags.push({ check: 'dwell_std_floor', value: sample.std_dwell, threshold: '> 8ms' })
      score -= 0.3
    } else if (sample.std_dwell < 11) {
      // Soft floor — suspicious. Research: fast humans std_dwell ~12ms.
      // 11ms threshold gives 1ms buffer for fastest legitimate typists.
      flags.push({ check: 'dwell_std_low', value: sample.std_dwell, threshold: '> 11ms' })
      score -= 0.15
    }

  }

  // --- Layer 7: Sample Dedup (replay detection) ---
  // If we have an existing profile, check for suspiciously identical samples
  if (profile && profile.profileData && profile.reviewCount >= 3) {
    const existing = profile.profileData
    // Check if sample is a near-exact copy of the profile (replay attack)
    if (existing.mean_inter_key > 0 && sample.mean_inter_key !== undefined) {
      const ikiDiff = Math.abs(sample.mean_inter_key - existing.mean_inter_key)
      const stdDiff = Math.abs((sample.std_inter_key || 0) - (existing.std_inter_key || 0))
      const dwellDiff = Math.abs((sample.mean_dwell || 0) - (existing.mean_dwell || 0))

      // Score how many metrics are suspiciously close to the profile
      // Real humans have session-to-session noise. Replays don't.
      // Tight tolerances to avoid FPs. Real replay defense is DB-level hash dedup.
      // This algorithm check catches the obvious replays without false-flagging
      // consistent human typists.
      let closeMetrics = 0
      if (existing.mean_inter_key > 0 && ikiDiff / existing.mean_inter_key < 0.03) closeMetrics++
      if (existing.std_inter_key > 0 && stdDiff / existing.std_inter_key < 0.05) closeMetrics++
      if (existing.mean_dwell > 0 && dwellDiff / existing.mean_dwell < 0.05) closeMetrics++

      // Also check dd_time and edit_ratio
      const ddDiff = Math.abs((sample.mean_dd_time || 0) - (existing.mean_dd_time || 0))
      if (existing.mean_dd_time > 0 && ddDiff / existing.mean_dd_time < 0.03) closeMetrics++

      const editDiff = Math.abs((sample.edit_ratio || 0) - (existing.edit_ratio || 0))
      if (existing.edit_ratio > 0 && editDiff / existing.edit_ratio < 0.05) closeMetrics++

      // Also check per-key dwell correlation — replays have near-identical patterns
      if (existing.per_key_dwell && sample.per_key_dwell) {
        const sharedKeys = Object.keys(existing.per_key_dwell).filter(k => sample.per_key_dwell[k] !== undefined)
        if (sharedKeys.length >= 5) {
          let closeKeyDwells = 0
          for (const k of sharedKeys) {
            const diff = Math.abs(existing.per_key_dwell[k] - sample.per_key_dwell[k])
            if (existing.per_key_dwell[k] > 0 && diff / existing.per_key_dwell[k] < 0.05) {
              closeKeyDwells++
            }
          }
          // If 80%+ of keys match within 5%, add to close metrics
          if (closeKeyDwells / sharedKeys.length >= 0.8) closeMetrics += 2
        }
      }

      // 4+ metrics within tight tolerance = replay
      if (closeMetrics >= 4) {
        flags.push({ check: 'replay_detected', value: `${closeMetrics} metrics match profile`, threshold: '<4 expected' })
        score -= 0.5
      }
    }

    // Check consistency — flag only EXTREME consistency
    // Raised to 0.998 to avoid catching consistent fast typists
    const consistency = checkConsistency(profile, sample)
    if (consistency >= 0.998 && profile.reviewCount >= 5) {
      flags.push({ check: 'perfect_consistency', value: round(consistency, 4), threshold: '< 0.998' })
      score -= 0.15
    }
  }

  // --- Layer 8: Bigram Analysis ---
  // Human bigrams: common pairs (th, he) are faster than mean. Bots have flat/identical timing
  if (sample.bigram_signatures && sample.mean_inter_key > 0) {
    const bigrams = Object.values(sample.bigram_signatures)
    if (bigrams.length >= 5) {
      // Check if all bigram means are identical (within 2%)
      const bigramMeans = bigrams.map(b => b.mean).filter(m => m > 0)
      if (bigramMeans.length >= 5) {
        const bigramAvg = bigramMeans.reduce((a, b) => a + b, 0) / bigramMeans.length
        const bigramMaxDev = Math.max(...bigramMeans.map(m => Math.abs(m - bigramAvg) / bigramAvg))
        if (bigramMaxDev < 0.02) {
          flags.push({ check: 'flat_bigrams', value: round(bigramMaxDev, 4), threshold: '> 0.02 variation' })
          score -= 0.2
        }
      }

      // Check if common bigrams are faster than rare ones (should be for humans)
      // Top 5 bigrams should average faster than bottom 5
      const sortedEntries = Object.entries(sample.bigram_signatures)
      if (sortedEntries.length >= 10) {
        const topBigrams = ['th', 'he', 'in', 'er', 'an']
        const bottomBigrams = ['al', 'ar', 'st', 'to', 'nt']
        const topMeans = topBigrams.map(b => sample.bigram_signatures[b]?.mean).filter(m => m > 0)
        const bottomMeans = bottomBigrams.map(b => sample.bigram_signatures[b]?.mean).filter(m => m > 0)

        if (topMeans.length >= 3 && bottomMeans.length >= 3) {
          const topAvg = topMeans.reduce((a, b) => a + b, 0) / topMeans.length
          const bottomAvg = bottomMeans.reduce((a, b) => a + b, 0) / bottomMeans.length
          // For humans, top bigrams should be at least 5% faster
          if (topAvg >= bottomAvg) {
            flags.push({ check: 'no_bigram_speedup', value: `top=${round(topAvg, 1)} >= bottom=${round(bottomAvg, 1)}`, threshold: 'top < bottom' })
            score -= 0.1
          }
        }
      }
    }
  }

  // --- Layer 9: Composite Suspicion ---
  // Sophisticated bots pass each individual check by a tiny margin.
  // If 3+ metrics are in the "barely passed" zone, that itself is suspicious.
  // Real humans are variable — they're rarely borderline on ALL metrics at once.
  if (flags.length === 1 && sample.total_keystrokes > 30) {
    let borderlineCount = 0

    // Check edit_ratio borderline (threshold: 0.03, borderline: 0.03-0.05)
    if (sample.edit_ratio !== undefined && sample.edit_ratio >= 0.03 && sample.edit_ratio < 0.05) {
      borderlineCount++
    }
    // Check pause_freq borderline (threshold: 0.4, borderline: 0.4-0.6)
    if (sample.pause_freq !== undefined && sample.pause_freq >= 0.4 && sample.pause_freq < 0.6) {
      borderlineCount++
    }
    // Check dwell uniformity borderline (threshold: 0.09, borderline: 0.09-0.12)
    if (sample.per_key_dwell) {
      const values = Object.values(sample.per_key_dwell).filter(v => v > 0)
      if (values.length >= 5) {
        const m = values.reduce((a, b) => a + b, 0) / values.length
        const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length
        const cv = Math.sqrt(variance) / m
        if (cv >= 0.09 && cv < 0.12) borderlineCount++
      }
    }
    // Check std_dwell borderline (threshold: 11ms, borderline: 11-14ms)
    if (sample.std_dwell !== undefined && sample.std_dwell >= 11 && sample.std_dwell < 14) {
      borderlineCount++
    }

    // 2+ borderline metrics + 1 existing flag = likely bot
    // Sophisticated bots are barely outside each threshold. Real humans
    // don't cluster near multiple thresholds simultaneously.
    if (borderlineCount >= 2) {
      flags.push({
        check: 'composite_suspicion',
        value: `${borderlineCount} borderline metrics`,
        threshold: '< 3 borderline',
      })
      score -= 0.15
    }
  }

  score = Math.max(0, Math.min(1, score))

  return {
    passed: flags.length < 2,     // 0-1 flags = pass, 2+ = reject
    suspicious: flags.length === 1, // 1 flag = suspicious, watch list
    flagCount: flags.length,
    flags,
    score: round(score, 3),
    verdict: flags.length === 0 ? 'clean' :
             flags.length === 1 ? 'suspicious' :
             flags.length <= 3 ? 'likely_bot' : 'definite_bot',
  }
}

// --- Helpers ---

function coalesce(val, fallback) {
  return val !== undefined && val !== null ? val : fallback
}

function round(val, decimals) {
  const factor = Math.pow(10, decimals)
  return Math.round(val * factor) / factor
}

function mergeOptional(existing, newSample, field, sampleCount, decimals) {
  if (newSample[field] !== undefined && newSample[field] !== null) {
    return round(
      (coalesce(existing[field], newSample[field]) * (sampleCount - 1) +
        newSample[field]) / sampleCount,
      decimals
    )
  }
  return existing[field]
}
