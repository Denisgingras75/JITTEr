import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id, site_key, war_score, classification, flags, meta } = await req.json()

    if (!user_id || !site_key || war_score == null || !classification) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, site_key, war_score, classification' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (war_score < 0 || war_score > 1) {
      return new Response(
        JSON.stringify({ error: 'war_score must be between 0 and 1' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const timestamp = new Date().toISOString()
    const hashInput = `${user_id}:${site_key}:${war_score}:${timestamp}`
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput))
    const badge_hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error } = await supabase.from('attestations').insert({
      user_id,
      site_key,
      war_score,
      classification,
      badge_hash,
      flags: flags || [],
      meta: meta || {},
    })

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to record attestation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert user profile with aggregated stats
    const m = meta || {}
    const { data: existing } = await supabase
      .from('profiles')
      .select('total_badges, avg_war, best_war, sites_used, total_keystrokes, total_paste_chars, total_human_chars, total_focus_ms')
      .eq('user_id', user_id)
      .single()

    const badges = (existing?.total_badges || 0) + 1
    const prevAvg = existing?.avg_war || 0
    const newAvg = Math.round(((prevAvg * (badges - 1) + war_score) / badges) * 100) / 100
    const bestWar = Math.max(existing?.best_war || 0, war_score)
    const sites = existing?.sites_used || []
    if (!sites.includes(site_key)) sites.push(site_key)

    const level = badges >= 50 ? 'Master'
      : badges >= 20 ? 'Expert'
      : badges >= 10 ? 'Advanced'
      : badges >= 5 ? 'Intermediate'
      : badges >= 2 ? 'Beginner'
      : 'Novice'

    await supabase.from('profiles').upsert({
      user_id,
      total_badges: badges,
      avg_war: newAvg,
      best_war: bestWar,
      level,
      last_seen: timestamp,
      sites_used: sites,
      total_keystrokes: (existing?.total_keystrokes || 0) + (m.keys || 0),
      total_paste_chars: (existing?.total_paste_chars || 0) + (m.paste_chars || 0),
      total_human_chars: (existing?.total_human_chars || 0) + (m.keys || 0),
      total_focus_ms: (existing?.total_focus_ms || 0) + (m.focus_ms || 0),
      total_sessions: badges,
    }, { onConflict: 'user_id' })

    return new Response(
      JSON.stringify({ badge_hash, timestamp, classification, profile: { badges, avg_war: newAvg, best_war: bestWar, level } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
