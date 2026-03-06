/**
 * Bot farm personas — 5 attack strategies for Playwright.
 * Each simulates a different tier of bot farm sophistication.
 * All use page.keyboard.down/up for realistic DOM event dispatch
 * so JitterBox captures real keydown/keyup events.
 */

// Seeded PRNG for reproducible runs
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussianRandom(rng) {
  const u1 = rng()
  const u2 = rng()
  return Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.cos(2.0 * Math.PI * u2)
}

// Log-normal sample (humans type on log-normal distributions)
function logNormalSample(rng, mu, sigma) {
  const z = gaussianRandom(rng)
  return Math.exp(mu + sigma * z)
}

const FAST_BIGRAMS = new Set([
  'th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd',
  'ti', 'es', 'or', 'te', 'of', 'ed', 'is', 'it', 'al', 'ar',
])

// Per-key dwell variation map (vowels faster, consonants slower)
const KEY_DWELL_FACTORS = {
  e: 0.85, t: 0.95, a: 0.88, o: 0.90, i: 0.83,
  n: 1.00, s: 1.05, r: 0.98, h: 1.10, l: 1.08,
  d: 1.02, c: 1.12, u: 0.87, m: 1.06, p: 1.15,
  f: 1.18, g: 1.10, w: 1.20, y: 1.05, b: 1.14,
  v: 1.22, k: 1.25, ' ': 0.60,
}

// Review texts — varied length and content
const REVIEW_TEXTS = [
  'The lobster roll here is absolutely incredible fresh and buttery',
  'Best clam chowder on the island hands down worth every penny',
  'Fish tacos were decent but nothing special for the price point',
  'Amazing oysters fresh from the harbor you can taste the ocean',
  'Great burger spot the fries are perfectly crispy every single time',
  'Disappointing pizza honestly the crust was soggy and underseasoned',
  'The blueberry pie is to die for perfectly flaky golden crust',
  'Overpriced for what you get but the view makes up for it honestly',
  'Scallops were seared beautifully tender inside crispy golden outside',
  'The breakfast sandwich here is the best hangover cure on island',
  'Went back three times this week the pasta is insanely good here',
  'Really solid brunch spot the french toast with berries was perfect',
  'Nothing fancy but the fried clams are the real deal fresh daily',
  'Service was slow but food made up for it lobster mac and cheese',
  'Best coffee on the vineyard and the pastries are homemade daily',
]

// ──────────────────────────────────────────────────────────────────────
// PERSONA 1: Spray Bot — zero delay, no dwell control
// Cost: free. Sophistication: none. Should fail every layer.
// ──────────────────────────────────────────────────────────────────────
export async function typeSpray(page, textarea, text) {
  await textarea.type(text)
}

// ──────────────────────────────────────────────────────────────────────
// PERSONA 2: Jitter Bot — gaussian noise on timing, flat dwell
// Cost: ~$5/mo. Adds randomness but no biological signals.
// ──────────────────────────────────────────────────────────────────────
export async function typeJitter(page, textarea, text, seed = 42) {
  const rng = mulberry32(seed)
  await textarea.focus()

  for (let i = 0; i < text.length; i++) {
    const delay = Math.max(30, 120 + gaussianRandom(rng) * 45)
    if (i > 0) await page.waitForTimeout(delay)
    await page.keyboard.press(text[i])
  }
}

// ──────────────────────────────────────────────────────────────────────
// PERSONA 3: Threshold Mimic — reverse-engineers WAR scorer ramps
// Knows the exact thresholds and generates timing to land in human zone.
// Most dangerous automated attacker.
// ──────────────────────────────────────────────────────────────────────
export async function typeMimic(page, textarea, text, seed = 42) {
  const rng = mulberry32(seed)
  await textarea.focus()

  // Target: land in the middle of every WAR ramp's human zone
  const targetMeanIKI = 180   // RAMPS.mean_dwell [27, 80] → target 55ms dwell
  const targetStdIKI = 35     // RAMPS.inter_key_var [9, 45] → target mid-range
  const targetDwell = 65      // RAMPS.dwell_std [8, 20] → need std ~14ms
  const dwellStd = 14

  // Log-normal params to hit targetMeanIKI with targetStdIKI
  const sigma2 = Math.log(1 + (targetStdIKI / targetMeanIKI) ** 2)
  const mu = Math.log(targetMeanIKI) - sigma2 / 2
  const sigma = Math.sqrt(sigma2)

  let prevChar = ''
  let keystrokeCount = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    keystrokeCount++

    // Inter-key delay from log-normal (passes K-S test)
    let delay = logNormalSample(rng, mu, sigma)

    // Bigram speedup (passes bigram_rhythm CV check)
    if (prevChar && FAST_BIGRAMS.has(prevChar.toLowerCase() + char.toLowerCase())) {
      delay *= 0.65
    }

    // Cognitive pauses (passes pause_freq check)
    if (rng() < 0.04) {
      delay += 1000 + rng() * 1500
    }

    delay = Math.max(25, delay)

    // Per-key dwell with variation (passes per_key CV check)
    const factor = KEY_DWELL_FACTORS[char.toLowerCase()] || 1.0
    const dwell = Math.max(15, targetDwell * factor + gaussianRandom(rng) * dwellStd)

    const preDelay = Math.max(5, delay - dwell)
    if (i > 0) await page.waitForTimeout(preDelay)

    await page.keyboard.down(char)
    await page.waitForTimeout(dwell)
    await page.keyboard.up(char)

    // Deliberate typo + backspace (passes edit_ratio check)
    if (rng() < 0.05 && i < text.length - 3) {
      await page.waitForTimeout(30 + rng() * 60)
      await page.keyboard.press('x')
      await page.waitForTimeout(150 + rng() * 200)
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(80 + rng() * 100)
    }

    prevChar = char
  }
}

