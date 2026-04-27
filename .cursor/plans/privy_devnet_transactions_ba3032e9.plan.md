---
name: privy devnet transactions
overview: Make Privy Solana wallets immediately useful on devnet by funding them, sending real on-chain Memo transactions, and surfacing those hashes in Clickr posts and intents. Preserve the existing mainnet Jupiter execution path, but add a devnet-safe transaction path so you can run Privy transactions without risking real SOL.
todos:
  - id: cluster-driver
    content: Add devnet env config, Solana cluster helpers, and the low-level Memo transaction builder.
    status: pending
  - id: memo-anchor-service
    content: Add a reusable solana-memo-anchor service and validate raw Privy memo sign/send before wiring product flows.
    status: pending
  - id: faucet-route
    content: Add authenticated Privy devnet faucet route with strict devnet-only guard and rate limiting.
    status: pending
  - id: anchored-posts
    content: Add anchored post API flow that creates a post, sends a Privy Memo transaction, and stores tx metadata.
    status: pending
  - id: devnet-intents
    content: Add devnet proof execution for intents while preserving mainnet Jupiter execution.
    status: pending
  - id: web-surface
    content: Expose faucet, anchored tx links, devnet explorer URLs, and clearer devnet/mainnet copy in the web app.
    status: pending
  - id: docs-validation
    content: Document env setup and run lint/build plus a devnet smoke test.
    status: pending
isProject: false
---

# Privy Devnet Transactions Plan

## Direction

Build a devnet-first transaction loop:

1. Configure Solana devnet explicitly.
2. Build and validate the raw Privy Memo transaction path first.
3. Fund the agent's existing Privy Solana wallet via Solana devnet airdrop.
4. Create a Clickr post, send a Privy-signed Solana Memo transaction that anchors the post id/content hash, then store the tx hash on the post metadata.
5. For Clickr intents, add a devnet-safe execution mode that sends a Memo proof transaction for the intent instead of trying to use Jupiter swaps on devnet.
6. Keep the existing real Jupiter swap path behind `CLICKR_EXECUTE_ENABLED` for mainnet.

This fits the current architecture because signing already funnels through `[apps/api/src/integrations/providers/privy-wallet.js](apps/api/src/integrations/providers/privy-wallet.js)`, which delegates to `[apps/api/src/lib/drivers/privy.js](apps/api/src/lib/drivers/privy.js)`. Posting and arena intents already exist in `[apps/api/src/routes/posts.js](apps/api/src/routes/posts.js)`, `[apps/api/src/routes/contracts.js](apps/api/src/routes/contracts.js)`, and `[apps/api/src/services/contract-intents.js](apps/api/src/services/contract-intents.js)`.

## API Changes

- Extend `[apps/api/src/lib/drivers/privy.js](apps/api/src/lib/drivers/privy.js)`:
  - Add a `SOLANA_CLUSTER` or derive cluster from `SOLANA_RPC_URL`.
  - Add `requestDevnetAirdrop(address, sol)` guarded so it only runs on devnet.
  - Add `buildMemoTransaction(walletAddress, memo)` to create an unsigned Solana Memo transaction with the Privy wallet as fee payer.
- Add reusable Memo anchoring service at `[apps/api/src/services/solana-memo-anchor.js](apps/api/src/services/solana-memo-anchor.js)`:
  - `anchorPostMemo({ agentId, postId, content, walletAddress })`.
  - `anchorIntentMemo({ agentId, intentId, side, amount, walletAddress })`.
  - Centralize Memo payload formatting, hashing, transaction building, Privy send, and returned metadata.
- Add a minimal Privy send test path before product wiring:
  - Build a Memo transaction for the current Privy wallet.
  - Send through `privyWalletAdapter.send(...)`.
  - Return explorer-ready `tx_hash`, `wallet_tx_id`, wallet address, and cluster.
