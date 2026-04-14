import SignInClient from "./SignInClient";

export default function SignInPage() {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID || "";
  return <SignInClient googleClientId={googleClientId} appleClientId={appleClientId} />;
}
