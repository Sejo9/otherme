import { prettyDay, localDay } from "@/lib/day";
import type { NightlyCheckin, Profile } from "@/lib/types";
import { Empty } from "@/components/ui";

/**
 * The last few weeks of nights, both of you side by side.
 *
 * One evening's check-in is a nice ritual; a fortnight of them is where you
 * actually notice things — that their lows cluster on the same weekday, that
 * something you thought was minor keeps coming up.
 */
export default function NightlyHistory({
  checkins,
  me,
  partner,
}: {
  checkins: NightlyCheckin[];
  me: Profile;
  partner: Profile | null;
}) {
  const today = localDay();

  // Group by day, newest first, so the two of you appear together per night.
  const days = new Map<string, NightlyCheckin[]>();
  for (const entry of checkins) {
    const list = days.get(entry.day);
    if (list) list.push(entry);
    else days.set(entry.day, [entry]);
  }

  const nights = [...days.entries()].filter(([, entries]) =>
    entries.some((e) => e.high || e.low || e.appreciation)
  );

  if (nights.length === 0) {
    return (
      <Empty>
        Nothing here yet. After a couple of weeks this becomes the most
        interesting page in the app.
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {nights.map(([day, entries]) => {
        const mine = entries.find((e) => e.user_id === me.id);
        const theirs = entries.find((e) => e.user_id !== me.id);

        return (
          <article key={day} className="card px-4 py-3.5">
            <p className="label mb-2.5">{day === today ? "Tonight" : prettyDay(day)}</p>

            <div className="flex flex-col gap-3">
              <Column
                label="You"
                accent={me.accent}
                checkin={mine}
                missing="You did not check in"
              />
              <Column
                label={partner?.display_name ?? "Them"}
                accent={partner?.accent ?? "rose"}
                checkin={theirs}
                missing="No check-in"
              />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Column({
  label,
  accent,
  checkin,
  missing,
}: {
  label: string;
  accent: string;
  checkin: NightlyCheckin | undefined;
  missing: string;
}) {
  return (
    <div className={`accent-${accent} border-l-2 pl-3`} style={{ borderColor: "var(--accent)" }}>
      <p className="text-[0.6875rem] font-semibold" style={{ color: "var(--accent)" }}>
        {label}
      </p>

      {!checkin || (!checkin.high && !checkin.low && !checkin.appreciation) ? (
        <p className="mt-0.5 text-[0.8125rem] text-ink-faint">{missing}</p>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          {checkin.high && <Line icon="▲" text={checkin.high} />}
          {checkin.low && <Line icon="▼" text={checkin.low} />}
          {checkin.appreciation && <Line icon="💛" text={checkin.appreciation} />}
        </div>
      )}
    </div>
  );
}

function Line({ icon, text }: { icon: string; text: string }) {
  return (
    <p className="text-[0.8125rem] leading-relaxed">
      <span className="mr-1.5 text-[0.625rem] text-ink-faint">{icon}</span>
      {text}
    </p>
  );
}
