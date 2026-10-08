import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { keyIdFromDeviceId } from '../_shared/trust.ts'

// GET /verify?hash=<badge_hash>            -> HTML page
// GET /verify?hash=<badge_hash>&format=json -> the attestation record
//
// Public (verify_jwt = false): the page is opened by plain links. Data is
// read with the service role inside the function; the tables allow the anon
// role nothing.

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

// Everything interpolated into the page comes from the database, and the
// database is written from client-supplied values: escape it all.
const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

serve(async (req) => {
  const url = new URL(req.url)
  const badge_hash = url.searchParams.get('hash')
  const wantJson = url.searchParams.get('format') === 'json'

  // badge_hash is a hex SHA-256; anything else can't match a row.
  if (!badge_hash || !/^[0-9a-f]{64}$/i.test(badge_hash)) {
    const msg = badge_hash ? 'Badge not found' : 'No badge hash provided'
    return wantJson ? jsonResponse(404, { error: msg }) : htmlResponse(renderPage(null, null, msg))
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const { data, error } = await supabase
    .from('attestations')
    .select('war_score, war_client, classification, flags, site_key, created_at, user_id, device_id, time_cap, age_days, server_signature, server_key_id, text_hash, url')
    .eq('badge_hash', badge_hash.toLowerCase())
    .single()

  if (error || !data) {
    return wantJson ? jsonResponse(404, { error: 'Badge not found' }) : htmlResponse(renderPage(null, null, 'Badge not found'))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('total_badges, avg_war, best_war, level, first_seen, sites_used, total_keystrokes')
    .eq('user_id', data.user_id)
    .single()

  if (wantJson) {
    const deviceId = data.device_id ?? null
    return jsonResponse(200, {
      attestation: {
        badge_hash: badge_hash.toLowerCase(),
        device_id: deviceId,
        key_id: deviceId ? keyIdFromDeviceId(deviceId) : null,
        site_key: data.site_key,
        war: Number(data.war_score),
        war_client: data.war_client == null ? null : Number(data.war_client),
        time_cap: data.time_cap == null ? null : Number(data.time_cap),
        age_days: data.age_days ?? null,
        classification: data.classification,
        flags: Array.isArray(data.flags) ? data.flags : [],
        text_hash: data.text_hash ?? null,
        url: data.url ?? null,
        attested_at: data.created_at,
      },
      server_signature: data.server_signature ?? null,
      server_key_id: data.server_key_id ?? null,
      profile: profile ? {
        badges: profile.total_badges, avg_war: Number(profile.avg_war), best_war: Number(profile.best_war),
        level: profile.level, first_seen: profile.first_seen, sites_used: profile.sites_used || [],
        total_keystrokes: Number(profile.total_keystrokes) || 0,
      } : null,
    })
  }

  return htmlResponse(renderPage(data, profile, null))
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { 'Content-Type': 'text/html' } })
}

function renderPage(data: any, profile: any, errorMsg: string | null): string {
  if (errorMsg) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JITTEr</title></head>
<body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;color:#111">
<h2>JITTEr Badge Verification</h2>
<p style="color:#EF4444">${esc(errorMsg)}</p>
</body></html>`
  }

  const war = Number(data.war_score)
  const flags: string[] = Array.isArray(data.flags) ? data.flags : []
  const cls = String(data.classification)

  const color = cls === 'verified' ? '#00BA7C'
    : cls === 'building' || cls === 'suspicious' ? '#F59E0B'
    : '#EF4444'

  const label = cls === 'verified' ? 'Verified Human'
    : cls === 'building' ? 'Building Trust'
    : cls === 'suspicious' ? 'Unverified'
    : cls === 'bot' ? 'Suspicious'
    : 'Insufficient Data'

  const date = new Date(data.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

  const formatKeys = (k: number) => k >= 1000000 ? (k/1000000).toFixed(1) + 'M' : k >= 1000 ? (k/1000).toFixed(1) + 'K' : String(k)

  const memberSince = profile?.first_seen
    ? new Date(profile.first_seen).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : null

  const ageLine = data.age_days != null
    ? `<div class="stat"><span class="label">Device age when attested</span><strong>${esc(data.age_days)} day${data.age_days === 1 ? '' : 's'} (cap ${esc(Math.round(Number(data.time_cap) * 100))}%)</strong></div>`
    : ''
  const serverLine = data.server_signature
    ? `<div class="stat"><span class="label">Server signature</span><strong>present</strong></div>`
    : ''

  const profileSection = profile ? `
  <div style="margin-top:32px;padding-top:24px;border-top:2px solid #eee">
    <h3 style="font-size:14px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Author Profile</h3>
    <div class="stat"><span class="label">Level</span><strong>${esc(profile.level)}</strong></div>
    <div class="stat"><span class="label">Badges Minted</span><strong>${esc(profile.total_badges)}</strong></div>
    <div class="stat"><span class="label">Avg WAR</span><strong>${esc(profile.avg_war)}</strong></div>
    <div class="stat"><span class="label">Best WAR</span><strong>${esc(profile.best_war)}</strong></div>
    <div class="stat"><span class="label">Total Keystrokes</span><strong>${esc(formatKeys(Number(profile.total_keystrokes) || 0))}</strong></div>
    <div class="stat"><span class="label">Platforms</span><strong>${esc((profile.sites_used || []).join(', ').toUpperCase() || '—')}</strong></div>
    ${memberSince ? `<div class="stat"><span class="label">Member Since</span><strong>${esc(memberSince)}</strong></div>` : ''}
  </div>` : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>JITTEr — Badge Verification</title>
  <style>
    body{font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;color:#111}
    .badge{display:inline-flex;align-items:center;gap:8px;background:${color}18;color:${color};border:1px solid ${color};border-radius:100px;padding:6px 16px;font-weight:600;font-size:14px}
    .dot{width:8px;height:8px;border-radius:50%;background:${color}}
    .stat{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:14px}
    .label{color:#666}
    .footer{margin-top:32px;font-size:12px;color:#999}
  </style>
</head>
<body>
  <h2>JITTEr Badge Verification</h2>
  <p><span class="badge"><span class="dot"></span>${label}</span></p>
  <div style="margin-top:24px">
    <div class="stat"><span class="label">WAR Score</span><strong>${esc(war)}${data.war_client != null && Number(data.war_client) !== war ? ' (typing score ' + esc(data.war_client) + ', capped by device age)' : ''}</strong></div>
    <div class="stat"><span class="label">Classification</span><strong>${esc(cls)}</strong></div>
    <div class="stat"><span class="label">Platform</span><strong>${esc(String(data.site_key).toUpperCase())}</strong></div>
    <div class="stat"><span class="label">Attested</span><strong>${esc(date)}</strong></div>
    ${ageLine}
    ${serverLine}
    ${flags.length > 0 ? `<div class="stat"><span class="label">Flags</span><strong>${esc(flags.join(', '))}</strong></div>` : ''}
  </div>
  ${profileSection}
  <p class="footer">
    WAR (Writing Authenticity Rating) measures keystroke dynamics.<br>
    Raw keystrokes never leave the device. Only aggregated timing stats are attested.<br><br>
    <a href="https://github.com/Denisgingras75/JITTEr" style="color:#666">JITTEr Protocol</a>
  </p>
</body>
</html>`
}
