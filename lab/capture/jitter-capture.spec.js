/**
 * Playwright capture pipeline for Jitter Protocol stress testing.
 * Types into the real WGH app with 4 bot strategies, intercepts jitter payload
 * at the network boundary via page.route(), analyzes signatures.
 *
 * No production code changes. No writes to DB (requests are aborted after capture).
 *
 * 20 runs per mode × 4 modes = 80 total tests.
 */

import { test, expect } from '@playwright/test'
import { shannonEntropy, coefficientOfVariation, dwellUniformity } from '../algo/entropy.mjs'
import {
  typeDefault,
  typeFixed100ms,
  typeUniformRandom,
  typeHumanMimic,
  REVIEW_TEXTS,
} from './typing-modes.mjs'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, '..', 'results')
const CAPTURE_FILE = join(RESULTS_DIR, 'capture-results.json')

// Accumulate results across all tests
const capturedResults = []

// How many runs per typing mode
const RUNS_PER_MODE = 20

// Helper: get a dish detail page URL
// We'll navigate to /browse first and click a dish, or go directly to a known dish
async function navigateToDish(page) {
  // Go to browse and find a dish with votes
  await page.goto('/')
  await page.waitForTimeout(4000) // splash screen

  // Navigate to browse
  await page.goto('/browse')
  await page.waitForTimeout(2000)

  // Find a dish link and click it
  const dishLink = page.locator('a[href^="/dish/"]').first()
  if (await dishLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await dishLink.click()
    await page.waitForTimeout(1500)
    return true
  }

  return false
}

// Helper: find and prepare the review textarea
async function prepareReviewArea(page) {
  // Look for the "Yes" button in the ReviewFlow to expand the form
  const yesButton = page.locator('button').filter({ hasText: /^Yes$/i }).first()
  if (await yesButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await yesButton.click()
    await page.waitForTimeout(500)
  }

  // Find the textarea (JitterInput wraps a <textarea>)
  const textarea = page.locator('textarea').first()
  await textarea.waitFor({ state: 'visible', timeout: 5000 })
  return textarea
}

// Helper: intercept jitter_samples POST and capture payload
function setupJitterInterceptor(page) {
  const captured = { payload: null, intercepted: false }

  // Intercept Supabase REST API call to jitter_samples table
  page.route('**/rest/v1/jitter_samples**', async (route) => {
    const request = route.request()
    if (request.method() === 'POST') {
      try {
        const postData = request.postDataJSON()
        captured.payload = postData
        captured.intercepted = true
      } catch {
        // If postDataJSON fails, try raw
        captured.payload = request.postData()
        captured.intercepted = true
      }
    }
    // Abort the request — don't write to DB
    await route.abort()
  })

  return captured
}

// Analyze a captured jitter payload
function analyzePayload(sampleData) {
  if (!sampleData) return null

  return {
    mean_inter_key: sampleData.mean_inter_key,
    std_inter_key: sampleData.std_inter_key,
    mean_dwell: sampleData.mean_dwell,
    std_dwell: sampleData.std_dwell,
    mean_dd_time: sampleData.mean_dd_time,
    std_dd_time: sampleData.std_dd_time,
    edit_ratio: sampleData.edit_ratio,
    pause_freq: sampleData.pause_freq,
    total_keystrokes: sampleData.total_keystrokes,
    sample_size: sampleData.sample_size,
    per_key_dwell_count: sampleData.per_key_dwell ? Object.keys(sampleData.per_key_dwell).length : 0,
    bigram_count: sampleData.bigram_signatures ? Object.keys(sampleData.bigram_signatures).length : 0,
    dwell_uniformity: dwellUniformity(sampleData.per_key_dwell),
  }
}

// Save accumulated results
function saveResults(newResult) {
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true })
  }

  let existing = []
  if (existsSync(CAPTURE_FILE)) {
    try {
      existing = JSON.parse(readFileSync(CAPTURE_FILE, 'utf8'))
    } catch { existing = [] }
  }

  existing.push(newResult)
  writeFileSync(CAPTURE_FILE, JSON.stringify(existing, null, 2))
}

