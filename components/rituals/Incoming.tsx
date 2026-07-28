"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { countdown } from "@/lib/day";
import { ENTRY_KINDS, type EntryKind, type Profile } from "@/lib/types";

type Pending = { id: string; kind: EntryKind; deliver_at: string; created_at: string };

/**
 * "Something is on its way."
 *
 * A scheduled voice note is withheld by RLS, so the recipient cannot see the
 * row at all. This asks the database for the shape of what is coming — kind
 * and arrival time, nothing else — so the anticipation survives the privacy.
 */
export default function Incoming({ partner }: { partner: Profile | null }) {
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(() => {
    let cancelled = false;

    supabaseBrowser()
      .rpc("pending_deliveries")
      .then(({ data }) => {
        if (!cancelled) setPending((data ?? []) as Pending[]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (pending.length === 0) return null;

  return (
    <div className={`accent-${partner?.accent ?? "rose"} card mb-5 px-4 py-3.5`}>
      <p className="label mb-2" style={{ color: "var(--accent)" }}>
        On its way
      </p>
      <ul className="flex flex-col gap-2">
        {pending.map((item) => {
          const t = countdown(item.deliver_at);
          return (
            <li key={item.id} className="flex items-center gap-2.5 text-[0.875rem]">
              <span>{ENTRY_KINDS[item.kind]?.icon ?? "✉️"}</span>
              <span className="flex-1">
                {partner?.display_name ?? "They"} left you a{" "}
                {ENTRY_KINDS[item.kind]?.label.toLowerCase() ?? "message"}
              </span>
              <span className="shrink-0 text-[0.6875rem] tabular-nums text-ink-faint">
                {t.days > 0 ? `${t.days}d` : t.hours > 0 ? `${t.hours}h` : `${t.minutes}m`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
