/**
 * Temporal simulation — runs realistic profiles over 30/60/90 days.
 * Tracks how the algorithm performs with real-world patterns:
 *   - Day vs night typing differences
 *   - Power reviewer velocity
 *   - Cross-platform (desktop vs mobile) users
 *   - Circadian drift effects on consistency
 *   - Activity velocity anomalies
 */

import { createEmptyProfile, mergeSample, checkConsistency } from './matching-engine.mjs'
import { generateBotSession, getAllBotTypes, BOT_TYPES } from './bot-generator.mjs'
import { shannonEntropy, coefficientOfVariation, dwellUniformity } from './entropy.mjs'
import {
  getAllRealisticProfiles,
  getRealisticProfile,
  simulateUserOverTime,
  generateRealisticSession,
  THRESHOLDS,
} from './real-world-profiles.mjs'

/**
 * Run all temporal simulations.
 * Returns structured results for the report.
 */
export function runTemporalTests() {
  return {
    thresholds: THRESHOLDS,
    profileOverview: profileOverview(),
    convergenceOverTime: convergenceOverTime(),
    circadianEffect: circadianEffect(),
    platformComparison: platformComparison(),
    powerReviewerStress: powerReviewerStress(),
    velocityAnomalies: velocityAnomalies(),
    botDetectionWithThresholds: botDetectionWithThresholds(),
    thirtyDaySimulation: fullSimulation(30),
    ninetyDaySimulation: fullSimulation(90),
  }
}

// ========================================
// Profile overview — show the research-backed ranges
// ========================================
function profileOverview() {
  const profiles = getAllRealisticProfiles()
  const byType = {}

  for (const p of profiles) {
    if (!byType[p.type]) byType[p.type] = []
    byType[p.type].push(p)
  }

  const overview = {}
  for (const [type, group] of Object.entries(byType)) {
    overview[type] = {
      count: group.length,
      platform: group[0].platform,
      ikiRange: `${Math.min(...group.map(p => p.meanInterKey))}-${Math.max(...group.map(p => p.meanInterKey))}ms`,
      stdRange: `${Math.min(...group.map(p => p.stdInterKey))}-${Math.max(...group.map(p => p.stdInterKey))}ms`,
      dwellRange: `${Math.min(...group.map(p => p.meanDwell))}-${Math.max(...group.map(p => p.meanDwell))}ms`,
      reviewsPerDay: `${Math.min(...group.map(p => p.reviewsPerDay))}-${Math.max(...group.map(p => p.reviewsPerDay))}`,
    }
  }

  return overview
}

// ========================================
// Convergence over time — how many days/reviews to trusted?
// ========================================
function convergenceOverTime() {
  const profiles = getAllRealisticProfiles()
  const results = []

  for (let i = 0; i < Math.min(profiles.length, 20); i++) {
    const human = profiles[i]
    const sessions = simulateUserOverTime(human, 60, i * 777)
    const jitterProfile = createEmptyProfile()

    let reachedMedium = null
    let reachedHigh = null
    const consistencyTimeline = []

    for (let s = 0; s < sessions.length; s++) {
      mergeSample(jitterProfile, sessions[s])
      consistencyTimeline.push({
        session: s + 1,
        day: sessions[s]._day,
        consistency: jitterProfile.consistencyScore,
        confidence: jitterProfile.confidenceLevel,
      })

      if (!reachedMedium && jitterProfile.confidenceLevel === 'medium') {
        reachedMedium = { session: s + 1, day: sessions[s]._day }
      }
      if (!reachedHigh && jitterProfile.confidenceLevel === 'high') {
        reachedHigh = { session: s + 1, day: sessions[s]._day }
      }
    }

    results.push({
      profileId: human.id,
      type: human.type,
      platform: human.platform,
      totalSessions: sessions.length,
      totalDays: 60,
      reachedMedium,
      reachedHigh,
      finalConsistency: jitterProfile.consistencyScore,
      finalConfidence: jitterProfile.confidenceLevel,
    })
  }

  // Aggregate
  const withHigh = results.filter(r => r.reachedHigh)
  const withMedium = results.filter(r => r.reachedMedium)

  return {
    profiles: results,
    summary: {
      totalProfiles: results.length,
      reachedHighCount: withHigh.length,
      reachedHighRate: pct(withHigh.length, results.length),
      avgDaysToHigh: withHigh.length > 0
        ? r2(mean(withHigh.map(r => r.reachedHigh.day))) : 'N/A',
      avgSessionsToHigh: withHigh.length > 0
        ? r2(mean(withHigh.map(r => r.reachedHigh.session))) : 'N/A',
      avgDaysToMedium: withMedium.length > 0
        ? r2(mean(withMedium.map(r => r.reachedMedium.day))) : 'N/A',
      avgFinalConsistency: r3(mean(results.map(r => r.finalConsistency))),
    },
  }
}

