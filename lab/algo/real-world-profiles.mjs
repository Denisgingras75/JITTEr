/**
 * Research-backed human typing profiles with 10% buffer on every threshold.
 *
 * Sources:
 *   - 136M keystrokes study (CHI 2018): mean IKI 238.7ms, fast=121.7ms, slow=481ms
 *   - Cambridge mobile study: 36.2 WPM mobile, ~38 WPM two-thumb
 *   - Keystroke biometrics surveys: dwell 75-150ms, SD 20-50ms
 *   - Circadian research: 10-15% speed drop at night
 *   - Yelp/Google stats: power users ~10-20 reviews/month
 *
 * The 10% buffer means: if research says fast humans type at 122ms IKI,
 * we set the "suspicious" threshold at 110ms (10% faster). This prevents
 * flagging legitimate fast typists in a hyper zone.
 */

// ========================================
// THRESHOLDS (research value → +10% buffer)
// ========================================

export const THRESHOLDS = {
  // Inter-key interval (IKI)
  iki: {
    // Research: fastest humans ~60ms in bursts, sustained fast ~122ms
    // Buffer: allow 10% faster → 54ms min
    min_ms: 54,                    // Below this = definitely bot (research: 60ms floor)
    fast_human_mean: 110,          // Research: 121.7ms. Buffer: 110ms
    avg_human_mean: 215,           // Research: 238.7ms. Buffer: 215ms (10% faster)
    slow_human_mean: 433,          // Research: 481ms. Buffer: 433ms
    max_reasonable: 660,           // Research: 600ms hunt-and-peck. Buffer: +10%

    // Standard deviation
    min_std: 9,                    // Research: fast typists SD=12ms. Buffer: 9ms
    fast_human_std: 11,            // Research: 11.96ms
    avg_human_std: 100,            // Research: 111.6ms. Buffer: 100ms
    slow_human_std: 111,           // Research: 123.36ms. Buffer: 111ms
  },

  // Dwell time (how long key is held)
  dwell: {
    // Research: 75-150ms human. Playwright: 1-2ms
    min_ms: 27,                    // Research: ~30ms minimum human. Buffer: 27ms
    avg_desktop: 105,              // Research: ~115ms. Buffer: 105ms (10% wider)
    avg_mobile: 72,                // Research: ~80ms. Buffer: 72ms
    max_ms: 495,                   // Research: 450ms. Buffer: 495ms (+10%)
  },

  // Coefficient of variation (std / mean)
  cv: {
    min_human: 0.09,               // Research: humans ≥ 0.1. Buffer: 0.09
    avg_human: 0.27,               // Research: ~0.3
    max_human: 0.54,               // Research: ~0.5. Buffer: 0.54
  },

  // Shannon entropy of timing arrays
  entropy: {
    min_human: 2.25,               // Research: humans ~2.7. Buffer: 2.25 (10% lower)
    avg_human: 2.70,               // Research: 2.7
  },

  // Per-key dwell uniformity (CV across keys)
  dwell_uniformity: {
    min_human_cv: 0.09,            // Research: ~0.1. Buffer: 0.09
  },

  // Activity / velocity
  activity: {
    max_reviews_per_day: 11,       // Research: power users ~3/day extreme. Buffer: +10% → round up
    max_reviews_per_hour: 4,       // Generous. Research suggests 1-2/hr max sustained
    max_reviews_per_month: 66,     // Research: top 10% ~20/month. Buffer: 66 (generous)
  },

  // Circadian (time-of-day) effects
  circadian: {
    // Research: 10-15% IKI increase at night (fatigue)
    night_slowdown_pct: 0.135,     // Research: 15%. Buffer: 13.5% (allow 10% less drift)
    night_start_hour: 22,          // 10 PM
    night_end_hour: 6,             // 6 AM
    // Afternoon is fastest
    peak_speedup_pct: 0.045,       // Research: ~5% faster in afternoon. Buffer: 4.5%
    peak_start_hour: 14,           // 2 PM
    peak_end_hour: 18,             // 6 PM
  },
}

// ========================================
// RESEARCH-BACKED PROFILE ARCHETYPES
// ========================================

// Seeded PRNG
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

/**
 * 50 profiles built from research distributions.
 * Each archetype has a realistic range derived from the 136M keystroke study.
 */
