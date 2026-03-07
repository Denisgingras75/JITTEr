-- JITTEr attestations table
-- Stores WAR scores and badge hashes only. No raw biometrics. No content.

CREATE TABLE IF NOT EXISTS attestations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  site_key TEXT NOT NULL,
  war_score DECIMAL(4,2) NOT NULL CHECK (war_score >= 0 AND war_score <= 1),
  classification TEXT NOT NULL CHECK (classification IN ('verified', 'suspicious', 'bot', 'building', 'insufficient_data')),
  badge_hash TEXT NOT NULL,
  flags TEXT[] DEFAULT '{}',
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attestations_badge_hash ON attestations(badge_hash);
CREATE INDEX idx_attestations_user_site ON attestations(user_id, site_key);

ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public badge verification" ON attestations
  FOR SELECT USING (true);

CREATE POLICY "Service role write" ON attestations
  FOR INSERT WITH CHECK (true);
