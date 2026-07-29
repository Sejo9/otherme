import { requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import type { TimelineEntry } from "@/lib/types";
import MapLoader from "@/components/map/MapLoader";
import { SubNav } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const { me, partner } = await requireSession();
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("timeline_entries")
    .select("*")
    .eq("kind", "place")
    .not("lat", "is", null)
    .order("occurred_on", { ascending: false });

  return (
    <>
      <header className="mb-4 pt-2">
        <p className="label">Everywhere you have been</p>
        <h1 className="mt-0.5 font-serif text-[1.75rem]">Map of us</h1>
      </header>

      <SubNav
        current="/map"
        items={[
          { href: "/timeline", label: "Timeline" },
          { href: "/map", label: "Map" },
          { href: "/listen", label: "Listen" },
        ]}
      />

      <MapLoader me={me} partner={partner} places={(data ?? []) as TimelineEntry[]} />
    </>
  );
}