// ========================================
// Test: Default typing (zero delay)
// ========================================
for (let run = 0; run < RUNS_PER_MODE; run++) {
  test(`capture-default-${run}`, async ({ page }) => {
    const captured = setupJitterInterceptor(page)
    const text = REVIEW_TEXTS[run % REVIEW_TEXTS.length]

    const hasDish = await navigateToDish(page)
    test.skip(!hasDish, 'No dish found to review')

    const textarea = await prepareReviewArea(page)

    // Type with default mode (zero delay)
    await typeDefault(textarea, text)
    await page.waitForTimeout(500)

    // Try to submit — the slider needs a value and we need to trigger jitter capture
    // The jitter profile is captured on submit, so we need to trigger the submit flow
    // But we just need the typing data, which is captured in the textarea interaction

    // Force a submit attempt to trigger jitter payload
    const submitButton = page.locator('button').filter({ hasText: /submit|save|done/i }).first()
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
      await page.waitForTimeout(1000)
    }

    saveResults({
      mode: 'default',
      run,
      text: text.substring(0, 30),
      intercepted: captured.intercepted,
      analysis: captured.payload ? analyzePayload(captured.payload.sample_data || captured.payload) : null,
      rawPayload: captured.payload,
    })
  })
}

// ========================================
// Test: Fixed 100ms delay
// ========================================
for (let run = 0; run < RUNS_PER_MODE; run++) {
  test(`capture-fixed100-${run}`, async ({ page }) => {
    const captured = setupJitterInterceptor(page)
    const text = REVIEW_TEXTS[run % REVIEW_TEXTS.length]

    const hasDish = await navigateToDish(page)
    test.skip(!hasDish, 'No dish found to review')

    const textarea = await prepareReviewArea(page)
    await typeFixed100ms(page, textarea, text)
    await page.waitForTimeout(500)

    const submitButton = page.locator('button').filter({ hasText: /submit|save|done/i }).first()
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
      await page.waitForTimeout(1000)
    }

    saveResults({
      mode: 'fixed_100ms',
      run,
      text: text.substring(0, 30),
      intercepted: captured.intercepted,
      analysis: captured.payload ? analyzePayload(captured.payload.sample_data || captured.payload) : null,
      rawPayload: captured.payload,
    })
  })
}

// ========================================
// Test: Uniform random delay
// ========================================
for (let run = 0; run < RUNS_PER_MODE; run++) {
  test(`capture-uniform-${run}`, async ({ page }) => {
    const captured = setupJitterInterceptor(page)
    const text = REVIEW_TEXTS[run % REVIEW_TEXTS.length]

    const hasDish = await navigateToDish(page)
    test.skip(!hasDish, 'No dish found to review')

    const textarea = await prepareReviewArea(page)
    await typeUniformRandom(page, textarea, text)
    await page.waitForTimeout(500)

    const submitButton = page.locator('button').filter({ hasText: /submit|save|done/i }).first()
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
      await page.waitForTimeout(1000)
    }

    saveResults({
      mode: 'uniform_random',
      run,
      text: text.substring(0, 30),
      intercepted: captured.intercepted,
      analysis: captured.payload ? analyzePayload(captured.payload.sample_data || captured.payload) : null,
      rawPayload: captured.payload,
    })
  })
}

// ========================================
// Test: Human mimic
// ========================================
for (let run = 0; run < RUNS_PER_MODE; run++) {
  test(`capture-mimic-${run}`, async ({ page }) => {
    const captured = setupJitterInterceptor(page)
    const text = REVIEW_TEXTS[run % REVIEW_TEXTS.length]

    const hasDish = await navigateToDish(page)
    test.skip(!hasDish, 'No dish found to review')

    const textarea = await prepareReviewArea(page)
    await typeHumanMimic(page, textarea, text, run * 1000)
    await page.waitForTimeout(500)

    const submitButton = page.locator('button').filter({ hasText: /submit|save|done/i }).first()
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click()
      await page.waitForTimeout(1000)
    }

    saveResults({
      mode: 'human_mimic',
      run,
      text: text.substring(0, 30),
      intercepted: captured.intercepted,
      analysis: captured.payload ? analyzePayload(captured.payload.sample_data || captured.payload) : null,
      rawPayload: captured.payload,
    })
  })
}
