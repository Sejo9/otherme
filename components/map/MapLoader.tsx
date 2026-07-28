"use client";

import dynamic from "next/dynamic";
import type { Profile, TimelineEntry } from "@/lib/types";

/**
 * Client-side boundary for the map.
 *
 * Leaflet reads `window` at module scope, so it can never be server-rendered —
 * and `ssr: false` is only permitted inside a Client Component, which is the
 * only reason this wrapper exists.
 */
const MapOfUs = dynamic(() => import("./MapOfUs"), {
  ssr: false,
  loading: () => (
    <div className="h-[62dvh] w-full animate-pulse rounded-[1.25rem] border border-line bg-sunken" />
  ),
});

export default function MapLoader(props: {
  me: Profile;
  partner: Profile | null;
  places: TimelineEntry[];
}) {
  return <MapOfUs {...props} />;
}
