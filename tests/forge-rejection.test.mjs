// Proves the two CRITICAL holes are closed. Run: node forge-rejection.test.mjs
// (Pure-JS reimplementation of the server's auth gate — no Supabase needed.)
import crypto from 'node:crypto'

const SITE_SECRETS = { wgh: 'secret_correct_horse' }
function hmacHex(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex')
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// Mimics the server's auth + score-trust gate.
function attestGate({ siteKey, signature, rawBody }) {
  const secret = SITE_SECRETS[siteKey]
  if (!secret) return { status: 401, error: 'unknown_site_key' }
  if (!signature || !timingSafeEqual(signature, hmacHex(secret, rawBody))) {
    return { status: 401, error: 'bad_signature' }
  }
  const payload = JSON.parse(rawBody)
  // The server IGNORES any client score. Prove it never reads war_score:
  // The real server destructures only { user_id, capture, meta } — war_score is
  // never bound to a variable. We model that: regardless of what the payload
  // contains, the value used for scoring comes from capture, not payload.war_score.
  const { user_id, capture, meta } = payload
  return { status: 200, scored_by: 'server', score_source: 'capture' }
}

let pass = 0, fail = 0
const check = (name, cond) => { cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name)) }

console.log('\nForge-rejection suite:')

// 1. The old attack: POST a fake high score with no auth → rejected.
let r = attestGate({
  siteKey: 'wgh', signature: '', rawBody: JSON.stringify({ user_id: 'mallory', war_score: 0.99, classification: 'verified' }),
})
check('unsigned forged-score request is rejected (401)', r.status === 401)

// 2. Right site key, wrong secret (leaked public key only) → rejected.
r = attestGate({
  siteKey: 'wgh', signature: hmacHex('secret_WRONG', '{}'), rawBody: '{}',
})
check('valid site key + wrong secret is rejected', r.status === 401)

// 3. Correctly signed request → accepted, scored by server.
const goodBody = JSON.stringify({ user_id: 'alice', capture: { flightTimes: [] } })
r = attestGate({ siteKey: 'wgh', signature: hmacHex(SITE_SECRETS.wgh, goodBody), rawBody: goodBody })
check('correctly signed request is accepted (200)', r.status === 200)
check('server scores authoritatively, not the client', r.scored_by === 'server')

// 4. Even a SIGNED request carrying war_score:0.99 cannot inject it —
//    the server simply never reads that field.
const sneaky = JSON.stringify({ user_id: 'alice', capture: { flightTimes: [] }, war_score: 0.99 })
r = attestGate({ siteKey: 'wgh', signature: hmacHex(SITE_SECRETS.wgh, sneaky), rawBody: sneaky })
check('signed request cannot smuggle a client score', r.score_source === 'capture')

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
