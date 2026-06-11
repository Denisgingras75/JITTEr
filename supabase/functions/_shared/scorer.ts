// ─────────────────────────────────────────────────────────────────────────────
// scorer.ts — server-side WAR scorer (Deno/TypeScript)
//
// Ported verbatim in logic from extension/src/biometrics.js so the server and
// client compute IDENTICAL scores. The client may still score locally for live
// UI feedback, but ONLY this server-side result is ever stored or attested.
//
// Keep this in sync with biometrics.js. The constants below are the single
// source of truth for thresholds; if you tune them, tune them here and mirror.
// ─────────────────────────────────────────────────────────────────────────────

type Capture = {
  flightTimes: number[]
  dwellTimes?: number[]
  humanChars?: number
  alienChars?: number
  backspaceCount?: number
  pauseCount?: number
}

type Scored = {
  war: number
  raw_war: number
  classification: string
  tier?: string
  flags: string[]
  components?: Record<string, number>
  timeCap?: number
}

const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
const std = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, t) => s + (t - m) ** 2, 0) / a.length)
}
const round2 = (n: number) => Math.round(n * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const rampScore = (raw: number, floor: number, ceiling: number) =>
  floor < ceiling ? clamp01((raw - floor) / (ceiling - floor))
                  : clamp01((floor - raw) / (floor - ceiling))

function normalCDF(z: number): number {
  if (z < -6) return 0
  if (z > 6) return 1
  const sign = z < 0 ? -1 : 1
  z = Math.abs(z)
  const t = 1 / (1 + 0.2316419 * z)
  const d = 0.3989422804014327 * Math.exp(-z * z / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744))))
  return sign === 1 ? 1 - p : p
}

function ksStatistic(values: number[]): number {
  if (values.length < 10) return 0.5
  const logs = values.filter(v => v > 0).map(v => Math.log(v))
  if (logs.length < 10) return 0.5
  const mu = mean(logs), sigma = std(logs)
  if (sigma === 0) return 1.0
  const sorted = values.slice().sort((a, b) => a - b)
  const n = sorted.length
  let maxDiff = 0
  for (let j = 0; j < n; j++) {
    const empirical = (j + 1) / n
    const z = (Math.log(sorted[j]) - mu) / sigma
    const diff = Math.abs(empirical - normalCDF(z))
    if (diff > maxDiff) maxDiff = diff
  }
  return round3(maxDiff)
}

const WAR_RAMPS: Record<string, [number, number]> = {
  inter_key_var: [9, 45], dwell_std: [8, 20], mean_dwell: [27, 80],
  edit_ratio: [0.03, 0.08], pause_freq: [0.4, 1.5], purity: [0, 1],
  ks_shape: [0.25, 0.08],
}
// NOTE: bigram_rhythm, per_key, cross_signal, dwell_uniformity require richer
// capture (per-key dwell maps, bigram timings) than the portable widget sends.
// On the server they default to 0.5 (neutral) until the widget ships those
// arrays — identical to how biometrics.js handles missing inputs.
const WAR_WEIGHTS: Record<string, number> = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.05,
  dwell_uniformity: 0.04, purity: 0.03,
}
const WAR_TIERS: [number, string][] = [
  [0.80, 'Hall of Fame'], [0.60, 'All-Star'], [0.40, 'Solid'],
  [0.20, 'Rookie'], [0, 'Suspicious'],
]

