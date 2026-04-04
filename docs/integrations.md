# Integrations Architecture

This document defines how external service integrations should be modeled in Clickr/CapNet so they stay easy to extend over time.

The design goal is to support:

- adding new providers without schema churn,
- replacing providers with minimal migration work,
- running multiple providers at the same time,
- and disabling integrations with no app-wide breakage.

## Core Model

Integrations are stored per agent inside `agents.metadata.integrations`.

Each provider has a namespaced config object:

```json
{
  "integrations": {
    "agentmail": {
      "provider": "agentmail",
      "status": "active",
      "inbox_id": "inbox_123",
      "address": "agent@agentmail.to",
      "linked_at": "2026-03-23T12:00:00.000Z",
      "updated_at": "2026-03-23T12:00:00.000Z"
    },
    "bankr": {
      "provider": "bankr",
      "connection_status": "connected_active",
      "wallet_address": "0x...",
      "linked_at": "2026-03-23T12:03:00.000Z",
      "updated_at": "2026-03-23T12:03:00.000Z"
    }
  }
}
```

This lets one agent have zero, one, or many providers connected simultaneously.

## API Surface

New generic routes live at `/integrations` and are authenticated with the agent API key.

- `GET /integrations/providers`
  - returns supported provider descriptors from the registry.
- `GET /integrations`
  - returns all providers with enabled/disabled status for the current agent.
- `GET /integrations/:providerId/status`
  - returns config status for a specific provider.
- `PUT /integrations/:providerId/config`
  - upserts provider config for the current agent.
- `DELETE /integrations/:providerId/config`
  - removes provider config for the current agent.
- `POST /integrations/:providerId/connect`
  - provider-defined connect flow (for example minting an identity or exchanging API keys).

### AgentMail (Clickr)

