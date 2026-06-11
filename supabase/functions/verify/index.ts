import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────────────────
// JITTEr verification page — HARDENED for score secrecy
//
// What changed: the raw WAR score, avg_war, and best_war are NO LONGER rendered.
// The public page shows the human-readable classification (Verified / Building
// Trust / Unverified / Suspicious), the passport maturity, and provenance
// metadata — but never the number an attacker would use as an oracle to tune an
// evasion against the detector. This is architecture rule #1 ("scores never
// leave the system") applied to the one surface that was leaking it.
//
// Data access: this function reads the `public_badge` VIEW (defined in
// 20260611000001_harden_rls.sql) with the SERVICE ROLE key. The anon key has
// ZERO grants — not on the base tables, not on the view — so the PostgREST
// surface is completely closed: no score oracle, no bulk enumeration of the
// badge ledger. The only public read path is this page, one badge hash at a
// time, rendering only what the view exposes (which by construction omits
// war_score / avg_war / best_war / flags / user_id).
// ─────────────────────────────────────────────────────────────────────────────

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

// All DB-sourced strings pass through this before hitting the HTML. The values
// are server-written today; escape anyway so a future write path can't turn
// this page into stored XSS.
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!
))

serve(async (req) => {
  const url = new URL(req.url)
  const badge_hash = url.searchParams.get('hash')
  if (!badge_hash || badge_hash.length > 256) {
    return new Response(renderPage(null, null, 'No badge hash provided'), { headers: HTML_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // public_badge is the single source of public-safe columns. No score fields
  // exist in it, so this page literally cannot leak them.
  const { data: row, error } = await supabase
    .from('public_badge')
    .select('classification, site_key, created_at, level, total_badges, total_keystrokes, first_seen, sites_used')
    .eq('badge_hash', badge_hash).single()

  if (error || !row) {
    return new Response(renderPage(null, null, 'Badge not found'), { headers: HTML_HEADERS })
  }

  // The view is flat (attestation LEFT JOIN profile) — split it back into the
  // two logical halves the renderer expects.
  const data = {
    classification: row.classification,
    site_key: row.site_key,
    created_at: row.created_at,
  }
  const profile = row.level != null || row.total_badges != null ? {
    level: row.level,
    total_badges: row.total_badges,
    total_keystrokes: row.total_keystrokes,
    first_seen: row.first_seen,
    sites_used: row.sites_used,
  } : null

  return new Response(renderPage(data, profile, null), { headers: HTML_HEADERS })
})

// Public label derives from classification ONLY — there is no score to fall
// back on, by design. Unknown values render as the cautious middle state.
function labelFor(classification: string): { label: string; color: string } {
  if (classification === 'verified') return { label: 'Verified Human', color: '#00BA7C' }
  if (classification === 'building') return { label: 'Building Trust', color: '#6B7280' }
  if (classification === 'bot') return { label: 'Suspicious', color: '#EF4444' }
  return { label: 'Unverified', color: '#F59E0B' }
}

function renderPage(data: any, profile: any, errorMsg: string | null): string {
  if (errorMsg) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JITTEr</title></head>
<body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;color:#111">
<h2>JITTEr Badge Verification</h2><p style="color:#EF4444">${esc(errorMsg)}</p></body></html>`
  }

  const { label, color } = labelFor(data.classification)
  const date = new Date(data.created_at).toLocaleDateString('en-US',
    { year: 'numeric', month: 'long', day: 'numeric' })
  const memberSince = profile?.first_seen
    ? new Date(profile.first_seen).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : null
  const fmtK = (k: number) => k >= 1e6 ? (k/1e6).toFixed(1)+'M' : k >= 1e3 ? (k/1e3).toFixed(1)+'K' : String(k)

  // Passport maturity is shown as a qualitative band, never the raw cap number.
  const profileSection = profile ? `
  <div style="margin-top:32px;padding-top:24px;border-top:2px solid #eee">
    <h3 style="font-size:14px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">Author Passport</h3>
    <div class="stat"><span class="label">Standing</span><strong>${esc(profile.level)}</strong></div>
    <div class="stat"><span class="label">Verified Contributions</span><strong>${esc(profile.total_badges)}</strong></div>
    <div class="stat"><span class="label">Total Keystrokes</span><strong>${esc(fmtK(profile.total_keystrokes || 0))}</strong></div>
    <div class="stat"><span class="label">Platforms</span><strong>${esc((profile.sites_used || []).join(', ').toUpperCase() || '—')}</strong></div>
    ${memberSince ? `<div class="stat"><span class="label">Member Since</span><strong>${esc(memberSince)}</strong></div>` : ''}
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
    <div class="stat"><span class="label">Platform</span><strong>${esc(String(data.site_key).toUpperCase())}</strong></div>
    <div class="stat"><span class="label">Attested</span><strong>${esc(date)}</strong></div>
  </div>
  ${profileSection}
  <p class="footer">
    JITTEr verifies that content was composed by a human at the keyboard.<br>
    Raw keystrokes never leave the device. Detection scores are never published.<br><br>
    <a href="https://github.com/Denisgingras75/JITTEr" style="color:#666">JITTEr Protocol</a>
  </p>
</body></html>`
}
