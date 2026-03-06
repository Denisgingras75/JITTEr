/**
 * 4 Playwright typing strategies for capture pipeline.
 * Each simulates a different level of bot sophistication.
 */

// Mode 1: Playwright default — type() with zero delay
export async function typeDefault(textarea, text) {
  await textarea.type(text)
}

// Mode 2: Fixed 100ms delay between keypresses
export async function typeFixed100ms(page, textarea, text) {
  await textarea.focus()
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.press(text[i])
    await page.waitForTimeout(100)
  }
}

// Mode 3: Uniform random delay (50-250ms) — wrong distribution
export async function typeUniformRandom(page, textarea, text) {
  await textarea.focus()
  for (let i = 0; i < text.length; i++) {
    await page.keyboard.press(text[i])
    const delay = 50 + Math.random() * 200
    await page.waitForTimeout(delay)
  }
}

// Seeded PRNG for reproducible human mimic
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

// Common bigrams for speedup simulation
const FAST_BIGRAMS = new Set(['th', 'he', 'in', 'er', 'an', 're', 'on', 'at', 'en', 'nd'])

// Mode 4: Human mimic — gaussian delays, per-key dwell variation, bigram speedups, pauses
export async function typeHumanMimic(page, textarea, text, seed = 42) {
  const rng = mulberry32(seed)
  await textarea.focus()

  const baseMean = 180 + gaussianRandom(rng) * 30  // 150-210ms base
  const baseStd = 40 + gaussianRandom(rng) * 10    // 30-50ms std
  const baseDwell = 80 + gaussianRandom(rng) * 20   // 60-100ms dwell

  let prevChar = ''

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    // Calculate inter-key delay
    let delay = baseMean + gaussianRandom(rng) * baseStd

    // Bigram speedup
    if (prevChar && FAST_BIGRAMS.has(prevChar.toLowerCase() + char.toLowerCase())) {
      delay *= 0.7 // 30% faster for common bigrams
    }

    // Occasional pause (3% chance)
    if (rng() < 0.03) {
      delay += 800 + rng() * 1200 // 800-2000ms cognitive pause
    }

    delay = Math.max(30, delay)

    // Use keyboard.down/up for realistic dwell time
    const dwellTime = Math.max(20, baseDwell + gaussianRandom(rng) * 15)

    // Wait inter-key delay (minus dwell, since dwell is part of the cycle)
    const preDelay = Math.max(10, delay - dwellTime)
    if (i > 0) {
      await page.waitForTimeout(preDelay)
    }

    await page.keyboard.down(char)
    await page.waitForTimeout(dwellTime)
    await page.keyboard.up(char)

    prevChar = char
  }
}

// Review texts for typing tests (short enough for reasonable test time)
export const REVIEW_TEXTS = [
  'The lobster roll here is absolutely incredible fresh and buttery',
  'Best clam chowder on the island hands down worth every penny',
  'Fish tacos were decent but nothing special for the price point',
  'Amazing oysters fresh from the harbor you can taste the ocean',
  'Great burger spot the fries are perfectly crispy every single time',
  'Disappointing pizza honestly the crust was soggy and underseasoned',
  'The blueberry pie is to die for perfectly flaky golden crust',
  'Overpriced for what you get but the view makes up for it',
  'Scallops were seared beautifully tender inside crispy golden outside',
  'The breakfast sandwich here is the best hangover cure on island',
]

export const TYPING_MODES = [
  { name: 'default', fn: 'typeDefault', description: 'Playwright type() — zero delay' },
  { name: 'fixed_100ms', fn: 'typeFixed100ms', description: 'Fixed 100ms delay per key' },
  { name: 'uniform_random', fn: 'typeUniformRandom', description: 'Uniform random 50-250ms' },
  { name: 'human_mimic', fn: 'typeHumanMimic', description: 'Gaussian + dwell + bigrams + pauses' },
]
