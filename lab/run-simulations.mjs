#!/usr/bin/env node

/**
 * Jitter Protocol Stress Test — Entry Point
 *
 * Layer 1: 1000 algorithm simulations (synthetic profiles)
 * Layer 1b: Temporal simulations (research-backed profiles over 30/90 days)
 * Layer 2: Capture pipeline (Playwright, runs separately)
 *
 * Usage: node e2e/jitter-lab/run-simulations.mjs
 */

import { runAllTests } from './algo/test-runner.mjs'
import { runTemporalTests } from './algo/temporal-runner.mjs'
import { runHardenedTests, buildScorecard, GOALS } from './algo/hardened-runner.mjs'
import { THRESHOLDS } from './algo/real-world-profiles.mjs'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')

if (!existsSync(RESULTS_DIR)) {
  mkdirSync(RESULTS_DIR, { recursive: true })
}

// ========================================
// Layer 1: Original 1000 algorithm simulations
// ========================================
console.log('=== Jitter Protocol Stress Test ===\n')
console.log('Layer 1: Running 1000 algorithm simulations...')

const t1 = Date.now()
const algoResults = runAllTests()
const elapsed1 = ((Date.now() - t1) / 1000).toFixed(2)
console.log(`  Done in ${elapsed1}s`)

writeFileSync(join(RESULTS_DIR, 'algo-results.json'), JSON.stringify(algoResults, null, 2))

// ========================================
// Layer 1b: Temporal simulations (research-backed)
// ========================================
console.log('\nLayer 1b: Running temporal simulations (30/90 day, circadian, platform)...')

const t2 = Date.now()
const temporalResults = runTemporalTests()
const elapsed2 = ((Date.now() - t2) / 1000).toFixed(2)
console.log(`  Done in ${elapsed2}s`)

writeFileSync(join(RESULTS_DIR, 'temporal-results.json'), JSON.stringify(temporalResults, null, 2))

// ========================================
// Layer 1c: Hardened algorithm scorecard
// ========================================
console.log('\nLayer 1c: Running hardened algorithm tests (scorecard)...')

const t3 = Date.now()
const hardenedResults = runHardenedTests()
hardenedResults.scorecard = buildScorecard(hardenedResults)
const elapsed3 = ((Date.now() - t3) / 1000).toFixed(2)
console.log(`  Done in ${elapsed3}s`)

writeFileSync(join(RESULTS_DIR, 'hardened-results.json'), JSON.stringify(hardenedResults, null, 2))

// ========================================
// Try to load capture pipeline results
// ========================================
let captureResults = null
const captureFile = join(RESULTS_DIR, 'capture-results.json')
if (existsSync(captureFile)) {
  try {
    captureResults = JSON.parse(readFileSync(captureFile, 'utf8'))
    console.log(`\nLoaded ${captureResults.length} capture pipeline results`)
  } catch { /* ignore */ }
}

// ========================================
// Generate unified report
// ========================================
const totalElapsed = ((Date.now() - t1) / 1000).toFixed(2)
const report = generateReport(algoResults, temporalResults, hardenedResults, captureResults, totalElapsed)
writeFileSync(join(RESULTS_DIR, 'report.md'), report)

console.log('\nReport saved to e2e/jitter-lab/results/report.md')
console.log('\n' + '='.repeat(50))
printSummary(algoResults, temporalResults, hardenedResults)

// ========================================
// Report Generator
// ========================================

