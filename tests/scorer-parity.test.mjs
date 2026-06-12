// tests/scorer-parity.test.mjs
// Differential test: the server-side scorer (supabase/functions/_shared/scorer.ts)
// must produce IDENTICAL war / classification / flags / components to the client
// engine the widget bundle ships (sdk/src/core/jitter-box.js → scoreRaw).
// Also covers the time-cap semantics (building state, penalized-war capping).
//
// Run: node tests/scorer-parity.test.mjs   (Node ≥22.18 strips TS types natively)

import { _testExports } from '../sdk/src/core/jitter-box.js'
import { scoreRaw as serverScoreRaw, applyTimeCap, timeCapForDays } from '../supabase/functions/_shared/scorer.ts'

const clientScoreRaw = _testExports.scoreRaw

let pass = 0, fail = 0
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name) }
  else { fail++; console.log('  FAIL', name, detail !== undefined ? '→ ' + detail : '') }
}

// Deterministic RNG (mulberry32) so failures reproduce exactly.
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(r, mu, sigma) {
  const u = Math.max(r(), 1e-9), v = r()
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ── Capture generators ───────────────────────────────────────────────────────

function humanCapture(r, n = 60) {
  const ft = [], dt = []
  for (let i = 0; i < n; i++) {
    ft.push(Math.max(25, Math.exp(gauss(r, 5.1, 0.45))))      // log-normal IKI
    dt.push(Math.max(30, gauss(r, 85, 22)))
  }
  if (n > 12) ft[12] = 2400                                     // thinking pauses
  if (n > 37) ft[37] = 1800
  return { flightTimes: ft, dwellTimes: dt, humanChars: n, alienChars: 0, backspaceCount: 4, pauseCount: 2 }
}

function fastBotCapture() {
  const ft = [], dt = []
  for (let i = 0; i < 40; i++) { ft.push(30 + (i % 3)); dt.push(12) }
  return { flightTimes: ft, dwellTimes: dt, humanChars: 40, alienChars: 0, backspaceCount: 0, pauseCount: 0 }
}

function uniformBotCapture() {
  const ft = [], dt = []
  for (let i = 0; i < 40; i++) { ft.push(100); dt.push(50) }
  return { flightTimes: ft, dwellTimes: dt, humanChars: 40, alienChars: 0, backspaceCount: 0, pauseCount: 0 }
}

function gaussianMimicCapture(r) {
  const ft = [], dt = []
  for (let i = 0; i < 50; i++) { ft.push(Math.max(60, gauss(r, 150, 40))); dt.push(Math.max(28, gauss(r, 80, 15))) }
  return { flightTimes: ft, dwellTimes: dt, humanChars: 50, alienChars: 0, backspaceCount: 1, pauseCount: 0 }
}

function pasteFloodCapture(r) {
  const c = humanCapture(r, 15)
  c.humanChars = 15
  c.alienChars = 900
  return c
}

function pasteHeavyCapture(r) {
  const c = humanCapture(r, 40)
  c.humanChars = 40
  c.alienChars = 60
  return c
}

function noDwellCapture(r) {
  const c = humanCapture(r, 30)
  c.dwellTimes = []
  return c
}

function randomFuzzCapture(r) {
  const n = 10 + Math.floor(r() * 90)
  const ft = [], dt = []
  for (let i = 0; i < n; i++) ft.push(20 + r() * 2200)
  const dn = Math.floor(r() * n)
  for (let i = 0; i < dn; i++) dt.push(5 + r() * 480)
  const human = Math.floor(r() * 200)
  return {
    flightTimes: ft, dwellTimes: dt,
    humanChars: human, alienChars: Math.floor(r() * 250),
    backspaceCount: Math.floor(r() * 15), pauseCount: Math.floor(r() * 8),
  }
}

// ── Parity assertion ─────────────────────────────────────────────────────────

function assertParity(name, capture) {
  const client = clientScoreRaw(structuredClone(capture))
  const server = serverScoreRaw(structuredClone(capture))

  if (client.classification === 'insufficient_data') {
    check(name + ' (insufficient_data)', server.classification === 'insufficient_data')
    return
  }

  const sameWar = client.war === server.war
  const sameClass = client.classification === server.classification
  const sameFlags = JSON.stringify(client.flags) === JSON.stringify(server.flags)
  let sameComponents = true
  for (const k of Object.keys(client.components || {})) {
    if (client.components[k] !== server.components[k]) {
      // client uses 'distribution_shape'; both must use the same key now
      sameComponents = false
      break
    }
  }
  check(name, sameWar && sameClass && sameFlags && sameComponents,
    `client={war:${client.war},class:${client.classification},flags:[${client.flags}]} ` +
    `server={war:${server.war},class:${server.classification},flags:[${server.flags}]}`)
}

console.log('\nClient/server scorer parity:')
{
  const r1 = rng(1337)
  assertParity('human-like capture scores identically', humanCapture(r1))
  assertParity('fast bot (iki floor) scores identically', fastBotCapture())
  assertParity('uniform bot (variance floor) scores identically', uniformBotCapture())
  assertParity('gaussian mimic scores identically', gaussianMimicCapture(rng(7)))
  assertParity('paste flood scores identically', pasteFloodCapture(rng(21)))
  assertParity('paste heavy scores identically', pasteHeavyCapture(rng(22)))
  assertParity('dwell-less capture scores identically', noDwellCapture(rng(23)))
  assertParity('9 flights → insufficient on both', { flightTimes: [100,120,140,160,180,200,220,240,260] })
}

console.log('\nFuzz parity (300 random captures):')
{
  const r = rng(0xC0FFEE)
  let mismatches = 0
  let firstDetail = ''
  for (let i = 0; i < 300; i++) {
    const cap = randomFuzzCapture(r)
    const client = clientScoreRaw(structuredClone(cap))
    const server = serverScoreRaw(structuredClone(cap))
    const ok = client.classification === 'insufficient_data'
      ? server.classification === 'insufficient_data'
      : client.war === server.war &&
        client.classification === server.classification &&
        JSON.stringify(client.flags) === JSON.stringify(server.flags)
    if (!ok) {
      mismatches++
      if (!firstDetail) firstDetail = `iter ${i}: client {war:${client.war},class:${client.classification}} server {war:${server.war},class:${server.classification}}`
    }
  }
  check('0 mismatches across 300 fuzzed captures', mismatches === 0, `${mismatches} mismatches; first: ${firstDetail}`)
}

// ── Paste weighting (JITTER-PLAN.md: transparent, not punished) ──────────────

console.log('\nPaste weighting (size-weighted purity, flag not penalty):')
{
  // Base typist with enough editing that adding paste doesn't collapse the
  // separate edit_ratio signal — isolates the purity/paste path under test.
  function base() {
    const c = humanCapture(rng(55), 60)
    c.backspaceCount = 14
    return c
  }
  function withPaste(alienChars, pasteSizes) {
    const c = base()
    c.alienChars = alienChars
    if (pasteSizes) c.pasteSizes = pasteSizes
    return serverScoreRaw(c)
  }
  const clean = serverScoreRaw(base())

  // 40-char URL paste (<50 → 0.1x weight): effectively invisible to WAR.
  const url = withPaste(40, [40])
  check('small paste (URL) barely dents WAR',
    Math.abs(url.war - clean.war) <= 0.02 && !url.flags.includes('paste_flood'),
    `clean=${clean.war} url=${url.war}`)

  // Multiple pastes → high_paste_volume flag, but NOT a penalty.
  const multi = withPaste(80, [40, 40])
  check('multiple pastes are flagged, not penalized',
    multi.flags.includes('high_paste_volume') && !multi.flags.includes('paste_flood'),
    `flags=[${multi.flags}]`)

  // 5000-char AI essay pasted + a little typing → flood guard fires → bot.
  const flood = (() => { const c = base(); c.humanChars = 30; c.alienChars = 5000; c.pasteSizes = [5000]; return serverScoreRaw(c) })()
  check('paste flood (AI laundering) is caught as bot',
    flood.flags.includes('paste_flood') && flood.classification === 'bot',
    `war=${flood.war} class=${flood.classification} flags=[${flood.flags}]`)

  // ANTI-REGRESSION: a 60% mid-paste must NOT be crushed the way the old
  // war×(1−ratio) multiplier + paste_heavy did (that path could only yield
  // ≤0.40 for a 60% paste). The hybrid scores it on typing merit.
  const moderate = withPaste(90, [90]) // 90 alien vs 60 human
  check('moderate paste no longer hard-penalized (old model gave ≤0.40)',
    moderate.war > 0.45 && !moderate.flags.includes('paste_flood'),
    `moderate=${moderate.war}`)

  // SIZE WEIGHTING WORKS: 400 alien chars as ONE big paste (1.0x) drives purity
  // far lower than the SAME 400 chars split into ten 40-char pastes (0.1x each).
  const oneBig = (() => { const c = base(); c.alienChars = 400; c.pasteSizes = [400]; return serverScoreRaw(c) })()
  const tenSmall = (() => { const c = base(); c.alienChars = 400; c.pasteSizes = Array(10).fill(40); return serverScoreRaw(c) })()
  check('per-paste size weighting: 1×400 hurts purity more than 10×40',
    tenSmall.war > oneBig.war && tenSmall.components.purity > oneBig.components.purity,
    `oneBig=${oneBig.war}(pur ${oneBig.components.purity}) tenSmall=${tenSmall.war}(pur ${tenSmall.components.purity})`)
}

// Fuzz parity WITH paste sizes — exercises the size-weighting path on both engines.
console.log('\nFuzz parity with paste sizes (200 captures):')
{
  const r = rng(0x9A57E5)
  let mismatches = 0, firstDetail = ''
  for (let i = 0; i < 200; i++) {
    const cap = randomFuzzCapture(r)
    const np = Math.floor(r() * 4)
    cap.pasteSizes = []
    let acc = 0
    for (let k = 0; k < np; k++) { const s = Math.floor(r() * 1200); cap.pasteSizes.push(s); acc += s }
    cap.alienChars = acc // keep alienChars consistent with the sizes
    const client = clientScoreRaw(structuredClone(cap))
    const server = serverScoreRaw(structuredClone(cap))
    const ok = client.classification === 'insufficient_data'
      ? server.classification === 'insufficient_data'
      : client.war === server.war &&
        client.classification === server.classification &&
        JSON.stringify(client.flags) === JSON.stringify(server.flags)
    if (!ok) { mismatches++; if (!firstDetail) firstDetail = `iter ${i}: client {war:${client.war},flags:[${client.flags}]} server {war:${server.war},flags:[${server.flags}]}` }
  }
  check('0 mismatches across 200 paste-sized captures', mismatches === 0, `${mismatches}; first: ${firstDetail}`)
}

// ── Time cap semantics ───────────────────────────────────────────────────────

console.log('\nTime cap semantics:')
{
  const DAY = 86400000
  const now = Date.UTC(2026, 5, 11)

  // Day 0, verified-quality typing → capped to 0.35, 'building' (NOT 'bot').
  const dayZero = applyTimeCap(
    { war: 0.85, raw_war: 0.85, classification: 'verified', flags: [] }, null, now)
  check('day-0 verified typing → building, never bot',
    dayZero.classification === 'building' && dayZero.war === 0.35 && dayZero.timeCap === 0.35,
    JSON.stringify(dayZero))

  // Day 0, suspicious typing → verdict on the typing survives the cap.
  const daySus = applyTimeCap(
    { war: 0.60, raw_war: 0.70, classification: 'suspicious', flags: [] }, null, now)
  check('day-0 suspicious typing stays suspicious',
    daySus.classification === 'suspicious' && daySus.war === 0.35, JSON.stringify(daySus))

  // Bot verdict passes through untouched.
  const dayBot = applyTimeCap(
    { war: 0, raw_war: 0, classification: 'bot', flags: ['iki_floor'] }, null, now)
  check('bot stays bot through the cap', dayBot.classification === 'bot' && dayBot.war === 0)

  // 180-day passport → cap 1.0, verified stays verified at its own score.
  const mature = applyTimeCap(
    { war: 0.85, raw_war: 0.88, classification: 'verified', flags: [] }, now - 180 * DAY, now)
  check('180-day passport → uncapped, verified',
    mature.classification === 'verified' && mature.war === 0.85 && mature.timeCap === 1.0,
    JSON.stringify(mature))

  // REGRESSION: the cap must apply to the PENALIZED war, never raw_war.
  // A paste-flooded capture (raw 0.62, penalized 0.10) on a mature passport
  // must store 0.10 — the original patch stored min(raw_war, cap) = 0.62.
  const pasted = applyTimeCap(
    { war: 0.10, raw_war: 0.62, classification: 'bot', flags: ['paste_flood'] }, now - 180 * DAY, now)
  check('penalties survive the cap (war, not raw_war)', pasted.war === 0.10, `war=${pasted.war}`)

  // REGRESSION: suspicious typing must not be PROMOTED by a high cap.
  // Original patch: min(raw_war 0.85, cap 1.0) = 0.85 → 'verified'. Wrong.
  const promo = applyTimeCap(
    { war: 0.55, raw_war: 0.85, classification: 'suspicious', flags: ['non_lognormal'] }, now - 180 * DAY, now)
  check('cap never promotes suspicious to verified',
    promo.classification === 'suspicious' && promo.war === 0.55, JSON.stringify(promo))

  // Cap curve sanity: monotonic, 0.35 at day 0, 1.0 by day 180.
  let monotonic = true
  let prev = 0
  for (let d = 0; d <= 200; d += 5) {
    const r = applyTimeCap({ war: 1, raw_war: 1, classification: 'verified', flags: [] }, now - d * DAY, now)
    if (r.timeCap < prev) monotonic = false
    prev = r.timeCap
  }
  check('cap curve is monotonic and saturates at 1.0', monotonic && prev === 1.0)
}

// ── Documented band conformance (JITTER-PLAN.md) ─────────────────────────────
// These pin applyTimeCap to the spec's step function. If anyone reverts to the
// legacy log curve, every interior band fails loudly.
console.log('\nTime cap band conformance (JITTER-PLAN.md):')
{
  const DAY = 86400000
  const now = Date.UTC(2026, 5, 11)
  const BANDS = [
    [0,   0.35], [0.5, 0.35],
    [1,   0.50], [3,   0.50], [6.9, 0.50],
    [7,   0.65], [14,  0.65], [29,  0.65],
    [30,  0.80], [60,  0.80], [89,  0.80],
    [90,  0.92], [135, 0.92], [179, 0.92],
    [180, 1.00], [365, 1.00],
  ]
  let allMatch = true
  let detail = ''
  for (const [days, expected] of BANDS) {
    const got = timeCapForDays(days)
    if (got !== expected) { allMatch = false; if (!detail) detail = `day ${days}: expected ${expected}, got ${got}` }
  }
  check('cap matches every documented band exactly', allMatch, detail)

  // The bug this guards against: at day 30 the legacy log curve gave 0.58,
  // wrongly capping a verified-quality author below the 0.80 'verified' line.
  const day30 = applyTimeCap({ war: 0.85, raw_war: 0.85, classification: 'verified', flags: [] }, now - 30 * DAY, now)
  check('30-day verified author reaches verified (not held at suspicious)',
    day30.war === 0.80 && day30.classification === 'verified', JSON.stringify(day30))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
