"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countdown, daysSince, nextMilestone, prettyDay, localDay } from "@/lib/day";
import type { Settings } from "@/lib/types";

/**
 * Header. Adapts to whether you are currently together or apart — the app
 * should feel different in those two states rather than pretending they are
 * the same.
 */
export default function DayHeader({ settings }: { settings: Settings }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!settings.apart || !settings.reunion_at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [settings.apart, settings.reunion_at]);

  const milestone = settings.anniversary ? nextMilestone(settings.anniversary) : null;
  const together = settings.anniversary ? daysSince(settings.anniversary) : null;

  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="label">{prettyDay(localDay())}</p>
        <h1 className="mt-0.5 font-serif text-[1.75rem] leading-tight">
          {settings.apart ? "Apart, for now" : "Today"}
        </h1>

        {settings.apart && settings.reunion_at ? (
          <Reunion iso={settings.reunion_at} label={settings.reunion_label} now={now} />
        ) : (
          <p className="mt-1 text-[0.8125rem] text-ink-soft">
            {together !== null && `Day ${together.toLocaleString()} together`}
            {together !== null && milestone && " · "}
            {milestone && (
              <span className="text-ink-faint">
                {milestone.label} in{" "}
                {Math.ceil((milestone.date.getTime() - Date.now()) / 86400000)}d
              </span>
            )}
          </p>
        )}
      </div>

      <Link
        href="/settings"
        aria-label="Settings"
        className="press mt-1 shrink-0 rounded-full border border-line px-3 py-2 text-xs text-ink-soft"
      >
        ⋯
      </Link>
    </header>
  );
}

function Reunion({
  iso,
  label,
  now,
}: {
  iso: string;
  label: string | null;
  now: number;
}) {
  void now; // re-render tick
  const c = countdown(iso);

  if (c.past) {
    return (
      <p className="mt-1 text-[0.8125rem] font-medium text-ink">
        {label ?? "Together"} — any moment now
      </p>
    );
  }

  return (
    <div className="mt-1.5 flex items-baseline gap-2.5 tabular-nums">
      {[
        [c.days, "d"],
        [c.hours, "h"],
        [c.minutes, "m"],
        [c.seconds, "s"],
      ].map(([value, unit]) => (
        <span key={unit as string} className="flex items-baseline gap-0.5">
          <span className="text-lg font-semibold leading-none">{value as number}</span>
          <span className="text-[0.6875rem] text-ink-faint">{unit as string}</span>
        </span>
      ))}
      {label && <span className="ml-0.5 text-[0.75rem] text-ink-faint">· {label}</span>}
    </div>
  );
}
