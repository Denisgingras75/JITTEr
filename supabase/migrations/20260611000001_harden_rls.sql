-- ─────────────────────────────────────────────────────────────────────────────
-- JITTEr RLS hardening
--
-- BEFORE: both tables had `FOR INSERT/ALL WITH CHECK (true)` and public SELECT.
-- Anyone with the anon key could write attestations and read every column,
-- including war_score. That made the entire provenance claim forgeable.
--
-- AFTER:
--   * NO anon/public writes. All writes go through the attest Edge Function,
--     which uses the service role key (service role bypasses RLS by design).
--   * Public SELECT is restricted to the non-sensitive columns via a VIEW.
--     The base tables are no longer directly readable by anon.
--   * war_score / avg_war / best_war are NOT exposed in the public view.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the permissive policies ------------------------------------------------
DROP POLICY IF EXISTS "Public badge verification" ON attestations;
DROP POLICY IF EXISTS "Service role write"        ON attestations;
DROP POLICY IF EXISTS "Public profile read"       ON profiles;
DROP POLICY IF EXISTS "Service role write"        ON profiles;

-- 2. Revoke direct table access from anon/public --------------------------------
REVOKE ALL ON attestations FROM anon, authenticated;
REVOKE ALL ON profiles     FROM anon, authenticated;

-- RLS stays ENABLED. With no permissive policy for anon, the only role that can
-- touch these tables is the service role (used exclusively by the Edge Function),
-- which bypasses RLS. No client policy = no client access. That is the goal.
ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;

-- 3. Public verification VIEW — the ONLY thing anon can read --------------------
-- Note: no war_score, no avg_war, no best_war, no flags. Score secrecy enforced
-- at the database boundary, not just in the render layer.
CREATE OR REPLACE VIEW public_badge AS
SELECT
  a.badge_hash,
  a.classification,
  a.site_key,
  a.created_at,
  p.level,
  p.total_badges,
  p.total_keystrokes,
  p.first_seen,
  p.sites_used
FROM attestations a
LEFT JOIN profiles p ON p.user_id = a.user_id;

-- security_invoker = off so the view runs with its definer's rights, letting
-- anon read through the view without direct table grants.
ALTER VIEW public_badge SET (security_invoker = off);
GRANT SELECT ON public_badge TO anon, authenticated;

-- 4. Defense-in-depth: a CHECK that classification stays in the known set -------
-- (already present on attestations.classification; re-assert in case of drift)
ALTER TABLE attestations
  DROP CONSTRAINT IF EXISTS attestations_classification_check;
ALTER TABLE attestations
  ADD CONSTRAINT attestations_classification_check
  CHECK (classification IN ('verified','suspicious','bot','building','insufficient_data'));

-- 5. Index to make the per-(site,user) rate-limit query fast --------------------
CREATE INDEX IF NOT EXISTS idx_attestations_rl
  ON attestations (site_key, user_id, created_at DESC);
