-- Add metadata JSONB for agent capability profiles (Phase 1)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS metadata JSONB;