// ========================================
// Circadian effect — day vs night consistency
// ========================================
function circadianEffect() {
  const profiles = getAllRealisticProfiles().slice(0, 10)
  const results = []

  for (const human of profiles) {
    const jitterProfile = createEmptyProfile()

    // Build baseline from daytime sessions (10 sessions at 2 PM)
    for (let i = 0; i < 10; i++) {
      const session = generateRealisticSession(human, i * 100, 14) // 2 PM
      mergeSample(jitterProfile, session)
    }

    const baselineConsistency = jitterProfile.consistencyScore

    // Test consistency at different hours
    const hourlyConsistency = {}
    for (let hour = 0; hour < 24; hour += 2) {
      const consistencies = []
      for (let trial = 0; trial < 10; trial++) {
        const session = generateRealisticSession(human, 5000 + hour * 100 + trial, hour)
        const c = checkConsistency(jitterProfile, session)
        consistencies.push(c)
      }
      hourlyConsistency[`${hour}:00`] = {
        avgConsistency: r3(mean(consistencies)),
        minConsistency: r3(Math.min(...consistencies)),
        wouldLoseBadge: consistencies.filter(c => c <= 0.4).length,
      }
    }

    results.push({
      profileId: human.id,
      type: human.type,
      baselineConsistency,
      hourlyConsistency,
    })
  }

  // Find worst-case: night hours where badge could be lost
  const nightHours = ['22:00', '0:00', '2:00', '4:00']
  const dayHours = ['10:00', '12:00', '14:00', '16:00']

  let nightBadgeLoss = 0
  let dayBadgeLoss = 0
  let nightTotal = 0
  let dayTotal = 0

  for (const r of results) {
    for (const h of nightHours) {
      if (r.hourlyConsistency[h]) {
        nightBadgeLoss += r.hourlyConsistency[h].wouldLoseBadge
        nightTotal += 10
      }
    }
    for (const h of dayHours) {
      if (r.hourlyConsistency[h]) {
        dayBadgeLoss += r.hourlyConsistency[h].wouldLoseBadge
        dayTotal += 10
      }
    }
  }

  return {
    profiles: results,
    summary: {
      nightBadgeLossRate: pct(nightBadgeLoss, nightTotal),
      dayBadgeLossRate: pct(dayBadgeLoss, dayTotal),
      verdict: nightBadgeLoss > nightTotal * 0.1
        ? 'WARNING: Night typing causes false badge loss for legitimate users'
        : 'OK: Night drift stays within tolerance',
    },
  }
}

// ========================================
// Platform comparison — desktop vs mobile
// ========================================
function platformComparison() {
  const desktop = getAllRealisticProfiles().filter(p => p.platform === 'desktop')
  const mobile = getAllRealisticProfiles().filter(p => p.platform === 'mobile')

  function testPlatform(profiles, label) {
    const consistencies = []
    const crossPlatformFalseMatches = []

    for (let i = 0; i < Math.min(profiles.length, 10); i++) {
      const human = profiles[i]
      const jitterProfile = createEmptyProfile()

      // Build profile with 10 sessions
      for (let s = 0; s < 10; s++) {
        mergeSample(jitterProfile, generateRealisticSession(human, i * 200 + s, 14))
      }
      consistencies.push(jitterProfile.consistencyScore)
    }

    return {
      platform: label,
      count: profiles.length,
      avgConsistency: r3(mean(consistencies)),
      avgIKI: r2(mean(profiles.map(p => p.meanInterKey))),
      avgDwell: r2(mean(profiles.map(p => p.meanDwell))),
    }
  }

  // Can a mobile user's profile match against a desktop user?
  let crossPlatformMatches = 0
  const crossTotal = 50
  for (let i = 0; i < crossTotal; i++) {
    const dProf = desktop[i % desktop.length]
    const mProf = mobile[i % mobile.length]

    const jitterProfile = createEmptyProfile()
    for (let s = 0; s < 10; s++) {
      mergeSample(jitterProfile, generateRealisticSession(dProf, i * 300 + s, 14))
    }
    const mSession = generateRealisticSession(mProf, i * 300 + 50, 14)
    const c = checkConsistency(jitterProfile, mSession)
    if (c > 0.4) crossPlatformMatches++
  }

  return {
    desktop: testPlatform(desktop, 'desktop'),
    mobile: testPlatform(mobile, 'mobile'),
    crossPlatformFalseMatchRate: pct(crossPlatformMatches, crossTotal),
  }
}

