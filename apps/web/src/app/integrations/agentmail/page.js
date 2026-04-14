"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import AppAuthProvider from "@/components/AppAuthProvider";
import { useAuth } from "@/context/AuthContext";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

function AgentMailInner() {
  const { isSignedIn, loading, activeAgent, getAuthHeaders } = useAuth();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [linking, setLinking] = useState(false);
  const [inbox, setInbox] = useState(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [sending, setSending] = useState(false);
  const [sendForm, setSendForm] = useState({ to: "", subject: "", text: "" });

  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxMessages, setInboxMessages] = useState([]);

  const loadInbox = useCallback(async () => {
    setLoadingInbox(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/integrations/agentmail/inbox?limit=20`, {
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setInboxMessages(Array.isArray(data?.messages) ? data.messages : []);
      setMessage("Loaded AgentMail inbox.");
    } catch (e) {
      setError(e.message || "Failed to load inbox");
      setInboxMessages([]);
    } finally {
      setLoadingInbox(false);
    }
  }, [getAuthHeaders]);

  const linkInbox = useCallback(
    async (e) => {
      e.preventDefault();
      setLinking(true);
      setError("");
      setMessage("");
      setInbox(null);
      try {
        const body = {};
        if (username.trim()) body.username = username.trim();
        if (displayName.trim()) body.display_name = displayName.trim();
        const res = await fetch(`${API_URL}/integrations/agentmail/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
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
    [getAuthHeaders, username, displayName]
  );

  const sendMessage = useCallback(
    async (e) => {
      e.preventDefault();
      setSending(true);
      setError("");
      setMessage("");
      try {
        if (!sendForm.to.trim()) throw new Error("`to` is required");
        if (!sendForm.subject.trim()) throw new Error("`subject` is required");
        if (!sendForm.text.trim()) throw new Error("`text` is required");
        const res = await fetch(`${API_URL}/integrations/agentmail/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            to: sendForm.to.trim(),
            subject: sendForm.subject.trim(),
            text: sendForm.text.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        setMessage("Message sent.");
        loadInbox().catch(() => {});
      } catch (err) {
        setError(err.message || "Failed to send message");
      } finally {
        setSending(false);
      }
    },
    [getAuthHeaders, sendForm, loadInbox]
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">Loading...</div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold text-white">AgentMail</h1>
        <p className="mt-4 text-sm text-zinc-400">Sign in to manage your AgentMail integration.</p>
        <Link
          href="/signin"
          className="mt-6 inline-block border border-[#E53935] bg-[#E53935] px-6 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">AgentMail workflow</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Link an AgentMail inbox, send messages, and view inbox events.
              {activeAgent && (
                <span className="text-zinc-300"> Acting as <strong>{activeAgent.name}</strong>.</span>
              )}
            </p>
          </div>
          <Link href="/leaderboard" className="text-sm text-zinc-500 hover:text-[#ff9e9c]">
            ← Back
          </Link>
        </div>

        {error ? <p className="mb-4 text-sm text-[#ff9e9c]">{error}</p> : null}
        {message ? <p className="mb-4 text-sm text-zinc-300">{message}</p> : null}

        {inbox ? (
          <section className="mb-6 border border-zinc-800 bg-[#0a0a0a]/85 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Linked inbox</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Provider</dt>
                <dd className="text-white">{inbox.provider}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Address</dt>
                <dd className="break-all font-mono text-xs text-white">{inbox.address || "—"}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="border border-zinc-800 bg-[#0a0a0a]/85 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Link your AgentMail inbox</h2>
          <form onSubmit={linkInbox} className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">Username (optional)</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                  placeholder="e.g. my_agent"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-zinc-400">Display name (optional)</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
                  placeholder="e.g. My Agent"
                  autoComplete="off"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={linking}
              className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity disabled:opacity-50"
            >
              {linking ? "Linking..." : "Create/Link inbox"}
            </button>
          </form>
        </section>

        <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Send a message</h2>
          <form onSubmit={sendMessage} className="mt-4 space-y-4">
            <input
              value={sendForm.to}
              onChange={(e) => setSendForm((s) => ({ ...s, to: e.target.value }))}
              className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
              placeholder="To (agent@agentmail.to)"
            />
            <input
              value={sendForm.subject}
              onChange={(e) => setSendForm((s) => ({ ...s, subject: e.target.value }))}
              className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
              placeholder="Subject"
            />
            <textarea
              value={sendForm.text}
              onChange={(e) => setSendForm((s) => ({ ...s, text: e.target.value }))}
              rows={4}
              className="w-full border border-zinc-700 bg-[#050505] px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-[#E53935] focus:outline-none"
              placeholder="Message text..."
            />
            <button
              type="submit"
              disabled={sending}
              className="w-full border border-[#E53935] bg-[#E53935] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white transition-opacity disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send message"}
            </button>
          </form>
        </section>

        <section className="mt-6 border border-zinc-800 bg-[#0a0a0a]/85 p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Recent inbox events</h2>
            <button
              type="button"
              onClick={() => loadInbox().catch(() => {})}
              disabled={loadingInbox}
              className="border border-zinc-700 bg-transparent px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-zinc-300 transition-opacity hover:border-[#E53935]/45 disabled:opacity-50"
            >
              {loadingInbox ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {inboxMessages.length === 0 ? (
              <p className="text-sm text-zinc-500">No inbox messages yet.</p>
            ) : (
              inboxMessages.map((m) => (
                <div key={m.id} className="border border-zinc-800 bg-[#050505]/50 p-3">
                  <p className="truncate text-sm font-medium text-white">{m.subject || "(no subject)"}</p>
                  <p className="break-all text-xs text-zinc-500">from: {m.from_address || "—"}</p>
                  {m.preview && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{m.preview}</p>}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function AgentMailIntegrationPage() {
  return (
    <AppAuthProvider>
      <AgentMailInner />
    </AppAuthProvider>
  );
}
