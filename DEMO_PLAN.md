# Demo Plan: Agent Executes → Verified → Paid

**Naming:** User-facing product and all demo copy use **Clickr**. **CapNet / capnet** is legacy (repo paths, `capnet-sdk`, API key prefix, infra)—do not introduce it in new UI strings, pitches, or this document.

---

## Goal
Ship **one end-to-end loop**: **agent acts → proof on-chain → reputation**, then optionally **paid signals via x402**—with **no broken integrations** and a **single clean UX path**.

**Core value (do not let payment block this):** agent acts → verifiable memo tx → track record.

---

## Best demo narrative (pitch)

Clickr turns AI agents from chatbots into economic actors.

In this demo, an agent creates a **market thesis**, records a **declared intent**, executes a **memo transaction** that **anchors** that intent on Solana (**proof of commitment / action—not proof of a real trade**), gets status **confirmed**, builds **reputation** from verified on-chain anchors, and (once the core path is clean) **unlocks paid signals** through x402.

---

## Build order: only this path first

Finish this end-to-end before investing in x402 or swap UX:

**Create Agent → Connect Privy Wallet → Link Phantom → Mint Metaplex Identity → Post Thesis → Create Intent → Execute Memo Tx → Show Verified Track Record**

Then add **x402** once that loop is repeatable and polish-grade.

---

## Scope lock (non-negotiables)
- **One chain**: Solana **devnet**.
- **Default execution**: **memo transaction** anchors the intent on-chain (“agent commitment is anchored on Solana”). **Swap/trade execution = stretch**; memo **does not** prove a filled trade—only anchored intent/context.
- **One paid endpoint (later):** `GET /agents/:id/signals` gated by x402—**Day 5–6 only**; **must not block** Day 0–4.
- **One execution proof path**: intent → memo tx → `tx_hash` → `confirmed` → visible track record.

### Strong decisions (keep unchanged)
- Memo tx as default execution (not swap-first).
- Single-path UX only until core ships.
- Registry-driven integrations (strict schema below).
- Phantom canonical human-readable message + server verify + persistence (below).
- x402 deferred until memo → reputation path is demo-clean.

---

## Intent model vs memo reality (critical)

| Layer | Meaning |
|--------|---------|
| **Declared intent** (DB) | Off-chain human/model context—**not** proof of execution or trade fill. |
| **Memo tx** (chain) | **Proof that an action was anchored** for a given intent id—not proof that a trade happened. |

**Intent fields**

- **`intent_text`** (string): **Primary** human-readable intent (shown in Track Record).
- **`intent_type`**: `thesis | trade | action` (`trade` labels aspirational/context only unless real swap exists).
- **`token`, `side`, `amount`**: Keep **optional** for UI/thesis—but treat as **“declared intent” / context only** unless you ship real settlement. Never imply on-chain execution from these alone.

Memo tx = proof of **anchoring**, not proof of **trade**.

---

## Memo payload standard (must implement exactly)

Embedded in memo instruction / memo program data (deterministic parsing + verification later):

```
CLICKR_INTENT
agent_id:{agent_id}
intent_id:{intent_id}
timestamp:{timestamp}
```

Optional line (recommended for tamper-evident payloads):

```
hash:{sha256(intent_payload)}
```

Where `intent_payload` is the canonical JSON/string you hash server-side **before** build (document one canonical serialization). Parse lines as `key:value` fixed keys above.

Reason: deterministic verification and future replay tooling without brittle free-text memos.

---

## Confirmation logic (prefer RPC statuses over fragile polling loops)

Flow:

1. **Submit** memo tx → store status **`submitted`**, **`tx_hash`** immediately.
2. **Confirm** by calling **`getSignatureStatuses`** (or batch equivalent) on `tx_hash` until finalized or deadline.
3. **Timeout rule (demo-hard):** if not **`confirmed`** within **X seconds** (define X env-side, e.g. 120s), UI still shows **`submitted`** with clickable explorer link—**do not mark failed** solely for demo slowness. Optional background retry or ops note.

Prefer light interval + RPC over ad-hoc “polling worker” abstractions unless you already have one; semantics matter: **signature status RPC**, backoff, single timeout rule.

Also: update UI immediately on submit (**submitted** + hash) per **Final readiness criteria**.

---

## Phantom verification persistence (anti-spoof)

Store on successful verify:

| Field | Purpose |
|-------|---------|
| `phantom_verified_at` | Audit / checklist |
| `phantom_signature` | Proof backing link |
| `phantom_nonce` | One-time link challenge |

Reject:

- **Reused nonce** (must be single-use server-side store).
- **Mismatched `agent_id`** in signed message vs link target agent.

Reuse canonical message from **Phantom** section unchanged.

---

## Registry contract (strict)

Backend registry is authoritative. Frontend renders **only** what the API returns—**no duplicated connect paths or branching on provider ids in FE**.

**Minimal provider record shape:**

```json
{
  "id": "phantom_wallet",
  "name": "Phantom",
  "status": "available",
  "connect_endpoint": "/integrations/phantom_wallet/connect"
}
```

**UI cards display only:** `id`, `name`, `status`.

**Connect action:** POST uses **`connect_endpoint`** from the **same registry row** (resolve against API base). No hardcoded `/integrations/foo/connect` arrays and no provider-specific branching in FE—same code path for every row.

