/**
 * Bot Farm vs Jitter Protocol — 2-week adversarial test
 *
 * 5 bot personas type into the live WGH app through Playwright.
 * JitterBox captures real DOM events and scores each session.
 * Network calls are intercepted to capture WAR scores without polluting DB.
 *
 * Run daily: npx playwright test e2e/jitter-lab/botfarm/botfarm.spec.js
 * Results accumulate in e2e/jitter-lab/botfarm/results/
 *
 * After 2 weeks, run: node e2e/jitter-lab/botfarm/report.mjs
 */

import { test, expect } from '@playwright/test'
import { PERSONAS, REVIEW_TEXTS } from './personas.mjs'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')
const LOG_FILE = join(RESULTS_DIR, 'botfarm-log.jsonl')

const RUNS_PER_PERSONA = 10
const TODAY = new Date().toISOString().split('T')[0]

if (!existsSync(RESULTS_DIR)) {
  mkdirSync(RESULTS_DIR, { recursive: true })
}

// Append a result line to the JSONL log
function logResult(entry) {
  const line = JSON.stringify(entry) + '\n'
  const existing = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : ''
  writeFileSync(LOG_FILE, existing + line)
}

// Navigate to a dish detail page
async function navigateToDish(page) {
  await page.goto('/')
  await page.waitForTimeout(3000)
  await page.goto('/browse')
  await page.waitForTimeout(2000)

  const dishLink = page.locator('a[href^="/dish/"]').first()
  if (await dishLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await dishLink.click()
    await page.waitForTimeout(1500)
    return true
  }
  return false
}

// Find and prepare the review textarea
async function prepareReviewArea(page) {
  // Expand ReviewFlow
  const yesButton = page.locator('button').filter({ hasText: /^Yes$/i }).first()
  if (await yesButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await yesButton.click()
    await page.waitForTimeout(500)
  }

  const textarea = page.locator('textarea').first()
  await textarea.waitFor({ state: 'visible', timeout: 5000 })
  return textarea
}

// Intercept jitter submission and capture the WAR score payload
function setupScoreInterceptor(page) {
  const captured = { payload: null, intercepted: false }

  // Intercept both jitter_samples and votes — capture score, abort write
  page.route('**/rest/v1/jitter_samples**', async (route) => {
    if (route.request().method() === 'POST') {
      try {
        captured.payload = route.request().postDataJSON()
        captured.intercepted = true
      } catch { /* ignore */ }
    }
    await route.abort()
  })

  // Also intercept votes so we don't pollute the DB
  page.route('**/rest/v1/votes**', async (route) => {
    await route.abort()
  })

  // Intercept RPC calls too
  page.route('**/rest/v1/rpc/**', async (route) => {
    const url = route.request().url()
    if (url.includes('jitter') || url.includes('vote')) {
      await route.abort()
    } else {
      await route.continue()
    }
  })

  return captured
}

// Extract WAR score from page's JitterBox instance (backup if network intercept fails)
async function extractScoreFromPage(page) {
  try {
    return await page.evaluate(() => {
      // JitterBox attaches to window — try to call score()
      if (window.__jitterBox) return window.__jitterBox.score()
      // Fallback: find the textarea's JitterBox via DOM
      const textarea = document.querySelector('textarea')
      if (textarea && textarea.__jitterBox) return textarea.__jitterBox.score()
      return null
    })
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// Generate tests for each persona
// ──────────────────────────────────────────────────────────────────────
for (const persona of PERSONAS) {
  test.describe(`Bot Farm: ${persona.name} (${persona.cost})`, () => {
    for (let run = 0; run < RUNS_PER_PERSONA; run++) {
      test(`${persona.id}-day-${TODAY}-run-${run}`, async ({ page }) => {
        test.setTimeout(120_000) // 2 min per run (mimic bot types slow)

        const captured = setupScoreInterceptor(page)
        const text = REVIEW_TEXTS[(run + persona.id.length) % REVIEW_TEXTS.length]
        const seed = Date.now() + run * 1000 + persona.id.charCodeAt(0)

        const hasDish = await navigateToDish(page)
        test.skip(!hasDish, 'No dish found to review')

        const textarea = await prepareReviewArea(page)

        // Type using this persona's strategy
        const startTime = Date.now()
        await persona.type(page, textarea, text, seed)
        const typingDuration = Date.now() - startTime

        await page.waitForTimeout(300)

        // Try to submit to trigger JitterBox scoring
        const submitButton = page.locator('button').filter({ hasText: /submit|save|done/i }).first()
        if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await submitButton.click()
          await page.waitForTimeout(1000)
        }

        // Also try extracting score directly from the page
        const pageScore = await extractScoreFromPage(page)

        // Build result entry
        const sampleData = captured.payload?.sample_data || captured.payload
        const entry = {
          date: TODAY,
          persona: persona.id,
          run,
          text_length: text.length,
          typing_duration_ms: typingDuration,
          wpm: Math.round((text.split(' ').length / (typingDuration / 60000))),
          intercepted: captured.intercepted,
          // WAR score from intercepted network payload
          war: sampleData?.war_score ?? pageScore?.war ?? null,
          classification: sampleData?.classification ?? pageScore?.classification ?? null,
          flags: sampleData?.flags ?? pageScore?.flags ?? [],
          // Component breakdown
          components: pageScore?.components ?? null,
          // Profile stats
          mean_inter_key: sampleData?.mean_inter_key ?? null,
          std_inter_key: sampleData?.std_inter_key ?? null,
          mean_dwell: sampleData?.mean_dwell ?? null,
          std_dwell: sampleData?.std_dwell ?? null,
          edit_ratio: sampleData?.edit_ratio ?? null,
          pause_freq: sampleData?.pause_freq ?? null,
          keystrokes: sampleData?.total_keystrokes ?? null,
        }

        logResult(entry)

        // Log to console for live monitoring
        const warStr = entry.war != null ? entry.war.toFixed(2) : '??'
        const cls = entry.classification || '??'
        const flagStr = entry.flags.length > 0 ? ` [${entry.flags.join(',')}]` : ''
        console.log(
          `  ${persona.id.padEnd(10)} run=${run} WAR=${warStr} ${cls}${flagStr} ${typingDuration}ms`
        )
      })
    }
  })
}
