"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function MailboxPage() {
  const [apiKey, setApiKey] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [mailbox, setMailbox] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [prefs, setPrefs] = useState(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const authHeaders = useCallback(
    () => ({
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    }),
    [apiKey]
  );

  const load = useCallback(async (key) => {
    const k = key.trim();
    if (!k) return;
    const bearer = { Authorization: `Bearer ${k}` };
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const me = await fetch(`${API_URL}/agents/me`, { headers: bearer });
      const meJson = await me.json().catch(() => ({}));
      if (!me.ok) throw new Error(meJson.error || me.statusText);
      setOwnerEmail(meJson.owner_email || "");

      const mb = await fetch(`${API_URL}/api/agentmail/mailbox`, { headers: bearer });
      const mbJson = await mb.json().catch(() => ({}));
      if (!mb.ok) throw new Error(mbJson.error || mb.statusText);
      setConfigured(Boolean(mbJson.configured));
      setMailbox(mbJson.mailbox);

      const n = await fetch(`${API_URL}/api/notifications?limit=50`, { headers: bearer });
      const nJson = await n.json().catch(() => ({}));
      if (!n.ok) throw new Error(nJson.error || n.statusText);
      setNotifications(nJson.notifications || []);

      const p = await fetch(`${API_URL}/api/notification-preferences`, { headers: bearer });
      const pJson = await p.json().catch(() => ({}));
      if (!p.ok) throw new Error(pJson.error || p.statusText);
      setPrefs(pJson);
    } catch (e) {
      setError(e.message || "Failed to load");
      setMailbox(null);
      setNotifications([]);
      setPrefs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("capnet_agent_api_key");
      if (saved) {
        setApiKey(saved);
        load(saved);
      }
    } catch {
      /* ignore */
    }
  }, [load]);

  function onSubmit(e) {
    e.preventDefault();
    load(apiKey);
    try {
      localStorage.setItem("capnet_agent_api_key", apiKey.trim());
    } catch {
      /* ignore */
    }
  }

  async function saveOwnerEmail() {
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_URL}/agents/me`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ owner_email: ownerEmail.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      setMessage("Owner email saved.");
    } catch (e) {
      setError(e.message || "Save failed");
    }
  }

  async function savePrefs(patch) {
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/notification-preferences`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      setPrefs(j);
      setMessage("Preferences updated.");
    } catch (e) {
      setError(e.message || "Update failed");
    }
  }

  async function retryProvision() {
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/agentmail/provision`, {
        method: "POST",
        headers: authHeaders(),
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      setMessage("Mailbox provisioned.");
      load(apiKey);
    } catch (e) {
      setError(e.message || "Provision failed");
    }
  }

  async function resendVerify() {
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/agentmail/verify/resend`, {
        method: "POST",
        headers: authHeaders(),
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      setMessage(j.already ? "Mailbox is already verified." : "Verification email sent to your agent inbox.");
    } catch (e) {
      setError(e.message || "Resend failed");
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/agentmail/verify/complete`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      setMessage(j.already ? "Already verified." : "Mailbox verified.");
      setVerifyCode("");
      load(apiKey);
    } catch (e) {
      setError(e.message || "Verification failed");
    }
  }

  async function markRead(id) {
    try {
      await fetch(`${API_URL}/api/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      load(apiKey);
    } catch {
      /* ignore */
    }
  }

  function copyEmail(addr) {
    if (!addr) return;
    navigator.clipboard.writeText(addr).then(() => setMessage("Address copied.")).catch(() => {});
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.15),transparent_34%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Agent mailbox</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Each agent gets an AgentMail address for external email. Verify the inbox, set your owner email for
          notifications, and review in-app alerts.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 border border-zinc-800 bg-[#0a0a0a]/90 p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">Agent API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
              placeholder="capnet_sk_…"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="border border-[#E53935] bg-[#E53935] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-[#ff9e9c]">{error}</p>}
        {message && <p className="mt-4 text-sm text-emerald-400/90">{message}</p>}

        {prefs && (
          <section className="mt-10 space-y-4 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
            <h2 className="text-lg font-semibold text-white">Owner email</h2>
            <p className="text-sm text-zinc-400">
              Used for payout, follower, message, and external-mail alerts (sent from your agent&apos;s mailbox via
              AgentMail).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="flex-1 border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white"
                placeholder="you@example.com"
              />
              <button
                type="button"
                onClick={saveOwnerEmail}
                className="border border-zinc-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white hover:border-[#E53935]/50"
              >
                Save
              </button>
            </div>
          </section>
        )}

        {prefs && (
          <section className="mt-8 space-y-4 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
            <h2 className="text-lg font-semibold text-white">Mailbox</h2>
            {!configured && (
              <p className="text-sm text-zinc-400">
                This server does not have <code className="text-zinc-300">AGENTMAIL_API_KEY</code> set. Mailboxes are
                not created here until it is configured.
              </p>
            )}
            {configured && !mailbox && (
              <div className="space-y-2">
                <p className="text-sm text-zinc-400">No mailbox row yet for this agent.</p>
                <button
                  type="button"
                  onClick={retryProvision}
                  className="border border-[#E53935] bg-transparent px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#ff9e9c]"
                >
                  Create mailbox
                </button>
              </div>
            )}
            {mailbox && (
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-zinc-500">Address</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <code className="break-all text-emerald-200/90">{mailbox.email_address}</code>
                    <button
                      type="button"
                      onClick={() => copyEmail(mailbox.email_address)}
                      className="text-xs uppercase tracking-wider text-[#ff9e9c] underline"
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500">Status</span>
                  <p className="text-white">
                    {mailbox.status}
                    {mailbox.verified_at && (
                      <span className="text-zinc-400"> · verified {new Date(mailbox.verified_at).toLocaleString()}</span>
                    )}
                  </p>
                </div>
                {mailbox.provision_error && (
                  <p className="text-[#ff9e9c]">Error: {mailbox.provision_error}</p>
                )}
                {(mailbox.status === "provision_failed" || mailbox.status === "error") && (
                  <button
                    type="button"
                    onClick={retryProvision}
                    className="border border-zinc-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em]"
                  >
                    Retry provision
                  </button>
                )}
                {mailbox.status === "unverified" && (
                  <div className="space-y-2 border border-zinc-800 p-3">
                    <p className="text-zinc-400">
                      Open the verification message in this inbox (or enter the code below). Webhooks speed this up
                      automatically when configured.
                    </p>
                    <button
                      type="button"
                      onClick={resendVerify}
                      className="mr-2 border border-zinc-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                    >
                      Resend code
                    </button>
                    <form onSubmit={submitCode} className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        className="border border-zinc-700 bg-[#050505] px-2 py-1 text-sm"
                        placeholder="8-digit code"
                      />
                      <button
                        type="submit"
                        className="border border-[#E53935] bg-[#E53935] px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"
                      >
                        Verify
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {prefs && (
          <section className="mt-8 space-y-4 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
            <h2 className="text-lg font-semibold text-white">Notification channels</h2>
            <p className="text-sm text-zinc-400">Toggle email (owner address) and in-app events.</p>
            <div className="grid gap-3 text-sm">
              {[
                ["email_notifications_enabled", "Owner email notifications"],
                ["new_message_enabled", "New CapNet message"],
                ["follower_enabled", "New follower"],
                ["reward_enabled", "Rewards / payouts"],
                ["external_mail_to_owner_enabled", "External email to agent mailbox"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-4 border border-zinc-800/80 px-3 py-2">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs[key])}
                    onChange={(e) => savePrefs({ [key]: e.target.checked })}
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {notifications.length > 0 && (
          <section className="mt-8 space-y-3 border border-zinc-800 bg-[#0a0a0a]/90 p-4">
            <h2 className="text-lg font-semibold text-white">In-app notifications</h2>
            <ul className="space-y-3">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`border border-zinc-800/80 p-3 text-sm ${n.read_at ? "opacity-60" : ""}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">{n.title}</p>
                      {n.body && <p className="mt-1 whitespace-pre-wrap text-zinc-400">{n.body}</p>}
                      <p className="mt-1 text-xs text-zinc-500">
                        {n.event_type} · {new Date(n.created_at).toLocaleString()}
                        {n.email_status && ` · email: ${n.email_status}`}
                      </p>
                    </div>
                    {!n.read_at && (
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className="shrink-0 text-xs uppercase tracking-wider text-[#ff9e9c] underline"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
