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

## Base.dev URL verification

Base.dev **Verify & Add URL** expects a meta tag on the HTML document for your mini app home (e.g. `https://www.clickr.cc/base`):

- Implemented via Next.js **`metadata.other`** in the root [`apps/web/src/app/layout.js`](../apps/web/src/app/layout.js) (spread from [`baseDevVerification.js`](../apps/web/src/lib/baseDevVerification.js)) so `base:app_id` stays in the real DOM; avoid a manual `<head>` meta here — the App Router can omit it in DevTools even when it appears in a one-off HTML fetch. Homepage [`page.js`](../apps/web/src/app/page.js) uses `revalidate = 300` so CDNs pick up deploys within minutes.
- Override at build time with `NEXT_PUBLIC_BASE_APP_ID` (see [`.env.example`](../.env.example)); otherwise the app id you registered on Base.dev is the default in code.

After deploy, confirm with **View Page Source** or e.g. `curl -sL https://www.clickr.cc/ | grep -o '<meta name="base:app_id"[^>]*>'`, then complete **Verify & Add** in the Base.dev modal (use the exact URL Base asks for, often the homepage or `/base`).

## Base Builder Codes (relay mints)

ERC-8004 identity mints are sent by the **API relay** (`ERC8004_MINTER_PRIVATE_KEY`), not the user wallet. To attribute those transactions in [Base.dev](https://base.dev) analytics (and future rewards programs), the relay appends an [ERC-8021](https://docs.base.org/base-chain/builder-codes/builder-codes) **calldata suffix** on each `mint` call ([`apps/api/src/integrations/providers/erc8004.js`](../apps/api/src/integrations/providers/erc8004.js)).

1. Register on [base.dev](https://base.dev) and copy your **Builder Code** under **Settings → Builder Code**.
2. Set **`BASE_BUILDER_CODE`** on the API service (recommended), or **`BASE_BUILDER_DATA_SUFFIX`** as raw `0x…` hex if you generate the suffix yourself (suffix env wins over code if both are set).
3. Validate a mint tx with the [Builder Code Validation](https://builder-code-checker.vercel.app/) tool or Basescan input data (see [app developers guide](https://docs.base.org/base-chain/builder-codes/app-developers)).

If neither variable is set, mints behave as before (no suffix).

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
5. Confirm env variables are set for production RPC, contract, and relay signer; set **`BASE_BUILDER_CODE`** (or **`BASE_BUILDER_DATA_SUFFIX`**) on the API if you want Builder Code attribution on mints.

## Session follow-up (optional)

v1 uses per-action SIWE + short-lived `proof_token` (no long-lived cookie session).

Optional Phase 2:

1. Add HTTP-only session cookie after SIWE verify (same message verification).
2. Allow protected routes to accept either session or `proof_token`.
3. Reduce repeated signing for power users.
