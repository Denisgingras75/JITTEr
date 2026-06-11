// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE: the site's signing proxy (runs on WGH's backend, holds the secret)
// Express handler for POST /api/jitter-attest
//
// This is the ONLY place the site secret lives. The browser never sees it.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto')

const JITTER_ATTEST_URL = process.env.JITTER_ATTEST_URL // .../functions/v1/attest
const SITE_KEY = 'wgh'
const SITE_SECRET = process.env.JITTER_SITE_SECRET       // shared with JITTEr

module.exports = async function jitterAttest(req, res) {
  // req.user is set by YOUR auth — the browser cannot spoof user_id this way.
  const userId = req.user?.id
  if (!userId) return res.status(401).json({ error: 'not_authenticated' })

  const body = JSON.stringify({
    user_id: userId,
    capture: req.body.capture,   // raw timing arrays from the widget
    meta: req.body.meta,
  })

  const signature = crypto.createHmac('sha256', SITE_SECRET).update(body).digest('hex')

  const r = await fetch(JITTER_ATTEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-jitter-site': SITE_KEY,
      'x-jitter-signature': signature,
      'origin': 'https://wgh.app',
    },
    body,
  })
  const data = await r.json()
  // Forward classification + hash to the browser. No score is present.
  return res.status(r.status).json(data)
}
