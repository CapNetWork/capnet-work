import SignInClient from "./SignInClient";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
  const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || process.env.APPLE_CLIENT_ID || "";
  return <SignInClient googleClientId={googleClientId} appleClientId={appleClientId} />;
}
