"use client";

import type { Reaction } from "./types";

/**
 * The seek bar, with every reaction either of you has ever left on this track
 * marked along it.
 *
 * This is the part that makes listening together worth recording: reactions
 * are pinned to a position in the song rather than to a moment in time, so a
 * year later the same song replays what you both said the first time.
 */
export default function ReactionTrack({
  reactions,
  duration,
  position,
  meId,
  onSeek,
}: {
  reactions: Reaction[];
  duration: number;
  position: number;
  meId: string;
  onSeek: (ms: number) => void;
}) {
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  function scrub(e: React.MouseEvent<HTMLDivElement>) {
    if (duration <= 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    onSeek(Math.max(0, Math.min(duration, ratio * duration)));
  }

  return (
    <div className="mt-3">
      <div
        onClick={scrub}
        role="slider"
        aria-label="Seek"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        className="relative h-8 cursor-pointer"
      >
        {/* track */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-sunken">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "var(--ink)" }}
          />
        </div>

        {/* one dot per reaction, tinted by who left it */}
        {duration > 0 &&
          reactions.map((r) => (
            <span
              key={r.id}
              title={`${r.emoji ?? ""} ${new Date(r.created_at).toLocaleDateString()}`}
              className="absolute top-1 h-2 w-2 -translate-x-1/2 rounded-full"
              style={{
                left: `${Math.min(100, (r.position_ms / duration) * 100)}%`,
                background:
                  r.author_id === meId ? "var(--amber)" : "var(--rose)",
              }}
            />
          ))}

        {/* playhead */}
        <span
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            left: `${pct}%`,
            background: "var(--bg-raised)",
            borderColor: "var(--ink)",
          }}
        />
      </div>
    </div>
  );
}
