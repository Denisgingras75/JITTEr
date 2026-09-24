import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ageInDays, canonicalJson, classify, deviceIdFor, isP256PublicJwk, keyIdFromDeviceId,
  MAX_ATTESTS_PER_HOUR, MAX_BODY_BYTES, MIN_KEYS_FOR_ATTESTATION, sha256Hex, signEcdsa,
  timeCapForAge, verifyEcdsa,
} from '../_shared/trust.ts'

// POST /attest
//
// Body: { site_key, badge, signature }
//   badge     the payload the client signed (its own device public key is
//             badge.publicKeyJwk; the score is badge.war; the certified text
//             is badge.text_hash; where it was minted is badge.url)
//   signature base64 ECDSA P-256 over canonicalJson(badge), by the device key
//
// The signature is the caller's credential: no login, no API key. The server
// registers the device on first sight, applies the time cap from ITS record
// of the device's age, rate-limits per device, stores the attestation and
// countersigns it with the server key (if one is configured).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const fail = (status: number, error: string, detail?: string) => json(status, detail ? { error, detail } : { error })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, 'method_not_allowed')

  let text: string
  try { text = await req.text() } catch { return fail(400, 'bad_request') }
  if (text.length > MAX_BODY_BYTES) return fail(413, 'payload_too_large')

  let body: any
  try { body = JSON.parse(text) } catch { return fail(400, 'bad_json') }

  const { site_key, badge, signature } = body ?? {}
  if (typeof site_key !== 'string' || !/^[a-z0-9_-]{1,40}$/i.test(site_key)) return fail(400, 'bad_site_key')
  if (!badge || typeof badge !== 'object' || typeof signature !== 'string') return fail(400, 'missing_fields', 'badge and signature are required')
  if (!isP256PublicJwk(badge.publicKeyJwk)) return fail(400, 'bad_public_key')
  if ('signature' in badge) return fail(400, 'bad_badge', 'badge must not contain its own signature')

  // The typing score the server judges: after the client's penalties, before
  // the client's own age cap (the server applies its own from its records).
  const warClient = typeof badge.war_uncapped === 'number' ? badge.war_uncapped
    : typeof badge.war === 'number' ? badge.war : null
  const keys = typeof badge.keys === 'number' ? badge.keys : 0
  if (warClient == null || !(warClient >= 0 && warClient <= 1)) return fail(400, 'bad_war', 'badge.war must be a number in [0, 1]')
  if (keys < MIN_KEYS_FOR_ATTESTATION) return fail(400, 'insufficient_data', `at least ${MIN_KEYS_FOR_ATTESTATION} keystrokes are needed`)
  if (badge.text_hash != null && !/^[0-9a-f]{64}$/.test(badge.text_hash)) return fail(400, 'bad_text_hash')
  if (badge.url != null && (typeof badge.url !== 'string' || badge.url.length > 512)) return fail(400, 'bad_url')

  // The device's own signature over the badge.
  if (!(await verifyEcdsa(badge.publicKeyJwk, canonicalJson(badge), signature))) return fail(401, 'bad_signature')

  const deviceId = await deviceIdFor(badge.publicKeyJwk)
  const clientSigHash = await sha256Hex(signature)
  const flags: string[] = Array.isArray(badge.war_flags) ? badge.war_flags.filter((f: unknown) => typeof f === 'string').slice(0, 20) : []

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Replay: the same signed badge attested twice is the same attestation.
  const { data: existing } = await supabase
    .from('attestations')
    .select('badge_hash, war_score, classification, time_cap, age_days, created_at, server_signature')
    .eq('client_sig_hash', clientSigHash)
    .single()
  if (existing) {
    return json(200, { badge_hash: existing.badge_hash, duplicate: true, attestation: {
      badge_hash: existing.badge_hash, device_id: deviceId, war: Number(existing.war_score),
      time_cap: Number(existing.time_cap), age_days: existing.age_days, classification: existing.classification,
      attested_at: existing.created_at, site_key,
    }, server_signature: existing.server_signature ?? null, server_key_id: await serverKeyId() })
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
  const war = Math.round(Math.min(warClient, cap) * 100) / 100
  if (ageDays < 1) flags.push('new_device')
  const classification = classify(war, warClient, cap, flags)
  const attestedAt = new Date().toISOString()
  const badgeHash = await sha256Hex(`${deviceId}:${clientSigHash}`)

  const attestation = {
    badge_hash: badgeHash,
    device_id: deviceId,
    key_id: keyIdFromDeviceId(deviceId),
    site_key,
    war,
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
    war_client: warClient,
    time_cap: cap,
    age_days: ageDays,
    server_signature: serverSignature,
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
    server_key_id: await serverKeyId(),
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
