/**
 * Hardened Algorithm Test Runner
 *
 * Tests scoreSession() against concrete goals:
 *   - 95%+ detection on ALL 6 bot types
 *   - <1% false positive rate on legitimate humans
 *   - <2% false positive on night typists
 *   - <2% false positive on mobile users
 *   - <2% false positive on power reviewers
 *   - Replay detection > 80%
 *
 * Runs 2000+ trials to get statistically meaningful results.
 */

import { createEmptyProfile, mergeSample, buildProfile, scoreSession, checkConsistency } from './matching-engine.mjs'
import { generateSession, getProfile, getAllProfiles } from './profile-generator.mjs'
import { generateBotSession, getAllBotTypes, BOT_TYPES } from './bot-generator.mjs'
import {
  getAllRealisticProfiles,
  getRealisticProfile,
  generateRealisticSession,
  simulateUserOverTime,
  THRESHOLDS,
} from './real-world-profiles.mjs'

// ========================================
// GOALS — the scorecard we're measuring against
// ========================================
export const GOALS = {
  bot_detection_min: 95,           // % detection rate per bot type (except replay — see note)
  false_positive_max: 1,           // % false positive on clean humans
  night_false_positive_max: 2,     // % false positive on night typists
  mobile_false_positive_max: 2,    // % false positive on mobile users
  power_false_positive_max: 2,     // % false positive on power reviewers
  replay_detection_min: 80,        // % replay detection (REQUIRES DB-LEVEL HASH DEDUP)
  cross_user_false_match_max: 20,  // % acceptable cross-user false match
}

// NOTE ON REPLAY DETECTION:
// Replay attacks are fundamentally undetectable at the aggregate-stats level because
// a replayed human session IS a legitimate human session — all biometric signals are
// genuine. The algorithm can only catch replays where timing matches the profile
// average suspiciously closely (< 3% for the same user's sessions).
//
// Real replay defense requires PROTOCOL-LEVEL changes:
// 1. Hash each session's raw timing array → reject duplicates at DB insert time
// 2. Session nonces (one-time tokens) → prevent replay of captured payloads
// 3. Timestamp freshness checks → reject sessions with old timestamps
//
// The replay goal (80%) is an ASPIRATIONAL target for the full system including
// DB-level defenses. The algorithm alone will score ~1-5%.

export function runHardenedTests() {
  return {
    goals: GOALS,
    botDetection: testBotDetection(),
    falsePositives: testFalsePositives(),
    nightFalsePositives: testNightFalsePositives(),
    mobileFalsePositives: testMobileFalsePositives(),
    powerFalsePositives: testPowerFalsePositives(),
    replayDetection: testReplayDetection(),
    sophisticatedBotDeepDive: testSophisticatedBot(),
    scorecard: null, // filled below
  }
}

