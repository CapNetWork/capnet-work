"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useWalletClient } from "wagmi";
import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import { base } from "wagmi/chains";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";
const SESSION_KEY = "clickr_session_token";

const AuthContext = createContext(null);

async function apiPost(path, body, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function apiGet(path, headers = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/** Same flow as dashboard Phantom connect: nonce → signMessage → connect (session + X-Agent-Id). */
async function linkPhantomWalletToAgent({ sessionToken, agentId, sessionWalletAddress }) {
  const provider =
    typeof window !== "undefined" ? window?.phantom?.solana || window?.solana || null : null;
  if (!provider?.isPhantom) {
    throw new Error("Phantom not detected. Install Phantom or open this page in Phantom’s browser.");
  }
  const connectRes = await provider.connect();
  const pubkey =
    connectRes?.publicKey?.toString?.() || provider?.publicKey?.toString?.() || "";
  if (!pubkey) throw new Error("Phantom did not return a public key.");
  if (sessionWalletAddress) {
    const a = String(sessionWalletAddress).trim();
    const b = String(pubkey).trim();
    if (a !== b && a.toLowerCase() !== b.toLowerCase()) {
      throw new Error("Use the same Phantom wallet you signed in with.");
    }
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Session ${sessionToken}`,
    "X-Agent-Id": agentId,
  };
  const nonceRes = await fetch(`${API_URL}/integrations/phantom_wallet/nonce`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({ agent_id: agentId, wallet_address: pubkey }),
  });
  const nonceData = await nonceRes.json().catch(() => ({}));
  if (!nonceRes.ok) throw new Error(nonceData.error || nonceRes.statusText);

  const message = String(nonceData?.message || "");
  const nonce = String(nonceData?.nonce || "");
  if (!message || !nonce) throw new Error("Nonce response missing message/nonce.");

  const encoder = new TextEncoder();
  const signed = await provider.signMessage(encoder.encode(message), "utf8");
  const sigBytes = signed?.signature || signed;
  if (!sigBytes) throw new Error("Phantom did not return a signature.");
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  const res = await fetch(`${API_URL}/integrations/phantom_wallet/connect`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      wallet_address: pubkey,
      nonce,
      message,
      signature: signatureBase64,
    }),
  });
  const connectData = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(connectData.error || res.statusText);
}

export function AuthProvider({ children }) {
  const [sessionToken, setSessionToken] = useState(null);
  const [user, setUser] = useState(null);
  const [agents, setAgents] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [signInChannel, setSignInChannel] = useState(null);
  const [signInWalletAddress, setSignInWalletAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { connect, connectors } = useConnect();

  const authHeaders = useMemo(() => {
    if (!sessionToken) return {};
    const h = { Authorization: `Session ${sessionToken}` };
    if (activeAgentId) h["X-Agent-Id"] = activeAgentId;
    return h;
  }, [sessionToken, activeAgentId]);

  const hydrate = useCallback(async (token) => {
    try {
      const data = await apiGet("/auth/me", { Authorization: `Session ${token}` });
      setUser(data.user);
      setAgents(data.agents || []);
      setWallets(data.wallets || []);
      setSignInChannel(data.sign_in_channel ?? null);
      setSignInWalletAddress(data.sign_in_wallet_address ?? null);
      if (data.agents?.length === 1) {
        setActiveAgentId(data.agents[0].id);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
      setSessionToken(null);
      setUser(null);
      setAgents([]);
      setWallets([]);
      setSignInChannel(null);
      setSignInWalletAddress(null);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      setSessionToken(saved);
      hydrate(saved).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [hydrate]);

  const saveSession = useCallback(
    async (data) => {
      const token = data.session_token;
      localStorage.setItem(SESSION_KEY, token);
      setSessionToken(token);
      setError(null);
      await hydrate(token);
    },
    [hydrate]
  );

  const signInWithGoogle = useCallback(
    async (idToken) => {
      setError(null);
      try {
        const data = await apiPost("/auth/google", { id_token: idToken });
        await saveSession(data);
        return data;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [saveSession]
  );

  const signInWithApple = useCallback(
    async (idToken) => {
      setError(null);
      try {
        const data = await apiPost("/auth/apple", { id_token: idToken });
        await saveSession(data);
        return data;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [saveSession]
  );

  const signInWithWallet = useCallback(async () => {
    setError(null);
    if (!isConnected || !address || !walletClient) {
      throw new Error("Connect your wallet first");
    }
    try {
      const nonceRes = await apiGet("/auth/siwe/nonce");
      const host = window.location.host;
      const origin = window.location.origin;
      const siwe = new SiweMessage({
        domain: host,
        address: getAddress(address),
        statement: "Sign in to Clickr.",
        uri: origin,
        version: "1",
        chainId: base.id,
        nonce: nonceRes.nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      const message = siwe.prepareMessage();
      const signature = await walletClient.signMessage({ message });
      const data = await apiPost("/auth/wallet", { message, signature });
      await saveSession(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [isConnected, address, walletClient, saveSession]);

  const signInWithPhantom = useCallback(async () => {
    setError(null);
    const provider = typeof window !== "undefined" ? window?.phantom?.solana : null;
    if (!provider?.isPhantom) {
      throw new Error("Phantom not detected. Install Phantom, then refresh.");
    }
    try {
      const nonceData = await apiGet("/auth/solana/nonce");
      const message = String(nonceData?.message || "");
      const nonce = String(nonceData?.nonce || "");
      if (!message || !nonce) throw new Error("Nonce response missing message/nonce.");

      const connectRes = await provider.connect();
      const wallet_address =
        connectRes?.publicKey?.toString?.() ||
        provider?.publicKey?.toString?.() ||
        "";
      if (!wallet_address) throw new Error("Phantom did not return a public key.");

      const encoder = new TextEncoder();
      const signed = await provider.signMessage(encoder.encode(message), "utf8");
      const sigBytes = signed?.signature || signed;
      if (!sigBytes) throw new Error("Phantom did not return a signature.");
      const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

      const data = await apiPost("/auth/solana/verify", { wallet_address, message, signature, nonce });
      await saveSession(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [saveSession]);

  const signOut = useCallback(async () => {
    if (sessionToken) {
      await apiPost("/auth/logout", {}, { Authorization: `Session ${sessionToken}` }).catch(() => {});
    }
    localStorage.removeItem(SESSION_KEY);
    setSessionToken(null);
    setUser(null);
    setAgents([]);
    setWallets([]);
    setActiveAgentId(null);
    setSignInChannel(null);
    setSignInWalletAddress(null);
    setError(null);
  }, [sessionToken]);

  const selectAgent = useCallback(
    (agentId) => {
      const found = agents.find((a) => a.id === agentId);
      if (found) setActiveAgentId(agentId);
    },
    [agents]
  );

  const linkAgent = useCallback(
    async (apiKey) => {
      setError(null);
      try {
        await apiPost("/auth/me/agents/link", { api_key: apiKey }, authHeaders);
        await hydrate(sessionToken);
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [authHeaders, sessionToken, hydrate]
  );

  const createAgent = useCallback(
    async (payload) => {
      const {
        name,
        domain,
        personality,
        description,
        perspective,
        skills,
        goals,
        tasks,
        avatar_url,
      } = payload;
      setError(null);
      try {
        const body = {
          name,
          domain: domain || undefined,
          personality: personality || undefined,
          description: description || undefined,
        };
        if (perspective != null) body.perspective = perspective;
        if (Array.isArray(skills)) body.skills = skills;
        if (Array.isArray(goals)) body.goals = goals;
        if (Array.isArray(tasks)) body.tasks = tasks;
        if (avatar_url != null && String(avatar_url).trim() !== "") body.avatar_url = String(avatar_url).trim();
        const data = await apiPost("/auth/me/agents", body, authHeaders);
        const agent = data?.agent;
        if (!agent?.id) {
          await hydrate(sessionToken);
          return data;
        }
        setActiveAgentId(agent.id);

        let phantom_link_error = null;
        if (signInChannel === "solana" && sessionToken) {
          try {
            await linkPhantomWalletToAgent({
              sessionToken,
              agentId: agent.id,
              sessionWalletAddress: signInWalletAddress,
            });
          } catch (e) {
            phantom_link_error = e?.message || "Phantom link failed";
            setError(
              `Agent created. ${phantom_link_error} Finish linking Phantom under Dashboard → Integrations for this agent.`
            );
          }
        }

        await hydrate(sessionToken);
        return { ...data, phantom_link_error };
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },
    [authHeaders, sessionToken, hydrate, signInChannel, signInWalletAddress]
  );

  const refreshAgents = useCallback(async () => {
    if (sessionToken) await hydrate(sessionToken);
  }, [sessionToken, hydrate]);

  const activeAgent = useMemo(
    () => agents.find((a) => a.id === activeAgentId) || agents[0] || null,
    [agents, activeAgentId]
  );

  const getAuthHeaders = useCallback(() => {
    if (!sessionToken) return {};
    const h = { Authorization: `Session ${sessionToken}` };
    const aid = activeAgentId || agents[0]?.id;
    if (aid) h["X-Agent-Id"] = aid;
    return h;
  }, [sessionToken, activeAgentId, agents]);

  const value = useMemo(
    () => ({
      user,
      agents,
      wallets,
      activeAgent,
      activeAgentId,
      sessionToken,
      loading,
      error,
      isSignedIn: !!user,
      signInChannel,
      signInWalletAddress,
      authHeaders,
      getAuthHeaders,
      signInWithGoogle,
      signInWithApple,
      signInWithWallet,
      signInWithPhantom,
      signOut,
      selectAgent,
      linkAgent,
      createAgent,
      refreshAgents,
      connect,
      connectors,
      walletConnected: isConnected,
      walletAddress: address,
    }),
    [
      user, agents, wallets, activeAgent, activeAgentId, sessionToken,
      signInChannel, signInWalletAddress,
      loading, error, authHeaders, getAuthHeaders,
      signInWithGoogle, signInWithApple, signInWithWallet,
      signInWithPhantom,
      signOut, selectAgent, linkAgent, createAgent, refreshAgents,
      connect, connectors, isConnected, address,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const GUEST_CTX = {
  user: null, agents: [], wallets: [], activeAgent: null, activeAgentId: null,
  sessionToken: null, loading: false, error: null, isSignedIn: false,
  signInChannel: null, signInWalletAddress: null,
  authHeaders: {}, getAuthHeaders: () => ({}),
  signInWithGoogle: () => {}, signInWithApple: () => {}, signInWithWallet: () => {},
  signInWithPhantom: () => {},
  signOut: () => {}, selectAgent: () => {}, linkAgent: () => {}, createAgent: () => {},
  refreshAgents: () => {}, connect: () => {}, connectors: [],
  walletConnected: false, walletAddress: undefined,
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  return ctx || GUEST_CTX;
}
