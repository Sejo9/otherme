import { requireSession } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { prettyDay } from "@/lib/day";
import type { NightlyCheckin, TimelineEntry } from "@/lib/types";
import { Empty, Section } from "@/components/ui";
import NightlyThree from "@/components/rituals/NightlyThree";
import NightlyHistory from "@/components/rituals/NightlyHistory";
import QuestionJar from "@/components/rituals/QuestionJar";
import Capsules from "@/components/rituals/Capsules";
import VoiceNote from "@/components/rituals/VoiceNote";
import Incoming from "@/components/rituals/Incoming";

export const dynamic = "force-dynamic";

export default async function RitualsPage() {
  const { me, partner } = await requireSession();
  const supabase = await supabaseServer();

  const [{ data }, { data: nights }] = await Promise.all([
    // The ledger: every appreciation either of you has ever written down.
    supabase
      .from("timeline_entries")
      .select("*")
      .eq("kind", "appreciation")
      .order("occurred_on", { ascending: false })
      .limit(200),
    // Both people's recent check-ins, in full.
    supabase
      .from("nightly_checkins")
      .select("*")
      .order("day", { ascending: false })
      .limit(60),
  ]);

  const ledger = (data ?? []) as TimelineEntry[];
  const forMe = ledger.filter((e) => e.author_id !== me.id);
  const checkins = (nights ?? []) as NightlyCheckin[];

  return (
    <>
      <header className="mb-5 pt-2">
        <p className="label">The things you keep doing</p>
        <h1 className="mt-0.5 font-serif text-[1.75rem]">Rituals</h1>
      </header>

      <Incoming partner={partner} />

      <Section title="Tonight">
        <NightlyThree me={me} partner={partner} />
      </Section>

      <Section title="Recent nights">
        <NightlyHistory checkins={checkins} me={me} partner={partner} />
      </Section>

      <Section title="Out loud">
        <VoiceNote me={me} partner={partner} />
      </Section>

      <Section title="Questions">
        <QuestionJar me={me} partner={partner} />
      </Section>

      <Section title="Later">
        <Capsules me={me} partner={partner} />
      </Section>

      <Section title={`Everything ${partner?.display_name ?? "they"} noticed`}>
        {forMe.length === 0 ? (
          <Empty>
            Nothing yet. The nightly three fills this up on its own — one line a day
            becomes something worth rereading in about a month.
          </Empty>
        ) : (
          <div className={`accent-${partner?.accent ?? "rose"} card divide-y divide-line`}>
            {forMe.map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <p className="text-[0.875rem] leading-relaxed">{entry.body}</p>
                <p className="mt-1 text-[0.6875rem] text-ink-faint">
                  {prettyDay(entry.occurred_on)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {ledger.length > 0 && (
        <p className="mb-6 px-1 text-center text-[0.75rem] text-ink-faint">
          {ledger.length} appreciation{ledger.length === 1 ? "" : "s"} written down between
          the two of you.
        </p>
      )}
    </>
  );
}
