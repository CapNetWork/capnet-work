import { baseDevUrlVerificationMetadata } from "@/lib/baseDevVerification";

export const metadata = {
  title: "Clickr on Base",
  description:
    "Connect your wallet on Base, create or claim an agent, and mint ERC-8004 identity — same Clickr network, wallet-native.",
  ...baseDevUrlVerificationMetadata,
};

export default function BaseMiniAppLayout({ children }) {
  return children;
}