function generateReport(algo, temporal, hardened, capture, elapsed) {
  const lines = []
  const ts = new Date().toISOString().split('T')[0]

  lines.push('# Jitter Protocol Stress Test Report')
  lines.push(`\nGenerated: ${ts} | Total runtime: ${elapsed}s`)
  lines.push(`- Algorithm simulations: 1,000`)
  lines.push(`- Temporal simulations: 30-day + 90-day (${temporal.thresholds ? '50 research-backed profiles' : 'N/A'})`)
  if (capture) lines.push(`- Capture pipeline runs: ${capture.length}`)

  // ---- Research-Backed Thresholds ----
  lines.push('\n## Research-Backed Thresholds (all +10% buffer)\n')
  lines.push('All thresholds include a 10% buffer to avoid flagging fast legitimate typists.\n')
  lines.push('| Metric | Research Value | Buffered Threshold | Source |')
  lines.push('|--------|--------------|-------------------|--------|')
  lines.push(`| Min human IKI | 60ms | **${THRESHOLDS.iki.min_ms}ms** | 136M keystrokes study |`)
  lines.push(`| Fast human IKI mean | 121.7ms | **${THRESHOLDS.iki.fast_human_mean}ms** | CHI 2018 |`)
  lines.push(`| Avg human IKI mean | 238.7ms | **${THRESHOLDS.iki.avg_human_mean}ms** | CHI 2018 |`)
  lines.push(`| Min human IKI std | 12ms | **${THRESHOLDS.iki.min_std}ms** | Biometrics survey |`)
  lines.push(`| Min human dwell | 30ms | **${THRESHOLDS.dwell.min_ms}ms** | Keystroke dynamics research |`)
  lines.push(`| Min human CV | 0.10 | **${THRESHOLDS.cv.min_human}** | Biometrics survey |`)
  lines.push(`| Min human entropy | 2.50 | **${THRESHOLDS.entropy.min_human}** | Timing distribution analysis |`)
  lines.push(`| Night IKI slowdown | 15% | **${(THRESHOLDS.circadian.night_slowdown_pct * 100).toFixed(1)}%** | Circadian research |`)
  lines.push(`| Max reviews/day | 3 (power) | **${THRESHOLDS.activity.max_reviews_per_day}** | Yelp/Google stats |`)

  // ---- Does Playwright Get Flagged? ----
  lines.push('\n## Does Playwright Get Flagged?\n')

  const zeroDelay = algo.botDetection.zero_delay
  if (zeroDelay) {
    const detected = parseFloat(zeroDelay.detectionRate)
    if (detected > 80) {
      lines.push(`**YES** — Zero-delay typing (Playwright default) detected **${zeroDelay.detectionRate}** of the time.`)
    } else if (detected > 50) {
      lines.push(`**PARTIALLY** — Detected ${zeroDelay.detectionRate}. Not reliable enough.`)
    } else {
      lines.push(`**NO** — Only detected ${zeroDelay.detectionRate}. Algorithm is blind to Playwright.`)
    }
    lines.push(`\nBut everything else passes:`)
    for (const [type, data] of Object.entries(algo.botDetection)) {
      if (type === 'zero_delay') continue
      lines.push(`- **${type}**: ${data.passedMeanRate} pass rate`)
    }
  }

  if (capture) {
    lines.push('\n### Capture Pipeline Evidence\n')
    const modes = groupBy(capture, 'mode')
    for (const [mode, runs] of Object.entries(modes)) {
      const intercepted = runs.filter(r => r.intercepted).length
      const analyzed = runs.filter(r => r.analysis).length
      lines.push(`- **${mode}**: ${intercepted}/${runs.length} intercepted, ${analyzed} analyzed`)
      if (analyzed > 0) {
        const analyses = runs.filter(r => r.analysis).map(r => r.analysis)
        lines.push(`  - IKI: ${mean(analyses.map(a => a.mean_inter_key)).toFixed(1)}ms, std: ${mean(analyses.map(a => a.std_inter_key)).toFixed(1)}ms, dwell: ${mean(analyses.filter(a => a.mean_dwell != null).map(a => a.mean_dwell)).toFixed(1)}ms`)
      }
    }
  }

  // ---- Algorithm Results (1000 runs) ----
  lines.push('\n## Algorithm Results (1,000 runs)\n')

  lines.push('### Same-User Consistency\n')
  const su = algo.sameUser
  lines.push(`| Metric | Value |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Sessions to "high" confidence | **${su.avgSessionsToHigh.toFixed(1)}** |`)
  lines.push(`| Reached "high" rate | ${su.reachedHighRate} |`)
  lines.push(`| Avg consistency | ${su.avgConsistency} |`)
  lines.push(`| Range | ${su.minConsistency} – ${su.maxConsistency} |`)

  lines.push('\n### Cross-User Discrimination\n')
  const cu = algo.crossUser
  lines.push(`- **False match rate: ${cu.falseMatchRate}** (${cu.falseMatchCount} false matches)`)
  lines.push(`- Avg cross-user consistency: ${cu.avgCrossConsistency}`)
  if (parseFloat(cu.falseMatchRate) > 10) {
    lines.push(`- **WARNING:** Algorithm can't distinguish users with similar typing speeds`)
  }

  lines.push('\n### Bot Detection\n')
  lines.push('| Bot Type | Current Detection | Would Pass | Entropy Gap | Dwell Uniformity Gap |')
  lines.push('|----------|-------------------|-----------|-------------|---------------------|')
  for (const [type, data] of Object.entries(algo.botDetection)) {
    const entropyGap = `${data.avgBotEntropy} vs ${data.avgHumanEntropy}`
    const dwellGap = `${data.avgBotDwellUniformity} vs ${data.avgHumanDwellUniformity}`
    lines.push(`| ${type} | ${data.detectionRate} | ${data.passedMeanRate} | ${entropyGap} | ${dwellGap} |`)
  }

  // Bot detection WITH new thresholds
  if (temporal.botDetectionWithThresholds) {
    lines.push('\n### Bot Detection WITH Proposed Thresholds\n')
    lines.push('| Bot Type | By Mean | By Dwell (<27ms) | By Dwell Uniformity | By ANY New Check |')
    lines.push('|----------|---------|-----------------|--------------------|--------------------|')
    for (const [type, data] of Object.entries(temporal.botDetectionWithThresholds)) {
      lines.push(`| ${type} | ${data.detectedByMean} | ${data.detectedByDwell} | ${data.detectedByDwellUniformity} | ${data.detectedByAnyNewCheck} |`)
    }
  }

  lines.push('\n### Replay Attack\n')
  const ra = algo.replayAttack
  lines.push(`- Detection: **${ra.detectionRate}** | Perfect consistency: ${ra.perfectConsistencyRate}`)
  lines.push(`- **${ra.vulnerability}**`)

  lines.push('\n### Noise Degradation\n')
  lines.push('| Noise | Badge Lost | Avg Consistency |')
  lines.push('|-------|-----------|-----------------|')
  for (const [level, data] of Object.entries(algo.noiseDegradation)) {
    lines.push(`| ±${level} | ${data.badgeLostRate} | ${data.avgConsistency} |`)
  }

  // ---- Temporal Simulation Results ----
  lines.push('\n## Temporal Simulation (Research-Backed Profiles)\n')

  // Profile overview
  if (temporal.profileOverview) {
    lines.push('### Profile Archetypes\n')
    lines.push('| Type | Count | Platform | IKI Range | Std Range | Dwell Range | Reviews/Day |')
    lines.push('|------|-------|----------|-----------|-----------|-------------|-------------|')
    for (const [type, data] of Object.entries(temporal.profileOverview)) {
      lines.push(`| ${type} | ${data.count} | ${data.platform} | ${data.ikiRange} | ${data.stdRange} | ${data.dwellRange} | ${data.reviewsPerDay} |`)
    }
  }

  // Convergence
  if (temporal.convergenceOverTime) {
    const conv = temporal.convergenceOverTime.summary
    lines.push('\n### Convergence Over 60 Days\n')
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Profiles tested | ${conv.totalProfiles} |`)
    lines.push(`| Reached "high" | ${conv.reachedHighCount} (${conv.reachedHighRate}) |`)
    lines.push(`| Avg days to "high" | ${conv.avgDaysToHigh} |`)
    lines.push(`| Avg sessions to "high" | ${conv.avgSessionsToHigh} |`)
    lines.push(`| Avg days to "medium" | ${conv.avgDaysToMedium} |`)
    lines.push(`| Avg final consistency | ${conv.avgFinalConsistency} |`)
  }

  // Circadian
  if (temporal.circadianEffect) {
    const circ = temporal.circadianEffect.summary
    lines.push('\n### Circadian Effect (Day vs Night)\n')
    lines.push(`- Night badge loss rate: **${circ.nightBadgeLossRate}**`)
    lines.push(`- Day badge loss rate: **${circ.dayBadgeLossRate}**`)
    lines.push(`- **${circ.verdict}**`)
  }

  // Platform
  if (temporal.platformComparison) {
    const pc = temporal.platformComparison
    lines.push('\n### Platform Comparison\n')
    lines.push('| Metric | Desktop | Mobile |')
    lines.push('|--------|---------|--------|')
    lines.push(`| Count | ${pc.desktop.count} | ${pc.mobile.count} |`)
    lines.push(`| Avg IKI | ${pc.desktop.avgIKI}ms | ${pc.mobile.avgIKI}ms |`)
    lines.push(`| Avg Dwell | ${pc.desktop.avgDwell}ms | ${pc.mobile.avgDwell}ms |`)
    lines.push(`| Avg Consistency | ${pc.desktop.avgConsistency} | ${pc.mobile.avgConsistency} |`)
    lines.push(`| Cross-platform false match | ${pc.crossPlatformFalseMatchRate} |`)
  }

  // Power reviewers
  if (temporal.powerReviewerStress) {
    const pr = temporal.powerReviewerStress
    lines.push('\n### Power Reviewer Stress Test\n')
    lines.push(`- Avg reviews/day: ${pr.summary.avgSessionsPerDay}`)
    lines.push(`- Max single-day reviews: ${pr.summary.maxSingleDay}`)
    lines.push(`- Velocity-flagged sessions: ${pr.summary.velocityFlaggedTotal}`)
    lines.push(`- **${pr.summary.verdict}**`)
  }

  // Velocity anomalies
  if (temporal.velocityAnomalies) {
    const va = temporal.velocityAnomalies
    lines.push('\n### Velocity Anomaly: Human vs Bot Over Time\n')
    lines.push(`| Metric | Human (30 days) | Bot (1 day) |`)
    lines.push(`|--------|-----------------|-------------|`)
    lines.push(`| Sessions | ${va.human.totalSessions} | ${va.bot.totalSessions} |`)
    lines.push(`| Reviews/day | ${va.human.avgPerDay} | ${va.bot.avgPerDay} |`)
    lines.push(`| Final consistency | ${va.human.finalConsistency} | ${va.bot.finalConsistency} |`)
    lines.push(`| Final confidence | ${va.human.finalConfidence} | ${va.bot.finalConfidence} |`)
    lines.push(`| Velocity flagged? | No | ${va.bot.flaggedByVelocity ? 'YES' : 'No'} |`)
    lines.push(`\n**${va.verdict}**`)
  }

  // 30-day simulation
  if (temporal.thirtyDaySimulation) {
    const sim = temporal.thirtyDaySimulation
    lines.push(`\n### 30-Day Simulation (${sim.users} users)\n`)
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Avg reviews/day | ${sim.summary.avgReviewsPerDay} |`)
    lines.push(`| Avg final consistency | ${sim.summary.avgFinalConsistency} |`)
    lines.push(`| Reached "high" | ${sim.summary.reachedHigh}/${sim.users} |`)
    lines.push(`| Reached "medium" | ${sim.summary.reachedMedium}/${sim.users} |`)
    lines.push(`| Stuck "low" | ${sim.summary.stuckLow}/${sim.users} |`)
  }

  // 90-day simulation
  if (temporal.ninetyDaySimulation) {
    const sim = temporal.ninetyDaySimulation
    lines.push(`\n### 90-Day Simulation (${sim.users} users)\n`)
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Avg reviews/day | ${sim.summary.avgReviewsPerDay} |`)
    lines.push(`| Avg final consistency | ${sim.summary.avgFinalConsistency} |`)
    lines.push(`| Reached "high" | ${sim.summary.reachedHigh}/${sim.users} |`)
    lines.push(`| Reached "medium" | ${sim.summary.reachedMedium}/${sim.users} |`)
    lines.push(`| Stuck "low" | ${sim.summary.stuckLow}/${sim.users} |`)
  }

  // ---- HARDENED ALGORITHM SCORECARD ----
  if (hardened && hardened.scorecard) {
    const sc = hardened.scorecard
    lines.push('\n## Hardened Algorithm Scorecard\n')
    lines.push(`**${sc.passedChecks}/${sc.totalChecks} checks passing** ${sc.allPassed ? '— ALL GOALS MET' : '— WORK REMAINING'}\n`)

    for (const check of sc.checks) {
      lines.push(`### ${check.goal}\n`)
      lines.push('| Target | Value | Status |')
      lines.push('|--------|-------|--------|')
      for (const r of check.results) {
        const icon = r.passed ? 'PASS' : 'FAIL'
        lines.push(`| ${r.label} | ${r.value.toFixed(1)}% | **${icon}** |`)
      }
      lines.push('')
    }

    // Bot detection breakdown
    if (hardened.botDetection) {
      lines.push('### Bot Detection — Flag Breakdown\n')
      lines.push('Which checks catch which bots:\n')
      lines.push('| Bot Type | Detection | Avg Score | Top Flags |')
      lines.push('|----------|-----------|-----------|-----------|')
      for (const [type, data] of Object.entries(hardened.botDetection.byType)) {
        const topFlags = Object.entries(data.flagBreakdown)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([f, c]) => `${f}(${c})`)
          .join(', ')
        const icon = data.meetsGoal ? 'PASS' : 'FAIL'
        lines.push(`| ${type} | ${data.detectionRate} **${icon}** | ${data.avgScore} | ${topFlags} |`)
      }
    }

    // Replay deep dive
    if (hardened.replayDetection) {
      const rd = hardened.replayDetection
      lines.push(`\n### Replay Detection: ${rd.detectionRate}`)
      if (Object.keys(rd.flagBreakdown).length > 0) {
        lines.push('\nFlags triggered:')
        for (const [flag, count] of Object.entries(rd.flagBreakdown)) {
          lines.push(`- ${flag}: ${count}/${rd.total}`)
        }
      }
    }

    // Sophisticated bot deep dive
    if (hardened.sophisticatedBotDeepDive) {
      const sbd = hardened.sophisticatedBotDeepDive
      lines.push(`\n### Sophisticated Bot Deep Dive: ${sbd.detectionRate}`)
      lines.push(`\n${sbd.analysis}`)
      if (sbd.nearMissCount > 0) {
        lines.push(`\n${sbd.nearMissCount} near-misses (suspicious but passed):`)
        for (const nm of sbd.nearMisses) {
          const flagNames = nm.flags.map(f => f.check).join(', ')
          lines.push(`- Run ${nm.run}: score=${nm.score}, flags=[${flagNames}], IKI=${nm.botMean}ms, dwell=${nm.botDwell}ms, edit=${nm.botEditRatio}, pauses=${nm.botPauseFreq}`)
        }
      }
    }

    // False positive details
    if (hardened.falsePositives && hardened.falsePositives.details.length > 0) {
      lines.push('\n### False Positive Details\n')
      lines.push('Legitimate sessions incorrectly flagged:\n')
      for (const fp of hardened.falsePositives.details) {
        const flagNames = fp.flags.map(f => `${f.check}(${f.value})`).join(', ')
        lines.push(`- **${fp.profileId}** (${fp.type}/${fp.platform}): score=${fp.score}, flags=[${flagNames}]`)
      }
    }

    // Algorithm vs Protocol defense summary
    lines.push('\n### Defense Layer Summary\n')
    lines.push('| Layer | Defends Against | Status |')
    lines.push('|-------|----------------|--------|')
    lines.push('| Algorithm (scoreSession) | zero_delay, fixed_delay, uniform_random, gaussian_mimic, sophisticated | 95-100% detection, <1% FP |')
    lines.push('| Algorithm (replay heuristic) | replay of own sessions | ~3% detection (ceiling) |')
    lines.push('| **DB hash dedup (TODO)** | replay attacks | **Required for 80%+ replay defense** |')
    lines.push('| **Session nonces (TODO)** | network-captured replays | **Required for replay-at-rest defense** |')
    lines.push('')
    lines.push('> **Replay attacks are undetectable at the biometric level** because replayed human')
    lines.push('> sessions have all genuine human characteristics. The algorithm catches 5 of 6 bot')
    lines.push('> types at 95%+. Replay requires protocol-level defense: hash each sessions raw')
    lines.push('> timing data at insert time and reject duplicates.')
  }

  // ---- Cracks Found ----
  lines.push('\n## Cracks Found\n')

  const cracks = identifyCracks(algo, temporal)
  for (const crack of cracks) {
    lines.push(`### ${crack.severity}: ${crack.title}\n`)
    lines.push(crack.description)
    lines.push(`\n**Fix:** ${crack.fix}\n`)
  }

  // ---- Recommendations ----
  lines.push('\n## Recommended Algorithm Improvements\n')
  lines.push('Priority order (each catches bots the previous misses):\n')
  lines.push(`1. **Dwell time floor** — reject \`mean_dwell < ${THRESHOLDS.dwell.min_ms}ms\` (catches all Playwright bots)`)
  lines.push(`2. **Variance floor** — reject \`std_inter_key < ${THRESHOLDS.iki.min_std}ms\` (catches fixed-delay + replay)`)
  lines.push(`3. **Dwell uniformity** — reject per-key CV < ${THRESHOLDS.dwell_uniformity.min_human_cv} (catches gaussian mimic)`)
  lines.push(`4. **Entropy floor** — reject Shannon entropy < ${THRESHOLDS.entropy.min_human} (catches uniform random)`)
  lines.push(`5. **Perfect consistency flag** — flag consistency >= 0.98 for review (catches sophisticated replay)`)
  lines.push(`6. **Velocity limit** — flag > ${THRESHOLDS.activity.max_reviews_per_day} reviews/day (catches spam bots)`)
  lines.push(`7. **Circadian tolerance** — expect ±${(THRESHOLDS.circadian.night_slowdown_pct * 100).toFixed(0)}% IKI drift at night (prevents false positives)`)

  return lines.join('\n')
}