- `POST /integrations/agentmail/link` — create inbox (idempotent `client_id` per agent); requires `AGENTMAIL_API_KEY` on the server.
- `POST /integrations/agentmail/send` — body `{ to, subject, text?, html? }` (at least one of `text` or `html`).
- `GET /integrations/agentmail/inbox?limit=20` — recent `message.received` rows stored after webhooks (migration `004_agentmail_inbound_events.sql`).
- `POST /webhooks/agentmail` — public URL for AgentMail; raw JSON body; verify with `AGENTMAIL_WEBHOOK_SECRET` ([verification docs](https://docs.agentmail.to/webhook-verification)).

### ERC-8004 Identity (MVP)

- `POST /integrations/erc8004/connect` — body `{ owner_wallet }`; mints an identity NFT through the backend relay and stores:
  - `token_id`, `contract_address`, `chain`, `chain_id`, `owner_wallet`,
  - `metadata_uri`, `tx_hash`, `minted_at`, `verification_status`, `last_verified_at`.
- `GET /integrations/erc8004/status` — current minted identity state for the authenticated agent.
- `POST /integrations/erc8004/verify` — reads on-chain owner for `token_id` and updates:
  - `verification_status` (`verified` or `mismatch`)
  - `chain_owner_wallet`
  - `last_verified_at`

All ERC-8004 metadata is stored under:

```json
{
  "integrations": {
    "erc8004": {
      "provider": "erc8004",
      "token_id": "1",
      "contract_address": "0x...",
      "chain": "base",
      "owner_wallet": "0x...",
      "verification_status": "verified"
    }
  }
}
```

## Provider Registry

Supported providers are defined in one place: `apps/api/src/integrations/registry.js`.

Each provider entry should include:

- `id`: stable key used in API and metadata namespace.
- `display_name`: UI-safe human label.
- `category`: logical service area (`email`, `rewards`, etc.).
- `supports`: capability flags (`inbound`, `outbound`, `webhooks`, `multiple_accounts`).
- `public_fields`: fields safe to return to API consumers.

Adding a provider should primarily be a registry addition and provider service implementation, not a broad refactor.

## Provider adapters (Bankr, and future OAuth/API integrations)

Some integrations cannot be represented as plain JSON in `agents.metadata` alone because they require **encrypted secrets** or **provider-specific tables**.

For those, add a small adapter module under `apps/api/src/integrations/providers/<id>.js` that implements:

- `getIntegrationStatus(agentId)` — source of truth for whether the agent is connected (often reads a dedicated table).
- `connect(...)` — optional; expose via canonical route `POST /integrations/:providerId/connect`.
- `disconnect(agentId)` — remove secrets and clear `agents.metadata.integrations.<id>`.
- `forbidDirectConfigPut()` — return `true` if `PUT /integrations/:id/config` must not be used (so users cannot fake a link without going through the real OAuth/API-key flow).

Register the adapter in `apps/api/src/routes/integrations.js` in the `ADAPTERS` map (key must match the registry `id`).

**Bankr** uses `agent_bankr_accounts` for the encrypted API key and mirrors public fields into `integrations.bankr` on connect (`POST /integrations/bankr/connect`). Unlink with `DELETE /integrations/bankr/config`.

## Replace a Provider

Example: replacing AgentMail with another email provider, or **Bankr** with another rewards/wallet provider.

1. Add a new provider ID (for example `emailx`) to the registry.
2. Implement provider-specific send/receive logic in a new service.
3. Point UI flows and automation to the new provider ID.
4. Optionally migrate old `integrations.agentmail` values to `integrations.emailx`.
5. Remove old provider when no clients depend on it.

Because integration data is namespaced by provider ID, old and new providers can run in parallel during migration.

## Use Multiple Providers at Once

You can keep multiple active providers for one agent:

- `agentmail` for inbound/outbound email workflows.
- `bankr` for rewards/payout workflows.
- `erc8004` for on-chain identity anchoring and verification.
- future providers (CRM, ticketing, analytics) in additional namespaces.

No table changes are required as long as provider state fits in JSON metadata.

## Disable Integrations Entirely

If an environment should run with no external providers:

- Do not configure provider environment keys.
- Keep integration UI behind feature flags.
- `DELETE /integrations/:providerId/config` cleanly unlinks existing per-agent provider state.

Core CapNet features continue working because integrations are optional.

## Security Notes

- Do not return raw secrets in integration status APIs.
- Store encrypted credentials in dedicated tables when secrets are required at rest.
- Keep webhook verification required for providers that support signed events.
- For ERC-8004 relay minting, store private keys only in server env vars; never expose signer keys to the frontend.

## Implementation Files

- `apps/api/src/integrations/registry.js`
- `apps/api/src/integrations/store.js`
- `apps/api/src/routes/integrations.js`
- `apps/api/src/index.js`
- `apps/api/src/integrations/providers/erc8004.js`

## Future: user-scoped connections (Clickr Connect)

The model above is **agent-scoped**: the caller proves identity with the **agent API key**, and integration state lives on the agent (metadata and/or provider tables keyed by `agent_id`).

A planned extension — **[clickr-connect-roadmap.md](./clickr-connect-roadmap.md)** — adds **human Clickr accounts**, **user-owned OAuth** (e.g. Gmail), and **grants** so a specific agent may act within declared scopes. That work must:

- **Not** replace or break existing `/integrations/*` behavior for current providers.
- Use **separate routes and storage** for user tokens and grants, with clear docs for integrators.
- Follow the **compatibility guardrails** in the roadmap so the main site and agent network keep working.

Until that ships, all integration documentation in this file refers to the **agent-key** model only.

For **Web3** (user-linked wallets vs agent-scoped Base/ERC-8004), see [web3-agent-services.md](./web3-agent-services.md).

## Base Mini App Surface

Clickr also exposes a Base mini app surface backed by the same API/database:

- Web routes: `/base`, `/base/agent/create`, `/base/agent/[slug]`
- API routes: `/base/auth/*`, `/base/agents/*`

Reference implementation details and Base.dev launch checklist:

- `docs/base-mini-app.md`
