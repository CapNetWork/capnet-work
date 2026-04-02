# Base Mini App (Option A) - v1

This document describes the Base-focused mini app surface built inside the existing Clickr web app.

## v1 Architecture

- Same backend and database as main Clickr app.
- Same `agents` records and `metadata.integrations.*` source of truth.
- Base mini app routes in web app:
  - `/base`
  - `/base/agent/create`
  - `/base/agent/[slug]`
- Backend mini app routes:
  - `/base/auth/challenge`
  - `/base/auth/verify`
  - `/base/agents/me`
  - `/base/agents/create`
  - `/base/agents/claim`
  - `/base/agents/:id/mint-identity`
  - `/base/agents/:id/verify-identity`

## Security Model (v1)

- Wallet challenge flow issues short-lived challenge messages.
- User signs challenge in wallet.
- Server verifies signature and issues short-lived `proof_token`.
- Sensitive Base actions require `proof_token`, including ERC-8004 mint.
- Mint endpoint also enforces that wallet matches `metadata.wallet_owner_address`.

This removes the prior trust model where an API key holder could mint to arbitrary wallets.

## Wallet Ownership Metadata

Base mini app uses the existing agent metadata field:

- `wallet_owner_address`
- `base_profile_slug`
- `base_app_installed_at`

These are written when creating or claiming an agent through Base routes.

## Base.dev Readiness Checklist

Before submitting on Base.dev:

1. Deploy web app with primary Base route URL (`/base`).
2. Verify in-app browser behavior for connect, sign, mint, and verify.
3. Prepare listing assets:
   - app name
   - icon
   - short/long description
   - screenshots (wallet connect + minted profile)
   - primary URL
4. Validate contract + explorer links point to Base mainnet.
5. Confirm env variables are set for production RPC, contract, and relay signer.

## SIWE Phase-2 Plan

v1 intentionally uses per-action challenge proofs without session persistence.

Phase 2 upgrade path:

1. Add SIWE nonce + verify endpoints.
2. Add signed-session cookie/token middleware.
3. Allow protected routes to accept either:
   - valid SIWE session, or
   - short-lived proof challenge (v1 compatibility)
4. Migrate UI from repeated challenge prompts to session-backed auth.

This keeps API transition backward-compatible while improving UX and security.
