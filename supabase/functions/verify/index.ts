import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// JITTEr verification page — HARDENED for score secrecy
//
// What changed: the raw WAR score, avg_war, and best_war are NO LONGER rendered.
// The public page shows the human-readable classification (Verified / Unverified
// / Suspicious), the passport maturity, and provenance metadata — but never the
// number an attacker would use as an oracle to tune an evasion against the
// detector. This is architecture rule #1 ("scores never leave the system")
// applied to the one surface that was leaking it.
//
// Data source: the `public_badge` VIEW (see 20260611000001_harden_rls.sql), not
// the base tables. The RLS migration revokes anon access to attestations/profiles
// and exposes ONLY this view to anon — which by construction omits war_score /
// avg_war / best_war / flags. Score secrecy is enforced at the database boundary,
// so even this page literally cannot read the number. The classification column
// is sufficient to derive the public label.
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url)
  const badge_hash = url.searchParams.get('hash')
  if (!badge_hash) {
    return new Response(renderPage(null, null, 'No badge hash provided'),
      { headers: { 'Content-Type': 'text/html' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  )

  // Read from the public_badge view only. It exposes the verdict + provenance
  // (classification, site_key, created_at) and the passport stats (level,
  // total_badges, total_keystrokes, first_seen, sites_used) — and nothing else.
  const { data: row, error } = await supabase
    .from('public_badge')
    .select('classification, site_key, created_at, level, total_badges, total_keystrokes, first_seen, sites_used')
    .eq('badge_hash', badge_hash).single()

  if (error || !row) {
    return new Response(renderPage(null, null, 'Badge not found'),
      { headers: { 'Content-Type': 'text/html' } })
  }

  // The view is flat (attestation LEFT JOIN profile). Split it back into the two
  // logical halves renderPage expects. There is no war_score field to pass.
  const data = {
    classification: row.classification,
    site_key: row.site_key,
    created_at: row.created_at,
    war_score: undefined as number | undefined,
  }
  const profile = row.level != null || row.total_badges != null ? {
    level: row.level,
    total_badges: row.total_badges,
    total_keystrokes: row.total_keystrokes,
    first_seen: row.first_seen,
    sites_used: row.sites_used,
  } : null

  return new Response(renderPage(data, profile, null),
    { headers: { 'Content-Type': 'text/html' } })
})

function labelFor(classification: string, war: number | undefined): { label: string; color: string } {
  // Derive the public label from classification first; fall back to score bands.
  // In the hardened path `war` is undefined (the view never exposes it), so the
  // classification branches are what actually decide the label.
  if (classification === 'verified' || (war != null && war >= 0.80)) return { label: 'Verified Human', color: '#00BA7C' }
  if (classification === 'bot' || (war != null && war < 0.50)) return { label: 'Suspicious', color: '#EF4444' }
  return { label: 'Unverified', color: '#F59E0B' }
}

function renderPage(data: any, profile: any, errorMsg: string | null): string {
  if (errorMsg) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JITTEr</title></head>
<body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;color:#111">
<h2>JITTEr Badge Verification</h2><p style="color:#EF4444">${errorMsg}</p></body></html>`
  }

  const { label, color } = labelFor(data.classification, data.war_score)
  const date = new Date(data.created_at).toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric' })
  const memberSince = profile?.first_seen
    ? new Date(profile.first_seen).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : null
  const fmtK = (k: number) => k >= 1e6 ? (k/1e6).toFixed(1)+'M' : k >= 1e3 ? (k/1e3).toFixed(1)+'K' : String(k)

  // Passport maturity is shown as a qualitative band, never the raw cap number.
  const profileSection = profile ? `
  <div style="margin-top:32px;padding-top:24px;border-top:2px solid #eee">
    <h3 style="font-size:14px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Author Passport</h3>
    <div class="stat"><span class="label">Standing</span><strong>${profile.level}</strong></div>
    <div class="stat"><span class="label">Verified Contributions</span><strong>${profile.total_badges}</strong></div>
    <div class="stat"><span class="label">Total Keystrokes</span><strong>${fmtK(profile.total_keystrokes || 0)}</strong></div>
    <div class="stat"><span class="label">Platforms</span><strong>${(profile.sites_used || []).join(', ').toUpperCase() || '—'}</strong></div>
    ${memberSince ? `<div class="stat"><span class="label">Member Since</span><strong>${memberSince}</strong></div>` : ''}
  </div>` : ''

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JITTEr — Badge Verification</title>
<style>
  body{font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;color:#111}
  .badge{display:inline-flex;align-items:center;gap:8px;background:${color}18;color:${color};border:1px solid ${color};border-radius:100px;padding:6px 16px;font-weight:600;font-size:14px}
  .dot{width:8px;height:8px;border-radius:50%;background:${color}}
  .stat{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee;font-size:14px}
  .label{color:#666}.footer{margin-top:32px;font-size:12px;color:#999}
</style></head><body>
  <h2>JITTEr Badge Verification</h2>
  <p><span class="badge"><span class="dot"></span>${label}</span></p>
  <div style="margin-top:24px">
    <div class="stat"><span class="label">Status</span><strong>${label}</strong></div>
    <div class="stat"><span class="label">Platform</span><strong>${data.site_key.toUpperCase()}</strong></div>
    <div class="stat"><span class="label">Attested</span><strong>${date}</strong></div>
  </div>
  ${profileSection}
  <p class="footer">
    JITTEr verifies that content was composed by a human at the keyboard.<br>
    Raw keystrokes never leave the device. Detection scores are never published.<br><br>
    <a href="https://github.com/Denisgingras75/JITTEr" style="color:#666">JITTEr Protocol</a>
  </p>
</body></html>`
}
