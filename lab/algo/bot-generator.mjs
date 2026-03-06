/**
 * 6 bot types that stress-test the matching algorithm.
 * Each generates sessions that try to pass as human.
 */

import { generateSession, getProfile } from './profile-generator.mjs'

// Seeded PRNG
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TRACKED_KEYS = ['e', 't', 'a', 'o', 'i', 'n', 's', 'r', 'h', 'l']
const TRACKED_BIGRAMS = [
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
  'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
]

export const BOT_TYPES = {
  // 1. Playwright default type() — zero delay between keys
  ZERO_DELAY: 'zero_delay',
  // 2. Basic bot with fixed delay
  FIXED_DELAY: 'fixed_delay',
  // 3. Uniform random delay (wrong distribution shape)
  UNIFORM_RANDOM: 'uniform_random',
  // 4. Copies human mean+std but all keys have identical dwell
  GAUSSIAN_MIMIC: 'gaussian_mimic',
  // 5. Exact replay of a captured human session
  REPLAY: 'replay',
  // 6. Matches mean, std, per-key variation, bigram speedups
  SOPHISTICATED: 'sophisticated',
}

// Generate a bot session for a given bot type
export function generateBotSession(botType, seed, targetProfile) {
  const rng = mulberry32(seed)

  switch (botType) {
    case BOT_TYPES.ZERO_DELAY:
      return zeroDelay(rng)
    case BOT_TYPES.FIXED_DELAY:
      return fixedDelay(rng)
    case BOT_TYPES.UNIFORM_RANDOM:
      return uniformRandom(rng)
    case BOT_TYPES.GAUSSIAN_MIMIC:
      return gaussianMimic(rng, targetProfile)
    case BOT_TYPES.REPLAY:
      return replayAttack(seed, targetProfile)
    case BOT_TYPES.SOPHISTICATED:
      return sophisticated(rng, targetProfile)
    default:
      throw new Error(`Unknown bot type: ${botType}`)
  }
}

// Generate raw timing arrays for a bot (for entropy analysis)
export function generateBotTimings(botType, seed, targetProfile, count = 80) {
  const rng = mulberry32(seed)
  const interKeyTimes = []
  const dwellTimes = []

  switch (botType) {
    case BOT_TYPES.ZERO_DELAY:
      for (let i = 0; i < count; i++) {
        interKeyTimes.push(0)
        dwellTimes.push(1)
      }
      break

    case BOT_TYPES.FIXED_DELAY:
      for (let i = 0; i < count; i++) {
        interKeyTimes.push(100)
        dwellTimes.push(1)
      }
      break

    case BOT_TYPES.UNIFORM_RANDOM:
      for (let i = 0; i < count; i++) {
        interKeyTimes.push(50 + rng() * 200) // 50-250 uniform
        dwellTimes.push(1 + rng() * 3)
      }
      break

    case BOT_TYPES.GAUSSIAN_MIMIC: {
      const p = targetProfile || getProfile(0)
      for (let i = 0; i < count; i++) {
        const u1 = rng(), u2 = rng()
        const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2)
        interKeyTimes.push(Math.max(0, p.meanInterKey + z * p.stdInterKey))
        dwellTimes.push(2) // identical dwell = bot signal
      }
      break
    }

    case BOT_TYPES.REPLAY: {
      const p = targetProfile || getProfile(0)
      // Generate a "real" session then replay it exactly
      const { interKeyTimes: real, dwellTimes: realDwell } = replayTimings(seed, p, count)
      return { interKeyTimes: real, dwellTimes: realDwell }
    }

    case BOT_TYPES.SOPHISTICATED: {
      const p = targetProfile || getProfile(0)
      for (let i = 0; i < count; i++) {
        const u1 = rng(), u2 = rng()
        const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2)
        interKeyTimes.push(Math.max(20, p.meanInterKey + z * p.stdInterKey))
        // Tries to mimic per-key variation but with slight uniformity
        const u3 = rng(), u4 = rng()
        const z2 = Math.sqrt(-2 * Math.log(u3 || 0.0001)) * Math.cos(2 * Math.PI * u4)
        dwellTimes.push(Math.max(10, p.meanDwell + z2 * (p.stdDwell * 0.5)))
      }
      break
    }
  }

  return { interKeyTimes, dwellTimes }
}

function replayTimings(seed, profile, count) {
  // Generate one "genuine" set and return it unchanged (perfect replay)
  const rng = mulberry32(seed + 99999) // different seed for the "original"
  const interKeyTimes = []
  const dwellTimes = []
  for (let i = 0; i < count; i++) {
    const u1 = rng(), u2 = rng()
    const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2)
    interKeyTimes.push(Math.max(20, profile.meanInterKey + z * profile.stdInterKey))
    const u3 = rng(), u4 = rng()
    const z2 = Math.sqrt(-2 * Math.log(u3 || 0.0001)) * Math.cos(2 * Math.PI * u4)
    dwellTimes.push(Math.max(10, profile.meanDwell + z2 * profile.stdDwell))
  }
  return { interKeyTimes, dwellTimes }
}

// --- Bot session generators ---

function zeroDelay(rng) {
  return {
    mean_inter_key: 0,
    std_inter_key: 0,
    mean_dwell: 1,
    std_dwell: 0.1,
    mean_dd_time: 0,
    std_dd_time: 0,
    per_key_dwell: Object.fromEntries(TRACKED_KEYS.map(k => [k, 1])),
    bigram_signatures: Object.fromEntries(
      TRACKED_BIGRAMS.map(b => [b, { mean: 0, std: 0, n: 5 }])
    ),
    edit_ratio: 0,
    pause_freq: 0,
    total_keystrokes: 100,
    sample_size: 80,
  }
}

