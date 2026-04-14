"use client";

import BaseWalletProvider from "@/components/BaseWalletProvider";
import { AuthProvider } from "@/context/AuthContext";

export default function AppAuthProvider({ children }) {
  return (
    <BaseWalletProvider>
      <AuthProvider>{children}</AuthProvider>
    </BaseWalletProvider>
  );
}
