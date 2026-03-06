import { logger } from './logger'

// Detection thresholds (from patent spec + research)
const DWELL_FLOOR = 27        // 10% buffer below 30ms human minimum
const VARIANCE_FLOOR = 9      // 10% buffer below 12ms human minimum
const PER_KEY_CV_FLOOR = 0.09 // humans vary per key
const EDIT_RATIO_FLOOR = 0.03 // humans make mistakes
const PAUSE_FREQ_FLOOR = 0.4  // pauses per 100 keystrokes
const DWELL_STD_HARD = 8      // definitive bot
const DWELL_STD_SOFT = 11     // suspicious

/**
 * Score a jitter session profile for liveness detection.
 * Pure function — no React, no DB, no side effects.
 *
 * @param {Object} profile - from getJitterProfile()
 * @returns {{ score: number, flags: string[], classification: string }}
 *   score: 0.0 (bot) to 1.0 (human)
 *   flags: which layers flagged
 *   classification: 'human' | 'suspicious' | 'bot'
 */
export function scoreSession(profile) {
  if (!profile) {
    return { score: 1.0, flags: [], classification: 'human' }
  }

  const flags = []

  // Layer 1: Dwell time floor — bots press keys for <27ms
  if (profile.mean_dwell != null && profile.mean_dwell < DWELL_FLOOR) {
    flags.push('dwell_floor')
  }

  // Layer 2: Variance floor — bots have unnaturally consistent inter-key timing
  if (profile.std_inter_key != null && profile.std_inter_key < VARIANCE_FLOOR) {
    flags.push('variance_floor')
  }

  // Layer 3: Per-key uniformity — humans press different keys for different durations
  const perKeyValues = Object.values(profile.per_key_dwell || {})
  if (perKeyValues.length >= 3) {
    const mean = perKeyValues.reduce((a, b) => a + b, 0) / perKeyValues.length
    if (mean > 0) {
      const variance = perKeyValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / perKeyValues.length
      const cv = Math.sqrt(variance) / mean
      if (cv < PER_KEY_CV_FLOOR) {
        flags.push('per_key_uniformity')
      }
    }
  }

  // Layer 4: Behavioral editing — humans make typos and pause to think
  if (
    profile.edit_ratio != null && profile.pause_freq != null &&
    profile.edit_ratio < EDIT_RATIO_FLOOR && profile.pause_freq < PAUSE_FREQ_FLOOR
  ) {
    flags.push('no_editing_behavior')
  }

  // Layer 5: Dwell time std — very low std = robotic key press durations
  if (profile.std_dwell != null) {
    if (profile.std_dwell < DWELL_STD_HARD) {
      flags.push('dwell_std_hard')
    } else if (profile.std_dwell < DWELL_STD_SOFT) {
      flags.push('dwell_std_soft')
    }
  }

  // Layer 6: Bigram rhythm — humans type common bigrams faster than uncommon ones
  const sigs = profile.bigram_signatures || {}
  const bigramEntries = Object.entries(sigs)
  if (bigramEntries.length >= 4) {
    const means = bigramEntries.map(([, v]) => v.mean)
    const bigramMean = means.reduce((a, b) => a + b, 0) / means.length
    if (bigramMean > 0) {
      const bigramVariance = means.reduce((sum, m) => sum + (m - bigramMean) ** 2, 0) / means.length
      const bigramCv = Math.sqrt(bigramVariance) / bigramMean
      // Bots type all bigrams at the same speed — CV < 0.08 is suspicious
      if (bigramCv < 0.08) {
        flags.push('bigram_uniform')
      }
    }
  }

  // Scoring: 0 flags = human, 1 = suspicious, 2+ = bot
  let score
  let classification
  if (flags.length === 0) {
    score = 1.0
    classification = 'human'
  } else if (flags.length === 1) {
    score = 0.5
    classification = 'suspicious'
  } else {
    score = 0.0
    classification = 'bot'
  }

  if (flags.length > 0) {
    logger.info('Jitter scoring flags:', flags)
  }

  return { score, flags, classification }
}
