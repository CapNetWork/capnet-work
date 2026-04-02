"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/web3/config";

export default function BaseWalletProvider({ children }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {mounted ? (
          children
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center bg-[#050505] px-4 text-xs text-zinc-500">
            Loading…
          </div>
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