const ARCHETYPES = [
  // 8 fast desktop typists (top 10% — IKI 110-165ms)
  ...makeArchetypes('fast_desktop', 8, {
    ikiRange: [110, 165], ikiStdRange: [9, 20],
    dwellRange: [68, 105], dwellStdRange: [12, 25],
    editRange: [0.02, 0.06], pauseRange: [0.5, 2.0],
    reviewsPerDay: [0.3, 2], platform: 'desktop',
  }),
  // 16 average desktop typists (middle 60% — IKI 165-330ms)
  ...makeArchetypes('avg_desktop', 16, {
    ikiRange: [165, 330], ikiStdRange: [25, 80],
    dwellRange: [85, 140], dwellStdRange: [18, 40],
    editRange: [0.04, 0.12], pauseRange: [1.5, 5.0],
    reviewsPerDay: [0.1, 1], platform: 'desktop',
  }),
  // 6 slow desktop typists (bottom 20% — IKI 330-500ms)
  ...makeArchetypes('slow_desktop', 6, {
    ikiRange: [330, 500], ikiStdRange: [55, 120],
    dwellRange: [110, 180], dwellStdRange: [25, 55],
    editRange: [0.08, 0.18], pauseRange: [3.0, 8.0],
    reviewsPerDay: [0.05, 0.5], platform: 'desktop',
  }),
  // 12 mobile two-thumb typists (74% of mobile users — IKI 170-350ms)
  ...makeArchetypes('mobile_thumb', 12, {
    ikiRange: [170, 350], ikiStdRange: [35, 95],
    dwellRange: [50, 110], dwellStdRange: [15, 40],
    editRange: [0.10, 0.22], pauseRange: [2.0, 6.0],
    reviewsPerDay: [0.2, 1.5], platform: 'mobile',
  }),
  // 4 mobile single-finger typists (IKI 280-500ms)
  ...makeArchetypes('mobile_finger', 4, {
    ikiRange: [280, 500], ikiStdRange: [60, 130],
    dwellRange: [45, 95], dwellStdRange: [12, 35],
    editRange: [0.12, 0.25], pauseRange: [4.0, 9.0],
    reviewsPerDay: [0.05, 0.3], platform: 'mobile',
  }),
  // 4 power reviewers — fast typists who post a lot (top 10% activity)
  ...makeArchetypes('power_reviewer', 4, {
    ikiRange: [120, 200], ikiStdRange: [12, 35],
    dwellRange: [70, 115], dwellStdRange: [14, 28],
    editRange: [0.03, 0.08], pauseRange: [0.8, 2.5],
    reviewsPerDay: [1, 3], platform: 'desktop',
  }),
]

function makeArchetypes(type, count, config) {
  const result = []
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5 // 0 to 1 interpolation
    result.push({
      id: `${type}-${i}`,
      type,
      platform: config.platform,
      meanInterKey: lerp(config.ikiRange[0], config.ikiRange[1], t),
      stdInterKey: lerp(config.ikiStdRange[0], config.ikiStdRange[1], t),
      meanDwell: lerp(config.dwellRange[0], config.dwellRange[1], t),
      stdDwell: lerp(config.dwellStdRange[0], config.dwellStdRange[1], t),
      editRatio: lerp(config.editRange[0], config.editRange[1], t),
      pauseFreq: lerp(config.pauseRange[0], config.pauseRange[1], t),
      reviewsPerDay: lerp(config.reviewsPerDay[0], config.reviewsPerDay[1], t),
    })
  }
  return result
}

function lerp(a, b, t) {
  return Math.round((a + (b - a) * t) * 100) / 100
}

/**
 * Generate a session with circadian drift applied.
 *
 * @param {object} profile - Archetype profile
 * @param {number} seed - Session seed for reproducibility
 * @param {number} hourOfDay - 0-23, affects typing speed
 * @returns {object} Jitter sample data
 */