function fixedDelay(rng) {
  return {
    mean_inter_key: 100,
    std_inter_key: 0,
    mean_dwell: 1.5,
    std_dwell: 0.2,
    mean_dd_time: 95,
    std_dd_time: 0,
    per_key_dwell: Object.fromEntries(TRACKED_KEYS.map(k => [k, 1.5])),
    bigram_signatures: Object.fromEntries(
      TRACKED_BIGRAMS.map(b => [b, { mean: 100, std: 0, n: 5 }])
    ),
    edit_ratio: 0,
    pause_freq: 0,
    total_keystrokes: 100,
    sample_size: 80,
  }
}

function uniformRandom(rng) {
  // Uniform distribution: mean ≈ 150, std ≈ 58 (wrong shape — uniform not gaussian)
  return {
    mean_inter_key: 150,
    std_inter_key: 58,
    mean_dwell: 2,
    std_dwell: 0.5,
    mean_dd_time: 143,
    std_dd_time: 55,
    per_key_dwell: Object.fromEntries(TRACKED_KEYS.map(k => [k, 1.5 + rng() * 1])),
    bigram_signatures: Object.fromEntries(
      TRACKED_BIGRAMS.map(b => [b, { mean: 150, std: 58, n: 5 }])
    ),
    edit_ratio: 0,
    pause_freq: 0,
    total_keystrokes: 100,
    sample_size: 80,
  }
}

function gaussianMimic(rng, targetProfile) {
  const p = targetProfile || getProfile(0)
  // Copies mean + std correctly but per-key dwell is suspiciously identical
  const u1 = rng(), u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2)
  const mimicMean = p.meanInterKey + z * (p.stdInterKey * 0.3)

  return {
    mean_inter_key: Math.round(mimicMean * 100) / 100,
    std_inter_key: Math.round(p.stdInterKey * 100) / 100,
    mean_dwell: 2, // bot dwell
    std_dwell: 0.3,
    mean_dd_time: Math.round(mimicMean * 0.95 * 100) / 100,
    std_dd_time: Math.round(p.stdInterKey * 0.9 * 100) / 100,
    // All keys have IDENTICAL dwell — dead giveaway
    per_key_dwell: Object.fromEntries(TRACKED_KEYS.map(k => [k, 2])),
    bigram_signatures: Object.fromEntries(
      TRACKED_BIGRAMS.map(b => [b, {
        mean: Math.round((mimicMean - 10 + rng() * 20) * 100) / 100,
        std: Math.round(p.stdInterKey * 100) / 100,
        n: 5,
      }])
    ),
    edit_ratio: 0,
    pause_freq: 0,
    total_keystrokes: 100,
    sample_size: 80,
  }
}

function replayAttack(seed, targetProfile) {
  // Generate a "genuine" session and return it unchanged
  const p = targetProfile || getProfile(0)
  return generateSession(p, seed + 99999)
}

function sophisticated(rng, targetProfile) {
  const p = targetProfile || getProfile(0)

  // Match mean, std, simulate per-key variation and bigram speedups
  const u1 = rng(), u2 = rng()
  const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2)
  const mimicMean = Math.max(50, p.meanInterKey + z * (p.stdInterKey * 0.15))

  // Per-key dwell with some variation (but less than human)
  const perKeyDwell = {}
  for (let i = 0; i < TRACKED_KEYS.length; i++) {
    const u3 = rng(), u4 = rng()
    const z2 = Math.sqrt(-2 * Math.log(u3 || 0.0001)) * Math.cos(2 * Math.PI * u4)
    perKeyDwell[TRACKED_KEYS[i]] = Math.round(Math.max(20, p.meanDwell + z2 * (p.stdDwell * 0.3)) * 100) / 100
  }

  // Bigrams with speedup pattern
  const bigramSignatures = {}
  for (let i = 0; i < TRACKED_BIGRAMS.length; i++) {
    const speedup = Math.max(0, (10 - i) * 3) // less aggressive than human
    const u3 = rng(), u4 = rng()
    const z2 = Math.sqrt(-2 * Math.log(u3 || 0.0001)) * Math.cos(2 * Math.PI * u4)
    bigramSignatures[TRACKED_BIGRAMS[i]] = {
      mean: Math.round(Math.max(30, mimicMean - speedup + z2 * 10) * 100) / 100,
      std: Math.round(Math.max(5, p.stdInterKey * 0.7 + rng() * 5) * 100) / 100,
      n: Math.floor(3 + rng() * 8),
    }
  }

  return {
    mean_inter_key: Math.round(mimicMean * 100) / 100,
    std_inter_key: Math.round(p.stdInterKey * 100) / 100,
    mean_dwell: Math.round(p.meanDwell * 100) / 100,
    std_dwell: Math.round((p.stdDwell * 0.5) * 100) / 100, // half the human variation
    mean_dd_time: Math.round((mimicMean * 0.95) * 100) / 100,
    std_dd_time: Math.round((p.stdInterKey * 0.85) * 100) / 100,
    per_key_dwell: perKeyDwell,
    bigram_signatures: bigramSignatures,
    edit_ratio: Math.round((p.editRatio * 0.3) * 1000) / 1000, // very low editing
    pause_freq: Math.round((p.pauseFreq * 0.1) * 100) / 100, // almost no pauses
    total_keystrokes: 100,
    sample_size: 80,
  }
}

export function getAllBotTypes() {
  return Object.values(BOT_TYPES)
}