export function scoreRaw(capture: Capture): Scored {
  const ft = capture.flightTimes || []
  if (ft.length < 10) {
    return { war: 0, raw_war: 0, classification: 'insufficient_data', flags: ['too_short'] }
  }
  const dt = capture.dwellTimes || []
  const totalChars = (capture.humanChars || 0) + (capture.alienChars || 0)
  const backspaces = capture.backspaceCount || 0
  const pauses = capture.pauseCount || 0

  const profile = {
    mean_inter_key: round2(mean(ft)),
    std_inter_key: round2(std(ft)),
    mean_dwell: dt.length ? round2(mean(dt)) : null,
    std_dwell: dt.length > 1 ? round2(std(dt)) : null,
    edit_ratio: totalChars > 0 ? round3(backspaces / (totalChars + backspaces)) : 0,
    pause_freq: ft.length > 0 ? round2((pauses / ft.length) * 100) : 0,
  }

  const flags: string[] = []

  // LAYER 1: hard floors → instant WAR 0 (the bot tripwires)
  const hardFloor =
    (profile.mean_dwell != null && profile.mean_dwell < 27) ||
    (profile.std_inter_key < 9) ||
    (profile.mean_inter_key < 54)
  if (hardFloor) {
    if (profile.mean_dwell != null && profile.mean_dwell < 27) flags.push('dwell_floor')
    if (profile.std_inter_key < 9) flags.push('variance_floor')
    if (profile.mean_inter_key < 54) flags.push('iki_floor')
    return { war: 0, raw_war: 0, classification: 'bot', tier: 'Suspicious', flags }
  }

  // LAYER 3: weighted signals (channels needing rich capture default to 0.5)
  const c: Record<string, number> = {
    bigram_rhythm: 0.5, per_key: 0.5, cross_signal: 0.5, dwell_uniformity: 0.5,
  }
  c.inter_key_var = rampScore(profile.std_inter_key, ...WAR_RAMPS.inter_key_var)
  c.dwell_std = profile.std_dwell != null
    ? rampScore(profile.std_dwell, ...WAR_RAMPS.dwell_std) : 0.5
  if (profile.std_dwell != null && profile.std_dwell < 8) flags.push('dwell_std_hard')
  c.mean_dwell = profile.mean_dwell != null
    ? rampScore(profile.mean_dwell, ...WAR_RAMPS.mean_dwell) : 0.5
  const ks = ksStatistic(ft)
  c.distribution = rampScore(ks, ...WAR_RAMPS.ks_shape)
  if (ks > 0.25) flags.push('non_lognormal')
  const editSub = rampScore(profile.edit_ratio, ...WAR_RAMPS.edit_ratio)
  const pauseSub = rampScore(profile.pause_freq, ...WAR_RAMPS.pause_freq)
  c.editing = (editSub + pauseSub) / 2
  if (profile.edit_ratio < 0.03 && profile.pause_freq < 0.4) flags.push('no_editing_behavior')

  // purity
  const total = (capture.humanChars || 0) + (capture.alienChars || 0)
  const pasteRatio = total > 0 ? (capture.alienChars || 0) / total : 0
  c.purity = total >= 20 ? rampScore((capture.humanChars || 0) / total, ...WAR_RAMPS.purity) : 0.5
  if (total >= 20 && pasteRatio > 0.50) flags.push('paste_heavy')
  if (total >= 20 && pasteRatio > 0.90) flags.push('paste_flood')

  let raw_war = 0
  for (const [k, w] of Object.entries(WAR_WEIGHTS)) raw_war += w * (c[k] != null ? c[k] : 0.5)
  raw_war = round2(raw_war)

  // LAYER 2: soft penalties
  const PEN: Record<string, number> = {
    dwell_std_hard: 0.06, paste_heavy: 0.15, no_editing_behavior: 0.05,
    non_lognormal: 0.05, paste_flood: 0.30,
  }
  let penalty = 0
  for (const f of flags) if (PEN[f]) penalty += PEN[f]
  let war = round2(Math.max(0, raw_war - penalty))
  if (total > 0 && pasteRatio > 0.10) war = round2(war * Math.max(0, 1 - pasteRatio))

  const tier = WAR_TIERS.find(([min]) => war >= min)![1]
  return { war, raw_war, classification: classify(war), tier, flags, components: c }
}

function classify(war: number): string {
  if (war >= 0.80) return 'verified'
  if (war >= 0.50) return 'suspicious'
  return 'bot'
}

// Time confidence cap — the economic thesis, applied SERVER-SIDE with the true
// first_seen. Day 0 ≤ 0.35, scaling logarithmically to 1.0 at ~180 days.
export function applyTimeCap(s: Scored, firstSeenMs: number | null): Scored {
  let cap: number
  if (!firstSeenMs) {
    cap = 0.35
  } else {
    const days = Math.max(0, (Date.now() - firstSeenMs) / 86400000)
    cap = Math.min(1.0, round2(0.35 + 0.65 * Math.log(1 + days / 30) / Math.log(7)))
  }
  const war = round2(Math.min(s.raw_war, cap))
  const tier = WAR_TIERS.find(([min]) => war >= min)![1]
  return { ...s, war, timeCap: cap, tier, classification: s.classification === 'bot' ? 'bot' : classify(war) }
}
