-- Add subscription tier to profiles
-- Tiers: free (default), starter ($49/mo), pro ($149/mo)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'starter', 'pro'));
