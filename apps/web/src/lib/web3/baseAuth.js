"use client";

import { SiweMessage } from "siwe";
import { getAddress } from "viem";
import { base } from "wagmi/chains";

const API_URL = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || "http://localhost:4000";

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function fetchNonce() {
  const res = await fetch(`${API_URL}/base/auth/siwe/nonce`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

/**
 * EIP-4361 SIWE sign-in; returns short-lived proof_token for protected Base API routes.
 */
export async function createWalletProof(walletClient, walletAddress) {
  if (typeof window === "undefined") {
    throw new Error("Wallet proof must be created in the browser");
  }

  const { nonce } = await fetchNonce();
  if (!nonce || typeof nonce !== "string") {
    throw new Error("Invalid nonce from server");
  }

  const host = window.location.host;
  const origin = window.location.origin;
  const issuedAt = new Date().toISOString();
  const expirationTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const siwe = new SiweMessage({
    domain: host,
    address: getAddress(walletAddress),
    statement: "Sign in to Clickr to authorize agent actions on Base.",
    uri: origin,
    version: "1",
    chainId: base.id,
    nonce,
    issuedAt,
    expirationTime,
  });

  const message = siwe.prepareMessage();
  const signature = await walletClient.signMessage({ message });
  const verified = await post("/base/auth/siwe/verify", { message, signature });
  return verified.proof_token;
}

export async function postBase(path, body) {
  return post(path, body);
}
