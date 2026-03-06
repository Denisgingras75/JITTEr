#!/usr/bin/env node

/**
 * Bot Farm Report Generator
 *
 * Reads the JSONL log from daily bot farm runs and generates
 * a 2-week adversarial test report.
 *
 * Usage: node e2e/jitter-lab/botfarm/report.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG_FILE = join(__dirname, 'results', 'botfarm-log.jsonl')
const REPORT_FILE = join(__dirname, 'results', 'botfarm-report.md')

if (!existsSync(LOG_FILE)) {
  console.log('No botfarm-log.jsonl found. Run the bot farm first:')
  console.log('  npx playwright test e2e/jitter-lab/botfarm/botfarm.spec.js')
  process.exit(1)
}

// Parse JSONL
const lines = readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean)
const entries = lines.map(line => {
  try { return JSON.parse(line) }
  catch { return null }
}).filter(Boolean)

if (entries.length === 0) {
  console.log('Log file is empty.')
  process.exit(1)
}

// Group by persona
const byPersona = {}
for (const e of entries) {
  if (!byPersona[e.persona]) byPersona[e.persona] = []
  byPersona[e.persona].push(e)
}

// Group by date
const byDate = {}
for (const e of entries) {
  if (!byDate[e.date]) byDate[e.date] = []
  byDate[e.date].push(e)
}

const dates = Object.keys(byDate).sort()
const personaIds = Object.keys(byPersona).sort()

// Stats helpers
function avg(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function pct(count, total) {
  if (total === 0) return '0.0%'
  return (count / total * 100).toFixed(1) + '%'
}

// ──────────────────────────────────────────────────────────────────────
// Build report
// ──────────────────────────────────────────────────────────────────────
const out = []

out.push('# Bot Farm vs Jitter Protocol — Adversarial Test Report')
out.push('')
out.push(`Generated: ${new Date().toISOString().split('T')[0]}`)
out.push(`Test period: ${dates[0]} to ${dates[dates.length - 1]} (${dates.length} days)`)
out.push(`Total sessions: ${entries.length}`)
out.push(`Personas: ${personaIds.length}`)
out.push('')

// ── Executive Summary ────────────────────────────────────────────────
out.push('## Executive Summary')
out.push('')
out.push('| Persona | Sessions | Pass Rate | Avg WAR | Avg Flags | Verdict |')
out.push('|---------|----------|-----------|---------|-----------|---------|')

for (const id of personaIds) {
  const sessions = byPersona[id]
  const scored = sessions.filter(s => s.war != null)
  const passed = scored.filter(s => s.classification === 'verified')
  const suspicious = scored.filter(s => s.classification === 'suspicious')
  const avgWar = avg(scored.map(s => s.war))
  const avgFlags = avg(scored.map(s => (s.flags || []).length))

  let verdict
  if (passed.length === 0 && suspicious.length === 0) verdict = 'BLOCKED'
  else if (passed.length / Math.max(scored.length, 1) < 0.1) verdict = 'BLOCKED'
  else if (passed.length / Math.max(scored.length, 1) < 0.5) verdict = 'PARTIAL BYPASS'
  else verdict = 'BYPASS'

  out.push(`| ${id} | ${sessions.length} | ${pct(passed.length, scored.length)} | ${avgWar.toFixed(2)} | ${avgFlags.toFixed(1)} | **${verdict}** |`)
}

// ── Daily Progression ────────────────────────────────────────────────
out.push('')
out.push('## Daily Progression')
out.push('')
out.push('Shows whether bots get better at fooling the scorer over time (passport accumulation test).')
out.push('')

// Header
const dateHeaders = dates.map(d => d.slice(5)) // MM-DD
out.push('| Persona | ' + dateHeaders.join(' | ') + ' |')
out.push('|---------|' + dateHeaders.map(() => '---').join('|') + '|')

for (const id of personaIds) {
  const cells = dates.map(date => {
    const daySessions = (byDate[date] || []).filter(e => e.persona === id)
    const scored = daySessions.filter(s => s.war != null)
    if (scored.length === 0) return '-'
    const passed = scored.filter(s => s.classification === 'verified').length
    return `${passed}/${scored.length}`
  })
  out.push(`| ${id} | ${cells.join(' | ')} |`)
}

// ── Per-Persona Deep Dive ────────────────────────────────────────────
out.push('')
out.push('## Per-Persona Analysis')

for (const id of personaIds) {
  const sessions = byPersona[id]
  const scored = sessions.filter(s => s.war != null)

  out.push('')
  out.push(`### ${id}`)
  out.push('')

  if (scored.length === 0) {
    out.push('No scored sessions (JitterBox may not have captured enough keystrokes).')
    continue
  }

  const wars = scored.map(s => s.war)
  const passed = scored.filter(s => s.classification === 'verified')
  const suspicious = scored.filter(s => s.classification === 'suspicious')
  const bot = scored.filter(s => s.classification === 'bot')

  out.push(`- **Pass rate:** ${pct(passed.length, scored.length)} (${passed.length}/${scored.length})`)
  out.push(`- **Suspicious rate:** ${pct(suspicious.length, scored.length)}`)
  out.push(`- **Bot rate:** ${pct(bot.length, scored.length)}`)
  out.push(`- **WAR range:** ${Math.min(...wars).toFixed(2)} - ${Math.max(...wars).toFixed(2)}`)
  out.push(`- **Avg WAR:** ${avg(wars).toFixed(2)}`)

  // Timing stats
  const ikis = scored.filter(s => s.mean_inter_key != null).map(s => s.mean_inter_key)
  const dwells = scored.filter(s => s.mean_dwell != null).map(s => s.mean_dwell)
  if (ikis.length > 0) {
    out.push(`- **Avg IKI:** ${avg(ikis).toFixed(1)}ms`)
  }
  if (dwells.length > 0) {
    out.push(`- **Avg dwell:** ${avg(dwells).toFixed(1)}ms`)
  }

  // Flag frequency
  const flagCounts = {}
  for (const s of scored) {
    for (const f of (s.flags || [])) {
      flagCounts[f] = (flagCounts[f] || 0) + 1
    }
  }
  if (Object.keys(flagCounts).length > 0) {
    out.push('')
    out.push('**Flags triggered:**')
    const sortedFlags = Object.entries(flagCounts).sort((a, b) => b[1] - a[1])
    for (const [flag, count] of sortedFlags) {
      out.push(`- ${flag}: ${count}/${scored.length} (${pct(count, scored.length)})`)
    }
  }

  // Component breakdown (if available)
  const withComponents = scored.filter(s => s.components)
  if (withComponents.length > 0) {
    out.push('')
    out.push('**Avg component scores:**')
    const compKeys = Object.keys(withComponents[0].components)
    for (const key of compKeys) {
      const vals = withComponents.map(s => s.components[key]).filter(v => v != null)
      if (vals.length > 0) {
        const a = avg(vals)
        const indicator = a < 0.5 ? ' <-- WEAK' : ''
        out.push(`- ${key}: ${a.toFixed(2)}${indicator}`)
      }
    }
  }
}

// ── Weakest Layers ───────────────────────────────────────────────────
out.push('')
out.push('## Weakest Layers')
out.push('')
out.push('Which WAR layers are most/least effective at catching bots?')
out.push('')

// Aggregate all flags across all personas
const globalFlags = {}
const totalScored = entries.filter(s => s.war != null).length
for (const e of entries) {
  for (const f of (e.flags || [])) {
    globalFlags[f] = (globalFlags[f] || 0) + 1
  }
}

if (Object.keys(globalFlags).length > 0) {
  out.push('| Layer | Times Triggered | Rate |')
  out.push('|-------|----------------|------|')
  const sorted = Object.entries(globalFlags).sort((a, b) => b[1] - a[1])
  for (const [flag, count] of sorted) {
    out.push(`| ${flag} | ${count} | ${pct(count, totalScored)} |`)
  }
} else {
  out.push('No flags triggered (either all passed or scoring data not captured).')
}

// ── Passport Simulation ──────────────────────────────────────────────
out.push('')
out.push('## Passport Accumulation Simulation')
out.push('')
out.push('If these sessions were stored, would bots build "veteran" passports?')
out.push('')

for (const id of personaIds) {
  const sessions = byPersona[id].filter(s => s.war != null).sort((a, b) => a.date < b.date ? -1 : 1)
  if (sessions.length === 0) continue

  // Running average WAR
  let runningWar = 0
  let verifiedCount = 0
  const progression = []

  for (let i = 0; i < sessions.length; i++) {
    runningWar = (runningWar * i + sessions[i].war) / (i + 1)
    if (sessions[i].classification === 'verified') verifiedCount++

    // "Passport level" based on accumulated verified sessions
    let level = 'none'
    if (verifiedCount >= 20) level = 'veteran'
    else if (verifiedCount >= 10) level = 'established'
    else if (verifiedCount >= 5) level = 'building'
    else if (verifiedCount >= 1) level = 'rookie'

    progression.push({ session: i + 1, war: runningWar, verified: verifiedCount, level })
  }

  const final = progression[progression.length - 1]
  out.push(`**${id}:** ${final.verified} verified sessions -> **${final.level}** passport (avg WAR: ${final.war.toFixed(2)})`)
}

// ── Recommendations ──────────────────────────────────────────────────
out.push('')
out.push('## Recommendations')
out.push('')

// Find which persona is most dangerous
let mostDangerous = null
let highestPassRate = 0
for (const id of personaIds) {
  const scored = byPersona[id].filter(s => s.war != null)
  const passed = scored.filter(s => s.classification === 'verified')
  const rate = scored.length > 0 ? passed.length / scored.length : 0
  if (rate > highestPassRate) {
    highestPassRate = rate
    mostDangerous = id
  }
}

if (mostDangerous && highestPassRate > 0) {
  out.push(`Most dangerous persona: **${mostDangerous}** (${(highestPassRate * 100).toFixed(1)}% pass rate)`)
  out.push('')

  const dangerous = byPersona[mostDangerous].filter(s => s.war != null && s.classification === 'verified')
  if (dangerous.length > 0) {
    // What layers did the passing sessions NOT trigger?
    const allLayers = ['dwell_floor', 'variance_floor', 'per_key_uniformity', 'no_editing_behavior',
      'dwell_std_hard', 'dwell_std_soft', 'bigram_uniform', 'non_lognormal']
    const triggered = new Set()
    for (const s of dangerous) {
      for (const f of (s.flags || [])) triggered.add(f)
    }
    const missed = allLayers.filter(l => !triggered.has(l))
    if (missed.length > 0) {
      out.push('Layers that NEVER caught this bot:')
      for (const l of missed) {
        out.push(`- ${l}`)
      }
      out.push('')
      out.push('These are the layers to harden first.')
    }
  }
} else {
  out.push('No persona achieved any verified sessions. The scorer is holding.')
}

// Write report
const report = out.join('\n')
writeFileSync(REPORT_FILE, report)
console.log(`Report written to ${REPORT_FILE}`)
console.log('')
console.log(report)
