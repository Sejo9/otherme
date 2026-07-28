"use client";

import { useState } from "react";
import { ACTIVITIES, WEATHER, type Presence, type Profile } from "@/lib/types";
import { ago } from "@/lib/day";
import MoodSheet from "./MoodSheet";

function activityOf(id: string) {
  return ACTIVITIES.find((a) => a.id === id) ?? ACTIVITIES[0];
}

function Battery({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value}%`, background: "var(--accent)" }}
        />
      </div>
      <span className="shrink-0 text-[0.6875rem] tabular-nums text-ink-faint">{value}</span>
    </div>
  );
}

function Card({
  profile,
  presence,
  isMe,
  onEdit,
}: {
  profile: Profile | null;
  presence: Presence | null;
  isMe: boolean;
  onEdit?: () => void;
}) {
  if (!profile) {
    return (
      <div className="card flex min-h-[9.5rem] items-center justify-center px-4 text-center text-xs text-ink-faint">
        Waiting for them to join
      </div>
    );
  }

  const weather = WEATHER[presence?.weather ?? "partly"];
  const activity = activityOf(presence?.activity ?? "unset");
  const stale =
    !presence ||
    Date.now() - new Date(presence.updated_at).getTime() > 8 * 3600 * 1000;

  const body = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">{isMe ? "You" : profile.display_name}</p>
          <p className="text-[0.6875rem] text-ink-faint">
            {presence ? ago(presence.updated_at) : "no signal yet"}
          </p>
        </div>
        <span
          className={`text-2xl leading-none ${stale ? "opacity-30 grayscale" : ""}`}
          title={weather.label}
        >
          {weather.icon}
        </span>
      </div>

      <div className="mt-3 flex-1">
        <p className="text-[0.8125rem] leading-snug text-ink-soft">
          <span className="mr-1">{activity.icon}</span>
          {activity.id === "unset" ? "—" : activity.label}
        </p>
        {presence?.note && (
          <p className="mt-1.5 line-clamp-2 text-[0.8125rem] italic leading-snug text-ink">
            “{presence.note}”
          </p>
        )}
      </div>

      <div className="mt-3">
        <p className="label mb-1">Battery</p>
        <Battery value={presence?.battery ?? 0} />
      </div>

      {presence?.available_to_call && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.6875rem] font-medium text-ink">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: "var(--accent)" }}
            />
          </span>
          Free to talk
        </p>
      )}
    </>
  );

  const className = `card accent-${profile.accent} flex min-h-[9.5rem] flex-col px-3.5 py-3 text-left`;

  return isMe ? (
    <button onClick={onEdit} className={`press ${className}`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default function PresenceCards({
  me,
  partner,
  myPresence,
  theirPresence,
}: {
  me: Profile;
  partner: Profile | null;
  myPresence: Presence | null;
  theirPresence: Presence | null;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card profile={me} presence={myPresence} isMe onEdit={() => setEditing(true)} />
        <Card profile={partner} presence={theirPresence} isMe={false} />
      </div>

      <MoodSheet
        open={editing}
        onClose={() => setEditing(false)}
        me={me}
        current={myPresence}
      />
    </>
  );
}
