"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // Full navigation so middleware picks up the fresh session cookie.
    router.replace(params.get("next") || "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center gap-4">
          <div className="relative h-16 w-28">
            <span className="absolute left-0 top-0 h-16 w-16 rounded-full bg-amber opacity-90" />
            <span className="absolute right-0 top-0 h-16 w-16 rounded-full bg-rose opacity-80 mix-blend-normal" />
          </div>
          <h1 className="font-serif text-2xl">OtherMe</h1>
          <p className="text-center text-sm text-ink-soft">A small place for the two of us.</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="px-1 text-sm text-rose">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="press mt-2 rounded-[0.875rem] bg-ink px-4 py-3 font-medium text-bg disabled:opacity-50"
          >
            {busy ? "…" : "Come in"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