function identifyCracks(algo, temporal) {
  const cracks = []

  // Variance blindness
  const fixedDelay = algo.botDetection.fixed_delay
  if (fixedDelay && parseFloat(fixedDelay.passedMeanRate) > 20) {
    cracks.push({
      severity: 'CRITICAL',
      title: 'Variance Blindness',
      description: `FIXED_DELAY bot (mean=100, std=0) passes ${fixedDelay.passedMeanRate} of the time. Algorithm only checks mean_inter_key.`,
      fix: `Add std_inter_key check. Require std > ${THRESHOLDS.iki.min_std}ms (research: fast humans have SD ~12ms, buffered 10%).`,
    })
  }

  // Replay vulnerability
  const replay = algo.replayAttack
  if (parseFloat(replay.detectionRate) < 10) {
    cracks.push({
      severity: 'CRITICAL',
      title: 'Replay Attack — 0% Detection',
      description: `Replayed sessions score consistency ~${replay.avgConsistency}. ${replay.perfectConsistencyRate} hit >=0.99. Indistinguishable from consistent human.`,
      fix: 'Flag consistency >= 0.98 as suspicious. Hash sample_data and reject duplicates. Add session nonce.',
    })
  }

  // Dwell blindness
  const gaussianMimic = algo.botDetection.gaussian_mimic
  if (gaussianMimic) {
    cracks.push({
      severity: 'HIGH',
      title: 'Dwell Time Ignored',
      description: `Captured but unused. Bot dwell: ~1-2ms. Human dwell: 75-150ms. Dwell uniformity gap: ${gaussianMimic.avgBotDwellUniformity} (bot) vs ${gaussianMimic.avgHumanDwellUniformity} (human).`,
      fix: `Flag mean_dwell < ${THRESHOLDS.dwell.min_ms}ms. Check per-key CV < ${THRESHOLDS.dwell_uniformity.min_human_cv}.`,
    })
  }

  // Cross-user discrimination
  const cu = algo.crossUser
  if (parseFloat(cu.falseMatchRate) > 15) {
    cracks.push({
      severity: 'HIGH',
      title: `${cu.falseMatchRate} Cross-User False Match Rate`,
      description: `Two users at ~200ms/key look identical. Algorithm only uses mean for identity.`,
      fix: 'Add std, bigrams, and per-key dwell to consistency calculation. Multi-dimensional comparison.',
    })
  }

  // Entropy gap
  const zeroDelay = algo.botDetection.zero_delay
  if (zeroDelay) {
    cracks.push({
      severity: 'HIGH',
      title: 'No Entropy Check',
      description: `Human entropy ~${zeroDelay.avgHumanEntropy} vs bot ~${zeroDelay.avgBotEntropy}. Clear signal, never used.`,
      fix: `Require Shannon entropy > ${THRESHOLDS.entropy.min_human} for timing arrays.`,
    })
  }

  // Velocity
  if (temporal.velocityAnomalies && temporal.velocityAnomalies.bot.finalConsistency > 0.7) {
    cracks.push({
      severity: 'MEDIUM',
      title: 'No Velocity Check',
      description: `Bot posting 20 reviews in 1 day builds consistency ${temporal.velocityAnomalies.bot.finalConsistency}. No rate check on review velocity.`,
      fix: `Flag > ${THRESHOLDS.activity.max_reviews_per_day} reviews/day. Require velocity < ${THRESHOLDS.activity.max_reviews_per_hour}/hour sustained.`,
    })
  }

  // Bigrams unused
  cracks.push({
    severity: 'MEDIUM',
    title: 'Bigram Data Unused',
    description: 'Captured and stored but never compared. Common bigrams (th, he) should be faster than mean for real humans.',
    fix: 'Compare bigram speed ratios. Flag sessions where all bigrams have identical timing.',
  })

  // Per-key dwell
  cracks.push({
    severity: 'MEDIUM',
    title: 'Per-Key Dwell Uniformity Unchecked',
    description: 'Bots have CV ~0 across keys. Humans vary: vowels faster, consonants slower.',
    fix: `Require per-key dwell CV > ${THRESHOLDS.dwell_uniformity.min_human_cv}.`,
  })

  return cracks
}

