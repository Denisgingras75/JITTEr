// ─────────────────────────────────────────────────────────────────────────────
// scorer.ts — server-side WAR scorer (Deno/TypeScript)
//
// EXACT port of the scoreRaw() path in sdk/src/core/jitter-box.js — the engine
// the deployed widget bundle (sdk/dist/jitter.min.js) actually runs. The client
// may still score locally for live UI feedback, but ONLY this server-side result
// is ever stored or attested.
//
// Parity is enforced by tests/scorer-parity.test.mjs, which runs identical
// captures through both engines and asserts identical war / classification /
// flags / components. If you tune a constant here, tune it in
// sdk/src/core/jitter-box.js too — the parity test will fail until you do.
//
// Channels that need richer capture than the portable widget sends (bigram
// signatures, per-key dwell maps) default to 0.5 (neutral) on BOTH sides,
// because the widget's scoreRaw() builds the profile with empty maps. The
// cross_signal channel needs only flightTimes + dwellTimes — which the widget
// DOES send — so it is fully ported, not neutralized.
// ─────────────────────────────────────────────────────────────────────────────

export type Capture = {
  flightTimes: number[]
  dwellTimes?: number[]
  humanChars?: number
  alienChars?: number
  pasteSizes?: number[]
  backspaceCount?: number
  pauseCount?: number
}

export type Scored = {
  war: number
  raw_war: number
  classification: string
  tier?: string
  flags: string[]
  components?: Record<string, number>
  timeCap?: number
}

const PAUSE_THRESHOLD_MS = 2000
const MIN_CHARS_FOR_SCORE = 20

// Identical to jitter-box.js RAMPS/WEIGHTS (keys the scoreRaw path can reach).
const RAMPS: Record<string, [number, number]> = {
  inter_key_var: [9, 45],
  dwell_std: [8, 20],
  mean_dwell: [27, 80],
  edit_ratio: [0.03, 0.08],
  pause_freq: [0.4, 1.5],
  purity: [0, 1],
  ks_shape: [0.25, 0.08],
}
const WEIGHTS: Record<string, number> = {
  bigram_rhythm: 0.18, per_key: 0.15, cross_signal: 0.15, distribution_shape: 0.12,
  inter_key_var: 0.10, dwell_std: 0.10, mean_dwell: 0.08, editing: 0.05,
  dwell_uniformity: 0.04, purity: 0.03,
}
// Identical to jitter-box.js PENALTIES. bigram_uniform / per_key_uniformity
// cannot fire on widget captures (empty maps → neutral 0.5, no flag), but the
// table is mirrored in full so the engines stay drift-proof.
const PENALTIES: Record<string, number> = {
  bigram_uniform: 0.08,
  per_key_uniformity: 0.08,
  dwell_std_hard: 0.06,
  no_editing_behavior: 0.05,
  non_lognormal: 0.05,
  paste_flood: 0.30, // the one paste penalty — only a near-total flood
}
const WAR_TIERS: [number, string][] = [
  [0.80, 'Hall of Fame'], [0.60, 'All-Star'], [0.40, 'Solid'],
  [0.20, 'Rookie'], [0, 'Suspicious'],
]

// Non-throwing tier lookup: a NaN war (impossible after attest's sanitization,
// but this module is exported and reusable) must degrade to the floor tier,
// never crash the request.
const tierFor = (war: number): string =>
  (WAR_TIERS.find(([min]) => war >= min) ?? WAR_TIERS[WAR_TIERS.length - 1])[1]

// ── Math helpers (verbatim from jitter-box.js) ───────────────────────────────

const mean = (a: number[]) => {
  if (a.length === 0) return 0
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i]
  return sum / a.length
}
const std = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  let variance = 0
  for (let i = 0; i < a.length; i++) variance += (a[i] - m) * (a[i] - m)
  return Math.sqrt(variance / a.length)
}
const round2 = (n: number) => Math.round(n * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const rampScore = (raw: number, floor: number, ceiling: number) =>
  floor < ceiling ? clamp01((raw - floor) / (ceiling - floor))
                  : clamp01((floor - raw) / (floor - ceiling))

// Paste weighting (JITTER-PLAN.md) — MUST stay byte-identical to the same
// helper in sdk/src/core/jitter-box.js or parity breaks.
const pasteWeight = (n: number) => (n < 50 ? 0.1 : n <= 300 ? 0.3 : 1.0)
function weightedAlienChars(pasteSizes: number[] | undefined, alienChars: number): number {
  const alien = alienChars || 0
  if (pasteSizes && pasteSizes.length) {
    let sum = 0, accounted = 0
    for (let i = 0; i < pasteSizes.length; i++) {
      const n = pasteSizes[i]
      sum += pasteWeight(n) * n
      accounted += n
    }
    return round2(sum + Math.max(0, alien - accounted))
  }
  return alien
}

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
  const logs: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (values[i] > 0) logs.push(Math.log(values[i]))
  }
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

