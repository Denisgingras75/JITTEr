/**
 * 50 synthetic human typing profiles with seeded PRNG.
 * Each profile generates sessions with gaussian noise.
 */

// Seeded PRNG (Mulberry32) for reproducible results
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Box-Muller transform for gaussian random
function gaussianRandom(rng, mean, std) {
  const u1 = rng()
  const u2 = rng()
  const z = Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.cos(2.0 * Math.PI * u2)
  return mean + z * std
}

const TRACKED_KEYS = ['e', 't', 'a', 'o', 'i', 'n', 's', 'r', 'h', 'l']
const TRACKED_BIGRAMS = [
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
  'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
]

// Profile archetypes
const ARCHETYPES = [
  // 10 fast typists
  ...Array(10).fill(null).map((_, i) => ({
    id: `fast-${i}`,
    type: 'fast',
    meanInterKey: 100 + i * 9,   // 100-181
    stdInterKey: 30 + i * 2,     // 30-48
    meanDwell: 60 + i * 5,       // 60-105
    stdDwell: 15 + i * 2,        // 15-33
    editRatio: 0.03 + i * 0.005, // 3-7.5%
    pauseFreq: 1 + i * 0.3,      // 1-3.7 per 100 keys
  })),
  // 20 average typists
  ...Array(20).fill(null).map((_, i) => ({
    id: `avg-${i}`,
    type: 'average',
    meanInterKey: 180 + i * 6,   // 180-294
    stdInterKey: 40 + i * 2,     // 40-78
    meanDwell: 80 + i * 4,       // 80-156
    stdDwell: 20 + i * 2,        // 20-58
    editRatio: 0.05 + i * 0.005, // 5-14.5%
    pauseFreq: 2 + i * 0.3,      // 2-7.7
  })),
  // 10 slow typists
  ...Array(10).fill(null).map((_, i) => ({
    id: `slow-${i}`,
    type: 'slow',
    meanInterKey: 300 + i * 17,  // 300-453
    stdInterKey: 60 + i * 7,     // 60-123
    meanDwell: 120 + i * 10,     // 120-210
    stdDwell: 30 + i * 5,        // 30-75
    editRatio: 0.08 + i * 0.01,  // 8-17%
    pauseFreq: 3 + i * 0.5,      // 3-7.5
  })),
  // 5 mobile typists
  ...Array(5).fill(null).map((_, i) => ({
    id: `mobile-${i}`,
    type: 'mobile',
    meanInterKey: 250 + i * 63,  // 250-502
    stdInterKey: 70 + i * 15,    // 70-130
    meanDwell: 100 + i * 20,     // 100-180
    stdDwell: 35 + i * 10,       // 35-75
    editRatio: 0.12 + i * 0.02,  // 12-20%
    pauseFreq: 4 + i * 0.8,      // 4-7.2
  })),
  // 5 hunt-and-peck typists
  ...Array(5).fill(null).map((_, i) => ({
    id: `hunt-${i}`,
    type: 'hunt-and-peck',
    meanInterKey: 350 + i * 63,  // 350-602
    stdInterKey: 100 + i * 20,   // 100-180
    meanDwell: 150 + i * 20,     // 150-230
    stdDwell: 40 + i * 10,       // 40-80
    editRatio: 0.15 + i * 0.02,  // 15-23%
    pauseFreq: 5 + i * 1,        // 5-9
  })),
]

// Generate a single session sample from a profile archetype
export function generateSession(profile, sessionSeed) {
  const rng = mulberry32(sessionSeed)

  // Apply gaussian noise to profile parameters
  const meanInterKey = Math.max(20, gaussianRandom(rng, profile.meanInterKey, profile.meanInterKey * 0.12))
  const stdInterKey = Math.max(5, gaussianRandom(rng, profile.stdInterKey, profile.stdInterKey * 0.2))
  const meanDwell = Math.max(10, gaussianRandom(rng, profile.meanDwell, profile.meanDwell * 0.15))
  const stdDwell = Math.max(3, gaussianRandom(rng, profile.stdDwell, profile.stdDwell * 0.2))

  // Generate per-key dwell (humans vary by key)
  const perKeyDwell = {}
  for (let i = 0; i < TRACKED_KEYS.length; i++) {
    const key = TRACKED_KEYS[i]
    // Each key has its own characteristic dwell — fast keys like 'e' shorter, slow keys like 'l' longer
    const keyOffset = (i - 5) * 8 // -40 to +40ms offset from mean
    perKeyDwell[key] = Math.round(Math.max(10, gaussianRandom(rng, meanDwell + keyOffset, stdDwell * 0.5)) * 100) / 100
  }

  // Generate bigram signatures (common bigrams are faster)
  const bigramSignatures = {}
  for (let i = 0; i < TRACKED_BIGRAMS.length; i++) {
    const bigram = TRACKED_BIGRAMS[i]
    // More common bigrams get a speed bonus
    const speedBonus = Math.max(0, (10 - i) * 5) // 0-50ms faster for common bigrams
    const bigramMean = Math.max(30, meanInterKey - speedBonus + gaussianRandom(rng, 0, 15))
    bigramSignatures[bigram] = {
      mean: Math.round(bigramMean * 100) / 100,
      std: Math.round(Math.max(5, gaussianRandom(rng, stdInterKey * 0.8, 5)) * 100) / 100,
      n: Math.floor(3 + rng() * 10),
    }
  }

  // DD time (keydown-to-keydown) is close to inter-key time
  const meanDdTime = Math.round((meanInterKey * 0.95) * 100) / 100
  const stdDdTime = Math.round((stdInterKey * 0.9) * 100) / 100

  const totalKeystrokes = Math.floor(50 + rng() * 150) // 50-200
  const editRatio = Math.round(Math.max(0, gaussianRandom(rng, profile.editRatio, 0.02)) * 1000) / 1000
  const pauseFreq = Math.round(Math.max(0, gaussianRandom(rng, profile.pauseFreq, 1)) * 100) / 100

  return {
    mean_inter_key: Math.round(meanInterKey * 100) / 100,
    std_inter_key: Math.round(stdInterKey * 100) / 100,
    mean_dwell: Math.round(meanDwell * 100) / 100,
    std_dwell: Math.round(stdDwell * 100) / 100,
    mean_dd_time: meanDdTime,
    std_dd_time: stdDdTime,
    per_key_dwell: perKeyDwell,
    bigram_signatures: bigramSignatures,
    edit_ratio: editRatio,
    pause_freq: pauseFreq,
    total_keystrokes: totalKeystrokes,
    sample_size: Math.floor(totalKeystrokes * 0.8),
  }
}

// Generate raw timing arrays from a profile (for entropy analysis)
export function generateTimingArrays(profile, sessionSeed, count = 80) {
  const rng = mulberry32(sessionSeed)
  const interKeyTimes = []
  const dwellTimes = []

  for (let i = 0; i < count; i++) {
    interKeyTimes.push(Math.max(20, gaussianRandom(rng, profile.meanInterKey, profile.stdInterKey)))
    dwellTimes.push(Math.max(10, gaussianRandom(rng, profile.meanDwell, profile.stdDwell)))
  }

  return { interKeyTimes, dwellTimes }
}

export function getAllProfiles() {
  return ARCHETYPES
}

export function getProfile(index) {
  return ARCHETYPES[index % ARCHETYPES.length]
}

export function getProfilesByType(type) {
  return ARCHETYPES.filter(p => p.type === type)
}
