import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { scoreRaw, applyTimeCap } from '../_shared/scorer.ts'

// ─────────────────────────────────────────────────────────────────────────────
// JITTEr attestation endpoint — HARDENED
//
// Security model (what changed and why):
//   1. The client NEVER sends a score. It sends raw timing arrays. The server
//      computes the WAR score authoritatively. A forged score is now impossible
//      because the only score that exists is the one the server derived itself.
//   2. Site keys authenticate via HMAC over the request body. A leaked public
//      site key alone cannot mint badges; the caller must hold the shared secret.
//   3. The time cap (the economic-infeasibility thesis) is applied SERVER-SIDE
//      using the profile's true first_seen date from the DB, not a client claim.
//   4. Per-(site_key,user_id) rate limiting kills bulk minting.
//   5. CORS is allow-listed per registered site, not '*'.
//   6. The score is NOT returned to the caller. Only classification + badge hash.
//      (Score secrecy: rule #1 of the architecture.)
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = (Deno.env.get('JITTER_ALLOWED_ORIGINS') ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

// Per-site shared secrets, JSON: { "wgh": "secret_xxx", "demo": "secret_yyy" }
const SITE_SECRETS: Record<string, string> =
  JSON.parse(Deno.env.get('JITTER_SITE_SECRETS') ?? '{}')

const RATE_LIMIT_PER_HOUR = parseInt(Deno.env.get('JITTER_RATE_LIMIT') ?? '20', 10)

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : 'null'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type, x-jitter-signature, x-jitter-site',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// HMAC-SHA256(body) keyed by the site secret, hex-encoded.
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  // Read the raw body ONCE — the signature must be checked over the exact bytes.
  const rawBody = await req.text()

  // ── 1. Authenticate the site ──────────────────────────────────────────────
  const siteKey = req.headers.get('x-jitter-site') ?? ''
  const clientSig = req.headers.get('x-jitter-signature') ?? ''
  const secret = SITE_SECRETS[siteKey]

  if (!siteKey || !secret) return json({ error: 'unknown_site_key' }, 401, origin)
  const expectedSig = await hmacHex(secret, rawBody)
  if (!clientSig || !timingSafeEqual(clientSig, expectedSig)) {
    return json({ error: 'bad_signature' }, 401, origin)
  }

  // ── 2. Parse + validate the payload (raw timing, NOT a score) ─────────────
  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return json({ error: 'bad_json' }, 400, origin) }

  const { user_id, capture, meta } = payload
  if (!user_id || typeof user_id !== 'string' || user_id.length > 128) {
    return json({ error: 'invalid_user_id' }, 400, origin)
  }
  if (!capture || !Array.isArray(capture.flightTimes)) {
    return json({ error: 'missing_capture' }, 400, origin)
  }
  if (capture.flightTimes.length > 5000 ||
      (capture.dwellTimes && capture.dwellTimes.length > 5000)) {
    return json({ error: 'capture_too_large' }, 413, origin)
  }
  // CRITICAL: we never read payload.war_score. The server is the only scorer.

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // ── 3. Rate limit per (site_key, user_id) ─────────────────────────────────
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { count: recentCount } = await supabase
    .from('attestations')
    .select('id', { count: 'exact', head: true })
    .eq('site_key', siteKey).eq('user_id', user_id).gte('created_at', hourAgo)

  if ((recentCount ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return json({ error: 'rate_limited', retry_after_s: 3600 }, 429, origin)
  }

  // ── 4. Score authoritatively, server-side ─────────────────────────────────
  const scored = scoreRaw(capture)
  if (scored.classification === 'insufficient_data') {
    return json({ classification: 'insufficient_data', flags: scored.flags }, 200, origin)
  }

  // ── 5. Apply the time cap using the TRUE first_seen from the DB ───────────
  const { data: existing } = await supabase
    .from('profiles')
    .select('total_badges, avg_war, best_war, sites_used, first_seen, total_keystrokes, total_paste_chars, total_human_chars, total_focus_ms')
    .eq('user_id', user_id).single()

  const firstSeenMs = existing?.first_seen ? new Date(existing.first_seen).getTime() : null
  const capped = applyTimeCap(scored, firstSeenMs)
  const war = capped.war
  const classification = capped.classification

  // ── 6. Server-signed badge hash (HMAC over the verdict + timestamp) ───────
  const timestamp = new Date().toISOString()
  const badge_hash = await hmacHex(
    secret, `${user_id}:${siteKey}:${war}:${classification}:${timestamp}`,
  )

  const { error: insErr } = await supabase.from('attestations').insert({
    user_id, site_key: siteKey, war_score: war, classification,
    badge_hash, flags: capped.flags ?? [], meta: meta ?? {},
  })
  if (insErr) return json({ error: 'attest_write_failed' }, 500, origin)

  // ── 7. Update aggregate profile ───────────────────────────────────────────
  const m = meta || {}
  const badges = (existing?.total_badges || 0) + 1
  const prevAvg = existing?.avg_war || 0
  const newAvg = Math.round(((prevAvg * (badges - 1) + war) / badges) * 100) / 100
  const bestWar = Math.max(existing?.best_war || 0, war)
  const sites = existing?.sites_used || []
  if (!sites.includes(siteKey)) sites.push(siteKey)
  const level = badges >= 50 ? 'Master' : badges >= 20 ? 'Expert'
    : badges >= 10 ? 'Advanced' : badges >= 5 ? 'Intermediate'
    : badges >= 2 ? 'Beginner' : 'Novice'

  await supabase.from('profiles').upsert({
    user_id,
    total_badges: badges, avg_war: newAvg, best_war: bestWar, level,
    last_seen: timestamp, sites_used: sites,
    total_keystrokes: (existing?.total_keystrokes || 0) + (m.keys || 0),
    total_paste_chars: (existing?.total_paste_chars || 0) + (m.paste_chars || 0),
    total_human_chars: (existing?.total_human_chars || 0) + (m.keys || 0),
    total_focus_ms: (existing?.total_focus_ms || 0) + (m.focus_ms || 0),
    total_sessions: badges,
  }, { onConflict: 'user_id' })

  // ── 8. Return classification + hash ONLY. Never the score. ────────────────
  return json({
    badge_hash, timestamp, classification,
    time_cap: capped.timeCap,
    profile: { badges, level },
  }, 200, origin)
})
