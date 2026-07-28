import { requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { dayInTimezone } from "@/lib/day";
import type { Presence, Pulse } from "@/lib/types";
import type { TodaySnapshot } from "@/components/today/types";
import { Section } from "@/components/ui";
import DayHeader from "@/components/today/DayHeader";
import PresenceCards from "@/components/today/PresenceCards";
import PulseBar from "@/components/today/PulseBar";
import PhotoOfDay from "@/components/today/PhotoOfDay";
import TodayLinks from "@/components/today/TodayLinks";
import OnThisDay from "@/components/timeline/OnThisDay";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { me, partner, settings } = await requireSession();
  const supabase = await supabaseServer();

  // "Today" is your local date. The server gets it from the timezone stored on
  // your profile, which AppShell keeps up to date if you travel.
  const day = dayInTimezone(me.timezone);

  // Three requests, all in flight at once, all finished before the page is
  // sent. Nothing on this screen fetches after it renders.
  const [{ data: presenceRows }, { data: pulseRows }, { data: snapshotData }] =
    await Promise.all([
      supabase.from("presence").select("*"),
      supabase
        .from("pulses")
        .select("*")
        .eq("to_user", me.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.rpc("today_snapshot", { p_day: day }),
    ]);

  const presence = (presenceRows ?? []) as Presence[];
  const snapshot = snapshotData as TodaySnapshot | null;

  return (
    <>
      <DayHeader settings={settings} />

      <Section>
        <PresenceCards
          me={me}
          partner={partner}
          myPresence={presence.find((p) => p.user_id === me.id) ?? null}
          theirPresence={presence.find((p) => p.user_id !== me.id) ?? null}
        />
      </Section>

      <Section>
        <PulseBar me={me} partner={partner} initialReceived={(pulseRows ?? []) as Pulse[]} />
      </Section>

      <Section title="Photo of the day">
        <PhotoOfDay me={me} partner={partner} serverDay={day} snapshot={snapshot} />
      </Section>

      <Section title="Together today">
        <TodayLinks me={me} partner={partner} serverDay={day} snapshot={snapshot} />
      </Section>

      <OnThisDay
        me={me}
        partner={partner}
        serverDay={day}
        entries={snapshot?.on_this_day ?? []}
      />
    </>
  );
}