// ========================================
// Power reviewer stress test — high-velocity users
// ========================================
function powerReviewerStress() {
  const powerProfiles = getAllRealisticProfiles().filter(p => p.type === 'power_reviewer')
  const results = []

  for (const human of powerProfiles) {
    const sessions = simulateUserOverTime(human, 30, 9999 + powerProfiles.indexOf(human))
    const jitterProfile = createEmptyProfile()

    let flaggedSessions = 0
    const dailyCounts = {}
    const consistencies = []

    for (const session of sessions) {
      mergeSample(jitterProfile, session)
      consistencies.push(jitterProfile.consistencyScore)

      const day = session._day
      dailyCounts[day] = (dailyCounts[day] || 0) + 1

      // Would this session be flagged for velocity?
      if (dailyCounts[day] > THRESHOLDS.activity.max_reviews_per_day) {
        flaggedSessions++
      }
    }

    const maxDailyCount = Math.max(...Object.values(dailyCounts))

    results.push({
      profileId: human.id,
      totalSessions: sessions.length,
      totalDays: 30,
      avgPerDay: r2(sessions.length / 30),
      maxPerDay: maxDailyCount,
      velocityFlagged: flaggedSessions,
      finalConsistency: jitterProfile.consistencyScore,
      finalConfidence: jitterProfile.confidenceLevel,
      consistencyStability: r3(std(consistencies.slice(-10))),
    })
  }

  return {
    profiles: results,
    summary: {
      avgSessionsPerDay: r2(mean(results.map(r => r.avgPerDay))),
      maxSingleDay: Math.max(...results.map(r => r.maxPerDay)),
      velocityFlaggedTotal: results.reduce((sum, r) => sum + r.velocityFlagged, 0),
      verdict: results.every(r => r.velocityFlagged === 0)
        ? 'OK: No power reviewers hit velocity limits'
        : 'INFO: Some power reviewer sessions would be velocity-flagged',
    },
  }
}

// ========================================
// Velocity anomaly detection — bot patterns over time
// ========================================
function velocityAnomalies() {
  // Simulate a bot posting 20 reviews in 1 day vs a human posting 1-2/day over 30 days
  const humanProfile = getRealisticProfile(10) // average desktop
  const humanSessions = simulateUserOverTime(humanProfile, 30, 42)

  // Bot: 20 identical-timing reviews in one day
  const botSessions = []
  for (let i = 0; i < 20; i++) {
    botSessions.push(generateBotSession(BOT_TYPES.GAUSSIAN_MIMIC, i * 100, humanProfile))
  }

  // Build human profile and check
  const humanJitter = createEmptyProfile()
  for (const s of humanSessions) mergeSample(humanJitter, s)

  const botJitter = createEmptyProfile()
  for (const s of botSessions) mergeSample(botJitter, s)

  return {
    human: {
      totalSessions: humanSessions.length,
      days: 30,
      avgPerDay: r2(humanSessions.length / 30),
      finalConsistency: humanJitter.consistencyScore,
      finalConfidence: humanJitter.confidenceLevel,
    },
    bot: {
      totalSessions: botSessions.length,
      days: 1,
      avgPerDay: 20,
      finalConsistency: botJitter.consistencyScore,
      finalConfidence: botJitter.confidenceLevel,
      flaggedByVelocity: botSessions.length > THRESHOLDS.activity.max_reviews_per_day,
    },
    verdict: botJitter.consistencyScore > 0.8
      ? 'CRITICAL: Bot with 20 reviews/day builds high consistency — velocity check is only defense'
      : 'OK: Bot consistency stays low despite volume',
  }
}

