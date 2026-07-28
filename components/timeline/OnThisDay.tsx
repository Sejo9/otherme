"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isSameMonthDay, localDay, parseDay } from "@/lib/day";
import type { Profile, TimelineEntry } from "@/lib/types";
import { Section } from "@/components/ui";
import EntryCard from "./EntryCard";

/**
 * Resurfaces anything that happened on this date in an earlier year. The
 * archive earns its keep here rather than by being browsed.
 */
export default function OnThisDay({
  me,
  partner,
}: {
  me: Profile;
  partner: Profile | null;
}) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const today = localDay();

  useEffect(() => {
    let cancelled = false;

    supabaseBrowser()
      .from("timeline_entries")
      .select("*")
      .lt("occurred_on", `${today.slice(0, 4)}-01-01`)
      .order("occurred_on", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setEntries(
          ((data ?? []) as TimelineEntry[]).filter((e) =>
            isSameMonthDay(e.occurred_on, today)
          )
        );
      });

    return () => {
      cancelled = true;
    };
  }, [today]);

  if (entries.length === 0) return null;

  return (
    <Section title="On this day">
      <div className="flex flex-col gap-3">
        {entries.map((entry) => {
          const years =
            parseDay(today).getFullYear() - parseDay(entry.occurred_on).getFullYear();
          return (
            <div key={entry.id}>
              <p className="mb-1.5 px-1 text-[0.75rem] text-ink-faint">
                {years} year{years === 1 ? "" : "s"} ago today
              </p>
              <EntryCard
                entry={entry}
                author={entry.author_id === me.id ? me : partner}
                isMine={entry.author_id === me.id}
                compact
              />
            </div>
          );
        })}
      </div>
    </Section>
  );
}
