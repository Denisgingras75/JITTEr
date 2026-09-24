-- Device identity and server-side trust.
--
-- A device is a P-256 key pair the client generates once and never exports.
-- Its id is the SHA-256 of the raw public key. The server records when it
-- first saw each device, so account age (the time cap) and per-device rate
-- limits come from the server, not from a client-editable timestamp.
-- No login is involved: a device is anonymous until its owner chooses to
-- link it to something.

CREATE TABLE IF NOT EXISTS devices (
  device_id    TEXT PRIMARY KEY,                       -- hex SHA-256 of the raw public key
  public_key   JSONB NOT NULL,                         -- the public JWK
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attest_count INT NOT NULL DEFAULT 0,
  site_keys    TEXT[] NOT NULL DEFAULT '{}'
);

ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON devices FROM anon, authenticated;

ALTER TABLE attestations
  ADD COLUMN IF NOT EXISTS device_id        TEXT REFERENCES devices(device_id),
  ADD COLUMN IF NOT EXISTS text_hash        TEXT,          -- SHA-256 of the certified text
  ADD COLUMN IF NOT EXISTS url              TEXT,          -- origin + path where it was minted
  ADD COLUMN IF NOT EXISTS client_sig_hash  TEXT,          -- SHA-256 of the device signature (replay guard)
  ADD COLUMN IF NOT EXISTS war_client       DECIMAL(4,2),  -- score as the client computed it
  ADD COLUMN IF NOT EXISTS time_cap         DECIMAL(4,2),  -- cap the server applied
  ADD COLUMN IF NOT EXISTS age_days         INT,           -- device age when attested
  ADD COLUMN IF NOT EXISTS server_signature TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attestations_client_sig
  ON attestations(client_sig_hash) WHERE client_sig_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attestations_device_time
  ON attestations(device_id, created_at);

-- Registers or refreshes a device and reports what the server knows about it.
CREATE OR REPLACE FUNCTION touch_device(p_device_id TEXT, p_public_key JSONB, p_site_key TEXT)
RETURNS TABLE(first_seen TIMESTAMPTZ, attest_count INT, recent_count INT)
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO devices (device_id, public_key, site_keys)
  VALUES (p_device_id, p_public_key, ARRAY[p_site_key])
  ON CONFLICT (device_id) DO UPDATE SET
    last_seen = NOW(),
    site_keys = CASE WHEN p_site_key = ANY(devices.site_keys)
                     THEN devices.site_keys ELSE devices.site_keys || p_site_key END;

  RETURN QUERY
    SELECT d.first_seen, d.attest_count,
           (SELECT COUNT(*)::INT FROM attestations a
             WHERE a.device_id = p_device_id AND a.created_at > NOW() - INTERVAL '1 hour')
      FROM devices d WHERE d.device_id = p_device_id;
END $$;

-- Folds one attestation into the author's lifetime profile in a single
-- statement. The edge function used to read, add and upsert, which lost
-- concurrent updates.
CREATE OR REPLACE FUNCTION record_attestation_stats(
  p_user_id TEXT, p_site_key TEXT, p_war DECIMAL,
  p_keys BIGINT, p_paste_chars BIGINT, p_focus_ms BIGINT)
RETURNS TABLE(total_badges INT, avg_war DECIMAL, best_war DECIMAL, level TEXT)
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO profiles (user_id, total_badges, total_sessions, avg_war, best_war, level, last_seen,
                        sites_used, total_keystrokes, total_human_chars, total_paste_chars, total_focus_ms)
  VALUES (p_user_id, 1, 1, p_war, p_war, 'Novice', NOW(),
          ARRAY[p_site_key], p_keys, p_keys, p_paste_chars, p_focus_ms)
  ON CONFLICT (user_id) DO UPDATE SET
    total_badges      = profiles.total_badges + 1,
    total_sessions    = profiles.total_sessions + 1,
    avg_war           = ROUND((profiles.avg_war * profiles.total_badges + p_war) / (profiles.total_badges + 1), 2),
    best_war          = GREATEST(profiles.best_war, p_war),
    last_seen         = NOW(),
    sites_used        = CASE WHEN p_site_key = ANY(profiles.sites_used)
                             THEN profiles.sites_used ELSE profiles.sites_used || p_site_key END,
    total_keystrokes  = profiles.total_keystrokes + p_keys,
    total_human_chars = profiles.total_human_chars + p_keys,
    total_paste_chars = profiles.total_paste_chars + p_paste_chars,
    total_focus_ms    = profiles.total_focus_ms + p_focus_ms;

  UPDATE profiles SET level = CASE
      WHEN profiles.total_badges >= 50 THEN 'Master'
      WHEN profiles.total_badges >= 20 THEN 'Expert'
      WHEN profiles.total_badges >= 10 THEN 'Advanced'
      WHEN profiles.total_badges >= 5  THEN 'Intermediate'
      WHEN profiles.total_badges >= 2  THEN 'Beginner'
      ELSE 'Novice' END
    WHERE profiles.user_id = p_user_id;

  UPDATE devices SET attest_count = devices.attest_count + 1 WHERE devices.device_id = p_user_id;

  RETURN QUERY SELECT p.total_badges, p.avg_war, p.best_war, p.level
    FROM profiles p WHERE p.user_id = p_user_id;
END $$;

-- Only the service role (the edge functions) may call these.
REVOKE ALL ON FUNCTION touch_device(TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_attestation_stats(TEXT, TEXT, DECIMAL, BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
