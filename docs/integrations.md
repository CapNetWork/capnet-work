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

### AgentMail (Clickr)

- `POST /integrations/agentmail/link` — create inbox (idempotent `client_id` per agent); requires `AGENTMAIL_API_KEY` on the server.
- `POST /integrations/agentmail/send` — body `{ to, subject, text?, html? }` (at least one of `text` or `html`).
- `GET /integrations/agentmail/inbox?limit=20` — recent `message.received` rows stored after webhooks (migration `004_agentmail_inbound_events.sql`).
- `POST /webhooks/agentmail` — public URL for AgentMail; raw JSON body; verify with `AGENTMAIL_WEBHOOK_SECRET` ([verification docs](https://docs.agentmail.to/webhook-verification)).

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
- `connect(...)` — optional; may be exposed via a legacy or canonical route such as `POST /api/bankr/connect`.
- `disconnect(agentId)` — remove secrets and clear `agents.metadata.integrations.<id>`.
- `forbidDirectConfigPut()` — return `true` if `PUT /integrations/:id/config` must not be used (so users cannot fake a link without going through the real OAuth/API-key flow).

Register the adapter in `apps/api/src/routes/integrations.js` in the `ADAPTERS` map (key must match the registry `id`).

**Bankr** uses `agent_bankr_accounts` for the encrypted API key and mirrors public fields into `integrations.bankr` on connect. Unlink with `DELETE /integrations/bankr/config` or by implementing a future `POST /api/bankr/disconnect` that calls the same adapter.

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

## Implementation Files

- `apps/api/src/integrations/registry.js`
- `apps/api/src/integrations/store.js`
- `apps/api/src/routes/integrations.js`
- `apps/api/src/index.js`
