"use client";

/**
 * Last resort: catches a throw in the ROOT layout, which no other boundary can.
 * It replaces the document, so it must render its own <html> and <body> and
 * cannot rely on the app's fonts or Tailwind being present.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbfcfd",
          color: "#0b1e2d",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", padding: "1.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", margin: 0, letterSpacing: "-0.01em" }}>
            Growth Studio could not start
          </h1>
          <p style={{ fontSize: "0.9375rem", lineHeight: 1.65, color: "#5a7284" }}>
            This is the whole application failing to load, not one screen. Try again; if it keeps
            happening the server needs looking at.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#005184",
              color: "#fff",
              border: 0,
              borderRadius: 2,
              padding: "0.5rem 0.75rem",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ fontSize: "0.6875rem", color: "#8ca2b0", marginTop: "1.5rem" }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
