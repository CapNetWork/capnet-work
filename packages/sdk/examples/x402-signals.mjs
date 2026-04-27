import { CapNet } from "../src/index.js";
import { Wallet, randomBytes } from "ethers";

/**
 * Example: call a paid endpoint using the SDK's 402 -> pay -> retry helper.
 *
 * Setup:
 * - export CAPNET_API_URL=http://localhost:4000
 * - export CAPNET_API_KEY=...
 * - export X402_PAYER_PRIVATE_KEY=...   # EVM key with USDC balance/allowance as required by x402 scheme
 *
 * You must provide a `pay()` implementation that:
 * - reads the `PAYMENT-REQUIRED` header (base64 PaymentRequired JSON)
 * - constructs a base64 PaymentPayload (PAYMENT-SIGNATURE) using your wallet
 *
 * This example implements Exact (EVM / EIP-3009 style) signing using `ethers`.
 *
 * Notes:
 * - This assumes the server is configured for an EVM CAIP-2 network like `eip155:8453` (Base).
 * - For Solana networks, you'd implement a different scheme signer (not shown here).
 */

const apiKey = process.env.CAPNET_API_KEY;
const baseUrl = process.env.CAPNET_API_URL || "http://localhost:4000";
const agentId = process.env.SELLER_AGENT_ID; // the agent you're buying signals from
const payerPrivateKey = process.env.X402_PAYER_PRIVATE_KEY;
const expectedNetwork = process.env.X402_NETWORK || null;
const expectedAsset = process.env.X402_ASSET_ADDRESS || null;
const expectedPayTo = process.env.X402_PAYMENT_ADDRESS || null;

if (!apiKey) throw new Error("CAPNET_API_KEY is required");
if (!agentId) throw new Error("SELLER_AGENT_ID is required");
if (!payerPrivateKey) throw new Error("X402_PAYER_PRIVATE_KEY is required");

const capnet = new CapNet(apiKey, baseUrl);

function fromBase64Json(b64) {
  const raw = Buffer.from(String(b64), "base64").toString("utf-8");
  return JSON.parse(raw);
}

function toBase64Json(obj) {
  return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
}

function parseChainIdFromCaip2(network) {
  const s = String(network || "");
  const m = s.match(/^eip155:(\d+)$/);
  if (!m) return null;
  return Number(m[1]);
}

function makeNonce32() {
  return `0x${Buffer.from(randomBytes(32)).toString("hex")}`;
}

async function pay({ paymentRequiredHeader, url, method }) {
  const paymentRequired = fromBase64Json(paymentRequiredHeader);
  if (!paymentRequired?.accepts?.length) {
    throw new Error("Invalid PAYMENT-REQUIRED: missing accepts[]");
  }
  const accepted = paymentRequired.accepts[0];
  if (expectedNetwork && accepted.network !== expectedNetwork) {
    throw new Error(`Network mismatch: server=${accepted.network} env(X402_NETWORK)=${expectedNetwork}`);
  }
  if (expectedAsset && accepted.asset?.toLowerCase?.() !== expectedAsset.toLowerCase()) {
    throw new Error(`Asset mismatch: server=${accepted.asset} env(X402_ASSET_ADDRESS)=${expectedAsset}`);
  }
  if (expectedPayTo && accepted.payTo?.toLowerCase?.() !== expectedPayTo.toLowerCase()) {
    throw new Error(`payTo mismatch: server=${accepted.payTo} env(X402_PAYMENT_ADDRESS)=${expectedPayTo}`);
  }
  if (accepted.scheme !== "exact") {
    throw new Error(`Unsupported x402 scheme: ${accepted.scheme}`);
  }

  const chainId = parseChainIdFromCaip2(accepted.network);
  if (!chainId) {
    throw new Error(
      `This example only supports EVM CAIP-2 networks like eip155:8453. Got network=${accepted.network}`
    );
  }

  const wallet = new Wallet(payerPrivateKey);

  // EIP-3009-style authorization window.
  const now = Math.floor(Date.now() / 1000);
  const validAfter = String(now - 5);
  const validBefore = String(now + Number(accepted.maxTimeoutSeconds || 60));
  const nonce = makeNonce32();

  const authorization = {
    from: await wallet.getAddress(),
    to: accepted.payTo,
    value: String(accepted.amount),
    validAfter,
    validBefore,
    nonce,
  };

  // USDC EIP-3009 domain (commonly: name="USD Coin", version="2").
  // If you change assets, you may need different EIP-712 domain fields.
  const domain = {
    name: "USD Coin",
    version: "2",
    chainId,
    verifyingContract: accepted.asset,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const signature = await wallet.signTypedData(domain, types, authorization);

  const paymentPayload = {
    x402Version: 2,
    resource: paymentRequired.resource,
    accepted,
    payload: {
      signature,
      authorization,
    },
  };

  // This is what the server expects in the PAYMENT-SIGNATURE header.
  const encoded = toBase64Json(paymentPayload);

  // Helpful debug (kept small and safe).
  console.log("[x402] 402 received, paying…", {
    url,
    method,
    network: accepted.network,
    asset: accepted.asset,
    payTo: accepted.payTo,
    amount: accepted.amount,
  });

  return encoded;
}

const signals = await capnet.agentSignals(agentId, { pay });
console.log(JSON.stringify(signals, null, 2));

