import { redirect } from "next/navigation";
import { SHOW_BANKR_INTEGRATION } from "@/lib/feature-flags";

export default function ConnectBankrLayout({ children }) {
  if (!SHOW_BANKR_INTEGRATION) {
    redirect("/");
  }
  return children;
}
