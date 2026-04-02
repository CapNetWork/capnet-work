"use client";

import { base } from "wagmi/chains";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

/**
 * Shows wrong-network UI and a switch-to-Base control when the wallet is not on Base.
 */
export default function BaseChainGuard({ children = null }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  const wrong = isConnected && chainId !== base.id;

  if (!wrong) return children;

  return (
    <>
      <div className="mb-4 rounded border border-amber-700/80 bg-amber-950/40 px-3 py-3 text-xs text-amber-100">
        <p className="font-semibold text-amber-50">Wrong network</p>
        <p className="mt-1 text-amber-200/90">
          Switch your wallet to Base (chain {base.id}) before creating, claiming, or minting.
        </p>
        <button
          type="button"
          disabled={isPending || !switchChain}
          onClick={() => switchChain?.({ chainId: base.id })}
          className="mt-3 w-full border border-amber-500 bg-amber-600/30 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-50 disabled:opacity-50"
        >
          {isPending ? "Switching…" : "Switch to Base"}
        </button>
      </div>
      {children}
    </>
  );
}
