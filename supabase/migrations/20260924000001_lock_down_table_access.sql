-- Lock attestations and profiles down to the service role.
--
-- The original write policies were named "Service role write" but had no TO
-- clause, so they applied to every role: with the public anon key anyone could
-- insert "verified" attestations and insert, rewrite or delete any profile.
-- The service role bypasses RLS, so the edge functions need no policy at all.
--
-- The public SELECT policies let anyone list every attestation and user_id
-- with the anon key. /verify now reads with the service role (server-side
-- only), so those go too. With RLS on and no policies, anon and authenticated
-- get nothing; the REVOKEs remove the default table grants as well.

DROP POLICY IF EXISTS "Service role write" ON attestations;
DROP POLICY IF EXISTS "Public badge verification" ON attestations;
DROP POLICY IF EXISTS "Service role write" ON profiles;
DROP POLICY IF EXISTS "Public profile read" ON profiles;

REVOKE ALL ON attestations FROM anon, authenticated;
REVOKE ALL ON profiles FROM anon, authenticated;
