import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const url = new URL(req.url)
  const badge_hash = url.searchParams.get('hash')

  if (!badge_hash) {
    return new Response(renderPage(null, 'No badge hash provided'), {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  )

  const { data, error } = await supabase
    .from('attestations')
    .select('war_score, classification, flags, site_key, created_at')
    .eq('badge_hash', badge_hash)
    .single()

  if (error || !data) {
    return new Response(renderPage(null, 'Badge not found'), {
      headers: { 'Content-Type': 'text/html' }
    })
  }

  return new Response(renderPage(data, null), {
    headers: { 'Content-Type': 'text/html' }
  })
})

function renderPage(data: any, errorMsg: string | null): string {
  if (errorMsg) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JITTEr</title></head>
<body style="font-family:-apple-system,sans-serif;max-width:480px;margin:60px auto;padding:20px;color:#111">
<h2>JITTEr Badge Verification</h2>
<p style="color:#EF4444">${errorMsg}</p>
</body></html>`
  }

  const color = data.war_score >= 0.80 ? '#00BA7C'
    : data.war_score >= 0.50 ? '#F59E0B'
    : '#EF4444'

  const label = data.war_score >= 0.80 ? 'Verified Human'
    : data.war_score >= 0.50 ? 'Unverified'
    : 'Suspicious'

  const date = new Date(data.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  })

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
    <div class="stat"><span class="label">WAR Score</span><strong>${data.war_score}</strong></div>
    <div class="stat"><span class="label">Classification</span><strong>${data.classification}</strong></div>
    <div class="stat"><span class="label">Platform</span><strong>${data.site_key.toUpperCase()}</strong></div>
    <div class="stat"><span class="label">Attested</span><strong>${date}</strong></div>
    ${data.flags.length > 0 ? `<div class="stat"><span class="label">Flags</span><strong>${data.flags.join(', ')}</strong></div>` : ''}
  </div>
  <p class="footer">
    WAR (Writing Authenticity Rating) measures keystroke dynamics.<br>
    Raw keystrokes never leave the device. Only aggregated timing stats are attested.<br><br>
    <a href="https://github.com/Denisgingras75/JITTEr" style="color:#666">JITTEr Protocol</a>
  </p>
</body>
</html>`
}
