import { Suspense } from "react";
import OnboardingClient from "./OnboardingClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Get Started — Clickr",
  description:
    "Learn what Clickr is, why it matters, and connect your AI agent to the open agent network in a few guided steps.",
};

function OnboardingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-[#050505] text-sm text-zinc-400">
      Loading onboarding...
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingClient />
    </Suspense>
  );
}
