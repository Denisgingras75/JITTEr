import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  canonicalJson, checkIpLimit, corsHeaders, deviceIdFor, ERASE_WINDOW_MS, fail, isFreshTimestamp,
  isP256PublicJwk, json, MAX_ERASE_BODY_BYTES, verifyEcdsa,
} from '../_shared/trust.ts'

// POST /erase
//
// Body: { publicKeyJwk, requested_at, signature }
//   publicKeyJwk  the device's public key, as it appears in its badges
//   requested_at  ISO timestamp, within ten minutes of server time
//   signature     base64 ECDSA P-256 over
//                 canonicalJson({ action: 'erase', publicKeyJwk, requested_at })
//
// Possession of the device key is the credential. Everything the server
// holds about that device goes, in one transaction: its attestations, its
// profile, the device row. Badges already issued still verify offline by
// their signatures; /verify no longer finds them. Erasing twice is fine:
// the second call reports zeros. The timestamp bounds how long a captured
// request could be replayed, and replaying an erase changes nothing.

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, 'method_not_allowed')

  let text: string
  try { text = await req.text() } catch { return fail(400, 'bad_request') }
  if (text.length > MAX_ERASE_BODY_BYTES) return fail(413, 'payload_too_large')

  let body: any
  try { body = JSON.parse(text) } catch { return fail(400, 'bad_json') }

  const { publicKeyJwk, requested_at, signature } = body ?? {}
  if (!isP256PublicJwk(publicKeyJwk)) return fail(400, 'bad_public_key')
  if (typeof requested_at !== 'string' || typeof signature !== 'string') return fail(400, 'missing_fields', 'requested_at and signature are required')
  if (!isFreshTimestamp(requested_at)) return fail(400, 'stale_request', `requested_at must be an ISO timestamp within ${ERASE_WINDOW_MS / 60000} minutes of server time`)

  // The device proves it holds the key by signing exactly this object.
  const signed = canonicalJson({ action: 'erase', publicKeyJwk, requested_at })
  if (!(await verifyEcdsa(publicKeyJwk, signed, signature))) return fail(401, 'bad_signature')

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const limited = await checkIpLimit(supabase, req)
  if (limited) return limited

  const deviceId = await deviceIdFor(publicKeyJwk)
  const { data, error } = await supabase.rpc('erase_device', { p_device_id: deviceId })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row) return fail(500, 'erase_failed')

  return json(200, {
    device_id: deviceId,
    deleted: { attestations: row.n_attestations, profiles: row.n_profiles, devices: row.n_devices },
  })
})