export function generateRealisticSession(profile, seed, hourOfDay = 14) {
  const rng = mulberry32(seed)

  // Apply circadian modifier to IKI
  let circadianMultiplier = 1.0
  if (hourOfDay >= THRESHOLDS.circadian.night_start_hour || hourOfDay < THRESHOLDS.circadian.night_end_hour) {
    // Night: slower (fatigue)
    circadianMultiplier = 1 + THRESHOLDS.circadian.night_slowdown_pct * (0.7 + rng() * 0.6)
  } else if (hourOfDay >= THRESHOLDS.circadian.peak_start_hour && hourOfDay < THRESHOLDS.circadian.peak_end_hour) {
    // Afternoon peak: slightly faster
    circadianMultiplier = 1 - THRESHOLDS.circadian.peak_speedup_pct * (0.5 + rng() * 1.0)
  }

  // Base metrics with noise
  const meanInterKey = Math.max(THRESHOLDS.iki.min_ms,
    gaussianRandom(rng, profile.meanInterKey * circadianMultiplier, profile.meanInterKey * 0.12))
  const stdInterKey = Math.max(THRESHOLDS.iki.min_std,
    gaussianRandom(rng, profile.stdInterKey, profile.stdInterKey * 0.2))
  const meanDwell = Math.max(THRESHOLDS.dwell.min_ms,
    gaussianRandom(rng, profile.meanDwell, profile.meanDwell * 0.15))
  const stdDwell = Math.max(3,
    gaussianRandom(rng, profile.stdDwell, profile.stdDwell * 0.2))

  // Per-key dwell with natural variation (humans: CV > 0.09)
  const perKeyDwell = {}
  for (let i = 0; i < TRACKED_KEYS.length; i++) {
    const key = TRACKED_KEYS[i]
    // Vowels are faster, consonants vary — based on finger positioning research
    const isVowel = 'aeiou'.includes(key)
    const keyOffset = isVowel ? -12 : (i - 5) * 6
    perKeyDwell[key] = r2(Math.max(THRESHOLDS.dwell.min_ms * 0.8,
      gaussianRandom(rng, meanDwell + keyOffset, stdDwell * 0.6)))
  }

  // Bigram signatures — common bigrams are genuinely faster (muscle memory)
  const bigramSignatures = {}
  for (let i = 0; i < TRACKED_BIGRAMS.length; i++) {
    const bigram = TRACKED_BIGRAMS[i]
    const rank = i + 1 // 1 = most common
    const speedBonus = Math.max(0, (15 - rank) * 4) // up to 56ms faster
    const bigramMean = Math.max(40, meanInterKey - speedBonus + gaussianRandom(rng, 0, 12))
    bigramSignatures[bigram] = {
      mean: r2(bigramMean),
      std: r2(Math.max(5, gaussianRandom(rng, stdInterKey * 0.75, 5))),
      n: Math.floor(3 + rng() * 10),
    }
  }

  const meanDdTime = r2(meanInterKey * 0.95)
  const stdDdTime = r2(stdInterKey * 0.9)
  const totalKeystrokes = Math.floor(50 + rng() * 150)
  const editRatio = r3(Math.max(0, gaussianRandom(rng, profile.editRatio, 0.02)))
  const pauseFreq = r2(Math.max(0, gaussianRandom(rng, profile.pauseFreq, 0.8)))

  return {
    mean_inter_key: r2(meanInterKey),
    std_inter_key: r2(stdInterKey),
    mean_dwell: r2(meanDwell),
    std_dwell: r2(stdDwell),
    mean_dd_time: meanDdTime,
    std_dd_time: stdDdTime,
    per_key_dwell: perKeyDwell,
    bigram_signatures: bigramSignatures,
    edit_ratio: editRatio,
    pause_freq: pauseFreq,
    total_keystrokes: totalKeystrokes,
    sample_size: Math.floor(totalKeystrokes * 0.8),
    // Metadata (not sent to DB, used in simulation)
    _hour: hourOfDay,
    _circadian_mult: r3(circadianMultiplier),
    _platform: profile.platform,
  }
}

/**
 * Simulate a user's review activity over N days.
 * Returns array of sessions with realistic temporal distribution.
 */
export function simulateUserOverTime(profile, days, seed) {
  const rng = mulberry32(seed)
  const sessions = []

  for (let day = 0; day < days; day++) {
    // How many reviews today? Poisson-ish distribution based on reviewsPerDay
    const lambda = profile.reviewsPerDay
    let reviewsToday = 0
    let p = Math.exp(-lambda)
    let cdf = p
    const u = rng()
    while (u > cdf && reviewsToday < THRESHOLDS.activity.max_reviews_per_day) {
      reviewsToday++
      p *= lambda / reviewsToday
      cdf += p
    }

    // Generate sessions at random hours (weighted toward evening for food reviews)
    for (let r = 0; r < reviewsToday; r++) {
      // Food review timing: weighted toward lunch (11-14) and dinner (18-22)
      const hourRoll = rng()
      let hour
      if (hourRoll < 0.15) {
        hour = Math.floor(8 + rng() * 3)   // 8-10 AM (breakfast)
      } else if (hourRoll < 0.35) {
        hour = Math.floor(11 + rng() * 3)  // 11 AM - 1 PM (lunch)
      } else if (hourRoll < 0.75) {
        hour = Math.floor(18 + rng() * 4)  // 6-9 PM (dinner — peak)
      } else {
        hour = Math.floor(14 + rng() * 4)  // 2-5 PM (afternoon)
      }

      const sessionSeed = seed * 10000 + day * 100 + r
      const session = generateRealisticSession(profile, sessionSeed, hour)
      session._day = day
      session._review_num = r
      sessions.push(session)
    }
  }

  return sessions
}

export function getAllRealisticProfiles() {
  return ARCHETYPES
}

export function getRealisticProfile(index) {
  return ARCHETYPES[index % ARCHETYPES.length]
}

export function getProfilesByPlatform(platform) {
  return ARCHETYPES.filter(p => p.platform === platform)
}

function r2(v) { return Math.round(v * 100) / 100 }
function r3(v) { return Math.round(v * 1000) / 1000 }
