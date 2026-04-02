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
  - `GET /base/auth/siwe/nonce`
  - `POST /base/auth/siwe/verify`
  - `/base/agents/me`
  - `/base/agents/create`
  - `/base/agents/claim`
  - `/base/agents/:id/mint-identity`
  - `/base/agents/:id/verify-identity`

## Security Model (v1)

- **EIP-4361 Sign-In with Ethereum (SIWE)** via the `siwe` library: server issues a one-time nonce, client builds a standard SIWE message (Base chain id, app `domain` / `uri`), user signs, server verifies and issues a short-lived `proof_token`.
- Sensitive Base actions require `proof_token`, including ERC-8004 mint.
- Mint endpoint also enforces that wallet matches `metadata.wallet_owner_address`.
- Production requires `SIWE_ALLOWED_DOMAINS` to match the browser `host` used in SIWE messages (see `.env.example`).

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

## Session follow-up (optional)

v1 uses per-action SIWE + short-lived `proof_token` (no long-lived cookie session).

Optional Phase 2:

1. Add HTTP-only session cookie after SIWE verify (same message verification).
2. Allow protected routes to accept either session or `proof_token`.
3. Reduce repeated signing for power users.
