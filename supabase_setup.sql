-- Run this in your Supabase SQL editor to set up the database

-- Subscribers table
CREATE TABLE IF NOT EXISTS subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  ghl_contact_id TEXT,                      -- GHL contact ID for sending emails
  status        TEXT NOT NULL DEFAULT 'active'  -- 'active' | 'frozen'
                CHECK (status IN ('active', 'frozen')),
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  frozen_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Newsletters table (log every issue sent)
CREATE TABLE IF NOT EXISTS newsletters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      TEXT NOT NULL,
  html_content TEXT NOT NULL,
  sent_to      INTEGER DEFAULT 0,           -- number of subscribers it went to
  sent_at      TIMESTAMPTZ DEFAULT NOW(),
  topics       TEXT[]                       -- topics used for this issue
);

-- Index for fast status lookups
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscribers_updated_at
  BEFORE UPDATE ON subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
