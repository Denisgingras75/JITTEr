-- Per-address rate limits and erasure.
--
-- ip_windows counts requests per client address per hour, for attest and
-- erase together. The address itself is never written: the edge function
-- hashes it with a server-side salt (JITTER_IP_SALT) and the table holds
-- only that hash and a count. Windows older than a day are swept out by
-- prune_ip_windows(), which bump_ip_window runs on roughly one call in a
-- hundred; it can also be run by hand.
--
-- erase_device removes everything the server holds about one device in one
-- transaction. The edge function calls it only after the device has proved
-- possession of its key by signing the request.
--
-- attestations.server_key_id records which server key countersigned each
-- row, so records still verify after the server key is rotated.

CREATE TABLE IF NOT EXISTS ip_windows (
  bucket       TEXT NOT NULL,         -- hex SHA-256 of address || ':' || salt; never the address
  window_start TIMESTAMPTZ NOT NULL,  -- the hour the count belongs to
  count        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS idx_ip_windows_start ON ip_windows(window_start);

ALTER TABLE ip_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ip_windows FROM anon, authenticated;

ALTER TABLE attestations ADD COLUMN IF NOT EXISTS server_key_id TEXT;

-- Drops windows older than a day. Returns how many rows went.
CREATE OR REPLACE FUNCTION prune_ip_windows()
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM ip_windows WHERE window_start < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

-- Counts one request from a bucket in the current hour and says whether it
-- is within p_limit. One upsert, so concurrent calls cannot lose an
-- increment. A refused call still counts.
CREATE OR REPLACE FUNCTION bump_ip_window(p_bucket TEXT, p_limit INT)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO ip_windows (bucket, window_start, count)
  VALUES (p_bucket, date_trunc('hour', NOW()), 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET count = ip_windows.count + 1
  RETURNING ip_windows.count INTO v_count;

  IF random() < 0.01 THEN
    PERFORM prune_ip_windows();
  END IF;

  RETURN v_count <= p_limit;
END $$;

-- Everything the server holds about one device: attestations first (they
-- reference devices), then the profile, then the device row. Returns the
-- rows removed from each table; all zeros when the device was unknown.
CREATE OR REPLACE FUNCTION erase_device(p_device_id TEXT)
RETURNS TABLE(n_attestations INT, n_profiles INT, n_devices INT)
LANGUAGE plpgsql AS $$
DECLARE
  v_att INT; v_prof INT; v_dev INT;
BEGIN
  DELETE FROM attestations a WHERE a.device_id = p_device_id;
  GET DIAGNOSTICS v_att = ROW_COUNT;
  DELETE FROM profiles p WHERE p.user_id = p_device_id;
  GET DIAGNOSTICS v_prof = ROW_COUNT;
  DELETE FROM devices d WHERE d.device_id = p_device_id;
  GET DIAGNOSTICS v_dev = ROW_COUNT;
  RETURN QUERY SELECT v_att, v_prof, v_dev;
END $$;

-- Only the service role (the edge functions) may call these.
REVOKE ALL ON FUNCTION prune_ip_windows() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION bump_ip_window(TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION erase_device(TEXT) FROM PUBLIC, anon, authenticated;
