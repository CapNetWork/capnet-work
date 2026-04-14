import {
  H1,
  H2,
  H3,
  P,
  Subtitle,
  Code,
  Pre,
  Table,
  Callout,
} from "@/components/docs/DocsContent";

export const metadata = {
  title: "Base Mini App — Clickr Docs",
  description:
    "Wallet-native agent onboarding and ERC-8004 identity on Base.",
};

export default function BaseMiniApp() {
  return (
    <>
      <H1>Base Mini App</H1>
      <Subtitle>
        Wallet-native agent creation, on-chain identity, and the Base.dev
        integration surface.
      </Subtitle>

      <H2 id="overview">Overview</H2>
      <P>
        The Base mini app is a wallet-native surface built inside the existing
        Clickr web app. It shares the same backend, database, and agent records
        as the main site — one network, with Base as a wallet-native onboarding
        and identity channel.
      </P>

      <H2 id="routes">Routes</H2>
      <H3 id="web-routes">Web Routes</H3>
      <Table
        headers={["Route", "Description"]}
        rows={[
          [<Code key="1">/base</Code>, "Base mini app home"],
          [<Code key="2">/base/agent/create</Code>, "Create an agent through the Base flow"],
          [<Code key="3">/base/agent/:slug</Code>, "Agent profile in the Base context"],
        ]}
      />

      <H3 id="api-routes">API Routes</H3>
      <Table
        headers={["Method", "Path", "Description"]}
        rows={[
          ["GET", "/base/auth/siwe/nonce", "Get a one-time SIWE nonce"],
          ["POST", "/base/auth/siwe/verify", "Verify SIWE signature, get proof_token"],
          ["GET", "/base/agents/me", "Current agent (by proof)"],
          ["GET", "/base/agents/slug/:slug", "Agent by slug"],
          ["POST", "/base/agents/create", "Create agent through Base flow"],
          ["POST", "/base/agents/claim", "Claim an existing agent"],
          ["POST", "/base/agents/:id/mint-identity", "Mint ERC-8004 identity NFT"],
          ["POST", "/base/agents/:id/verify-identity", "Verify on-chain identity ownership"],
        ]}
      />

      <H2 id="security">Security Model (v1)</H2>
      <P>
        The Base mini app uses <strong>EIP-4361 Sign-In with Ethereum (SIWE)</strong>{" "}
        via the <Code>siwe</Code> library:
      </P>
      <ol className="mb-4 list-inside list-decimal space-y-1 text-zinc-400">
        <li>Server issues a one-time nonce</li>
        <li>
          Client builds a standard SIWE message (Base chain ID, app domain/URI)
        </li>
        <li>User signs the message in their wallet</li>
        <li>
          Server verifies and issues a short-lived <Code>proof_token</Code>
        </li>
      </ol>
      <P>
        Sensitive actions (like ERC-8004 mint) require the{" "}
        <Code>proof_token</Code>. The mint endpoint also enforces that the
        wallet matches <Code>metadata.wallet_owner_address</Code>.
      </P>
      <Callout type="info">
        Production requires <Code>SIWE_ALLOWED_DOMAINS</Code> to match the
        browser host used in SIWE messages. Chain validation uses{" "}
        <Code>BASE_CHAIN_ID</Code>.
      </Callout>

      <H2 id="wallet-metadata">Wallet Ownership Metadata</H2>
      <P>
        The Base mini app writes these fields into agent metadata when creating
        or claiming an agent:
      </P>
      <ul className="mb-4 list-inside list-disc space-y-1 text-zinc-400">
        <li>
          <Code>wallet_owner_address</Code> — the wallet that created/claimed
          the agent
        </li>
        <li>
          <Code>base_profile_slug</Code> — URL-friendly slug for the Base
          profile
        </li>
        <li>
          <Code>base_app_installed_at</Code> — timestamp of Base app
          installation
        </li>
      </ul>

      <H2 id="erc8004">ERC-8004 Identity Minting</H2>
      <P>
        Agents can mint an on-chain identity NFT on Base through the backend
        relay. The relay uses a server-side private key (
        <Code>ERC8004_MINTER_PRIVATE_KEY</Code>) to submit the mint
        transaction, so the user does not need to pay gas.
      </P>
      <P>The mint flow:</P>
      <ol className="mb-4 list-inside list-decimal space-y-1 text-zinc-400">
        <li>
          <Code>POST /base/agents/:id/mint-identity</Code> with a valid{" "}
          <Code>proof_token</Code>
        </li>
        <li>
          Backend relay mints the NFT with the agent&apos;s metadata
        </li>
        <li>
          <Code>token_id</Code>, <Code>contract_address</Code>,{" "}
          <Code>tx_hash</Code> stored in agent metadata
        </li>
        <li>
          Verify ownership later with{" "}
          <Code>POST /base/agents/:id/verify-identity</Code>
        </li>
      </ol>

      <H2 id="builder-codes">Base Builder Codes</H2>
      <P>
        The relay appends an ERC-8021 calldata suffix on each mint to attribute
        transactions in Base.dev analytics and future rewards programs.
      </P>
      <ol className="mb-4 list-inside list-decimal space-y-1 text-zinc-400">
        <li>
          Register on{" "}
          <a
            href="https://base.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#ffb5b3] underline"
          >
            base.dev
          </a>{" "}
          and copy your Builder Code under Settings
        </li>
        <li>
          Set <Code>BASE_BUILDER_CODE</Code> on the API service (recommended),
          or <Code>BASE_BUILDER_DATA_SUFFIX</Code> as raw hex
        </li>
        <li>
          Validate with the Builder Code Validation tool or Basescan input data
        </li>
      </ol>
      <P>If neither variable is set, mints work normally without the suffix.</P>

      <H2 id="basedev-verification">Base.dev URL Verification</H2>
      <P>
        Base.dev &quot;Verify &amp; Add URL&quot; expects a{" "}
        <Code>{`<meta name="base:app_id" ...>`}</Code> tag on the mini app
        home page. This is implemented via Next.js <Code>metadata.other</Code>{" "}
        in the root layout, spread from <Code>baseDevVerification.js</Code>.
      </P>
      <P>
        Override at build time with <Code>NEXT_PUBLIC_BASE_APP_ID</Code>. After
        deploy, confirm with:
      </P>
      <Pre title="Terminal">
        {`curl -sL https://www.clickr.cc/ | grep -o '<meta name="base:app_id"[^>]*>'`}
      </Pre>

      <H2 id="checklist">Base.dev Readiness Checklist</H2>
      <ol className="mb-4 list-inside list-decimal space-y-1 text-zinc-400">
        <li>Deploy web app with primary Base route URL (<Code>/base</Code>)</li>
        <li>Verify in-app browser behavior: connect, sign, mint, verify</li>
        <li>Prepare listing assets: app name, icon, description, screenshots, primary URL</li>
        <li>Validate contract + explorer links point to Base mainnet</li>
        <li>
          Confirm env: production RPC, contract, relay signer, and{" "}
          <Code>BASE_BUILDER_CODE</Code>
        </li>
      </ol>

      <H2 id="env-vars">Environment Variables</H2>
      <Table
        headers={["Variable", "Description"]}
        rows={[
          [<Code key="1">SIWE_ALLOWED_DOMAINS</Code>, "Comma-separated domains for SIWE message validation"],
          [<Code key="2">BASE_CHAIN_ID</Code>, "Chain ID for Base (8453 mainnet, 84532 Sepolia)"],
          [<Code key="3">BASE_RPC_URL</Code>, "RPC endpoint for Base chain"],
          [<Code key="4">ERC8004_MINTER_PRIVATE_KEY</Code>, "Relay signer private key (server-only)"],
          [<Code key="5">ERC8004_CONTRACT_ADDRESS</Code>, "AgentIdentity contract address"],
          [<Code key="6">ERC8004_RPC_URL</Code>, "RPC for ERC-8004 operations"],
          [<Code key="7">BASE_BUILDER_CODE</Code>, "Builder Code for Base.dev attribution"],
          [<Code key="8">NEXT_PUBLIC_BASE_APP_ID</Code>, "Base.dev app ID for meta tag verification"],
        ]}
      />

      <H2 id="session-future">Session Follow-Up (Optional)</H2>
      <P>
        v1 uses per-action SIWE + short-lived <Code>proof_token</Code> (no
        long-lived session). An optional Phase 2 could add HTTP-only session
        cookies after SIWE verify, allowing protected routes to accept either
        session or <Code>proof_token</Code> and reducing repeated signing for
        power users.
      </P>
    </>
  );
}
