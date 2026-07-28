"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { countdown } from "@/lib/day";
import type { Capsule, Profile } from "@/lib/types";
import { Button, Flash, Sheet, useFlash } from "@/components/ui";

/** All the app is allowed to know about a capsule sealed against you. */
type WaitingCapsule = { id: string; unlock_at: string; created_at: string };

const PRESETS: { label: string; days: number }[] = [
  { label: "In a month", days: 30 },
  { label: "In six months", days: 182 },
  { label: "In a year", days: 365 },
  { label: "In five years", days: 1826 },
];

/**
 * Letters to future-us. Sealed in the database: RLS will not return the body
 * to the recipient until `unlock_at` has passed, so the surprise is real.
 */
export default function Capsules({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [items, setItems] = useState<Capsule[]>([]);
  const [waiting, setWaiting] = useState<WaitingCapsule[]>([]);
  const [writing, setWriting] = useState(false);
  const [reading, setReading] = useState<Capsule | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [unlockAt, setUnlockAt] = useState(() => isoInDays(365));
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useFlash();

  async function load() {
    const sb = supabaseBrowser();

    // Two reads: the capsules you are allowed to see in full, plus the bare
    // existence of ones still sealed against you.
    const [{ data }, { data: waiting }] = await Promise.all([
      sb.from("capsules").select("*").order("unlock_at", { ascending: true }),
      sb.rpc("waiting_capsules"),
    ]);

    setItems((data ?? []) as Capsule[]);
    setWaiting((waiting ?? []) as WaitingCapsule[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function seal() {
    if (!body.trim() || busy) return;
    setBusy(true);

    await supabaseBrowser().from("capsules").insert({
      author_id: me.id,
      title: title.trim() || null,
      body: body.trim(),
      unlock_at: new Date(unlockAt).toISOString(),
    });

    setBusy(false);
    setWriting(false);
    setTitle("");
    setBody("");
    setFlash("Sealed");
    load();
  }

  async function open(capsule: Capsule) {
    setReading(capsule);
    if (!capsule.opened_at && capsule.author_id !== me.id) {
      await supabaseBrowser()
        .from("capsules")
        .update({ opened_at: new Date().toISOString() })
        .eq("id", capsule.id);
      load();
    }
  }

  const now = Date.now();
  const opened = items.filter((c) => new Date(c.unlock_at).getTime() <= now);

  // Your own sealed letters, plus the shapes of theirs.
  const sealed = [
    ...items
      .filter((c) => new Date(c.unlock_at).getTime() > now)
      .map((c) => ({ id: c.id, unlock_at: c.unlock_at, title: c.title, mine: true })),
    ...waiting.map((c) => ({ id: c.id, unlock_at: c.unlock_at, title: null, mine: false })),
  ].sort((a, b) => new Date(a.unlock_at).getTime() - new Date(b.unlock_at).getTime());

  return (
    <>
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium">Time capsules</p>
            <p className="text-[0.75rem] text-ink-faint">
              {sealed.length > 0
                ? `${sealed.length} sealed, waiting`
                : "Write to whoever you both become."}
            </p>
          </div>
          <Button variant="quiet" onClick={() => setWriting(true)}>
            Write
          </Button>
        </div>

        {opened.map((c) => {
          const mine = c.author_id === me.id;
          return (
            <button
              key={c.id}
              onClick={() => open(c)}
              className={`press accent-${mine ? me.accent : (partner?.accent ?? "rose")} flex w-full items-center gap-3 border-t border-line px-4 py-3.5 text-left`}
            >
              <span className="text-base">{c.opened_at ? "📖" : "✉️"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem] font-medium">
                  {c.title ?? "A letter"}
                </p>
                <p className="text-[0.6875rem] text-ink-faint">
                  from {mine ? "you" : (partner?.display_name ?? "them")} ·{" "}
                  {new Date(c.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              {!c.opened_at && !mine && (
                <span className="shrink-0 rounded-full bg-ink px-2.5 py-1 text-[0.6875rem] font-medium text-bg">
                  Open
                </span>
              )}
            </button>
          );
        })}

        {sealed.map((c) => {
          const t = countdown(c.unlock_at);
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 border-t border-line px-4 py-3.5 opacity-70"
            >
              <span className="text-base">🔒</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.875rem]">
                  {c.mine
                    ? (c.title ?? "Your letter")
                    : `Something from ${partner?.display_name ?? "them"}`}
                </p>
                <p className="text-[0.6875rem] text-ink-faint">
                  opens in {t.days > 0 ? `${t.days}d` : `${t.hours}h ${t.minutes}m`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={writing} onClose={() => setWriting(false)} title="Seal a letter">
        <div className={`accent-${me.accent} flex flex-col gap-4 pb-2`}>
          <input
            type="text"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            rows={8}
            placeholder="Neither of you can read this again until it opens. Say the thing."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div>
            <p className="label mb-2">Opens</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setUnlockAt(isoInDays(p.days))}
                  className={`pill press ${
                    unlockAt.slice(0, 10) === isoInDays(p.days).slice(0, 10)
                      ? "pill-active"
                      : ""
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={unlockAt}
              onChange={(e) => setUnlockAt(e.target.value)}
            />
          </div>

          <Button onClick={seal} disabled={!body.trim() || busy} className="w-full py-3">
            {busy ? "…" : "Seal it"}
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!reading} onClose={() => setReading(null)} title={reading?.title ?? "A letter"}>
        <div className="pb-4">
          <p className="mb-3 text-[0.6875rem] text-ink-faint">
            written{" "}
            {reading &&
              new Date(reading.created_at).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
          </p>
          <p className="whitespace-pre-wrap font-serif text-[1rem] leading-relaxed">
            {reading?.body}
          </p>
        </div>
      </Sheet>

      <Flash>{flash}</Flash>
    </>
  );
}

/** `datetime-local` wants a local, second-less ISO string. */
function isoInDays(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
