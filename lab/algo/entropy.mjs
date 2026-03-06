/**
 * Shannon entropy for timing arrays.
 * Human typing is log-normal → higher entropy.
 * Bot timing is constant/uniform → lower entropy.
 */

// Bin timing values into buckets and compute Shannon entropy
export function shannonEntropy(timings, binWidth = 20) {
  if (!timings || timings.length < 5) return 0

  // Build histogram
  const bins = {}
  for (let i = 0; i < timings.length; i++) {
    const bin = Math.floor(timings[i] / binWidth) * binWidth
    bins[bin] = (bins[bin] || 0) + 1
  }

  const total = timings.length
  const keys = Object.keys(bins)
  let entropy = 0

  for (let i = 0; i < keys.length; i++) {
    const p = bins[keys[i]] / total
    if (p > 0) {
      entropy -= p * Math.log2(p)
    }
  }

  return Math.round(entropy * 1000) / 1000
}

// Coefficient of variation: std / mean — 0 for bots, 0.2-0.5 for humans
export function coefficientOfVariation(timings) {
  if (!timings || timings.length < 2) return 0
  const mean = timings.reduce((a, b) => a + b, 0) / timings.length
  if (mean === 0) return 0
  const variance = timings.reduce((sum, t) => sum + (t - mean) ** 2, 0) / timings.length
  return Math.round((Math.sqrt(variance) / mean) * 1000) / 1000
}

// Per-key dwell uniformity: low std across keys = bot
export function dwellUniformity(perKeyDwell) {
  if (!perKeyDwell) return 1
  const values = Object.values(perKeyDwell)
  if (values.length < 3) return 1
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 1
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  const cv = Math.sqrt(variance) / mean
  // Low cv = uniform = bot-like. Return 0-1 where 0 = very uniform
  return Math.round(Math.min(cv / 0.3, 1) * 1000) / 1000
}