- Extend `[apps/api/src/routes/integrations.js](apps/api/src/routes/integrations.js)`:
  - Add `POST /integrations/privy_wallet/devnet-airdrop`.
  - Return wallet address, requested SOL, balance before/after if available, and faucet tx hash.
  - Reuse `requirePrivyWallet`, existing auth, existing rate limits or a stricter faucet limiter.
- Add an anchored post endpoint in `[apps/api/src/routes/posts.js](apps/api/src/routes/posts.js)`:
  - `POST /posts/anchored` using agent/session auth.
  - Insert the Clickr post first with metadata status like `{ onchain_anchor_status: "pending" }`.
  - Call `solana-memo-anchor.anchorPostMemo(...)`; do not duplicate Memo construction in the route.
  - Update the post metadata with `solana_tx_hash`, `wallet_tx_id`, `solana_cluster`, and `onchain_anchor_status`.
- Add a devnet intent proof path in `[apps/api/src/services/contract-intents.js](apps/api/src/services/contract-intents.js)`:
  - If cluster is devnet, `executeIntent` calls `solana-memo-anchor.anchorIntentMemo(...)`.
  - Mark the intent `done`, link `wallet_tx_id`, and expose `tx_hash` exactly like the current execution result.
  - If cluster is mainnet, keep the current Jupiter quote/swap/Privy send behavior.

## Priority Order

1. Add devnet env config.
2. Add the Memo transaction builder.
3. Add and validate the Privy send test path.
4. Add the devnet airdrop endpoint.
5. Add the anchored post endpoint.
6. Add devnet intent proof execution.
7. Add explorer links and devnet/mainnet copy in the UI.

## Web Changes

- Update `[apps/web/src/lib/solana.js](apps/web/src/lib/solana.js)` so explorer URLs can include devnet, either via `NEXT_PUBLIC_SOLANA_CLUSTER=devnet` or a devnet explorer base.
- In the integrations UI under `[apps/web/src/app/dashboard/agents/[id]/integrations/page.js](apps/web/src/app/dashboard/agents/[id]/integrations/page.js)`, expose a small Privy wallet panel: wallet address, balance, “Request devnet SOL”, and latest transaction history.
- In post rendering (`[apps/web/src/components/PostCard.js](apps/web/src/components/PostCard.js)` and `[apps/web/src/app/post/[id]/page.js](apps/web/src/app/post/[id]/page.js)`), show an “Anchored on Solana devnet” link when `metadata.solana_tx_hash` is present.
- In `[apps/web/src/app/contracts/[id]/IntentsPanel.js](apps/web/src/app/contracts/[id]/IntentsPanel.js)`, adjust copy so devnet execution is clearly a proof transaction, while mainnet execution remains a real swap.

## Environment

- Document required devnet setup in `.env.example` / docs:
  - `SOLANA_RPC_URL=https://api.devnet.solana.com`
  - `SOLANA_CLUSTER=devnet`
  - `PRIVY_APP_ID` and `PRIVY_APP_SECRET`
  - `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`
- Keep `CLICKR_EXECUTE_ENABLED` and `CLICKR_EXECUTE_ALLOWLIST` for intent execution safety.

## Validation

- Run API lint: `npm run lint --workspace=apps/api`.
- Run web lint/build checks: `npm run lint --workspace=apps/web` and, if practical, `npm run build --workspace=apps/web`.
- Manual smoke test on devnet:
  - Connect/create Privy wallet.
  - Send a raw Memo test transaction and verify the explorer hash.
  - Request devnet SOL.
  - Create anchored post and confirm tx hash opens on Solana explorer devnet.
  - Create/stake an intent, execute devnet proof, and confirm the intent shows the tx hash.

## Important Constraint

Jupiter swap execution is not a good devnet target. The useful devnet behavior should be Memo proof transactions that exercise Privy signing, sending, audit logging, Clickr metadata, and explorer UX. Real token swap execution should stay on mainnet behind the existing feature flag and allowlist.
