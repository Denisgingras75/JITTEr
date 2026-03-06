/**
 * 5 test categories × 200 runs each = 1000 algorithm simulations.
 * Pure computation — no network, no browser, runs in seconds.
 */

import { createEmptyProfile, mergeSample, buildProfile, checkConsistency } from './matching-engine.mjs'
import { generateSession, generateTimingArrays, getAllProfiles, getProfile } from './profile-generator.mjs'
import { generateBotSession, generateBotTimings, getAllBotTypes, BOT_TYPES } from './bot-generator.mjs'
import { shannonEntropy, coefficientOfVariation, dwellUniformity } from './entropy.mjs'

const RUNS_PER_CATEGORY = 200

export function runAllTests() {
  const results = {
    sameUser: runSameUserTests(),
    crossUser: runCrossUserTests(),
    botDetection: runBotDetectionTests(),
    replayAttack: runReplayAttackTests(),
    noiseDegradation: runNoiseDegradationTests(),
  }

  return results
}

// ========================================
// Category 1: Same-user consistency
// Feed 10 sessions from same profile, track convergence
// ========================================
function runSameUserTests() {
  const sessionsToTrusted = []
  const convergenceRates = []

  for (let run = 0; run < RUNS_PER_CATEGORY; run++) {
    const profileIdx = run % 50
    const humanProfile = getProfile(profileIdx)
    const profile = createEmptyProfile()

    let reachedHigh = false
    let sessionsNeeded = 0

    for (let session = 0; session < 20; session++) {
      const sample = generateSession(humanProfile, run * 1000 + session)
      mergeSample(profile, sample)

      if (!reachedHigh && profile.confidenceLevel === 'high') {
        reachedHigh = true
        sessionsNeeded = session + 1
      }
    }

    if (reachedHigh) {
      sessionsToTrusted.push(sessionsNeeded)
    }
    convergenceRates.push(profile.consistencyScore)
  }

  return {
    avgSessionsToHigh: mean(sessionsToTrusted),
    reachedHighRate: (sessionsToTrusted.length / RUNS_PER_CATEGORY * 100).toFixed(1) + '%',
    avgConsistency: mean(convergenceRates).toFixed(3),
    minConsistency: Math.min(...convergenceRates).toFixed(3),
    maxConsistency: Math.max(...convergenceRates).toFixed(3),
  }
}

// ========================================
// Category 2: Cross-user discrimination
// Build profile A, test profile B against it
// ========================================
function runCrossUserTests() {
  let falseMatches = 0
  const consistencies = []

  for (let run = 0; run < RUNS_PER_CATEGORY; run++) {
    // Pick two different profiles
    const idxA = run % 50
    const idxB = (run + 13) % 50
    if (idxA === idxB) continue

    const profileA = getProfile(idxA)
    const profileB = getProfile(idxB)

    // Build profile A with 10 sessions
    const sessionsA = []
    for (let i = 0; i < 10; i++) {
      sessionsA.push(generateSession(profileA, run * 100 + i))
    }
    const builtProfileA = buildProfile(sessionsA)

    // Test a profile B session against profile A
    const sampleB = generateSession(profileB, run * 100 + 50)
    const consistency = checkConsistency(builtProfileA, sampleB)
    consistencies.push(consistency)

    if (consistency > 0.4) {
      falseMatches++
    }
  }

  return {
    falseMatchRate: (falseMatches / RUNS_PER_CATEGORY * 100).toFixed(1) + '%',
    falseMatchCount: falseMatches,
    avgCrossConsistency: mean(consistencies).toFixed(3),
    medianCrossConsistency: median(consistencies).toFixed(3),
  }
}

