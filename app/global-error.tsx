"use client";

import { useEffect } from "react";
import { isStaleBuildError, recoverFromStaleBuild } from "@/lib/recover";

/**
 * Last resort: an error in the root layout itself, where even globals.css has
 * not been applied. Everything here is inline for that reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isStaleBuildError(error)) recoverFromStaleBuild();
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#14110f",
          color: "#f2ebe4",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>OtherMe could not start</h1>
        <p style={{ fontSize: "0.875rem", opacity: 0.7, maxWidth: "22rem", lineHeight: 1.6 }}>
          Usually this clears itself on a reload.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            borderRadius: "0.875rem",
            border: "none",
            background: "#e8a33d",
            color: "#14110f",
            padding: "0.7rem 1.4rem",
            fontSize: "0.875rem",
            fontWeight: 600,
          }}
        >
          Try again
        </button>
        <p style={{ fontSize: "0.6875rem", opacity: 0.45, marginTop: "1.5rem" }}>
          {error.message}
        </p>
      </body>
    </html>
  );
}