function pearsonR(a: number[], b: number[]): number {
  if (a.length < 3 || a.length !== b.length) return 0
  const ma = mean(a), mb = mean(b)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] - ma
    const bi = b[i] - mb
    num += ai * bi
    da += ai * ai
    db += bi * bi
  }
  const denom = Math.sqrt(da * db)
  return denom > 0 ? num / denom : 0
}

// ── Cross-signal correlation (verbatim port of jitter-box scoreCrossSignal) ──
// Sub-test 3 (fatigue slope) is intentionally NOT ported: the widget never
// sends fatigueWindows, and accepting it server-side would hand the attacker a
// free, fully attacker-controlled +1 sub-test. Sanitized captures never carry it.

function scoreCrossSignal(capture: Capture): number {
  let score = 0
  let tests = 0
  const ft = capture.flightTimes || []
  const dt = capture.dwellTimes || []

  // Sub-test 1: Pause-warmup — after gap, next keystrokes slower?
  if (ft.length >= 20) {
    const avgFlight = mean(ft)
    let pauseWarmups = 0
    let pauseHits = 0
    for (let i = 1; i < ft.length - 3; i++) {
      if (ft[i] > PAUSE_THRESHOLD_MS * 0.5) {
        pauseHits++
        const nextAvg = (ft[i + 1] + ft[i + 2] + ft[i + 3]) / 3
        if (nextAvg > avgFlight) pauseWarmups++
      }
    }
    score += pauseHits >= 1 ? (pauseWarmups / pauseHits > 0.5 ? 1 : 0) : 0.5
    tests++
  }

  // Sub-test 2: Flow coupling — inter-key speed correlates with dwell
  if (ft.length >= 20 && dt.length >= 20) {
    const flightW: number[] = []
    const dwellW: number[] = []
    const minLen = Math.min(ft.length, dt.length)
    const ws = 10
    for (let k = 0; k + ws <= minLen; k += ws) {
      flightW.push(mean(ft.slice(k, k + ws)))
      dwellW.push(mean(dt.slice(k, k + ws)))
    }
    if (flightW.length >= 3) {
      const r = pearsonR(flightW, dwellW)
      score += r > 0.3 ? 1 : r > 0 ? 0.5 : 0
    } else {
      score += 0.5
    }
    tests++
  }

  return tests > 0 ? round2(score / tests) : 0.5
}

// ── WAR scorer (exact mirror of jitter-box scoreRaw → scoreProfile) ──────────

export function scoreRaw(capture: Capture): Scored {
  const ft = capture.flightTimes || []
  if (ft.length < 10) {
    return { war: 0, raw_war: 0, classification: 'insufficient_data', flags: ['too_short'] }
  }
  const dt = capture.dwellTimes || []
  const humanChars = capture.humanChars || 0
  const alienChars = capture.alienChars || 0
  const totalChars = humanChars + alienChars
  const backspaces = capture.backspaceCount || 0
  const pauses = capture.pauseCount || 0

  // Profile exactly as jitter-box scoreRaw builds it — NO extra rounding.
  const profile = {
    mean_inter_key: mean(ft),
    std_inter_key: std(ft),
    mean_dwell: dt.length > 0 ? mean(dt) : null,
    std_dwell: dt.length > 0 ? std(dt) : null,
    edit_ratio: totalChars > 0 ? backspaces / totalChars : 0,
    pause_freq: ft.length > 0 ? pauses / (ft.length / 10) : 0,
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
    return { war: 0, raw_war: 0, classification: 'bot', tier: 'Suspicious', flags, components: {} }
  }

  // LAYER 3: weighted signals. Channels needing rich capture (bigram maps,
  // per-key dwell maps) are neutral 0.5 — identical to the client, which builds
  // the scoreRaw profile with empty maps.
  const c: Record<string, number> = {
    bigram_rhythm: 0.5,
    per_key: 0.5,
    dwell_uniformity: 0.5,
  }
  c.cross_signal = scoreCrossSignal(capture)

  const ks = ksStatistic(ft)
  c.distribution_shape = rampScore(ks, ...RAMPS.ks_shape)
  if (ks > 0.25) flags.push('non_lognormal')

  c.inter_key_var = rampScore(profile.std_inter_key, ...RAMPS.inter_key_var)
  if (profile.std_dwell != null) {
    c.dwell_std = rampScore(profile.std_dwell, ...RAMPS.dwell_std)
    if (profile.std_dwell < 8) flags.push('dwell_std_hard')
  } else {
    c.dwell_std = 0.5
  }
  c.mean_dwell = profile.mean_dwell != null
    ? rampScore(profile.mean_dwell, ...RAMPS.mean_dwell) : 0.5

  const editSub = rampScore(profile.edit_ratio, ...RAMPS.edit_ratio)
  const pauseSub = rampScore(profile.pause_freq, ...RAMPS.pause_freq)
  c.editing = (editSub + pauseSub) / 2
  if (profile.edit_ratio < 0.03 && profile.pause_freq < 0.4) flags.push('no_editing_behavior')

  // Purity — paste folded in by per-paste SIZE (transparent, not punished).
  // Small pastes barely move purity; multiple pastes are flagged not penalized;
  // only a near-total paste flood (>90% weighted) trips the one hard guard.
  const weightedAlien = weightedAlienChars(capture.pasteSizes, alienChars)
  const effTotal = humanChars + weightedAlien
  const pasteRatio = effTotal > 0 ? weightedAlien / effTotal : 0
  if (totalChars >= MIN_CHARS_FOR_SCORE) {
    c.purity = rampScore(effTotal > 0 ? humanChars / effTotal : 1, ...RAMPS.purity)
    const pasteCount = capture.pasteSizes?.length ?? 0
    if (pasteCount > 1) flags.push('high_paste_volume') // diagnostic only — no penalty
    if (pasteRatio > 0.90) flags.push('paste_flood')    // hard guard vs paste laundering
  } else {
    c.purity = 0.5
  }

  let raw_war = 0
  for (const [k, w] of Object.entries(WEIGHTS)) raw_war += w * (c[k] != null ? c[k] : 0.5)
  raw_war = round2(raw_war)

  // LAYER 2: soft penalties
  let penalty = 0
  for (const f of flags) if (PENALTIES[f]) penalty += PENALTIES[f]
  const war = round2(Math.max(0, raw_war - penalty))

  const tier = tierFor(war)
  return { war, raw_war, classification: classify(war), tier, flags, components: c }
}