// ========================================
// Bot detection with research-backed thresholds
// ========================================
function botDetectionWithThresholds() {
  const botTypes = getAllBotTypes()
  const results = {}

  for (const botType of botTypes) {
    let detectedByMean = 0
    let detectedByDwell = 0
    let detectedByEntropy = 0
    let detectedByDwellUniformity = 0
    let detectedByAnyNew = 0
    const total = 30

    for (let i = 0; i < total; i++) {
      const humanProfile = getRealisticProfile(i % 20)

      // Build human baseline
      const jitterProfile = createEmptyProfile()
      for (let s = 0; s < 10; s++) {
        mergeSample(jitterProfile, generateRealisticSession(humanProfile, i * 200 + s, 14))
      }

      const botSession = generateBotSession(botType, i * 300, humanProfile)

      // Current algo check
      const consistency = checkConsistency(jitterProfile, botSession)
      if (consistency <= 0.4) detectedByMean++

      // NEW: Dwell check (with 10% buffer)
      if (botSession.mean_dwell !== undefined && botSession.mean_dwell < THRESHOLDS.dwell.min_ms) {
        detectedByDwell++
      }

      // NEW: Dwell uniformity check
      const du = dwellUniformity(botSession.per_key_dwell)
      if (du < THRESHOLDS.dwell_uniformity.min_human_cv) {
        detectedByDwellUniformity++
      }

      // NEW: Would any new check catch it?
      if (
        consistency <= 0.4 ||
        (botSession.mean_dwell !== undefined && botSession.mean_dwell < THRESHOLDS.dwell.min_ms) ||
        du < THRESHOLDS.dwell_uniformity.min_human_cv ||
        (botSession.std_inter_key !== undefined && botSession.std_inter_key < THRESHOLDS.iki.min_std)
      ) {
        detectedByAnyNew++
      }
    }

    results[botType] = {
      total,
      detectedByMean: `${pct(detectedByMean, total)}`,
      detectedByDwell: `${pct(detectedByDwell, total)}`,
      detectedByDwellUniformity: `${pct(detectedByDwellUniformity, total)}`,
      detectedByAnyNewCheck: `${pct(detectedByAnyNew, total)}`,
    }
  }

  return results
}

// ========================================
// Full N-day simulation
// ========================================
function fullSimulation(days) {
  const profiles = getAllRealisticProfiles().slice(0, 20) // 20 users
  const results = []

  for (let i = 0; i < profiles.length; i++) {
    const human = profiles[i]
    const sessions = simulateUserOverTime(human, days, i * 5555)
    const jitterProfile = createEmptyProfile()

    const milestones = []
    for (let s = 0; s < sessions.length; s++) {
      mergeSample(jitterProfile, sessions[s])
      // Record at each session
      if (s === 0 || s === 4 || s === 9 || s === 14 || s === sessions.length - 1) {
        milestones.push({
          session: s + 1,
          day: sessions[s]._day,
          hour: sessions[s]._hour,
          consistency: jitterProfile.consistencyScore,
          confidence: jitterProfile.confidenceLevel,
        })
      }
    }

    results.push({
      profileId: human.id,
      type: human.type,
      platform: human.platform,
      totalSessions: sessions.length,
      reviewsPerDay: r2(sessions.length / days),
      milestones,
      finalConsistency: jitterProfile.consistencyScore,
      finalConfidence: jitterProfile.confidenceLevel,
    })
  }

  return {
    days,
    users: results.length,
    summary: {
      avgReviewsPerDay: r2(mean(results.map(r => r.reviewsPerDay))),
      avgFinalConsistency: r3(mean(results.map(r => r.finalConsistency))),
      reachedHigh: results.filter(r => r.finalConfidence === 'high').length,
      reachedMedium: results.filter(r => r.finalConfidence === 'medium').length,
      stuckLow: results.filter(r => r.finalConfidence === 'low').length,
      stuckNone: results.filter(r => r.finalConfidence === 'none').length,
    },
    profiles: results,
  }
}

// ---- Helpers ----
function mean(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function std(arr) {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length)
}

function pct(n, total) {
  if (total === 0) return '0.0%'
  return (n / total * 100).toFixed(1) + '%'
}

function r2(v) { return Math.round(v * 100) / 100 }
function r3(v) { return Math.round(v * 1000) / 1000 }
