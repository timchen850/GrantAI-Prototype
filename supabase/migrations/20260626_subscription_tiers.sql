-- Add subscription tier to profiles
-- Tiers: free (default), starter ($14.99/mo or $120/yr), pro ($35.99/mo or $300/yr); prices as of 2026-10-24
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'starter', 'pro'));