function classify(war: number): string {
  if (war >= 0.80) return 'verified'
  if (war >= 0.50) return 'suspicious'
  return 'bot'
}

// ── Time confidence cap ──────────────────────────────────────────────────────
// The economic thesis, applied SERVER-SIDE with the true first_seen from the DB.
//
// The cap schedule is the STEP FUNCTION specified in JITTER-PLAN.md ("Time
// confidence cap — THE ECONOMIC THESIS IN CODE"), NOT the log curve the legacy
// biometrics.js shipped. The log curve under-caps by up to 0.23 WAR in the
// middle of the range (e.g. day 30: curve 0.58 vs spec 0.80), which would
// wrongly hold mature-enough authors at 'suspicious'. The bands are the
// canonical IP claim, so they are the source of truth here.
//
//   < 1 day      → 0.35      30–90 days  → 0.80
//   1–7 days     → 0.50      90–180 days → 0.92
//   7–30 days    → 0.65      180+ days   → 1.00
//
// Semantics (deliberate):
//   * The cap limits CONFIDENCE, not the verdict on the typing itself.
//     The stored war is min(penalized war, cap).
//   * A capture whose typing scores 'verified' but whose passport is too young
//     to clear the threshold is classified 'building' (gray "Building Trust"
//     badge) — NOT 'bot'. Without this, every day-0 human gets a red badge.
//   * 'bot' / 'suspicious' typing verdicts pass through unchanged: the cap can
//     only withhold trust, never improve a verdict or demote a human to bot.
//   * The cap is applied to the PENALIZED war (s.war), never raw_war — paste
//     and uniformity penalties must survive the cap.
//
// nowMs is injectable for tests.
export function timeCapForDays(days: number): number {
  if (days < 1) return 0.35
  if (days < 7) return 0.50
  if (days < 30) return 0.65
  if (days < 90) return 0.80
  if (days < 180) return 0.92
  return 1.00
}

export function applyTimeCap(s: Scored, firstSeenMs: number | null, nowMs: number = Date.now()): Scored {
  // No passport on record → treat as day 0 (the worst case for the author, the
  // safest for the system). first_seen is set on the very first attestation.
  const days = firstSeenMs == null ? 0 : Math.max(0, (nowMs - firstSeenMs) / 86400000)
  const cap = timeCapForDays(days)

  const war = round2(Math.min(s.war, cap))
  const tier = tierFor(war)

  let classification: string
  if (s.classification === 'bot' || s.classification === 'insufficient_data') {
    classification = s.classification
  } else if (classify(s.war) === 'verified') {
    classification = war >= 0.80 ? 'verified' : 'building'
  } else {
    classification = classify(s.war)
  }

  return { ...s, war, timeCap: cap, tier, classification }
}
