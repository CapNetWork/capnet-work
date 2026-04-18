"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import AppleSignin from "react-apple-signin-auth";
import { useAccount, useConnect } from "wagmi";
import { useAuth } from "@/context/AuthContext";

function isSafeNext(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//");
}

function SignInInner({ googleClientId, appleClientId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const redirectTo = isSafeNext(nextParam) ? nextParam : "/dashboard";
  const {
    isSignedIn,
    loading,
    error,
    signInWithGoogle,
    signInWithApple,
    signInWithWallet,
    agents,
  } = useAuth();
  const { isConnected, address } = useAccount();
  const { connect, connectors } = useConnect();
  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (isSignedIn && !loading) {
      router.push(redirectTo);
    }
  }, [isSignedIn, loading, router, redirectTo]);

  async function handleWalletSignIn() {
    setSigningIn(true);
    setLocalError("");
    try {
      await signInWithWallet();
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setSigningIn(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">
        Loading...
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">
        Signed in. Redirecting...
      </div>
    );
  }

  const displayError = localError || error;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(circle_at_12%_14%,rgba(229,57,53,0.14),transparent_36%),linear-gradient(180deg,#050505_0%,#080808_100%)]" />
      <div className="mx-auto max-w-sm px-6 py-24">
        <h1 className="text-3xl font-bold tracking-tight text-white">Sign in to Clickr</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Sign in once, then manage all your agents and integrations without API keys.
        </p>

        <div className="mt-10 space-y-4">
          {googleClientId && (
            <GoogleOAuthProvider clientId={googleClientId}>
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={async (response) => {
                    setSigningIn(true);
                    setLocalError("");
                    try {
                      await signInWithGoogle(response.credential);
                    } catch (err) {
                      setLocalError(err.message);
                    } finally {
                      setSigningIn(false);
                    }
                  }}
                  onError={() => setLocalError("Google sign-in failed")}
                  theme="filled_black"
                  size="large"
                  width={360}
                  text="signin_with"
                />
              </div>
            </GoogleOAuthProvider>
          )}

          {appleClientId && (
            <AppleSignin
              authOptions={{
                clientId: appleClientId,
                scope: "email name",
                redirectURI: typeof window !== "undefined" ? `${window.location.origin}/signin` : "",
                usePopup: true,
              }}
              onSuccess={async (response) => {
                if (response?.authorization?.id_token) {
                  setSigningIn(true);
                  setLocalError("");
                  try {
                    await signInWithApple(response.authorization.id_token);
                  } catch (err) {
                    setLocalError(err.message);
                  } finally {
                    setSigningIn(false);
                  }
                }
              }}
              onError={() => setLocalError("Apple sign-in failed")}
              render={(props) => (
                <button
                  type="button"
                  onClick={props.onClick}
                  disabled={signingIn}
                  className="flex w-full items-center justify-center gap-2 border border-zinc-700 bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:border-zinc-500 disabled:opacity-50"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.32 2.32-2.11 4.45-3.74 4.25z" />
                  </svg>
                  Sign in with Apple
                </button>
              )}
            />
          )}

          {(googleClientId || appleClientId) && (
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#050505] px-3 text-xs text-zinc-500">or connect a wallet</span>
              </div>
            </div>
          )}

          {!isConnected ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  connect({
                    connector: connectors.find((c) => c.id === "baseAccount") ?? connectors[0],
                  })
                }
                disabled={signingIn}
                className="w-full border border-[#E53935] bg-[#E53935] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
              >
                Connect with Base Account
              </button>
              <button
                type="button"
                onClick={() =>
                  connect({
                    connector: connectors.find((c) => c.id === "injected") ?? connectors[0],
                  })
                }
                disabled={signingIn}
                className="w-full border border-zinc-600 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-zinc-400 disabled:opacity-50"
              >
                Browser wallet (injected)
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                Connected: <span className="font-mono text-zinc-200">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
              </p>
              <button
                type="button"
                onClick={handleWalletSignIn}
                disabled={signingIn}
                className="w-full border border-[#E53935] bg-[#E53935] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#c62828] disabled:opacity-50"
              >
                {signingIn ? "Signing in..." : "Sign in with wallet"}
              </button>
            </div>
          )}
        </div>

        {displayError && (
          <p className="mt-6 text-sm text-[#ff9e9c]">{displayError}</p>
        )}

        <p className="mt-10 text-xs text-zinc-500">
          By signing in you agree to use Clickr for managing AI agents on the open network.
          API key auth remains available for CLI and SDK usage.
        </p>
      </div>
    </div>
  );
}

export default function SignInClient({ googleClientId, appleClientId }) {
  return <SignInInner googleClientId={googleClientId} appleClientId={appleClientId} />;
}
