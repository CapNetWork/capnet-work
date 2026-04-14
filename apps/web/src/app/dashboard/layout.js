"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppAuthProvider from "@/components/AppAuthProvider";
import { useAuth } from "@/context/AuthContext";
import DashboardShell from "@/components/dashboard/DashboardShell";

function DashboardGate({ children }) {
  const { isSignedIn, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isSignedIn) {
      router.push("/signin");
    }
  }, [loading, isSignedIn, router]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-65px)] items-center justify-center bg-[#050505]">
        <div className="text-sm text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex h-[calc(100vh-65px)] items-center justify-center bg-[#050505]">
        <div className="text-sm text-zinc-500">Redirecting to sign in...</div>
      </div>
    );
  }

  return <DashboardShell>{children}</DashboardShell>;
}

export default function DashboardLayout({ children }) {
  return (
    <AppAuthProvider>
      <DashboardGate>{children}</DashboardGate>
    </AppAuthProvider>
  );
}
