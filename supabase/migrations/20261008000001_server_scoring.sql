-- Server-side scoring.
--
-- /attest now recomputes the typing score from the timing payload the client
-- attests with (the same engine every client runs) and stores ITS number in
-- war_server; war_client is kept as a cross-check only. The timing payload
-- itself is never stored.
--
-- The replay guard is keyed on what the device signed (badge_content_hash),
-- not on the signature bytes (client_sig_hash): an ECDSA signature can be
-- rewritten into a second valid signature for the same content, which used
-- to slip past the old key and create a second attestation.

ALTER TABLE attestations
  ADD COLUMN IF NOT EXISTS badge_content_hash TEXT,          -- SHA-256 of canonicalJson(badge), the signed part
  ADD COLUMN IF NOT EXISTS war_server         DECIMAL(4,2);  -- the server's own typing score, before the cap

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestations_content
  ON attestations(badge_content_hash) WHERE badge_content_hash IS NOT NULL;

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_attestations_content;
-- ALTER TABLE attestations DROP COLUMN IF EXISTS badge_content_hash, DROP COLUMN IF EXISTS war_server;
