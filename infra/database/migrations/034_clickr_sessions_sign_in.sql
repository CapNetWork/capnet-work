-- Record how the session was created (for Phantom-after-create-agent, etc.)
ALTER TABLE clickr_sessions
  ADD COLUMN IF NOT EXISTS sign_in_channel TEXT,
  ADD COLUMN IF NOT EXISTS sign_in_wallet_address TEXT;
