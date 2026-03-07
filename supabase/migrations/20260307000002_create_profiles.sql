-- JITTEr user profiles
-- Aggregated lifetime stats. Updated on each attestation.

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  total_keystrokes BIGINT DEFAULT 0,
  total_sessions INT DEFAULT 0,
  total_badges INT DEFAULT 0,
  total_paste_chars BIGINT DEFAULT 0,
  total_human_chars BIGINT DEFAULT 0,
  avg_war DECIMAL(4,2) DEFAULT 0,
  best_war DECIMAL(4,2) DEFAULT 0,
  level TEXT DEFAULT 'Novice',
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  sites_used TEXT[] DEFAULT '{}',
  total_focus_ms BIGINT DEFAULT 0
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profile read" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON profiles
  FOR ALL USING (true) WITH CHECK (true);
