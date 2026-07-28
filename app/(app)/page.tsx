import { requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import type { Presence, Pulse } from "@/lib/types";
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

  const [{ data: presenceRows }, { data: pulseRows }] = await Promise.all([
    supabase.from("presence").select("*"),
    supabase
      .from("pulses")
      .select("*")
      .eq("to_user", me.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const presence = (presenceRows ?? []) as Presence[];

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
        <PhotoOfDay me={me} partner={partner} />
      </Section>

      <Section title="Together today">
        <TodayLinks me={me} partner={partner} />
      </Section>

      <OnThisDay me={me} partner={partner} />
    </>
  );
}
