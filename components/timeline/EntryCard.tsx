"use client";

import { useSignedUrl } from "@/lib/media";
import { prettyDay } from "@/lib/day";
import { ENTRY_KINDS, type Profile, type TimelineEntry } from "@/lib/types";

export default function EntryCard({
  entry,
  author,
  isMine,
  compact = false,
}: {
  entry: TimelineEntry;
  author: Profile | null;
  isMine: boolean;
  compact?: boolean;
}) {
  const url = useSignedUrl(entry.media_path);
  const kind = ENTRY_KINDS[entry.kind];

  return (
    <article className={`card accent-${author?.accent ?? "amber"} overflow-hidden`}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={entry.title ?? kind.label}
          className="max-h-80 w-full object-cover"
        />
      )}

      <div className="px-4 py-3.5">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm">{kind.icon}</span>
          <span
            className="text-[0.6875rem] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            {isMine ? "You" : (author?.display_name ?? "Them")}
          </span>
          {!compact && (
            <span className="ml-auto text-[0.6875rem] text-ink-faint">
              {prettyDay(entry.occurred_on)}
            </span>
          )}
        </div>

        {entry.title && (
          <h3 className="font-serif text-[1.0625rem] leading-snug">{entry.title}</h3>
        )}

        {entry.body && (
          <p className="mt-1 whitespace-pre-wrap text-[0.875rem] leading-relaxed text-ink-soft">
            {entry.body}
          </p>
        )}

        {entry.place_name && (
          <p className="mt-1.5 text-[0.8125rem] text-ink-soft">📍 {entry.place_name}</p>
        )}

        {entry.link_url && (
          <a
            href={entry.link_url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block truncate text-[0.8125rem] underline"
            style={{ color: "var(--accent)" }}
          >
            {entry.link_url.replace(/^https?:\/\//, "").slice(0, 48)}
          </a>
        )}
      </div>
    </article>
  );
}
