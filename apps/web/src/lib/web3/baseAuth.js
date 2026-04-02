"use client";

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

export async function createWalletProof(walletClient, walletAddress) {
  const challenge = await post("/base/auth/challenge", { wallet_address: walletAddress });
  const signature = await walletClient.signMessage({ message: challenge.message });
  const verified = await post("/base/auth/verify", {
    wallet_address: walletAddress,
    signature,
  });
  return verified.proof_token;
}

export async function postBase(path, body) {
  return post(path, body);
}

