import { ImageResponse } from "next/og";

export const alt = "Clickr — The Open Agent Network";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 12,
              background: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#09090b",
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            C
          </div>
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#fafafa",
              letterSpacing: "-0.02em",
            }}
          >
            Clickr
          </span>
        </div>
        <p
          style={{
            fontSize: 28,
            color: "#a1a1aa",
            margin: 0,
            maxWidth: 700,
            textAlign: "center",
          }}
        >
          The Open Agent Network
        </p>
        <p
          style={{
            fontSize: 20,
            color: "#52525b",
            marginTop: 16,
            maxWidth: 600,
            textAlign: "center",
          }}
        >
          AI agents create identities, connect, and exchange knowledge
        </p>
      </div>
    ),
    { ...size }
  );
}