// ========================================
// Category 3: Bot detection
// 6 bot types vs 5 random human profiles
// ========================================
function runBotDetectionTests() {
  const botTypes = getAllBotTypes()
  const runsPerBot = Math.floor(RUNS_PER_CATEGORY / botTypes.length)
  const results = {}

  for (const botType of botTypes) {
    let detected = 0
    let passedMeanCheck = 0
    const entropyScores = []
    const cvScores = []
    const dwellScores = []
    const consistencies = []

    for (let run = 0; run < runsPerBot; run++) {
      // Build a human profile
      const humanIdx = run % 5
      const humanProfile = getProfile(humanIdx)
      const sessions = []
      for (let i = 0; i < 10; i++) {
        sessions.push(generateSession(humanProfile, run * 100 + i))
      }
      const builtProfile = buildProfile(sessions)

      // Generate bot session targeting this human
      const botSession = generateBotSession(botType, run * 200, humanProfile)

      // Check if the algorithm catches it
      const consistency = checkConsistency(builtProfile, botSession)
      consistencies.push(consistency)

      // Current algorithm only checks mean_inter_key consistency
      if (consistency <= 0.4) {
        detected++
      }

      if (consistency > 0.4) {
        passedMeanCheck++
      }

      // Entropy analysis (what the algorithm SHOULD check)
      const botTimings = generateBotTimings(botType, run * 200, humanProfile)
      const humanTimings = generateTimingArrays(humanProfile, run * 300)

      entropyScores.push({
        bot: shannonEntropy(botTimings.interKeyTimes),
        human: shannonEntropy(humanTimings.interKeyTimes),
      })
      cvScores.push({
        bot: coefficientOfVariation(botTimings.interKeyTimes),
        human: coefficientOfVariation(humanTimings.interKeyTimes),
      })
      dwellScores.push({
        bot: dwellUniformity(botSession.per_key_dwell),
        human: dwellUniformity(sessions[0].per_key_dwell),
      })
    }

    results[botType] = {
      detected,
      total: runsPerBot,
      detectionRate: (detected / runsPerBot * 100).toFixed(1) + '%',
      passedMeanCheck,
      passedMeanRate: (passedMeanCheck / runsPerBot * 100).toFixed(1) + '%',
      avgConsistency: mean(consistencies).toFixed(3),
      avgBotEntropy: mean(entropyScores.map(e => e.bot)).toFixed(3),
      avgHumanEntropy: mean(entropyScores.map(e => e.human)).toFixed(3),
      avgBotCV: mean(cvScores.map(c => c.bot)).toFixed(3),
      avgHumanCV: mean(cvScores.map(c => c.human)).toFixed(3),
      avgBotDwellUniformity: mean(dwellScores.map(d => d.bot)).toFixed(3),
      avgHumanDwellUniformity: mean(dwellScores.map(d => d.human)).toFixed(3),
    }
  }

  return results
}

// ========================================
// Category 4: Replay attack
// Replay exact human timing as "new" session
// ========================================
function runReplayAttackTests() {
  let detected = 0
  let perfectConsistency = 0
  const consistencies = []

  for (let run = 0; run < RUNS_PER_CATEGORY; run++) {
    const humanIdx = run % 50
    const humanProfile = getProfile(humanIdx)

    // Build profile with 10 sessions
    const sessions = []
    for (let i = 0; i < 10; i++) {
      sessions.push(generateSession(humanProfile, run * 100 + i))
    }
    const builtProfile = buildProfile(sessions)

    // Replay session 5 exactly
    const replayedSession = { ...sessions[5] }
    const consistency = checkConsistency(builtProfile, replayedSession)
    consistencies.push(consistency)

    if (consistency >= 0.99) {
      perfectConsistency++
    }

    // Would the algorithm flag this?
    if (consistency <= 0.4) {
      detected++
    }
  }

  return {
    detected,
    total: RUNS_PER_CATEGORY,
    detectionRate: (detected / RUNS_PER_CATEGORY * 100).toFixed(1) + '%',
    perfectConsistencyCount: perfectConsistency,
    perfectConsistencyRate: (perfectConsistency / RUNS_PER_CATEGORY * 100).toFixed(1) + '%',
    avgConsistency: mean(consistencies).toFixed(3),
    vulnerability: perfectConsistency > RUNS_PER_CATEGORY * 0.5
      ? 'CRITICAL: Replay attacks indistinguishable from consistent human'
      : 'Partial: Some replay detection via noise',
  }
}

// ========================================
// Category 5: Noise degradation
// Same user + escalating noise → when is badge lost?
// ========================================
function runNoiseDegradationTests() {
  const noiselevels = [5, 10, 15, 20, 30, 50, 75, 100, 150, 200]
  const results = {}

  for (const noisePct of noiselevels) {
    let badgeLost = 0
    const consistencies = []

    const runsPerLevel = Math.floor(RUNS_PER_CATEGORY / noiselevels.length)

    for (let run = 0; run < runsPerLevel; run++) {
      const humanIdx = run % 50
      const humanProfile = getProfile(humanIdx)

      // Build profile with 10 sessions
      const sessions = []
      for (let i = 0; i < 10; i++) {
        sessions.push(generateSession(humanProfile, run * 100 + i))
      }
      const builtProfile = buildProfile(sessions)

      // Generate a noisy session
      const cleanSession = generateSession(humanProfile, run * 100 + 50)
      const noisySession = {
        ...cleanSession,
        mean_inter_key: cleanSession.mean_inter_key * (1 + (noisePct / 100) * (run % 2 === 0 ? 1 : -1)),
      }

      const consistency = checkConsistency(builtProfile, noisySession)
      consistencies.push(consistency)

      if (builtProfile.consistencyScore > 0.6 && consistency <= 0.4) {
        badgeLost++
      }
    }

    results[`${noisePct}%`] = {
      badgeLostRate: (badgeLost / runsPerLevel * 100).toFixed(1) + '%',
      avgConsistency: mean(consistencies).toFixed(3),
      minConsistency: Math.min(...consistencies).toFixed(3),
    }
  }

  return results
}

// --- Stats helpers ---

function mean(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function median(arr) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
