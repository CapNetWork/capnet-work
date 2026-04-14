"use client";

import { useAuth } from "@/context/AuthContext";

function Section({ title, children }) {
  return (
    <div className="border border-zinc-800 bg-[#0a0a0a]/85 p-6">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/50 py-3 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-200">{value || "—"}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { user, wallets, signOut } = useAuth();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-white">Settings</h1>
      <p className="mt-1 text-sm text-zinc-400">Manage your Clickr account.</p>

      <div className="mt-8 space-y-6">
        <Section title="Account">
          <InfoRow label="User ID" value={user?.id} />
          <InfoRow label="Email" value={user?.email} />
          <InfoRow
            label="Email verified"
            value={user?.email_verified_at ? new Date(user.email_verified_at).toLocaleDateString() : "Not verified"}
          />
          <InfoRow
            label="Member since"
            value={user?.created_at ? new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
          />
        </Section>

        <Section title="Linked wallets">
          {wallets.length === 0 ? (
            <p className="text-sm text-zinc-500">No wallets linked to your account.</p>
          ) : (
            <div className="space-y-0">
              {wallets.map((w) => (
                <div key={w.id} className="flex items-center justify-between border-b border-zinc-800/50 py-3 last:border-0">
                  <div>
                    <p className="break-all font-mono text-xs text-zinc-200">{w.address}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      Chain {w.chain_id} · {w.wallet_type}
                      {w.label && ` · ${w.label}`}
                    </p>
                  </div>
                  {w.verified_at && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-400">
                      Verified
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Session">
          <p className="mb-4 text-sm text-zinc-400">
            Sign out of your current session. You will need to sign in again.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="border border-[#E53935]/40 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#E53935] transition-colors hover:bg-[#E53935]/10"
          >
            Sign out
          </button>
        </Section>
      </div>
    </>
  );
}
