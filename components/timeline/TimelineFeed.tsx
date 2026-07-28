"use client";

import { useMemo, useState } from "react";
import { ENTRY_KINDS, type EntryKind, type Profile, type TimelineEntry } from "@/lib/types";
import { Empty } from "@/components/ui";
import EntryCard from "./EntryCard";

type Filter = "all" | EntryKind;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "appreciation", label: "💛 Appreciations" },
  { id: "photo", label: "📷 Photos" },
  { id: "joke", label: "😂 Jokes" },
  { id: "song", label: "🎵 Songs" },
  { id: "place", label: "📍 Places" },
  { id: "milestone", label: "🎉 Milestones" },
  { id: "note", label: "📝 Notes" },
];

export default function TimelineFeed({
  entries,
  me,
  partner,
}: {
  entries: TimelineEntry[];
  me: Profile;
  partner: Profile | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const groups = useMemo(() => {
    const filtered =
      filter === "all" ? entries : entries.filter((e) => e.kind === filter);

    // Group by month so a long timeline stays readable.
    const map = new Map<string, TimelineEntry[]>();
    for (const entry of filtered) {
      const key = entry.occurred_on.slice(0, 7);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()];
  }, [entries, filter]);

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = { all: entries.length };
    for (const e of entries) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [entries]);

  return (
    <>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.filter((f) => f.id === "all" || counts[f.id]).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`pill press shrink-0 ${filter === f.id ? "pill-active" : ""}`}
          >
            {f.label}
            <span className="opacity-60">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <Empty>
          {filter === "all"
            ? "Nothing kept yet. Tap ＋ and put something here — it only gets better with age."
            : `No ${ENTRY_KINDS[filter as EntryKind].label.toLowerCase()}s yet.`}
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([month, items]) => (
            <div key={month}>
              <p className="label mb-2 px-1">
                {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <div className="flex flex-col gap-3">
                {items.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    author={entry.author_id === me.id ? me : partner}
                    isMine={entry.author_id === me.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
