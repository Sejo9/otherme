import { requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { daysSince } from "@/lib/day";
import type { TimelineEntry } from "@/lib/types";
import TimelineFeed from "@/components/timeline/TimelineFeed";
import AddEntry from "@/components/timeline/AddEntry";
import { SubNav } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const { me, partner, settings } = await requireSession();
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("timeline_entries")
    .select("*")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  const entries = (data ?? []) as TimelineEntry[];
  const together = settings.anniversary ? daysSince(settings.anniversary) : null;

  return (
    <>
      <header className="mb-5 pt-2">
        <p className="label">The two of you</p>
        <h1 className="mt-0.5 font-serif text-[1.75rem]">Us</h1>
        <p className="mt-1 text-[0.8125rem] text-ink-soft">
          {entries.length} thing{entries.length === 1 ? "" : "s"} kept
          {together !== null && ` · ${together.toLocaleString()} days in`}
        </p>
      </header>

      <SubNav
        current="/timeline"
        items={[
          { href: "/timeline", label: "Timeline" },
          { href: "/map", label: "Map" },
          { href: "/listen", label: "Listen" },
          { href: "/watch", label: "Watch" },
        ]}
      />

      <TimelineFeed entries={entries} me={me} partner={partner} />
      <AddEntry me={me} />
    </>
  );
}
