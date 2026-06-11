-- ─────────────────────────────────────────────────────────────────────────────
-- JITTEr RLS hardening
--
-- BEFORE: both tables had `FOR INSERT/ALL WITH CHECK (true)` and public SELECT.
-- Anyone with the anon key could write attestations and read every column,
-- including war_score. That made the entire provenance claim forgeable, and the
-- score readable — a perfect oracle for tuning detector evasion.
--
-- AFTER:
--   * NO anon/public writes. All writes go through the attest Edge Function,
--     which uses the service role key (service role bypasses RLS by design).
--   * NO anon/public reads either — not on the base tables, and not on the
--     public_badge view. The anon key has ZERO grants on JITTEr data, so the
--     PostgREST surface is completely closed: no score oracle, and no bulk
--     enumeration of the badge ledger / passport stats.
--   * The ONLY public read path is the verify Edge Function, which uses the
--     service role key to read the public_badge view one badge hash at a time.
--     The view is the SQL definition of "public-safe": it omits war_score,
--     avg_war, best_war, flags, and user_id by construction, so the page that
--     renders it cannot leak them even by accident.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop the permissive policies ------------------------------------------------
DROP POLICY IF EXISTS "Public badge verification" ON attestations;
DROP POLICY IF EXISTS "Service role write"        ON attestations;
DROP POLICY IF EXISTS "Public profile read"       ON profiles;
DROP POLICY IF EXISTS "Service role write"        ON profiles;

-- 2. Revoke direct table access from anon/authenticated/public ------------------
REVOKE ALL ON attestations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON profiles     FROM PUBLIC, anon, authenticated;

-- RLS stays ENABLED. With no permissive policy for anon, the only role that can
-- touch these tables is the service role (used exclusively by the Edge Functions),
-- which bypasses RLS. No client policy = no client access. That is the goal.
ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;

-- 3. public_badge VIEW — the SQL boundary of "public-safe" ----------------------
-- No war_score, no avg_war, no best_war, no flags, no user_id. Score secrecy is
-- enforced at the database boundary, not just in the render layer.
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

-- security_invoker = off: the view runs with its definer's rights so the verify
-- function (service role) can read through it without per-table grants leaking
-- outward.
ALTER VIEW public_badge SET (security_invoker = off);

-- IMPORTANT: Supabase's default privileges auto-GRANT on newly created objects
-- in `public` to anon/authenticated. Revoke explicitly or the view ships
-- world-readable despite everything above — which would re-open bulk
-- enumeration of the entire badge ledger via PostgREST.
REVOKE ALL ON public_badge FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public_badge TO service_role;

-- 4. Defense-in-depth: a CHECK that classification stays in the known set -------
-- ('building' is the day-0 "Building Trust" state the time cap produces for
-- verified-quality typing on a young passport.)
ALTER TABLE attestations
  DROP CONSTRAINT IF EXISTS attestations_classification_check;
ALTER TABLE attestations
  ADD CONSTRAINT attestations_classification_check
  CHECK (classification IN ('verified','suspicious','bot','building','insufficient_data'));

-- 5. Index to make the per-(site,user) rate-limit query fast --------------------
CREATE INDEX IF NOT EXISTS idx_attestations_rl
  ON attestations (site_key, user_id, created_at DESC);
