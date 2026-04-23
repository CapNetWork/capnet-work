/**
 * Platform fee lifecycle for Clickr-routed Jupiter swaps.
 *
 * At quote/execute time, `resolveFeeConfig(outputMint)` returns:
 *
 *   { bps, wallet, feeAccount }
 *
 * where `bps` is the fee to inject into Jupiter's /quote + /swap and `feeAccount`
 * is the ATA of `CLICKR_PLATFORM_FEE_WALLET` for the swap's output mint.
 *
 * The wallet only needs to exist + be funded enough to hold token accounts;
 * Jupiter deposits the fee directly when the swap settles (we do not move funds
 * ourselves). ATAs must be pre-created by the fee-wallet owner — creating them
 * requires the fee-wallet's private key, which we intentionally do NOT hold.
 *
 * Graceful degradation (so `execute` stays demoable):
 *   - If CLICKR_PLATFORM_FEE_WALLET is unset                 -> bps=0, no feeAccount
 *   - If the ATA for the output mint does not exist          -> bps=0, no feeAccount, warn
 *
 * Operators enable monetization by (a) setting CLICKR_PLATFORM_FEE_WALLET and
 * (b) pre-creating ATAs for the output mints they want to capture fees in.
 */
const { PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const privyDriver = require("../lib/drivers/privy");

const DEFAULT_BPS = Math.max(
  0,
  Math.min(500, parseInt(process.env.CLICKR_PLATFORM_FEE_BPS || "50", 10) || 0)
);

function getConfiguredWallet() {
  const raw = (process.env.CLICKR_PLATFORM_FEE_WALLET || "").trim();
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    console.warn("[platform-fee] CLICKR_PLATFORM_FEE_WALLET is set but invalid; ignoring.");
    return null;
  }
}

function deriveFeeAta(outputMintBase58, feeWallet) {
  const mint = new PublicKey(outputMintBase58);
  return getAssociatedTokenAddressSync(mint, feeWallet, true, TOKEN_PROGRAM_ID).toBase58();
}

async function ataExists(ataBase58) {
  try {
    const conn = privyDriver.getSolanaConnection
      ? privyDriver.getSolanaConnection()
      : null;
    if (!conn) return false;
    const info = await conn.getAccountInfo(new PublicKey(ataBase58));
    return info != null;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{ bps: number, wallet: string|null, feeAccount: string|null, reason?: string }>}
 */
async function resolveFeeConfig(outputMint) {
  if (DEFAULT_BPS === 0) {
    return { bps: 0, wallet: null, feeAccount: null, reason: "bps_disabled" };
  }
  const feeWallet = getConfiguredWallet();
  if (!feeWallet) {
    return { bps: 0, wallet: null, feeAccount: null, reason: "wallet_unset" };
  }
  if (!outputMint || typeof outputMint !== "string") {
    return { bps: 0, wallet: feeWallet.toBase58(), feeAccount: null, reason: "missing_output_mint" };
  }

  let ata;
  try {
    ata = deriveFeeAta(outputMint, feeWallet);
  } catch (err) {
    console.warn("[platform-fee] ATA derivation failed:", err.message);
    return { bps: 0, wallet: feeWallet.toBase58(), feeAccount: null, reason: "ata_derivation_failed" };
  }

  const exists = await ataExists(ata);
  if (!exists) {
    console.warn(
      `[platform-fee] fee ATA ${ata} for mint ${outputMint} does not exist. Swap will run without a platform fee. ` +
        "Create the ATA from the fee wallet's keypair to start capturing fees on this mint."
    );
    return { bps: 0, wallet: feeWallet.toBase58(), feeAccount: null, reason: "ata_missing" };
  }

  return { bps: DEFAULT_BPS, wallet: feeWallet.toBase58(), feeAccount: ata };
}

/**
 * Cheap, synchronous accessor used by the quote UI to show the user the
 * configured fee rate before the per-mint ATA check has run. The actual fee
 * applied at execute may be 0 if `resolveFeeConfig` returns a reason code.
 */
function getAdvertisedBps() {
  return DEFAULT_BPS;
}

/**
 * Compute the fee captured in output-mint base units from a Jupiter quote,
 * given the bps actually applied. This mirrors Jupiter's fee math so our
 * `platform_fee_amount_base_units` column matches the on-chain deposit.
 */
function estimateFeeAmountBaseUnits(quote, bps) {
  if (!quote || !bps) return null;
  const outAmount = quote.outAmount != null ? BigInt(quote.outAmount) : null;
  if (outAmount == null) return null;
  const fee = (outAmount * BigInt(bps)) / BigInt(10000);
  return fee.toString();
}

module.exports = {
  resolveFeeConfig,
  getAdvertisedBps,
  estimateFeeAmountBaseUnits,
  deriveFeeAta,
  DEFAULT_BPS,
};
