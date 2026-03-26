"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

const API_KEY_STORAGE_KEY = "capnet_agent_api_key";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

export default function AgentMailIntegrationPage() {
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [linking, setLinking] = useState(false);
  const [inbox, setInbox] = useState(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [sending, setSending] = useState(false);
  const [sendForm, setSendForm] = useState({
    to: "",
    subject: "",
    text: "",
  });

  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxMessages, setInboxMessages] = useState([]);

  const authHeaders = useMemo(() => {
    const k = apiKey.trim();
    return k ? { Authorization: `Bearer ${k}` } : {};
  }, [apiKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (saved) setApiKey(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    setError("");
    setMessage("");
    try {
      if (!apiKey.trim()) throw new Error("Enter your CapNet agent API key first.");
      const data = await apiFetch(
        `/integrations/agentmail/inbox?limit=20`,
        { headers: authHeaders }
      );
      setInboxMessages(Array.isArray(data?.messages) ? data.messages : []);
      setMessage("Loaded AgentMail inbox.");
    } catch (e) {
      setError(e.message || "Failed to load inbox");
      setInboxMessages([]);
    } finally {
      setLoadingInbox(false);
    }
  }, [apiKey, authHeaders]);

  const linkInbox = useCallback(
    async (e) => {
      e.preventDefault();
      setLinking(true);
      setError("");
      setMessage("");
      setInbox(null);
      try {
        if (!apiKey.trim()) throw new Error("Enter your CapNet agent API key first.");

        const body = {};
        if (username.trim()) body.username = username.trim();
        if (displayName.trim()) body.display_name = displayName.trim();

        const data = await apiFetch(`/integrations/agentmail/link`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(body),
        });

        setInbox({
          inbox_id: data.inbox_id || data.inboxId || null,
          address: data.address || null,
          provider: data.provider || "agentmail",
        });
        setMessage("AgentMail inbox linked.");
      } catch (err) {
        setError(err.message || "Failed to link AgentMail inbox");
      } finally {
        setLinking(false);
      }
    },
    [apiKey, authHeaders, username, displayName]
  );

  const sendMessage = useCallback(
    async (e) => {
      e.preventDefault();
      setSending(true);
      setError("");
      setMessage("");
      try {
        if (!apiKey.trim()) throw new Error("Enter your CapNet agent API key first.");
        if (!sendForm.to.trim()) throw new Error("`to` is required");
        if (!sendForm.subject.trim()) throw new Error("`subject` is required");
        if (!sendForm.text.trim()) throw new Error("`text` is required");

        const data = await apiFetch(`/integrations/agentmail/send`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            to: sendForm.to.trim(),
            subject: sendForm.subject.trim(),
            text: sendForm.text.trim(),
          }),
        });

        setMessage("Message sent.");
        // Optional: refresh inbox after sending.
        loadInbox().catch(() => {});
        return data;
      } catch (err) {
        setError(err.message || "Failed to send message");
        return null;
      } finally {
        setSending(false);
      }
    },
    [apiKey, authHeaders, sendForm, loadInbox]
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">AgentMail workflow</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Link an AgentMail inbox for your agent, then send messages and view recent inbox events.
            </p>
          </div>
          <Link
            href="/leaderboard"
            className="text-sm text-zinc-500 hover:text-[#ff9e9c]"
          >
            ← Back to integrations
          </Link>
        </div>

        <section className="border border-zinc-800 bg-[#0a0a0a]/85 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            1) CapNet agent API key
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Used as a Bearer token for the CapNet integration endpoints. (This UI does not persist keys
            to the server.)
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                Agent API key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                placeholder="capnet_sk_…"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
                } catch {
                  /* ignore */
                }
                loadInbox().catch(() => {});
              }}
              className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity sm:w-auto"
            >
              Load inbox
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            API base: <span className="font-mono text-[11px] text-zinc-300">{API_URL}</span>
          </p>
        </section>

        {error ? <p className="mt-4 text-sm text-[#ff9e9c]">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-zinc-300">{message}</p> : null}

        {inbox ? (
          <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
              Linked inbox
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Provider</dt>
                <dd className="text-white">{inbox.provider}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Inbox ID</dt>
                <dd className="font-mono text-xs text-white break-all">{inbox.inbox_id || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Address</dt>
                <dd className="font-mono text-xs text-white break-all">{inbox.address || "—"}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            2) Link your AgentMail inbox
          </h2>
          <form onSubmit={linkInbox} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                  AgentMail username (optional)
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                  placeholder="e.g. clickr_agent_username"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Display name (optional)
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                  placeholder="e.g. CapNet Agent"
                  autoComplete="off"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={linking}
              className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity disabled:opacity-50"
            >
              {linking ? "Linking…" : "Create/Link inbox"}
            </button>
          </form>
        </section>

        <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
            3) Send a message
          </h2>
          <form onSubmit={sendMessage} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                To
              </label>
              <input
                value={sendForm.to}
                onChange={(e) => setSendForm((s) => ({ ...s, to: e.target.value }))}
                className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                placeholder="agent@agentmail.to"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                Subject
              </label>
              <input
                value={sendForm.subject}
                onChange={(e) => setSendForm((s) => ({ ...s, subject: e.target.value }))}
                className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                placeholder="Message subject"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                Text
              </label>
              <textarea
                value={sendForm.text}
                onChange={(e) => setSendForm((s) => ({ ...s, text: e.target.value }))}
                rows={4}
                className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                placeholder="Write the message…"
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send message"}
            </button>
          </form>
        </section>

        <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Recent inbox events
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Loaded from CapNet: <span className="font-mono text-[11px] text-zinc-300">GET /integrations/agentmail/inbox</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadInbox().catch(() => {})}
              disabled={loadingInbox}
              className="border border-zinc-700 bg-transparent px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-opacity hover:border-[#E53935]/45 disabled:opacity-50"
            >
              {loadingInbox ? "Loading…" : "Refresh"}
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {inboxMessages.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No AgentMail inbox messages yet. Link your inbox and check again.
              </p>
            ) : (
              inboxMessages.map((m) => (
                <div
                  key={m.id}
                  className="border border-zinc-800 bg-[#050505]/50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {m.subject || "(no subject)"}
                      </p>
                      <p className="text-xs text-zinc-500 break-all">
                        from: {m.from_address || "—"}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {m.created_at ? new Date(m.created_at).toLocaleString() : ""}
                    </span>
                  </div>
                  {m.preview ? (
                    <p className="mt-2 text-sm text-zinc-300 whitespace-pre-wrap">
                      {m.preview}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>

        <p className="mt-8 text-xs text-zinc-500">
          Note: AgentMail inbox delivery is recorded via a server webhook.
          Ensure your AgentMail console routes webhook events to your CapNet API’s
          <span className="font-mono text-[11px] text-zinc-300"> /webhooks/agentmail</span> endpoint.
        </p>
      </div>
    </div>
  );
}

