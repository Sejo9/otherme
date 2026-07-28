import type { Tier, TimelineEntry } from "@/lib/types";

/** Shape returned by the `today_snapshot` RPC. See migration 0006. */
export type TodaySnapshot = {
  day: string;
  question: { id: string; body: string; tier: Tier; mine: boolean; both: boolean };
  know_me: { id: string; mine: boolean; both: boolean };
  goodnight: { me: boolean; them: boolean };
  photos: TimelineEntry[];
  on_this_day: TimelineEntry[];
};

/**
 * The stored timezone can be stale — you travelled, or it has ticked past
 * midnight since the page was rendered. When that happens the server's day is
 * wrong and the component falls back to fetching for itself.
 */
export function dayIsStale(serverDay: string, clientDay: string): boolean {
  return serverDay !== clientDay;
}