// After all tests, build scorecard
export function buildScorecard(results) {
  const checks = [
    {
      goal: `Bot detection ≥ ${GOALS.bot_detection_min}%`,
      results: Object.entries(results.botDetection.byType).map(([type, data]) => ({
        label: type,
        value: parseFloat(data.detectionRate),
        passed: parseFloat(data.detectionRate) >= GOALS.bot_detection_min,
      })),
    },
    {
      goal: `False positive ≤ ${GOALS.false_positive_max}%`,
      results: [{
        label: 'all humans',
        value: parseFloat(results.falsePositives.falsePositiveRate),
        passed: parseFloat(results.falsePositives.falsePositiveRate) <= GOALS.false_positive_max,
      }],
    },
    {
      goal: `Night FP ≤ ${GOALS.night_false_positive_max}%`,
      results: [{
        label: 'night sessions',
        value: parseFloat(results.nightFalsePositives.falsePositiveRate),
        passed: parseFloat(results.nightFalsePositives.falsePositiveRate) <= GOALS.night_false_positive_max,
      }],
    },
    {
      goal: `Mobile FP ≤ ${GOALS.mobile_false_positive_max}%`,
      results: [{
        label: 'mobile users',
        value: parseFloat(results.mobileFalsePositives.falsePositiveRate),
        passed: parseFloat(results.mobileFalsePositives.falsePositiveRate) <= GOALS.mobile_false_positive_max,
      }],
    },
    {
      goal: `Power reviewer FP ≤ ${GOALS.power_false_positive_max}%`,
      results: [{
        label: 'power reviewers',
        value: parseFloat(results.powerFalsePositives.falsePositiveRate),
        passed: parseFloat(results.powerFalsePositives.falsePositiveRate) <= GOALS.power_false_positive_max,
      }],
    },
    {
      goal: `Replay detection ≥ ${GOALS.replay_detection_min}%`,
      results: [{
        label: 'replay attacks',
        value: parseFloat(results.replayDetection.detectionRate),
        passed: parseFloat(results.replayDetection.detectionRate) >= GOALS.replay_detection_min,
      }],
    },
  ]

  const allPassed = checks.every(c => c.results.every(r => r.passed))
  const totalChecks = checks.reduce((sum, c) => sum + c.results.length, 0)
  const passedChecks = checks.reduce((sum, c) => sum + c.results.filter(r => r.passed).length, 0)

  return { checks, allPassed, passedChecks, totalChecks }
}

// ========================================
// Test 1: Bot Detection — all 6 types
// ========================================
function testBotDetection() {
  const botTypes = getAllBotTypes()
  const runsPerType = 100
  const byType = {}
  let totalDetected = 0
  let totalRuns = 0

  for (const botType of botTypes) {
    let detected = 0
    const flagBreakdown = {}
    const scores = []

    for (let i = 0; i < runsPerType; i++) {
      // Build a random human profile baseline
      const humanIdx = i % 20
      const humanProfile = getRealisticProfile(humanIdx)
      const jitterProfile = createEmptyProfile()
      for (let s = 0; s < 10; s++) {
        mergeSample(jitterProfile, generateRealisticSession(humanProfile, i * 200 + s, 14))
      }

      // Generate bot session
      // For replay bots: replay one of the actual ingested sessions (session 5)
      // This simulates a realistic replay attack where the attacker captures
      // and replays real network traffic. The hash dedup catches this.
      let botSession
      if (botType === 'replay') {
        botSession = { ...generateRealisticSession(humanProfile, i * 200 + 5, 14) }
      } else {
        botSession = generateBotSession(botType, i * 300, humanProfile)
      }
      const result = scoreSession(botSession, jitterProfile)

      scores.push(result.score)
      if (!result.passed) detected++

      // Track which flags caught it
      for (const flag of result.flags) {
        flagBreakdown[flag.check] = (flagBreakdown[flag.check] || 0) + 1
      }
    }

    totalDetected += detected
    totalRuns += runsPerType

    byType[botType] = {
      detected,
      total: runsPerType,
      detectionRate: pct(detected, runsPerType),
      avgScore: r3(mean(scores)),
      meetsGoal: (detected / runsPerType * 100) >= GOALS.bot_detection_min,
      flagBreakdown,
    }
  }

  return {
    byType,
    overallDetectionRate: pct(totalDetected, totalRuns),
    overallMeetsGoal: (totalDetected / totalRuns * 100) >= GOALS.bot_detection_min,
  }
}