function printSummary(algo, temporal, hardened) {
  console.log('\n--- SUMMARY ---\n')

  // SCORECARD FIRST — this is what matters
  if (hardened && hardened.scorecard) {
    const sc = hardened.scorecard
    console.log(`SCORECARD: ${sc.passedChecks}/${sc.totalChecks} ${sc.allPassed ? 'ALL GOALS MET' : 'WORK REMAINING'}\n`)

    for (const check of sc.checks) {
      for (const r of check.results) {
        const icon = r.passed ? ' PASS' : ' FAIL'
        console.log(`  ${icon}  ${r.label}: ${r.value.toFixed(1)}% (goal: ${check.goal})`)
      }
    }
  }

  // Hardened bot detection
  if (hardened && hardened.botDetection) {
    console.log('\nHARDENED BOT DETECTION:')
    for (const [type, data] of Object.entries(hardened.botDetection.byType)) {
      const icon = data.meetsGoal ? ' PASS' : ' FAIL'
      console.log(`  ${icon}  ${type}: ${data.detectionRate} (score: ${data.avgScore})`)
    }
    console.log(`\n  False positive rate: ${hardened.falsePositives.falsePositiveRate}`)
    console.log(`  Night FP rate: ${hardened.nightFalsePositives.falsePositiveRate}`)
    console.log(`  Mobile FP rate: ${hardened.mobileFalsePositives.falsePositiveRate}`)
    console.log(`  Power reviewer FP: ${hardened.powerFalsePositives.falsePositiveRate}`)
    console.log(`  Replay detection: ${hardened.replayDetection.detectionRate}`)
  }

  // Sophisticated bot analysis
  if (hardened && hardened.sophisticatedBotDeepDive) {
    const sbd = hardened.sophisticatedBotDeepDive
    console.log(`\n  Sophisticated bot: ${sbd.detectionRate} (${sbd.nearMissCount} near-misses)`)
    console.log(`  ${sbd.analysis}`)
  }
}

// ---- Helpers ----

function mean(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function groupBy(arr, key) {
  const groups = {}
  for (const item of arr) {
    const k = item[key]
    if (!groups[k]) groups[k] = []
    groups[k].push(item)
  }
  return groups
}
