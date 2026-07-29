"use client";

import { useEffect } from "react";
import { isStaleBuildError, recoverFromStaleBuild } from "@/lib/recover";

/**
 * Catches client exceptions anywhere under the root layout.
 *
 * Without this, a single throw renders Next's blank "Application error" page,
 * which says nothing useful and leaves no way forward but a manual reload.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A deploy landing mid-session leaves the open tab asking for chunks that
    // no longer exist. Reloading once is the only real fix, and it is safe.
    if (isStaleBuildError(error)) recoverFromStaleBuild();
    else console.error("OtherMe client error:", error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-6 h-12 w-20">
        <span className="absolute left-0 top-0 h-12 w-12 rounded-full bg-amber opacity-80" />
        <span className="absolute right-0 top-0 h-12 w-12 rounded-full bg-rose opacity-70" />
      </div>

      <h1 className="font-serif text-xl">That did not load</h1>
      <p className="mt-2 max-w-[22rem] text-[0.875rem] leading-relaxed text-ink-soft">
        Something went wrong on this screen. Nothing is lost — it is all still on the
        server.
      </p>

      <div className="mt-6 flex gap-2">
        <button
          onClick={reset}
          className="press rounded-[0.875rem] bg-ink px-5 py-2.5 text-sm font-medium text-bg"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="press rounded-[0.875rem] border border-line px-5 py-2.5 text-sm"
        >
          Reload
        </button>
      </div>

      {/* The message itself, so a bug report can say what actually happened. */}
      <details className="mt-8 w-full max-w-sm text-left">
        <summary className="cursor-pointer text-[0.75rem] text-ink-faint">
          What went wrong
        </summary>
        <p className="mt-2 break-words rounded-xl border border-line bg-sunken px-3 py-2.5 font-mono text-[0.6875rem] leading-relaxed text-ink-soft">
          {error.message || "No message"}
          {error.digest && <span className="block mt-1 opacity-60">digest {error.digest}</span>}
        </p>
      </details>
    </div>
  );
}