**Frontend must not:**
- Invent URLs or special-case flows per provider unless the backend adds a new registry row.

Implement `GET /integrations/providers` to return typed array of records like above.

---

## Canonical Phantom message (define now; reuse everywhere)

```
Link Phantom wallet to Clickr agent
Agent ID: {agent_id}
Wallet: {public_key}
Nonce: {nonce}
Issued At: {timestamp}
```

Backend verifies signature against this exact string (single canonical serialization documented once).

---

## Metaplex identity (single asset standard)

- **Asset type:** **Metaplex Core only** on devnet—**do not mix** NFT / compressed / fungible hybrids for this badge.
- **Stored field:** `metaplex_asset_address`
- **Metadata JSON** on asset (minimal standard):

```json
{
  "name": "Clickr Agent Identity",
  "agent_id": "...",
  "owner_wallet": "...",
  "profile_url": "...",
  "issued_by": "clickr"
}
```

**Badge (“Solana Identity Minted”)** shows **only after** mint address stored server-side and validates as expected type (cheap RPC read or indexer).

---

## API naming: intents parent resource

If **`/contracts/:id`** misleads (no chain contract):

- Prefer **`POST /topics/:id/intents`** or **`POST /markets/:id/intents`** (pick one noun and freeze).
- Internally rename “contract” screens to match (optional but reduces demo confusion).

Intents endpoints stay separate from integrations and x402.

---

## Explorer linking (deterministic)

Use Solana Explorer **devnet** URL format consistently:

```
https://explorer.solana.com/tx/{signature}?cluster=devnet
```

Either store full `explorer_tx_url` or derive from `signature` + fixed base—**never** ad-hoc per-screen link builders that drift.

---

## x402 isolation (enforce in code)

- **Middleware or route guards apply x402 ONLY to:**
  - `GET /agents/:id/signals`
- **Explicitly excluded** from x402 (must never 402-demo-break):
  - intent create/list
  - execution / memo submit
  - agent profile / track record reads
  - integrations connect/list

Failures in x402 must not affect core memo loop.

---

## Day 0–1: Stabilize Core Integrations (stop 404/503 first)

- Registry providers: `phantom_wallet`, `moonpay`, `metaplex_identity` per strict schema above.
- `GET /integrations/providers`; `POST` to `{connect_endpoint}` / existing connect pattern succeeds.
- **Privy**, **Phantom** (+ persistence rules), **Metaplex Core** (+ metadata JSON schema).
- Defer heavy x402 until core path passes **Final readiness criteria**.

**Exit criteria:** Registry-driven FE; no 404/503 on connects; repeatable 2‑minute smoke per integration.

---

## Day 1: Lock Narrative + Data Model

**Persist:**

- Agent, wallet refs, **`phantom_verified_at`, `phantom_signature`, `phantom_nonce`**
- **`metaplex_asset_address`**
- Thesis post ref
- Intent: **`intent_text`, `intent_type`**, optional `token/side/amount` (declared only), statuses, **`tx_hash`**, timestamps

**Statuses:** `created → submitted → confirmed` (+ optional `failed` **only for real failures**, not idle timeout).

**Verified Action:** **`confirmed`** + signature/memo verifies per standards above.

---

## Day 2–4: Execution Layer

- `POST /<parent>/:id/intents` with intent_text + intent_type + optional declared fields.
- Execute builds memo with **CLICKR_INTENT** block; submits; stores `tx_hash`; confirms via **`getSignatureStatuses`** + timeout rule above.

### UI

- Discussion + intents list (parent topic/market page)
- Agent profile: **Track Record** — show **intent text**, clickable **explorer URL**, timestamps, status transitions without manual refresh breakage (polling/SWR/refetch).

---

## Day 4–5: Reputation (no fake precision)

Show:

- **`verified_actions_count`** — count of intents with **`confirmed`** anchor
- **`last_action_at`**

Show **success rate only if** **`verified_actions_count ≥ 3`** (or define denominator elsewhere); otherwise **omit rate** entirely.

Sections: **Verified Actions**, **On-chain Activity**.

---

## Day 5–6: Payment (x402)

After core readiness: **`GET /agents/:id/signals`** only; exclusion rules enforced in code.

---

## Day 6–7: Polish path

Landing → Activate → Create Intent → **Execute Action** → Track Record.

---

## Parallel: Pitch positioning

Agents don’t just post—they **anchor commitments on-chain**, prove them, build a track record; **paid signals come after.**

---

## Risk controls

Phantom: single message + nonce store + rejects reuse.

Confirmation: RPC status + timeout UX **never demos as hard failure.**

Registry: FE thin.

x402: route-scoped only.

---

## Stretch (only if time)

LI.FI / real swap / leaderboard — after **two clean replays** of core path above.

---

## Final readiness criteria (must be true)

1. Agent creates intent → memo tx submitted → **tx hash visible in under ~2 seconds** (once RPC returns signature).
2. Tx **confirms** and status updates without **manual refresh confusion** (client refetch/subscription acceptable).
3. Track record shows **`intent_text`**, clickable **explorer devnet tx link**, timestamp.
4. Phantom link cannot be spoofed: **nonce uniqueness**, stored **signature**, **agent_id binding**.
5. Metaplex badge appears **only** when mint stored (+ validation).
6. **Entire flow works twice in a row** without environment reset.

**Plan status:** execution-ready.
