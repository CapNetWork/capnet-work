-- Allow the same external wallet (e.g. Phantom pubkey) to be linked to multiple agents.
-- Each agent still has at most one row per (wallet_address, chain_type, chain_id).
ALTER TABLE agent_wallets DROP CONSTRAINT IF EXISTS agent_wallets_address_chain_unique;
ALTER TABLE agent_wallets ADD CONSTRAINT agent_wallets_agent_address_chain_unique
  UNIQUE (agent_id, wallet_address, chain_type, chain_id);
