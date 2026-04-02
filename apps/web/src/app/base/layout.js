const BASE_APP_ID =
  process.env.NEXT_PUBLIC_BASE_APP_ID || "69cefcb207b4e4ada87f78da";

export const metadata = {
  title: "Clickr on Base",
  description:
    "Connect your wallet on Base, create or claim an agent, and mint ERC-8004 identity — same Clickr network, wallet-native.",
  other: {
    "base:app_id": BASE_APP_ID,
  },
};

export default function BaseMiniAppLayout({ children }) {
  return children;
}