// ========================================
// Test 2: False Positives — clean human sessions
// ========================================
function testFalsePositives() {
  const profiles = getAllRealisticProfiles()
  let falsePositives = 0
  let total = 0
  const falsePositiveDetails = []

  for (let i = 0; i < profiles.length; i++) {
    const human = profiles[i]
    const jitterProfile = createEmptyProfile()

    // Build baseline with 10 sessions
    for (let s = 0; s < 10; s++) {
      mergeSample(jitterProfile, generateRealisticSession(human, i * 200 + s, 14))
    }

    // Test 10 new sessions from the same user
    for (let s = 0; s < 10; s++) {
      const session = generateRealisticSession(human, i * 200 + 100 + s, 14)
      const result = scoreSession(session, jitterProfile)
      total++

      if (!result.passed) {
        falsePositives++
        falsePositiveDetails.push({
          profileId: human.id,
          type: human.type,
          platform: human.platform,
          flags: result.flags,
          score: result.score,
        })
      }
    }
  }

  return {
    falsePositives,
    total,
    falsePositiveRate: pct(falsePositives, total),
    meetsGoal: (falsePositives / total * 100) <= GOALS.false_positive_max,
    details: falsePositiveDetails.slice(0, 10), // first 10 for debugging
  }
}

// ========================================
// Test 3: Night False Positives
// ========================================
function testNightFalsePositives() {
  const profiles = getAllRealisticProfiles().slice(0, 20)
  let falsePositives = 0
  let total = 0

  for (let i = 0; i < profiles.length; i++) {
    const human = profiles[i]
    const jitterProfile = createEmptyProfile()

    // Build baseline from daytime sessions
    for (let s = 0; s < 10; s++) {
      mergeSample(jitterProfile, generateRealisticSession(human, i * 200 + s, 14))
    }

    // Test with night sessions (10 PM - 4 AM)
    const nightHours = [22, 23, 0, 1, 2, 3, 4]
    for (const hour of nightHours) {
      const session = generateRealisticSession(human, i * 200 + 200 + hour, hour)
      const result = scoreSession(session, jitterProfile)
      total++
      if (!result.passed) falsePositives++
    }
  }

  return {
    falsePositives,
    total,
    falsePositiveRate: pct(falsePositives, total),
    meetsGoal: (falsePositives / total * 100) <= GOALS.night_false_positive_max,
  }
}

// ========================================
// Test 4: Mobile False Positives
// ========================================
function testMobileFalsePositives() {
  const mobileProfiles = getAllRealisticProfiles().filter(p => p.platform === 'mobile')
  let falsePositives = 0
  let total = 0

  for (let i = 0; i < mobileProfiles.length; i++) {
    const human = mobileProfiles[i]
    const jitterProfile = createEmptyProfile()

    for (let s = 0; s < 10; s++) {
      mergeSample(jitterProfile, generateRealisticSession(human, i * 300 + s, 14))
    }

    for (let s = 0; s < 10; s++) {
      const session = generateRealisticSession(human, i * 300 + 100 + s, 14)
      const result = scoreSession(session, jitterProfile)
      total++
      if (!result.passed) falsePositives++
    }
  }

  return {
    falsePositives,
    total,
    falsePositiveRate: pct(falsePositives, total),
    meetsGoal: (falsePositives / total * 100) <= GOALS.mobile_false_positive_max,
  }
}

// ========================================
// Test 5: Power Reviewer False Positives
// ========================================
function testPowerFalsePositives() {
  const powerProfiles = getAllRealisticProfiles().filter(p => p.type === 'power_reviewer')
  let falsePositives = 0
  let total = 0

  for (let i = 0; i < powerProfiles.length; i++) {
    const human = powerProfiles[i]
    // Simulate 30 days of heavy usage
    const sessions = simulateUserOverTime(human, 30, i * 5000)
    const jitterProfile = createEmptyProfile()

    // Build profile with first half
    const halfPoint = Math.floor(sessions.length / 2)
    for (let s = 0; s < halfPoint; s++) {
      mergeSample(jitterProfile, sessions[s])
    }

    // Test second half
    for (let s = halfPoint; s < sessions.length; s++) {
      const result = scoreSession(sessions[s], jitterProfile)
      total++
      if (!result.passed) falsePositives++
    }
  }

  return {
    falsePositives,
    total,
    falsePositiveRate: pct(falsePositives, total),
    meetsGoal: (falsePositives / total * 100) <= GOALS.power_false_positive_max,
  }
}

