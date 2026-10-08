import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ageInDays, allowedSiteKeys, canonicalJson, checkIpLimit, classify, corsHeaders, deviceIdFor, fail,
  isP256PublicJwk, json, keyIdFromDeviceId, MAX_ATTESTS_PER_HOUR, MAX_BODY_BYTES, MIN_KEYS_FOR_ATTESTATION,
  sha256Hex, signEcdsa, timeCapForAge, verifyEcdsa, WAR_MISMATCH_TOLERANCE,
} from '../_shared/trust.ts'
import { JitterWAR } from '../_shared/engine.gen.mjs'

// POST /attest
//
// Body: { site_key, badge, signature, timing }
//   site_key  which integration is calling; must be on the allowlist
//             (JITTER_SITE_KEYS, default extension, writer, wgh). The badge
//             carries the same value, signed, so a badge minted for one site
//             cannot be attested under another.
//   badge     the payload the client signed: its device public key
//             (publicKeyJwk), the certified text (text_hash, required), where
//             it was minted (url), the client's own score (war / war_uncapped,
//             advisory) and timing_hash = sha256(canonicalJson(timing)).
//   signature base64 ECDSA P-256 over canonicalJson(badge), by the device key
//   timing    the capture the score is computed from: timing arrays and
//             counts, never characters (JitterWAR.timingFromSession). The
//             server scores it with the same engine the clients run, stores
//             ITS score and only keeps the client's as a cross-check. The
//             timing itself is not stored.
//
// The signature is the caller's credential: no login, no API key. The server
// registers the device on first sight, applies the time cap from ITS record
// of the device's age, rate-limits per device and per address, stores the
// attestation and countersigns it with the server key (if one is configured).

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, 'method_not_allowed')

  let text: string
  try { text = await req.text() } catch { return fail(400, 'bad_request') }
  if (text.length > MAX_BODY_BYTES) return fail(413, 'payload_too_large')

  let body: any
  try { body = JSON.parse(text) } catch { return fail(400, 'bad_json') }

  const { site_key, badge, signature, timing } = body ?? {}
  if (typeof site_key !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(site_key)) return fail(400, 'bad_site_key')
  if (!allowedSiteKeys().includes(site_key)) return fail(400, 'unknown_site_key')
  if (!badge || typeof badge !== 'object' || typeof signature !== 'string') return fail(400, 'missing_fields', 'badge and signature are required')
  if (!timing || typeof timing !== 'object') return fail(400, 'missing_timing', 'timing is required: the server scores it')
  if (!isP256PublicJwk(badge.publicKeyJwk)) return fail(400, 'bad_public_key')
  if ('signature' in badge) return fail(400, 'bad_badge', 'badge must not contain its own signature')
  if (badge.site_key !== site_key) return fail(400, 'site_key_mismatch', 'badge.site_key must equal site_key (it is part of what the device signs)')
  if (typeof badge.text_hash !== 'string' || !/^[0-9a-f]{64}$/.test(badge.text_hash)) return fail(400, 'bad_text_hash', 'badge.text_hash (sha256 hex of the certified text) is required')
  if (typeof badge.timing_hash !== 'string' || !/^[0-9a-f]{64}$/.test(badge.timing_hash)) return fail(400, 'bad_timing_hash', 'badge.timing_hash (sha256 hex of canonicalJson(timing)) is required')
  if (badge.url != null && (typeof badge.url !== 'string' || badge.url.length > 512)) return fail(400, 'bad_url')

  // The client's own score: after its penalties, before its age cap. It is a
  // cross-check only; the server's recompute below is what counts.
  const warClient = typeof badge.war_uncapped === 'number' ? badge.war_uncapped
    : typeof badge.war === 'number' ? badge.war : null
  const keys = typeof badge.keys === 'number' ? badge.keys : 0
  if (warClient == null || !(warClient >= 0 && warClient <= 1)) return fail(400, 'bad_war', 'badge.war must be a number in [0, 1]')
  if (keys < MIN_KEYS_FOR_ATTESTATION) return fail(400, 'insufficient_data', `at least ${MIN_KEYS_FOR_ATTESTATION} keystrokes are needed`)

  // The device's own signature over the badge.
  if (!(await verifyEcdsa(badge.publicKeyJwk, canonicalJson(badge), signature))) return fail(401, 'bad_signature')

  // The timing is bound to the badge by the signed timing_hash, so a client
  // cannot sign one capture and send another.
  if (await sha256Hex(canonicalJson(timing)) !== badge.timing_hash) return fail(400, 'timing_hash_mismatch', 'timing is not what the signed badge was scored on')
  const sane = JitterWAR.sanitizeTiming(timing)
  if (!sane.ok) return fail(400, 'bad_timing', sane.reason)

  // The server's score, from the same engine every client runs.
  const scored = JitterWAR.scoreSession(sane.session)
  if (typeof scored.war !== 'number') return fail(400, 'insufficient_data', 'fewer than 10 timed keystrokes')
  const warServer: number = scored.war
  const flags: string[] = Array.isArray(scored.flags) ? scored.flags.slice(0, 20) : []
  if (Math.abs(warServer - warClient) > WAR_MISMATCH_TOLERANCE) flags.push('war_mismatch')

  const deviceId = await deviceIdFor(badge.publicKeyJwk)
  // Replay is keyed on what was signed, not on the signature bytes: an ECDSA
  // signature can be rewritten into a second valid one for the same content.
  const contentHash = await sha256Hex(canonicalJson(badge))
  const clientSigHash = await sha256Hex(signature)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Everything above cost only CPU; everything below touches the database,
  // so this is where the address's hourly budget is spent.
  const limited = await checkIpLimit(supabase, req)
  if (limited) return limited

  // Replay: the same signed badge attested twice is the same attestation,
  // reported with the key that countersigned it at the time.
  const { data: existing } = await supabase
    .from('attestations')
    .select('badge_hash, war_score, war_server, classification, time_cap, age_days, created_at, server_signature, server_key_id')
    .eq('badge_content_hash', contentHash)
    .single()
  if (existing) {
    return json(200, { badge_hash: existing.badge_hash, duplicate: true, attestation: {
      badge_hash: existing.badge_hash, device_id: deviceId, war: Number(existing.war_score),
      war_server: existing.war_server == null ? null : Number(existing.war_server),
      time_cap: Number(existing.time_cap), age_days: existing.age_days, classification: existing.classification,
      attested_at: existing.created_at, site_key,
    }, server_signature: existing.server_signature ?? null, server_key_id: existing.server_key_id ?? await serverKeyId() })
  }

  // Register / refresh the device; the server's record of its age is the only one that counts.
  const { data: dev, error: devErr } = await supabase.rpc('touch_device', {
    p_device_id: deviceId, p_public_key: badge.publicKeyJwk, p_site_key: site_key,
  })
  const device = Array.isArray(dev) ? dev[0] : dev
  if (devErr || !device) return fail(500, 'device_error')
  if (device.recent_count >= MAX_ATTESTS_PER_HOUR) return fail(429, 'rate_limited', `${MAX_ATTESTS_PER_HOUR} attestations per hour per device`)

  const ageDays = ageInDays(device.first_seen)
  const cap = timeCapForAge(ageDays)
  const war = Math.round(Math.min(warServer, cap) * 100) / 100
  if (ageDays < 1) flags.push('new_device')
  const classification = classify(war, warServer, cap, flags)
  const attestedAt = new Date().toISOString()
  const badgeHash = await sha256Hex(`${deviceId}:${contentHash}`)

  const attestation = {
    badge_hash: badgeHash,
    device_id: deviceId,
    key_id: keyIdFromDeviceId(deviceId),
    site_key,
    war,
    war_server: warServer,
    war_client: warClient,
    time_cap: cap,
    age_days: ageDays,
    classification,
    flags,
    text_hash: badge.text_hash ?? null,
    url: badge.url ?? null,
    attested_at: attestedAt,
  }
  const serverSignature = await countersign(attestation)
  const serverKey = await serverKeyId()

  const { error: insErr } = await supabase.from('attestations').insert({
    user_id: deviceId,
    site_key,
    war_score: war,
    classification,
    badge_hash: badgeHash,
    flags,
    meta: {
      keys, pastes: badge.pastes ?? null, integrity: badge.integrity ?? null,
      // the site's own reference for this user, opaque to us
      site_user: typeof badge.site_user === 'string' ? badge.site_user.slice(0, 128) : null,
    },
    device_id: deviceId,
    text_hash: badge.text_hash ?? null,
    url: badge.url ?? null,
    client_sig_hash: clientSigHash,
    badge_content_hash: contentHash,
    war_server: warServer,
    war_client: warClient,
    time_cap: cap,
    age_days: ageDays,
    server_signature: serverSignature,
    server_key_id: serverKey,
    created_at: attestedAt,
  })
  if (insErr) return fail(500, 'insert_failed')

  const { data: prof } = await supabase.rpc('record_attestation_stats', {
    p_user_id: deviceId, p_site_key: site_key, p_war: war,
    p_keys: keys, p_paste_chars: typeof badge.pastedChars === 'number' ? badge.pastedChars : 0, p_focus_ms: 0,
  })
  const profile = Array.isArray(prof) ? prof[0] : prof

  return json(200, {
    badge_hash: badgeHash,
    attestation,
    server_signature: serverSignature,
    server_key_id: serverKey,
    profile: profile ? { badges: profile.total_badges, avg_war: Number(profile.avg_war), best_war: Number(profile.best_war), level: profile.level } : null,
  })
})

// ── Server countersignature ──────────────────────────────────────────────
// JITTER_SERVER_KEY_JWK holds the server's private P-256 JWK (a Supabase
// secret; see supabase/scripts/gen-server-key.mjs). Without it, attestations
// are stored but not countersigned, and server_signature is null.

function serverKey(): { kty: string; crv: string; x: string; y: string; d: string } | null {
  const raw = Deno.env.get('JITTER_SERVER_KEY_JWK')
  if (!raw) return null
  try { const k = JSON.parse(raw); return k && k.d ? k : null } catch { return null }
}

async function countersign(attestation: Record<string, unknown>): Promise<string | null> {
  const key = serverKey()
  if (!key) return null
  return await signEcdsa(key, canonicalJson(attestation))
}

async function serverKeyId(): Promise<string | null> {
  const key = serverKey()
  if (!key) return null
  const { kty, crv, x, y } = key
  return keyIdFromDeviceId(await deviceIdFor({ kty, crv, x, y }))
}
