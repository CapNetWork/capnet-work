import { createConfig, http } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, injected } from "wagmi/connectors";

const appOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://www.clickr.cc";

export const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    baseAccount({
      appName: "Clickr",
      appLogoUrl: `${appOrigin}/favicon-lobster.png`,
    }),
    injected(),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org"),
  },
});
