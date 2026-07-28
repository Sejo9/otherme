"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Accent } from "@/lib/types";
import { Button } from "@/components/ui";

/**
 * Shown once, to an account that has signed in but has no profile row yet —
 * i.e. the second person, the first time they open the app.
 */
export default function WelcomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [accent, setAccent] = useState<Accent>("rose");
  const [takenAccent, setTakenAccent] = useState<Accent | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser()
      .from("profiles")
      .select("accent")
      .then(({ data }) => {
        const taken = (data ?? [])[0]?.accent as Accent | undefined;
        if (taken) {
          setTakenAccent(taken);
          setAccent(taken === "amber" ? "rose" : "amber");
        }
      });
  }, []);

  async function start() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const sb = supabaseBrowser();
    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { error } = await sb.from("profiles").insert({
      id: user.id,
      display_name: name.trim(),
      accent,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="font-serif text-2xl">Hello</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Two things and you&apos;re in.
      </p>

      <div className="mt-8 flex flex-col gap-5">
        <div>
          <p className="label mb-1.5">What should they call you here?</p>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div>
          <p className="label mb-1.5">Your colour</p>
          <div className="flex gap-2">
            {(["amber", "rose"] as Accent[]).map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                disabled={takenAccent === a}
                className={`press accent-${a} flex flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm capitalize disabled:opacity-35`}
                style={
                  accent === a
                    ? { borderColor: "var(--accent)", background: "var(--accent-soft)" }
                    : { borderColor: "var(--line)" }
                }
              >
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
                {a}
                {takenAccent === a && <span className="text-[0.6875rem]">(taken)</span>}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose">{error}</p>}

        <Button onClick={start} disabled={!name.trim() || saving} className="w-full py-3">
          {saving ? "…" : "Start"}
        </Button>
      </div>
    </div>
  );
}