// ──────────────────────────────────────────────────────────────────────
// PERSONA 4: Replay Bot — captures a human session, replays with drift
// Records once, replays with ±8-15% perturbation per session.
// ──────────────────────────────────────────────────────────────────────

// "Recorded" human session — realistic timing data
const RECORDED_SESSION = {
  // Pre-computed from a realistic human typing profile
  baseDwells: [72, 58, 81, 65, 70, 88, 55, 77, 62, 85, 68, 74, 60, 79, 66, 83, 57, 90, 63, 76],
  baseFlights: [165, 142, 195, 128, 178, 210, 135, 188, 155, 220, 145, 172, 198, 130, 185, 168, 205, 140, 175, 150],
}

export async function typeReplay(page, textarea, text, seed = 42) {
  const rng = mulberry32(seed)
  const drift = 0.08 + rng() * 0.07 // 8-15% perturbation per session
  await textarea.focus()

  for (let i = 0; i < text.length; i++) {
    const baseFlight = RECORDED_SESSION.baseFlights[i % RECORDED_SESSION.baseFlights.length]
    const baseDwell = RECORDED_SESSION.baseDwells[i % RECORDED_SESSION.baseDwells.length]

    // Perturb by drift factor
    const flightNoise = 1 + (gaussianRandom(rng) * drift)
    const dwellNoise = 1 + (gaussianRandom(rng) * drift)

    const flight = Math.max(25, baseFlight * flightNoise)
    const dwell = Math.max(15, baseDwell * dwellNoise)

    const preDelay = Math.max(5, flight - dwell)
    if (i > 0) await page.waitForTimeout(preDelay)

    await page.keyboard.down(text[i])
    await page.waitForTimeout(dwell)
    await page.keyboard.up(text[i])
  }
}

// ──────────────────────────────────────────────────────────────────────
// PERSONA 5: Farm Worker — real human speed, but no learning/fatigue
// Simulates a paid worker ($3/hr) who types consistently without the
// natural drift, fatigue, or error patterns of a genuine user.
// ──────────────────────────────────────────────────────────────────────
export async function typeFarmWorker(page, textarea, text, seed = 42) {
  const rng = mulberry32(seed)
  await textarea.focus()

  // Consistent ~45 WPM, minimal variation
  const baseMean = 160
  const baseStd = 20  // low variance — too consistent
  const baseDwell = 75
  const dwellVariation = 8

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    // Gaussian timing (not log-normal — a subtle tell)
    let delay = Math.max(40, baseMean + gaussianRandom(rng) * baseStd)

    // No bigram speedup (doesn't know English muscle memory)
    // No cognitive pauses (just churning through)
    // No fatigue (constant speed start to finish)

    const dwell = Math.max(20, baseDwell + gaussianRandom(rng) * dwellVariation)
    const preDelay = Math.max(5, delay - dwell)

    if (i > 0) await page.waitForTimeout(preDelay)

    await page.keyboard.down(char)
    await page.waitForTimeout(dwell)
    await page.keyboard.up(char)
  }
}

// ──────────────────────────────────────────────────────────────────────
// Persona registry
// ──────────────────────────────────────────────────────────────────────
export const PERSONAS = [
  {
    id: 'spray',
    name: 'Spray Bot',
    cost: 'free',
    description: 'Playwright default type() — zero delay, no dwell',
    type: typeSpray,
  },
  {
    id: 'jitter',
    name: 'Jitter Bot',
    cost: '$5/mo',
    description: 'Gaussian noise timing, flat dwell',
    type: typeJitter,
  },
  {
    id: 'mimic',
    name: 'Threshold Mimic',
    cost: '$50/mo',
    description: 'Reverse-engineers WAR ramps, log-normal timing, fake errors',
    type: typeMimic,
  },
  {
    id: 'replay',
    name: 'Replay Bot',
    cost: '$20/mo',
    description: 'Captured human session replayed with 8-15% drift',
    type: typeReplay,
  },
  {
    id: 'farmhand',
    name: 'Farm Worker',
    cost: '$3/hr',
    description: 'Real speed, no learning curve, no fatigue, no bigram muscle memory',
    type: typeFarmWorker,
  },
]

export { REVIEW_TEXTS }