// ========================================
// Test 6: Replay Detection
// ========================================
function testReplayDetection() {
  let detected = 0
  const total = 200
  const flagBreakdown = {}

  for (let i = 0; i < total; i++) {
    const humanIdx = i % 50
    const humanProfile = getRealisticProfile(humanIdx)

    // Build profile with 10 sessions
    const sessions = []
    for (let s = 0; s < 10; s++) {
      sessions.push(generateRealisticSession(humanProfile, i * 100 + s, 14))
    }
    const jitterProfile = buildProfile(sessions)

    // Replay session 5 exactly
    const replayed = { ...sessions[5] }
    const result = scoreSession(replayed, jitterProfile)

    if (!result.passed) detected++

    for (const flag of result.flags) {
      flagBreakdown[flag.check] = (flagBreakdown[flag.check] || 0) + 1
    }
  }

  return {
    detected,
    total,
    detectionRate: pct(detected, total),
    meetsGoal: (detected / total * 100) >= GOALS.replay_detection_min,
    flagBreakdown,
  }
}

// ========================================
// Test 7: Sophisticated Bot Deep Dive
// ========================================
function testSophisticatedBot() {
  const total = 100
  let detected = 0
  const flagBreakdown = {}
  const scores = []
  const nearMisses = []

  for (let i = 0; i < total; i++) {
    const humanProfile = getRealisticProfile(i % 20)
    const jitterProfile = createEmptyProfile()
    for (let s = 0; s < 10; s++) {
      mergeSample(jitterProfile, generateRealisticSession(humanProfile, i * 200 + s, 14))
    }

    const botSession = generateBotSession(BOT_TYPES.SOPHISTICATED, i * 300, humanProfile)
    const result = scoreSession(botSession, jitterProfile)
    scores.push(result.score)

    if (!result.passed) {
      detected++
    } else if (result.suspicious) {
      // Calculate dwell uniformity CV for diagnostics
      let dwellCV = null
      if (botSession.per_key_dwell) {
        const vals = Object.values(botSession.per_key_dwell).filter(v => v > 0)
        if (vals.length >= 5) {
          const m = vals.reduce((a, b) => a + b, 0) / vals.length
          const variance = vals.reduce((sum, v) => sum + (v - m) ** 2, 0) / vals.length
          dwellCV = Math.round(Math.sqrt(variance) / m * 10000) / 10000
        }
      }
      nearMisses.push({
        run: i,
        humanProfileIdx: i % 20,
        flags: result.flags,
        score: result.score,
        botMean: botSession.mean_inter_key,
        botStd: botSession.std_inter_key,
        botDwell: botSession.mean_dwell,
        botStdDwell: botSession.std_dwell,
        botDwellCV: dwellCV,
        botDwellVarRatio: botSession.std_dwell && botSession.mean_dwell ? Math.round(botSession.std_dwell / botSession.mean_dwell * 10000) / 10000 : null,
        botEditRatio: botSession.edit_ratio,
        botPauseFreq: botSession.pause_freq,
      })
    }

    for (const flag of result.flags) {
      flagBreakdown[flag.check] = (flagBreakdown[flag.check] || 0) + 1
    }
  }

  return {
    detected,
    total,
    detectionRate: pct(detected, total),
    meetsGoal: (detected / total * 100) >= GOALS.bot_detection_min,
    avgScore: r3(mean(scores)),
    flagBreakdown,
    nearMissCount: nearMisses.length,
    nearMisses: nearMisses.slice(0, 5), // first 5 for analysis
    analysis: detected < total * 0.95
      ? 'NEEDS WORK: Sophisticated bots still passing. See nearMisses for what signals they lack.'
      : 'GOAL MET: Sophisticated bots reliably caught.',
  }
}

// ---- Helpers ----
function mean(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}
function pct(n, total) {
  if (total === 0) return '0.0%'
  return (n / total * 100).toFixed(1) + '%'
}
function r3(v) { return Math.round(v * 1000) / 1000 }
