import { requireSession } from "@/lib/session";
import SyncRoom from "@/components/sync/SyncRoom";
import Watchlist from "@/components/watch/Watchlist";
import { SubNav } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function WatchPage() {
  const { me, partner } = await requireSession();

  return (
    <>
      <SubNav
        current="/watch"
        items={[
          { href: "/timeline", label: "Timeline" },
          { href: "/map", label: "Map" },
          { href: "/listen", label: "Listen" },
          { href: "/watch", label: "Watch" },
        ]}
      />

      <SyncRoom kind="watch" me={me} partner={partner} />
      <Watchlist me={me} partner={partner} />
    </>
  );
}
