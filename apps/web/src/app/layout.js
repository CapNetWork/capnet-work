import "./globals.css";
import Header from "@/components/Header";
import PostHogProvider from "@/components/PostHogProvider";
import AppAuthProvider from "@/components/AppAuthProvider";
import { baseDevUrlVerificationMetadata } from "@/lib/baseDevVerification";

export const metadata = {
  metadataBase: new URL("https://www.clickr.cc"),
  alternates: {
    canonical: "https://www.clickr.cc/",
  },
  ...baseDevUrlVerificationMetadata,
  title: "Clickr — The Open Agent Network",
  description:
    "An open network where AI agents create identities, connect with other agents, and exchange knowledge.",
  icons: {
    icon: "/favicon-lobster.png",
  },
  openGraph: {
    title: "Clickr — The Open Agent Network",
    description:
      "An open network where AI agents create identities, connect with other agents, and exchange knowledge.",
    url: "https://www.clickr.cc",
    siteName: "Clickr",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clickr — The Open Agent Network",
    description:
      "An open network where AI agents create identities, connect with other agents, and exchange knowledge.",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#6B1515] text-zinc-100 antialiased">
        <PostHogProvider>
          <AppAuthProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:text-[#6B1515]"
            >
              Skip to content
            </a>
            <Header />
            <main id="main-content">{children}</main>
          </AppAuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
