"use client";

import { parseDay } from "@/lib/day";
import type { Profile, TimelineEntry } from "@/lib/types";
import { Section } from "@/components/ui";
import EntryCard from "./EntryCard";

/**
 * Resurfaces anything that happened on this date in an earlier year. The
 * archive earns its keep here rather than by being browsed.
 *
 * The matching is done in SQL by `today_snapshot` — this used to download
 * every entry from every previous year and filter them in the browser.
 */
export default function OnThisDay({
  me,
  partner,
  serverDay,
  entries,
}: {
  me: Profile;
  partner: Profile | null;
  serverDay: string;
  entries: TimelineEntry[];
}) {
  if (entries.length === 0) return null;

  const thisYear = parseDay(serverDay).getFullYear();

  return (
    <Section title="On this day">
      <div className="flex flex-col gap-3">
        {entries.map((entry) => {
          const years = thisYear - parseDay(entry.occurred_on).getFullYear();
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
