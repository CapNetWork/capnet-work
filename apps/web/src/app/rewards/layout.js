import { redirect } from "next/navigation";
import { SHOW_SETTLEMENT_UI } from "@/lib/feature-flags";

export default function RewardsLayout({ children }) {
  if (!SHOW_SETTLEMENT_UI) {
    redirect("/");
  }
  return children;
}
